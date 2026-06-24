import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { normalizePhone } from '../lib/phone.js';

const createCustomerSchema = z.object({
    name: z.string().min(2),
    phone: z.string().or(z.literal('')).optional().nullable(),
    email: z.string().email().or(z.literal('')).optional().nullable(),
    allergies: z.string().or(z.literal('')).optional().nullable(),
    notes: z.string().or(z.literal('')).optional().nullable(),
    preferredLanguage: z.string().default('de'),
    reward_points: z.number().optional().nullable(),
    loyalty_tier: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    whatsapp_subscription: z.boolean().optional().nullable(),
    email_subscription: z.boolean().optional().nullable(),
    address: z.string().optional().nullable(),
});

export const searchCustomersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { q, phone } = req.query;

        const customers = await withTenant(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);
            if (phone) {
                const digits = String(phone).replace(/\D/g, '');
                const [rows]: any = await connection.query(
                    `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address 
                     FROM customers c 
                     WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ? 
                     ORDER BY c.name ASC LIMIT 20`,
                    [`%${digits}`]
                );
                return rows;
            }

            if (q) {
                const cleanQ = String(q).trim();
                const isNumeric = /^[0-9\s-+()]+$/.test(cleanQ);

                if (isNumeric) {
                    const digits = cleanQ.replace(/\D/g, '');
                    const [rows]: any = await connection.query(
                        `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address 
                         FROM customers c 
                         WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ? 
                         ORDER BY c.name ASC LIMIT 20`,
                        [`%${digits}`]
                    );
                    return rows;
                } else {
                    const [rows]: any = await connection.query(
                        `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address 
                         FROM customers c 
                         WHERE c.name ILIKE ? OR c.email ILIKE ? OR c.customer_code = ?
                         ORDER BY c.name ASC LIMIT 20`,
                        [cleanQ, cleanQ, cleanQ]
                    );
                    return rows;
                }
            }

            const [rows]: any = await connection.query(
                `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address 
                 FROM customers c ORDER BY c.name ASC LIMIT 50`
            );
            return rows;
        });

        res.json(customers);
    } catch (error) {
        console.error('❌ Müşteri arama hatası:', error);
        res.status(500).json({ error: 'Müşteriler aranamadı' });
    }
};

