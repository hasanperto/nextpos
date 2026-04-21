/** Kiracı şeması bağlantısı (pg/mysql uyumlu .query) */
export type TenantDbConnection = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

/** Tier bazlı bonus çarpanları */
const TIER_BONUS_MULTIPLIER: Record<string, number> = {
    gold: 1.5,   // Gold: %50 bonus (10 TL yerine 15 TL = 1.5 puan)
    silver: 1.2, // Silver: %20 bonus (10 TL yerine 12 TL = 1.2 puan)
    bronze: 1.0, // Bronze: standart
};

/**
 * Müşteriye harcamasına göre puan kazandırır.
 * Varsayılan: 10 TL = 1 Puan (%10)
 * Tier bonusu: Bronze=1x, Silver=1.2x, Gold=1.5x
 */
export async function rewardLoyaltyPoints(
    connection: TenantDbConnection,
    customerId: number,
    amount: number,
    orderId?: number
) {
    if (!customerId || amount <= 0) return;

    // Mevcut tier'ı al
    const [rows]: any = await connection.query(
        'SELECT loyalty_tier FROM customers WHERE id = ?',
        [customerId]
    );
    const tier = rows?.[0]?.loyalty_tier || 'bronze';
    const multiplier = TIER_BONUS_MULTIPLIER[tier] ?? 1.0;

    // Tier bonuslu puan hesabı
    const basePoints = Math.floor(amount / 10);
    const bonusPoints = Math.floor(basePoints * (multiplier - 1));
    const totalPoints = Math.floor(basePoints * multiplier);

    if (totalPoints <= 0) return;

    // 1. Puanları ekle ve toplam harcamayı güncelle
    await connection.query(
        `UPDATE customers
         SET reward_points = reward_points + ?,
             total_spent = total_spent + ?,
             last_visit_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [totalPoints, amount, customerId]
    );

    // 2. Tier değişikliğini kontrol et (puan artışına bağlı)
    await connection.query(`
        UPDATE customers
        SET loyalty_tier = CASE
            WHEN reward_points >= 5000 THEN 'gold'
            WHEN reward_points >= 2000 THEN 'silver'
            ELSE 'bronze'
        END
        WHERE id = ?
    `, [customerId]);

    // 3. Puan geçmişi (base + bonus ayrı kayıtlar)
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS customer_point_history (
                id SERIAL PRIMARY KEY,
                customer_id INT NOT NULL,
                order_id INT,
                base_points INT NOT NULL,
                bonus_points INT DEFAULT 0,
                multiplier DECIMAL(3,2) DEFAULT 1.00,
                type VARCHAR(20) DEFAULT 'earn',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await connection.query(
            `INSERT INTO customer_point_history (customer_id, order_id, base_points, bonus_points, multiplier, type)
             VALUES (?, ?, ?, ?, ?, 'earn')`,
            [customerId, orderId || null, basePoints, bonusPoints, multiplier]
        );
    } catch (e) {}
}

/**
 * Sipariş iptalinde puanları geri al.
 * Önceden eklenen puanları düşer ve tier'ı yeniden hesaplar.
 */
export async function reverseLoyaltyPoints(
    connection: TenantDbConnection,
    customerId: number,
    amount: number,
    orderId?: number
) {
    if (!customerId || amount <= 0) return;

    let pointsToSubtract = 0;
    if (orderId != null) {
        try {
            const [hist]: any = await connection.query(
                `SELECT base_points, bonus_points FROM customer_point_history
                 WHERE customer_id = ? AND order_id = ? AND type = 'earn'
                 ORDER BY id DESC LIMIT 1`,
                [customerId, orderId]
            );
            const h = hist?.[0];
            if (h && (Number(h.base_points) > 0 || Number(h.bonus_points) > 0)) {
                pointsToSubtract = Number(h.base_points ?? 0) + Number(h.bonus_points ?? 0);
            }
        } catch {
            /* tablo yok */
        }
    }

    if (pointsToSubtract <= 0) {
        const [rows]: any = await connection.query(
            'SELECT loyalty_tier FROM customers WHERE id = ?',
            [customerId]
        );
        const tier = rows?.[0]?.loyalty_tier || 'bronze';
        const multiplier = TIER_BONUS_MULTIPLIER[tier] ?? 1.0;
        const basePoints = Math.floor(amount / 10);
        pointsToSubtract = Math.floor(basePoints * multiplier);
    }
    if (pointsToSubtract <= 0) return;

    await connection.query(
        `UPDATE customers
         SET reward_points = GREATEST(0, reward_points - ?),
             total_spent = GREATEST(0, total_spent - ?)
         WHERE id = ?`,
        [pointsToSubtract, amount, customerId]
    );

    // Tier'ı yeniden hesapla
    await connection.query(`
        UPDATE customers
        SET loyalty_tier = CASE
            WHEN reward_points >= 5000 THEN 'gold'
            WHEN reward_points >= 2000 THEN 'silver'
            ELSE 'bronze'
        END
        WHERE id = ?
    `, [customerId]);

    // İptal geçmişini kaydet
    try {
        await connection.query(
            `INSERT INTO customer_point_history (customer_id, order_id, base_points, bonus_points, type)
             VALUES (?, ?, ?, 0, 'reversal')`,
            [customerId, orderId || null, pointsToSubtract]
        );
    } catch (e) {}
}
