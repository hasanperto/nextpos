// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — SaaS Advanced Controller
// Finans, Güvenlik, Raporlama, CRM, Monitoring, Gelişmiş Destek
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { invalidateTenantCache, queryPublic } from '../lib/db.js';
import { trySendMail } from '../lib/email.js';
import { migrateBillingTables } from '../services/billing.service.js';
import { ensureDeviceResetQuotaSchema } from '../services/device-reset-quota.service.js';

// ═══════════════════════════════════════════════════════════════
// 1. FİNANS & GELİR MERKEZİ
// ═══════════════════════════════════════════════════════════════

export const getPaymentHistory = async (req: Request, res: Response) => {
    try {
        const { tenant_id, status, type, from, to } = req.query;
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        let query = `
            SELECT ph.*, COALESCE(t.name, a.company_name, a.username) as tenant_name
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            LEFT JOIN \`public\`.saas_admins a ON ph.saas_admin_id = a.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (isReseller) {
            query += ' AND (ph.saas_admin_id = ? OR t.reseller_id = ?)';
            params.push(userId, userId);
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
        const { tenant_id, amount, currency, payment_type, payment_method, description, due_date, due_days, due_weeks, status } =
            req.body;

        // Eğer due_date direkt gönderilmediyse (3 gün / 1 hafta gibi) due_* ile hesaplayalım.
        let resolvedDueDate = due_date ?? null;
        if ((status === 'pending' || !status) && !resolvedDueDate) {
            const dDays = due_days != null ? Number(due_days) : null;
            const dWeeks = due_weeks != null ? Number(due_weeks) : null;
            const days = dDays != null ? dDays : dWeeks != null ? dWeeks * 7 : null;
            if (days != null && Number.isFinite(days) && days > 0) {
                resolvedDueDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
            }
        }
        
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
            resolvedDueDate || null, status === 'paid' ? new Date() : null,
            req.user?.userId || 'admin'
        ]);

        await logAudit(req, 'create_payment', 'payment', result.insertId, null, { tenant_id, amount, payment_type });

        if (status === 'paid') {
            try {
                const [tRow]: any = await queryPublic(`SELECT name, contact_email FROM \`public\`.tenants WHERE id::text = ?`, [String(tenant_id)]);
                const tName = tRow?.[0]?.name || '';
                await createInvoiceFromPayment(
                    { tenant_id, amount, currency: currency || 'EUR', payment_type, due_date: resolvedDueDate, tenant_name: tName },
                    invoiceNumber,
                );
            } catch {}
        }

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
                JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
                WHERE ph.id = ? AND t.reseller_id = ?
            `, [id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu ödemeyi güncelleme yetkiniz yok' });
        }

        let invoiceNumber: string | null = null;

        if (status === 'paid') {
            const [existing]: any = await queryPublic(
                `SELECT invoice_number FROM \`public\`.payment_history WHERE id = ?`,
                [id]
            );
            invoiceNumber = existing?.[0]?.invoice_number || null;
            if (!invoiceNumber) {
                invoiceNumber = generateInvoiceNumber();
            }
            await queryPublic(
                `UPDATE \`public\`.payment_history SET status = 'paid', paid_at = NOW(), invoice_number = COALESCE(invoice_number, ?) WHERE id = ?`,
                [invoiceNumber, id]
            );
        } else {
            await queryPublic(`UPDATE \`public\`.payment_history SET status = ? WHERE id = ?`, [status, id]);
        }

        await logAudit(req, 'update_payment_status', 'payment', id, null, { status });

        if (status === 'paid') {
            const [phRow]: any = await queryPublic(
                `SELECT ph.*, t.name as tenant_name, t.contact_email, t.tax_office, t.tax_number
                 FROM \`public\`.payment_history ph
                 LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
                 WHERE ph.id = ?`,
                [id]
            );
            const p = phRow?.[0];
            if (p) {
                const tenantId = p.tenant_id ? String(p.tenant_id) : null;
                const invNo = p.invoice_number || invoiceNumber;

                await createInvoiceFromPayment(p, invNo);

                if (tenantId && p.payment_type === 'subscription' && String(p.description || '').includes('Havale bekleniyor')) {
                    const [trows]: any = await queryPublic(
                        `SELECT id, reseller_id, settings FROM \`public\`.tenants WHERE trim(id::text) = trim(?)`,
                        [tenantId]
                    );
                    const trow = trows?.[0];
                    let settings: Record<string, unknown> = {};
                    if (trow?.settings) {
                        settings =
                            typeof trow.settings === 'string'
                                ? (JSON.parse(trow.settings) as Record<string, unknown>)
                                : (trow.settings as Record<string, unknown>);
                    }
                    const pending = settings.pending_bank_transfer === true;
                    const rc = Number(settings.reseller_commission_amount ?? 0);
                    const rid = trow?.reseller_id != null ? Number(trow.reseller_id) : null;
                    if (pending && rc > 0 && rid != null) {
                        const [tbrows]: any = await queryPublic(
                            `SELECT billing_cycle FROM \`public\`.tenant_billing WHERE trim(tenant_id::text) = trim(?) LIMIT 1`,
                            [tenantId]
                        );
                        const cycle = tbrows?.[0]?.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
                        const commDesc = `Komisyon (${cycle}) — Havale onayı · ${String(p.tenant_name || '').trim()}`;

                        const [dup]: any = await queryPublic(
                            `SELECT id FROM \`public\`.payment_history
                             WHERE trim(tenant_id::text) = trim(?) AND payment_type = 'reseller_income' AND status = 'paid'
                               AND description ILIKE '%Havale onayı%'
                             LIMIT 1`,
                            [tenantId]
                        );
                        if (!dup?.length) {
                            await queryPublic(
                                `INSERT INTO \`public\`.payment_history (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at)
                                 VALUES (?, ?, ?, 'EUR', 'reseller_income', 'bank_transfer', 'paid', ?, NOW())`,
                                [tenantId, rid, rc, commDesc]
                            );
                        }
                        await queryPublic(
                            `UPDATE \`public\`.tenants SET settings = (COALESCE(settings::jsonb, '{}'::jsonb) - 'pending_bank_transfer' - 'reseller_commission_amount' - 'first_invoice_total')
                             WHERE trim(id::text) = trim(?)`,
                            [tenantId]
                        );
                        invalidateTenantCache(tenantId);
                    }
                }

                if (tenantId) {
                    const [cnt]: any = await queryPublic(
                        `SELECT COUNT(*) as c FROM \`public\`.payment_history
                         WHERE tenant_id = ? AND due_date IS NOT NULL
                           AND due_date <= CURRENT_DATE
                           AND status IN ('pending','overdue')`,
                        [tenantId]
                    );
                    const c = Number(cnt?.[0]?.c || 0);
                    if (c === 0) {
                        await queryPublic(`UPDATE \`public\`.tenants SET status = 'active' WHERE id = ?`, [tenantId]);
                        await queryPublic(
                            `UPDATE \`public\`.tenant_billing
                             SET suspended_at = NULL, suspension_reason = NULL, payment_current = true
                             WHERE trim(tenant_id::text) = ?`,
                            [tenantId]
                        );
                        invalidateTenantCache(tenantId);
                    }
                }
            }
        }

        res.json({ message: 'Ödeme durumu güncellendi', invoice_number: invoiceNumber });
    } catch (error) {
        console.error('updatePaymentStatus error:', error);
        res.status(500).json({ error: 'Ödeme durumu güncellenemedi' });
    }
};

function generateInvoiceNumber(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const seq = Date.now().toString(36).toUpperCase().slice(-6);
    return `INV-${y}${m}-${seq}`;
}