export const createCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        // Sanitize body fields: convert empty strings to undefined or null so Zod passes
        const body = { ...req.body };
        if (body.email === '') delete body.email;
        if (body.phone === '') delete body.phone;
        const data = createCustomerSchema.parse(body);

        const customer = await withTenant(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);
            
            const [branchRows0]: any = await connection.query("SELECT settings FROM branches WHERE id = 1");
            const branchSettings0 = branchRows0?.[0]?.settings || {};
            const callerIdSettings0 = branchSettings0.integrations?.callerId || {};
            const defaultCC = String(callerIdSettings0.defaultCountryCode || '90');
            const defaultAC = callerIdSettings0.defaultAreaCode ? String(callerIdSettings0.defaultAreaCode) : undefined;
            
            if (data.phone) {
                data.phone = normalizePhone(data.phone, defaultCC, defaultAC);
            }

            // 1. Mükerrer Kontrolü (Telefon veya E-posta)
            if (data.phone || data.email) {
                let query = '1=0';
                const params: any[] = [];
                if (data.phone) {
                    const digits = data.phone.replace(/\D/g, '').slice(-10);
                    if (digits.length >= 6) {
                        query += ` OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?`;
                        params.push(`%${digits}`);
                    }
                }
                if (data.email) {
                    query += ' OR email = ?';
                    params.push(data.email);
                }

                const [exists]: any = await connection.query(
                    `SELECT * FROM customers WHERE ${query} LIMIT 1`,
                    params
                );

                if (exists.length > 0) {
                    const existing = exists[0];
                    // Eksik bilgileri yama (Self-Healing)
                    const updates: string[] = [];
                    const updateParams: any[] = [];

                    if (!existing.phone && data.phone) {
                        updates.push('phone = ?');
                        updateParams.push(data.phone);
                        existing.phone = data.phone;
                    }
                    if (!existing.email && data.email) {
                        updates.push('email = ?');
                        updateParams.push(data.email);
                        existing.email = data.email;
                    }
                    if (!existing.allergies && data.allergies) {
                        updates.push('allergies = ?');
                        updateParams.push(data.allergies);
                        existing.allergies = data.allergies;
                    }
                    if (!existing.notes && data.notes) {
                        updates.push('notes = ?');
                        updateParams.push(data.notes);
                        existing.notes = data.notes;
                    }

                    if (updates.length > 0) {
                        updateParams.push(existing.id);
                        await connection.query(
                            `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
                            updateParams
                        );
                    }

                    // Adres kontrolü ve güncellemesi/eklenmesi
                    if (data.address) {
                        const cleanAddr = String(data.address).trim();
                        if (cleanAddr) {
                            const [addrExists]: any = await connection.query(
                                'SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC LIMIT 1',
                                [existing.id]
                            );
                            if (addrExists.length > 0) {
                                await connection.query(
                                    'UPDATE customer_addresses SET address = ? WHERE id = ?',
                                    [cleanAddr, addrExists[0].id]
                                );
                            } else {
                                await connection.query(
                                    "INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES (?, 'Varsayılan', ?, true)",
                                    [existing.id, cleanAddr]
                                );
                            }
                        }
                    }

                    // Güncel kaydı çekelim ve dönelim
                    const [updatedRows]: any = await connection.query('SELECT * FROM customers WHERE id = ?', [existing.id]);
                    const finalCust = updatedRows[0];
                    const defaultAddr = data.address || await connection.query(
                        'SELECT address FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC LIMIT 1',
                        [existing.id]
                    ).then(([r]: any) => r[0]?.address || '');

                    return { ...finalCust, address: defaultAddr, alreadyExists: true };
                }
            }

            // 2. Yeni Kayıt: Ayarlara göre Onay Durumu
            const [branchRows]: any = await connection.query("SELECT settings FROM branches WHERE id = 1");
            const branchSettings = branchRows?.[0]?.settings || {};
            const requireApproval = branchSettings.customers?.requireCustomerApproval ?? false;
            const targetStatus = data.status || (requireApproval ? 'pending' : 'active');

            const [result]: any = await connection.query(
                `INSERT INTO customers (name, phone, email, allergies, notes, preferred_language, reward_points, loyalty_tier, status, whatsapp_subscription, email_subscription)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name, 
                    data.phone || null, 
                    data.email || null, 
                    data.allergies || null, 
                    data.notes || null, 
                    data.preferredLanguage,
                    data.reward_points ?? 0,
                    data.loyalty_tier ?? 'bronze',
                    targetStatus,
                    data.whatsapp_subscription ?? true,
                    data.email_subscription ?? true
                ]
            );

            const insertId = result.insertId;
            const customerCode = `NP${String(insertId).padStart(5, '0')}`;
            await connection.query('UPDATE customers SET customer_code = ? WHERE id = ?', [customerCode, insertId]);

            // Adres varsa ekleyelim
            if (data.address) {
                const cleanAddr = String(data.address).trim();
                if (cleanAddr) {
                    await connection.query(
                        "INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES (?, 'Varsayılan', ?, true)",
                        [insertId, cleanAddr]
                    );
                }
            }

            const [rows]: any = await connection.query('SELECT * FROM customers WHERE id = ?', [insertId]);
            const customer = rows[0];

            // ─────────────────────────────────────
            // 🔥 WhatsApp Welcome Message
            // ─────────────────────────────────────
            if (customer && customer.phone && targetStatus === 'active') {
                try {
                    const settings = branchSettings;
                    if (settings.integrations?.whatsapp?.enabled && settings.integrations?.whatsapp?.sendWelcomeMessage) {
                        void WhatsAppService.sendWelcomeMessage({
                            tenantId,
                            customer,
                            settings: settings.integrations
                        });
                    }
                } catch (err) {
                    console.error('⚠️ Could not send WhatsApp welcome:', err);
                }
            }

            return { ...customer, address: data.address || '' };
        });

        res.status(201).json(customer);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Müşteri oluşturma hatası:', error);
        res.status(500).json({ error: 'Müşteri oluşturulamadı' });
    }
};

const ensureCustomerColumns = async (connection: any) => {
    try {
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS reward_points INT DEFAULT 0`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent DECIMAL(12,2) DEFAULT 0`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_tier VARCHAR(20) DEFAULT 'bronze'`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(20)`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMP`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_subscription BOOLEAN DEFAULT true`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_subscription BOOLEAN DEFAULT true`);
        await connection.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`);
        // Backfill customer_code if missing
        await connection.query(`UPDATE customers SET customer_code = 'NP' || LPAD(id::text, 5, '0') WHERE customer_code IS NULL`);
    } catch (err) {
        console.error('🛡️ self-healing error:', err);
    }
};

