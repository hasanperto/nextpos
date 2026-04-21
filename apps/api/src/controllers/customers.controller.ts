import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

const createCustomerSchema = z.object({
    name: z.string().min(2),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    allergies: z.string().optional(),
    notes: z.string().optional(),
    preferredLanguage: z.string().default('de'),
});

export const searchCustomersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { q, phone } = req.query;

        const customers = await withTenant(tenantId, async (connection) => {
            if (phone) {
                const [rows]: any = await connection.query(
                    'SELECT * FROM customers WHERE phone LIKE ? ORDER BY name ASC LIMIT 20',
                    [`%${phone}%`]
                );
                return rows;
            }

            if (q) {
                const [rows]: any = await connection.query(
                    `SELECT * FROM customers 
                     WHERE name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR customer_code ILIKE ?
                     ORDER BY name ASC LIMIT 20`,
                    [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
                );
                return rows;
            }

            const [rows]: any = await connection.query(
                'SELECT * FROM customers ORDER BY last_visit DESC LIMIT 50'
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
        const data = createCustomerSchema.parse(req.body);

        const customer = await withTenant(tenantId, async (connection) => {
            const [result]: any = await connection.query(
                `INSERT INTO customers (name, phone, email, allergies, notes, preferred_language)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [data.name, data.phone || null, data.email || null, data.allergies || null, data.notes || null, data.preferredLanguage]
            );

            const insertId = result.insertId;
            const customerCode = `NP${String(insertId).padStart(5, '0')}`;
            await connection.query('UPDATE customers SET customer_code = ? WHERE id = ?', [customerCode, insertId]);

            const [rows]: any = await connection.query('SELECT * FROM customers WHERE id = ?', [insertId]);
            const customer = rows[0];

            // ─────────────────────────────────────
            // 🔥 WhatsApp Welcome Message
            // ─────────────────────────────────────
            if (customer && customer.phone) {
                try {
                    const [branchRows]: any = await connection.query(
                        "SELECT settings FROM branches WHERE id = 1"
                    );
                    const settings = branchRows?.[0]?.settings || {};
                    
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

            return customer;
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


export const identifyCustomerHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { query } = req.query; 

        if (!query) return res.status(400).json({ error: 'Sorgu parametresi gerekli' });

        const customer = await withTenant(tenantId, async (connection) => {
            const cleanQuery = String(query).trim();
            const [rows]: any = await connection.query(
                `SELECT * FROM customers 
                 WHERE customer_code = ? 
                    OR phone = ? 
                    OR REPLACE(phone, ' ', '') = ?
                    OR email = ?
                    OR name ILIKE ?
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
        const { q: qParam, search, limit = '50', offset = '0', sort = 'name' } = req.query;
        const q = qParam || search;

        const result = await withTenant(tenantId, async (connection) => {
            await ensureCustomerColumns(connection);

            let query = `SELECT * FROM customers WHERE 1=1`;
            const params: any[] = [];

            if (q) {
                query += ` AND (name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR customer_code ILIKE ?)`;
                const pattern = `%${q}%`;
                params.push(pattern, pattern, pattern, pattern);
            }

            const validSorts = ['name', 'reward_points', 'total_spent', 'last_visit_at', 'created_at'];
            const sortField = validSorts.includes(sort as string) ? sort : 'name';
            
            query += ` ORDER BY ${sortField} DESC LIMIT ? OFFSET ?`;
            params.push(Number(limit), Number(offset));

            const [rows]: any = await connection.query(query, params);
            
            const [countRows]: any = await connection.query('SELECT COUNT(*) as total FROM customers');
            
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

            const [rows]: any = await connection.query('SELECT * FROM customers WHERE id = ?', [customerId]);
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
            const [rows]: any = await connection.query(
                `SELECT c.*,
                        (SELECT COALESCE(json_agg(json_build_object(
                                'id', a.id, 'label', a.label, 'address', a.address, 'city', a.city
                           )), '[]'::json) FROM customer_addresses a WHERE a.customer_id = c.id) as addresses,
                        (SELECT COALESCE(json_agg(sub.*), '[]'::json) 
                         FROM (
                             SELECT * FROM orders 
                             WHERE customer_id = c.id 
                             ORDER BY created_at DESC 
                             LIMIT 10
                         ) sub) as recent_orders
                 FROM customers c WHERE c.id = ?`,
                [customerId]
            );
            return rows[0] || null;
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
            const [orders]: any = await connection.query(
                `SELECT 
                    COUNT(*) as order_count,
                    COALESCE(SUM(total_amount), 0) as total_spent,
                    COALESCE(AVG(total_amount), 0) as avg_order_value,
                    MAX(created_at) as last_order_date
                 FROM orders WHERE customer_id = ? AND payment_status = 'paid'`,
                [customerId]
            );

            const [visits]: any = await connection.query(
                `SELECT date_trunc('month', created_at) as month, COUNT(*) as count 
                 FROM orders WHERE customer_id = ? GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
                [customerId]
            );

            const [favorites]: any = await connection.query(
                `SELECT p.name as product_name, COUNT(*) as count 
                 FROM order_items oi 
                 JOIN orders o ON o.id = oi.order_id 
                 JOIN products p ON p.id = oi.product_id
                 WHERE o.customer_id = ? 
                 GROUP BY p.name ORDER BY count DESC LIMIT 5`,
                [customerId]
            );

            return {
                summary: orders[0],
                visitHistory: visits,
                favoriteProducts: favorites
            };
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Rapor oluşturulamadı' });
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

            for (const c of customers) {
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
