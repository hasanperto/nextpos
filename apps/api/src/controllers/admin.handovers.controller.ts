import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';

/**
 * Personele Ait Kasa Gün Sonu Nakit ve Aylık Kart Bahşiş Hakedişlerini Hesplar
 */
export const listStaffBalancesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;

        const data = await withTenant(tenantId, async (connection) => {
            // 🛡️ Self-Healing Database Schema
            try {
                await connection.query(`
                    ALTER TABLE payments 
                    ADD COLUMN IF NOT EXISTS waiter_settled BOOLEAN NOT NULL DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS tip_settled BOOLEAN NOT NULL DEFAULT FALSE
                `);
            } catch (e) {
                console.error('Failed to alter payments table:', e);
            }

            try {
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS staff_handovers (
                        id SERIAL PRIMARY KEY,
                        staff_id INT NOT NULL,
                        cashier_id INT NOT NULL,
                        amount DECIMAL(10, 2) NOT NULL,
                        type VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash' (daily cash) or 'tips' (monthly tips)
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            } catch (e) {
                console.error('Failed to create staff_handovers table:', e);
            }

            // 1. Aktif Garson ve Kuryeleri Getir
            const [staffList]: any = await connection.query(`
                SELECT id, name, username, role, status
                FROM users
                WHERE role IN ('waiter', 'courier') AND status = 'active'
                ORDER BY role DESC, name ASC
            `);

            const result = [];

            for (const staff of staffList) {
                let cashInHand = 0;
                let accumulatedCardTips = 0;

                if (staff.role === 'waiter') {
                    // Garsonun tahsil ettiği ve teslim etmediği nakitler (payments tablosundan)
                    const [cashRes]: any = await connection.query(`
                        SELECT COALESCE(SUM(amount), 0)::float as cash
                        FROM payments
                        WHERE cashier_id = ? 
                          AND method = 'cash' 
                          AND status = 'completed'
                          AND waiter_settled = FALSE
                    `, [staff.id]);
                    cashInHand = cashRes[0]?.cash || 0;

                    // Garsonun masalardan kazandığı ve ödenmeyen kart/online bahşişler
                    const [tipsRes]: any = await connection.query(`
                        SELECT COALESCE(SUM(p.tip_amount), 0)::float as tips
                        FROM payments p
                        JOIN orders o ON p.order_id = o.id
                        WHERE o.waiter_id = ?
                          AND o.order_type = 'dine_in'
                          AND p.status = 'completed'
                          AND p.method IN ('card', 'online')
                          AND p.tip_amount > 0
                          AND p.tip_settled = FALSE
                    `, [staff.id]);
                    accumulatedCardTips = tipsRes[0]?.tips || 0;

                } else if (staff.role === 'courier') {
                    // Kuryenin paket teslimatlarından topladığı ve kasaya teslim etmediği nakitler (orders tablosundan)
                    const [cashRes]: any = await connection.query(`
                        SELECT COALESCE(SUM(total_amount), 0)::float as cash
                        FROM orders
                        WHERE courier_id = ?
                          AND payment_method_arrival = 'cash'
                          AND status = 'completed'
                          AND courier_settled = FALSE
                    `, [staff.id]);
                    cashInHand = cashRes[0]?.cash || 0;

                    // Kuryenin kapıda kart/online ödemeden kazandığı ve ödenmeyen bahşişler (orders.picked_up_by veya courier_id)
                    const [tipsRes]: any = await connection.query(`
                        SELECT COALESCE(SUM(p.tip_amount), 0)::float as tips
                        FROM payments p
                        JOIN orders o ON p.order_id = o.id
                        WHERE (o.courier_id = ? OR o.picked_up_by::text = ?::text)
                          AND o.order_type = 'delivery'
                          AND p.status = 'completed'
                          AND p.method IN ('card', 'online')
                          AND p.tip_amount > 0
                          AND p.tip_settled = FALSE
                    `, [staff.id, String(staff.id)]);
                    accumulatedCardTips = tipsRes[0]?.tips || 0;
                }

                result.push({
                    id: staff.id,
                    name: staff.name,
                    username: staff.username,
                    role: staff.role,
                    cashInHand,
                    accumulatedCardTips
                });
            }

            return result;
        });

        res.json(data);
    } catch (error: any) {
        console.error('❌ listStaffBalancesHandler error:', error);
        res.status(500).json({ error: 'Personel finansal bakiyeleri alınamadı' });
    }
};

/**
 * Personelin Eldeki Nakit Kasa Gün Sonu Teslimatını Gerçekleştirir (Tahsilat Teslimi)
 */
