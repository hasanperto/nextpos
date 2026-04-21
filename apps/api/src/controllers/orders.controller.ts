import { Request, Response } from 'express';
import { z } from 'zod';
import { TenantError, withTenant, withTenantTransaction } from '../lib/db.js';
import { buildKitchenTicketsForOrder } from '../services/order-kitchen.service.js';
import { notifyResellerOfSale } from '../services/reseller-notify.service.js';
import { FiscalService } from '../services/fiscal.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

import { rewardLoyaltyPoints, reverseLoyaltyPoints } from '../lib/loyalty.js';
import {
    applyOrderRecipeDeduction,
    reverseOrderRecipeDeduction,
    InsufficientStockError,
    ensureStockRecipeSchema,
} from '../services/stock-inventory.service.js';
import { getEffectiveMaxDevices, getEffectiveMaxPrinters } from '../services/billing.service.js';

export const createOrderSchema = z.object({
    sessionId: z.number().optional(),
    clientSessionId: z.string().optional(),
    tableId: z.number().optional(),
    customerId: z.number().optional(),
    customerName: z.string().optional(),
    /** Kapıda ödeme tipi (cash, card, online) */
    paymentMethodArrival: z.enum(['cash', 'card', 'online']).optional(),
    /** Paket siparişinde kasiyerin seçtiği kurye (users.id) */
    courierId: z.number().optional(),
    orderType: z.enum(['dine_in', 'takeaway', 'delivery', 'web', 'phone', 'qr_menu']).default('dine_in'),
    source: z.enum(['cashier', 'waiter', 'customer_qr', 'web', 'phone']).default('cashier'),
    notes: z.string().optional(),
    deliveryAddress: z.string().optional(),
    deliveryPhone: z.string().optional(),
    isUrgent: z.boolean().default(false),
    /** Sadakat: 10 puan = 1 birim tutar indirimi (brüt); müşteri `customerId` gerekli */
    loyaltyPointsToRedeem: z.number().int().min(0).max(1_000_000).optional(),
    items: z.array(z.object({
        productId: z.number(),
        variantId: z.number().optional(),
        quantity: z.number().min(1),
        unitPrice: z.number(),
        modifiers: z.any().optional(),
        notes: z.string().optional(),
    })).min(1, 'En az 1 ürün gerekli'),
});

export type CreateOrderPayload = z.infer<typeof createOrderSchema>;

/** Birim fiyatlar KDV dahil (brüt); POS `getCartTotal` ile aynı mantık (%19 varsayılan) */
function defaultVatRate(): number {
    const v = Number(process.env.DEFAULT_VAT_RATE ?? 0.19);
    return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0.19;
}

/** Şube `branches.settings.vat` dizisinden varsayılan KDV (admin ayarları ile uyumlu) */
async function resolveDefaultVatRateDecimal(
    connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    branchId: number | null | undefined
): Promise<number> {
    const bid = branchId ?? 1;
    try {
        const [rows]: any = await connection.query('SELECT settings FROM branches WHERE id = ? LIMIT 1', [bid]);
        const raw = rows?.[0]?.settings;
        let parsed: Record<string, unknown> = {};
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                parsed = {};
            }
        } else if (raw && typeof raw === 'object') {
            parsed = raw as Record<string, unknown>;
        }
        const vatArr = parsed.vat;
        if (Array.isArray(vatArr) && vatArr.length > 0) {
            const sorted = [...vatArr].sort(
                (a: { value?: number }, b: { value?: number }) =>
                    Number(b?.value ?? 0) - Number(a?.value ?? 0)
            );
            const v = Number((sorted[0] as { value?: number })?.value ?? 19);
            if (Number.isFinite(v) && v >= 0 && v <= 100) {
                const dec = v / 100;
                if (dec >= 0 && dec < 1) return dec;
            }
        }
    } catch (e) {
        console.warn('resolveDefaultVatRateDecimal:', e);
    }
    return defaultVatRate();
}

function grossToNetAndTax(gross: number, vatRate: number): { net: number; tax: number; gross: number } {
    const g = Math.round(gross * 100) / 100;
    const net = Math.round((g / (1 + vatRate)) * 100) / 100;
    const tax = Math.round((g - net) * 100) / 100;
    return { net, tax, gross: g };
}

async function ensureOrdersPickupColumns(connection: any): Promise<void> {
    try {
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP NULL`);
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255) NULL`);
    } catch {
        /* ignore */
    }
}

async function validateCreateOrderPayload(connection: any, data: CreateOrderPayload): Promise<void> {
    if (data.orderType === 'dine_in' && data.tableId) {
        const [trows]: any = await connection.query(`SELECT id FROM tables WHERE id = ? LIMIT 1`, [data.tableId]);
        if (!Array.isArray(trows) || trows.length === 0) {
            throw new Error('TABLE_NOT_FOUND');
        }
    }

    const productIds = Array.from(
        new Set(
            (data.items || [])
                .map((x) => Math.floor(Number(x.productId)))
                .filter((n) => Number.isFinite(n) && n > 0)
        )
    );
    if (productIds.length > 0) {
        const [prows]: any = await connection.query(`SELECT id FROM products WHERE id = ANY(?::int[])`, [productIds]);
        const found = new Set<number>((Array.isArray(prows) ? prows : []).map((r: any) => Number(r.id)));
        const missing = productIds.filter((id) => !found.has(id));
        if (missing.length > 0) throw new Error('BAD_PRODUCT');
    }

    const variantIds = Array.from(
        new Set(
            (data.items || [])
                .map((x) => (x.variantId != null ? Math.floor(Number(x.variantId)) : null))
                .filter((n): n is number => n != null && Number.isFinite(n) && n > 0)
        )
    );
    if (variantIds.length > 0) {
        const [vrows]: any = await connection.query(
            `SELECT id, product_id FROM product_variants WHERE id = ANY(?::int[])`,
            [variantIds]
        );
        const byId = new Map<number, number>((Array.isArray(vrows) ? vrows : []).map((r: any) => [Number(r.id), Number(r.product_id)]));
        for (const it of data.items || []) {
            if (!it.variantId) continue;
            const vid = Math.floor(Number(it.variantId));
            const pid = Math.floor(Number(it.productId));
            const ownerPid = byId.get(vid);
            if (!ownerPid) throw new Error('BAD_VARIANT');
            if (Number.isFinite(pid) && pid > 0 && ownerPid !== pid) throw new Error('BAD_VARIANT');
        }
    }
}

