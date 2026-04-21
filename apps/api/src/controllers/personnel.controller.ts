
import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';

/**
 * Mevcut kullanıcının (Kasiyer/Garson vs) kendi performans istatistiklerini getirir.
 * Bu endpoint /users/my-stats üzerinden çağrılacak ve düşük yetkili kullanıcılarca erişilebilir olacak.
 */
export const getMyStatsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const userId = req.user?.userId ?? null;
        if (!userId) return res.status(401).json({ error: 'Yetkilendirme gerekli' });
        const branchId = req.branchId || 1;

        const data = await withTenant(tenantId, async (conn: any) => {
            try {
                await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255) NULL`);
            } catch {
                /* ignore */
            }
            // 1. Genel Sipariş/Satış İatistikleri (Bugün)
            const [sales]: any = await conn.query(
                `SELECT
                    COUNT(id) as total_orders,
                    COALESCE(SUM(total_amount), 0) as total_revenue
                 FROM orders
                 WHERE (waiter_id = ? OR cashier_id = ? OR picked_up_by = ?)
                   AND created_at::date = CURRENT_DATE
                   AND status NOT IN ('cancelled')`,
                [userId, userId, userId]
            );

            // 2. Son Shift Bilgisi
            const [lastShift]: any = await conn.query(
                `SELECT * FROM staff_shifts
                 WHERE user_id = ?
                 ORDER BY clock_in DESC LIMIT 1`,
                [userId]
            );

            // 3. Tip (Bahşiş) İstatistikleri
            const [tips]: any = await conn.query(
                `SELECT COALESCE(SUM(tip_amount), 0) as total_tips
                 FROM payments
                 WHERE cashier_id = ? AND created_at::date = CURRENT_DATE`,
                [userId]
            );

            return {
                today: sales?.[0] || { total_orders: 0, total_revenue: 0 },
                lastShift: lastShift?.[0] || null,
                tipsToday: tips?.[0]?.total_tips || 0,
                userName: (req.user as any).name ?? req.user?.username ?? 'Kullanıcı',
                role: req.user?.role ?? 'unknown'
            };
        });

        res.json(data);
    } catch (e) {
        console.error('getMyStatsHandler:', e);
        res.status(500).json({ error: 'İstatistikler alınamadı' });
    }
};

/**
 * [ADMIN] Tüm personelin detaylı performans ve çalışma saati raporlarını getirir.
 */
export const getDetailedPersonnelStatsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);

        console.log(`[AdminReport] Detailed stats request: tenant=${tenantId}, from=${from}, to=${to}`);

        const data = await withTenant(tenantId, async (conn: any) => {
            console.log('  [1] Fetching users performance...');
            // 1. Tüm kullanıcıların genel performans metrikleri
            const [users]: any = await conn.query(
                `SELECT 
                    u.id, u.name, u.role, u.status,
                    (SELECT COUNT(*) FROM orders o WHERE o.waiter_id = u.id AND o.status = 'completed') as served_as_waiter,
                    (SELECT COUNT(*) FROM orders o WHERE o.cashier_id = u.id AND o.status = 'completed') as handled_as_cashier,
                    (SELECT COUNT(*) FROM orders o WHERE o.picked_up_by = u.id AND o.status = 'completed') as picked_ups,
                    (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE (o.waiter_id = u.id OR o.cashier_id = u.id) AND o.status = 'completed') as total_revenue_generated,
                    (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s.clock_out, CURRENT_TIMESTAMP) - s.clock_in))/60), 0) FROM staff_shifts s WHERE s.user_id = u.id) as total_work_mins
                 FROM users u
                 WHERE u.status = 'active'
                 ORDER BY u.role, u.name`
            );

            console.log(`  [2] Done. Users count: ${users.length}. Fetching shifts...`);

            // 2. Detaylı Shift Listesi (Tarih bazlı)
            let shiftQuery = `
                SELECT s.*, u.name as staff_name, u.role as staff_role
                FROM staff_shifts s
                JOIN users u ON s.user_id = u.id
                WHERE 1=1
            `;
            const shiftParams = [];
            if (from) { shiftQuery += " AND s.clock_in >= ?"; shiftParams.push(from); }
            if (to) { shiftQuery += " AND s.clock_in <= ?"; shiftParams.push(to); }
            shiftQuery += " ORDER BY s.clock_in DESC LIMIT 100";

            const [shifts]: any = await conn.query(shiftQuery, shiftParams);
            console.log(`  [3] Done. Shifts count: ${shifts.length}`);

            return {
                personnel: users,
                recentShifts: shifts
            };
        });

        res.json(data);
    } catch (e: any) {
        console.error('❌ Detailed personnel report error:', e.message, e.stack);
        res.status(500).json({ error: 'Personel detaylı raporu alınamadı' });
    }
};

/**
 * Mesai Başlat (Clock In)
 */
export const clockInHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const userId = req.user!.userId;

        await withTenant(tenantId, async (conn: any) => {
            // Açık shift kontrolü
            const [active]: any = await conn.query(
                `SELECT id FROM staff_shifts WHERE user_id = ? AND clock_out IS NULL LIMIT 1`,
                [userId]
            );

            if (active.length > 0) {
                return; // Zaten açık mesai var
            }

            await conn.query(
                `INSERT INTO staff_shifts (user_id, branch_id, clock_in) VALUES (?, ?, NOW())`,
                [userId, req.branchId || 1]
            );
        });

        res.json({ success: true, message: 'Mesai başlatıldı' });
    } catch (e) {
        res.status(500).json({ error: 'Mesai başlatılamadı' });
    }
};

/**
 * Mesai Bitir (Clock Out)
 */
export const clockOutHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const userId = req.user!.userId;

        await withTenant(tenantId, async (conn: any) => {
            const [active]: any = await conn.query(
                `SELECT id, clock_in FROM staff_shifts WHERE user_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
                [userId]
            );

            if (active.length === 0) {
                return;
            }

            const shift = active[0];
            
            // Performans verilerini topla (shift süresince)
            const [perf]: any = await conn.query(
                `SELECT 
                    COUNT(id) as o_count,
                    COALESCE(SUM(total_amount), 0) as o_sum
                 FROM orders
                 WHERE (waiter_id = ? OR cashier_id = ?)
                   AND created_at >= ?
                   AND status = 'completed'`,
                [userId, userId, shift.clock_in]
            );

            await conn.query(
                `UPDATE staff_shifts 
                 SET clock_out = NOW(),
                     duration_mins = EXTRACT(EPOCH FROM (NOW() - clock_in)) / 60,
                     total_sales = ?,
                     total_orders = ?
                 WHERE id = ?`,
                [perf[0].o_sum, perf[0].o_count, shift.id]
            );
        });

        res.json({ success: true, message: 'Mesai bitirildi' });
    } catch (e) {
        res.status(500).json({ error: 'Mesai bitirilemedi' });
    }
};
