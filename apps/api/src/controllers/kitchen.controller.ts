import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

export const getKitchenTicketsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { status, station } = req.query;

        const tickets = await withTenant(tenantId, async (connection) => {
            // 🛡️ Self-healing migration for orders table (kitchen needs these columns)
            try {
                await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT`);
                await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_arrival VARCHAR(20) DEFAULT 'cash'`);
                await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'`);
                await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100)`);
            } catch (err) {}

            let query = `
                SELECT kt.*,
                       o.order_type,
                       o.is_urgent,
                       o.table_id,
                       o.notes as global_notes,
                       o.payment_method_arrival,
                       o.payment_status,
                       t.name as table_name_current,
                       CASE WHEN o.order_type = 'takeaway' THEN true ELSE false END as is_takeaway
                FROM kitchen_tickets kt
                JOIN orders o ON kt.order_id = o.id
                LEFT JOIN tables t ON o.table_id = t.id
                WHERE 1=1
            `;
            const params: any[] = [];

            const st = typeof station === 'string' ? station.toLowerCase().trim() : '';
            if (st === 'hot' || st === 'bar' || st === 'cold') {
                params.push(st);
                query += ` AND kt.station = ?`;
            }

            if (status) {
                params.push(status);
                query += ` AND kt.status = ?`;
            } else {
                /* KDS: bekleyen + hazırlanan + hazır (teslim bekleyen) */
                query += ` AND kt.status IN ('waiting', 'preparing', 'ready')`;
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

// ── Tamamlanan fişleri getir (son 4 saat) ──
export const getCompletedTicketsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;

        const tickets = await withTenant(tenantId, async (connection) => {
            const query = `
                SELECT kt.*,
                       o.order_type,
                       o.is_urgent,
                       o.table_id,
                       o.notes as global_notes,
                       o.payment_method_arrival,
                       o.payment_status,
                       t.name as table_name_current
                FROM kitchen_tickets kt
                JOIN orders o ON kt.order_id = o.id
                LEFT JOIN tables t ON o.table_id = t.id
                WHERE kt.status = 'completed'
                  AND kt.completed_at >= NOW() - INTERVAL '4 hours'
                ORDER BY kt.completed_at DESC
                LIMIT 50
            `;
            const [rows]: any = await connection.query(query, []);
            return rows;
        });

        res.json(tickets);
    } catch (error) {
        console.error('❌ Completed tickets hatası:', error);
        res.status(500).json({ error: 'Tamamlanan fişler yüklenemedi' });
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
                updateQuery += `, prep_duration = CASE WHEN started_at IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)))::int) ELSE NULL END`;
            }

            params.push(ticketId);
            updateQuery += ` WHERE id = ?`;

            const [ticketResult]: any = await connection.query(updateQuery, params);

            if (ticketResult.affectedRows === 0) {
                throw new Error('NOT_FOUND');
            }

            const [[ticket]]: any = await connection.query('SELECT * FROM kitchen_tickets WHERE id = ?', [ticketId]);
            const [[order]]: any = await connection.query(
                `SELECT session_id, waiter_id, table_id, order_type, status as old_status, is_urgent,
                        delivery_phone, customer_name, customer_id
                 FROM orders WHERE id = ?`,
                [ticket.order_id]
            );

            // BİRLEŞTİRME MANTIĞI: Eğer 'preparing' yapılıyorsa ve aynı masada zaten 'preparing' varsa birleştir
            let mergedToId = null;
            if (status === 'preparing' && order.session_id) {
                const [sameTickets]: any = await connection.query(
                    `SELECT kt.id, kt.items FROM kitchen_tickets kt
                     JOIN orders oms ON kt.order_id = oms.id
                     WHERE oms.session_id = ? AND kt.station = ? AND kt.status = 'preparing' AND kt.id != ?
                     ORDER BY kt.id ASC LIMIT 1`,
                    [order.session_id, ticket.station, ticketId]
                );

                if (sameTickets?.length > 0) {
                    const existing = sameTickets[0];
                    mergedToId = existing.id;
                    
                    const parseLines = (raw: any): any[] => {
                        if (Array.isArray(raw)) return raw;
                        if (typeof raw === 'string') {
                            try { return JSON.parse(raw || '[]'); } catch { return []; }
                        }
                        return [];
                    };

                    const oldItems = parseLines(existing.items);
                    const newItems = parseLines(ticket.items);

                    // Ekle / Miktar toplama
                    for (const n of newItems) {
                        const match = oldItems.find((x: any) => 
                            x.product_name === n.product_name && 
                            x.variant_name === n.variant_name &&
                            x.notes === n.notes &&
                            JSON.stringify(x.modifiers) === JSON.stringify(n.modifiers)
                        );
                        if (match) {
                            match.quantity = (Number(match.quantity) || 0) + (Number(n.quantity) || 0);
                        } else {
                            oldItems.push(n);
                        }
                    }

                    // Mevcut hazırlanan fişi güncelle
                    await connection.query(
                        'UPDATE kitchen_tickets SET items = ?::jsonb, is_urgent = ? WHERE id = ?',
                        [JSON.stringify(oldItems), Boolean(order.is_urgent), mergedToId]
                    );

                    // Bu yeni 'waiting'den gelen 'preparing' fişini sil (çünkü öbürüne aktardık)
                    await connection.query('DELETE FROM kitchen_tickets WHERE id = ?', [ticketId]);
                }
            }

            // orders tablosunu senkronize et
            // Bir fiş 'completed' (mutfaktan çıktı) olduğunda sipariş durumu 'ready' (teslimat bekliyor) olur.
            // Sadece 'delivery' değil, 'takeaway' ve 'dine_in' için de geçerli.
            let orderStatus = status; 
            if (status === 'completed') {
                orderStatus = 'ready'; 
            }

            await connection.query(
                "UPDATE orders SET status = ?::order_status, updated_at = NOW() WHERE id = ?",
                [orderStatus, ticket.order_id]
            );

            return { ticket, order, mergedToId };
        });

        const io = req.app.get('io');
        if (io) {
            const room = `tenant:${tenantId}`;
            if (result.mergedToId) {
                // Fiş birleşti, eskisi silindi, yenisi güncellendi
                io.to(room).emit('kitchen:ticket_deleted', { ticketId });
                io.to(room).emit('kitchen:ticket_merged', { 
                    fromId: ticketId, 
                    toId: result.mergedToId,
                    status: 'preparing'
                });
            } else {
                io.to(room).emit('kitchen:ticket_updated', {
                    ticketId,
                    status,
                    orderId: result.ticket.order_id
                });
            }
            
            // Sipariş durumu güncellendi bildirimi
            // Eğer fiş mutfaktan 'completed' olarak çıktıysa, sipariş artık 'ready'dir (teslimat bekliyordur)
            io.to(room).emit('order:status_update', {
                orderId: result.ticket.order_id,
                status: status === 'completed' ? 'ready' : status
            });

            if (status === 'ready') {
                // ── HEDEFLI BİLDİRİM AKIŞI ──
                // order_type'a göre doğru kişilere bildirim gönder
                const orderType = result.order.order_type;
                const tableName = result.ticket.table_name || result.ticket.table_name_current;

                // Tüm kasiyerlere her zaman haber ver (merkez kontrol noktası)
                io.to(room).emit('order:ready', {
                    orderId: result.ticket.order_id,
                    orderType: orderType,
                    tableName: tableName,
                    customerName: result.order.customer_name
                });

                if (orderType === 'dine_in') {
                    // MASA SİPARİŞİ → Garsonlara bildir
                    io.to(room).emit('kitchen:item_ready', {
                        ticketId,
                        orderId: result.ticket.order_id,
                        tableName: tableName,
                        orderType: 'dine_in',
                        waiterId: result.order.waiter_id,
                    });
                } else if (orderType === 'takeaway') {
                    // GEL-AL → Kasiyere + Garsonlara bildir
                    io.to(room).emit('kitchen:item_ready', {
                        ticketId,
                        orderId: result.ticket.order_id,
                        tableName: null,
                        orderType: 'takeaway',
                        waiterId: null,
                    });
                } else if (orderType === 'delivery') {
                    // PAKET → Kurye paneline bildir
                    io.to(room).emit('kitchen:item_ready', {
                        ticketId,
                        orderId: result.ticket.order_id,
                        tableName: null,
                        orderType: 'delivery',
                        waiterId: null,
                    });
                    io.to(room).emit('courier:order_ready', {
                        orderId: result.ticket.order_id,
                        ticketId,
                    });
                }

                // WhatsApp Bildirimi (Gel-Al ve Paket için) — Arka planda çalışabilir
                if (orderType !== 'dine_in') {
                    const orderSnapshot = { ...result.order };
                    const orderId = result.ticket.order_id;
                    void (async () => {
                        try {
                            // Arka plan işi için taze bir bağlantı alıyoruz
                            await withTenant(tenantId, async (conn) => {
                                const [settingsRows]: any = await conn.query(`SELECT json_data FROM settings WHERE key = 'tenant_settings' LIMIT 1`);
                                const setJson = settingsRows?.[0]?.json_data || {};
                                
                                const phone = orderSnapshot.delivery_phone || '';
                                if (phone && setJson.whatsapp?.enabled && setJson.whatsapp?.sendOrderReadyMessage) {
                                    await WhatsAppService.sendOrderReadyMessage({
                                        tenantId,
                                        order: {
                                            id: orderId,
                                            type: orderType,
                                            phone: phone,
                                            name: orderSnapshot.customer_name || undefined
                                        },
                                        settings: setJson
                                    });
                                }
                            });
                        } catch (waErr) {
                            console.error('[WhatsApp Ready Notification Error]', waErr);
                        }
                    })();
                }
            }

            if (status === 'completed') {
                // ── TAMAMLANDI BİLDİRİMİ ──
                const orderType = result.order.order_type;
                io.to(room).emit('kitchen:ticket_completed', {
                    ticketId,
                    orderId: result.ticket.order_id,
                    orderType: orderType,
                    tableName: result.ticket.table_name,
                });
            }
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

export const updateTicketItemsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const ticketId = Number(req.params.id);
        const { items } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz items formatı' });
        }

        const ticket = await withTenant(tenantId, async (connection) => {
            await connection.query(
                `UPDATE kitchen_tickets SET items = ?::jsonb WHERE id = ?`,
                [JSON.stringify(items), ticketId]
            );

            // Fetch the updated ticket + order details for socket emitting
            const [[t]]: any = await connection.query(
                `SELECT kt.*, o.order_type, t.name as table_name_current 
                 FROM kitchen_tickets kt 
                 JOIN orders o ON kt.order_id = o.id 
                 LEFT JOIN tables t ON o.table_id = t.id 
                 WHERE kt.id = ?`,
                [ticketId]
            );
            return t;
        });

        // Hem mutfağı hem de garsonu anlık uyar (Kısmi teslimat senaryosu)
        const io = req.app.get('io');
        if (io) {
            const room = `tenant:${tenantId}`;
            io.to(room).emit('kitchen:ticket_updated', { ticketId });

            // Garson panelindeki Kısmi Teslimat havuzunu tetikleyecek soket (Masaya/Siparişe gidiyor)
            const tableName = ticket.table_name || ticket.table_name_current;
            if (tableName && ticket.order_type === 'dine_in') {
                io.to(room).emit('kitchen:item_partial_ready', {
                    ticketId,
                    orderId: ticket.order_id,
                    tableName: tableName,
                    items: items
                });
            }
        }

        res.json({ message: 'Fiş kalemleri güncellendi', ticket });
    } catch (error: any) {
        console.error('❌ Partial Items hatası:', error);
        res.status(500).json({ error: 'Kalemler güncellenemedi' });
    }
};
