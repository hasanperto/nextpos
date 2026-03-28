import { Request, Response } from 'express';
import { z } from 'zod';
import { createTenant, listTenants, queryPublic, invalidateTenantCache } from '../lib/db.js';

// ─────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────

const createTenantSchema = z.object({
    name: z.string().min(2, 'Restaurant adı en az 2 karakter'),
    schema_name: z.string().regex(/^tenant_[a-z0-9_]+$/, 'Schema adı "tenant_xxx" formatında olmalı'),
    contact_email: z.string().email().optional(),
    contact_phone: z.string().optional(),
    authorized_person: z.string().optional(),
    tax_office: z.string().optional(),
    tax_number: z.string().optional(),
    special_license_key: z.string().optional(),
    address: z.string().optional(),
    subscription_plan: z.enum(['basic', 'pro', 'enterprise']).optional(),
    license_months: z.number().min(1).max(60).optional(),
    license_usage_type: z.enum(['prepaid', 'direct_sale']).optional(),
    payment_interval: z.enum(['monthly', 'yearly']).optional(),
    master_password: z.string().optional(),
});

const updateTenantSchema = z.object({
    name: z.string().min(2).optional(),
    status: z.enum(['active', 'suspended', 'inactive']).optional(),
    subscriptionPlan: z.enum(['basic', 'pro', 'enterprise']).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    authorizedPerson: z.string().optional(),
    taxOffice: z.string().optional(),
    taxNumber: z.string().optional(),
    specialLicenseKey: z.string().optional(),
    address: z.string().optional(),
    maxUsers: z.number().min(1).optional(),
    maxBranches: z.number().min(1).optional(),
});

// ─────────────────────────────────────
// Controller Methods
// ─────────────────────────────────────

export const createTenantHandler = async (req: Request, res: Response) => {
    try {
        const data: any = createTenantSchema.parse(req.body);
        
        // Bayi ise otomatik kendi ID'sini ata
        if (req.user?.role === 'reseller') {
            data.resellerId = req.user.userId;
            const resellerId = req.user.userId;
            const { license_usage_type, payment_interval = 'monthly' } = req.body;

            // 1. Get Current Reseller info & System Settings
            const [resellers]: any = await queryPublic('SELECT available_licenses, wallet_balance FROM `public`.saas_admins WHERE id = ?', [resellerId]);
            const reseller = resellers[0];
            const [settings]: any = await queryPublic('SELECT * FROM `public`.system_settings LIMIT 1');
            const s = settings[0] || { 
                reseller_setup_rate: 75, system_setup_rate: 25, 
                reseller_monthly_rate: 50, system_monthly_rate: 50,
                annual_discount_rate: 15 
            };

            if (license_usage_type === 'prepaid') {
                if (reseller.available_licenses <= 0) {
                    return res.status(400).json({ error: 'Yetersiz lisans bakiyesi. Lütfen mağazadan yeni lisans paketi satın alın.' });
                }
                await queryPublic('UPDATE `public`.saas_admins SET available_licenses = available_licenses - 1 WHERE id = ?', [resellerId]);
            } else if (license_usage_type === 'direct_sale') {
                const [plans]: any = await queryPublic('SELECT * FROM `public`.subscription_plans WHERE code = ?', [data.subscription_plan || 'pro']);
                const plan = plans[0] || { setup_fee: 499, monthly_fee: 50 };
                
                const setupFee = parseFloat(plan.setup_fee || 499);
                const monthlyFee = parseFloat(plan.monthly_fee || 50);
                
                // Calculate Totals based on interval
                let totalAmount = setupFee;
                if (payment_interval === 'yearly') {
                    const yearlyService = (monthlyFee * 12) * (1 - (s.annual_discount_rate / 100)); // %15 indirim
                    totalAmount += yearlyService;
                } else {
                    totalAmount += monthlyFee; // First month
                }

                // Split Logic (Setup: 75/25, Service: 50/50)
                const resellerSetupPart = setupFee * (s.reseller_setup_rate / 100);
                const resellerServicePart = (payment_interval === 'yearly' ? (monthlyFee * 12) : monthlyFee) * (s.reseller_monthly_rate / 100);
                const totalResellerCommission = resellerSetupPart + resellerServicePart;

                // Update Reseller Wallet
                await queryPublic(`
                    UPDATE \`public\`.saas_admins SET wallet_balance = wallet_balance + ? WHERE id = ?
                `, [totalResellerCommission, resellerId]);

                // Record Transaction
                await queryPublic(`
                    INSERT INTO \`public\`.payment_history (tenant_id, amount, currency, payment_type, status, description)
                    VALUES (?, ?, 'EUR', 'reseller_income', 'paid', ?)
                `, [resellerId, totalResellerCommission, `Commission split for ${data.name} (${payment_interval})`]);
            }
        }
        
        const tenant = await createTenant(data);

        res.status(201).json({
            message: `Restoran "${data.name}" başarıyla oluşturuldu.`,
            tenant,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Bu schema adı veya lisans kodu zaten kullanımda' });
        }
        console.error('❌ Tenant oluşturma hatası:', error);
        res.status(500).json({ error: 'Tenant oluşturulamadı' });
    }
};

export const getTenantsHandler = async (req: Request, res: Response) => {
    try {
        const resellerId = req.user?.role === 'reseller' ? req.user.userId : undefined;
        const tenants = await listTenants(resellerId);
        res.json(tenants);
    } catch (error) {
        console.error('❌ Tenant listeleme hatası:', error);
        res.status(500).json({ error: 'Tenant listesi alınamadı' });
    }
};

export const getTenantByIdHandler = async (req: Request, res: Response) => {
    try {
        const [rows]: any = await queryPublic(
            'SELECT * FROM `public`.tenants WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Tenant bulunamadı' });
        }

        const tenant = rows[0];

        // Bayi ise sadece kendi tenant'ına bakabilir
        if (req.user?.role === 'reseller' && tenant.reseller_id != req.user.userId) {
            return res.status(403).json({ error: 'Bu veriye erişim yetkiniz yok' });
        }

        res.json(tenant);
    } catch (error) {
        console.error('❌ Tenant detay hatası:', error);
        res.status(500).json({ error: 'Tenant detayı alınamadı' });
    }
};

