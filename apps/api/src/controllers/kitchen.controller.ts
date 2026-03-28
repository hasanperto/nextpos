import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';

export const getKitchenTicketsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { status } = req.query;

        const tickets = await withTenant(tenantId, async (connection) => {
            let query = `
                SELECT kt.*,
                       o.order_type,
                       o.is_urgent,
                       o.table_id,
                       t.name as table_name_current,
                       CASE WHEN o.order_type = 'takeaway' THEN true ELSE false END as is_takeaway
                FROM kitchen_tickets kt
                JOIN orders o ON kt.order_id = o.id
                LEFT JOIN tables t ON o.table_id = t.id
                WHERE 1=1
            `;
            const params: any[] = [];

            if (status) {
                params.push(status);
                query += ` AND kt.status = ?`;
            } else {
                query += ` AND kt.status IN ('waiting', 'preparing')`;
            }

            query += ` ORDER BY o.is_urgent DESC, kt.created_at ASC`;

            const [rows]: any = await connection.query(query, params);
            return rows;
        });

        res.json(tickets);
    } catch (error) {
        console.error('❌ Kitchen tickets hatası:', error);
        res.status(500).json({ error: 'Mutfak fişleri yüklenemedi' });
    }
};

export const updateTicketStatusHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const ticketId = Number(req.params.id);
        const { status } = req.body;

        const validStatuses = ['waiting', 'preparing', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Geçersiz fiş durumu' });
        }

        const result = await withTenantTransaction(tenantId, async (connection) => {
            const timeFields: Record<string, string> = {
                preparing: 'started_at',
                ready: 'ready_at',
                completed: 'completed_at',
            };

            let updateQuery = `UPDATE kitchen_tickets SET status = ?`;
            const params: any[] = [status];

            if (timeFields[status]) {
                updateQuery += `, ${timeFields[status]} = CURRENT_TIMESTAMP`;
            }

            if (status === 'ready') {
                updateQuery += `, prep_duration = TIMESTAMPDIFF(SECOND, started_at, CURRENT_TIMESTAMP)`;
            }

            params.push(ticketId);
            updateQuery += ` WHERE id = ?`;

            const [ticketResult]: any = await connection.query(updateQuery, [status, ticketId]);

            if (ticketResult.affectedRows === 0) {
                throw new Error('NOT_FOUND');
            }

            const [updatedTicket]: any = await connection.query('SELECT * FROM kitchen_tickets WHERE id = ?', [ticketId]);
            const ticket = updatedTicket[0];

            const [orderRows]: any = await connection.query(
                'SELECT waiter_id, table_id, order_type FROM orders WHERE id = ?',
                [ticket.order_id]
            );
            const order = orderRows[0];

            return { ticket, order };
        });

        const io = req.app.get('io');
        if (io && status === 'ready') {
            if (result.order?.waiter_id) {
                io.to(`waiter:${result.order.waiter_id}`).emit('kitchen:item_ready', {
                    ticketId,
                    tableName: result.ticket.table_name,
                    orderType: result.order.order_type,
                });
            }
            io.to(`tenant:${tenantId}`).emit('kitchen:ticket_updated', {
                ticketId,
                status,
            });
        }

        res.json({ message: 'Fiş durumu güncellendi', ticket: result.ticket });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Mutfak fişi bulunamadı' });
        }
        console.error('❌ Kitchen ticket güncelleme hatası:', error);
        res.status(500).json({ error: 'Fiş durumu güncellenemedi' });
    }
};