const ensureOrderColumns = async (connection: any) => {
    try {
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(30) DEFAULT 'dine_in'`);
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'cash'`);
    } catch { /* ignore */ }
};


export const identifyCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { query } = req.query; 

        if (!query) return res.status(400).json({ error: 'Sorgu parametresi gerekli' });

        const customer = await withTenant(tenantId, async (connection) => {
            const cleanQuery = String(query).trim();
            const [rows]: any = await connection.query(
                `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address 
                 FROM customers c 
                 WHERE c.customer_code = ? 
                    OR c.phone = ? 
                    OR REPLACE(c.phone, ' ', '') = ?
                    OR c.email = ?
                    OR c.name ILIKE ?
                 LIMIT 1`,
                [cleanQuery, cleanQuery, cleanQuery.replace(/\s/g, ''), cleanQuery, `%${cleanQuery}%`]
            );
            return rows[0];
        });

        if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Tanımlama başarısız' });
    }
};

export const getCustomersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { q: qParam, search, limit = '50', offset = '0', sort = 'name', status } = req.query;
        const q = qParam || search;

        const result = await withTenant(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);

            let query = `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address FROM customers c WHERE 1=1`;
            let countQuery = `SELECT COUNT(*) as total FROM customers c WHERE 1=1`;
            const params: any[] = [];
            const countParams: any[] = [];

            if (status) {
                query += ` AND c.status = ?`;
                countQuery += ` AND c.status = ?`;
                params.push(status);
                countParams.push(status);
            }

            if (q) {
                const cleanQ = String(q).trim();
                const isNumeric = /^[0-9\s-+()]+$/.test(cleanQ);

                if (isNumeric) {
                    const digits = cleanQ.replace(/\D/g, '');
                    const cond = ` AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?`;
                    query += cond;
                    countQuery += cond;
                    params.push(`%${digits}`);
                    countParams.push(`%${digits}`);
                } else {
                    const cond = ` AND (c.name ILIKE ? OR c.email ILIKE ? OR c.customer_code = ?)`;
                    query += cond;
                    countQuery += cond;
                    params.push(cleanQ, cleanQ, cleanQ);
                    countParams.push(cleanQ, cleanQ, cleanQ);
                }
            }

            const validSorts = ['name', 'reward_points', 'total_spent', 'last_visit_at', 'created_at'];
            const sortField = validSorts.includes(sort as string) ? sort : 'name';
            
            query += ` ORDER BY c.${sortField} DESC LIMIT ? OFFSET ?`;
            params.push(Number(limit), Number(offset));

            const [rows]: any = await connection.query(query, params);
            const [countRows]: any = await connection.query(countQuery, countParams);
            
            return {
                items: rows,
                total: parseInt(countRows[0].total)
            };
        });

        res.json(result);
    } catch (error) {
        console.error('❌ CRM List Error:', error);
        res.status(500).json({ error: 'Müşteri listesi yüklenemedi' });
    }
};

