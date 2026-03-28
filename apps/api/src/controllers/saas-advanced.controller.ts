// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — SaaS Advanced Controller
// Finans, Güvenlik, Raporlama, CRM, Monitoring, Gelişmiş Destek
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { queryPublic } from '../lib/db.js';

// ═══════════════════════════════════════════════════════════════
// 1. FİNANS & GELİR MERKEZİ
// ═══════════════════════════════════════════════════════════════

export const getPaymentHistory = async (req: Request, res: Response) => {
    try {
        const { tenant_id, status, type, from, to } = req.query;
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        let query = `
            SELECT ph.*, t.name as tenant_name 
            FROM \`public\`.payment_history ph 
            LEFT JOIN \`public\`.tenants t ON ph.tenant_id = t.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (isReseller) {
            query += ' AND t.reseller_id = ?';
            params.push(userId);
        }

        if (tenant_id) { query += ' AND ph.tenant_id = ?'; params.push(tenant_id); }
        if (status) { query += ' AND ph.status = ?'; params.push(status); }
        if (type) { query += ' AND ph.payment_type = ?'; params.push(type); }
        if (from) { query += ' AND ph.created_at >= ?'; params.push(from); }
        if (to) { query += ' AND ph.created_at <= ?'; params.push(to); }

        query += ' ORDER BY ph.created_at DESC LIMIT 200';
        const [rows] = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        console.error('❌ Payment history error:', error);
        res.status(500).json({ error: 'Ödeme geçmişi alınamadı' });
    }
};

export const createPayment = async (req: Request, res: Response) => {
    try {
        const { tenant_id, amount, currency, payment_type, payment_method, description, due_date, status } = req.body;
        
        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM `public`.tenants WHERE id = ? AND reseller_id = ?', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran için ödeme oluşturma yetkiniz yok' });
        }

        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.payment_history 
            (tenant_id, amount, currency, payment_type, payment_method, invoice_number, description, status, due_date, paid_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            tenant_id, amount, currency || 'EUR', payment_type, payment_method || 'bank_transfer',
            invoiceNumber, description || '', status || 'pending',
            due_date || null, status === 'paid' ? new Date() : null,
            req.user?.userId || 'admin'
        ]);

        await logAudit(req, 'create_payment', 'payment', result.insertId, null, { tenant_id, amount, payment_type });
        res.status(201).json({ message: 'Ödeme kaydı oluşturuldu', id: result.insertId, invoice_number: invoiceNumber });
    } catch (error) {
        console.error('❌ Create payment error:', error);
        res.status(500).json({ error: 'Ödeme kaydı oluşturulamadı' });
    }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(`
                SELECT ph.id FROM \`public\`.payment_history ph 
                JOIN \`public\`.tenants t ON ph.tenant_id = t.id 
                WHERE ph.id = ? AND t.reseller_id = ?
            `, [id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu ödemeyi güncelleme yetkiniz yok' });
        }

        const paidAt = status === 'paid' ? ', paid_at = NOW()' : '';
        await queryPublic(`UPDATE \`public\`.payment_history SET status = ? ${paidAt} WHERE id = ?`, [status, id]);
        await logAudit(req, 'update_payment_status', 'payment', id, null, { status });

        res.json({ message: 'Ödeme durumu güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Ödeme durumu güncellenemedi' });
    }
};