export const settleStaffCashHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const cashierId = req.user!.userId;
        const staffId = Number(req.params.id);
        const { role, amount } = req.body;

        if (!staffId || !role) {
            return res.status(400).json({ error: 'Personel ID ve rolü gereklidir' });
        }

        const settledAmount = await withTenantTransaction(tenantId, async (connection) => {
            let totalSettled = 0;

            if (role === 'waiter') {
                // 1. Önce toplam miktarı doğrulamak için hesapla
                const [cashRes]: any = await connection.query(`
                    SELECT COALESCE(SUM(amount), 0)::float as cash
                    FROM payments
                    WHERE cashier_id = ? 
                      AND method = 'cash' 
                      AND status = 'completed'
                      AND waiter_settled = FALSE
                `, [staffId]);
                totalSettled = cashRes[0]?.cash || 0;

                // 2. Garson nakit ödemelerini teslim edildi olarak güncelle
                await connection.query(`
                    UPDATE payments
                    SET waiter_settled = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE cashier_id = ? 
                      AND method = 'cash' 
                      AND status = 'completed'
                      AND waiter_settled = FALSE
                `, [staffId]);

            } else if (role === 'courier') {
                // 1. Önce toplam miktarı doğrulamak için hesapla
                const [cashRes]: any = await connection.query(`
                    SELECT COALESCE(SUM(total_amount), 0)::float as cash
                    FROM orders
                    WHERE courier_id = ?
                      AND payment_method_arrival = 'cash'
                      AND status = 'completed'
                      AND courier_settled = FALSE
                `, [staffId]);
                totalSettled = cashRes[0]?.cash || 0;

                // 2. Kurye siparişlerini teslim edildi olarak güncelle
                await connection.query(`
                    UPDATE orders
                    SET courier_settled = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE courier_id = ?
                      AND payment_method_arrival = 'cash'
                      AND status = 'completed'
                      AND courier_settled = FALSE
                `, [staffId]);
            }

            if (totalSettled > 0) {
                // 3. Mutabakat Defterine Kayıt Ekle
                await connection.query(`
                    INSERT INTO staff_handovers (staff_id, cashier_id, amount, type)
                    VALUES (?, ?, ?, 'cash')
                `, [staffId, cashierId, totalSettled]);
            }

            return totalSettled;
        });

        res.json({ success: true, message: 'Nakit tahsilat kasaya başarıyla teslim edildi', settledAmount });
    } catch (error: any) {
        console.error('❌ settleStaffCashHandler error:', error);
        res.status(500).json({ error: 'Kasa teslimat işlemi gerçekleştirilemedi' });
    }
};

/**
 * Personelin Aylık Birikmiş Kredi Kartı Bahşiş Hakedişini Öder (Bahşiş Ödemesi)
 */
export const settleStaffTipsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const cashierId = req.user!.userId;
        const staffId = Number(req.params.id);
        const { role } = req.body;

        if (!staffId || !role) {
            return res.status(400).json({ error: 'Personel ID ve rolü gereklidir' });
        }

        const settledTips = await withTenantTransaction(tenantId, async (connection) => {
            let totalTips = 0;

            if (role === 'waiter') {
                // 1. Ödenmeyen toplam kart bahşişlerini hesapla
                const [tipsRes]: any = await connection.query(`
                    SELECT COALESCE(SUM(p.tip_amount), 0)::float as tips
                    FROM payments p
                    JOIN orders o ON p.order_id = o.id
                    WHERE o.waiter_id = ?
                      AND o.order_type = 'dine_in'
                      AND p.status = 'completed'
                      AND p.method IN ('card', 'online')
                      AND p.tip_amount > 0
                      AND p.tip_settled = FALSE
                `, [staffId]);
                totalTips = tipsRes[0]?.tips || 0;

                if (totalTips > 0) {
                    // 2. Garson bahşişlerini ödendi işaretle
                    await connection.query(`
                        UPDATE payments p
                        SET tip_settled = TRUE, updated_at = CURRENT_TIMESTAMP
                        FROM orders o
                        WHERE p.order_id = o.id
                          AND o.waiter_id = ?
                          AND o.order_type = 'dine_in'
                          AND p.status = 'completed'
                          AND p.method IN ('card', 'online')
                          AND p.tip_amount > 0
                          AND p.tip_settled = FALSE
                    `, [staffId]);
                }

            } else if (role === 'courier') {
                // 1. Ödenmeyen toplam kurye kart bahşişlerini hesapla
                const [tipsRes]: any = await connection.query(`
                    SELECT COALESCE(SUM(p.tip_amount), 0)::float as tips
                    FROM payments p
                    JOIN orders o ON p.order_id = o.id
                    WHERE (o.courier_id = ? OR o.picked_up_by::text = ?::text)
                      AND o.order_type = 'delivery'
                      AND p.status = 'completed'
                      AND p.method IN ('card', 'online')
                      AND p.tip_amount > 0
                      AND p.tip_settled = FALSE
                `, [staffId, String(staffId)]);
                totalTips = tipsRes[0]?.tips || 0;

                if (totalTips > 0) {
                    // 2. Kurye bahşişlerini ödendi işaretle
                    await connection.query(`
                        UPDATE payments p
                        SET tip_settled = TRUE, updated_at = CURRENT_TIMESTAMP
                        FROM orders o
                        WHERE p.order_id = o.id
                          AND (o.courier_id = ? OR o.picked_up_by::text = ?::text)
                          AND o.order_type = 'delivery'
                          AND p.status = 'completed'
                          AND p.method IN ('card', 'online')
                          AND p.tip_amount > 0
                          AND p.tip_settled = FALSE
                    `, [staffId, String(staffId)]);
                }
            }

            if (totalTips > 0) {
                // 3. Mutabakat Defterine Kayıt Ekle
                await connection.query(`
                    INSERT INTO staff_handovers (staff_id, cashier_id, amount, type)
                    VALUES (?, ?, ?, 'tips')
                `, [staffId, cashierId, totalTips]);
            }

            return totalTips;
        });

        res.json({ success: true, message: 'Personel bahşiş ödemesi başarıyla gerçekleştirildi', settledTips });
    } catch (error: any) {
        console.error('❌ settleStaffTipsHandler error:', error);
        res.status(500).json({ error: 'Bahşiş hakediş ödeme işlemi gerçekleştirilemedi' });
    }
};