async function ensureOrderCreateSchema(conn: any): Promise<void> {
    const stmts: string[] = [
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_redeem_points INT DEFAULT 0`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_arrival VARCHAR(20) DEFAULT 'cash'`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP NULL`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255) NULL`,
    ];
    for (const sql of stmts) {
        try {
            await conn.query(sql);
        } catch (e: any) {
            console.warn('ensureOrderCreateSchema:', e?.message || e);
        }
    }
    try {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS customer_point_history (
                id SERIAL PRIMARY KEY,
                customer_id INT NOT NULL,
                order_id INT,
                base_points INT NOT NULL,
                bonus_points INT DEFAULT 0,
                multiplier DECIMAL(3,2) DEFAULT 1.00,
                type VARCHAR(20) DEFAULT 'earn',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (e: any) {
        console.warn('ensureOrderCreateSchema customer_point_history:', e?.message || e);
    }
    try {
        await ensureStockRecipeSchema(conn);
    } catch (e: any) {
        console.warn('ensureStockRecipeSchema:', e?.message || e);
    }
}

/** Sipariş + kalemler + mutfak fişi (tek transaction içinde çağrılır) */
export async function createOrderCore(connection: any, data: CreateOrderPayload, req: Request): Promise<any> {
    // 🛡️ req.user her zaman authMiddleware tarafından set edilir, güvenli kullanım
    const userId = req.user?.userId ?? null;
    const userRole = req.user?.role ?? 'unknown';

    await validateCreateOrderPayload(connection, data);

    let grossTotal = 0;
    for (const item of data.items) {
        grossTotal += item.unitPrice * item.quantity;
    }

    let loyaltyRedeemPointsUsed = 0;
    const wantRedeem = Math.floor(Number(data.loyaltyPointsToRedeem ?? 0));
    if (wantRedeem > 0 && data.customerId) {
        if (grossTotal <= 0) {
            throw new Error('LOYALTY_ZERO_TOTAL');
        }
        const [crow]: any = await connection.query(`SELECT reward_points FROM customers WHERE id = ?`, [data.customerId]);
        const avail = Number(crow?.[0]?.reward_points ?? 0);
        if (wantRedeem > avail) {
            throw new Error('LOYALTY_POINTS_INSUFFICIENT');
        }
        const maxDiscount = wantRedeem / 10;
        const discount = Math.min(grossTotal, maxDiscount);
        if (discount <= 0) {
            loyaltyRedeemPointsUsed = 0;
        } else {
            loyaltyRedeemPointsUsed = Math.min(wantRedeem, Math.ceil(discount * 10 - 1e-9));
            grossTotal = Math.round((grossTotal - discount) * 100) / 100;
        }
    } else if (wantRedeem > 0 && !data.customerId) {
        throw new Error('LOYALTY_CUSTOMER_REQUIRED');
    }

    const vat = await resolveDefaultVatRateDecimal(connection, req.branchId ?? null);
    const { net: netSubtotal, tax: taxAmount, gross: totalAmount } = grossToNetAndTax(grossTotal, vat);

    let actualSessionId = data.sessionId || null;

    // Offline / Sync grouping: tableId provided but no sessionId?
    // Handle table session lookup or creation via tableId + clientSessionId
    if (!actualSessionId && data.tableId && data.orderType === 'dine_in') {
        const [existing]: any = await connection.query(
            `SELECT ts.id FROM table_sessions ts
             JOIN tables t ON t.id = ts.table_id AND t.current_session_id = ts.id
             WHERE ts.table_id = ? AND ts.status = 'active'
             LIMIT 1`,
            [data.tableId]
        );
        if (existing.length > 0) {
            actualSessionId = existing[0].id;
        } else {
            // No active session in cloud? Create one (happens during offline-sync)
            const [ns]: any = await connection.query(
                `INSERT INTO table_sessions (table_id, customer_id, waiter_id, client_session_id)
                 VALUES (?, ?, ?, ?)`,
                [data.tableId, data.customerId || null, userId, data.clientSessionId || null]
            );
            actualSessionId = ns.insertId;
            await connection.query('UPDATE tables SET current_session_id = ?, status = \'occupied\' WHERE id = ?', [actualSessionId, data.tableId]);
        }
    }

    const [orderResult]: any = await connection.query(
        `INSERT INTO orders (session_id, table_id, customer_id, customer_name, waiter_id, cashier_id,
            order_type, source, subtotal, tax_amount, total_amount, is_urgent, notes,
            delivery_address, delivery_phone, branch_id, courier_id, payment_method_arrival, loyalty_redeem_points)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            actualSessionId,
            data.tableId || null,
            data.customerId || null,
            data.customerName || null,
            userRole === 'waiter' ? userId : null,
            userRole === 'cashier' || userRole === 'admin'
                ? userId
                : null,
            data.orderType,
            data.source,
            netSubtotal,
            taxAmount,
            totalAmount,
            data.isUrgent,
            data.notes || null,
            data.deliveryAddress || null,
            data.deliveryPhone || null,
            req.branchId || null,
            data.orderType === 'delivery' && data.courierId ? data.courierId : null,
            data.orderType === 'dine_in' ? null : (data.paymentMethodArrival || 'cash'),
            loyaltyRedeemPointsUsed,
        ]
    );

    const newOrderId = orderResult.insertId;

    if (loyaltyRedeemPointsUsed > 0 && data.customerId) {
        await connection.query(`UPDATE customers SET reward_points = GREATEST(0, reward_points - ?) WHERE id = ?`, [
            loyaltyRedeemPointsUsed,
            data.customerId,
        ]);
        await connection.query(
            `INSERT INTO customer_point_history (customer_id, order_id, base_points, bonus_points, multiplier, type)
             VALUES (?, ?, ?, 0, 1.00, 'redeem')`,
            [data.customerId, newOrderId, loyaltyRedeemPointsUsed]
        );
    }

    for (const item of data.items) {
        await connection.query(
            `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price, modifiers, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newOrderId,
                item.productId,
                item.variantId || null,
                item.quantity,
                item.unitPrice,
                item.unitPrice * item.quantity,
                JSON.stringify(item.modifiers || []),
                item.notes || null,
            ]
        );
    }

    await applyOrderRecipeDeduction(
        connection,
        newOrderId,
        data.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            variantId: it.variantId ?? null,
        })),
        userId
    );

    await buildKitchenTicketsForOrder(connection, newOrderId);

    // Mutfak ekranı için anlık uyarı
    const io = req.app.get('io');
    const tenantId = req.tenantId;
    if (io && tenantId) {
        io.to(`tenant:${tenantId}`).emit('kitchen:ticket_created', { orderId: newOrderId });
    }

    const [finalOrder]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [newOrderId]);
    return finalOrder[0];
}

export const checkoutOrderSchema = createOrderSchema.extend({
    payment: z.object({
        method: z.enum(['cash', 'card', 'online', 'voucher', 'split']),
        tipAmount: z.number().min(0).default(0),
        receivedAmount: z.number().optional(),
    }),
    /** Masa kapatma sırasında bekleyen diğer tüm siparişleri de bu ödemeye dahil et */
    isFullCheckout: z.boolean().default(true),
});

export async function runTenantCreateOrder(tenantId: string, data: CreateOrderPayload, req: Request) {
    if (data.orderType === 'takeaway' && !data.deliveryPhone && data.source !== 'cashier') {
        throw new Error('TAKEAWAY_PHONE_REQUIRED');
    }
    await withTenant(tenantId, async (c) => ensureOrderCreateSchema(c));
    return withTenantTransaction(tenantId, (c) => createOrderCore(c, data, req));
}

export async function runTenantCheckout(
    tenantId: string,
    data: z.infer<typeof checkoutOrderSchema>,
    req: Request
) {
    const { payment: pay, isFullCheckout, ...orderFields } = data;
    if (data.orderType === 'takeaway' && !data.deliveryPhone && data.source !== 'cashier') {
        throw new Error('TAKEAWAY_PHONE_REQUIRED');
    }
    await withTenant(tenantId, async (c) => ensureOrderCreateSchema(c));
    return withTenantTransaction(tenantId, async (connection) => {
        const order = await createOrderCore(connection, orderFields as CreateOrderPayload, req);
        const sid = order.session_id;

        let amount = parseFloat(String(order.total_amount ?? 0));
        
        // Eğer isFullCheckout=true ve masa/oturum varsa, diğer ödenmemiş siparişleri de topla
        if (isFullCheckout && sid) {
             const [others]: any = await connection.query(
                 `SELECT SUM(total_amount) as total FROM orders 
                  WHERE session_id = ? AND id != ? AND status NOT IN ('completed', 'cancelled')`,
                 [sid, order.id]
             );
             const otherTotal = parseFloat(String(others?.[0]?.total ?? 0));
             amount += otherTotal;

             // Diğer tüm siparişleri completed yap (ayrıca ödeme kaydı eklemiyoruz, toplu ödeme olacak)
             await connection.query(
                 `UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP 
                  WHERE session_id = ? AND id != ? AND status NOT IN ('completed', 'cancelled')`,
                 [sid, order.id]
             );
        }

        if (!(amount > 0)) {
            throw new Error('CHECKOUT_ZERO_TOTAL');
        }

        const changeAmount =
            pay.method === 'cash' && pay.receivedAmount != null ? pay.receivedAmount - amount : 0;

        const cashierId = req.user?.userId ?? null;

        const [paymentResult]: any = await connection.query(
            `INSERT INTO payments (order_id, session_id, amount, method, tip_amount,
                change_amount, received_amount, reference, cashier_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                order.id,
                sid || null,
                amount,
                pay.method,
                pay.tipAmount ?? 0,
                changeAmount,
                pay.method === 'cash' && pay.receivedAmount != null ? pay.receivedAmount : null,
                null,
                cashierId,
                null,
            ]
        );

        const paymentId = paymentResult.insertId;

        // 🔥 SADAKAT PUANI KAZANDIR
        if (order.customer_id) {
            await rewardLoyaltyPoints(connection, order.customer_id, order.total_amount, order.id);
        }

        if (order.order_type === 'dine_in' && order.session_id) {
            // Tam ödeme yapıldığı için seansı ve masayı kapat
            await connection.query(
                `UPDATE table_sessions SET status = 'paid', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [order.session_id]
            );
            await connection.query(
                `UPDATE tables SET status = 'available', current_session_id = NULL WHERE id = ?`,
                [order.table_id]
            );
        }

        const [orderRows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [order.id]);
        const [payRows]: any = await connection.query('SELECT * FROM payments WHERE id = ?', [paymentResult.insertId]);

        // 📡 Bayi Bildirimi (Arka planda çalışabilir)
        const io = req.app.get('io');
        if (io) {
            void notifyResellerOfSale(io, tenantId, {
                tenantId,
                orderId: order.id,
                amount,
                orderType: order.order_type,
                timestamp: new Date().toISOString()
            });
        }

        return {
            order: orderRows[0],
            payment: payRows[0],
            paymentStatus: 'paid' as const,
            sessionClosed: order.order_type === 'dine_in' && order.session_id != null
        };
    });
}