export const updateCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.params.id);
        const data = req.body;

        const customer = await withTenantTransaction(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);
            
            const [branchRows0]: any = await connection.query("SELECT settings FROM branches WHERE id = 1");
            const branchSettings0 = branchRows0?.[0]?.settings || {};
            const callerIdSettings0 = branchSettings0.integrations?.callerId || {};
            const defaultCC = String(callerIdSettings0.defaultCountryCode || '90');
            const defaultAC = callerIdSettings0.defaultAreaCode ? String(callerIdSettings0.defaultAreaCode) : undefined;
            
            if (data.phone) {
                data.phone = normalizePhone(data.phone, defaultCC, defaultAC);
            }

            const updates: string[] = [];
            const values: any[] = [];

            const allowedFields = [
                'name', 'phone', 'email', 'allergies', 'notes', 
                'reward_points', 'loyalty_tier', 'status', 'preferred_language',
                'whatsapp_subscription', 'email_subscription'
            ];
            
            for (const key of Object.keys(data)) {
                if (allowedFields.includes(key)) {
                    updates.push(`${key} = ?`);
                    values.push(data[key]);
                }
            }

            if (updates.length > 0) {
                values.push(customerId);
                await connection.query(
                    `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
                    values
                );
            }

            // Eğer adres gönderildiyse customer_addresses tablosuna kaydet/güncelle
            if (data.address !== undefined) {
                const cleanAddress = String(data.address).trim();
                if (cleanAddress) {
                    const [exists]: any = await connection.query(
                        `SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC LIMIT 1`,
                        [customerId]
                    );
                    if (exists.length > 0) {
                        await connection.query(
                            `UPDATE customer_addresses SET address = ?, updated_at = NOW() WHERE id = ?`,
                            [cleanAddress, exists[0].id]
                        );
                    } else {
                        await connection.query(
                            `INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES (?, 'Varsayılan', ?, true)`,
                            [customerId, cleanAddress]
                        );
                    }
                }
            }

            const [rows]: any = await connection.query(
                `SELECT c.*, (SELECT address FROM customer_addresses WHERE customer_id = c.id ORDER BY is_default DESC, id DESC LIMIT 1) as address 
                 FROM customers c WHERE c.id = ?`, 
                [customerId]
            );
            return rows[0];
        });

        res.json(customer);
    } catch (error) {
        console.error('❌ Customer Update Error:', error);
        res.status(500).json({ error: 'Müşteri güncellenemedi' });
    }
};

export const getCustomerByIdHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.params.id);

        const customer = await withTenant(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);
            await ensureOrderColumns(connection);

            // Müşteri temel bilgileri
            const [rows]: any = await connection.query(
                'SELECT * FROM customers WHERE id = ?',
                [customerId]
            );
            const c = rows[0] || null;
            if (!c) return null;

            // Adresler (ayrı sorgu - güvenli)
            let addresses: any[] = [];
            try {
                const [addrRows]: any = await connection.query(
                    'SELECT id, label, address, city, is_default FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC',
                    [customerId]
                );
                addresses = addrRows;
            } catch { /* customer_addresses tablosu yoksa boş dön */ }

            // Son siparişler (ayrı sorgu - güvenli)
            let recentOrders: any[] = [];
            try {
                const [orderRows]: any = await connection.query(
                    `SELECT o.id, o.id as order_number, o.created_at, o.total_amount, o.payment_status, o.status,
                            COALESCE(o.order_type::VARCHAR, 'dine_in') as service_type,
                            COALESCE(
                                (SELECT method::VARCHAR FROM payments WHERE order_id = o.id LIMIT 1),
                                o.payment_method_arrival::VARCHAR,
                                'cash'
                            ) as payment_method,
                            o.notes,
                            o.picked_up_at,
                            o.delivery_address,
                            o.delete_reason as cancel_reason,
                            u.name as courier_name
                     FROM orders o
                     LEFT JOIN users u ON u.id = o.courier_id
                     WHERE o.customer_id = ?
                     ORDER BY o.created_at DESC
                     LIMIT 50`,
                    [customerId]
                );
                if (orderRows.length > 0) {
                    const orderIds = orderRows.map((o: any) => o.id);
                    const [itemRows]: any = await connection.query(
                        `SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price, p.name as product_name, oi.notes, oi.modifiers
                         FROM order_items oi
                         JOIN products p ON p.id = oi.product_id
                         WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})`,
                        orderIds
                    );
                    
                    for (const order of orderRows) {
                        order.items = itemRows.filter((it: any) => it.order_id === order.id);
                    }
                }
                recentOrders = orderRows;
            } catch (err) { 
                console.error('❌ CRM recent orders query error:', err);
            }

            return { ...c, addresses, recent_orders: recentOrders };
        });

        if (!customer) {
            return res.status(404).json({ error: 'Müşteri bulunamadı' });
        }

        res.json(customer);
    } catch (error) {
        console.error('❌ Müşteri detay hatası:', error);
        res.status(500).json({ error: 'Müşteri detayı yüklenemedi' });
    }
};

export const getCustomerReportHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.params.id);

        const report = await withTenant(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);

            // ── Genel Özet ──────────────────────────────────────────
            const [orders]: any = await connection.query(
                `SELECT 
                    COUNT(*) as order_count,
                    COALESCE(SUM(total_amount), 0) as total_spent,
                    COALESCE(AVG(total_amount), 0) as avg_order_value,
                    MAX(created_at) as last_order_date,
                    MIN(created_at) as first_order_date
                 FROM orders WHERE customer_id = ? AND payment_status = 'paid'`,
                [customerId]
            );

            // ── Aylık Ziyaret Trendi ─────────────────────────────────
            const [visits]: any = await connection.query(
                `SELECT date_trunc('month', created_at) as month, COUNT(*) as count 
                 FROM orders WHERE customer_id = ? GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
                [customerId]
            );

            // ── Favori Ürünler ───────────────────────────────────────
            const [favorites]: any = await connection.query(
                `SELECT p.name as product_name, COUNT(*) as count,
                        COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total_revenue
                 FROM order_items oi 
                 JOIN orders o ON o.id = oi.order_id 
                 JOIN products p ON p.id = oi.product_id
                 WHERE o.customer_id = ? 
                 GROUP BY p.name ORDER BY count DESC LIMIT 5`,
                [customerId]
            );

            // ── Servis Tipi Dağılımı (Masa / Gel-Al / Paket) ────────
            let serviceTypes: any[] = [];
            try {
                const [st]: any = await connection.query(
                    `SELECT 
                        COALESCE(order_type::VARCHAR, 'dine_in') as service_type,
                        COUNT(*) as count,
                        COALESCE(SUM(total_amount), 0) as total_amount
                     FROM orders
                     WHERE customer_id = ?
                     GROUP BY order_type`,
                    [customerId]
                );
                serviceTypes = st;
            } catch (err) {
                console.error('❌ CRM report serviceTypes query error:', err);
            }

            // ── Ödeme Yöntemi Dağılımı ───────────────────────────────
            let paymentMethods: any[] = [];
            try {
                const [pm]: any = await connection.query(
                    `SELECT 
                        COALESCE(
                            (SELECT method::VARCHAR FROM payments WHERE order_id = o.id LIMIT 1),
                            o.payment_method_arrival::VARCHAR,
                            'cash'
                        ) as payment_method,
                        COUNT(*) as count,
                        COALESCE(SUM(total_amount), 0) as total_amount
                     FROM orders o
                     WHERE customer_id = ? AND payment_status = 'paid'
                     GROUP BY COALESCE(
                            (SELECT method::VARCHAR FROM payments WHERE order_id = o.id LIMIT 1),
                            o.payment_method_arrival::VARCHAR,
                            'cash'
                        )`,
                    [customerId]
                );
                paymentMethods = pm;
            } catch (err) {
                console.error('❌ CRM report paymentMethods query error:', err);
            }

            // ── Puan Geçmişi ─────────────────────────────────────────
            let pointHistory: any[] = [];
            try {
                const [ph]: any = await connection.query(
                    `SELECT base_points, bonus_points, multiplier, type, created_at, order_id
                     FROM customer_point_history
                     WHERE customer_id = ?
                     ORDER BY created_at DESC LIMIT 20`,
                    [customerId]
                );
                pointHistory = ph;
            } catch { /* tablo henüz oluşmamış olabilir */ }

            return {
                summary: orders[0],
                visitHistory: visits,
                favoriteProducts: favorites,
                serviceTypes,
                paymentMethods,
                pointHistory,
            };
        });

        res.json(report);
    } catch (error) {
        console.error('❌ Rapor hatası:', error);
        res.status(500).json({ error: 'Rapor oluşturulamadı' });
    }
};

