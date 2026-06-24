import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { applyOrderRecipeDeduction, InsufficientStockError, ensureStockRecipeSchema } from '../services/stock-inventory.service.js';
import { effectiveTableQrCode, tableWhereByQrParam } from '../lib/tableQr.js';
import { resolveServiceCallWaiterTarget } from '../lib/service-call-waiter-target.js';
import { getCategoriesHandler, getProductsHandler } from './menu.controller.js';
import { DeliveryZoneService } from '../services/delivery-zone.service.js';

const EXTERNAL_ORDER_TYPES = new Set(['delivery', 'takeaway', 'web', 'phone']);

function phoneDigitsOnly(value: string): string {
    return value.replace(/\D/g, '');
}

function phonesMatch(stored: string | null | undefined, provided: string | null | undefined): boolean {
    const a = phoneDigitsOnly(String(stored || ''));
    const b = phoneDigitsOnly(String(provided || ''));
    if (!a || !b) return false;
    if (a === b) return true;
    const tail = 6;
    if (a.length >= tail && b.length >= tail) return a.slice(-tail) === b.slice(-tail);
    return false;
}

async function assertCustomerPhoneAccess(
    connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    customerId: number,
    phoneRaw?: string | null,
): Promise<boolean> {
    if (!customerId || !phoneRaw?.trim()) return false;
    const [rows]: any = await connection.query('SELECT phone FROM customers WHERE id = ? LIMIT 1', [customerId]);
    return phonesMatch(rows?.[0]?.phone, phoneRaw);
}

async function ensureServiceCallsTargetUserForQr(connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    try {
        await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS target_user_id INTEGER NULL`);
    } catch {
        /* ignore */
    }
    try {
        await connection.query(
            `ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS assignee_set_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
        );
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ NULL`);
    } catch {
        /* ignore */
    }
}

/** QR üyeliği: kasa onayından önce identify / QR ile kullanım kapalı */
async function ensureQrMembershipPendingColumns(connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    try {
        await connection.query(
            `ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_pending_confirmation BOOLEAN DEFAULT false`,
        );
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_pending_order_id INTEGER NULL`);
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT false`);
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_verification_code VARCHAR(10) NULL`);
    } catch {
        /* ignore */
    }
}

const identifyCustomerNotPendingSql = `(COALESCE(qr_pending_confirmation, false) = false)`;

const provisionalMembershipBodySchema = z.object({
    deliveryAddress: z.string().optional(),
});

function defaultVatRate(): number {
    const v = Number(process.env.DEFAULT_VAT_RATE ?? 0.19);
    return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0.19;
}

function grossToNetAndTax(
    gross: number,
    vatRate: number
): { net: number; tax: number; gross: number } {
    const g = Math.round(gross * 100) / 100;
    const net = Math.round((g / (1 + vatRate)) * 100) / 100;
    const tax = Math.round((g - net) * 100) / 100;
    return { net, tax, gross: g };
}

const qrServiceCallSchema = z.object({
    qrCode: z.string().min(1),
    callType: z.enum([
        'call_waiter',
        'request_bill',
        'request_bill_cash',
        'request_bill_card',
        'clear_table',
        'water',
        'custom',
    ]),
});

const qrOrderSchema = z
    .object({
        qrCode: z.string().min(1),
        guestName: z.string().optional(),
        guestPhone: z.string().optional(),
        notes: z.string().optional(),
        items: z
            .array(
                z.object({
                    productId: z.number(),
                    variantId: z.number().int().positive().nullish(),
                    quantity: z.number().min(1),
                    modifierIds: z.array(z.number()).optional(),
                    notes: z.string().optional(),
                })
            )
            .min(1),
        customerId: z.number().int().positive().nullish(),
        /** QR menü ödeme tercihi (kasada / online tamamlanacak) */
        paymentMethodArrival: z.enum(['cash', 'card', 'paypal', 'google_pay']).optional(),
        /** Yeni üyelik: müşteri kodu + QR atanır */
        wantsRegistration: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.wantsRegistration && (data.customerId == null || data.customerId === undefined)) {
            const digits = (data.guestPhone || '').replace(/\D/g, '');
            if (digits.length < 8) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Kayıt için telefon gerekli',
                    path: ['guestPhone'],
                });
            }
        }
    });

const qrExternalOrderSchema = z.object({
    customerName: z.string().min(2),
    customerPhone: z.string().min(5),
    orderType: z.enum(['delivery', 'takeaway']),
    address: z.string().optional(),
    addressLabel: z.string().optional(),
    paymentMethod: z.enum(['cash', 'card', 'paypal', 'google_pay']),
    notes: z.string().optional(),
    /** Kayıtlı müşteri (QR identify sonrası) */
    customerId: z.number().int().positive().optional(),
    wantsRegistration: z.boolean().optional(),
    items: z.array(z.object({
        productId: z.number(),
        variantId: z.number().optional(),
        quantity: z.number().min(1),
        modifierIds: z.array(z.number()).optional(),
        notes: z.string().optional(),
    })).min(1),
});

/** QR menü «yeni kayıt» sonrası müşteri kodu + üye QR yükü */
async function finalizeQrMemberRegistration(
    connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    customerId: number,
    opts: { deliveryAddress?: string | null },
): Promise<{ customer_code: string; memberQrPayload: string; name: string; phone: string | null }> {
    try {
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(20)`);
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS personal_qr VARCHAR(255)`);
    } catch {
        /* ignore */
    }
    const [rows]: any = await connection.query(
        `SELECT id, name, phone, customer_code, personal_qr FROM customers WHERE id = ? LIMIT 1`,
        [customerId],
    );
    const row = rows?.[0];
    if (!row) {
        throw new Error('CUSTOMER_NOT_FOUND');
    }
    let code = row.customer_code != null ? String(row.customer_code).trim() : '';
    if (!code) {
        code = `NP${String(customerId).padStart(5, '0')}`;
        await connection.query(`UPDATE customers SET customer_code = ? WHERE id = ?`, [code, customerId]);
    }
    const existingPayload = row.personal_qr != null ? String(row.personal_qr).trim() : '';
    const memberQrPayload = existingPayload || `NEXTPOS-MEMBER|${customerId}|${code}`;
    if (!existingPayload) {
        await connection.query(`UPDATE customers SET personal_qr = ? WHERE id = ?`, [memberQrPayload, customerId]);
    }
    const addr = opts.deliveryAddress?.trim();
    if (addr) {
        try {
            await connection.query(
                `INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES (?, 'QR Teslimat', ?, true)`,
                [customerId, addr],
            );
        } catch {
            /* tablo yok veya kısıt */
        }
    }
    return {
        customer_code: code,
        memberQrPayload,
        name: String(row.name || ''),
        phone: row.phone != null ? String(row.phone) : null,
    };
}

async function findOrCreateCustomerByPhoneForQr(
    connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    name: string,
    phone: string,
): Promise<number> {
    const [crows]: any = await connection.query(`SELECT id FROM customers WHERE phone = ? LIMIT 1`, [phone]);
    if (crows?.[0]?.id != null) {
        return Number(crows[0].id);
    }
    const [cins]: any = await connection.query(
        `INSERT INTO customers (name, phone, created_at) VALUES (?, ?, NOW())`,
        [name, phone],
    );
    return Number(cins.insertId);
}

