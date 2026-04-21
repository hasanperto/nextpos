/**
 * NextPOS — Kupon & Kampanya Servisi
 *
 * Özel gün kampanyaları, indirim kuponları, puan promosyonları
 * Çoklu tenant desteği (her tenant kendi kampanyalarını yönetir)
 */

import { withTenant } from '../lib/db.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TİP TANIMLARI
// ═══════════════════════════════════════════════════════════════════════════════

export type DiscountType = 'percent' | 'fixed' | 'free_item' | 'free_delivery';
export type CouponStatus = 'active' | 'paused' | 'expired' | 'depleted';
export type AudienceFilter = 'all' | 'tier_bronze' | 'tier_silver' | 'tier_gold' | 'new_customer' | 'vip';

export interface Campaign {
    id: number;
    tenant_id: string;
    name: string;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;           // % yüzde veya TL tutar
    discount_item_id?: number | null; // free_item için ürün ID
    target_category_id?: number | null;
    target_product_id?: number | null;
    applicable_order_types: string;
    min_order_amount: number;         // minimum sipariş tutarı
    max_discount_amount?: number | null; // maksimum indirim tutarı (percent için)
    start_date: Date | string;
    end_date: Date | string;
    usage_limit_total?: number | null;  // toplam kullanım limiti
    usage_limit_per_customer?: number | null; // müşteri başı limit
    usage_count: number;
    audience_filter: AudienceFilter;
    is_auto_apply: boolean;          // otomatik uygulansın mı
    status: CouponStatus;
    created_at: Date | string;
    updated_at: Date | string;
}

export interface Coupon {
    id: number;
    tenant_id: string;
    campaign_id?: number | null;
    discount_item_id?: number | null;
    code: string;                    // benzersiz kod
    customer_id?: number | null;     // kişiye özel kupon
    phone?: string | null;           // telefon ile dağıtım
    email?: string | null;
    discount_type: DiscountType;
    discount_value: number;
    target_category_id?: number | null;
    target_product_id?: number | null;
    applicable_order_types: string;
    min_order_amount: number;
    max_discount_amount?: number | null;
    valid_from: Date | string;
    valid_until: Date | string;
    usage_limit: number;             // 0 = sınırsız
    usage_count: number;             // kaç kez kullanıldı
    status: CouponStatus;
    created_at: Date | string;
    redeemed_at?: Date | string | null;
}

export interface CouponValidationResult {
    valid: boolean;
    error?: string;
    coupon?: Partial<Coupon>;
    discount_amount?: number;
    discount_description?: string;
}

