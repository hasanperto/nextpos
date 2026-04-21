import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { reverseOrderRecipeDeduction } from '../services/stock-inventory.service.js';
import {
    ensureUsersWaiterSectionColumns,
    pickLeastLoadedWaiterForSection,
} from '../lib/waiterSectionColumns.js';

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
                       u.name as waiter_name,
                       u.role as waiter_role,
                       c.name as customer_name,
                       (SELECT COALESCE(SUM(o.total_amount), 0) 
                        FROM orders o 
                        WHERE o.session_id = ts.id AND o.status != 'cancelled') as total_amount
                FROM tables t
                LEFT JOIN sections s ON t.section_id = s.id
                LEFT JOIN table_sessions ts ON t.current_session_id = ts.id AND ts.status = 'active'
                LEFT JOIN users u ON ts.waiter_id = u.id
                LEFT JOIN customers c ON ts.customer_id = c.id
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
                        c.name as customer_name,
                        (SELECT COALESCE(json_agg(
                            json_build_object(
                                'id', o.id,
                                'status', o.status,
                                'total_amount', o.total_amount,
                                'order_type', o.order_type,
                                'created_at', o.created_at,
                                'items', (
                                    SELECT COALESCE(json_agg(json_build_object(
                                        'id', oi.id,
                                        'product_name', p.name,
                                        'variant_name', pv.name,
                                        'quantity', oi.quantity,
                                        'unit_price', oi.unit_price,
                                        'total_price', oi.total_price,
                                        'status', oi.status,
                                        'modifiers', oi.modifiers,
                                        'notes', oi.notes
                                    )), '[]'::json)
                                    FROM order_items oi
                                    LEFT JOIN products p ON oi.product_id = p.id
                                    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                                    WHERE oi.order_id = o.id
                                )
                            )
                        ), '[]'::json)
                             FROM orders o WHERE o.session_id = ts.id AND o.status != 'cancelled') as orders
                 FROM tables t
                 LEFT JOIN sections s ON t.section_id = s.id
                 LEFT JOIN table_sessions ts ON t.current_session_id = ts.id AND ts.status = 'active'
                 LEFT JOIN users u ON ts.waiter_id = u.id
                 LEFT JOIN customers c ON ts.customer_id = c.id
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
        const { customerId, guestName, guestCount, waiterId, clientSessionId } = req.body;
        const openerRole = req.user?.role;

        const session = await withTenantTransaction(tenantId, async (connection) => {
            await ensureUsersWaiterSectionColumns(connection);
            // 🛡️ Self-healing: Ensure client_session_id exists (Phase 10 migration)
            try {
                await connection.query(`ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS client_session_id VARCHAR(100)`);
            } catch (err) {
                // Silently continue
            }

            // 1. Is there an active session for this clientUuid?
            if (clientSessionId) {
                const [uuidRows]: any = await connection.query(
                    'SELECT * FROM table_sessions WHERE client_session_id = ? AND status = \'active\' AND table_id = ?',
                    [clientSessionId, tableId]
                );
                if (uuidRows.length > 0) {
                    return { row: uuidRows[0], created: false as const };
                }
            }

            // 2. Is there an active session for this table?
            const [existingRows]: any = await connection.query(
                `SELECT t.current_session_id, ts.id AS sid
                 FROM tables t
                 LEFT JOIN table_sessions ts ON ts.id = t.current_session_id AND ts.status = 'active'
                 WHERE t.id = ?`,
                [tableId]
            );
            const row = existingRows[0];
            if (row?.sid) {
                const [sessRows]: any = await connection.query('SELECT * FROM table_sessions WHERE id = ?', [
                    row.sid,
                ]);
                return { row: sessRows[0], created: false as const };
            }

            const [tsec]: any = await connection.query('SELECT section_id FROM tables WHERE id = ?', [tableId]);
            const tableSectionId =
                tsec?.[0]?.section_id != null && Number.isFinite(Number(tsec[0].section_id))
                    ? Number(tsec[0].section_id)
                    : null;

            let resolvedWaiterId =
                waiterId != null && Number.isFinite(Number(waiterId)) ? Number(waiterId) : null;

            /** Kasiyer masayı açınca bölgeye uygun en az yüklü garson atanır */
            if (openerRole === 'cashier') {
                resolvedWaiterId = await pickLeastLoadedWaiterForSection(connection, tableSectionId);
            }

            // 3. Create new session
            const [sessionResult]: any = await connection.query(
                `INSERT INTO table_sessions (table_id, customer_id, guest_name, guest_count, waiter_id, client_session_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    tableId,
                    customerId || null,
                    guestName || null,
                    guestCount || 1,
                    resolvedWaiterId,
                    clientSessionId || null,
                ]
            );
            const newSessionId = sessionResult.insertId;

            await connection.query(
                `UPDATE tables SET status = 'occupied', current_session_id = ? WHERE id = ?`,
                [newSessionId, tableId]
            );

            const [newSession]: any = await connection.query('SELECT * FROM table_sessions WHERE id = ?', [
                newSessionId,
            ]);
            return { row: newSession[0], created: true as const };
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('table:session_opened', {
                tableId,
                session: session.row,
            });
        }

        res.status(session.created ? 201 : 200).json(session.row);
    } catch (error) {
        console.error('❌ Masa açma hatası:', error);
        res.status(500).json({ error: 'Masa açılamadı' });
    }
};

export const transferTableHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const sourceTableId = Number(req.params.id);
        const { targetTableId } = req.body;

        if (!targetTableId) return res.status(400).json({ error: 'Hedef masa gerekli' });

        await withTenantTransaction(tenantId, async (connection) => {
            const [source]: any = await connection.query('SELECT current_session_id FROM tables WHERE id = ?', [sourceTableId]);
            const sessionId = source[0]?.current_session_id;
            if (!sessionId) throw new Error('Kaynak masada aktif oturum yok');

            const [target]: any = await connection.query('SELECT status FROM tables WHERE id = ?', [targetTableId]);
            if (target[0]?.status === 'occupied') throw new Error('Hedef masa dolu');

            await connection.query('UPDATE tables SET current_session_id = NULL, status = \'available\' WHERE id = ?', [sourceTableId]);
            await connection.query('UPDATE tables SET current_session_id = ?, status = \'occupied\' WHERE id = ?', [sessionId, targetTableId]);
            await connection.query('UPDATE table_sessions SET table_id = ? WHERE id = ?', [targetTableId, sessionId]);
        });

        const io = req.app.get('io');
        if (io) io.to(`tenant:${tenantId}`).emit('tables:updated');
        res.json({ message: 'Masa başarıyla taşındı' });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Masa taşıma başarısız' });
    }
};

export const mergeTablesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const sourceTableId = Number(req.params.id);
        const { targetTableId } = req.body;

        await withTenantTransaction(tenantId, async (connection) => {
            const [source]: any = await connection.query('SELECT current_session_id FROM tables WHERE id = ?', [sourceTableId]);
            const [target]: any = await connection.query('SELECT current_session_id FROM tables WHERE id = ?', [targetTableId]);

            const sourceSid = source[0]?.current_session_id;
            const targetSid = target[0]?.current_session_id;

            if (!sourceSid || !targetSid) throw new Error('Her iki masada da aktif oturum olmalı');

            await connection.query('UPDATE orders SET session_id = ? WHERE session_id = ?', [targetSid, sourceSid]);
            await connection.query('UPDATE table_sessions SET status = \'merged\', closed_at = CURRENT_TIMESTAMP WHERE id = ?', [sourceSid]);
            await connection.query('UPDATE tables SET current_session_id = NULL, status = \'available\' WHERE id = ?', [sourceTableId]);
        });

        const io = req.app.get('io');
        if (io) io.to(`tenant:${tenantId}`).emit('tables:updated');
        res.json({ message: 'Masalar birleştirildi' });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Birleştirme başarısız' });
    }
};

/** Masadaki tek bir kalemi (veya belli bir adetini) başka bir masaya taşır */
export const transferItemHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { orderItemId, quantity, targetTableId } = req.body;

        if (!orderItemId || !quantity || !targetTableId) {
            return res.status(400).json({ error: 'Ürün, adet ve hedef masa gerekli' });
        }

        await withTenantTransaction(tenantId, async (connection) => {
            // 1. Ürünü ve mevcut siparişini bul
            const [itemRows]: any = await connection.query(
                `SELECT oi.*, o.session_id, o.branch_id, o.order_type 
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 WHERE oi.id = ?`,
                [orderItemId]
            );

            if (!itemRows.length) throw new Error('Ürün bulunamadı');
            const item = itemRows[0];

            if (quantity > item.quantity) throw new Error('Yetersiz adet');

            // 2. Hedef masanın aktif oturumunu bul
            const [targetTable]: any = await connection.query(
                'SELECT current_session_id FROM tables WHERE id = ?',
                [targetTableId]
            );

            if (!targetTable[0]?.current_session_id) {
                throw new Error('Hedef masada aktif oturum yok (Önce masayı açmalısınız)');
            }
            const targetSessionId = targetTable[0].current_session_id;

            // 3. Hedef oturumda bir sipariş ara veya yeni bir transfer siparişi oluştur
            const [targetOrders]: any = await connection.query(
                `SELECT id FROM orders 
                 WHERE session_id = ? AND status NOT IN ('completed', 'cancelled') AND order_type = ?
                 LIMIT 1`,
                [targetSessionId, item.order_type]
            );

            let targetOrderId: number;
            const cashierId = req.user?.userId ?? null;
            if (targetOrders.length > 0) {
                targetOrderId = targetOrders[0].id;
            } else {
                // Yeni sipariş (Transfer başlığıyla)
                const [newOrder]: any = await connection.query(
                    `INSERT INTO orders (session_id, table_id, branch_id, cashier_id, order_type, status, notes)
                     VALUES (?, ?, ?, ?, ?, 'preparing', 'Ürün Transferi')`,
                    [targetSessionId, targetTableId, item.branch_id, cashierId, item.order_type]
                );
                targetOrderId = newOrder.insertId;
            }

            // 4. Kalemi taşı veya böl
            if (quantity === Number(item.quantity)) {
                // Tamamını taşı
                await connection.query('UPDATE order_items SET order_id = ? WHERE id = ?', [targetOrderId, orderItemId]);
            } else {
                // Parçasını taşı (Yeni item oluştur)
                await connection.query(
                    `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price, modifiers, notes, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        targetOrderId, item.product_id, item.variant_id, quantity,
                        item.unit_price, Number(item.unit_price) * quantity,
                        item.modifiers, item.notes, item.status
                    ]
                );
                // Eski item'ı azalt
                const newQty = Number(item.quantity) - quantity;
                await connection.query(
                    'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
                    [newQty, Number(item.unit_price) * newQty, orderItemId]
                );
            }

            // 5. Her iki siparişin toplamlarını güncelle
            const updateOrderTotals = async (oid: number) => {
                const [sumRows]: any = await connection.query(
                    'SELECT SUM(total_price) as gross FROM order_items WHERE order_id = ?',
                    [oid]
                );
                const currentGross = Number(sumRows[0]?.gross || 0);
                if (currentGross === 0) {
                    await connection.query("UPDATE orders SET status = 'cancelled', payment_status = 'cancelled', total_amount=0 WHERE id = ?", [oid]);
                } else {
                    // KDV hesaplama (Basitçe order'dan oran yoksa varsayılan)
                    const vat = 0.19;
                    const subtotal = currentGross / (1 + vat);
                    const tax = currentGross - subtotal;
                    await connection.query(
                        'UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?',
                        [subtotal, tax, currentGross, oid]
                    );
                }
            };

            await updateOrderTotals(item.order_id);
            await updateOrderTotals(targetOrderId);
        });

        const io = req.app.get('io');
        if (io) io.to(`tenant:${tenantId}`).emit('tables:updated');

        res.json({ message: 'Ürün başarıyla transfer edildi' });
    } catch (error: any) {
        console.error('❌ Ürün transfer hatası:', error);
        res.status(500).json({ error: error.message || 'Ürün transferi başarısız' });
    }
};