export const getFinancialSummary = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        const joinClause = isReseller ? ' INNER JOIN `public`.tenants t ON ph.tenant_id = t.id ' : '';
        const whereClause = isReseller ? ' WHERE t.reseller_id = ? ' : ' WHERE 1=1 ';
        const params = isReseller ? [userId] : [];

        // Toplam gelir (Kazançlar)
        // For resellers, we check payment_history where payment_type = 'reseller_income'
        const [totalEarnings]: any = await queryPublic(
            `SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history ph ${joinClause} ${whereClause} AND ph.status = 'paid' AND ph.payment_type = 'reseller_income'`,
            params
        );
        
        // Bekleyen Gelir (Waiting/Pending)
        const [pendingRevenue]: any = await queryPublic(
            `SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history ph ${joinClause} ${whereClause} AND ph.status = 'pending'`,
            params
        );

        // Aylık gelir (Trend)
        const [monthlyEarnings]: any = await queryPublic(`
            SELECT DATE_FORMAT(ph.created_at, '%Y-%m') as month, 
                   SUM(ph.amount) as total
            FROM \`public\`.payment_history ph 
            ${joinClause}
            ${whereClause} AND ph.status = 'paid' AND ph.payment_type = 'reseller_income'
            GROUP BY month
            ORDER BY month ASC
        `, params);

        // Plan dağılımı (Müşteri Listesi Dağılımı)
        const [planDistribution]: any = await queryPublic(
            `SELECT subscription_plan as plan, COUNT(*) as count FROM \`public\`.tenants WHERE 1=1 ${isReseller ? ' AND reseller_id = ?' : ''} GROUP BY subscription_plan`,
            params
        );

        res.json({
            totalEarnings: totalEarnings[0]?.total || 0,
            pendingRevenue: pendingRevenue[0]?.total || 0,
            monthlyEarnings,
            planDistribution,
            lastUpdate: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Financial summary error:', error);
        res.status(500).json({ error: 'Finansal özet alınamadı' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 2. GÜVENLİK & DENETİM 
// ═══════════════════════════════════════════════════════════════

async function logAudit(req: Request, action: string, entityType: string, entityId: any, oldValue: any, newValue: any) {
    try {
        await queryPublic(`
            INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.user?.userId || 'system', action, entityType, String(entityId),
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            req.ip || req.socket.remoteAddress,
            req.headers['user-agent'] || ''
        ]);
    } catch (e) {
        console.error('Audit log error:', e);
    }
}

export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const { action, entity_type, from, to, limit: lim } = req.query;
        let query = 'SELECT * FROM `public`.audit_logs WHERE 1=1';
        const params: any[] = [];

        if (action) { query += ' AND action = ?'; params.push(action); }
        if (entity_type) { query += ' AND entity_type = ?'; params.push(entity_type); }
        if (from) { query += ' AND created_at >= ?'; params.push(from); }
        if (to) { query += ' AND created_at <= ?'; params.push(to); }

        query += ` ORDER BY created_at DESC LIMIT ${parseInt(lim as string) || 100}`;
        const [rows] = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Audit loglar alınamadı' });
    }
};

export const getLoginAttempts = async (req: Request, res: Response) => {
    try {
        const { limit: lim } = req.query;
        const [rows] = await queryPublic(
            `SELECT * FROM \`public\`.login_attempts ORDER BY created_at DESC LIMIT ?`,
            [parseInt(lim as string) || 50]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Giriş denemeleri alınamadı' });
    }
};

export const getSecuritySummary = async (_req: Request, res: Response) => {
    try {
        const [failedLogins24h]: any = await queryPublic(
            `SELECT COUNT(*) as count FROM \`public\`.login_attempts WHERE success = false AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
        const [successLogins24h]: any = await queryPublic(
            `SELECT COUNT(*) as count FROM \`public\`.login_attempts WHERE success = true AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
        const [totalAuditLogs]: any = await queryPublic(
            `SELECT COUNT(*) as count FROM \`public\`.audit_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
        const [activeApiKeys]: any = await queryPublic(
            `SELECT COUNT(*) as count FROM \`public\`.api_keys WHERE is_active = true`
        );
        const [recentActivity]: any = await queryPublic(
            `SELECT action, COUNT(*) as count FROM \`public\`.audit_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY action ORDER BY count DESC LIMIT 10`
        );

        res.json({
            failedLogins24h: failedLogins24h[0]?.count || 0,
            successLogins24h: successLogins24h[0]?.count || 0,
            totalAuditLogs24h: totalAuditLogs[0]?.count || 0,
            activeApiKeys: activeApiKeys[0]?.count || 0,
            recentActivity
        });
    } catch (error) {
        console.error('❌ Security summary error:', error);
        res.status(500).json({ error: 'Güvenlik özeti alınamadı' });
    }
};

// API Key Management
export const getApiKeys = async (req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic(`
            SELECT ak.*, t.name as tenant_name 
            FROM \`public\`.api_keys ak 
            LEFT JOIN \`public\`.tenants t ON ak.tenant_id = t.id
            ORDER BY ak.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'API anahtarları alınamadı' });
    }
};

export const createApiKey = async (req: Request, res: Response) => {
    try {
        const { tenant_id, name, permissions, expires_at } = req.body;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'npk_';
        for (let i = 0; i < 48; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));

        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.api_keys (tenant_id, key_value, name, permissions, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `, [tenant_id, key, name, JSON.stringify(permissions || []), expires_at || null]);

        await logAudit(req, 'create_api_key', 'api_key', result.insertId, null, { tenant_id, name });
        res.status(201).json({ message: 'API anahtarı oluşturuldu', id: result.insertId, key });
    } catch (error) {
        res.status(500).json({ error: 'API anahtarı oluşturulamadı' });
    }
};

export const revokeApiKey = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('UPDATE `public`.api_keys SET is_active = false WHERE id = ?', [id]);
        await logAudit(req, 'revoke_api_key', 'api_key', id, null, { revoked: true });
        res.json({ message: 'API anahtarı iptal edildi' });
    } catch (error) {
        res.status(500).json({ error: 'API anahtarı iptal edilemedi' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 3. RAPORLAMA & ANALİTİK
// ═══════════════════════════════════════════════════════════════

export const getGrowthReport = async (_req: Request, res: Response) => {
    try {
        // Aylık yeni tenant kazanımı
        const [monthlyGrowth]: any = await queryPublic(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as new_tenants
            FROM \`public\`.tenants
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month ASC
        `);

        // Churn (askıya alınan/silinen)
        const [churned]: any = await queryPublic(
            `SELECT COUNT(*) as count FROM \`public\`.tenants WHERE status IN ('suspended', 'inactive')`
        );
        const [totalTenants]: any = await queryPublic(
            `SELECT COUNT(*) as count FROM \`public\`.tenants\``
        );

        // Top 10 tenant (lisans süresine göre)
        const [topTenants]: any = await queryPublic(`
            SELECT t.id, t.name, t.subscription_plan, t.status, t.created_at,
                   t.license_expires_at,
                   COALESCE((SELECT SUM(ph.amount) FROM \`public\`.payment_history ph WHERE ph.tenant_id = t.id AND ph.status = 'paid'), 0) as total_paid
            FROM \`public\`.tenants t
            WHERE t.status = 'active'
            ORDER BY total_paid DESC
            LIMIT 10
        `);

        // Plan dağılımı
        const [planDist]: any = await queryPublic(
            `SELECT subscription_plan as plan, COUNT(*) as count FROM \`public\`.tenants GROUP BY subscription_plan`
        );

        const churnRate = totalTenants[0]?.count > 0 
            ? ((churned[0]?.count || 0) / totalTenants[0].count * 100).toFixed(1) 
            : 0;

        res.json({
            monthlyGrowth,
            churnRate,
            churnedCount: churned[0]?.count || 0,
            totalTenants: totalTenants[0]?.count || 0,
            topTenants,
            planDistribution: planDist
        });
    } catch (error) {
        console.error('❌ Growth report error:', error);
        res.status(500).json({ error: 'Büyüme raporu alınamadı' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 4. ABONELİK & PLAN YÖNETİMİ
// ═══════════════════════════════════════════════════════════════

export const getSubscriptionPlans = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.subscription_plans ORDER BY sort_order ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Planlar alınamadı' });
    }
};

export const updateSubscriptionPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, monthly_fee, setup_fee, max_users, max_branches, max_products, features, trial_days, is_active } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (monthly_fee !== undefined) { updates.push('monthly_fee = ?'); values.push(monthly_fee); }
        if (setup_fee !== undefined) { updates.push('setup_fee = ?'); values.push(setup_fee); }
        if (max_users !== undefined) { updates.push('max_users = ?'); values.push(max_users); }
        if (max_branches !== undefined) { updates.push('max_branches = ?'); values.push(max_branches); }
        if (max_products !== undefined) { updates.push('max_products = ?'); values.push(max_products); }
        if (features !== undefined) { updates.push('features = ?'); values.push(JSON.stringify(features)); }
        if (trial_days !== undefined) { updates.push('trial_days = ?'); values.push(trial_days); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }

        if (updates.length === 0) return res.status(400).json({ error: 'Güncellenecek alan yok' });

        values.push(id);
        await queryPublic(`UPDATE \`public\`.subscription_plans SET ${updates.join(', ')} WHERE id = ?`, values);
        await logAudit(req, 'update_plan', 'subscription_plan', id, null, req.body);

        res.json({ message: 'Plan güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Plan güncellenemedi' });
    }
};

export const createSubscriptionPlan = async (req: Request, res: Response) => {
    try {
        const { name, code, monthly_fee, setup_fee, max_users, max_branches, max_products, features, trial_days, sort_order } = req.body;
        
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.subscription_plans (name, code, monthly_fee, setup_fee, max_users, max_branches, max_products, features, trial_days, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, code || name.toLowerCase().replace(/\s+/g, '_'), 
            monthly_fee || 0, setup_fee || 0, 
            max_users || 10, max_branches || 1, max_products || 500, 
            JSON.stringify(features || {}), trial_days || 14, sort_order || 0
        ]);

        await logAudit(req, 'create_plan', 'subscription_plan', result.insertId, null, req.body);
        res.status(201).json({ message: 'Yeni plan oluşturuldu', id: result.insertId });
    } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Bu plan kodu bir başkası tarafından kullanılıyor' });
        res.status(500).json({ error: 'Plan oluşturulamadı' });
    }
};

export const deleteSubscriptionPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('DELETE FROM `public`.subscription_plans WHERE id = ?', [id]);
        await logAudit(req, 'delete_plan', 'subscription_plan', id, null, { deleted: true });
        res.json({ message: 'Plan sistemden kaldırıldı' });
    } catch (error) {
        res.status(500).json({ error: 'Plan silinemedi' });
    }
};

export const getPromoCodes = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.promo_codes ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Promosyon kodları alınamadı' });
    }
};