/** Teslimat kuyruğu (deliveryQueue) ve kurye ataması — bu roller kullanabilir */
const DELIVERY_QUEUE_ROLES = new Set(['courier', 'admin', 'cashier']);

export const getOrdersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { status, tableId, orderType, deliveryQueue, source, limit = '50', offset = '0' } =
            req.query;

        if (deliveryQueue === '1' || deliveryQueue === 'true') {
            const role = req.user?.role;
            if (!role || !DELIVERY_QUEUE_ROLES.has(role)) {
                return res.status(403).json({ error: 'Teslimat kuyruğu için yetkiniz yok' });
            }
        }
        const orders = await withTenant(tenantId, async (connection) => {
            // 🛡️ Self-healing: Ensure customer_name exists (Phase 10 migration)
            try {
                await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)`);
            } catch (err) {
                // Silently continue if column already exists or other error
            }

            let query = `
                SELECT o.*,
                       t.name as table_name,
                       u.name as waiter_name,
                       cu.name as courier_name,
                       COALESCE(o.customer_name, cust.name) as customer_name
                FROM orders o
                LEFT JOIN tables t ON o.table_id = t.id
                LEFT JOIN users u ON o.waiter_id = u.id
                LEFT JOIN users cu ON o.courier_id = cu.id
                LEFT JOIN customers cust ON o.customer_id = cust.id
                WHERE 1=1
            `;
            const params: any[] = [];

            if (status) {
                params.push(status);
                query += ` AND o.status = ?`;
            }

            /** Hazır sipariş listesi: rol bazlı (teslim merkezi / kurye / garson) */
            if (status === 'ready' && req.user?.role) {
                const r = req.user.role;
                if (r === 'courier') {
                    query += ` AND o.order_type = 'delivery'`;
                } else if (r === 'waiter') {
                    /** Sadece bu garsonun oturumu / masası: önce sipariş session_id, yoksa masa current_session */
                    query += ` AND o.order_type = 'dine_in'`;
                    const wid = Number(req.user?.userId);
                    if (Number.isFinite(wid)) {
                        query += ` AND (
                            EXISTS (
                                SELECT 1 FROM table_sessions ts
                                WHERE ts.id = o.session_id AND ts.waiter_id = ?
                                  AND ts.status::text IN ('active', 'bill_requested')
                            )
                            OR (
                                o.table_id IS NOT NULL AND EXISTS (
                                    SELECT 1 FROM tables tb
                                    INNER JOIN table_sessions ts2 ON ts2.id = tb.current_session_id
                                    WHERE tb.id = o.table_id AND ts2.waiter_id = ?
                                    AND ts2.status::text IN ('active', 'bill_requested')
                                )
                            )
                        )`;
                        params.push(wid, wid);
                    }
                }
            }

            if (tableId) {
                params.push(Number(tableId));
                query += ` AND o.table_id = ?`;
            }

            if (orderType && String(orderType).trim() !== '') {
                params.push(String(orderType).trim());
                query += ` AND o.order_type = ?`;
            }

            if (source && String(source).trim() !== '') {
                params.push(String(source).trim());
                query += ` AND o.source = ?`;
            }

            if (deliveryQueue === '1' || deliveryQueue === 'true') {
                const uid = Number(req.user?.userId);
                if (!Number.isFinite(uid)) {
                    throw new Error('NO_USER');
                }
                params.push(uid);
                // Kurye paneli: sadece paket servisi (delivery). Kasiyer/admin: ayrıca hazır gel-al (takeaway) kuyruğu.
                if (req.user?.role === 'courier') {
                    query += ` AND (
                        o.order_type = 'delivery'
                        AND o.status NOT IN ('completed', 'cancelled')
                        AND (o.courier_id IS NULL OR o.courier_id = ?)
                    )`;
                } else {
                    query += ` AND (
                        (o.order_type = 'delivery' AND o.status NOT IN ('completed', 'cancelled') AND (o.courier_id IS NULL OR o.courier_id = ?))
                        OR
                        (o.order_type = 'takeaway' AND o.status = 'ready')
                    )`;
                }
            }

            if (req.branchId) {
                params.push(req.branchId);
                query += ` AND o.branch_id = ?`;
            }

            // MySQL Limit/Offset
            query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
            params.push(Number(limit));
            params.push(Number(offset));

            const [rows]: any = await connection.query(query, params);

            // Fetch items for each order (MySQL-compatible)
            for (const row of rows) {
                const [itemRows]: any = await connection.query(
                    `SELECT oi.id, oi.product_id, oi.variant_id, p.name as product_name, pv.name as variant_name,
                            oi.quantity, oi.unit_price, oi.total_price, oi.status,
                            oi.modifiers, oi.notes
                     FROM order_items oi
                     LEFT JOIN products p ON oi.product_id = p.id
                     LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                     WHERE oi.order_id = ?`,
                    [row.id]
                );
                row.items = itemRows || [];
            }

            return rows;
        });

        res.json(orders);
    } catch (error: any) {
        if (error.message === 'NO_USER') {
            return res.status(401).json({ error: 'Kullanıcı bilgisi gerekli' });
        }
        console.error('❌ Siparişler hatası:', error);
        res.status(500).json({ error: 'Siparişler yüklenemedi' });
    }
};

const assignCourierSchema = z.object({
    action: z.enum(['claim', 'release']),
});

/** Paket siparişinde kurye atama / bırakma */
/** Kasiyerin kurye ataması (Kuryeye Teslim Et butonu) */
export const assignCourierDirectHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const { courierId } = req.body;

        if (!courierId) {
            return res.status(400).json({ error: 'Kurye seçilmesi zorunludur' });
        }

        const order = await withTenantTransaction(tenantId, async (connection) => {
            const [rows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            if (!rows?.length) throw new Error('NOT_FOUND');
            
            await connection.query(
                `UPDATE orders SET courier_id = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [courierId, orderId]
            );

            // 2. Deliveries tablosunu senkronize et (Yoksa olustur, varsa guncelle)
            const [delRows]: any = await connection.query('SELECT id FROM deliveries WHERE order_id = ?', [orderId]);
            
            if (delRows?.length > 0) {
                await connection.query(
                    `UPDATE deliveries SET courier_id = ?, status = 'assigned', assigned_at = CURRENT_TIMESTAMP 
                     WHERE order_id = ?`,
                    [courierId, orderId]
                );
            } else {
                // Siparis detaylarini alip yeni delivery kaydi acalim
                // customer_name sütunu mevcut DB'de eksik olabileceğinden insert'ten çıkarıldı
                await connection.query(
                    `INSERT INTO deliveries (order_id, courier_id, status, address, phone, assigned_at)
                     SELECT o.id, ?, 'assigned', o.delivery_address, o.delivery_phone, CURRENT_TIMESTAMP
                     FROM orders o WHERE o.id = ?`,
                    [courierId, orderId]
                );
            }

            const [upd]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            return upd[0];
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:courier_assigned', { 
                orderId, 
                courierId: order.courier_id,
                customerName: order.customer_name
            });
            io.to(`tenant:${tenantId}`).emit('order:status_changed', { orderId, courierId: order.courier_id });
        }

        res.json({ message: 'Kurye başarıyla atandı', order });
    } catch (error: any) {
        console.error('❌ Direct Courier Assignment Error:', error);
        res.status(500).json({ error: 'Kurye atanamadı' });
    }
};