export interface RedeemResult {
    success: boolean;
    error?: string;
    discount_applied?: number;
    points_earned?: number;
    free_item?: { id: number; name: string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KAMPANYA & KUPON TABLOSU OLUŞTURMA (Self-healing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tenant şemasında kampanya ve kupon tablolarını oluşturur (yoksa)
 */
export async function ensureCouponTables(tenantId: string): Promise<void> {
    await withTenant(tenantId, async (connection) => {
        try {
            // Kampanyalar tablosu
            await connection.query(`
                CREATE TABLE IF NOT EXISTS campaigns (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed', 'free_item', 'free_delivery')),
                    discount_value DECIMAL(10,2) NOT NULL,
                    discount_item_id INT NULL,
                    target_category_id INT NULL,
                    target_product_id INT NULL,
                    applicable_order_types VARCHAR(100) NOT NULL DEFAULT 'all',
                    min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
                    max_discount_amount DECIMAL(10,2) NULL,
                    start_date TIMESTAMP NOT NULL,
                    end_date TIMESTAMP NOT NULL,
                    usage_limit_total INT NULL,
                    usage_limit_per_customer INT NULL,
                    usage_count INT NOT NULL DEFAULT 0,
                    audience_filter VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (audience_filter IN ('all', 'tier_bronze', 'tier_silver', 'tier_gold', 'new_customer', 'vip')),
                    is_auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
                    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'depleted')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_campaign_tenant ON campaigns(tenant_id)`);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_campaign_status ON campaigns(status)`);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_campaign_dates ON campaigns(start_date, end_date)`);
        } catch (e: any) {
            if (e.code !== 'ER_TABLE_EXISTS_ERROR' && e.code !== '42P07') console.error('ensureCouponTables (campaigns):', e.message);
        }

        try {
            // Kuponlar tablosu
            await connection.query(`
                CREATE TABLE IF NOT EXISTS coupons (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(36) NOT NULL,
                    campaign_id INT NULL,
                    code VARCHAR(50) NOT NULL UNIQUE,
                    customer_id INT NULL,
                    phone VARCHAR(30) NULL,
                    email VARCHAR(100) NULL,
                    discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed', 'free_item', 'free_delivery')),
                    discount_value DECIMAL(10,2) NOT NULL,
                    target_category_id INT NULL,
                    target_product_id INT NULL,
                    applicable_order_types VARCHAR(100) NOT NULL DEFAULT 'all',
                    min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
                    max_discount_amount DECIMAL(10,2) NULL,
                    valid_from TIMESTAMP NOT NULL,
                    valid_until TIMESTAMP NOT NULL,
                    usage_limit INT NOT NULL DEFAULT 0,
                    usage_count INT NOT NULL DEFAULT 0,
                    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'depleted')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    redeemed_at TIMESTAMP NULL,
                    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
                    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
                )
            `);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_coupon_code ON coupons(code)`);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_coupon_tenant ON coupons(tenant_id)`);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_coupon_customer ON coupons(customer_id)`);
            await connection.query(`CREATE INDEX IF NOT EXISTS idx_coupon_status ON coupons(status)`);
        } catch (e: any) {
             if (e.code !== 'ER_TABLE_EXISTS_ERROR' && e.code !== '42P07') console.error('ensureCouponTables (coupons):', e.message);
        }

        try {
            // Kupon kullanım geçmişi
            await connection.query(`
                CREATE TABLE IF NOT EXISTS coupon_usage_log (
                    id SERIAL PRIMARY KEY,
                    coupon_id INT NOT NULL,
                    order_id INT NOT NULL,
                    customer_id INT NULL,
                    discount_amount DECIMAL(10,2) NOT NULL,
                    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE RESTRICT,
                    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
                )
            `);
        } catch (e: any) {
            if (e.code !== 'ER_TABLE_EXISTS_ERROR' && e.code !== '42P07') console.error('ensureCouponTables (log):', e.message);
        }

        // Yeni sütunları ekle (Migration)
        try {
            await connection.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_category_id INT NULL`);
            await connection.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_product_id INT NULL`);
            await connection.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS applicable_order_types VARCHAR(100) NOT NULL DEFAULT 'all'`);
            
            await connection.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS target_category_id INT NULL`);
            await connection.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS target_product_id INT NULL`);
            await connection.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applicable_order_types VARCHAR(100) NOT NULL DEFAULT 'all'`);
        } catch (e: any) {
            // Ignore column already exists errors
            if (e.code !== '42701') console.error('ensureCouponTables (alter):', e.message);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KAMPANYA YÖNETİMİ (CRUD)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateCampaignInput {
    name: string;
    description?: string;
    discount_type: DiscountType;
    discount_value: number;
    discount_item_id?: number;
    target_category_id?: number;
    target_product_id?: number;
    applicable_order_types?: string;
    min_order_amount?: number;
    max_discount_amount?: number;
    start_date: string;
    end_date: string;
    usage_limit_total?: number;
    usage_limit_per_customer?: number;
    audience_filter?: AudienceFilter;
    is_auto_apply?: boolean;
}

export async function createCampaign(
    tenantId: string,
    data: CreateCampaignInput
): Promise<Campaign> {
    await ensureCouponTables(tenantId);

    const [result]: any = await withTenant(tenantId, async (connection) => {
        return connection.query(
            `INSERT INTO campaigns
                (tenant_id, name, description, discount_type, discount_value, discount_item_id,
                 target_category_id, target_product_id, applicable_order_types,
                 min_order_amount, max_discount_amount, start_date, end_date,
                 usage_limit_total, usage_limit_per_customer, audience_filter, is_auto_apply)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [
                tenantId,
                data.name,
                data.description || null,
                data.discount_type,
                data.discount_value,
                data.discount_item_id || null,
                data.target_category_id || null,
                data.target_product_id || null,
                data.applicable_order_types || 'all',
                data.min_order_amount || 0,
                data.max_discount_amount || null,
                new Date(data.start_date),
                new Date(data.end_date),
                data.usage_limit_total || null,
                data.usage_limit_per_customer || null,
                data.audience_filter || 'all',
                data.is_auto_apply || false,
            ]
        );
    });

    const insertId = result[0]?.id || result.insertId;
    const campaign = await getCampaignById(tenantId, insertId);
    if (!campaign) {
        throw new Error('Kampanya oluşturuldu ancak geri yüklenemedi');
    }
    return campaign;
}