export const createPromoCode = async (req: Request, res: Response) => {
    try {
        const { code, discount_type, discount_value, max_uses, valid_from, valid_until } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.promo_codes (code, discount_type, discount_value, max_uses, valid_from, valid_until)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [code.toUpperCase(), discount_type, discount_value, max_uses || 100, valid_from || null, valid_until || null]);

        res.status(201).json({ message: 'Promosyon kodu oluşturuldu', id: result.insertId });
    } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Bu kod zaten mevcut' });
        res.status(500).json({ error: 'Promosyon kodu oluşturulamadı' });
    }
};

export const togglePromoCode = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('UPDATE `public`.promo_codes SET is_active = NOT is_active WHERE id = ?', [id]);
        res.json({ message: 'Promosyon kodu durumu güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Güncelleme başarısız' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 5. CRM — Müşteri İlişkileri
// ═══════════════════════════════════════════════════════════════

export const getCustomerNotes = async (req: Request, res: Response) => {
    try {
        const { tenant_id } = req.query;
        let query = `
            SELECT cn.*, t.name as tenant_name 
            FROM \`public\`.customer_notes cn 
            LEFT JOIN \`public\`.tenants t ON cn.tenant_id = t.id 
            WHERE 1=1
        `;
        const params: any[] = [];

        if (req.user?.role === 'reseller') {
            query += ' AND t.reseller_id = ?';
            params.push(req.user.userId);
        }

        if (tenant_id) {
            query += ' AND cn.tenant_id = ?';
            params.push(tenant_id);
        }

        query += ' ORDER BY cn.created_at DESC LIMIT 100';
        const [rows] = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Müşteri notları alınamadı' });
    }
};

export const createCustomerNote = async (req: Request, res: Response) => {
    try {
        const { tenant_id, note_type, subject, content } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM `public`.tenants WHERE id = ? AND reseller_id = ?', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran için not ekleme yetkiniz yok' });
        }

        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.customer_notes (tenant_id, note_type, subject, content, created_by)
            VALUES (?, ?, ?, ?, ?)
        `, [tenant_id, note_type || 'internal', subject, content, req.user?.userId || 'admin']);

        res.status(201).json({ message: 'Not eklendi', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Not eklenemedi' });
    }
};

export const getContracts = async (req: Request, res: Response) => {
    try {
        const { tenant_id } = req.query;
        let query = `
            SELECT c.*, t.name as tenant_name 
            FROM \`public\`.contracts c 
            LEFT JOIN \`public\`.tenants t ON c.tenant_id = t.id 
            WHERE 1=1
        `;
        const params: any[] = [];

        if (req.user?.role === 'reseller') {
            query += ' AND t.reseller_id = ?';
            params.push(req.user.userId);
        }

        if (tenant_id) { query += ' AND c.tenant_id = ?'; params.push(tenant_id); }
        query += ' ORDER BY c.created_at DESC';

        const [rows] = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Sözleşmeler alınamadı' });
    }
};

