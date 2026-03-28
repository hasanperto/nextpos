import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';

export const getTablesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { sectionId } = req.query;

        const tables = await withTenant(tenantId, async (connection) => {
            let query = `
                SELECT t.*,
                       s.name as section_name,
                       s.floor,
                       ts.id as active_session_id,
                       ts.guest_name,
                       ts.guest_count,
                       ts.waiter_id,
                       ts.opened_at as session_opened_at,
                       u.name as waiter_name
                FROM tables t
                LEFT JOIN sections s ON t.section_id = s.id
                LEFT JOIN table_sessions ts ON t.current_session_id = ts.id AND ts.status = 'active'
                LEFT JOIN users u ON ts.waiter_id = u.id
            `;
            const params: any[] = [];

            if (sectionId) {
                params.push(Number(sectionId));
                query += ` WHERE t.section_id = ?`;
            }

            query += ' ORDER BY t.name ASC';

            const [rows]: any = await connection.query(query, params);
            return rows;
        });

        res.json(tables);
    } catch (error) {
        console.error('❌ Masalar hatası:', error);
        res.status(500).json({ error: 'Masalar yüklenemedi' });
    }
};

export const getSectionsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;

        const sections = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                'SELECT * FROM sections WHERE is_active = true ORDER BY sort_order ASC'
            );
            return rows;
        });

        res.json(sections);
    } catch (error) {
        res.status(500).json({ error: 'Bölgeler yüklenemedi' });
    }
};

export const getTableStatusHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const tableId = Number(req.params.id);

        const table = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT t.*,
                        s.name as section_name,
                        ts.id as session_id,
                        ts.guest_name,
                        ts.guest_count,
                        ts.waiter_id,
                        ts.opened_at,
                        u.name as waiter_name,
                        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'id', o.id, 'status', o.status, 'total_amount', o.total_amount,
                                'order_type', o.order_type, 'created_at', o.created_at,
                                'items', (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                        'id', oi.id, 'product_name', p.name,
                                        'variant_name', pv.name,
                                        'quantity', oi.quantity, 'unit_price', oi.unit_price,
                                        'total_price', oi.total_price, 'status', oi.status,
                                        'modifiers', CAST(oi.modifiers AS JSON), 'notes', oi.notes
                                    ))
                                     FROM order_items oi
                                     LEFT JOIN products p ON oi.product_id = p.id
                                     LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                                     WHERE oi.order_id = o.id)
                            ))
                             FROM orders o WHERE o.session_id = ts.id) as orders
                 FROM tables t
                 LEFT JOIN sections s ON t.section_id = s.id
                 LEFT JOIN table_sessions ts ON t.current_session_id = ts.id AND ts.status = 'active'
                 LEFT JOIN users u ON ts.waiter_id = u.id
                 WHERE t.id = ?`,
                [tableId]
            );
            return rows[0] || null;
        });

        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        res.json(table);
    } catch (error) {
        console.error('❌ Masa durumu hatası:', error);
        res.status(500).json({ error: 'Masa durumu yüklenemedi' });
    }
};

export const openTableHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const tableId = Number(req.params.id);
        const { customerId, guestName, guestCount, waiterId } = req.body;

        const session = await withTenantTransaction(tenantId, async (connection) => {
            const [sessionResult]: any = await connection.query(
                `INSERT INTO table_sessions (table_id, customer_id, guest_name, guest_count, waiter_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [tableId, customerId || null, guestName || null, guestCount || 1, waiterId || null]
            );
            const newSessionId = sessionResult.insertId;

            await connection.query(
                `UPDATE tables SET status = 'occupied', current_session_id = ? WHERE id = ?`,
                [newSessionId, tableId]
            );

            const [newSession]: any = await connection.query('SELECT * FROM table_sessions WHERE id = ?', [newSessionId]);
            return newSession[0];
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('table:session_opened', {
                tableId,
                session,
            });
        }

        res.status(201).json(session);
    } catch (error) {
        console.error('❌ Masa açma hatası:', error);
        res.status(500).json({ error: 'Masa açılamadı' });
    }
};