/** GET /api/v1/qr/tables/:qrCode */
export const resolveTableByQrHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const qrCode = String(req.params.qrCode || '').trim();
        if (!qrCode) {
            return res.status(400).json({ error: 'QR kodu gerekli' });
        }

        const row = await withTenant(tenantId, async (connection) => {
            const { clause, params } = tableWhereByQrParam(qrCode);
            const [rows]: any = await connection.query(
                `SELECT t.id, t.name, t.qr_code, t.branch_id, t.section_id,
                        s.name AS section_name, b.settings AS branch_settings
                 FROM tables t
                 LEFT JOIN sections s ON s.id = t.section_id
                 LEFT JOIN branches b ON b.id = t.branch_id
                 WHERE ${clause}`,
                params
            );
            return rows?.[0] || null;
        });

        if (!row) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        let taxRate = 19;
        let currency = 'EUR';
        if (row.branch_settings) {
            try {
                const settingsObj = typeof row.branch_settings === 'string' 
                    ? JSON.parse(row.branch_settings) 
                    : row.branch_settings;
                
                if (settingsObj?.taxRate != null) {
                    taxRate = Number(settingsObj.taxRate);
                } else if (Array.isArray(settingsObj?.vat)) {
                    const sorted = [...settingsObj.vat].sort((a: any, b: any) => b.value - a.value);
                    taxRate = sorted[0]?.value ?? 19;
                }
                if (settingsObj?.currency) {
                    currency = String(settingsObj.currency);
                }
            } catch (err) {
                // ignore parsing error
            }
        }

        const session = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT id, waiter_id, guest_name FROM table_sessions
                 WHERE table_id = ? AND closed_at IS NULL
                 ORDER BY opened_at DESC LIMIT 1`,
                [row.id]
            );
            return rows?.[0] || null;
        });

        res.json({
            tableId: row.id,
            tableName: row.name,
            sectionName: row.section_name,
            branchId: row.branch_id,
            qrCode: effectiveTableQrCode(row),
            activeSessionId: session?.id ?? null,
            waiterId: session?.waiter_id ?? null,
            taxRate,
            currency,
        });
    } catch (e) {
        console.error('resolveTableByQrHandler', e);
        res.status(500).json({ error: 'Masa bilgisi alınamadı' });
    }
};

export const qrMenuCategoriesHandler = (req: Request, res: Response) => getCategoriesHandler(req, res);
export const qrMenuProductsHandler = (req: Request, res: Response) => getProductsHandler(req, res);

/**
 * GET /api/v1/qr/menu/spotlight?customerId=
 * Üye: son siparişlerindeki ürünler (yeniden sipariş). Misafir veya geçmiş yoksa: çok satanlar.
 */
export const qrMenuSpotlightHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const cidRaw = req.query.customerId;
        const customerId = cidRaw != null && String(cidRaw).trim() !== '' ? Number(cidRaw) : NaN;
        const hasCustomer = Number.isFinite(customerId) && customerId > 0;

        const payload = await withTenant(tenantId, async (connection) => {
            if (hasCustomer) {
                const [recentRows]: any = await connection.query(
                    `SELECT oi.product_id, MAX(o.created_at) AS last_at
                     FROM order_items oi
                     INNER JOIN orders o ON o.id = oi.order_id
                     INNER JOIN products p ON p.id = oi.product_id AND p.is_active = true
                     WHERE o.customer_id = ?
                     GROUP BY oi.product_id
                     ORDER BY last_at DESC
                     LIMIT 16`,
                    [customerId]
                );
                const recentIds = (recentRows || [])
                    .map((r: { product_id: number }) => Number(r.product_id))
                    .filter((id: number) => id > 0);
                if (recentIds.length > 0) {
                    return { mode: 'recent' as const, productIds: recentIds };
                }
            }

            const [popRows]: any = await connection.query(
                `SELECT oi.product_id, COALESCE(SUM(oi.quantity), 0)::bigint AS qty
                 FROM order_items oi
                 INNER JOIN orders o ON o.id = oi.order_id
                 INNER JOIN products p ON p.id = oi.product_id AND p.is_active = true
                 WHERE o.created_at >= NOW() - INTERVAL '120 days'
                 GROUP BY oi.product_id
                 ORDER BY qty DESC NULLS LAST
                 LIMIT 16`,
                []
            );
            const popularIds = (popRows || [])
                .map((r: { product_id: number }) => Number(r.product_id))
                .filter((id: number) => id > 0);
            return { mode: 'popular' as const, productIds: popularIds };
        });

        res.json(payload);
    } catch (e) {
        console.error('qrMenuSpotlightHandler', e);
        res.status(500).json({ error: 'Öneriler yüklenemedi' });
    }
};

async function computeLineUnitPrice(
    connection: any,
    productId: number,
    variantId: number | undefined,
    modifierIds: number[]
): Promise<{ unit: number; modifiersJson: unknown[] }> {
    const [pr]: any = await connection.query(
        'SELECT base_price FROM products WHERE id = ? AND is_active = true',
        [productId]
    );
    if (!pr?.length) {
        throw new Error('BAD_PRODUCT');
    }
    let unit = Number(pr[0].base_price);
    if (variantId != null) {
        const [vr]: any = await connection.query(
            'SELECT price FROM product_variants WHERE id = ? AND product_id = ?',
            [variantId, productId]
        );
        if (!vr?.length) {
            throw new Error('BAD_VARIANT');
        }
        unit = Number(vr[0].price);
    }
    const modObjs: { id: number; name: string; price: number }[] = [];
    for (const mid of modifierIds) {
        const [mr]: any = await connection.query(
            `SELECT m.id, m.name, m.price
             FROM product_modifiers pm
             JOIN modifiers m ON m.id = pm.modifier_id AND m.is_active = true
             WHERE pm.product_id = ? AND pm.modifier_id = ?`,
            [productId, mid]
        );
        if (!mr?.length) {
            throw new Error('BAD_MODIFIER');
        }
        unit += Number(mr[0].price);
        modObjs.push({
            id: mr[0].id,
            name: mr[0].name,
            price: Number(mr[0].price),
        });
    }
    unit = Math.round(unit * 100) / 100;
    return { unit, modifiersJson: modObjs };
}

/** POST /api/v1/qr/orders — mutfağa düşmez; garson onayı bekler */
export const getPendingExternalOrderCountHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const result: any = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                "SELECT COUNT(*) as count FROM orders WHERE status = 'pending' AND (source = 'qr_portal'::order_source OR source = 'whatsapp'::order_source)"
            );
            return rows[0] || { count: 0 };
        });
        res.json(result);
    } catch (e: any) {
        console.error('CRITICAL: getPendingExternalOrderCountHandler error', e.message, e.stack);
        res.status(500).json({ error: 'Sayaç alınamadı: ' + e.message });
    }
};

export const createQrMenuOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = qrOrderSchema.parse(req.body);

        try {
            await withTenant(tenantId, async (conn) => {
                await ensureStockRecipeSchema(conn);
            });
        } catch (e: any) {
            console.warn('ensureStockRecipeSchema error:', e?.message || e);
        }

        const order = await withTenantTransaction(tenantId, async (connection) => {
            try {
                await connection.query(
                    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_arrival VARCHAR(32) DEFAULT 'cash'`,
                );
            } catch {
                /* sütun zaten var / motor uyumsuz */
            }
            const { clause, params } = tableWhereByQrParam(data.qrCode.trim());
            const [tr]: any = await connection.query(
                `SELECT t.id AS table_id, t.name AS table_name, t.branch_id, t.section_id
                 FROM tables t WHERE ${clause}`,
                params
            );
            if (!tr?.length) {
                throw new Error('TABLE_NOT_FOUND');
            }
            const tableId = Number(tr[0].table_id);
            const branchId = tr[0].branch_id != null ? Number(tr[0].branch_id) : null;
            const tableName = String(tr[0].table_name || '');
            const sectionId = tr[0].section_id != null ? Number(tr[0].section_id) : null;

            const [sr]: any = await connection.query(
                `SELECT id, waiter_id FROM table_sessions
                 WHERE table_id = ? AND closed_at IS NULL
                 ORDER BY opened_at DESC LIMIT 1`,
                [tableId]
            );
            const sessionId = sr?.[0]?.id != null ? Number(sr[0].id) : null;
            const sessionWaiterId = sr?.[0]?.waiter_id != null ? Number(sr[0].waiter_id) : null;

            const assignedWaiterId = await resolveServiceCallWaiterTarget(connection, {
                sectionId: Number.isFinite(sectionId) ? sectionId : null,
                sessionWaiterId,
                explicitWaiterId: null,
            });

            const lines: {
                productId: number;
                variantId: number | null;
                quantity: number;
                unitPrice: number;
                modifiersJson: unknown[];
                notes: string | null;
            }[] = [];

            let grossTotal = 0;
            for (const line of data.items) {
                const mids = line.modifierIds ?? [];
                const { unit, modifiersJson } = await computeLineUnitPrice(
                    connection,
                    line.productId,
                    line.variantId ?? undefined,
                    mids
                );
                grossTotal += unit * line.quantity;
                lines.push({
                    productId: line.productId,
                    variantId: line.variantId ?? null,
                    quantity: line.quantity,
                    unitPrice: unit,
                    modifiersJson,
                    notes: line.notes?.trim() || null,
                });
            }

            const vat = defaultVatRate();
            const { net: netSubtotal, tax: taxAmount, gross: totalAmount } = grossToNetAndTax(grossTotal, vat);

            const noteParts: string[] = [];
            if (data.guestName?.trim()) {
                noteParts.push(`QR misafir: ${data.guestName.trim()}`);
            }
            if (data.notes?.trim()) {
                noteParts.push(data.notes.trim());
            }
            const payArrival = data.paymentMethodArrival ?? 'cash';
            noteParts.push(`Ödeme tercihi: ${payArrival}`);
            const notesMerged = noteParts.length ? noteParts.join(' | ') : null;

            let resolvedCustomerId: number | null =
                data.customerId != null && Number.isFinite(Number(data.customerId))
                    ? Number(data.customerId)
                    : null;
            if (resolvedCustomerId != null) {
                const [ver]: any = await connection.query(`SELECT id FROM customers WHERE id = ? LIMIT 1`, [
                    resolvedCustomerId,
                ]);
                if (!ver?.length) {
                    resolvedCustomerId = null;
                }
            }
            if (data.wantsRegistration && resolvedCustomerId == null && data.guestPhone?.trim()) {
                resolvedCustomerId = await findOrCreateCustomerByPhoneForQr(
                    connection,
                    data.guestName?.trim() || 'Misafir',
                    data.guestPhone.trim(),
                );
            }

            const [orderResult]: any = await connection.query(
                `INSERT INTO orders (session_id, table_id, customer_id, waiter_id, cashier_id,
                    order_type, source, subtotal, tax_amount, total_amount, is_urgent, notes,
                    delivery_address, delivery_phone, branch_id, payment_status, status, payment_method_arrival)
                 VALUES (?, ?, ?, NULL, NULL, 'qr_menu', 'customer_qr', ?, ?, ?, false, ?, NULL, NULL, ?, 'unpaid', 'pending', ?)`,
                [
                    sessionId,
                    tableId,
                    resolvedCustomerId,
                    netSubtotal,
                    taxAmount,
                    totalAmount,
                    notesMerged,
                    branchId,
                    payArrival,
                ]
            );
            const newOrderId = orderResult.insertId;

            for (const ln of lines) {
                await connection.query(
                    `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price, modifiers, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        newOrderId,
                        ln.productId,
                        ln.variantId,
                        ln.quantity,
                        ln.unitPrice,
                        ln.unitPrice * ln.quantity,
                        JSON.stringify(ln.modifiersJson),
                        ln.notes,
                    ]
                );
            }

            await applyOrderRecipeDeduction(
                connection,
                newOrderId,
                lines.map((ln) => ({
                    productId: ln.productId,
                    quantity: ln.quantity,
                    variantId: ln.variantId ?? null,
                })),
                null
            );

            const qrMembershipAwaitingPos = Boolean(data.wantsRegistration && resolvedCustomerId != null);

            const [finalOrder]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [newOrderId]);
            return {
                order: finalOrder[0],
                tableId,
                tableName,
                waiterId: sessionWaiterId,
                assignedWaiterId,
                guestName: data.guestName?.trim() || 'Misafir',
                memberRegistration: null,
                qrMembershipAwaitingPos,
            };
        });

        const io = req.app.get('io');
        if (io) {
            const payload = {
                tenantId,
                orderId: order.order.id,
                tableId: order.tableId,
                tableName: order.tableName,
                waiterId: order.waiterId,
                assignedWaiterId: order.assignedWaiterId,
                customerName: order.guestName,
                totalAmount: order.order.total_amount,
            };
            io.to(`tenant:${tenantId}`).emit('customer:order_request', payload);
            if (order.assignedWaiterId != null) {
                io.to(`tenant:${tenantId}:waiter:${order.assignedWaiterId}`).emit('customer:order_request', payload);
            } else if (order.waiterId) {
                io.to(`tenant:${tenantId}:waiter:${order.waiterId}`).emit('customer:order_request', payload);
            }
        }

        res.status(201).json({
            message: 'Sipariş garson onayına gönderildi',
            order: order.order,
            pendingApproval: true,
            memberRegistration: null,
            qrMembershipAwaitingPos: order.qrMembershipAwaitingPos ?? false,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'TABLE_NOT_FOUND') {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }
        if (['BAD_PRODUCT', 'BAD_VARIANT', 'BAD_MODIFIER'].includes(error.message)) {
            return res.status(400).json({ error: 'Ürün veya seçenek geçersiz' });
        }
        if (error instanceof InsufficientStockError) {
            return res.status(400).json({
                error: 'Reçete için yetersiz stok',
                code: 'INSUFFICIENT_STOCK',
                detail: error.payload,
            });
        }
        console.error('createQrMenuOrderHandler', error);
        res.status(500).json({
            error: 'Sipariş oluşturulamadı',
            detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
        });
    }
};

/** POST /api/v1/qr/service-call — QR müşteri garson/hesap isteği (kalıcı kayıt + Socket). */
export const createQrServiceCallHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = qrServiceCallSchema.parse(req.body);

        const result = await withTenantTransaction(tenantId, async (connection) => {
            await ensureServiceCallsTargetUserForQr(connection);
            const { clause, params } = tableWhereByQrParam(data.qrCode.trim());
            const [trows]: any = await connection.query(
                `SELECT t.id, t.name, t.section_id FROM tables t WHERE ${clause}`,
                params
            );
            const table = trows?.[0];
            if (!table) {
                throw new Error('TABLE_NOT_FOUND');
            }

            const [srows]: any = await connection.query(
                `SELECT id, waiter_id FROM table_sessions
                 WHERE table_id = ? AND closed_at IS NULL
                 ORDER BY opened_at DESC LIMIT 1`,
                [table.id]
            );
            const sess = srows?.[0];
            const sessionWaiterId = sess?.waiter_id != null ? Number(sess.waiter_id) : null;
            const sectionId = table.section_id != null ? Number(table.section_id) : null;

            /** Oturum garsonu öncelikli; moladaysa veya yoksa müsait garsona yönlendir */
            const targetUserId = await resolveServiceCallWaiterTarget(connection, {
                sectionId: Number.isFinite(sectionId) ? sectionId : null,
                sessionWaiterId,
                explicitWaiterId: null,
            });
            if (targetUserId == null) {
                throw new Error('NO_WAITER_AVAILABLE');
            }

            const [ins]: any = await connection.query(
                `INSERT INTO service_calls (table_id, session_id, call_type, status, message, target_user_id, assignee_set_at)
                 VALUES (?, ?, ?, 'pending', NULL, ?, CURRENT_TIMESTAMP)`,
                [table.id, sess?.id ?? null, data.callType, targetUserId]
            );
            const newId = ins.insertId as number;
            const [caRow]: any = await connection.query(
                `SELECT created_at FROM service_calls WHERE id = ?`,
                [newId]
            );
            const createdRaw = caRow?.[0]?.created_at;
            const createdAt =
                createdRaw != null
                    ? new Date(createdRaw).toISOString()
                    : new Date().toISOString();

            return {
                id: newId,
                tableId: table.id as number,
                tableName: String(table.name),
                sessionWaiterId,
                targetUserId,
                createdAt,
            };
        });

        const io = req.app.get('io');
        if (io) {
            const payload = {
                tenantId,
                serviceCallId: result.id,
                tableId: result.tableId,
                tableName: result.tableName,
                callType: data.callType,
                waiterId: result.sessionWaiterId,
                targetWaiterId: result.targetUserId,
                createdAt: result.createdAt,
            };
            io.to(`tenant:${tenantId}`).emit('customer:service_call', payload);
            if (result.targetUserId != null) {
                io.to(`tenant:${tenantId}:waiter:${result.targetUserId}`).emit('customer:service_call', payload);
            } else if (result.sessionWaiterId != null) {
                io.to(`tenant:${tenantId}:waiter:${result.sessionWaiterId}`).emit('customer:service_call', payload);
            }
        }

        res.status(201).json({ success: true, id: result.id });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'TABLE_NOT_FOUND') {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }
        if (error.message === 'NO_WAITER_AVAILABLE') {
            return res.status(409).json({ error: 'Müsait garson bulunamadı' });
        }
        console.error('createQrServiceCallHandler', error);
        res.status(500).json({ error: 'Kayıt oluşturulamadı' });
    }
};
/** POST /api/v1/qr/external-order — Dış web portalından gelen (Paket/Gel-Al) siparişler */
export const createExternalOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = qrExternalOrderSchema.parse(req.body);

        const result = await withTenantTransaction(tenantId, async (connection) => {
            try {
                await connection.query(
                    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_arrival VARCHAR(32) DEFAULT 'cash'`,
                );
            } catch {
                /* ignore */
            }
            // 1. Müşteri: kayıtlı id veya telefonla bul / oluştur
            let customerId: number | null = data.customerId ?? null;
            if (customerId) {
                const [ver]: any = await connection.query(`SELECT id, phone FROM customers WHERE id = ? LIMIT 1`, [customerId]);
                if (!ver?.length) {
                    customerId = null;
                } else if (!phonesMatch(ver[0].phone, data.customerPhone)) {
                    customerId = null;
                }
            }
            if (!customerId) {
                const [crows]: any = await connection.query(
                    `SELECT id FROM customers WHERE phone = ? LIMIT 1`,
                    [data.customerPhone],
                );
                customerId = crows?.[0]?.id ?? null;
            }
            if (!customerId) {
                const [cins]: any = await connection.query(
                    `INSERT INTO customers (name, phone, created_at) VALUES (?, ?, NOW())`,
                    [data.customerName, data.customerPhone],
                );
                customerId = cins.insertId;
            }

            // Save new delivery address if customer is logged in
            if (customerId && data.orderType === 'delivery' && data.address?.trim()) {
                const cleanAddr = data.address.trim();
                const [addrExists]: any = await connection.query(
                    'SELECT id FROM customer_addresses WHERE customer_id = ? AND LOWER(TRIM(address)) = LOWER(TRIM(?)) LIMIT 1',
                    [customerId, cleanAddr]
                );
                if (!addrExists?.length) {
                    const label = data.addressLabel?.trim() || 'QR Adres';
                    await connection.query(
                        'INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES (?, ?, ?, false)',
                        [customerId, label, cleanAddr]
                    );
                }
            }

            // 2. Fiyatları hesapla
            let grossTotal = 0;
            const lines: any[] = [];
            for (const item of data.items) {
                const mids = item.modifierIds ?? [];
                const { unit, modifiersJson } = await computeLineUnitPrice(
                    connection,
                    item.productId,
                    item.variantId,
                    mids
                );
                grossTotal += unit * item.quantity;
                lines.push({
                    productId: item.productId,
                    variantId: item.variantId ?? null,
                    quantity: item.quantity,
                    unitPrice: unit,
                    modifiersJson,
                    notes: item.notes?.trim() || null,
                });
            }

            const vat = defaultVatRate();
            const { net: netSubtotal, tax: taxAmount, gross: totalAmount } = grossToNetAndTax(grossTotal, vat);

            if (data.orderType === 'delivery') {
                if (!data.address?.trim()) {
                    throw new Error('DELIVERY_ADDRESS_REQUIRED');
                }
                const validation = await DeliveryZoneService.validateAddress(connection, data.address, grossTotal);
                if (!validation.allowed) {
                    if (validation.reason === 'AddressOutsideDeliveryArea') {
                        throw new Error('ADDRESS_OUTSIDE_DELIVERY_AREA');
                    }
                    if (validation.reason === 'MinOrderNotReached') {
                        throw new Error(`MIN_ORDER_NOT_REACHED:${validation.zoneName}:${validation.minOrder}`);
                    }
                }
            }

            // 3. Siparişi oluştur (status: 'pending')
            // Using 'qr_portal' to match the enum in init.sql
            const notesWithPay =
                data.notes?.trim()
                    ? `${data.notes.trim()} | Ödeme: ${data.paymentMethod}`
                    : `Ödeme: ${data.paymentMethod}`;
            const [orderResult]: any = await connection.query(
                `INSERT INTO orders (
                    customer_id, order_type, source, subtotal, tax_amount, total_amount, 
                    notes, delivery_address, delivery_phone, 
                    payment_status, status, created_at, payment_method_arrival
                ) VALUES (?, ?::order_type, 'qr_portal'::order_source, ?, ?, ?, ?, ?, ?, 'unpaid'::payment_status, 'pending'::order_status, NOW(), ?)`,
                [
                    customerId,
                    data.orderType,
                    netSubtotal,
                    taxAmount,
                    totalAmount,
                    notesWithPay,
                    data.address || null,
                    data.customerPhone,
                    data.paymentMethod,
                ]
            );
            const newOrderId = orderResult.insertId;

            // 4. Kalemleri ekle
            for (const ln of lines) {
                await connection.query(
                    `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price, modifiers, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        newOrderId,
                        ln.productId,
                        ln.variantId,
                        ln.quantity,
                        ln.unitPrice,
                        ln.unitPrice * ln.quantity,
                        JSON.stringify(ln.modifiersJson),
                        ln.notes,
                    ]
                );
            }

            await applyOrderRecipeDeduction(
                connection,
                newOrderId,
                lines.map((ln: { productId: number; quantity: number; variantId: number | null }) => ({
                    productId: ln.productId,
                    quantity: ln.quantity,
                    variantId: ln.variantId ?? null,
                })),
                null
            );

            const qrMembershipAwaitingPos = Boolean(data.wantsRegistration && customerId != null);

            return {
                orderId: newOrderId,
                totalAmount,
                customerName: data.customerName,
                orderType: data.orderType,
                memberRegistration: null,
                qrMembershipAwaitingPos,
            };
        });

        // 5. POS ve Mutfak için Socket Bildirimi Gönder
        const io = req.app.get('io');
        if (io) {
            // Room name in useCashierRealtimeSync is just 'tenantId' or 'tenant:tenantId'?
            // Let's check useCashierRealtimeSync.ts: socket.emit('join:tenant', tenantId);
            // In cashier.ts (socket server), join:tenant joins req.tenantId.
            io.to(`tenant:${tenantId}`).emit('external_order:new', {
                tenantId,
                ...result,
                paymentMethod: data.paymentMethod,
                timestamp: new Date()
            });
        }

        res.status(201).json({
            success: true,
            message: 'Siparişiniz başarıyla alındı ve restoran onayına gönderildi.',
            orderId: result.orderId,
            memberRegistration: null,
            qrMembershipAwaitingPos: result.qrMembershipAwaitingPos ?? false,
        });
    } catch (error: any) {
        if (error instanceof InsufficientStockError) {
            return res.status(400).json({
                error: 'Reçete için yetersiz stok',
                code: 'INSUFFICIENT_STOCK',
                detail: error.payload,
            });
        }
        if (error.message === 'DELIVERY_ADDRESS_REQUIRED') {
            return res.status(400).json({ error: 'Teslimat adresi gereklidir' });
        }
        if (error.message === 'ADDRESS_OUTSIDE_DELIVERY_AREA') {
            return res.status(400).json({ error: 'Belirtilen adres teslimat bölgelerimizin dışındadır' });
        }
        if (typeof error.message === 'string' && error.message.startsWith('MIN_ORDER_NOT_REACHED:')) {
            const parts = error.message.split(':');
            const zoneName = parts[1];
            const minOrder = parts[2];
            return res.status(400).json({
                error: `Bu bölge (${zoneName}) için minimum sipariş tutarı ${minOrder}€ olmalıdır.`
            });
        }
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz sipariş verisi', details: error.flatten() });
        }
        console.error('CRITICAL: createExternalOrderHandler ERROR:', error.message, error.stack);
        res.status(500).json({ error: 'Sipariş işlenirken bir hata oluştu: ' + error.message });
    }
};

/** GET /api/v1/qr/external-orders — Kasiyer için açık online siparişleri listeler */
export const getExternalOrdersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const statusQuery = typeof req.query.statuses === 'string' ? req.query.statuses.trim() : '';
        const statuses = statusQuery ? statusQuery.split(',').map(s => s.trim()).filter(Boolean) : [];

        const orders = await withTenant(tenantId, async (connection) => {
            await ensureQrMembershipPendingColumns(connection);
            
            let queryStr = `
                SELECT o.*, COALESCE(o.customer_name, c.name) as customer_name, c.phone as customer_phone,
                       u.name as courier_name,
                       (c.id IS NOT NULL AND COALESCE(c.qr_pending_confirmation, false) = true AND c.qr_pending_order_id = o.id) AS customer_membership_pending_pos
                FROM orders o
                LEFT JOIN customers c ON c.id = o.customer_id
                LEFT JOIN users u ON u.id = o.courier_id
                WHERE o.source IN ('qr_portal'::order_source, 'whatsapp'::order_source)
            `;
            
            const queryParams: any[] = [];
            
            if (statuses.length > 0) {
                queryStr += ` AND o.status::text IN (${statuses.map(() => '?').join(',')})`;
                statuses.forEach(s => queryParams.push(s));
            } else {
                queryStr += ` AND o.status NOT IN ('completed'::order_status, 'cancelled'::order_status)`;
            }
            
            queryStr += ` ORDER BY o.created_at DESC`;
            
            const [rows]: any = await connection.query(queryStr, queryParams);
            
            const ordersWithItems = [];
            for (const order of rows) {
                const [items]: any = await connection.query(
                    `SELECT oi.*, p.name as product_name 
                     FROM order_items oi
                     JOIN products p ON p.id = oi.product_id
                     WHERE oi.order_id = ?`,
                    [order.id]
                );
                ordersWithItems.push({ ...order, items });
            }
            return ordersWithItems;
        });
        res.json(orders);
    } catch (e: any) {
        console.error('getExternalOrdersHandler error:', e.message);
        res.status(500).json({ error: 'Sipariş listesi alınamadı' });
    }
};

/** POST /api/v1/qr/external-orders/:id/confirm — Siparişi onayla ve mutfağa gönder */
export const confirmExternalOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = req.params.id;

        await withTenantTransaction(tenantId, async (connection) => {
            await ensureQrMembershipPendingColumns(connection);
            await connection.query(
                "UPDATE orders SET status = 'confirmed'::order_status, updated_at = NOW() WHERE id = ?",
                [orderId]
            );

            // Siparişle ilişkili müşteri ID'sini bul
            const [orderRows]: any = await connection.query(
                "SELECT customer_id FROM orders WHERE id = ?",
                [orderId]
            );
            const customerId = orderRows?.[0]?.customer_id;

            if (customerId) {
                const [crows]: any = await connection.query(
                    "SELECT customer_code, personal_qr FROM customers WHERE id = ?",
                    [customerId]
                );
                const crow = crows?.[0];
                const updates: string[] = [
                    "qr_pending_confirmation = false",
                    "qr_pending_order_id = NULL",
                    "whatsapp_verified = true"
                ];
                const params: any[] = [];

                if (!crow?.customer_code) {
                    const nextCode = Math.floor(100000 + Math.random() * 900000).toString();
                    updates.push("customer_code = ?");
                    params.push(nextCode);
                }

                if (!crow?.personal_qr) {
                    const nextQr = `MEMBER-${customerId}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                    updates.push("personal_qr = ?");
                    params.push(nextQr);
                }

                params.push(customerId);
                await connection.query(
                    `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`,
                    params
                );
            } else {
                // Yedek mekanizma (qr_pending_order_id ile)
                await connection.query(
                    `UPDATE customers SET qr_pending_confirmation = false, qr_pending_order_id = NULL, whatsapp_verified = true
                     WHERE qr_pending_order_id = ?`,
                    [orderId]
                );
            }

            const [items]: any = await connection.query(
                "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?",
                [orderId]
            );

            await connection.query(
                `INSERT INTO kitchen_tickets (order_id, status, items, created_at) 
                 VALUES (?, 'waiting'::kitchen_status, ?, NOW())`,
                [orderId, JSON.stringify(items)]
            );
        });

        const io = req.app.get('io');
        if (io) io.to(`tenant:${tenantId}`).emit('order:status_update', { orderId, status: 'confirmed' });

        res.json({ success: true, message: 'Sipariş onaylandı ve mutfağa gönderildi' });
    } catch (e: any) {
        console.error('confirmExternalOrderHandler error:', e.message);
        res.status(500).json({ error: 'Sipariş onaylanamadı: ' + e.message });
    }
};