export async function getCampaignById(tenantId: string, campaignId: number): Promise<Campaign | null> {
    const [rows]: any = await withTenant(tenantId, async (connection) => {
        return connection.query('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    });
    return rows[0] || null;
}

export async function getCampaigns(tenantId: string, status?: CouponStatus): Promise<Campaign[]> {
    return withTenant(tenantId, async (connection) => {
        let query = 'SELECT * FROM campaigns WHERE tenant_id = ?';
        const params: any[] = [tenantId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';
        const [rows]: any = await connection.query(query, params);
        return rows;
    });
}

export async function updateCampaign(
    tenantId: string,
    campaignId: number,
    data: Partial<CreateCampaignInput>
): Promise<Campaign> {
    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
        name: 'name',
        description: 'description',
        discount_type: 'discount_type',
        discount_value: 'discount_value',
        discount_item_id: 'discount_item_id',
        target_category_id: 'target_category_id',
        target_product_id: 'target_product_id',
        applicable_order_types: 'applicable_order_types',
        min_order_amount: 'min_order_amount',
        max_discount_amount: 'max_discount_amount',
        start_date: 'start_date',
        end_date: 'end_date',
        usage_limit_total: 'usage_limit_total',
        usage_limit_per_customer: 'usage_limit_per_customer',
        audience_filter: 'audience_filter',
        is_auto_apply: 'is_auto_apply',
        status: 'status',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
        if (key in data) {
            updates.push(`${dbField} = ?`);
            let val = (data as any)[key];
            if (key === 'start_date' || key === 'end_date') {
                val = new Date(val as string);
            }
            values.push(val);
        }
    }

    if (updates.length === 0) {
        return getCampaignById(tenantId, campaignId) as Promise<Campaign>;
    }

    values.push(campaignId, tenantId);

    await withTenant(tenantId, async (connection) => {
        await connection.query(
            `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
            values
        );
    });

    return getCampaignById(tenantId, campaignId) as Promise<Campaign>;
}

export async function deleteCampaign(tenantId: string, campaignId: number): Promise<void> {
    await withTenant(tenantId, async (connection) => {
        await connection.query(
            'DELETE FROM campaigns WHERE id = ? AND tenant_id = ?',
            [campaignId, tenantId]
        );
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KUPON ÜRETİMİ & YÖNETİMİ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rastgele benzersiz kupon kodu üretir
 */
function generateCouponCode(prefix: string = 'NXP', length: number = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = prefix.toUpperCase();
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Tek bir kupon kodu oluşturur
 */
export async function createCoupon(
    tenantId: string,
    data: {
        campaign_id?: number;
        customer_id?: number;
        phone?: string;
        email?: string;
        discount_type: DiscountType;
        discount_value: number;
        target_category_id?: number;
        target_product_id?: number;
        applicable_order_types?: string;
        min_order_amount?: number;
        max_discount_amount?: number;
        valid_from?: string;
        valid_until: string;
        usage_limit?: number;
    }
): Promise<Coupon> {
    await ensureCouponTables(tenantId);

    let code = generateCouponCode();
    // Benzersiz kod
    let attempts = 0;
    while (attempts < 5) {
        const [existing]: any = await withTenant(tenantId, async (connection) => {
            return connection.query('SELECT id FROM coupons WHERE code = ?', [code]);
        });
        if (!existing.length) break;
        code = generateCouponCode();
        attempts++;
    }

    const [result]: any = await withTenant(tenantId, async (connection) => {
        return connection.query(
            `INSERT INTO coupons
                (tenant_id, campaign_id, code, customer_id, phone, email,
                 discount_type, discount_value, target_category_id, target_product_id, applicable_order_types,
                 min_order_amount, max_discount_amount,
                 valid_from, valid_until, usage_limit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [
                tenantId,
                data.campaign_id || null,
                code,
                data.customer_id || null,
                data.phone || null,
                data.email || null,
                data.discount_type,
                data.discount_value,
                data.target_category_id || null,
                data.target_product_id || null,
                data.applicable_order_types || 'all',
                data.min_order_amount || 0,
                data.max_discount_amount || null,
                data.valid_from ? new Date(data.valid_from) : new Date(),
                new Date(data.valid_until),
                data.usage_limit || 0,
            ]
        );
    });

    const insertId = result[0]?.id || result.insertId;
    return getCouponByCode(tenantId, code) as Promise<Coupon>;
}

/**
 * Toplu kupon üretimi (kampanya için)
 */
export async function generateBulkCoupons(
    tenantId: string,
    campaignId: number,
    count: number,
    options: {
        customer_ids?: number[];
        phone_list?: string[];
        valid_days?: number;
    } = {}
): Promise<Coupon[]> {
    await ensureCouponTables(tenantId);

    const campaign = await getCampaignById(tenantId, campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (options.valid_days || 30));

    const coupons: Coupon[] = [];
    const phoneList = options.phone_list || [];

    for (let i = 0; i < count; i++) {
        const code = generateCouponCode();

        let customerId: number | null = null;
        let phone: string | null = null;

        if (options.customer_ids && options.customer_ids[i]) {
            customerId = options.customer_ids[i];
        } else if (phoneList[i]) {
            phone = phoneList[i];
        }

        const [result]: any = await withTenant(tenantId, async (connection) => {
            return connection.query(
                `INSERT INTO coupons
                    (tenant_id, campaign_id, code, customer_id, phone,
                     discount_type, discount_value, target_category_id, target_product_id, applicable_order_types,
                     min_order_amount, max_discount_amount,
                     valid_from, valid_until, usage_limit, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active') RETURNING id`,
                [
                    tenantId,
                    campaignId,
                    code,
                    customerId,
                    phone,
                    campaign.discount_type,
                    campaign.discount_value,
                    campaign.target_category_id || null,
                    campaign.target_product_id || null,
                    campaign.applicable_order_types || 'all',
                    campaign.min_order_amount,
                    campaign.max_discount_amount,
                    campaign.start_date,
                    validUntil,
                    campaign.usage_limit_per_customer || 0,
                ]
            );
        });

        const insertId = result[0]?.id || result.insertId;
        const coupon = await getCouponById(tenantId, insertId);
        if (coupon) coupons.push(coupon);
    }

    // Kampanya kullanım sayacını güncelle
    await withTenant(tenantId, async (connection) => {
        await connection.query(
            'UPDATE campaigns SET usage_count = usage_count + ? WHERE id = ?',
            [count, campaignId]
        );
    });

    return coupons;
}

export async function getCouponById(tenantId: string, couponId: number): Promise<Coupon | null> {
    const [rows]: any = await withTenant(tenantId, async (connection) => {
        return connection.query('SELECT * FROM coupons WHERE id = ?', [couponId]);
    });
    return rows[0] || null;
}

export async function getCouponByCode(tenantId: string, code: string): Promise<Coupon | null> {
    const [rows]: any = await withTenant(tenantId, async (connection) => {
        return connection.query(
            'SELECT * FROM coupons WHERE code = ? AND tenant_id = ?',
            [code.toUpperCase(), tenantId]
        );
    });
    return rows[0] || null;
}

export async function getCoupons(tenantId: string, filters?: {
    status?: CouponStatus;
    customer_id?: number;
    campaign_id?: number;
}): Promise<Coupon[]> {
    return withTenant(tenantId, async (connection) => {
        let query = 'SELECT * FROM coupons WHERE tenant_id = ?';
        const params: any[] = [tenantId];

        if (filters?.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters?.customer_id) {
            query += ' AND customer_id = ?';
            params.push(filters.customer_id);
        }
        if (filters?.campaign_id) {
            query += ' AND campaign_id = ?';
            params.push(filters.campaign_id);
        }

        query += ' ORDER BY created_at DESC';
        const [rows]: any = await connection.query(query, params);
        return rows;
    });
}

export async function deleteCoupon(tenantId: string, couponId: number): Promise<void> {
    await withTenant(tenantId, async (connection) => {
        await connection.query(
            'DELETE FROM coupons WHERE id = ? AND tenant_id = ?',
            [couponId, tenantId]
        );
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KUPON DOĞRULAMA & REDEMPTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Kupon kodunu doğrular ve indirim tutarını hesaplar
 */
export async function validateCoupon(
    tenantId: string,
    code: string,
    orderAmount: number,
    customerId?: number,
    orderType?: string,
    cartItems?: Array<{ product_id: number; category_id?: number; price: number; quantity: number }>
): Promise<CouponValidationResult> {
    const coupon = await getCouponByCode(tenantId, code);

    if (!coupon) {
        return { valid: false, error: 'Kupon kodu bulunamadı' };
    }

    if (coupon.status !== 'active') {
        return { valid: false, error: `Kupon ${coupon.status === 'expired' ? 'süresi dolmuş' : 'kullanılamaz'}` };
    }

    const now = new Date();
    const validFrom = new Date(coupon.valid_from);
    const validUntil = new Date(coupon.valid_until);

    if (now < validFrom) {
        return { valid: false, error: 'Kupon henüz aktif değil' };
    }

    if (now > validUntil) {
        return { valid: false, error: 'Kupon süresi dolmuş' };
    }

    if (orderAmount < coupon.min_order_amount) {
        return {
            valid: false,
            error: `Minimum sipariş tutarı ${coupon.min_order_amount} TL olmalıdır`
        };
    }

    if (coupon.usage_limit > 0 && coupon.usage_count >= coupon.usage_limit) {
        return { valid: false, error: 'Kupon kullanım limiti dolmuş' };
    }

    if (coupon.customer_id && coupon.customer_id !== customerId) {
        return { valid: false, error: 'Bu kupon başka müşteriye aittir' };
    }

    // Sipariş Tipi (Order Type) kontrolü (örn. dine_in, takeaway, delivery)
    if (coupon.applicable_order_types && coupon.applicable_order_types !== 'all') {
        const allowedTypes = coupon.applicable_order_types.split(',').map(t => t.trim());
        if (orderType && !allowedTypes.includes(orderType)) {
            return { valid: false, error: `Bu kupon ${orderType} siparişleri için geçerli değildir.` };
        }
    }

    // Kategori veya Ürün kontrolü
    let applicableAmount = orderAmount;
    if ((coupon.target_category_id || coupon.target_product_id) && cartItems) {
        let matchedAmount = 0;
        for (const item of cartItems) {
            let isMatch = false;
            if (coupon.target_product_id && item.product_id === coupon.target_product_id) {
                isMatch = true;
            } else if (coupon.target_category_id && item.category_id === coupon.target_category_id) {
                isMatch = true;
            }
            if (isMatch) {
                matchedAmount += (item.price * item.quantity);
            }
        }

        if (matchedAmount === 0) {
            return { valid: false, error: 'Sepette bu kuponun geçerli olduğu ürün/kategori bulunmamaktadır.' };
        }
        applicableAmount = matchedAmount; // İndirim sadece bu ürünlerin toplamı üzerinden hesaplanabilir (tercihen)
    }

    // Müşteri başı limit kontrolü
    if (customerId && coupon.usage_limit > 0) {
        const [usageRows]: any = await withTenant(tenantId, async (connection) => {
            return connection.query(
                `SELECT COUNT(*) as cnt FROM coupon_usage_log
                 WHERE coupon_id = ? AND customer_id = ?`,
                [coupon.id, customerId]
            );
        });
        if (usageRows[0]?.cnt >= coupon.usage_limit) {
            return { valid: false, error: 'Bu kuponu zaten kullandınız' };
        }
    }

    // İndirim tutarını hesapla
    let discountAmount = 0;
    let discountDescription = '';

    switch (coupon.discount_type) {
        case 'percent':
            discountAmount = (applicableAmount * coupon.discount_value) / 100;
            if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
                discountAmount = coupon.max_discount_amount;
            }
            discountDescription = `%${coupon.discount_value} indirim`;
            break;

        case 'fixed':
            discountAmount = Math.min(coupon.discount_value, applicableAmount);
            discountDescription = `${coupon.discount_value} TL indirim`;
            break;

        case 'free_delivery':
            discountAmount = 0; // Bu sepete yansımaz, teslimat ücretsiz işaretlenir
            discountDescription = 'Ücretsiz teslimat';
            break;

        case 'free_item':
            discountAmount = 0;
            discountDescription = 'Ücretsiz ürün';
            break;
    }

    return {
        valid: true,
        coupon,
        discount_amount: Math.round(discountAmount * 100) / 100,
        discount_description: discountDescription,
    };
}

/**
 * Kuponu siparişte kullan (redeem)
 */
export async function redeemCoupon(
    tenantId: string,
    code: string,
    orderId: number,
    orderAmount: number,
    customerId?: number,
    orderType?: string,
    cartItems?: Array<{ product_id: number; category_id?: number; price: number; quantity: number }>
): Promise<RedeemResult> {
    const validation = await validateCoupon(tenantId, code, orderAmount, customerId, orderType, cartItems);

    if (!validation.valid || !validation.coupon) {
        return { success: false, error: validation.error };
    }

    const coupon = validation.coupon as Coupon;

    return withTenant(tenantId, async (connection) => {
        try {
            // Kupon kullanım sayacını güncelle
            await connection.query(
                'UPDATE coupons SET usage_count = usage_count + 1, status = CASE WHEN usage_limit > 0 AND usage_count + 1 >= usage_limit THEN "depleted" ELSE status END WHERE id = ?',
                [coupon.id]
            );

            // Kullanım logu
            await connection.query(
                `INSERT INTO coupon_usage_log (coupon_id, order_id, customer_id, discount_amount)
                 VALUES (?, ?, ?, ?)`,
                [coupon.id, orderId, customerId || null, validation.discount_amount || 0]
            );

            // Kampanya kullanım sayacını güncelle
            if (coupon.campaign_id) {
                await connection.query(
                    'UPDATE campaigns SET usage_count = usage_count + 1 WHERE id = ?',
                    [coupon.campaign_id]
                );
            }

            // Ücretsiz ürün kontrolü
            let freeItem = undefined;
            if (coupon.discount_type === 'free_item' && coupon.discount_item_id) {
                const [itemRows]: any = await connection.query(
                    'SELECT id, name FROM products WHERE id = ?',
                    [coupon.discount_item_id]
                );
                if (itemRows[0]) {
                    freeItem = { id: itemRows[0].id, name: itemRows[0].name };
                }
            }

            return {
                success: true,
                discount_applied: validation.discount_amount,
                discount_description: validation.discount_description,
                free_item: freeItem,
            };
        } catch (e: any) {
            console.error('redeemCoupon error:', e);
            return { success: false, error: 'Kupon kullanılamadı: ' + (e.message || 'Bilinmeyen hata') };
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OTOMATİK KAMPANYA UYGULAMA (Sepete otomatik indirim)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Müşteri için uygulanabilir otomatik kampanyayı bulur
 */
export async function findAutoApplyCampaign(
    tenantId: string,
    customerId: number,
    orderAmount: number
): Promise<CouponValidationResult | null> {
    return withTenant(tenantId, async (connection) => {
        // Müşteri tier bilgisini al
        const [custRows]: any = await connection.query(
            'SELECT loyalty_tier, reward_points FROM customers WHERE id = ?',
            [customerId]
        );
        const customer = custRows[0];
        if (!customer) return null;

        const tier = customer.loyalty_tier || 'bronze';
        const points = customer.reward_points || 0;

        // Uygun otomatik kampanyayı bul
        const [campaignRows]: any = await connection.query(
            `SELECT * FROM campaigns
             WHERE tenant_id = ?
               AND status = 'active'
               AND is_auto_apply = TRUE
               AND start_date <= NOW()
               AND end_date >= NOW()
               AND min_order_amount <= ?
               AND (usage_limit_total IS NULL OR usage_count < usage_limit_total)
             ORDER BY
               CASE audience_filter
                 WHEN 'all' THEN 1
                 WHEN 'new_customer' THEN 2
                 WHEN 'tier_bronze' THEN CASE WHEN ? = 'bronze' THEN 3 ELSE 99 END
                 WHEN 'tier_silver' THEN CASE WHEN ? IN ('silver','gold') THEN 3 ELSE 99 END
                 WHEN 'tier_gold' THEN CASE WHEN ? = 'gold' THEN 3 ELSE 99 END
                 WHEN 'vip' THEN CASE WHEN ? = 'gold' AND ? > 5000 THEN 3 ELSE 99 END
               END,
               discount_value DESC
             LIMIT 1`,
            [tenantId, orderAmount, tier, tier, tier, tier, points]
        );

        if (!campaignRows[0]) return null;

        const campaign = campaignRows[0];
        let discountAmount = 0;

        if (campaign.discount_type === 'percent') {
            discountAmount = (orderAmount * campaign.discount_value) / 100;
            if (campaign.max_discount_amount && discountAmount > campaign.max_discount_amount) {
                discountAmount = campaign.max_discount_amount;
            }
        } else if (campaign.discount_type === 'fixed') {
            discountAmount = campaign.discount_value;
        }

        return {
            valid: true,
            discount_amount: Math.round(discountAmount * 100) / 100,
            discount_description: campaign.discount_type === 'percent'
                ? `%${campaign.discount_value} otomatik indirim`
                : `${campaign.discount_value} TL otomatik indirim`,
            coupon: {
                id: campaign.id,
                discount_type: campaign.discount_type,
                discount_value: campaign.discount_value,
                campaign_id: campaign.id,
            },
        };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KUPON İSTATİSTİKLERİ
// ═══════════════════════════════════════════════════════════════════════════════

export interface CouponStats {
    total_coupons: number;
    active_coupons: number;
    used_coupons: number;
    total_discount_given: number;
    campaigns_count: number;
    top_campaigns: { name: string; usage_count: number; total_discount: number }[];
}

export async function getCouponStats(tenantId: string): Promise<CouponStats> {
    return withTenant(tenantId, async (connection) => {
        const [totals]: any = await connection.query(
            `SELECT
                COUNT(*) as total_coupons,
                SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active_coupons,
                SUM(CASE WHEN c.status = 'depleted' OR c.status = 'expired' THEN 1 ELSE 0 END) as used_coupons,
                COALESCE(SUM(l.discount_amount), 0) as total_discount_given
             FROM coupons c
             LEFT JOIN coupon_usage_log l ON c.id = l.coupon_id
             WHERE c.tenant_id = ?`,
            [tenantId]
        );

        const [campaignCount]: any = await connection.query(
            'SELECT COUNT(*) as cnt FROM campaigns WHERE tenant_id = ?',
            [tenantId]
        );

        const [topCampaigns]: any = await connection.query(
            `SELECT c.name, c.usage_count, COALESCE(SUM(l.discount_amount), 0) as total_discount
             FROM campaigns c
             LEFT JOIN coupon_usage_log l ON c.id = l.coupon_id
             WHERE c.tenant_id = ?
             GROUP BY c.id
             ORDER BY c.usage_count DESC
             LIMIT 5`,
            [tenantId]
        );

        return {
            total_coupons: totals[0]?.total_coupons || 0,
            active_coupons: totals[0]?.active_coupons || 0,
            used_coupons: totals[0]?.used_coupons || 0,
            total_discount_given: parseFloat(totals[0]?.total_discount_given || 0),
            campaigns_count: campaignCount[0]?.cnt || 0,
            top_campaigns: topCampaigns.map((r: any) => ({
                name: r.name,
                usage_count: r.usage_count || 0,
                total_discount: parseFloat(r.total_discount || 0),
            })),
        };
    });
}