export const getCustomerCouponsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.params.id);

        const coupons = await withTenant(tenantId, async (connection) => {
            // Önce coupon tablosunun varlığını kontrol et
            try {
                const [rows]: any = await connection.query(
                    `SELECT * FROM coupons WHERE customer_id = ? ORDER BY created_at DESC`,
                    [customerId]
                );
                return rows;
            } catch {
                // coupons tablosu yoksa boş liste dön
                return [];
            }
        });

        res.json(coupons);
    } catch (error) {
        res.status(500).json({ error: 'Kuponlar yüklenemedi' });
    }
};

export const deleteCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const customerId = Number(req.params.id);

        await withTenantTransaction(tenantId, async (connection) => {
            await connection.query('DELETE FROM customers WHERE id = ?', [customerId]);
        });

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Müşteri silme hatası:', error);
        res.status(500).json({ error: 'Müşteri silinemedi' });
    }
};

export const getLoyaltyStatsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        
        const stats = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(`
                SELECT 
                    COUNT(*) as total_customers,
                    SUM(reward_points) as total_points_issued,
                    (SELECT COUNT(*) FROM customers WHERE reward_points > 1000) as active_loyal_count,
                    COALESCE(SUM(total_spent), 0) as total_crm_revenue
                FROM customers
            `);
            return rows[0];
        });

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Sadakat istatistikleri yüklenemedi' });
    }
};