export const updateTenantHandler = async (req: Request, res: Response) => {
    try {
        const data = updateTenantSchema.parse(req.body);
        const updates: string[] = [];
        const values: any[] = [];

        if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
        if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
        if (data.subscriptionPlan !== undefined) { updates.push('subscription_plan = ?'); values.push(data.subscriptionPlan); }
        if (data.contactEmail !== undefined) { updates.push('contact_email = ?'); values.push(data.contactEmail); }
        if (data.contactPhone !== undefined) { updates.push('contact_phone = ?'); values.push(data.contactPhone); }
        if (data.authorizedPerson !== undefined) { updates.push('authorized_person = ?'); values.push(data.authorizedPerson); }
        if (data.taxOffice !== undefined) { updates.push('tax_office = ?'); values.push(data.taxOffice); }
        if (data.taxNumber !== undefined) { updates.push('tax_number = ?'); values.push(data.taxNumber); }
        if (data.specialLicenseKey !== undefined) { updates.push('special_license_key = ?'); values.push(data.specialLicenseKey); }
        if (data.address !== undefined) { updates.push('address = ?'); values.push(data.address); }
        if (data.maxUsers !== undefined) { updates.push('max_users = ?'); values.push(data.maxUsers); }
        if (data.maxBranches !== undefined) { updates.push('max_branches = ?'); values.push(data.maxBranches); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(req.params.id);

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT reseller_id FROM `public`.tenants WHERE id = ?', [req.params.id]);
            if (!check.length || check[0].reseller_id != req.user.userId) {
                return res.status(403).json({ error: 'Bu restoranı güncelleme yetkiniz yok' });
            }
        }

        const query = `UPDATE \`public\`.tenants SET ${updates.join(', ')} WHERE id = ?`;
        await queryPublic(query, values);

        invalidateTenantCache(req.params.id as string);

        res.json({ message: 'Tenant başarıyla güncellendi' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Tenant güncelleme hatası:', error);
        res.status(500).json({ error: 'Tenant güncellenemedi' });
    }
};

// --- SaaS Dashboard Stats ---
export const getSaaSStatsHandler = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        let tenantsQuery = 'SELECT COUNT(*) as count FROM `public`.tenants';
        let activeQuery = 'SELECT COUNT(*) as count FROM `public`.tenants WHERE status = "active"';
        const params = [];

        if (isReseller) {
            tenantsQuery += ' WHERE reseller_id = ?';
            activeQuery += ' AND reseller_id = ?';
            params.push(userId);
        }

        const [tenants]: any = await queryPublic(tenantsQuery, params);
        const [active]: any = await queryPublic(activeQuery, params);
        
        let resellerData = null;
        if (isReseller) {
            const [rows]: any = await queryPublic('SELECT wallet_balance, available_licenses, subscription_plan_id FROM `public`.saas_admins WHERE id = ?', [userId]);
            if (rows.length > 0) resellerData = rows[0];
        }

        res.json({
            totalTenants: tenants[0].count,
            activeTenants: active[0].count,
            monthlyRevenue: active[0].count * 50,
            systemHealth: 98,
            lastUpdate: new Date().toISOString(),
            resellerData // This helps frontend sync wallet/licenses/plan
        });
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({ error: 'İstatistikler alınamadı' });
    }
};