/** Masadaki tüm oturumu iptal eder: Aktif session'ı cancel eder, masayı boşatır. */
export const cancelTableSessionHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const tableId = Number(req.params.id);

        await withTenantTransaction(tenantId, async (connection) => {
            const [table]: any = await connection.query('SELECT current_session_id FROM tables WHERE id = ?', [tableId]);
            const sessionId = table[0]?.current_session_id;

            if (sessionId) {
                const [openOrders]: any = await connection.query(
                    `SELECT id, status FROM orders WHERE session_id = ? AND status NOT IN ('completed', 'cancelled')`,
                    [sessionId]
                );
                const toRev = Array.isArray(openOrders) ? openOrders : [];
                for (const row of toRev) {
                    await reverseOrderRecipeDeduction(connection, Number(row.id), null);
                }
                // 1. Session'ı 'cancelled' yap
                await connection.query('UPDATE table_sessions SET status = \'cancelled\', closed_at = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);
                
                // 2. Siparişleri 'cancelled' yap
                await connection.query('UPDATE orders SET status = \'cancelled\' WHERE session_id = ?', [sessionId]);
            }

            // 3. Masayı boşalt
            await connection.query('UPDATE tables SET current_session_id = NULL, status = \'available\' WHERE id = ?', [tableId]);
        });

        const io = req.app.get('io');
        if (io) io.to(`tenant:${tenantId}`).emit('tables:updated');

        res.json({ success: true, message: 'Masa başarıyla iptal edildi ve boşaltıldı' });
    } catch (error: any) {
        console.error('❌ Masa iptal hatası:', error);
        res.status(500).json({ error: error.message || 'Masa iptali başarısız' });
    }
};