/** Kuryenin paketi 'Teslim Aldım' diyerek yola çıkarması */
export const courierPickupHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const uid = Number(req.user?.userId);

        if (!uid) {
            return res.status(401).json({ error: 'Oturum gerekli' });
        }

        const order = await withTenantTransaction(tenantId, async (connection) => {
            // 1. Siparişi kontrol et (hazır mı ve kurye boş mu veya bende mi?)
            const [orderRows]: any = await connection.query(
                'SELECT * FROM orders WHERE id = ?',
                [orderId]
            );

            if (!orderRows?.length) throw new Error('Sipariş bulunamadı');
            const o = orderRows[0];

            if (o.status !== 'ready') throw new Error(`Sipariş durumu uygun değil: ${o.status}`);
            if (o.order_type !== 'delivery') throw new Error('Sadece paket servis siparişleri teslim alınabilir');
            if (o.courier_id && o.courier_id !== uid) throw new Error('Bu sipariş zaten başka bir kuryeye atanmış');

            // 2. Orders tablosunu guncelle (Kurye bende değilse ata + durumu 'shipped' yap)
            const [orderResult]: any = await connection.query(
                `UPDATE orders SET status = 'shipped', courier_id = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND (courier_id = ? OR courier_id IS NULL) AND status = 'ready'`,
                [uid, orderId, uid]
            );

            if (orderResult.affectedRows === 0) throw new Error('Sipariş durumu son anda değişti, lütfen listeyi yenileyin');
            
            // 3. Deliveries tablosunu senkronize et (Yoksa oluştur, varsa güncelle)
            const [delRows]: any = await connection.query('SELECT id FROM deliveries WHERE order_id = ?', [orderId]);
            if (delRows?.length > 0) {
                await connection.query(
                    `UPDATE deliveries SET courier_id = ?, status = 'on_the_way', picked_at = CURRENT_TIMESTAMP 
                     WHERE order_id = ?`,
                    [uid, orderId]
                );
            } else {
                // customer_name sütunu mevcut DB'de eksik olabileceğinden insert'ten çıkarıldı
                await connection.query(
                    `INSERT INTO deliveries (order_id, courier_id, status, address, phone, assigned_at, picked_at)
                     SELECT o.id, ?, 'on_the_way', o.delivery_address, o.delivery_phone, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                     FROM orders o WHERE o.id = ?`,
                    [uid, orderId]
                );
            }

            const [upd]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            return upd[0];
        });

        const io = req.app.get('io');
        if (io) {
            io.to(tenantId).emit('order:status_changed', { orderId, status: 'shipped', courierId: uid });
            io.to(tenantId).emit('order:courier_assigned', { orderId, courierId: uid });
        }

        res.json({ success: true, message: 'Paket yola çıktı (Status: Shipped)', order });
    } catch (error: any) {
        console.error('courierPickupHandler Error:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
};

export const assignCourierHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const data = assignCourierSchema.parse(req.body);
        const uid = Number(req.user?.userId);
        if (!Number.isFinite(uid)) {
            return res.status(401).json({ error: 'Oturum gerekli' });
        }

        const order = await withTenantTransaction(tenantId, async (connection) => {
            const [rows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            if (!rows?.length) {
                throw new Error('NOT_FOUND');
            }
            const o = rows[0];
            if (String(o.order_type) !== 'delivery') {
                throw new Error('NOT_DELIVERY');
            }

            if (data.action === 'claim') {
                const [r]: any = await connection.query(
                    `UPDATE orders SET courier_id = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND order_type = 'delivery' AND courier_id IS NULL`,
                    [uid, orderId]
                );
                if (r.affectedRows === 0) {
                    throw new Error('CLAIM_FAILED');
                }
            } else {
                const [r]: any = await connection.query(
                    `UPDATE orders SET courier_id = NULL, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND order_type = 'delivery' AND courier_id = ?`,
                    [orderId, uid]
                );
                if (r.affectedRows === 0) {
                    throw new Error('RELEASE_FAILED');
                }
            }

            const [upd]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            return upd[0];
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:courier_updated', { orderId, courierId: order.courier_id });
        }

        res.json({ message: 'Kurye ataması güncellendi', order });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }
        if (error.message === 'NOT_DELIVERY') {
            return res.status(400).json({ error: 'Sadece paket (delivery) siparişlerinde geçerli' });
        }
        if (error.message === 'CLAIM_FAILED') {
            return res.status(409).json({ error: 'Sipariş başka kuryede veya zaten atanmış' });
        }
        if (error.message === 'RELEASE_FAILED') {
            return res.status(403).json({ error: 'Bu siparişi bırakamazsınız' });
        }
        console.error('❌ Kurye atama hatası:', error);
        res.status(500).json({ error: 'Kurye ataması güncellenemedi' });
    }
};

export const createOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createOrderSchema.parse(req.body);

        if (data.orderType === 'takeaway' && !data.deliveryPhone && data.source !== 'cashier') {
            return res.status(400).json({ error: 'Gel-Al (Takeaway) siparişlerinde telefon numarası zorunludur.' });
        }

        const order = await runTenantCreateOrder(tenantId, data, req);

        const io = req.app.get('io');
        if (io) {
            let billing: { maxPrinters: number; maxDevices: number } | undefined;
            try {
                const [mp, md] = await Promise.all([
                    getEffectiveMaxPrinters(tenantId),
                    getEffectiveMaxDevices(tenantId),
                ]);
                billing = { maxPrinters: mp.total, maxDevices: md.total };
            } catch {
                /* ignore */
            }
            io.to(`tenant:${tenantId}`).emit('order:new', {
                orderId: order.id,
                tableId: data.tableId,
                orderType: data.orderType,
                ...(billing ? { billingLimits: billing } : {}),
            });
        }

        res.status(201).json(order);
        try {
            await withTenant(tenantId, async (c) => {
                await FiscalService.signOrder(c, Number(order.id));
            });
        } catch (e: any) {
            console.warn('⚠️ Fiscal signOrder post-commit skipped:', e?.message || e);
        }
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error instanceof TenantError || error?.name === 'TenantError') {
            const code = String(error?.code || 'TENANT_ERROR');
            const message = String(error?.message || 'Tenant hatası');
            const status =
                code === 'TENANT_SUSPENDED' || code === 'LICENSE_EXPIRED' ? 402 :
                code === 'TENANT_INACTIVE' || code === 'TENANT_NOT_FOUND' ? 403 :
                400;
            return res.status(status).json({ error: message, code });
        }
        if (error.message === 'TAKEAWAY_PHONE_REQUIRED') {
            return res.status(400).json({ error: 'Gel-Al (Takeaway) siparişlerinde telefon numarası zorunludur.' });
        }
        if (error.message === 'LOYALTY_POINTS_INSUFFICIENT') {
            return res.status(400).json({ error: 'Yetersiz sadakat puanı', code: 'LOYALTY_POINTS_INSUFFICIENT' });
        }
        if (error.message === 'LOYALTY_CUSTOMER_REQUIRED') {
            return res.status(400).json({ error: 'Puan kullanımı için müşteri seçin', code: 'LOYALTY_CUSTOMER_REQUIRED' });
        }
        if (error.message === 'LOYALTY_ZERO_TOTAL') {
            return res.status(400).json({ error: 'Sepet tutarı puan kullanımı için yetersiz', code: 'LOYALTY_ZERO_TOTAL' });
        }
        if (error instanceof InsufficientStockError) {
            return res.status(400).json({
                error: 'Reçete için yetersiz stok',
                code: 'INSUFFICIENT_STOCK',
                detail: error.payload,
            });
        }
        if (error.message === 'TABLE_NOT_FOUND') {
            return res.status(404).json({ error: 'Masa bulunamadı', code: 'TABLE_NOT_FOUND' });
        }
        if (error.message === 'BAD_PRODUCT') {
            return res.status(400).json({ error: 'Ürün bulunamadı veya pasif', code: 'BAD_PRODUCT' });
        }
        if (error.message === 'BAD_VARIANT') {
            return res.status(400).json({ error: 'Ürün seçeneği (varyant) geçersiz', code: 'BAD_VARIANT' });
        }
        console.error('❌ Sipariş oluşturma hatası:', error);
        res.status(500).json({
            error: 'Sipariş oluşturulamadı',
            detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
        });
    }
};

