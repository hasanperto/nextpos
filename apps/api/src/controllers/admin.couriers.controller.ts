import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';
import { presenceSnapshot } from '../socket/presenceRegistry.js';

/**
 * Üst seviye kurye istatistikleri (Bugünün özeti)
 */
export const listCourierStatsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const date = req.query.date ? String(req.query.date) : new Date().toISOString().split('T')[0];

        const data = await withTenant(tenantId, async (connection) => {
            // 🛡️ Self-healing: Ensure courier_settled exists
            try {
                await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_settled BOOLEAN DEFAULT FALSE`);
            } catch (err) {}

            // 1. Tüm aktif kuryeleri çek
            const [couriers]: any = await connection.query(
                `SELECT id, name, username, status
                 FROM users
                 WHERE role = 'courier' AND status = 'active'
                 ORDER BY name ASC`
            );

            // 2. Her kurye için bugünlük performans sayılarını hesapla
            const stats = [];
            
            // Presence snapshot'ı al (canlı konumlar için)
            const livePresence = presenceSnapshot(tenantId);

            for (const c of couriers) {
                // Bugün kaç paket teslim etti?
                // Toplam ne kadar nakit topladı? (payment_method_arrival = 'cash')
                const [perf]: any = await connection.query(
                    `SELECT 
                        COUNT(*)::int as total_deliveries,
                        COALESCE(SUM(CASE WHEN payment_method_arrival = 'cash' THEN total_amount ELSE 0 END), 0)::float as cash_collected,
                        COALESCE(SUM(CASE WHEN payment_method_arrival = 'cash' AND courier_settled = FALSE THEN total_amount ELSE 0 END), 0)::float as outstanding_cash,
                        COALESCE(SUM(CASE WHEN payment_method_arrival = 'card' THEN total_amount ELSE 0 END), 0)::float as card_collected,
                        COALESCE(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.picked_at)) / 60), 0)::float as avg_delivery_time
                     FROM orders o
                     JOIN deliveries d ON o.id = d.order_id
                     WHERE o.courier_id = ? 
                       AND d.delivered_at::date = ?::date
                       AND o.status = 'completed'`,
                    [c.id, date]
                );

                const live = livePresence.find(p => Number(p.userId) === Number(c.id));

                stats.push({
                    id: c.id,
                    name: c.name,
                    username: c.username,
                    isOnline: !!live,
                    location: live?.location || null,
                    lastSeen: live?.lastSeen || null,
                    today: perf[0] || {
                        total_deliveries: 0,
                        cash_collected: 0,
                        outstanding_cash: 0,
                        card_collected: 0,
                        avg_delivery_time: 0
                    }
                });
            }

            return stats;
        });

        res.json(data);
    } catch (error: any) {
        console.error('❌ Courier Stats Error:', error);
        res.status(500).json({ error: 'Kurye istatistikleri alınamadı' });
    }
};

/**
 * Belirli bir kuryenin detaylı geçmişi ve finansal dökümü
 */
export const getCourierDetailHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const courierId = req.params.id;
        const limit = Number(req.query.limit) || 20;

        const data = await withTenant(tenantId, async (connection) => {
            const [userRows]: any = await connection.query('SELECT id, name, username, role FROM users WHERE id = ?', [courierId]);
            if (!userRows.length) throw new Error('Kurye bulunamadı');
            const courier = userRows[0];

            // 1. Son teslimatları çek
            const [orders]: any = await connection.query(
                `SELECT o.id, o.total_amount, o.customer_name, o.delivery_address, o.payment_method_arrival, o.courier_settled,
                        d.picked_at, d.delivered_at,
                        EXTRACT(EPOCH FROM (d.delivered_at - d.picked_at)) / 60 as duration_mins
                 FROM orders o
                 JOIN deliveries d ON o.id = d.order_id
                 WHERE o.courier_id = ? AND o.status = 'completed'
                 ORDER BY d.delivered_at DESC
                 LIMIT ?`,
                [courierId, limit]
            );

            // 2. Kuryedeki toplam nakit (Gün sonu için teslim etmesi gereken)
            const [cashSummary]: any = await connection.query(
                `SELECT 
                    COALESCE(SUM(total_amount), 0)::float as outstanding_cash
                 FROM orders o
                 WHERE courier_id = ? 
                   AND payment_method_arrival = 'cash'
                   AND status = 'completed'
                   AND courier_settled = FALSE`,
                [courierId]
            );

            return {
                courier,
                recentOrders: orders,
                totalCashToDeliver: cashSummary[0]?.outstanding_cash || 0
            };
        });

        res.json(data);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Hata oluştu' });
    }
};

/**
 * Kuryedeki tüm bekleyen nakitleri toplu olarak 'settled' işaretle (Gün Sonu Tahsilatı)
 */
export const reconcileCourierCashHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const courierId = req.params.id;

        await withTenant(tenantId, async (connection) => {
            await connection.query(
                `UPDATE orders 
                 SET courier_settled = TRUE, updated_at = CURRENT_TIMESTAMP
                 WHERE courier_id = ? AND payment_method_arrival = 'cash' AND status = 'completed' AND courier_settled = FALSE`,
                [courierId]
            );
        });

        res.json({ success: true, message: 'Tahsilat başarıyla tamamlandı' });
    } catch (error: any) {
        res.status(500).json({ error: 'Tahsilat işlemi başarısız' });
    }
};