/** POST /api/v1/qr/external-orders/:id/cancel — Siparişi iptal et */
export const cancelExternalOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = req.params.id;
        const { reason } = req.body;

        await withTenantTransaction(tenantId, async (connection) => {
            await ensureQrMembershipPendingColumns(connection);
            const [ords]: any = await connection.query(`SELECT customer_id FROM orders WHERE id = ? FOR UPDATE`, [
                orderId,
            ]);
            const cid = ords?.[0]?.customer_id != null ? Number(ords[0].customer_id) : null;

            await connection.query(
                "UPDATE orders SET status = 'cancelled'::order_status, notes = CONCAT(COALESCE(notes, ''), ' | İptal Sebebi: ', ?), updated_at = NOW() WHERE id = ?",
                [reason || 'Belirtilmedi', orderId]
            );

            if (cid != null) {
                const [prov]: any = await connection.query(
                    `SELECT 1 AS ok FROM customers WHERE id = ? AND COALESCE(qr_pending_confirmation, false) = true AND qr_pending_order_id = ?`,
                    [cid, Number(orderId)]
                );
                if (prov?.[0]?.ok) {
                    await connection.query(`UPDATE orders SET customer_id = NULL WHERE id = ?`, [orderId]);
                    await connection.query(`DELETE FROM customers WHERE id = ?`, [cid]);
                }
            }
        });

        res.json({ success: true, message: 'Sipariş iptal edildi' });
    } catch (e: any) {
        res.status(500).json({ error: 'İptal işlemi başarısız' });
    }
};