/** Sipariş + mutfak fişi + tam ödeme — tek transaction (yetim sipariş yok) */
export const createCheckoutOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = checkoutOrderSchema.parse(req.body);

        if (data.orderType === 'takeaway' && !data.deliveryPhone && data.source !== 'cashier') {
            return res.status(400).json({ error: 'Gel-Al (Takeaway) siparişlerinde telefon numarası zorunludur.' });
        }

        const payload = await runTenantCheckout(tenantId, data, req);

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:new', {
                orderId: payload.order.id,
                tableId: data.tableId,
                orderType: data.orderType,
            });
            io.to(`tenant:${tenantId}`).emit('payment:received', {
                orderId: payload.order.id,
                paymentStatus: payload.paymentStatus,
            });
        }

        res.status(201).json(payload);
        try {
            const orderId = Number(payload?.order?.id);
            const paymentId = Number(payload?.payment?.id);
            await withTenant(tenantId, async (c) => {
                if (Number.isFinite(orderId) && orderId > 0) {
                    await FiscalService.signOrder(c, orderId);
                }
                if (Number.isFinite(paymentId) && paymentId > 0) {
                    await FiscalService.signPayment(c, paymentId);
                }
            });
        } catch (e: any) {
            console.warn('⚠️ Fiscal signing post-commit skipped:', e?.message || e);
        }
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'CHECKOUT_ZERO_TOTAL') {
            return res.status(400).json({ error: 'Ödeme için sipariş tutarı sıfırdan büyük olmalı' });
        }
        if (error.message === 'TAKEAWAY_PHONE_REQUIRED') {
            return res.status(400).json({ error: 'Gel-Al (Takeaway) siparişlerinde telefon numarası zorunludur.' });
        }
        if (error instanceof InsufficientStockError) {
            return res.status(400).json({
                error: 'Reçete için yetersiz stok',
                code: 'INSUFFICIENT_STOCK',
                detail: error.payload,
            });
        }
        console.error('❌ Checkout hatası:', error);
        res.status(500).json({ error: 'Ödemeli sipariş oluşturulamadı', details: error?.message || String(error) });
    }
};

const payReadyTakeawayBody = z.object({
    payment: z.object({
        method: z.enum(['cash', 'card', 'online', 'voucher', 'split']),
        tipAmount: z.number().min(0).default(0),
        receivedAmount: z.number().optional(),
    }),
});

/**
 * Kasadan gel-al / web: mutfaktan hazır gelmiş mevcut siparişin ödemesi (yeni sipariş oluşturmaz).
 */