export { createInvoiceFromPayment as createInvoiceFromPaidPayment };
async function createInvoiceFromPayment(p: any, invNo: string): Promise<void> {
    try {
        await ensureInvoicesTable();

        const amount = Number(p.amount || 0);
        const taxRate = 19;
        const taxAmount = Math.round((amount * taxRate) / (100 + taxRate) * 100) / 100;
        const subtotal = Math.round((amount - taxAmount) * 100) / 100;

        const items = JSON.stringify([{
            description: paymentTypeDescription(p.payment_type),
            quantity: 1,
            unit_price: subtotal,
            total: subtotal,
        }]);

        await queryPublic(
            `INSERT INTO \`public\`.invoices
             (tenant_id, invoice_number, items, subtotal, tax_rate, tax_amount, total, currency, status, due_date, paid_at, notes)
             VALUES (?, ?, ?::jsonb, ?, ?, ?, ?, ?, 'paid', ?, NOW(), ?)
             ON CONFLICT (invoice_number) DO UPDATE SET status = 'paid'
             RETURNING id`,
            [
                p.tenant_id, invNo, items, subtotal, taxRate, taxAmount, amount,
                p.currency || 'EUR', p.due_date || null,
                `${p.tenant_name || ''} — ${paymentTypeDescription(p.payment_type)}`,
            ]
        );
    } catch (e) {
        console.warn('createInvoiceFromPayment:', e);
    }
}

function paymentTypeDescription(pt: string): string {
    const map: Record<string, string> = {
        subscription: 'Abonelik ücreti',
        setup: 'Kurulum ücreti',
        addon: 'Ek modül ücreti',
        license: 'Lisans ücreti',
        refund: 'İade',
        reseller_income: 'Bayi komisyonu',
        reseller_package_onboarding: 'Bayi paket / onboarding',
        license_upgrade: 'Lisans yükseltme',
    };
    return map[pt] || pt;
}

let _tenantFieldsReady = false;
async function ensureTenantBillingFields(): Promise<void> {
    if (_tenantFieldsReady) return;
    try {
        const cols = ['tax_office VARCHAR(100)', 'tax_number VARCHAR(30)', 'authorized_person VARCHAR(150)', 'company_title VARCHAR(255)'];
        for (const col of cols) {
            const name = col.split(' ')[0];
            try {
                await queryPublic(`ALTER TABLE \`public\`.tenants ADD COLUMN IF NOT EXISTS ${name} ${col.split(' ').slice(1).join(' ')}`);
            } catch {}
        }
        _tenantFieldsReady = true;
    } catch (e: any) {
        console.warn('ensureTenantBillingFields:', e?.message);
    }
}

let _invoicesTableReady = false;
async function ensureInvoicesTable(): Promise<void> {
    if (_invoicesTableReady) return;
    try {
        await queryPublic(`
            CREATE TABLE IF NOT EXISTS \`public\`.invoices (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(36) NOT NULL,
                invoice_number VARCHAR(50) UNIQUE NOT NULL,
                items JSONB,
                subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
                tax_rate NUMERIC(5,2) DEFAULT 19.00,
                tax_amount NUMERIC(10,2) DEFAULT 0,
                total NUMERIC(10,2) NOT NULL DEFAULT 0,
                currency VARCHAR(5) DEFAULT 'EUR',
                status VARCHAR(20) DEFAULT 'draft',
                due_date DATE,
                paid_at TIMESTAMPTZ,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        _invoicesTableReady = true;
    } catch (e: any) {
        if (e?.code === '42P07') { _invoicesTableReady = true; return; }
        console.warn('ensureInvoicesTable:', e?.message);
    }
}

// ═════════════════════════════════════════════
// Muhasebe Inbox (vadeli abonelik ödemeleri)
// ═════════════════════════════════════════════
export const getFinanceInbox = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        const params: any[] = isReseller ? [userId] : [];
        const whereTenant = isReseller ? ' AND t.reseller_id = ?' : '';

        const [pendingRows]: any = await queryPublic(
            `
            SELECT ph.*,
                   t.name as tenant_name
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t
                   ON trim(ph.tenant_id::text) = t.id::text
            WHERE ph.payment_type = 'subscription'
              AND ph.status IN ('pending','overdue')
              AND ph.due_date IS NOT NULL
              ${whereTenant}
            ORDER BY ph.due_date ASC, ph.created_at DESC
            LIMIT 50
            `,
            params
        );

        const [paidRows]: any = await queryPublic(
            `
            SELECT ph.*,
                   t.name as tenant_name
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t
                   ON trim(ph.tenant_id::text) = t.id::text
            WHERE ph.payment_type = 'subscription'
              AND ph.status = 'paid'
              AND ph.paid_at IS NOT NULL
              ${whereTenant}
              AND ph.paid_at >= (NOW() - INTERVAL '30 days')
            ORDER BY ph.paid_at DESC
            LIMIT 50
            `,
            params
        );

        res.json({
            pending: pendingRows || [],
            paidRecent: paidRows || [],
        });
    } catch (error) {
        console.error('getFinanceInbox error:', error);
        res.status(500).json({ error: 'Muhasebe inbox alınamadı' });
    }
};

export const sendPaymentDueMail = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        const params: any[] = isReseller ? [id, userId] : [id];
        const authWhere = isReseller ? ' AND t.reseller_id = ?' : '';

        const [rows]: any = await queryPublic(
            `
            SELECT ph.*,
                   t.name as tenant_name,
                   t.contact_email as contact_email
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t
                   ON trim(ph.tenant_id::text) = t.id::text
            WHERE ph.id = ?
              ${authWhere}
            LIMIT 1
            `,
            params
        );

        const p = rows?.[0];
        if (!p) return res.status(404).json({ error: 'Ödeme bulunamadı' });

        const to = p.contact_email;
        if (!to) return res.status(400).json({ error: 'Tenant e-posta adresi yok' });

        const dueStr = p.due_date ? String(p.due_date) : '—';
        const subject = `Abonelik yenileme - vade ${dueStr}`;
        const text = `Merhaba ${p.tenant_name || ''},\n\nAbonelik yenileme ödeme vadeniz: ${dueStr}.\nTutar: €${Number(p.amount || 0).toFixed(
            2
        )}\n\nÖdemeyi tamamladığınızda sistem otomatik güncelleyecektir.\n`;

        await queryPublic(
            `INSERT INTO \`public\`.billing_reminder_log (tenant_id, kind, message) VALUES (?, 'mail_sent', ?)`,
            [p.tenant_id, `Mail denemesi: payment#${p.id} due=${dueStr}`]
        );

        const mail = await trySendMail({ to, subject, text });
        return res.json({ ok: true, mailSent: mail.ok, reason: mail.reason || undefined });
    } catch (error) {
        console.error('sendPaymentDueMail error:', error);
        res.status(500).json({ error: 'Mail gönderilemedi' });
    }
};

// ═════════════════════════════════════════════
// Muhasebe detay: yaklaşan ödemeler, vadeli, bildirim log
// ═════════════════════════════════════════════

export const getAccountingUpcoming = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const params: any[] = [];
        const whereTenant = isReseller ? ' AND t.reseller_id = ?' : '';
        if (isReseller) params.push(userId);

        const [rows]: any = await queryPublic(
            `
            SELECT ph.*, t.name as tenant_name, t.contact_email,
                   tb.monthly_recurring_total as service_total,
                   tb.billing_cycle
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            LEFT JOIN \`public\`.tenant_billing tb ON trim(tb.tenant_id::text) = t.id::text
            WHERE ph.status IN ('pending','overdue')
              AND ph.due_date IS NOT NULL
              AND ph.due_date <= (CURRENT_DATE + INTERVAL '7 days')
              ${whereTenant}
            ORDER BY ph.due_date ASC
            LIMIT 100
            `,
            params
        );

        res.json(rows || []);
    } catch (error) {
        console.error('getAccountingUpcoming error:', error);
        res.status(500).json({ error: 'Yaklaşan ödemeler alınamadı' });
    }
};