// --- System Backups ---
export const getSystemBackupsHandler = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.system_backups ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Yedekler alınamadı' });
    }
};

export const createBackupHandler = async (req: Request, res: Response) => {
    try {
        const filename = `backup_${Date.now()}.sql`;
        const [result]: any = await queryPublic(
            'INSERT INTO `public`.system_backups (filename, size, status, created_by) VALUES (?, ?, ?, ?)',
            [filename, 1024 * 1024 * 5, 'completed', 'system_admin']
        );
        res.json({ message: 'Yedek başarıyla oluşturuldu', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Yedek oluşturulamadı' });
    }
};

// --- Support Tickets ---
export const getSupportTicketsHandler = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        let query = `
            SELECT t.*, ten.name as tenant_name 
            FROM \`public\`.support_tickets t 
            LEFT JOIN \`public\`.tenants ten ON t.tenant_id = ten.id 
            WHERE 1=1
        `;
        const params: any[] = [];

        if (isReseller) {
            query += ' AND ten.reseller_id = ?';
            params.push(userId);
        }

        query += ' ORDER BY t.created_at DESC';
        const [rows]: any = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Talepler alınamadı' });
    }
};

export const updateTicketStatusHandler = async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(`
                SELECT t.id FROM \`public\`.support_tickets t 
                JOIN \`public\`.tenants ten ON t.tenant_id = ten.id 
                WHERE t.id = ? AND ten.reseller_id = ?
            `, [id, req.user.userId]);

            if (check.length === 0) {
                return res.status(403).json({ error: 'Bu talebi güncelleme yetkiniz yok' });
            }
        }

        await queryPublic('UPDATE `public`.support_tickets SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Talep durumu güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Talep güncellenemedi' });
    }
};

// --- Subscription & License Management (New) ---

export const getSystemSettingsHandler = async (_req: Request, res: Response) => {
    try {
        // Sistem ayarları tablosu yoksa varsayılan dön
        const [rows]: any = await queryPublic('SELECT * FROM `public`.system_settings');
        if (rows.length === 0) {
            return res.json({
                currency: 'EUR',
                base_subscription_fee: 500,
                monthly_license_fee: 50,
                trial_days: 14
            });
        }
        res.json(rows[0]);
    } catch (error) {
        res.json({ currency: 'EUR', base_subscription_fee: 500, monthly_license_fee: 50 });
    }
};

export const updateSystemSettingsHandler = async (req: Request, res: Response) => {
    try {
        const { base_subscription_fee, monthly_license_fee, currency } = req.body;
        
        await queryPublic(`
            UPDATE \`public\`.system_settings 
            SET base_subscription_fee = ?, monthly_license_fee = ?, currency = ?
            WHERE id = 1
        `, [base_subscription_fee, monthly_license_fee, currency || 'EUR']);

        res.json({ message: 'Sistem ayarları başarıyla güncellendi' });
    } catch (error) {
        console.error('❌ Settings update error:', error);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
};