export const payReadyTakeawayOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const data = payReadyTakeawayBody.parse(req.body);

        const result = await withTenantTransaction(tenantId, async (connection) => {
            const [orderRows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            if (!orderRows?.length) throw new Error('NOT_FOUND');
            const order = orderRows[0];

            const ot = String(order.order_type || '');
            if (!['takeaway', 'web'].includes(ot)) {
                throw new Error('INVALID_ORDER_TYPE');
            }
            if (String(order.payment_status) === 'paid') {
                throw new Error('ALREADY_PAID');
            }
            if (String(order.status) !== 'ready') {
                throw new Error('ORDER_NOT_READY');
            }

            const amount = parseFloat(String(order.total_amount ?? 0));
            if (!(amount > 0)) throw new Error('ZERO_AMOUNT');

            const pay = data.payment;
            const changeAmount =
                pay.method === 'cash' && pay.receivedAmount != null ? pay.receivedAmount - amount : 0;

            const cashierId = req.user?.userId ?? null;

            const [paymentResult]: any = await connection.query(
                `INSERT INTO payments (order_id, session_id, amount, method, tip_amount,
                    change_amount, received_amount, reference, cashier_id, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    order.id,
                    order.session_id || null,
                    amount,
                    pay.method,
                    pay.tipAmount ?? 0,
                    changeAmount,
                    pay.method === 'cash' && pay.receivedAmount != null ? pay.receivedAmount : null,
                    null,
                    cashierId,
                    'Gel-al mevcut sipariş ödemesi',
                ]
            );
            const paymentId = paymentResult.insertId;

            await FiscalService.signOrder(connection, order.id);
            await FiscalService.signPayment(connection, paymentId);

            await connection.query(
                `UPDATE orders SET payment_status = 'paid', status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [orderId]
            );

            // 🔥 SADAKAT PUANI KAZANDIR
            if (order.customer_id) {
                await rewardLoyaltyPoints(connection, order.customer_id, order.total_amount, order.id);
            }

            await connection.query(
                `UPDATE kitchen_tickets SET status = 'completed' WHERE order_id = ? AND status NOT IN ('completed', 'cancelled')`,
                [orderId]
            );

            const [updated]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            return { order: updated[0], paymentId };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('payment:received', {
                orderId,
                paymentStatus: 'paid',
            });
            io.to(`tenant:${tenantId}`).emit('order:status_changed', {
                orderId,
                status: 'completed',
            });
            void notifyResellerOfSale(io, tenantId, {
                tenantId,
                orderId,
                amount: parseFloat(String(result.order?.total_amount ?? 0)),
                orderType: String(result.order?.order_type ?? ''),
                timestamp: new Date().toISOString(),
            });
        }

        res.json({ success: true, order: result.order, paymentStatus: 'paid' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Sipariş bulunamadı' });
        if (error.message === 'INVALID_ORDER_TYPE') {
            return res.status(400).json({ error: 'Bu ödeme sadece gel-al / web siparişleri içindir' });
        }
        if (error.message === 'ALREADY_PAID') return res.status(400).json({ error: 'Sipariş zaten ödenmiş' });
        if (error.message === 'ORDER_NOT_READY') {
            return res.status(400).json({ error: 'Sipariş hazır değil veya ödeme için uygun değil' });
        }
        if (error.message === 'ZERO_AMOUNT') return res.status(400).json({ error: 'Sipariş tutarı geçersiz' });
        console.error('❌ Gel-al mevcut ödeme hatası:', error);
        res.status(500).json({ error: 'Ödeme kaydedilemedi', details: error?.message || String(error) });
    }
};

export const updateOrderStatusHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const { status, pinCode } = req.body;

        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Geçersiz sipariş durumu' });
        }

        const result = await withTenantTransaction(tenantId, async (connection) => {
            const [orderRows]: any = await connection.query(
                'SELECT * FROM orders WHERE id = ?',
                [orderId]
            );

            if (orderRows.length === 0) {
                throw new Error('NOT_FOUND');
            }

            const order = orderRows[0];

            await connection.query(`CREATE TABLE IF NOT EXISTS z_business_day_locks (
                business_date DATE NOT NULL,
                branch_id INTEGER NOT NULL DEFAULT 1,
                locked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                locked_by INTEGER,
                PRIMARY KEY (business_date, branch_id)
            )`);
            const branchForLock = Number(order.branch_id ?? req.branchId ?? 1);
            const bizDate =
                order.created_at != null
                    ? String(order.created_at).slice(0, 10)
                    : new Date().toISOString().slice(0, 10);
            const [lck]: any = await connection.query(
                `SELECT 1 FROM z_business_day_locks WHERE business_date = ?::date AND branch_id = ? LIMIT 1`,
                [bizDate, branchForLock]
            );
            if (Array.isArray(lck) && lck.length > 0) {
                throw new Error('BUSINESS_DAY_LOCKED');
            }

            if (status === 'cancelled' && ['preparing', 'ready'].includes(order.status)) {
                if (!pinCode) {
                    throw new Error('PIN_REQUIRED');
                }
                const [pinRows]: any = await connection.query(
                    `SELECT role FROM users WHERE pin_code = ? AND role IN ('admin', 'kitchen', 'cashier') AND status = 'active'`,
                    [pinCode]
                );
                if (pinRows.length === 0) {
                    throw new Error('INVALID_PIN');
                }
            }

            // 🛡️ Self-healing: Ensure columns exist
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_settled BOOLEAN DEFAULT FALSE`);
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0`);
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP NULL`);
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255) NULL`);

            const updates: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
            const values: any[] = [status];

            // Traceability: Log who picked up the order
            if (status === 'shipped' || (status === 'completed' && req.user?.role === 'waiter')) {
                updates.push('picked_up_at = CURRENT_TIMESTAMP');
                updates.push('picked_up_by = ?');
                values.push(String(req.user?.userId));
            }

            if (req.body.payment_status) {
                updates.push('payment_status = ?');
                values.push(req.body.payment_status);
            }
            if (req.body.courier_settled !== undefined) {
                updates.push('courier_settled = ?');
                values.push(req.body.courier_settled);
            }
            if (req.body.tip_amount !== undefined) {
                updates.push('tip_amount = ?');
                values.push(req.body.tip_amount);
            }
            if (req.body.payment_method_arrival) {
                updates.push('payment_method_arrival = ?');
                values.push(req.body.payment_method_arrival);
            }

            values.push(orderId);

            await connection.query(
                `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
                values
            );

            // Teslimat tablosunu senkronize et
            if (status === 'completed') {
                await connection.query(
                    `UPDATE deliveries SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP 
                     WHERE order_id = ?`,
                    [orderId]
                );
            }

            if (status === 'cancelled') {
                if (String(order.status) !== 'completed') {
                    await reverseOrderRecipeDeduction(connection, orderId, req.user?.userId ?? null);
                }
                await connection.query(
                    `UPDATE kitchen_tickets SET status = 'cancelled'
                     WHERE order_id = ? AND status NOT IN ('completed', 'cancelled')`,
                    [orderId]
                );
                // Iptal durumunda teslimati da iptal et
                await connection.query(
                    `UPDATE deliveries SET status = 'cancelled' WHERE order_id = ?`,
                    [orderId]
                );
                // 🔥 İPTAL: Puanları geri al
                if (order.customer_id && order.total_amount > 0) {
                    await reverseLoyaltyPoints(connection, order.customer_id, order.total_amount, orderId);
                }
                const redeemBack = Number(order.loyalty_redeem_points ?? 0);
                if (redeemBack > 0 && order.customer_id) {
                    await connection.query(`UPDATE customers SET reward_points = reward_points + ? WHERE id = ?`, [
                        redeemBack,
                        order.customer_id,
                    ]);
                }
            }

            return { ...order, status };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:status_changed', {
                orderId,
                status,
                waiterId: result.waiter_id,
                tableName: result.table_name || result.id
            });

            if (status === 'ready') {
                io.to(`tenant:${tenantId}`).emit('order:ready', {
                    orderId,
                    orderType: result.order_type,
                    customerName: result.customer_name,
                    tableName: result.table_name || result.id
                });
            }
        }

        // WhatsApp otomasyon: online/whatsapp kaynak siparişlerde durum güncelleme mesajı
        if (['confirmed', 'preparing', 'ready', 'shipped', 'completed', 'cancelled'].includes(status)) {
            const source = String((result as any).source || '').toLowerCase();
            const phone = String((result as any).delivery_phone || '').trim();
            const shouldNotifyBySource = ['whatsapp', 'qr_portal', 'web', 'phone'].includes(source);
            if (phone && shouldNotifyBySource) {
                void (async () => {
                    try {
                        await withTenant(tenantId, async (connection) => {
                            const [branchRows]: any = await connection.query(
                                `SELECT settings FROM branches WHERE id = ? LIMIT 1`,
                                [result.branch_id || 1]
                            );
                            const branchSettings = branchRows?.[0]?.settings || {};
                            const integrations = branchSettings?.integrations || {};
                            if (!integrations?.whatsapp?.enabled) return;
                            if (integrations?.whatsapp?.sendStatusUpdates === false) return;
                            await WhatsAppService.sendOrderStatusMessage({
                                tenantId,
                                order: {
                                    id: Number(orderId),
                                    type: String((result as any).order_type || ''),
                                    phone,
                                    status: String(status),
                                    name: (result as any).customer_name || undefined,
                                },
                                settings: integrations,
                            });
                        });
                    } catch (waErr) {
                        console.error('[WhatsApp Status Notification Error]', waErr);
                    }
                })();
            }
        }

        res.json({ message: 'Sipariş durumu güncellendi', order: result });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }
        if (error.message === 'PIN_REQUIRED') {
            return res.status(403).json({ error: 'İptal için Admin/Şef PIN kodu gerekli', code: 'PIN_REQUIRED' });
        }
        if (error.message === 'INVALID_PIN') {
            return res.status(403).json({ error: 'Geçersiz PIN kodu', code: 'INVALID_PIN' });
        }
        if (error.message === 'BUSINESS_DAY_LOCKED') {
            return res.status(409).json({
                error: 'Bu iş günü kilitli; sipariş değiştirilemez.',
                code: 'BUSINESS_DAY_LOCKED',
            });
        }
        console.error('❌ Sipariş güncelleme hatası:', error);
        res.status(500).json({ error: 'Sipariş güncellenemedi' });
    }
};

/** Garson veya kurye tarafından siparişin teslim alınması (Pickup) */
export const pickupOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const { pinCode } = req.body;
        const branchId = req.branchId || 1;

        const result = await withTenantTransaction(tenantId, async (connection) => {
            // 1. Ayarları kontrol et (PIN zorunlu mu?)
            const [branchRows]: any = await connection.query(
                'SELECT settings FROM branches WHERE id = ?',
                [branchId]
            );
            const settings = branchRows[0]?.settings || {};
            const requirePin = settings.pickupSecurity?.requirePIN || false;

            // 2. Siparişi bul
            const [orderRows]: any = await connection.query(
                `SELECT o.*, t.name as table_name 
                 FROM orders o 
                 LEFT JOIN tables t ON o.table_id = t.id
                 WHERE o.id = ?`,
                [orderId]
            );

            if (orderRows.length === 0) throw new Error('NOT_FOUND');
            const order = orderRows[0];

            const ot = String(order.order_type || '');
            if (
                (ot === 'takeaway' || ot === 'web') &&
                (req.user?.role === 'waiter' || req.user?.role === 'courier')
            ) {
                throw new Error('GEL_AL_PICKUP_FORBIDDEN');
            }

            if (order.status !== 'ready') {
                throw new Error('Sipariş hazır durumda değil (Ready değil).');
            }

            // 3. PIN Doğrulama
            let pickedUpBy = req.user?.userId;
            if (requirePin) {
                if (!pinCode) throw new Error('PIN_REQUIRED');
                const [userRows]: any = await connection.query(
                    `SELECT id, name, role FROM users 
                     WHERE pin_code = ? AND status = 'active' 
                     AND role IN ('admin', 'waiter', 'courier', 'cashier')`,
                    [pinCode]
                );
                if (userRows.length === 0) throw new Error('INVALID_PIN');
                pickedUpBy = userRows[0].id;
            }

            if (!pickedUpBy) throw new Error('Kullanıcı belirlenemedi.');

            // 4. Statü Belirle
            let nextStatus = 'shipped'; // default for delivery
            if (['dine_in', 'takeaway', 'qr_menu'].includes(order.order_type)) {
                nextStatus = 'served';
            }

            // 5. Güncelleme
            // Traceability: Log who picked up the order
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP NULL`);
            await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255) NULL`);

            await connection.query(
                `UPDATE orders SET 
                    status = ?, 
                    picked_up_at = CURRENT_TIMESTAMP, 
                    picked_up_by = ?,
                    updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [nextStatus, String(pickedUpBy), orderId]
            );

            // delivery ise teslimat tablosunu da güncelle
            if (order.order_type === 'delivery') {
                await connection.query(
                    `UPDATE deliveries SET 
                        courier_id = ?, 
                        status = 'on_the_way', 
                        picked_at = CURRENT_TIMESTAMP 
                     WHERE order_id = ?`,
                    [pickedUpBy, orderId]
                );
            }

            return { ...order, status: nextStatus, picked_up_by: pickedUpBy };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:status_changed', {
                orderId,
                status: result.status,
                pickedUpBy: result.picked_up_by
            });
            io.to(`tenant:${tenantId}`).emit('order:picked_up', {
                orderId,
                status: result.status,
                pickedUpBy: result.picked_up_by,
                tableName: result.table_name || result.id
            });
        }

        res.json({ success: true, message: 'Sipariş teslim alındı.', order: result });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Sipariş bulunamadı' });
        if (error.message === 'GEL_AL_PICKUP_FORBIDDEN') {
            return res.status(403).json({
                error: 'Gel-al teslimi yalnızca kasiyer veya yönetici tarafından yapılabilir',
                code: 'GEL_AL_PICKUP_FORBIDDEN',
            });
        }
        if (error.message === 'PIN_REQUIRED') return res.status(403).json({ error: 'PIN kodu gerekli', code: 'PIN_REQUIRED' });
        if (error.message === 'INVALID_PIN') return res.status(403).json({ error: 'Geçersiz PIN kodu', code: 'INVALID_PIN' });
        res.status(400).json({ error: error.message });
    }
};