export const getAccountingInstallments = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const statusFilter = req.query.status as string || '';
        const params: any[] = [];
        const whereTenant = isReseller ? ' AND t.reseller_id = ?' : '';
        if (isReseller) params.push(userId);

        let statusWhere = '';
        if (statusFilter === 'pending') statusWhere = " AND ph.status = 'pending'";
        else if (statusFilter === 'overdue') statusWhere = " AND ph.status = 'overdue'";
        else if (statusFilter === 'paid') statusWhere = " AND ph.status = 'paid'";

        const [rows]: any = await queryPublic(
            `
            SELECT ph.*, t.name as tenant_name
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            WHERE ph.due_date IS NOT NULL
              ${statusWhere}
              ${whereTenant}
            ORDER BY
                CASE WHEN ph.status IN ('pending','overdue') THEN 0 ELSE 1 END,
                ph.due_date ASC
            LIMIT 200
            `,
            params
        );

        res.json(rows || []);
    } catch (error) {
        console.error('getAccountingInstallments error:', error);
        res.status(500).json({ error: 'Vadeli ödemeler alınamadı' });
    }
};

export const getAccountingNotifications = async (req: Request, res: Response) => {
    try {
        const limitVal = Math.min(Number(req.query.limit) || 50, 200);
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const scope = isReseller ? ' AND t.reseller_id = ?' : '';
        const params: any[] = isReseller ? [userId, limitVal] : [limitVal];

        const [rows]: any = await queryPublic(
            `
            SELECT brl.*, t.name as tenant_name
            FROM \`public\`.billing_reminder_log brl
            LEFT JOIN \`public\`.tenants t ON trim(brl.tenant_id::text) = t.id::text
            WHERE 1=1 ${scope}
            ORDER BY brl.created_at DESC
            LIMIT ?
            `,
            params
        );

        res.json(rows || []);
    } catch (error) {
        console.error('getAccountingNotifications error:', error);
        res.status(500).json({ error: 'Bildirim logları alınamadı' });
    }
};

export const getAccountingAllPayments = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const { status, type, from, to, tenant, payment_method } = req.query;
        const params: any[] = [];
        /** Kiracıya bağlı satırlar + tenant_id NULL iken saas_admin_id bu bayiye ait cüzdan yüklemeleri */
        const whereTenant = isReseller
            ? ' AND (t.reseller_id = ? OR (ph.tenant_id IS NULL AND ph.saas_admin_id = ?))'
            : '';
        if (isReseller) params.push(userId, userId);

        let filters = '';
        if (status) { filters += ' AND ph.status = ?'; params.push(status); }
        if (type) { filters += ' AND ph.payment_type = ?'; params.push(type); }
        if (payment_method) { filters += ' AND ph.payment_method = ?'; params.push(payment_method); }
        if (from) { filters += ' AND ph.created_at >= ?'; params.push(from); }
        if (to) { filters += ' AND ph.created_at <= ?'; params.push(to); }
        if (tenant) {
            filters += ' AND (t.name ILIKE ? OR trim(ph.tenant_id::text) = trim(?))';
            params.push(`%${String(tenant)}%`, String(tenant));
        }

        const [rows]: any = await queryPublic(
            `
            SELECT ph.*, COALESCE(t.name, a.company_name, a.username) as tenant_name
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            LEFT JOIN \`public\`.saas_admins a ON ph.saas_admin_id = a.id
            WHERE 1=1 ${filters} ${whereTenant}
            ORDER BY ph.created_at DESC
            LIMIT 300
            `,
            params
        );

        const [summary]: any = await queryPublic(
            `
            SELECT
                COUNT(*)::int as total_count,
                COALESCE(SUM(CASE WHEN ph.status = 'paid' THEN ph.amount ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN ph.status = 'pending' THEN ph.amount ELSE 0 END), 0) as total_pending,
                COALESCE(SUM(CASE WHEN ph.status = 'overdue' THEN ph.amount ELSE 0 END), 0) as total_overdue,
                COUNT(CASE WHEN ph.status = 'paid' THEN 1 END)::int as paid_count,
                COUNT(CASE WHEN ph.status = 'pending' THEN 1 END)::int as pending_count,
                COUNT(CASE WHEN ph.status = 'overdue' THEN 1 END)::int as overdue_count
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            LEFT JOIN \`public\`.saas_admins a ON ph.saas_admin_id = a.id
            WHERE 1=1 ${filters} ${whereTenant}
            `,
            params
        );

        res.json({
            rows: rows || [],
            summary: summary?.[0] || {},
        });
    } catch (error) {
        console.error('getAccountingAllPayments error:', error);
        res.status(500).json({ error: 'Ödeme emirleri alınamadı' });
    }
};

export const getInvoices = async (req: Request, res: Response) => {
    try {
        await ensureInvoicesTable();
        await backfillInvoicesFromPayments();

        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const params: any[] = [];
        let where = ' WHERE 1=1';
        if (isReseller) { where += ' AND t.reseller_id = ?'; params.push(userId); }
        if (req.query.status) { where += ' AND inv.status = ?'; params.push(req.query.status); }
        if (req.query.tenant) { where += ' AND (t.name ILIKE ? OR inv.tenant_id::text = ?)'; params.push(`%${req.query.tenant}%`, req.query.tenant); }
        if (req.query.from) { where += ' AND inv.created_at >= ?'; params.push(req.query.from); }
        if (req.query.to) { where += ' AND inv.created_at <= ?::date + INTERVAL \'1 day\''; params.push(req.query.to); }

        const [rows]: any = await queryPublic(
            `
            SELECT inv.*, t.name as tenant_name
            FROM \`public\`.invoices inv
            LEFT JOIN \`public\`.tenants t ON trim(inv.tenant_id::text) = t.id::text
            ${where}
            ORDER BY inv.created_at DESC
            LIMIT 200
            `,
            params
        );

        res.json(rows || []);
    } catch (error) {
        console.error('getInvoices error:', error);
        res.status(500).json({ error: 'Fatura listesi alınamadı' });
    }
};

let _backfillDone = false;
async function backfillInvoicesFromPayments(): Promise<void> {
    if (_backfillDone) return;
    _backfillDone = true;
    try {
        const [paid]: any = await queryPublic(
            `SELECT ph.*, t.name as tenant_name
             FROM \`public\`.payment_history ph
             LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
             WHERE ph.status = 'paid'
               AND ph.invoice_number IS NOT NULL
               AND ph.invoice_number != ''
               AND NOT EXISTS (
                   SELECT 1 FROM \`public\`.invoices inv WHERE inv.invoice_number = ph.invoice_number
               )
             ORDER BY ph.created_at DESC
             LIMIT 500`
        );
        for (const p of (paid || [])) {
            try {
                await createInvoiceFromPayment(p, p.invoice_number);
            } catch {}
        }
    } catch (e) {
        console.warn('backfillInvoicesFromPayments:', e);
    }
}

async function assertResellerOwnsTenant(req: Request, tenantId: string | null | undefined): Promise<boolean> {
    if (req.user?.role !== 'reseller') return true;
    if (tenantId == null || String(tenantId).trim() === '') return false;
    const [chk]: any = await queryPublic(
        `SELECT 1 FROM \`public\`.tenants WHERE trim(id::text) = trim(?) AND reseller_id = ? LIMIT 1`,
        [tenantId, req.user.userId]
    );
    return Array.isArray(chk) && chk.length > 0;
}

