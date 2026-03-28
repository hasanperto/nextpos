import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';

const createPaymentSchema = z.object({
    orderId: z.number(),
    sessionId: z.number().optional(),
    amount: z.number().positive(),
    method: z.enum(['cash', 'card', 'online', 'voucher', 'split']),
    tipAmount: z.number().default(0),
    receivedAmount: z.number().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
});

export const createPaymentHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createPaymentSchema.parse(req.body);

        const payment: any = await withTenantTransaction(tenantId, async (connection) => {
            const changeAmount = data.method === 'cash' && data.receivedAmount
                ? data.receivedAmount - data.amount
                : 0;

            const [paymentResult]: any = await connection.query(
                `INSERT INTO payments (order_id, session_id, amount, method, tip_amount, 
                    change_amount, received_amount, reference, cashier_id, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.orderId,
                    data.sessionId || null,
                    data.amount,
                    data.method,
                    data.tipAmount,
                    changeAmount,
                    data.receivedAmount || null,
                    data.reference || null,
                    req.user!.userId,
                    data.notes || null,
                ]
            );

            const [totalPaidRows]: any = await connection.query(
                `SELECT SUM(amount) as total_paid FROM payments WHERE order_id = ? AND status = 'completed'`,
                [data.orderId]
            );
            const [orderTotalRows]: any = await connection.query(
                'SELECT total_amount FROM orders WHERE id = ?',
                [data.orderId]
            );

            const paid = parseFloat(totalPaidRows[0].total_paid || '0');
            const total = parseFloat(orderTotalRows[0].total_amount);

            let paymentStatus = 'unpaid';
            if (paid >= total) {
                paymentStatus = 'paid';
            } else if (paid > 0) {
                paymentStatus = 'partial';
            }

            await connection.query(
                `UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [paymentStatus, data.orderId]
            );

            const [newPayment]: any = await connection.query('SELECT * FROM payments WHERE id = ?', [paymentResult.insertId]);
            return { payment: newPayment[0], paymentStatus };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('payment:received', {
                orderId: data.orderId,
                paymentStatus: payment.paymentStatus,
            });
        }

        res.status(201).json(payment);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Ödeme hatası:', error);
        res.status(500).json({ error: 'Ödeme alınamadı' });
    }
};

export const getOrderPaymentsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const orderId = Number(req.params.orderId);

        const payments = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT p.*, u.name as cashier_name 
                 FROM payments p 
                 LEFT JOIN users u ON p.cashier_id = u.id 
                 WHERE p.order_id = ? 
                 ORDER BY p.created_at ASC`,
                [orderId]
            );
            return rows;
        });

        res.json(payments);
    } catch (error) {
        console.error('❌ Ödeme listesi hatası:', error);
        res.status(500).json({ error: 'Ödemeler yüklenemedi' });
    }
};