const approveQrExtrasSchema = z.object({
    guestName: z.string().max(120).optional(),
    allergyNote: z.string().max(500).optional(),
});

/** QR müşteri siparişi — mutfağa düşür + onaylı */
export const approveQrOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);
        const extrasParsed = approveQrExtrasSchema.safeParse(
            req.body && typeof req.body === 'object' ? req.body : {}
        );
        const extras = extrasParsed.success ? extrasParsed.data : {};

        const orderAfter = await withTenantTransaction(tenantId, async (connection) => {
            const [rows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            if (!rows?.length) {
                throw new Error('NOT_FOUND');
            }
            const o = rows[0];
            if (String(o.source) !== 'customer_qr') {
                throw new Error('NOT_QR_ORDER');
            }
            if (String(o.status) !== 'pending') {
                throw new Error('NOT_PENDING');
            }
            const [kt]: any = await connection.query(
                'SELECT COUNT(*)::int AS c FROM kitchen_tickets WHERE order_id = ?',
                [orderId]
            );
            if (Number(kt?.[0]?.c ?? 0) > 0) {
                throw new Error('ALREADY_APPROVED');
            }

            const [sessRows]: any = await connection.query(
                `SELECT id FROM table_sessions
                 WHERE table_id = ? AND closed_at IS NULL
                 ORDER BY opened_at DESC LIMIT 1`,
                [o.table_id]
            );
            const activeSessionId = sessRows?.[0]?.id != null ? Number(sessRows[0].id) : null;

            const addNoteParts: string[] = [];
            if (extras.guestName?.trim()) {
                addNoteParts.push(`Adisyon adı: ${extras.guestName.trim()}`);
            }
            if (extras.allergyNote?.trim()) {
                addNoteParts.push(`Alerji: ${extras.allergyNote.trim()}`);
            }
            const baseNotes = String(o.notes || '').trim();
            const mergedNotes =
                addNoteParts.length > 0
                    ? baseNotes
                        ? `${baseNotes} | ${addNoteParts.join(' | ')}`
                        : addNoteParts.join(' | ')
                    : baseNotes;

            const prevSid = o.session_id != null && Number(o.session_id) > 0 ? Number(o.session_id) : null;
            let nextSid = prevSid;
            if (prevSid == null && activeSessionId != null) {
                nextSid = activeSessionId;
            }
            const notesChanged = mergedNotes !== baseNotes;
            const sessionChanged = nextSid !== prevSid;
            if (sessionChanged || notesChanged) {
                await connection.query(
                    `UPDATE orders SET session_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [nextSid, mergedNotes || null, orderId]
                );
            }

            await buildKitchenTicketsForOrder(connection, orderId);
            
            const io = req.app.get('io');
            if (io) {
                io.to(`tenant:${tenantId}`).emit('kitchen:ticket_new', { orderId });
            }
            await connection.query(
                `UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [orderId]
            );
            const [upd]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            return upd[0];
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:new', {
                orderId,
                tableId: orderAfter.table_id,
                orderType: orderAfter.order_type,
            });
            io.to(`tenant:${tenantId}`).emit('order:status_changed', {
                orderId,
                status: 'confirmed',
                waiterId: orderAfter.waiter_id,
            });
            if (orderAfter.table_id) {
                io.to(`tenant:${tenantId}:table:${orderAfter.table_id}`).emit('customer:order_approved', {
                    tenantId,
                    orderId,
                    tableId: orderAfter.table_id,
                });
            }
        }

        res.json({ message: 'Sipariş onaylandı, mutfağa iletildi', order: orderAfter });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }
        if (error.message === 'NOT_QR_ORDER') {
            return res.status(400).json({ error: 'Bu sipariş QR müşteri talebi değil' });
        }
        if (error.message === 'NOT_PENDING') {
            return res.status(409).json({ error: 'Sipariş zaten işlendi' });
        }
        if (error.message === 'ALREADY_APPROVED') {
            return res.status(409).json({ error: 'Sipariş zaten mutfağa düşmüş' });
        }
        console.error('approveQrOrderHandler', error);
        res.status(500).json({ error: 'Onaylanamadı' });
    }
};