export const getInvoiceByNumber = async (req: Request, res: Response) => {
    try {
        await ensureInvoicesTable();
        await ensureTenantBillingFields();
        const invNo = req.params.invoiceNumber;

        const [rows]: any = await queryPublic(
            `
            SELECT inv.*, t.name as tenant_name, t.contact_email,
                   t.tax_office, t.tax_number, t.authorized_person,
                   t.company_title, t.address as tenant_address, t.contact_phone
            FROM \`public\`.invoices inv
            LEFT JOIN \`public\`.tenants t ON trim(inv.tenant_id::text) = t.id::text
            WHERE inv.invoice_number = ?
            LIMIT 1
            `,
            [invNo]
        );

        if (!rows || rows.length === 0) {
            const [phRows]: any = await queryPublic(
                `SELECT ph.*, t.name as tenant_name, t.contact_email,
                        t.tax_office, t.tax_number, t.authorized_person,
                        t.company_title, t.address as tenant_address, t.contact_phone
                 FROM \`public\`.payment_history ph
                 LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
                 WHERE ph.invoice_number = ?
                 LIMIT 1`,
                [invNo]
            );
            const ph = phRows?.[0];
            if (!ph) return res.status(404).json({ error: 'Fatura bulunamadı' });
            if (!(await assertResellerOwnsTenant(req, ph.tenant_id != null ? String(ph.tenant_id) : null))) {
                return res.status(403).json({ error: 'Bu faturaya erişim yetkiniz yok' });
            }

            const amount = Number(ph.amount || 0);
            const taxRate = 19;
            const taxAmount = Math.round((amount * taxRate) / (100 + taxRate) * 100) / 100;
            const subtotal = Math.round((amount - taxAmount) * 100) / 100;

            return res.json({
                invoice_number: invNo,
                tenant_id: ph.tenant_id,
                tenant_name: ph.tenant_name,
                contact_email: ph.contact_email,
                contact_phone: ph.contact_phone,
                tax_office: ph.tax_office,
                tax_number: ph.tax_number,
                authorized_person: ph.authorized_person,
                company_title: ph.company_title,
                tenant_address: ph.tenant_address,
                items: [{ description: paymentTypeDescription(ph.payment_type), quantity: 1, unit_price: subtotal, total: subtotal }],
                subtotal,
                tax_rate: taxRate,
                tax_amount: taxAmount,
                total: amount,
                currency: ph.currency || 'EUR',
                status: ph.status,
                due_date: ph.due_date,
                paid_at: ph.paid_at,
                created_at: ph.created_at,
                notes: `${ph.tenant_name || ''} — ${paymentTypeDescription(ph.payment_type)}`,
            });
        }

        const inv = rows[0];
        if (!(await assertResellerOwnsTenant(req, inv.tenant_id != null ? String(inv.tenant_id) : null))) {
            return res.status(403).json({ error: 'Bu faturaya erişim yetkiniz yok' });
        }
        if (typeof inv.items === 'string') {
            try { inv.items = JSON.parse(inv.items); } catch {}
        }

        res.json(inv);
    } catch (error) {
        console.error('getInvoiceByNumber error:', error);
        res.status(500).json({ error: 'Fatura detayı alınamadı' });
    }
};

export const getFinancialSummary = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const resellerId = userId != null ? Number(userId) : null;

        /**
         * Bayi komisyon satırları: tenant_id üzerinden JOIN bazen PG tür uyumsuzluğunda 0 döner;
         * saas_admin_id = bayi veya tenant bu bayiye ait ise dahil et.
         */
        const resellerPaymentScope = `
            (
                ph.saas_admin_id = ?
                OR EXISTS (
                    SELECT 1 FROM \`public\`.tenants t
                    WHERE trim(ph.tenant_id::text) = trim(t.id::text)
                    AND t.reseller_id = ?
                )
            )
        `;
        const resellerScopeParams = resellerId != null ? [resellerId, resellerId] : [];

        // ─── Bayi: komisyon = payment_history.reseller_income (+ kapsam) ───
        if (isReseller && resellerId != null) {
            const [walletRows]: any = await queryPublic(
                `SELECT COALESCE(wallet_balance, 0) as wallet_balance FROM \`public\`.saas_admins WHERE id = ? LIMIT 1`,
                [resellerId]
            );
            const [totalEarnings]: any = await queryPublic(
                `SELECT COALESCE(SUM(ph.amount), 0) as total FROM \`public\`.payment_history ph
                 WHERE ph.status = 'paid' AND ph.payment_type = 'reseller_income' AND ${resellerPaymentScope}`,
                resellerScopeParams
            );

            const [pendingRevenue]: any = await queryPublic(
                `SELECT COALESCE(SUM(ph.amount), 0) as total FROM \`public\`.payment_history ph
                 WHERE ph.status = 'pending' AND ${resellerPaymentScope}`,
                resellerScopeParams
            );

            const [monthlyEarnings]: any = await queryPublic(
                `SELECT TO_CHAR(ph.created_at, 'YYYY-MM') as month,
                        SUM(ph.amount) as total
                 FROM \`public\`.payment_history ph
                 WHERE ph.status = 'paid' AND ph.payment_type = 'reseller_income' AND ${resellerPaymentScope}
                 GROUP BY TO_CHAR(ph.created_at, 'YYYY-MM')
                 ORDER BY month ASC`,
                resellerScopeParams
            );

            const [planDistribution]: any = await queryPublic(
                `SELECT subscription_plan as plan, COUNT(*)::int as count FROM \`public\`.tenants
                 WHERE reseller_id = ? GROUP BY subscription_plan`,
                [resellerId]
            );

            const [commBreak]: any = await queryPublic(
                `SELECT
                    COALESCE(SUM(CASE WHEN ph.description ILIKE '%(monthly)%' THEN ph.amount ELSE 0 END), 0) as monthly_cycle,
                    COALESCE(SUM(CASE WHEN ph.description ILIKE '%(yearly)%' THEN ph.amount ELSE 0 END), 0) as yearly_cycle,
                    COALESCE(SUM(CASE
                        WHEN ph.description ILIKE '%modül%' OR ph.description ILIKE '%modul%' OR ph.description ILIKE '%module%'
                        THEN ph.amount ELSE 0 END), 0) as with_modules,
                    COALESCE(SUM(CASE WHEN
                        ph.description ILIKE '%(setup)%' OR ph.description ILIKE '%kurulum%' OR ph.description ILIKE '%onboarding%'
                        OR ph.description ILIKE '%kurumsal%' OR ph.description ILIKE '%(license)%'
                        THEN ph.amount ELSE 0 END), 0) as setup_corporate
                 FROM \`public\`.payment_history ph
                 WHERE ph.status = 'paid' AND ph.payment_type = 'reseller_income' AND ${resellerPaymentScope}`,
                resellerScopeParams
            );

            const b = commBreak?.[0] || {};
            return res.json({
                totalEarnings: totalEarnings[0]?.total ?? 0,
                pendingRevenue: pendingRevenue[0]?.total ?? 0,
                walletBalance: Number(walletRows?.[0]?.wallet_balance ?? 0),
                monthlyEarnings,
                planDistribution,
                commissionBreakdown: {
                    /** Açıklamada (monthly) geçen doğrudan satış komisyonları (ödeme döngüsü) */
                    monthlyBillingCycle: Number(b.monthly_cycle ?? 0),
                    yearlyBillingCycle: Number(b.yearly_cycle ?? 0),
                    /** Açıklamada ek modül geçen satırların tutarı (kurulum+servis komisyonu tek satırda) */
                    salesWithAddonModules: Number(b.with_modules ?? 0),
                    /** Kurulum / lisans / kurumsal anahtar kelimeleri (açıklama metnine göre) */
                    setupAndCorporate: Number(b.setup_corporate ?? 0),
                },
                totalRevenue: 0,
                monthlyRevenue: [],
                breakdown: undefined,
                pendingBreakdown: undefined,
                paidByPaymentType: undefined,
                lastUpdate: new Date().toISOString(),
            });
        }

        const joinClause = '';
        const whereClause = ' WHERE 1=1 ';
        const params: any[] = [];

        // Toplam gelir (Kazançlar) — süper admin
        const [totalEarnings]: any = await queryPublic(
            `SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history ph ${joinClause} ${whereClause} AND ph.status = 'paid' AND ph.payment_type = 'reseller_income'`,
            params
        );

        const [pendingRevenue]: any = await queryPublic(
            `SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history ph ${joinClause} ${whereClause} AND ph.status = 'pending'`,
            params
        );

        const [monthlyEarnings]: any = await queryPublic(`
            SELECT TO_CHAR(ph.created_at, 'YYYY-MM') as month,
                   SUM(ph.amount) as total
            FROM \`public\`.payment_history ph
            ${joinClause}
            ${whereClause} AND ph.status = 'paid' AND ph.payment_type = 'reseller_income'
            GROUP BY TO_CHAR(ph.created_at, 'YYYY-MM')
            ORDER BY month ASC
        `, params);

        const [planDistribution]: any = await queryPublic(
            `SELECT subscription_plan as plan, COUNT(*)::int as count FROM \`public\`.tenants WHERE 1=1 GROUP BY subscription_plan`,
            []
        );

        // Süper admin: restoran ödemeleri (abonelik / lisans / kurulum / ek)
        let totalRevenue = 0;
        let monthlyRevenue: any[] = [];
        let nextMonthEstimatedRevenue: number | undefined;
        let breakdown: Record<string, number> | undefined;
        let pendingBreakdown: { tenant: number; resellerChannel: number; other: number } | undefined;
        let paidByPaymentType: { payment_type: string; total: number; count: number }[] | undefined;

        if (!isReseller) {
            const [tr]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type IN (
                    'subscription','license','setup','addon',
                    'reseller_package_onboarding','license_upgrade'
                )
            `);
            totalRevenue = Number(tr[0]?.total || 0);
            const [mr]: any = await queryPublic(`
                SELECT TO_CHAR(COALESCE(paid_at, created_at), 'YYYY-MM') as month,
                       SUM(amount) as total, COUNT(*)::int as count
                FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type IN (
                    'subscription','license','setup','addon',
                    'reseller_package_onboarding','license_upgrade'
                )
                GROUP BY TO_CHAR(COALESCE(paid_at, created_at), 'YYYY-MM')
                ORDER BY month ASC LIMIT 24
            `);
            monthlyRevenue = mr || [];

            const [last30]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type IN (
                    'subscription','license','setup','addon',
                    'reseller_package_onboarding','license_upgrade'
                )
                AND COALESCE(paid_at, created_at) >= (NOW() - INTERVAL '30 days')
            `);
            const last30Total = Number(last30?.[0]?.total || 0);
            const now = new Date();
            const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
            nextMonthEstimatedRevenue = Math.round(((last30Total / 30) * daysInNextMonth) * 100) / 100;

            const [rTenant]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history
                WHERE status = 'paid' AND tenant_id IS NOT NULL
                AND payment_type IN ('subscription','license','setup','addon')
            `);
            const [rReseller]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type IN ('reseller_package_onboarding','license_upgrade')
            `);
            const [rAddon]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type = 'addon' AND tenant_id IS NOT NULL
            `);
            const [rComm]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type = 'reseller_income'
            `);
            const [rWalletTopup]: any = await queryPublic(`
                SELECT COALESCE(SUM(amount), 0) as total FROM \`public\`.payment_history
                WHERE status = 'paid' AND payment_type = 'reseller_wallet_topup'
            `);

            breakdown = {
                restaurantTenantPaid: Number(rTenant[0]?.total || 0),
                resellerChannelPaid: Number(rReseller[0]?.total || 0),
                addonModulesPaid: Number(rAddon[0]?.total || 0),
                commissionPaidToResellers: Number(rComm[0]?.total || 0),
                resellerWalletTopupsPaid: Number(rWalletTopup[0]?.total || 0),
            };

            const [pb]: any = await queryPublic(`
                SELECT
                    COALESCE(SUM(CASE WHEN tenant_id IS NOT NULL THEN amount ELSE 0 END), 0) as tenant_p,
                    COALESCE(SUM(CASE WHEN tenant_id IS NULL AND payment_type IN ('reseller_package_onboarding','license_upgrade') THEN amount ELSE 0 END), 0) as reseller_p,
                    COALESCE(SUM(CASE WHEN tenant_id IS NULL AND payment_type NOT IN ('reseller_package_onboarding','license_upgrade') THEN amount ELSE 0 END), 0) as other_p
                FROM \`public\`.payment_history WHERE status = 'pending'
            `);
            pendingBreakdown = {
                tenant: Number(pb[0]?.tenant_p || 0),
                resellerChannel: Number(pb[0]?.reseller_p || 0),
                other: Number(pb[0]?.other_p || 0),
            };

            const [byPt]: any = await queryPublic(`
                SELECT payment_type, COALESCE(SUM(amount), 0) as total, COUNT(*)::int as count
                FROM \`public\`.payment_history
                WHERE status = 'paid'
                GROUP BY payment_type
                ORDER BY total DESC
            `);
            paidByPaymentType = (byPt || []).map((row: any) => ({
                payment_type: String(row.payment_type),
                total: Number(row.total || 0),
                count: Number(row.count || 0),
            }));
        }

        res.json({
            totalEarnings: totalEarnings[0]?.total || 0,
            pendingRevenue: pendingRevenue[0]?.total || 0,
            monthlyEarnings,
            planDistribution,
            totalRevenue,
            monthlyRevenue,
            nextMonthEstimatedRevenue,
            breakdown,
            pendingBreakdown,
            paidByPaymentType,
            lastUpdate: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Financial summary error:', error);
        res.status(500).json({ error: 'Finansal özet alınamadı' });
    }
};

