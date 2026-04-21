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

            const cashierId = req.user?.userId ?? null;

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
                    cashierId,
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

/** Bir masanın (seansın) toplam bakiyesi üzerinden belli bir tutarda ödeme alır */
export const createSessionPaymentHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { sessionId, amount, method, notes, tipAmount } = req.body;

        if (!sessionId || !amount) {
            return res.status(400).json({ error: 'Oturum ID ve tutar gerekli' });
        }

        const result: any = await withTenantTransaction(tenantId, async (connection) => {
            // 1. Seanstaki ödenmemiş veya parçalı ödenmiş siparişleri bul
            const [unpaidOrders]: any = await connection.query(
                `SELECT o.id, o.total_amount, 
                        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE order_id = o.id AND status = 'completed') as paid_amount
                 FROM orders o
                 WHERE o.session_id = ? AND o.status NOT IN ('cancelled') AND o.payment_status != 'paid'
                 ORDER BY o.created_at ASC`,
                [sessionId]
            );

            if (!unpaidOrders.length) throw new Error('Ödenecek sipariş bulunamadı');

            let remainingPayment = parseFloat(amount);
            const paymentsCreated = [];
            const cashierId = req.user?.userId ?? null;

            // 2. Ödemeyi siparişlere dağıt
            for (const order of unpaidOrders) {
                if (remainingPayment <= 0) break;

                const orderTotal = parseFloat(order.total_amount);
                const orderPaid = parseFloat(order.paid_amount);
                const orderRemaining = orderTotal - orderPaid;

                if (orderRemaining <= 0) continue;

                const paymentForThisOrder = Math.min(remainingPayment, orderRemaining);

                // Ödeme kaydı
                const [pRes]: any = await connection.query(
                    `INSERT INTO payments (order_id, session_id, amount, method, tip_amount, cashier_id, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        order.id, sessionId, paymentForThisOrder,
                        method || 'cash', (paymentsCreated.length === 0 ? (tipAmount || 0) : 0),
                        cashierId, notes || 'Parçalı Masa Ödemesi'
                    ]
                );
                
                paymentsCreated.push(pRes.insertId);
                remainingPayment -= paymentForThisOrder;

                // Sipariş durumunu güncelle
                const newPaidTotal = orderPaid + paymentForThisOrder;
                const newStatus = newPaidTotal >= orderTotal ? 'paid' : 'partial';

                await connection.query(
                    'UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [newStatus, order.id]
                );
            }

            // 3. Masanın/Seansın durumunu kontrol et
            const [stillUnpaid]: any = await connection.query(
                `SELECT COUNT(*)::int as c FROM orders 
                 WHERE session_id = ? AND status NOT IN ('cancelled') AND payment_status != 'paid'`,
                [sessionId]
            );

            let sessionClosed = false;
            if (Number(stillUnpaid[0].c) === 0) {
                // Eğer her şey ödendiyse seansı ve masayı kapat
                await connection.query(
                    `UPDATE table_sessions SET status = 'paid', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [sessionId]
                );
                await connection.query(
                    `UPDATE tables SET status = 'available', current_session_id = NULL WHERE current_session_id = ?`,
                    [sessionId]
                );
                sessionClosed = true;
            }

            return { paymentsCreated, sessionClosed };
        });

        const io = req.app.get('io');
        if (io) io.to(`tenant:${tenantId}`).emit('tables:updated');

        res.json({ 
            message: 'Ödeme başarıyla dağıtıldı', 
            sessionClosed: result.sessionClosed,
            remainingPayment: 0 // Kalan tutar frontend'e de dönebilir
        });
    } catch (error: any) {
        console.error('❌ Parçalı ödeme hatası:', error);
        res.status(500).json({ error: error.message || 'Ödeme dağıtılamadı' });
    }
};