export const rejectQrOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.id);

        const meta = await withTenantTransaction(tenantId, async (connection) => {
            const [rows]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            if (!rows?.length) {
                throw new Error('NOT_FOUND');
            }
            const o = rows[0];
            if (String(o.source) !== 'customer_qr') {
                throw new Error('NOT_QR_ORDER');
            }
            if (String(o.status) !== 'pending') {
                throw new Error('NOT_PENDING');
            }
            // 🔥 İPTAL: Puanları geri al
            if (o.customer_id && o.total_amount > 0) {
                await reverseLoyaltyPoints(connection, o.customer_id, o.total_amount, orderId);
            }
            await reverseOrderRecipeDeduction(connection, orderId, req.user?.userId ?? null);
            await connection.query(
                `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [orderId]
            );
            return {
                tableId: o.table_id != null ? Number(o.table_id) : null,
                waiterId: o.waiter_id,
            };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:status_changed', {
                orderId,
                status: 'cancelled',
                waiterId: meta.waiterId,
            });
            if (meta.tableId) {
                io.to(`tenant:${tenantId}:table:${meta.tableId}`).emit('customer:order_rejected', {
                    tenantId,
                    orderId,
                    tableId: meta.tableId,
                });
            }
        }

        res.json({ message: 'Sipariş reddedildi' });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }
        if (error.message === 'NOT_QR_ORDER') {
            return res.status(400).json({ error: 'Bu sipariş QR müşteri talebi değil' });
        }
        if (error.message === 'NOT_PENDING') {
            return res.status(409).json({ error: 'Sipariş zaten işlendi' });
        }
        console.error('rejectQrOrderHandler', error);
        res.status(500).json({ error: 'Reddedilemedi' });
    }
};

export const splitCheckoutSchema = z.object({
    sessionId: z.number(),
    items: z.array(z.object({
        orderItemId: z.number(),
        quantity: z.number().min(1),
    })),
    payment: z.object({
        method: z.enum(['cash', 'card', 'online', 'voucher']),
        tipAmount: z.number().min(0).default(0),
        receivedAmount: z.number().optional(),
    }),
});

export const splitCheckoutHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = splitCheckoutSchema.parse(req.body);
        const { payment: pay } = data;

        const result = await withTenantTransaction(tenantId, async (connection) => {
            // 1. Seçilen kalemlerin session_id ile doğrulanması
            let splitTotalGross = 0;
            const itemsToProcess = [];

            for (const reqItem of data.items) {
                const [rows]: any = await connection.query(
                    `SELECT oi.*, o.session_id, o.order_type, o.table_id, o.customer_id
                     FROM order_items oi
                     JOIN orders o ON oi.order_id = o.id
                     WHERE oi.id = ? AND o.session_id = ?`,
                    [reqItem.orderItemId, data.sessionId]
                );

                if (!rows.length) {
                    throw new Error(`ITEM_NOT_FOUND_IN_SESSION: ${reqItem.orderItemId}`);
                }

                const oi = rows[0];
                if (reqItem.quantity > oi.quantity) {
                    throw new Error(`INSUFFICIENT_QUANTITY: ${oi.id}`);
                }

                itemsToProcess.push({ ...oi, splitQty: reqItem.quantity });
                splitTotalGross += Number(oi.unit_price) * reqItem.quantity;
            }

            if (itemsToProcess.length === 0) throw new Error('EMPTY_SPLIT');

            const sample = itemsToProcess[0];
            const vat = await resolveDefaultVatRateDecimal(connection, req.branchId ?? null);
            const { net, tax, gross } = grossToNetAndTax(splitTotalGross, vat);

            // 2. Yeni bir 'Bölünmüş Sipariş' oluştur (Ödenmiş statüsünde)
            const [orderRes]: any = await connection.query(
                `INSERT INTO orders (session_id, table_id, customer_id, branch_id, cashier_id,
                    order_type, source, subtotal, tax_amount, total_amount, payment_status, status, notes)
                 VALUES (?, ?, ?, ?, ?, ?, 'cashier', ?, ?, ?, 'paid', 'completed', 'Split Bill Payment')`,
                [
                    data.sessionId,
                    sample.table_id,
                    sample.customer_id,
                    req.branchId,
                    req.user!.userId,
                    sample.order_type,
                    net, tax, gross
                ]
            );
            const newOrderId = orderRes.insertId;

            // 3. Kalemleri taşı veya böl
            for (const oi of itemsToProcess) {
                // Yeni siparişe ekle
                await connection.query(
                    `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price, modifiers, notes, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'served')`,
                    [
                        newOrderId, oi.product_id, oi.variant_id, oi.splitQty,
                        oi.unit_price, Number(oi.unit_price) * oi.splitQty,
                        oi.modifiers, oi.notes
                    ]
                );

                // Orijinal kalemi güncelle veya sil
                if (oi.splitQty === oi.quantity) {
                    await connection.query('DELETE FROM order_items WHERE id = ?', [oi.id]);
                } else {
                    const newQty = oi.quantity - oi.splitQty;
                    await connection.query(
                        'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
                        [newQty, Number(oi.unit_price) * newQty, oi.id]
                    );
                }

                // Orijinal siparişin toplamlarını güncelle (Basitlik için her adımda yapıyoruz, performans için optimize edilebilir)
                // Ama en doğrusu tüm kalemler bittikten sonra order_id bazlı toplu güncellemedir.
            }

            // 4. Etkilenen orijinal siparişlerin subtotal/tax/total güncellenmesi
            const affectedOrderIds = [...new Set(itemsToProcess.map(x => x.order_id))];
            for (const oid of affectedOrderIds) {
                const [sumRows]: any = await connection.query(
                    'SELECT SUM(total_price) as gross FROM order_items WHERE order_id = ?',
                    [oid]
                );
                const currentGross = Number(sumRows[0]?.gross || 0);
                if (currentGross === 0) {
                    // Eğer siparişte hiç kalem kalmadıysa iptal et veya sil (SaaS logic tercihi)
                    await connection.query("UPDATE orders SET status = 'cancelled', payment_status = 'cancelled', total_amount=0, subtotal=0, tax_amount=0 WHERE id = ?", [oid]);
                } else {
                    const { net: n, tax: t, gross: g } = grossToNetAndTax(currentGross, vat);
                    await connection.query(
                        'UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?',
                        [n, t, g, oid]
                    );
                }
            }

            // 6. Eğer seansta hiç açık (tamamlanmamış) kalem kalmadıysa masa ve seansı kapat
            const [remainingItems]: any = await connection.query(
                `SELECT COUNT(*)::int as c FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 WHERE o.session_id = ? AND o.status NOT IN ('completed', 'cancelled')`,
                [data.sessionId]
            );

            if (Number(remainingItems[0]?.c ?? 0) === 0) {
                // Seansı Kapat
                await connection.query(
                    `UPDATE table_sessions SET status = 'paid', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [data.sessionId]
                );

                // Masayı Boşa Çıkar
                await connection.query(
                    `UPDATE tables SET status = 'available', current_session_id = NULL WHERE current_session_id = ?`,
                    [data.sessionId]
                );
            }

            return { newOrderId, totalPaid: gross, sessionClosed: Number(remainingItems[0]?.c ?? 0) === 0 };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:updated', { sessionId: data.sessionId });
            io.to(`tenant:${tenantId}`).emit('payment:received', { sessionId: data.sessionId });
        }

        res.json({ message: 'Hesap başarıyla bölündü ve ödeme alındı', ...result });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        console.error('❌ Split Checkout Error:', error);
        res.status(500).json({ error: error.message || 'Hesap bölünemedi' });
    }
};

/** Masadaki tüm adisyonu (oturumun tamamını) tek tıkla kapatır */
export const checkoutSessionHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { sessionId, payment } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'Oturum ID (sessionId) gerekli' });
        }

        const result = await withTenantTransaction(tenantId, async (connection) => {
            // 1. Seansın ödenmemiş tüm siparişlerini bul
            const [unpaidOrders]: any = await connection.query(
                `SELECT id, total_amount, customer_id FROM orders 
                 WHERE session_id = ? AND status NOT IN ('cancelled') AND payment_status != 'paid'`,
                [sessionId]
            );

            if (!unpaidOrders.length) {
                // Eğer her şey zaten ödenmişse ama masa hala aktifse yinede masayı kapatalım mı?
                const [activeSession]: any = await connection.query(
                    'SELECT id, table_id FROM table_sessions WHERE id = ? AND status = \'active\'',
                    [sessionId]
                );
                if (activeSession.length > 0) {
                    await connection.query(
                        `UPDATE table_sessions SET status = 'paid', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        [sessionId]
                    );
                    await connection.query(
                        `UPDATE tables SET status = 'available', current_session_id = NULL WHERE current_session_id = ?`,
                        [sessionId]
                    );
                    return { success: true, message: 'Seans boştu, kapatıldı', sessionClosed: true };
                }
                throw new Error('NOTHING_TO_CHECKOUT');
            }

            const totalAmount = unpaidOrders.reduce((sum: number, o: any) => sum + parseFloat(String(o.total_amount || 0)), 0);

            // 2. Ödeme kayıtlarını oluştur ve Puan Kazandır
            const remainingTip = payment.tipAmount || 0;
            const splitCashierId = req.user?.userId ?? null;
            for (let i = 0; i < unpaidOrders.length; i++) {
                const order = unpaidOrders[i];
                const tipForThisOrder = i === 0 ? remainingTip : 0;

                await connection.query(
                    `INSERT INTO payments (order_id, session_id, amount, method, tip_amount, cashier_id, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [order.id, sessionId, order.total_amount, payment.method || 'cash', tipForThisOrder, splitCashierId, 'Masa Hesabı Toplu Kapanış']
                );

                // 🔥 SADAKAT PUANI KAZANDIR
                if (order.customer_id) {
                    await rewardLoyaltyPoints(connection, order.customer_id, order.total_amount, order.id);
                }
            }

            // 3. Siparişleri 'paid' ve 'served' yap
            await connection.query(
                `UPDATE orders SET payment_status = 'paid', status = 'served', updated_at = CURRENT_TIMESTAMP
                 WHERE session_id = ? AND status NOT IN ('cancelled')`,
                [sessionId]
            );

            // 4. Seansı ve Masayı Kapat
            await connection.query(
                `UPDATE table_sessions SET status = 'paid', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [sessionId]
            );
            await connection.query(
                `UPDATE tables SET status = 'available', current_session_id = NULL WHERE current_session_id = ?`,
                [sessionId]
            );

            return { 
                success: true, 
                totalPaid: totalAmount, 
                sessionClosed: true 
            };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('tables:updated');
            io.to(`tenant:${tenantId}`).emit('orders:updated', { sessionId });
            io.to(`tenant:${tenantId}`).emit('payment:received', { sessionId });
        }

        res.json(result);

    } catch (error: any) {
        if (error.message === 'NOTHING_TO_CHECKOUT') {
            return res.status(400).json({ error: 'Ödenecek aktif sipariş bulunamadı' });
        }
        console.error('❌ Session Checkout Error:', error);
        res.status(500).json({ error: error.message || 'Masa hesabı kapatılamadı' });
    }
};