/** Bayi: komisyon oranlarını değiştirdikten sonra tüm eski reseller_income kayıtlarını yeni oranlara göre yeniden hesaplar */
export const recalculateResellerCommissionsHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı erişebilir' });
        }
        const resellerId = Number(req.user.userId);

        // Güncel komisyon oranlarını al
        const [settingsRows]: any = await queryPublic(`SELECT reseller_setup_rate, reseller_monthly_rate FROM "public"."system_settings" LIMIT 1`);
        const settings = settingsRows?.[0] || {};
        const setupRate = Number(settings.reseller_setup_rate ?? 75) / 100;
        const monthlyRate = Number(settings.reseller_monthly_rate ?? 50) / 100;

        // Bu bayiye ait tüm tenant'ların billing bilgilerini al
        const [tenantBillings]: any = await queryPublic(
            `SELECT tb.tenant_id, t.name as tenant_name, tb.billing_cycle, tb.plan_code,
                    tb.setup_fee_total, tb.monthly_recurring_total, tb.yearly_prepay_total
             FROM "public"."tenant_billing" tb
             JOIN "public"."tenants" t ON trim(tb.tenant_id::text) = trim(t.id::text)
             WHERE t.reseller_id = $1`,
            [resellerId]
        );

        // tenant_billing'den plan koduna göre modulesSetup hesapla
        const [allModules]: any = await queryPublic(`SELECT code, setup_price, monthly_price FROM "public"."billing_modules" WHERE is_active = true`);

        let updatedCount = 0;
        let totalOldCommission = 0;
        let totalNewCommission = 0;

        for (const tb of (tenantBillings || [])) {
            // Bu tenant için mevcut toplam komisyonu al (eski)
            const [oldCommRows]: any = await queryPublic(
                `SELECT COALESCE(SUM(amount), 0) as total FROM "public"."payment_history"
                 WHERE trim(tenant_id::text) = trim($1::text) AND payment_type = 'reseller_income' AND status = 'paid'`,
                [tb.tenant_id]
            );
            const oldTotal = Number(oldCommRows?.[0]?.total || 0);
            totalOldCommission += oldTotal;

            // Mevcut modülleri al
            const [modRows]: any = await queryPublic(
                `SELECT tm.module_code, tm.quantity, bm.setup_price, bm.monthly_price
                 FROM "public"."tenant_modules" tm
                 JOIN "public"."billing_modules" bm ON tm.module_code = bm.code
                 WHERE trim(tm.tenant_id::text) = trim($1::text)`,
                [tb.tenant_id]
            );

            // modulesSetup ve modulesMonthly hesapla
            let modulesSetup = 0;
            let modulesMonthly = 0;
            for (const m of (modRows || [])) {
                modulesSetup += Number(m.setup_price || 0) * Number(m.quantity || 1);
                modulesMonthly += Number(m.monthly_price || 0) * Number(m.quantity || 1);
            }

            const planSetupFee = Number(tb.setup_fee_total || 0) - modulesSetup; // plan setup fee
            const setupTotal = planSetupFee + modulesSetup;
            const monthlyTotal = tb.billing_cycle === 'yearly'
                ? Number(tb.yearly_prepay_total || 0)
                : Number(tb.monthly_recurring_total || 0);

            const newCommission =
                setupTotal * setupRate +
                monthlyTotal * monthlyRate;

            totalNewCommission += newCommission;

            // Eski reseller_income kayıtlarını sil ve yeni tek kayıt ekle
            await queryPublic(
                `DELETE FROM "public"."payment_history" WHERE trim(tenant_id::text) = trim($1::text) AND payment_type = 'reseller_income'`,
                [tb.tenant_id]
            );
            if (newCommission > 0) {
                const invNo = `COMM-RECALC-${Date.now().toString(36).toUpperCase()}`;
                await queryPublic(
                    `INSERT INTO "public"."payment_history" (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at)
                     VALUES ($1, $2, $3, 'EUR', 'reseller_income', 'adjustment', 'paid', $4, $5, NOW())`,
                    [
                        tb.tenant_id,
                        resellerId,
                        Math.round(newCommission * 100) / 100,
                        `Komisyon düzeltmesi (${tb.billing_cycle}) — ${tb.tenant_name} [oransal güncelleme]`,
                        invNo,
                    ]
                );
            }
            updatedCount++;
        }

        res.json({
            ok: true,
            updatedTenants: updatedCount,
            oldTotalCommission: Math.round(totalOldCommission * 100) / 100,
            newTotalCommission: Math.round(totalNewCommission * 100) / 100,
            diff: Math.round((totalNewCommission - totalOldCommission) * 100) / 100,
            rates: { setupRate: Math.round(setupRate * 100), monthlyRate: Math.round(monthlyRate * 100) },
        });
    } catch (error) {
        console.error('❌ recalculateResellerCommissions error:', error);
        res.status(500).json({ error: 'Komisyon yeniden hesaplanamadı' });
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
        const { action, entity_type, from, to, limit: lim, endpoint, actor, tenant_id, risk_level, method, status_code } = req.query;
        let query = `
            SELECT
                al.*,
                CASE
                    WHEN al.action LIKE 'api_request:%' AND COALESCE((al.new_value::jsonb ->> 'status_code')::int, 0) >= 500 THEN 'high'
                    WHEN al.action LIKE 'api_request:%' AND COALESCE((al.new_value::jsonb ->> 'status_code')::int, 0) >= 400 THEN 'medium'
                    WHEN al.action LIKE 'api_request:DELETE' THEN 'high'
                    WHEN al.action LIKE 'api_request:PATCH' THEN 'medium'
                    WHEN al.action LIKE '%delete%' THEN 'high'
                    WHEN al.action LIKE '%revoke%' OR al.action LIKE '%security%' OR al.action LIKE '%2fa%' THEN 'medium'
                    ELSE 'low'
                END as risk_level
            FROM \`public\`.audit_logs al
            WHERE 1=1
        `;
        const params: any[] = [];

        if (action) { query += ' AND action = ?'; params.push(action); }
        if (entity_type) { query += ' AND entity_type = ?'; params.push(entity_type); }
        if (from) { query += " AND al.created_at >= (?::date)"; params.push(from); }
        if (to) { query += " AND al.created_at < ((?::date) + INTERVAL '1 day')"; params.push(to); }
        if (endpoint) { query += ` AND (al.entity_id ILIKE ? OR (al.new_value::jsonb ->> 'path') ILIKE ?)`; params.push(`%${String(endpoint)}%`, `%${String(endpoint)}%`); }
        if (actor) { query += ' AND al.user_id ILIKE ?'; params.push(`%${String(actor)}%`); }
        if (tenant_id) { query += ` AND (al.new_value::jsonb ->> 'tenant_id') = ?`; params.push(String(tenant_id)); }
        if (method) { query += ` AND (al.new_value::jsonb ->> 'method') = ?`; params.push(String(method).toUpperCase()); }
        if (status_code) { query += ` AND COALESCE((al.new_value::jsonb ->> 'status_code')::int, 0) = ?`; params.push(Number(status_code)); }
        if (risk_level) {
            query += ` AND (
                CASE
                    WHEN al.action LIKE 'api_request:%' AND COALESCE((al.new_value::jsonb ->> 'status_code')::int, 0) >= 500 THEN 'high'
                    WHEN al.action LIKE 'api_request:%' AND COALESCE((al.new_value::jsonb ->> 'status_code')::int, 0) >= 400 THEN 'medium'
                    WHEN al.action LIKE 'api_request:DELETE' THEN 'high'
                    WHEN al.action LIKE 'api_request:PATCH' THEN 'medium'
                    WHEN al.action LIKE '%delete%' THEN 'high'
                    WHEN al.action LIKE '%revoke%' OR al.action LIKE '%security%' OR al.action LIKE '%2fa%' THEN 'medium'
                    ELSE 'low'
                END
            ) = ?`;
            params.push(String(risk_level).toLowerCase());
        }

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
            `SELECT COUNT(*)::int as count FROM \`public\`.login_attempts WHERE success = false AND created_at >= NOW() - INTERVAL '24 hours'`
        );
        const [successLogins24h]: any = await queryPublic(
            `SELECT COUNT(*)::int as count FROM \`public\`.login_attempts WHERE success = true AND created_at >= NOW() - INTERVAL '24 hours'`
        );
        const [totalAuditLogs]: any = await queryPublic(
            `SELECT COUNT(*)::int as count FROM \`public\`.audit_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`
        );
        const [activeApiKeys]: any = await queryPublic(
            `SELECT COUNT(*)::int as count FROM \`public\`.api_keys WHERE is_active = true`
        );
        const [recentActivity]: any = await queryPublic(
            `SELECT action, COUNT(*)::int as count FROM \`public\`.audit_logs WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY action ORDER BY count DESC LIMIT 10`
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

export const getGrowthReport = async (req: Request, res: Response) => {
    const isReseller = req.user?.role === 'reseller';
    const userId = req.user?.userId;
    const resellerId = userId != null ? Number(userId) : null;

    let monthlyGrowth: any[] = [];
    let churnedCount = 0;
    let totalTenantCount = 0;
    let topTenants: any[] = [];
    let revenueForecast = 0;
    let churnRiskCount = 0;
    let planRevenueDist: any[] = [];

    const scopeFilter = isReseller ? ' AND t.reseller_id = ?' : '';
    const phScopeFilter = isReseller ? ' AND (ph.saas_admin_id = ? OR t.reseller_id = ?)' : '';
    const params = isReseller ? [resellerId] : [];
    const phParams = isReseller ? [resellerId, resellerId] : [];

    try {
        const [rows]: any = await queryPublic(`
            SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*)::int as new_tenants
            FROM \`public\`.tenants t
            WHERE t.created_at >= NOW() - INTERVAL '12 months' ${scopeFilter}
            GROUP BY TO_CHAR(created_at, 'YYYY-MM')
            ORDER BY month ASC
        `, params);
        monthlyGrowth = rows || [];
    } catch (e) { console.warn('getGrowthReport monthlyGrowth:', e); }

    try {
        const [churned]: any = await queryPublic(
            `SELECT COUNT(*)::int as count FROM \`public\`.tenants t WHERE t.status IN ('suspended', 'inactive') ${scopeFilter}`,
            params
        );
        churnedCount = churned[0]?.count ?? 0;
    } catch (e) { console.warn('getGrowthReport churned:', e); }

    try {
        const [tot]: any = await queryPublic(`SELECT COUNT(*)::int as count FROM \`public\`.tenants t WHERE 1=1 ${scopeFilter}`, params);
        totalTenantCount = tot[0]?.count ?? 0;
    } catch (e) { console.warn('getGrowthReport totalTenants:', e); }

    // ─── AI INSIGHT: CHURN RISK (Licansı bitmek üzere olanlar) ───
    try {
        const [risk]: any = await queryPublic(
            `SELECT COUNT(*)::int as count FROM \`public\`.tenants t 
             WHERE t.status = 'active' 
               AND t.license_expires_at <= (NOW() + INTERVAL '7 days')
               ${scopeFilter}`,
            params
        );
        churnRiskCount = risk[0]?.count ?? 0;
    } catch {}

    // ─── REVENUE FORECAST (Gelecek ay beklenen tahsilat) ───
    try {
        const [forecast]: any = await queryPublic(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            WHERE ph.status = 'pending' 
              AND ph.due_date BETWEEN NOW() AND (NOW() + INTERVAL '30 days')
              ${phScopeFilter}
        `, phParams);
        revenueForecast = Number(forecast[0]?.total || 0);
    } catch {}

    // ─── PLAN REVENUE DISTRIBUTION ───
    try {
        const [prefRows]: any = await queryPublic(`
            SELECT t.subscription_plan as plan, SUM(ph.amount) as revenue
            FROM \`public\`.payment_history ph
            JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            WHERE ph.status = 'paid' ${phScopeFilter}
            GROUP BY t.subscription_plan
        `, phParams);
        planRevenueDist = prefRows || [];
    } catch {}

    try {
        const [top]: any = await queryPublic(`
            SELECT t.id, t.name, t.subscription_plan, t.status, t.created_at,
                   t.license_expires_at,
                   COALESCE((SELECT SUM(ph.amount) FROM \`public\`.payment_history ph WHERE ph.tenant_id = t.id AND ph.status = 'paid'), 0) as total_paid
            FROM \`public\`.tenants t
            WHERE t.status = 'active' ${scopeFilter}
            ORDER BY total_paid DESC
            LIMIT 10
        `, params);
        topTenants = top || [];
    } catch (e) {
        try {
            const [top]: any = await queryPublic(`
                SELECT t.id, t.name, t.subscription_plan, t.status, t.created_at, t.license_expires_at, 0 as total_paid
                FROM \`public\`.tenants t
                WHERE t.status = 'active' ${scopeFilter}
                ORDER BY t.created_at DESC
                LIMIT 10
            `, params);
            topTenants = top || [];
        } catch {}
    }

    const churnRate = totalTenantCount > 0 ? ((churnedCount / totalTenantCount) * 100).toFixed(1) : '0';

    res.json({
        monthlyGrowth,
        churnRate,
        churnedCount,
        totalTenants: totalTenantCount,
        topTenants,
        planDistribution: planRevenueDist, // Use revenue scale for distribution
        revenueForecast,
        churnRiskCount,
        aiInsights: {
            forecastMessage: revenueForecast > 0 ? `Next 30 days projection: +€${revenueForecast.toLocaleString()}` : 'Stable pipeline',
            riskLevel: churnRiskCount > (totalTenantCount * 0.1) ? 'critical' : (churnRiskCount > 0 ? 'warning' : 'healthy')
        }
    });
};

// ═══════════════════════════════════════════════════════════════
// 4. ABONELİK & PLAN YÖNETİMİ
// ═══════════════════════════════════════════════════════════════

export const getSubscriptionPlans = async (_req: Request, res: Response) => {
    try {
        await ensureDeviceResetQuotaSchema();
        const [rows] = await queryPublic('SELECT * FROM `public`.subscription_plans ORDER BY sort_order ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Planlar alınamadı' });
    }
};

