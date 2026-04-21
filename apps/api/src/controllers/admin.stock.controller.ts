import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';
import { ensureStockRecipeSchema } from '../services/stock-inventory.service.js';

/** Kritik stok alarm listesi (stock_qty <= min_stock_qty). */
export const getLowStockAlertsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const limit = Math.min(300, Math.max(1, Number(req.query.limit ?? 100) || 100));

        const rows = await withTenant(tenantId, async (conn) => {
            await ensureStockRecipeSchema(conn);
            const [r]: any = await conn.query(
                `SELECT
                    p.id,
                    p.name,
                    COALESCE(p.stock_qty, 0)::text AS stock_qty,
                    COALESCE(p.min_stock_qty, 0)::text AS min_stock_qty,
                    GREATEST(0, COALESCE(p.min_stock_qty, 0) - COALESCE(p.stock_qty, 0))::text AS deficit_qty,
                    COALESCE(p.supplier_name, '') AS supplier_name,
                    COALESCE(p.last_purchase_price, 0)::text AS last_purchase_price,
                    p.last_purchase_at,
                    p.is_active,
                    (
                        SELECT sm.created_at
                        FROM stock_movements sm
                        WHERE sm.product_id = p.id
                        ORDER BY sm.id DESC
                        LIMIT 1
                    ) AS last_movement_at
                 FROM products p
                 WHERE COALESCE(p.stock_qty, 0) <= COALESCE(p.min_stock_qty, 0)
                 ORDER BY deficit_qty::numeric DESC, p.name ASC
                 LIMIT ?`,
                [limit]
            );
            return Array.isArray(r) ? r : [];
        });

        res.json({ rows });
    } catch (e) {
        console.error('getLowStockAlertsHandler', e);
        res.status(500).json({ error: 'Kritik stok alarmları alınamadı' });
    }
};

/** Reçete kaynaklı tüketim özeti (sipariş düşümü − iptal iadesi), tarih aralığında hammaddelere göre. */
export const getStockConsumptionReportHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return res.status(400).json({ error: 'from ve to YYYY-MM-DD formatında olmalıdır' });
        }

        const rows = await withTenant(tenantId, async (conn) => {
            await ensureStockRecipeSchema(conn);
            const [r]: any = await conn.query(
                `SELECT x.product_id,
                        x.product_name,
                        x.consumed::text AS consumed,
                        x.restored::text AS restored,
                        x.net_consumed::text AS net_consumed
                 FROM (
                    SELECT
                        sm.product_id,
                        p.name AS product_name,
                        COALESCE(SUM(CASE WHEN sm.reason = 'order_recipe_deduction' THEN ABS(sm.delta_qty) ELSE 0 END), 0) AS consumed,
                        COALESCE(SUM(CASE WHEN sm.reason = 'order_cancel_restore' THEN sm.delta_qty ELSE 0 END), 0) AS restored,
                        COALESCE(SUM(CASE WHEN sm.reason = 'order_recipe_deduction' THEN ABS(sm.delta_qty) ELSE 0 END), 0)
                          - COALESCE(SUM(CASE WHEN sm.reason = 'order_cancel_restore' THEN sm.delta_qty ELSE 0 END), 0) AS net_consumed
                    FROM stock_movements sm
                    INNER JOIN products p ON p.id = sm.product_id
                    WHERE sm.created_at >= ?::date
                      AND sm.created_at < (?::date + INTERVAL '1 day')
                      AND sm.reason IN ('order_recipe_deduction', 'order_cancel_restore')
                    GROUP BY sm.product_id, p.name
                    HAVING COALESCE(SUM(CASE WHEN sm.reason = 'order_recipe_deduction' THEN ABS(sm.delta_qty) ELSE 0 END), 0) > 0
                       OR COALESCE(SUM(CASE WHEN sm.reason = 'order_cancel_restore' THEN sm.delta_qty ELSE 0 END), 0) > 0
                 ) x
                 ORDER BY x.net_consumed DESC`,
                [from, to]
            );
            return Array.isArray(r) ? r : [];
        });

        res.json({ from, to, rows });
    } catch (e) {
        console.error('getStockConsumptionReportHandler', e);
        res.status(500).json({ error: 'Stok tüketim raporu alınamadı' });
    }
};