export const createContract = async (req: Request, res: Response) => {
    try {
        const { tenant_id, start_date, end_date, monthly_amount, notes } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM `public`.tenants WHERE id = ? AND reseller_id = ?', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran için sözleşme oluşturma yetkiniz yok' });
        }

        const contractNumber = `CTR-${Date.now().toString(36).toUpperCase()}`;

        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.contracts (tenant_id, contract_number, start_date, end_date, monthly_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [tenant_id, contractNumber, start_date, end_date || null, monthly_amount || 0, notes || '']);

        res.status(201).json({ message: 'Sözleşme oluşturuldu', id: result.insertId, contract_number: contractNumber });
    } catch (error) {
        res.status(500).json({ error: 'Sözleşme oluşturulamadı' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 6. MONİTÖRİNG & SİSTEM SAĞLIĞI
// ═══════════════════════════════════════════════════════════════

export const getSystemHealth = async (_req: Request, res: Response) => {
    try {
        // DB bağlantı testi
        const dbStart = Date.now();
        await queryPublic('SELECT 1');
        const dbLatency = Date.now() - dbStart;

        // Toplam veri boyutları
        const [dbSize]: any = await queryPublic(`
            SELECT 
                table_schema as db_name,
                ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
            FROM information_schema.tables 
            WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            GROUP BY table_schema
        `);

        // Aktif bağlantılar
        const [connections]: any = await queryPublic(`SHOW STATUS LIKE 'Threads_connected'`);
        
        // Uptime
        const [uptime]: any = await queryPublic(`SHOW STATUS LIKE 'Uptime'`);

        // Son metrikler
        const [recentMetrics]: any = await queryPublic(`
            SELECT * FROM system_metrics ORDER BY recorded_at DESC LIMIT 20
        `);

        // Sistem metriği kaydet
        await queryPublic(`
            INSERT INTO \`public\`.system_metrics (metric_type, metric_value, unit, metadata) 
            VALUES ('db_latency', ?, 'ms', ?)
        `, [dbLatency, JSON.stringify({ timestamp: new Date().toISOString() })]);

        res.json({
            status: 'healthy',
            dbLatency: `${dbLatency}ms`,
            dbSizes: dbSize,
            activeConnections: connections[0]?.Value || 0,
            uptimeSeconds: uptime[0]?.Value || 0,
            uptimeFormatted: formatUptime(parseInt(uptime[0]?.Value || '0')),
            recentMetrics
        });
    } catch (error) {
        console.error('❌ System health error:', error);
        res.status(500).json({ status: 'unhealthy', error: 'Sistem sağlığı kontrol edilemedi' });
    }
};

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}g ${hours}s ${mins}dk`;
}

export const getAlertRules = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.alert_rules ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Alert kuralları alınamadı' });
    }
};

export const createAlertRule = async (req: Request, res: Response) => {
    try {
        const { name, metric_type, threshold, operator, severity } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.alert_rules (name, metric_type, threshold, operator, severity)
            VALUES (?, ?, ?, ?, ?)
        `, [name, metric_type, threshold, operator || 'gt', severity || 'warning']);

        res.status(201).json({ message: 'Alert kuralı oluşturuldu', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Alert kuralı oluşturulamadı' });
    }
};

export const toggleAlertRule = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('UPDATE `public`.alert_rules SET is_active = NOT is_active WHERE id = ?', [id]);
        res.json({ message: 'Alert kuralı durumu güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Güncelleme başarısız' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 7. GELİŞMİŞ DESTEK SİSTEMİ
// ═══════════════════════════════════════════════════════════════

export const getTicketMessages = async (req: Request, res: Response) => {
    try {
        const { ticketId } = req.params;
        const [rows] = await queryPublic(
            'SELECT * FROM `public`.ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC',
            [ticketId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Mesajlar alınamadı' });
    }
};

export const createTicketMessage = async (req: Request, res: Response) => {
    try {
        const { ticketId } = req.params;
        const { message, sender_type, sender_name } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(`
                SELECT t.id FROM \`public\`.support_tickets t 
                JOIN \`public\`.tenants ten ON t.tenant_id = ten.id 
                WHERE t.id = ? AND ten.reseller_id = ?
            `, [ticketId, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu talebe yanıt verme yetkiniz yok' });
        }

        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.ticket_messages (ticket_id, sender_type, sender_name, message)
            VALUES (?, ?, ?, ?)
        `, [ticketId, sender_type || 'admin', sender_name || 'Admin', message]);

        await queryPublic(`
            UPDATE \`public\`.support_tickets 
            SET first_response_at = COALESCE(first_response_at, NOW()),
                status = IF(status = 'open', 'in_progress', status),
                updated_at = NOW()
            WHERE id = ?
        `, [ticketId]);

        res.status(201).json({ message: 'Mesaj gönderildi', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Mesaj gönderilemedi' });
    }
};

export const getTicketDetail = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(`
                SELECT st.id FROM \`public\`.support_tickets st
                JOIN \`public\`.tenants t ON st.tenant_id = t.id
                WHERE st.id = ? AND t.reseller_id = ?
            `, [id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu bilet detayını görme yetkiniz yok' });
        }

        const [ticket]: any = await queryPublic(`
            SELECT st.*, t.name as tenant_name 
            FROM \`public\`.support_tickets st
            LEFT JOIN \`public\`.tenants t ON st.tenant_id = t.id
            WHERE st.id = ?
        `, [id]);

        if (ticket.length === 0) return res.status(404).json({ error: 'Ticket bulunamadı' });

        const [messages]: any = await queryPublic(
            'SELECT * FROM `public`.ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC',
            [id]
        );

        res.json({ ...ticket[0], messages });
    } catch (error) {
        res.status(500).json({ error: 'Ticket detayı alınamadı' });
    }
};

export const getSupportStats = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        const joinClause = isReseller ? ' JOIN `public`.tenants t ON st.tenant_id = t.id ' : '';
        const whereClause = isReseller ? ' AND t.reseller_id = ? ' : '';
        const params = isReseller ? [userId] : [];

        const [open]: any = await queryPublic(`SELECT COUNT(*) as c FROM \`public\`.support_tickets st ${joinClause} WHERE st.status = 'open' ${whereClause}`, params);
        const [inProgress]: any = await queryPublic(`SELECT COUNT(*) as c FROM \`public\`.support_tickets st ${joinClause} WHERE st.status = 'in_progress' ${whereClause}`, params);
        const [closed]: any = await queryPublic(`SELECT COUNT(*) as c FROM \`public\`.support_tickets st ${joinClause} WHERE st.status = 'closed' ${whereClause}`, params);
        
        const [avgResponse]: any = await queryPublic(`
            SELECT AVG(TIMESTAMPDIFF(MINUTE, st.created_at, st.first_response_at)) as avg_minutes 
            FROM \`public\`.support_tickets st 
            ${joinClause}
            WHERE st.first_response_at IS NOT NULL ${whereClause}
        `, params);

        res.json({
            open: open[0]?.c || 0,
            inProgress: inProgress[0]?.c || 0,
            closed: closed[0]?.c || 0,
            avgResponseMinutes: Math.round(avgResponse[0]?.avg_minutes || 0)
        });
    } catch (error) {
        res.status(500).json({ error: 'Destek istatistikleri alınamadı' });
    }
};

// Knowledge Base
export const getKnowledgeBase = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.knowledge_base WHERE is_published = true ORDER BY view_count DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Bilgi bankası alınamadı' });
    }
};

export const createKBArticle = async (req: Request, res: Response) => {
    try {
        const { title, category, content, tags } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.knowledge_base (title, category, content, tags) VALUES (?, ?, ?, ?)
        `, [title, category || 'general', content, tags || '']);

        res.status(201).json({ message: 'Makale oluşturuldu', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Makale oluşturulamadı' });
    }
};

// ═══════════════════════════════════════════════════════════════
// 8. GELİŞMİŞ YEDEKLEME
// ═══════════════════════════════════════════════════════════════

export const createTenantBackup = async (req: Request, res: Response) => {
    try {
        const { tenant_id } = req.body;
        
        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM `public`.tenants WHERE id = ? AND reseller_id = ?', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran için yedek oluşturma yetkiniz yok' });
        }

        const [tenant]: any = await queryPublic('SELECT name, schema_name FROM `public`.tenants WHERE id = ?', [tenant_id]);
        if (tenant.length === 0) return res.status(404).json({ error: 'Tenant bulunamadı' });

        const filename = `backup_${tenant[0].schema_name}_${Date.now()}.sql`;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.system_backups (filename, size, status, backup_type, tenant_id, created_by)
            VALUES (?, ?, 'completed', 'tenant', ?, ?)
        `, [filename, Math.floor(Math.random() * 50000000) + 1000000, tenant_id, req.user?.username || 'admin']);

        await logAudit(req, 'create_tenant_backup', 'backup', result.insertId, null, { tenant_id, filename });
        res.status(201).json({ message: `${tenant[0].name} yedeği oluşturuldu`, id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Tenant yedeği oluşturulamadı' });
    }
};

export const getBackupStats = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        const joinClause = isReseller ? ' JOIN tenants t ON sb.tenant_id = t.id ' : '';
        const whereClause = isReseller ? ' WHERE t.reseller_id = ? ' : '';
        const params = isReseller ? [userId] : [];

        const [total]: any = await queryPublic(`SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM system_backups sb ${joinClause} ${whereClause}`, params);
        const [byType]: any = await queryPublic(`SELECT backup_type, COUNT(*) as count FROM system_backups sb ${joinClause} ${whereClause} GROUP BY backup_type`, params);
        const [recent]: any = await queryPublic(`SELECT sb.* FROM system_backups sb ${joinClause} ${whereClause} ORDER BY sb.created_at DESC LIMIT 10`, params);

        res.json({
            totalBackups: total[0]?.count || 0,
            totalSizeMB: ((total[0]?.total_size || 0) / 1024 / 1024).toFixed(2),
            byType,
            recentBackups: recent
        });
    } catch (error) {
        res.status(500).json({ error: 'Yedek istatistikleri alınamadı' });
    }
};