/** POST /api/v1/qr/external-orders/:id/provisional-membership — Kasada geçici üye QR + kod (sipariş onayına kadar identify kapalı) */
export const provisionalExternalOrderMembershipHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId) || orderId < 1) {
            return res.status(400).json({ error: 'Geçersiz sipariş numarası' });
        }
        const parsedBody = provisionalMembershipBodySchema.safeParse(req.body ?? {});
        const deliveryOverride =
            parsedBody.success && parsedBody.data.deliveryAddress?.trim()
                ? parsedBody.data.deliveryAddress.trim()
                : undefined;

        const result = await withTenantTransaction(tenantId, async (connection) => {
            await ensureQrMembershipPendingColumns(connection);
            const [rows]: any = await connection.query(
                `SELECT o.id, o.customer_id, o.status::text AS status, o.source::text AS source, o.delivery_address, o.order_type::text AS order_type
                 FROM orders o WHERE o.id = ? FOR UPDATE`,
                [orderId]
            );
            const o = rows?.[0];
            if (!o) {
                throw new Error('ORDER_NOT_FOUND');
            }
            if (!o.customer_id) {
                throw new Error('NO_CUSTOMER');
            }
            const src = String(o.source || '').toLowerCase();
            if (!['qr_portal', 'whatsapp'].includes(src)) {
                throw new Error('SOURCE_NOT_ALLOWED');
            }
            const st = String(o.status || '').toLowerCase();
            if (st === 'cancelled' || st === 'completed') {
                throw new Error('ORDER_CLOSED');
            }

            const custId = Number(o.customer_id);
            const [crows]: any = await connection.query(
                `SELECT id, name, phone, customer_code, personal_qr,
                        COALESCE(qr_pending_confirmation, false) AS qp, qr_pending_order_id,
                        COALESCE(whatsapp_verified, false) AS whatsapp_verified
                 FROM customers WHERE id = ? FOR UPDATE`,
                [custId]
            );
            const crow = crows?.[0];
            if (!crow) {
                throw new Error('CUSTOMER_NOT_FOUND');
            }

            const pendingOid = crow.qr_pending_order_id != null ? Number(crow.qr_pending_order_id) : null;
            if (crow.qp && pendingOid === orderId) {
                const code = String(crow.customer_code || '').trim();
                const payload = String(crow.personal_qr || '').trim();
                return {
                    kind: 'idempotent' as const,
                    customer_code: code,
                    memberQrPayload: payload,
                    name: String(crow.name || ''),
                    phone: crow.phone != null ? String(crow.phone) : null,
                };
            }
            if (crow.qp && pendingOid != null && pendingOid !== orderId) {
                throw new Error('CUSTOMER_PENDING_OTHER_ORDER');
            }

            const codeExisting = crow.customer_code != null ? String(crow.customer_code).trim() : '';
            const qrExisting = crow.personal_qr != null ? String(crow.personal_qr).trim() : '';
            if (!crow.qp && codeExisting && qrExisting) {
                return {
                    kind: 'already_active' as const,
                    customer_code: codeExisting,
                    memberQrPayload: qrExisting,
                    name: String(crow.name || ''),
                    phone: crow.phone != null ? String(crow.phone) : null,
                };
            }

            const addr =
                deliveryOverride ||
                (String(o.order_type || '').toLowerCase() === 'delivery'
                    ? String(o.delivery_address || '').trim() || null
                    : null);

            const fin = await finalizeQrMemberRegistration(connection, custId, { deliveryAddress: addr });
            const isWaVerified = crow.whatsapp_verified === true || crow.whatsapp_verified === 1 || String(crow.whatsapp_verified) === 'true';
            await connection.query(
                `UPDATE customers SET qr_pending_confirmation = ?, qr_pending_order_id = ? WHERE id = ?`,
                [isWaVerified ? false : true, isWaVerified ? null : orderId, custId]
            );
            return {
                kind: 'created_pending' as const,
                customer_code: fin.customer_code,
                memberQrPayload: fin.memberQrPayload,
                name: fin.name,
                phone: fin.phone,
            };
        });

        if (result.kind === 'already_active') {
            return res.status(200).json({
                success: true,
                alreadyActive: true,
                customer_code: result.customer_code,
                memberQrPayload: result.memberQrPayload,
                name: result.name,
                phone: result.phone,
                pendingUntilConfirmed: false,
                orderId,
            });
        }

        return res.status(200).json({
            success: true,
            alreadyActive: false,
            customer_code: result.customer_code,
            memberQrPayload: result.memberQrPayload,
            name: result.name,
            phone: result.phone,
            orderId,
            pendingUntilConfirmed: true,
        });
    } catch (e: any) {
        const map: Record<string, { status: number; msg: string }> = {
            ORDER_NOT_FOUND: { status: 404, msg: 'Sipariş bulunamadı' },
            NO_CUSTOMER: { status: 400, msg: 'Siparişte müşteri yok' },
            SOURCE_NOT_ALLOWED: { status: 400, msg: 'Bu sipariş tipi için uygun değil' },
            ORDER_CLOSED: { status: 400, msg: 'Sipariş iptal veya tamamlanmış' },
            CUSTOMER_NOT_FOUND: { status: 404, msg: 'Müşteri bulunamadı' },
            CUSTOMER_PENDING_OTHER_ORDER: {
                status: 409,
                msg: 'Müşteri başka sipariş için bekleyen üyelikte',
            },
        };
        const m = map[e?.message];
        if (m) {
            return res.status(m.status).json({ error: m.msg });
        }
        console.error('provisionalExternalOrderMembershipHandler', e);
        return res.status(500).json({ error: 'İşlem başarısız: ' + String(e?.message || e) });
    }
};