export const updateSubscriptionPlan = async (req: Request, res: Response) => {
    try {
        await ensureDeviceResetQuotaSchema();
        const { id } = req.params;
        const {
            name,
            monthly_fee,
            setup_fee,
            max_users,
            max_branches,
            max_products,
            max_devices,
            max_printers,
            device_reset_quota_monthly,
            support_hours,
            features,
            trial_days,
            is_active,
        } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (monthly_fee !== undefined) { updates.push('monthly_fee = ?'); values.push(monthly_fee); }
        if (setup_fee !== undefined) { updates.push('setup_fee = ?'); values.push(setup_fee); }
        if (max_users !== undefined) { updates.push('max_users = ?'); values.push(max_users); }
        if (max_branches !== undefined) { updates.push('max_branches = ?'); values.push(max_branches); }
        if (max_products !== undefined) { updates.push('max_products = ?'); values.push(max_products); }
        if (max_devices !== undefined) { updates.push('max_devices = ?'); values.push(max_devices); }
        if (max_printers !== undefined) { updates.push('max_printers = ?'); values.push(max_printers); }
        if (device_reset_quota_monthly !== undefined) { updates.push('device_reset_quota_monthly = ?'); values.push(device_reset_quota_monthly); }
        if (support_hours !== undefined) { updates.push('support_hours = ?'); values.push(support_hours); }
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
        await ensureDeviceResetQuotaSchema();
        const {
            name,
            code,
            monthly_fee,
            setup_fee,
            max_users,
            max_branches,
            max_products,
            max_devices,
            max_printers,
            device_reset_quota_monthly,
            support_hours,
            features,
            trial_days,
            sort_order,
        } = req.body;

        const [result]: any = await queryPublic(
            `
            INSERT INTO \`public\`.subscription_plans (
                name, code, monthly_fee, setup_fee,
                max_users, max_branches, max_products, max_devices, max_printers, device_reset_quota_monthly, support_hours,
                features, trial_days, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            [
                name,
                code || name.toLowerCase().replace(/\s+/g, '_'),
                monthly_fee || 0,
                setup_fee || 0,
                max_users || 10,
                max_branches || 1,
                max_products || 500,
                max_devices ?? 3,
                max_printers ?? 2,
                device_reset_quota_monthly ?? 3,
                support_hours || '08:00-17:00',
                JSON.stringify(features || {}),
                trial_days || 14,
                sort_order || 0,
            ]
        );

        await logAudit(req, 'create_plan', 'subscription_plan', result.insertId, null, req.body);
        res.status(201).json({ message: 'Yeni plan oluşturuldu', id: result.insertId });
    } catch (error: any) {
        if (error.code === '23505' || error.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'Bu plan kodu bir başkası tarafından kullanılıyor' });
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
        if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Bu kod zaten mevcut' });
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
            FROM "public".customer_notes cn
            LEFT JOIN "public".tenants t ON cn.tenant_id = t.id::varchar
            WHERE 1=1
        `;
        const params: any[] = [];

        if (req.user?.role === 'reseller') {
            query += ' AND t.reseller_id = $1';
            params.push(req.user.userId);
        }

        if (tenant_id) {
            query += ' AND cn.tenant_id = $' + (params.length + 1);
            params.push(tenant_id);
        }

        query += ' ORDER BY cn.created_at DESC LIMIT 100';
        const [rows] = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[ERROR] getCustomerNotes:', error);
        res.status(500).json({ error: 'Müşteri notları alınamadı', detail: (error as Error).message });
    }
};

export const createCustomerNote = async (req: Request, res: Response) => {
    try {
        const { tenant_id, note_type, subject, content } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM "public".tenants WHERE id = $1::uuid AND reseller_id = $2', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran için not ekleme yetkiniz yok' });
        }

        const [result]: any = await queryPublic(`
            INSERT INTO "public".customer_notes (tenant_id, note_type, subject, content, created_by)
            VALUES ($1, $2, $3, $4, $5)
        `, [tenant_id, note_type || 'internal', subject, content, req.user?.userId || 'admin']);

        res.status(201).json({ message: 'Not eklendi', id: result.insertId });
    } catch (error) {
        console.error('[ERROR] createCustomerNote:', error);
        res.status(500).json({ error: 'Not eklenemedi' });
    }
};

