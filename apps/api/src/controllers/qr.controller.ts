import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { applyOrderRecipeDeduction, InsufficientStockError } from '../services/stock-inventory.service.js';
import { effectiveTableQrCode, tableWhereByQrParam } from '../lib/tableQr.js';
import { pickLeastLoadedWaiterForSection } from '../lib/waiterSectionColumns.js';
import { getCategoriesHandler, getProductsHandler } from './menu.controller.js';

async function ensureServiceCallsTargetUserForQr(connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    try {
        await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS target_user_id INTEGER NULL`);
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
                        s.name AS section_name
                 FROM tables t
                 LEFT JOIN sections s ON s.id = t.section_id
                 WHERE ${clause}`,
                params
            );
            return rows?.[0] || null;
        });

        if (!row) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
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

            const assignedWaiterId = await pickLeastLoadedWaiterForSection(
                connection,
                Number.isFinite(sectionId) ? sectionId : null
            );

            const [sr]: any = await connection.query(
                `SELECT id, waiter_id FROM table_sessions
                 WHERE table_id = ? AND closed_at IS NULL
                 ORDER BY opened_at DESC LIMIT 1`,
                [tableId]
            );
            const sessionId = sr?.[0]?.id != null ? Number(sr[0].id) : null;
            const sessionWaiterId = sr?.[0]?.waiter_id != null ? Number(sr[0].waiter_id) : null;

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

            let targetUserId: number | null = null;
            if (data.callType === 'call_waiter') {
                targetUserId = await pickLeastLoadedWaiterForSection(
                    connection,
                    Number.isFinite(sectionId) ? sectionId : null
                );
            }

            const [ins]: any = await connection.query(
                `INSERT INTO service_calls (table_id, session_id, call_type, status, message, target_user_id)
                 VALUES (?, ?, ?, 'pending', NULL, ?)`,
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
                const [ver]: any = await connection.query(`SELECT id FROM customers WHERE id = ? LIMIT 1`, [customerId]);
                if (!ver?.length) customerId = null;
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
            io.to(tenantId).emit('external_order:new', {
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
        console.error('CRITICAL: createExternalOrderHandler ERROR:', error.message, error.stack);
        res.status(500).json({ error: 'Sipariş işlenirken bir hata oluştu: ' + error.message });
    }
};

/** GET /api/v1/qr/external-orders — Kasiyer için açık online siparişleri listeler */
export const getExternalOrdersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orders = await withTenant(tenantId, async (connection) => {
            await ensureQrMembershipPendingColumns(connection);
            const [rows]: any = await connection.query(
                `SELECT o.*, c.name as customer_name, c.phone as customer_phone,
                        (c.id IS NOT NULL AND COALESCE(c.qr_pending_confirmation, false) = true AND c.qr_pending_order_id = o.id) AS customer_membership_pending_pos
                 FROM orders o
                 LEFT JOIN customers c ON c.id = o.customer_id
                 WHERE o.source IN ('qr_portal'::order_source, 'whatsapp'::order_source) 
                 AND o.status NOT IN ('completed'::order_status, 'cancelled'::order_status)
                 ORDER BY o.created_at DESC`
            );
            
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

            await connection.query(
                `UPDATE customers SET qr_pending_confirmation = false, qr_pending_order_id = NULL
                 WHERE qr_pending_order_id = ?`,
                [orderId]
            );

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
        if (io) io.to(tenantId).emit('order:status_update', { orderId, status: 'confirmed' });

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
                        COALESCE(qr_pending_confirmation, false) AS qp, qr_pending_order_id
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
            await connection.query(
                `UPDATE customers SET qr_pending_confirmation = true, qr_pending_order_id = ? WHERE id = ?`,
                [orderId, custId]
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

        const order = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT status, order_type::text AS order_type, total_amount, payment_status, created_at, updated_at,
                        delivery_address
                 FROM orders WHERE id = ?`,
                [orderId]
            );
            return rows[0];
        });

        if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
        res.json(order);
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

            if (legacyQ) {
                const noSpace = legacyQ.replace(/\s/g, '');
                const likePat = `%${legacyQ.replace(/[%_\\]/g, '')}%`;
                const [rows]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql}
                     AND (customer_code = ? 
                        OR phone = ? 
                        OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
                        OR email = ?
                        OR LOWER(TRIM(name)) = LOWER(?)
                        OR (CHAR_LENGTH(?) >= 2 AND name LIKE ?))
                     LIMIT 1`,
                    [
                        legacyQ,
                        legacyQ,
                        normPhone(legacyQ),
                        legacyQ,
                        legacyQ,
                        legacyQ,
                        likePat,
                    ]
                );
                return rows[0];
            }

            if (!customerCode && !phoneRaw && !nameRaw) {
                return null;
            }

            if (customerCode) {
                const [byCode]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email
                     FROM customers WHERE ${identifyCustomerNotPendingSql} AND customer_code = ? LIMIT 1`,
                    [customerCode]
                );
                if (byCode?.[0]) return byCode[0];
            }

            if (phoneRaw) {
                const p = normPhone(phoneRaw);
                const [byPhone]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql}
                     AND (phone = ? 
                        OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?)
                     LIMIT 1`,
                    [phoneRaw, p]
                );
                if (byPhone?.[0]) return byPhone[0];
            }

            if (nameRaw) {
                const [byName]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql} AND LOWER(TRIM(name)) = LOWER(?)
                     LIMIT 1`,
                    [nameRaw]
                );
                if (byName?.[0]) return byName[0];
                const [byNameLike]: any = await connection.query(
                    `SELECT id, name, phone, customer_code, reward_points, email
                     FROM customers 
                     WHERE ${identifyCustomerNotPendingSql} AND name LIKE ? AND CHAR_LENGTH(?) >= 2
                     LIMIT 1`,
                    [`%${nameRaw.replace(/[%_\\]/g, '')}%`, nameRaw]
                );
                if (byNameLike?.[0]) return byNameLike[0];
            }

            return null;
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