export const importCustomersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { customers } = req.body;

        if (!Array.isArray(customers)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        const stats = await withTenantTransaction(tenantId, async (connection) => {
            let success = 0;
            let skipped = 0;

            const [branchRows0]: any = await connection.query("SELECT settings FROM branches WHERE id = 1");
            const branchSettings0 = branchRows0?.[0]?.settings || {};
            const callerIdSettings0 = branchSettings0.integrations?.callerId || {};
            const defaultCC = String(callerIdSettings0.defaultCountryCode || '90');
            const defaultAC = callerIdSettings0.defaultAreaCode ? String(callerIdSettings0.defaultAreaCode) : undefined;
 
            for (const c of customers) {
                if (c.phone) {
                    c.phone = normalizePhone(c.phone, defaultCC, defaultAC);
                }
                // Check if exists by phone or email
                const [exists]: any = await connection.query(
                    'SELECT id FROM customers WHERE (phone = ? AND phone IS NOT NULL) OR (email = ? AND email IS NOT NULL) LIMIT 1',
                    [c.phone || null, c.email || null]
                );

                if (exists.length > 0) {
                    skipped++;
                    continue;
                }

                await connection.query(
                    `INSERT INTO customers (name, phone, email, notes, reward_points, total_spent, loyalty_tier)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [c.name, c.phone || null, c.email || null, c.notes || '', c.reward_points || 0, c.total_spent || 0, c.loyalty_tier || 'bronze']
                );
                success++;
            }

            return { success, skipped };
        });

        res.json({ message: 'İçe aktarma tamamlandı', ...stats });
    } catch (error) {
        console.error('❌ Import Error:', error);
        res.status(500).json({ error: 'Müşteriler içe aktarılamadı' });
    }
};

export const sendCampaignHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { targetIds, message, type = 'whatsapp', subject = 'NextPOS Kampanya' } = req.body;

        if (!targetIds?.length || !message) {
            return res.status(400).json({ error: 'Eksik bilgi: Hedefler veya mesaj seçilmedi' });
        }

        const result = await withTenant(tenantId, async (connection) => {
            const [customers]: any = await connection.query(
                'SELECT id, phone, email, name FROM customers WHERE id IN (?) AND status = \'active\'',
                [targetIds]
            );

            let sentCount = 0;
            
            if (type === 'whatsapp') {
                const [branchRows]: any = await connection.query("SELECT settings FROM branches WHERE id = 1");
                const ws = branchRows?.[0]?.settings?.integrations?.whatsapp;
                if (!ws?.enabled) throw new Error('WhatsApp entegrasyonu aktif değil');

                for (const c of customers) {
                    if (!c.phone) continue;
                    const success = await WhatsAppService.sendTextMessage({
                        tenantId, to: c.phone, message: message.replace(/{name}/g, c.name),
                        settings: { enabled: ws.enabled, phoneNumber: ws.phoneNumber, apiKey: ws.apiKey }
                    });
                    if (success) sentCount++;
                }
            } else if (type === 'email') {
                // Future MailService integration
                console.log(`📧 Bulk Email Simulation: ${customers.length} targets`);
                sentCount = customers.filter((c: any) => c.email).length;
            }

            return { sentCount, totalTargets: customers.length };
        });

        res.json({ message: 'Kampanya tamamlandı', ...result });
    } catch (error: any) {
        console.error('❌ Campaign Error:', error);
        res.status(500).json({ error: error.message || 'Kampanya gönderilemedi' });
    }
};

export const bulkActionHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { ids, action, value } = req.body;

        if (!ids?.length || !action) return res.status(400).json({ error: 'Eksik parametre' });

        await withTenantTransaction(tenantId, async (connection) => {
            if (action === 'status') {
                await connection.query('UPDATE customers SET status = ?, updated_at = NOW() WHERE id IN (?)', [value, ids]);
            } else if (action === 'delete') {
                await connection.query('DELETE FROM customers WHERE id IN (?)', [ids]);
            }
        });

        res.json({ success: true, affected: ids.length });
    } catch (error) {
        res.status(500).json({ error: 'Toplu işlem başarısız' });
    }
};