export const getContracts = async (req: Request, res: Response) => {
    try {
        const { tenant_id } = req.query;
        let query = `
            SELECT c.*, t.name as tenant_name
            FROM "public".contracts c
            LEFT JOIN "public".tenants t ON c.tenant_id = t.id::varchar
            WHERE 1=1
        `;
        const params: any[] = [];

        if (req.user?.role === 'reseller') {
            query += ' AND t.reseller_id = $1';
            params.push(req.user.userId);
        }

        if (tenant_id) {
            query += ' AND c.tenant_id = $' + (params.length + 1);
            params.push(tenant_id);
        }
        query += ' ORDER BY c.created_at DESC';

        const [rows] = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[ERROR] getContracts:', error);
        res.status(500).json({ error: 'Sözleşmeler alınamadı', detail: (error as Error).message });
    }
};

export const createContract = async (req: Request, res: Response) => {
    try {
        const { tenant_id, start_date, end_date, monthly_amount, notes } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM "public".tenants WHERE id = $1::uuid AND reseller_id = $2', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran için sözleşme oluşturma yetkiniz yok' });
        }

        const contractNumber = `CTR-${Date.now().toString(36).toUpperCase()}`;

        const [result]: any = await queryPublic(`
            INSERT INTO "public".contracts (tenant_id, contract_number, start_date, end_date, monthly_amount, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [tenant_id, contractNumber, start_date, end_date || null, monthly_amount || 0, notes || '']);

        res.status(201).json({ message: 'Sözleşme oluşturuldu', id: result.insertId, contract_number: contractNumber });
    } catch (error) {
        console.error('[ERROR] createContract:', error);
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

        // Toplam veri boyutu (PostgreSQL)
        const [dbSize]: any = await queryPublic(`
            SELECT 
                current_database() as db_name,
                ROUND((pg_database_size(current_database()))::numeric / 1024 / 1024, 2) as size_mb
        `);

        const [connections]: any = await queryPublic(`
            SELECT numbackends::text AS "Value" FROM pg_stat_database WHERE datname = current_database()
        `);

        const [uptime]: any = await queryPublic(`
            SELECT extract(epoch from (now() - pg_postmaster_start_time()))::bigint::text AS "Value"
        `);

        let recentMetrics: any[] = [];
        try {
            const [rows]: any = await queryPublic(`
                SELECT * FROM "public"."system_metrics" ORDER BY recorded_at DESC LIMIT 20
            `);
            recentMetrics = rows ?? [];
        } catch {
            /* tablo yoksa boş */
        }

        // Sistem metriği kaydet
        try {
            await queryPublic(
                `INSERT INTO \`public\`.system_metrics (metric_type, metric_value, unit, metadata) VALUES (?, ?, 'ms', ?::jsonb)`,
                ['db_latency', dbLatency, JSON.stringify({ timestamp: new Date().toISOString() })]
            );
        } catch {
            /* system_metrics yoksa atla */
        }

        res.json({
            status: 'healthy',
            dbLatency: `${dbLatency}ms`,
            dbSizes: dbSize,
            activeConnections: Number(connections[0]?.Value ?? connections[0]?.value ?? 0),
            uptimeSeconds: Number(uptime[0]?.Value ?? uptime[0]?.value ?? 0),
            uptimeFormatted: formatUptime(parseInt(String(uptime[0]?.Value ?? uptime[0]?.value ?? '0'), 10)),
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
        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(
                `
                SELECT st.id FROM \`public\`.support_tickets st
                LEFT JOIN \`public\`.tenants ten ON trim(st.tenant_id::text) = trim(ten.id::text)
                WHERE st.id = ? AND (ten.reseller_id = ? OR st.created_by_reseller_id = ?)
                LIMIT 1
                `,
                [ticketId, req.user.userId, req.user.userId]
            );
            if (!check?.length) return res.status(403).json({ error: 'Bu mesajları görme yetkiniz yok' });
        }
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
        await migrateBillingTables();
        const { ticketId } = req.params;
        const { message, sender_type, sender_name } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(
                `
                SELECT st.id FROM \`public\`.support_tickets st
                LEFT JOIN \`public\`.tenants ten ON trim(st.tenant_id::text) = trim(ten.id::text)
                WHERE st.id = ? AND (ten.reseller_id = ? OR st.created_by_reseller_id = ?)
                LIMIT 1
                `,
                [ticketId, req.user.userId, req.user.userId]
            );
            if (!check?.length) return res.status(403).json({ error: 'Bu talebe yanıt verme yetkiniz yok' });
        }

        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.ticket_messages (ticket_id, sender_type, sender_name, message)
            VALUES (?, ?, ?, ?)
        `, [ticketId, sender_type || 'admin', sender_name || 'Admin', message]);

        await queryPublic(
            `
            UPDATE \`public\`.support_tickets
            SET first_response_at = COALESCE(first_response_at, NOW()),
                status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
                updated_at = NOW()
            WHERE id = ?
        `,
            [ticketId],
        );

        res.status(201).json({ message: 'Mesaj gönderildi', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Mesaj gönderilemedi' });
    }
};