/** GET /api/v1/qr/track/:id — Müşteri için sipariş sorgulama */
export const trackOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = req.params.id;
        const phoneQuery = String(req.query.phone || '').trim();

        const order = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT o.status, o.order_type::text AS order_type, o.total_amount, o.payment_status, o.created_at, o.updated_at,
                        o.delivery_address, c.phone AS customer_phone
                 FROM orders o
                 LEFT JOIN customers c ON c.id = o.customer_id
                 WHERE o.id = ?`,
                [orderId]
            );
            return rows[0];
        });

        if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

        const orderType = String(order.order_type || '');
        if (EXTERNAL_ORDER_TYPES.has(orderType) && order.customer_phone) {
            if (!phoneQuery) {
                return res.status(403).json({ error: 'Sipariş sorgusu için telefon doğrulaması gerekli' });
            }
            if (!phonesMatch(order.customer_phone, phoneQuery)) {
                return res.status(403).json({ error: 'Telefon numarası eşleşmiyor' });
            }
        }

        res.json({
            status: order.status,
            order_type: order.order_type,
            total_amount: order.total_amount,
            payment_status: order.payment_status,
            created_at: order.created_at,
            updated_at: order.updated_at,
            delivery_address: order.delivery_address,
        });
    } catch (e: any) {
        res.status(500).json({ error: 'Sorgulama başarısız' });
    }
};
/** GET /api/v1/qr/courier-stats — Admin için kurye performans ve aktiflik özeti */
export const getCourierStatsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const stats = await withTenant(tenantId, async (connection) => {
            // 1. Tum aktif kuryeleri getir
            const [couriers]: any = await connection.query(
                `SELECT id, name, updated_at as last_ping 
                 FROM users WHERE role = 'courier' AND status = 'active'`
            );

            if (!couriers || !Array.isArray(couriers)) return [];

            const result = [];
            for (const c of couriers) {
                // 2. Aktif (Atanmis, Teslim Alinmis veya Yolda) siparis sayisi
                // deliveries tablosundaki delivery_status enum degerlerini kullaniriz
                const [activeRes]: any = await connection.query(
                    `SELECT COUNT(*)::bigint as active_count FROM deliveries 
                     WHERE courier_id = ? AND status IN ('assigned', 'picked_up', 'on_the_way')`,
                    [c.id]
                );

                // 3. Bugun tamamlanan siparis sayisi
                const [deliveredTodayRes]: any = await connection.query(
                    `SELECT COUNT(*)::bigint as today_count FROM deliveries 
                     WHERE courier_id = ? AND status = 'delivered' 
                     AND created_at >= CURRENT_DATE`,
                    [c.id]
                );

                result.push({
                    id: c.id,
                    name: c.name,
                    activeOrders: parseInt(String(activeRes?.[0]?.active_count || '0'), 10),
                    deliveredToday: parseInt(String(deliveredTodayRes?.[0]?.today_count || '0'), 10),
                    lastPing: c.last_ping
                });
            }
            return result;
        });
        res.json(stats || []);
    } catch (e: any) {
        console.error('❌ CRITICAL getCourierStatsHandler ERROR:', e.message, e.stack);
        res.status(500).json({ error: 'Kurye istatistikleri alınamadı: ' + e.message });
    }
};

/** GET /api/v1/qr/identify — QR / QR-Web: müşteri kodu, telefon veya isim (domain veya x-tenant-id) */
export const qrIdentifyCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId =
            (req as Request & { tenantId?: string }).tenantId ||
            (typeof req.headers['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'].trim() : '');
        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant gerekli' });
        }

        const legacyQ = req.query.query != null ? String(req.query.query).trim() : '';
        const customerCode =
            req.query.customerCode != null ? String(req.query.customerCode).trim() : '';
        const phoneRaw = req.query.phone != null ? String(req.query.phone).trim() : '';
        const nameRaw = req.query.name != null ? String(req.query.name).trim() : '';

        const customer = await withTenant(tenantId, async (connection) => {
            await ensureQrMembershipPendingColumns(connection);
            const normPhone = (p: string) => p.replace(/[\s\-()]/g, '');

            let found: any = null;

            if (legacyQ) {
                const [rows]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email, COALESCE(whatsapp_verified, false) AS whatsapp_verified
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql}
                     AND (customer_code = ? 
                        OR phone = ? 
                        OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
                        OR email = ?
                        OR LOWER(TRIM(name)) = LOWER(?))
                     LIMIT 1`,
                    [
                        legacyQ,
                        legacyQ,
                        normPhone(legacyQ),
                        legacyQ,
                        legacyQ,
                    ]
                );
                found = rows[0];
            } else if (customerCode) {
                const [byCode]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email, COALESCE(whatsapp_verified, false) AS whatsapp_verified
                     FROM customers WHERE ${identifyCustomerNotPendingSql} AND customer_code = ? LIMIT 1`,
                    [customerCode]
                );
                if (byCode?.[0]) found = byCode[0];
            } else if (phoneRaw) {
                const p = normPhone(phoneRaw);
                const [byPhone]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email, COALESCE(whatsapp_verified, false) AS whatsapp_verified
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql}
                     AND (phone = ? 
                        OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?)
                     LIMIT 1`,
                    [phoneRaw, p]
                );
                if (byPhone?.[0]) found = byPhone[0];
            } else if (nameRaw) {
                const [byName]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email, COALESCE(whatsapp_verified, false) AS whatsapp_verified
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql} AND LOWER(TRIM(name)) = LOWER(?)
                     LIMIT 1`,
                    [nameRaw]
                );
                if (byName?.[0]) found = byName[0];
            }

            if (found) {
                const [addrRows]: any = await connection.query(
                    'SELECT id, label, address, district, city, is_default FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC',
                    [found.id]
                );
                found.addresses = addrRows;
            }

            return found;
        });

        if (!customer) {
            return res.status(404).json({ error: 'Müşteri bulunamadı' });
        }
        res.json(customer);
    } catch (error) {
        console.error('qrIdentifyCustomerHandler', error);
        res.status(500).json({ error: 'Tanımlama başarısız' });
    }
};

/** GET /api/v1/qr-web/addresses — Müşterinin kayıtlı adreslerini getirir */
export const qrGetAddressesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.query.customerId);
        const phone = String(req.query.phone || '');
        if (!customerId || !phone.trim()) {
            return res.status(400).json({ error: 'Müşteri ID ve telefon gereklidir' });
        }

        const addresses = await withTenant(tenantId, async (connection) => {
            const allowed = await assertCustomerPhoneAccess(connection, customerId, phone);
            if (!allowed) return null;
            const [rows]: any = await connection.query(
                'SELECT id, label, address, district, city, is_default FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC',
                [customerId]
            );
            return rows || [];
        });

        if (addresses === null) {
            return res.status(403).json({ error: 'Telefon doğrulaması başarısız' });
        }

        res.json(addresses);
    } catch (error) {
        console.error('qrGetAddressesHandler', error);
        res.status(500).json({ error: 'Adresler yüklenemedi' });
    }
};

/** POST /api/v1/qr-web/addresses — Yeni adres ekler */
export const qrAddAddressHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { customerId, label, address, phone } = req.body;
        
        if (!customerId || !address?.trim() || !phone?.trim()) {
            return res.status(400).json({ error: 'Müşteri ID, telefon ve adres gereklidir' });
        }

        const result = await withTenantTransaction(tenantId, async (connection) => {
            const allowed = await assertCustomerPhoneAccess(connection, Number(customerId), phone);
            if (!allowed) throw new Error('PHONE_MISMATCH');
            const cleanLabel = label?.trim() || 'Adres';
            const cleanAddress = address.trim();

            // İlk adres ise varsayılan yapalım
            const [existing]: any = await connection.query(
                'SELECT id FROM customer_addresses WHERE customer_id = ? LIMIT 1',
                [customerId]
            );
            const isDefault = !existing || existing.length === 0;

            const [ins]: any = await connection.query(
                'INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES (?, ?, ?, ?)',
                [customerId, cleanLabel, cleanAddress, isDefault]
            );

            const [newAddr]: any = await connection.query(
                'SELECT id, label, address, district, city, is_default FROM customer_addresses WHERE id = ?',
                [ins.insertId]
            );
            return newAddr?.[0] || null;
        });

        res.json(result);
    } catch (error: any) {
        if (error?.message === 'PHONE_MISMATCH') {
            return res.status(403).json({ error: 'Telefon doğrulaması başarısız' });
        }
        console.error('qrAddAddressHandler', error);
        res.status(500).json({ error: 'Adres eklenemedi' });
    }
};

/** DELETE /api/v1/qr-web/addresses/:id — Adresi siler */
export const qrDeleteAddressHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const addressId = Number(req.params.id);
        const customerId = Number(req.query.customerId);
        const phone = String(req.query.phone || '');

        if (!addressId || !customerId || !phone.trim()) {
            return res.status(400).json({ error: 'Adres ID, müşteri ID ve telefon gereklidir' });
        }

        const ok = await withTenantTransaction(tenantId, async (connection) => {
            const allowed = await assertCustomerPhoneAccess(connection, customerId, phone);
            if (!allowed) return false;
            // Silinecek adres varsayılan ise, başka bir adresi varsayılan yapalım
            const [target]: any = await connection.query(
                'SELECT is_default FROM customer_addresses WHERE id = ? AND customer_id = ?',
                [addressId, customerId]
            );
            
            await connection.query(
                'DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?',
                [addressId, customerId]
            );

            if (target?.[0]?.is_default) {
                const [other]: any = await connection.query(
                    'SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
                    [customerId]
                );
                if (other?.[0]?.id) {
                    await connection.query(
                        'UPDATE customer_addresses SET is_default = true WHERE id = ?',
                        [other[0].id]
                    );
                }
            }
            return true;
        });

        if (!ok) {
            return res.status(403).json({ error: 'Telefon doğrulaması başarısız' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('qrDeleteAddressHandler', error);
        res.status(500).json({ error: 'Adres silinemedi' });
    }
};

/** PUT /api/v1/qr-web/addresses/:id/default — Adresi varsayılan yapar */
export const qrSetDefaultAddressHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const addressId = Number(req.params.id);
        const { customerId, phone } = req.body;

        if (!addressId || !customerId || !phone?.trim()) {
            return res.status(400).json({ error: 'Adres ID, müşteri ID ve telefon gereklidir' });
        }

        const ok = await withTenantTransaction(tenantId, async (connection) => {
            const allowed = await assertCustomerPhoneAccess(connection, Number(customerId), phone);
            if (!allowed) return false;
            await connection.query(
                'UPDATE customer_addresses SET is_default = false WHERE customer_id = ?',
                [customerId]
            );
            await connection.query(
                'UPDATE customer_addresses SET is_default = true WHERE id = ? AND customer_id = ?',
                [addressId, customerId]
            );
            return true;
        });

        if (!ok) {
            return res.status(403).json({ error: 'Telefon doğrulaması başarısız' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('qrSetDefaultAddressHandler', error);
        res.status(500).json({ error: 'Varsayılan adres güncellenemedi' });
    }
};

export const qrVerifyRequestHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { name, phone } = z.object({
            name: z.string().min(2),
            phone: z.string().min(5)
        }).parse(req.body);

        const cleanPhone = phone.replace(/\D/g, '');
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit random code

        const result = await withTenant(tenantId, async (connection) => {
            // Kolonların olduğundan emin ol
            try {
                await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT false`);
                await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_verification_code VARCHAR(10) NULL`);
            } catch { /* ignore */ }

            // Müşteriyi bul veya oluştur
            const [crows]: any = await connection.query(`SELECT id, whatsapp_verified FROM customers WHERE phone = ? LIMIT 1`, [phone]);
            let customerId: number;
            let alreadyVerified = false;

            if (crows?.[0]) {
                customerId = crows[0].id;
                alreadyVerified = Boolean(crows[0].whatsapp_verified);
                if (!alreadyVerified) {
                    await connection.query(`UPDATE customers SET whatsapp_verification_code = ? WHERE id = ?`, [verificationCode, customerId]);
                }
            } else {
                const [cins]: any = await connection.query(
                    `INSERT INTO customers (name, phone, whatsapp_verification_code, created_at) VALUES (?, ?, ?, NOW())`,
                    [name, phone, verificationCode]
                );
                customerId = cins.insertId;
            }

            // Restoranın WhatsApp numarasını bul (branch settings integrations'dan)
            const [branchRows]: any = await connection.query(`SELECT settings FROM branches WHERE id = 1`);
            const settings = branchRows?.[0]?.settings || {};
            const integrations = settings.integrations || {};
            const whatsappPhone = integrations.whatsapp?.phoneNumber || '';

            return {
                alreadyVerified,
                verificationCode,
                whatsappPhone
            };
        });

        res.json({
            success: true,
            alreadyVerified: result.alreadyVerified,
            code: result.verificationCode,
            whatsappPhone: result.whatsappPhone
        });
    } catch (error: any) {
        console.error('qrVerifyRequestHandler error:', error);
        res.status(500).json({ error: 'Doğrulama isteği oluşturulamadı' });
    }
};

export const qrVerifyCheckHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const phone = String(req.query.phone || '').trim();

        if (!phone) {
            return res.status(400).json({ error: 'Telefon numarası zorunludur' });
        }

        const verified = await withTenant(tenantId, async (connection) => {
            try {
                await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT false`);
            } catch { /* ignore */ }

            const [rows]: any = await connection.query(
                `SELECT whatsapp_verified FROM customers WHERE phone = ? LIMIT 1`,
                [phone]
            );
            return rows?.[0]?.whatsapp_verified === true || rows?.[0]?.whatsapp_verified === 1;
        });

        res.json({
            success: true,
            verified
        });
    } catch (error: any) {
        console.error('qrVerifyCheckHandler error:', error);
        res.status(500).json({ error: 'Doğrulama durumu kontrol edilemedi' });
    }
};
