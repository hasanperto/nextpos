import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';

const createOrderSchema = z.object({
    sessionId: z.number().optional(),
    tableId: z.number().optional(),
    customerId: z.number().optional(),
    orderType: z.enum(['dine_in', 'takeaway', 'delivery', 'web', 'phone', 'qr_menu']).default('dine_in'),
    source: z.enum(['cashier', 'waiter', 'customer_qr', 'web', 'phone']).default('cashier'),
    notes: z.string().optional(),
    deliveryAddress: z.string().optional(),
    deliveryPhone: z.string().optional(),
    isUrgent: z.boolean().default(false),
    items: z.array(z.object({
        productId: z.number(),
        variantId: z.number().optional(),
        quantity: z.number().min(1),
        unitPrice: z.number(),
        modifiers: z.any().optional(),
        notes: z.string().optional(),
    })).min(1, 'En az 1 ürün gerekli'),
});

export const getOrdersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { status, tableId, limit = '50', offset = '0' } = req.query;

        const orders = await withTenant(tenantId, async (connection) => {
            let query = `
                SELECT o.*,
                       t.name as table_name,
                       u.name as waiter_name,
                       (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'id', oi.id, 'product_id', oi.product_id,
                                'product_name', p.name, 'variant_name', pv.name,
                                'quantity', oi.quantity, 'unit_price', oi.unit_price,
                                'total_price', oi.total_price, 'status', oi.status,
                                'modifiers', CAST(oi.modifiers AS JSON), 'notes', oi.notes
                           ))
                            FROM order_items oi
                            LEFT JOIN products p ON oi.product_id = p.id
                            LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                            WHERE oi.order_id = o.id) as items
                FROM orders o
                LEFT JOIN tables t ON o.table_id = t.id
                LEFT JOIN users u ON o.waiter_id = u.id
                WHERE 1=1
            `;
            const params: any[] = [];

            if (status) {
                params.push(status);
                query += ` AND o.status = ?`;
            }

            if (tableId) {
                params.push(Number(tableId));
                query += ` AND o.table_id = ?`;
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
            return rows;
        });

        res.json(orders);
    } catch (error) {
        console.error('❌ Siparişler hatası:', error);
        res.status(500).json({ error: 'Siparişler yüklenemedi' });
    }
};

export const createOrderHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createOrderSchema.parse(req.body);

        if (data.orderType === 'takeaway' && !data.deliveryPhone) {
            return res.status(400).json({ error: 'Gel-Al (Takeaway) siparişlerinde telefon numarası zorunludur.' });
        }

        const order = await withTenantTransaction(tenantId, async (connection) => {
            let subtotal = 0;
            for (const item of data.items) {
                subtotal += item.unitPrice * item.quantity;
            }

            const [orderResult]: any = await connection.query(
                `INSERT INTO orders (session_id, table_id, customer_id, waiter_id, cashier_id,
                    order_type, source, subtotal, total_amount, is_urgent, notes,
                    delivery_address, delivery_phone, branch_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.sessionId || null,
                    data.tableId || null,
                    data.customerId || null,
                    req.user!.role === 'waiter' ? req.user!.userId : null,
                    req.user!.role === 'cashier' ? req.user!.userId : null,
                    data.orderType,
                    data.source,
                    subtotal,
                    subtotal,
                    data.isUrgent,
                    data.notes || null,
                    data.deliveryAddress || null,
                    data.deliveryPhone || null,
                    req.branchId || null,
                ]
            );

            const newOrderId = orderResult.insertId;

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

            const [finalOrder]: any = await connection.query('SELECT * FROM orders WHERE id = ?', [newOrderId]);
            return finalOrder[0];
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:new', {
                orderId: order.id,
                tableId: data.tableId,
                orderType: data.orderType,
            });
        }

        res.status(201).json(order);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Sipariş oluşturma hatası:', error);
        res.status(500).json({ error: 'Sipariş oluşturulamadı' });
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

            if (status === 'cancelled' && ['preparing', 'ready'].includes(order.status)) {
                if (!pinCode) {
                    throw new Error('PIN_REQUIRED');
                }
                const [pinRows]: any = await connection.query(
                    `SELECT role FROM users WHERE pin_code = ? AND role IN ('admin', 'kitchen') AND status = 'active'`,
                    [pinCode]
                );
                if (pinRows.length === 0) {
                    throw new Error('INVALID_PIN');
                }
            }

            await connection.query(
                'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, orderId]
            );

            return { ...order, status };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('order:status_changed', {
                orderId,
                status,
                waiterId: result.waiter_id,
            });
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
        console.error('❌ Sipariş güncelleme hatası:', error);
        res.status(500).json({ error: 'Sipariş güncellenemedi' });
    }
};