export const getTicketDetail = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(
                `
                SELECT st.id FROM \`public\`.support_tickets st
                LEFT JOIN \`public\`.tenants ten ON trim(st.tenant_id::text) = trim(ten.id::text)
                WHERE st.id = ? AND (ten.reseller_id = ? OR st.created_by_reseller_id = ?)
                LIMIT 1
                `,
                [id, req.user.userId, req.user.userId]
            );
            if (!check?.length) return res.status(403).json({ error: 'Bu bilet detayını görme yetkiniz yok' });
        }

        const [ticket]: any = await queryPublic(`
            SELECT st.*, t.name as tenant_name 
            FROM \`public\`.support_tickets st
            LEFT JOIN \`public\`.tenants t ON trim(st.tenant_id::text) = trim(t.id::text)
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

        const joinClause = isReseller
            ? ' LEFT JOIN `public`.tenants t ON trim(st.tenant_id::text) = trim(t.id::text) '
            : '';
        const whereClause = isReseller ? ' AND (t.reseller_id = ? OR st.created_by_reseller_id = ?) ' : '';
        const params = isReseller ? [userId, userId] : [];

        const [open]: any = await queryPublic(`SELECT COUNT(*)::int as c FROM \`public\`.support_tickets st ${joinClause} WHERE st.status = 'open' ${whereClause}`, params);
        const [inProgress]: any = await queryPublic(`SELECT COUNT(*)::int as c FROM \`public\`.support_tickets st ${joinClause} WHERE st.status = 'in_progress' ${whereClause}`, params);
        const [closed]: any = await queryPublic(`SELECT COUNT(*)::int as c FROM \`public\`.support_tickets st ${joinClause} WHERE st.status = 'closed' ${whereClause}`, params);

        /* Şemada first_response_at yok; güncelleme süresi ile yaklaşık yanıt süresi */
        const [avgResponse]: any = await queryPublic(
            `
            SELECT AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0) as avg_minutes
            FROM \`public\`.support_tickets st
            ${joinClause}
            WHERE st.updated_at > st.created_at ${whereClause}
        `,
            params,
        );

        res.json({
            open: open[0]?.c || 0,
            inProgress: inProgress[0]?.c || 0,
            closed: closed[0]?.c || 0,
            avgResponseMinutes: Math.round(avgResponse[0]?.avg_minutes || 0)
        });
    } catch (error) {
        console.error('❌ Support stats error:', error);
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
        const [result]: any = await queryPublic(
            `
            INSERT INTO \`public\`.system_backups (filename, size, status, created_by, tenant_id, backup_type)
            VALUES (?, ?, 'completed', ?, ?::uuid, 'tenant')
        `,
            [
                filename,
                Math.floor(Math.random() * 50000000) + 1000000,
                req.user?.username || 'admin',
                tenant_id,
            ],
        );

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

        const joinClause = isReseller ? ' JOIN `public`.tenants t ON sb.tenant_id = t.id ' : '';
        const whereClause = isReseller ? ' WHERE t.reseller_id = ? ' : '';
        const params = isReseller ? [userId] : [];

        const [total]: any = await queryPublic(
            `SELECT COUNT(*)::int as count, COALESCE(SUM(sb.size), 0)::bigint as total_size
             FROM \`public\`.system_backups sb ${joinClause} ${whereClause}`,
            params,
        );
        const [byType]: any = await queryPublic(
            `SELECT COALESCE(sb.backup_type, sb.status) AS backup_type, COUNT(*)::int as count
             FROM \`public\`.system_backups sb ${joinClause} ${whereClause}
             GROUP BY COALESCE(sb.backup_type, sb.status)`,
            params,
        );
        const [recent]: any = await queryPublic(
            `SELECT sb.* FROM \`public\`.system_backups sb ${joinClause} ${whereClause}
             ORDER BY sb.created_at DESC LIMIT 10`,
            params,
        );

        res.json({
            totalBackups: total[0]?.count || 0,
            totalSizeMB: (Number(total[0]?.total_size || 0) / 1024 / 1024).toFixed(2),
            byType,
            recentBackups: recent,
        });
    } catch (error) {
        console.error('❌ Backup stats error:', error);
        res.status(500).json({ error: 'Yedek istatistikleri alınamadı' });
    }
};
