import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';

/** Restoran admin özet — tek istek, PostgreSQL uyumlu sorgular */
export const getDashboardHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;

        const payload = await withTenant(tenantId, async (conn) => {
            const branchClause = req.branchId ? ' AND branch_id = ?' : '';
            const branchClauseO = req.branchId ? ' AND o.branch_id = ?' : '';
            const branchParams: any[] = req.branchId ? [req.branchId] : [];

            const [hourlyRows]: any = await conn.query(
                `SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                        COUNT(*)::int AS order_count,
                        COALESCE(SUM(total_amount), 0)::float AS revenue
                 FROM orders
                 WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP)
                   AND created_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'
                   AND deleted_at IS NULL
                   ${branchClause}
                 GROUP BY EXTRACT(HOUR FROM created_at)
                 ORDER BY hour`,
                branchParams
            );

            const hourly: { hour: number; order_count: number; revenue: number }[] = [];
            for (let h = 0; h < 24; h++) {
                const row = Array.isArray(hourlyRows)
                    ? hourlyRows.find((x: any) => Number(x.hour) === h)
                    : null;
                hourly.push({
                    hour: h,
                    order_count: row ? Number(row.order_count) : 0,
                    revenue: row ? Number(row.revenue) : 0,
                });
            }

            const [pendingRows]: any = await conn.query(
                `SELECT COUNT(*)::int AS cnt,
                        COALESCE(SUM(total_amount), 0)::float AS total
                 FROM orders
                 WHERE payment_status = 'unpaid'
                   AND status NOT IN ('cancelled')
                   AND deleted_at IS NULL
                   ${branchClause}`,
                branchParams
            );
            const pending = pendingRows?.[0] || { cnt: 0, total: 0 };

            const [kitchenRows]: any = await conn.query(
                `SELECT status, COUNT(*)::int AS cnt
                 FROM kitchen_tickets
                 WHERE status IN ('waiting', 'preparing', 'ready')
                 GROUP BY status`
            );
            const kitchen: Record<string, number> = {};
            if (Array.isArray(kitchenRows)) {
                for (const r of kitchenRows) {
                    kitchen[String(r.status)] = Number(r.cnt);
                }
            }

            const [deliveryRows]: any = await conn.query(
                `SELECT status, COUNT(*)::int AS cnt
                 FROM deliveries
                 WHERE status IN ('pending', 'assigned', 'picked_up', 'on_the_way')
                 GROUP BY status`
            );
            const deliveries: Record<string, number> = {};
            if (Array.isArray(deliveryRows)) {
                for (const r of deliveryRows) {
                    deliveries[String(r.status)] = Number(r.cnt);
                }
            }

            const [courierRows]: any = await conn.query(
                `SELECT COUNT(*)::int AS cnt FROM couriers WHERE is_active = true`
            );
            const activeCouriers = Number(courierRows?.[0]?.cnt ?? 0);

            const [topRows]: any = await conn.query(
                `SELECT p.id, p.name,
                        COALESCE(SUM(oi.quantity), 0)::float AS qty,
                        COALESCE(SUM(oi.total_price), 0)::float AS revenue
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 JOIN products p ON oi.product_id = p.id
                 WHERE o.created_at >= date_trunc('day', CURRENT_TIMESTAMP)
                   AND o.created_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'
                   AND o.deleted_at IS NULL
                   ${branchClauseO}
                 GROUP BY p.id, p.name
                 ORDER BY qty DESC
                 LIMIT 5`,
                branchParams
            );

            const [branchRows]: any = await conn.query(
                `SELECT id, name, is_online, last_sync FROM branches ORDER BY id ASC`
            );

            const [tableStats]: any = await conn.query(
                `SELECT
                    COUNT(*)::int AS total,
                    SUM(CASE WHEN current_session_id IS NOT NULL THEN 1 ELSE 0 END)::int AS occupied
                 FROM tables`
            );
            const ts = tableStats?.[0] || { total: 0, occupied: 0 };

            const [ordersToday]: any = await conn.query(
                `SELECT COUNT(*)::int AS cnt FROM orders
                 WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP)
                   AND created_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'
                   AND status != 'cancelled'
                   AND deleted_at IS NULL
                   ${branchClause}`,
                branchParams
            );

            const [revToday]: any = await conn.query(
                `SELECT COALESCE(SUM(total_amount), 0)::float AS rev FROM orders
                 WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP)
                   AND created_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'
                   AND (status = 'completed' OR payment_status = 'paid')
                   AND deleted_at IS NULL
                   ${branchClause}`,
                branchParams
            );

            return {
                hourly,
                heatmap: hourly,
                pendingPayments: {
                    count: Number(pending.cnt ?? pending.count ?? 0),
                    totalAmount: Number(pending.total ?? 0),
                },
                kitchen,
                deliveries,
                activeCouriers,
                topProducts: Array.isArray(topRows) ? topRows : [],
                branches: Array.isArray(branchRows) ? branchRows : [],
                tables: {
                    total: Number(ts.total),
                    occupied: Number(ts.occupied),
                },
                ordersToday: Number(ordersToday?.[0]?.cnt ?? 0),
                revenueToday: Number(revToday?.[0]?.rev ?? 0),
            };
        });

        res.json(payload);
    } catch (error) {
        console.error('admin dashboard:', error);
        res.status(500).json({ error: 'Özet yüklenemedi' });
    }
};
