// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NextPOS â€” SaaS Advanced Controller
// Finans, GÃ¼venlik, Raporlama, CRM, Monitoring, GeliÅŸmiÅŸ Destek
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import { Request, Response } from 'express';
import { invalidateTenantCache, queryPublic } from '../lib/db.js';
import { trySendMail } from '../lib/email.js';
import {
    migrateBillingTables,
    advanceBillingAfterPayment,
    aggregateResellerIncomeBreakdownAsync,
    formatResellerCommissionDescription,
    getResellerCommissionSplitForTenant,
    type ResellerCommissionSplit,
} from '../services/billing.service.js';
import { cancelResellerPlanPurchase } from '../services/reseller-plan-card-purchase.service.js';
import { depositTenantWallet } from '../services/billing.service.js';
import { ensureDeviceResetQuotaSchema } from '../services/device-reset-quota.service.js';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 1. FÄ°NANS & GELÄ°R MERKEZÄ°
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        console.error('âŒ Payment history error:', error);
        res.status(500).json({ error: 'Ã–deme geÃ§miÅŸi alÄ±namadÄ±' });
    }
};

export const createPayment = async (req: Request, res: Response) => {
    try {
        const { tenant_id, amount, currency, payment_type, payment_method, description, due_date, due_days, due_weeks, status } =
            req.body;

        // EÄŸer due_date direkt gÃ¶nderilmediyse (3 gÃ¼n / 1 hafta gibi) due_* ile hesaplayalÄ±m.
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
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran iÃ§in Ã¶deme oluÅŸturma yetkiniz yok' });
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

        res.status(201).json({ message: 'Ã–deme kaydÄ± oluÅŸturuldu', id: result.insertId, invoice_number: invoiceNumber });
    } catch (error) {
        console.error('âŒ Create payment error:', error);
        res.status(500).json({ error: 'Ã–deme kaydÄ± oluÅŸturulamadÄ±' });
    }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, amount, paymentMethod, description } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic(`
                SELECT ph.id FROM \`public\`.payment_history ph 
                JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
                WHERE ph.id = ? AND t.reseller_id = ?
            `, [id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu Ã¶demeyi gÃ¼ncelleme yetkiniz yok' });
        }

        let invoiceNumber: string | null = null;

        if (status === 'paid') {
            const [preRows]: any = await queryPublic(
                `SELECT id, tenant_id::text as tenant_id, amount, payment_type, payment_method, description, status
                 FROM \`public\`.payment_history WHERE id = ?`,
                [id]
            );
            const pre = preRows?.[0];
            if (
                pre?.payment_type === 'wallet_deposit' &&
                pre?.tenant_id &&
                String(pre.status || '').toLowerCase() !== 'paid'
            ) {
                await depositTenantWallet(
                    String(pre.tenant_id),
                    Number(pre.amount),
                    String(pre.payment_method || 'bank_transfer'),
                    String(pre.description || 'Cüzdan bakiye yükleme'),
                    undefined,
                    Number(id)
                );
                await logAudit(req, 'update_payment_status', 'payment', id, null, {
                    status: 'paid',
                    walletDeposit: true,
                });
                return res.json({
                    message: 'Ödeme onaylandı ve restoran cüzdan bakiyesine yüklendi.',
                });
            }

            const [existing]: any = await queryPublic(
                `SELECT invoice_number FROM \`public\`.payment_history WHERE id = ?`,
                [id]
            );
            invoiceNumber = existing?.[0]?.invoice_number || null;
            if (!invoiceNumber) {
                invoiceNumber = generateInvoiceNumber();
            }

            const updates: string[] = [
                "status = 'paid'",
                "paid_at = NOW()",
                "invoice_number = COALESCE(invoice_number, ?)"
            ];
            const params: any[] = [invoiceNumber];

            if (amount !== undefined && amount !== null) {
                updates.push("amount = ?");
                params.push(amount);
            }
            if (paymentMethod !== undefined && paymentMethod !== null) {
                updates.push("payment_method = ?");
                params.push(paymentMethod);
            }
            if (description !== undefined && description !== null) {
                updates.push("description = ?");
                params.push(description);
            }
            params.push(id);

            await queryPublic(
                `UPDATE \`public\`.payment_history SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        } else {
            if (String(status).toLowerCase() === 'cancelled') {
                const [phRow]: any = await queryPublic(
                    `SELECT id, saas_admin_id, payment_type, status FROM \`public\`.payment_history WHERE id = ?`,
                    [id]
                );
                const p = phRow?.[0];
                if (p?.payment_type === 'license_upgrade' && p?.saas_admin_id != null) {
                    const cancelResult = await cancelResellerPlanPurchase(
                        Number(p.saas_admin_id),
                        Number(id)
                    );
                    if (cancelResult.ok) {
                        await logAudit(req, 'update_payment_status', 'payment', id, null, {
                            status: 'cancelled',
                            reverted: cancelResult.reverted,
                        });
                        return res.json({
                            message: cancelResult.message,
                            reverted: cancelResult.reverted,
                        });
                    }
                }
            }
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
                        `SELECT id, reseller_id, settings, name FROM \`public\`.tenants WHERE trim(id::text) = trim(?)`,
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
                    
                    if (pending && rc > 0) {
                        let targetAdminId = trow?.reseller_id != null ? Number(trow.reseller_id) : null;
                        let targetAdminRole: 'reseller' | 'super_admin' = 'reseller';

                        if (targetAdminId == null) {
                            // Bayi yoksa, SaaS Admin (super_admin) cüzdanına yatsın
                            const [adminRows]: any = await queryPublic(`SELECT id FROM \`public\`.saas_admins WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1`);
                            if (adminRows?.[0]) {
                                targetAdminId = Number(adminRows[0].id);
                            } else {
                                targetAdminId = 1;
                            }
                            targetAdminRole = 'super_admin';
                        }

                        let split: ResellerCommissionSplit | null = null;
                        const rawBr = settings.reseller_commission_breakdown;
                        if (rawBr && typeof rawBr === 'object') {
                            const o = rawBr as Record<string, unknown>;
                            const sc = Number(o.setupCorporate ?? o.setup_corporate);
                            const am = Number(o.addonModules ?? o.addon_modules);
                            const rec = Number(o.recurring);
                            const bc = o.billingCycle === 'yearly' || o.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
                            if (Number.isFinite(sc) && Number.isFinite(am) && Number.isFinite(rec)) {
                                split = { setupCorporate: sc, addonModules: am, recurring: rec, billingCycle: bc };
                            }
                        }
                        if (!split) {
                            split = await getResellerCommissionSplitForTenant(tenantId);
                        }
                        let commDesc: string;
                        if (split) {
                            commDesc = formatResellerCommissionDescription(String(p.tenant_name || trow?.name || '').trim(), split, targetAdminRole === 'reseller' ? '· Havale onayı' : '· Havale onayı (SaaS Admin)');
                        } else {
                            const [tbrows]: any = await queryPublic(
                                `SELECT billing_cycle FROM \`public\`.tenant_billing WHERE trim(tenant_id::text) = trim(?) LIMIT 1`,
                                [tenantId]
                            );
                            const cycle = tbrows?.[0]?.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
                            commDesc = targetAdminRole === 'reseller'
                                ? `Komisyon (${cycle}) — Havale onayı · ${String(p.tenant_name || trow?.name || '').trim()}`
                                : `SaaS Komisyonu (${cycle}) — Havale onayı · ${String(p.tenant_name || trow?.name || '').trim()} (Bayi Olmadığı İçin)`;
                        }

                        // BUG-3 FIX: Locale-bağımsız duplikat kontrolü (ILIKE Türkçe karakter sorunu)
                        const [dup]: any = await queryPublic(
                            `SELECT id FROM \`public\`.payment_history
                             WHERE trim(tenant_id::text) = trim(?)
                               AND payment_type = 'reseller_income'
                               AND payment_method = 'bank_transfer'
                               AND saas_admin_id = ?
                               AND status = 'paid'
                             LIMIT 1`,
                            [tenantId, targetAdminId]
                        );
                        if (!dup?.length) {
                            // 1. Cüzdanı güncelle
                            await queryPublic(
                                `UPDATE \`public\`.saas_admins SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?`,
                                [rc, targetAdminId]
                            );

                            // 2. Ödeme geçmişi kaydı
                            await queryPublic(
                                `INSERT INTO \`public\`.payment_history (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at)
                                 VALUES (?, ?, ?, 'EUR', 'reseller_income', 'bank_transfer', 'paid', ?, NOW())`,
                                [tenantId, targetAdminId, rc, commDesc]
                            );
                        }
                        await queryPublic(
                            `UPDATE \`public\`.tenants SET settings = (COALESCE(settings::jsonb, '{}'::jsonb) - 'pending_bank_transfer' - 'reseller_commission_amount' - 'reseller_commission_breakdown' - 'first_invoice_total')
                             WHERE trim(id::text) = trim(?)`,
                            [tenantId]
                        );
                        invalidateTenantCache(tenantId);
                    }
                }

                /** Aylık/yıllık birleşik abonelik satırı ödendiğinde sonraki vadeyi ilerlet (paket + modül aylıkları tek tutar) */
                if (tenantId && p.payment_type === 'subscription' && p.due_date) {
                    try {
                        const [tbRows]: any = await queryPublic(
                            `SELECT billing_cycle, next_payment_due::text as npd FROM \`public\`.tenant_billing WHERE trim(tenant_id::text) = trim(?) LIMIT 1`,
                            [tenantId]
                        );
                        const tb0 = tbRows?.[0];
                        const npd = tb0?.npd ? String(tb0.npd).slice(0, 10) : '';
                        const dd = String(p.due_date).slice(0, 10);
                        if (tb0 && npd === dd) {
                            const cycle = tb0.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
                            await advanceBillingAfterPayment(tenantId, cycle);
                        }
                    } catch (advErr) {
                        console.warn('advanceBillingAfterPayment (updatePaymentStatus):', advErr);
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

        res.json({ message: 'Ã–deme durumu gÃ¼ncellendi', invoice_number: invoiceNumber });
    } catch (error) {
        console.error('updatePaymentStatus error:', error);
        res.status(500).json({ error: 'Ã–deme durumu gÃ¼ncellenemedi' });
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
                `${p.tenant_name || ''} â€” ${paymentTypeDescription(p.payment_type)}`,
            ]
        );
    } catch (e) {
        console.warn('createInvoiceFromPayment:', e);
    }
}

function paymentTypeDescription(pt: string): string {
    const map: Record<string, string> = {
        subscription: 'Abonelik Ã¼creti',
        setup: 'Kurulum Ã¼creti',
        addon: 'Ek modÃ¼l Ã¼creti',
        license: 'Lisans Ã¼creti',
        refund: 'Ä°ade',
        reseller_income: 'Bayi komisyonu',
        reseller_package_onboarding: 'Bayi paket / onboarding',
        license_upgrade: 'Lisans yÃ¼kseltme',
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Muhasebe Inbox (vadeli abonelik Ã¶demeleri)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
        res.status(500).json({ error: 'Muhasebe inbox alÄ±namadÄ±' });
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
        if (!p) return res.status(404).json({ error: 'Ã–deme bulunamadÄ±' });

        const to = p.contact_email;
        if (!to) return res.status(400).json({ error: 'Tenant e-posta adresi yok' });

        const dueStr = p.due_date ? String(p.due_date) : 'â€”';
        const subject = `Abonelik yenileme - vade ${dueStr}`;
        const text = `Merhaba ${p.tenant_name || ''},\n\nAbonelik yenileme Ã¶deme vadeniz: ${dueStr}.\nTutar: â‚¬${Number(p.amount || 0).toFixed(
            2
        )}\n\nÃ–demeyi tamamladÄ±ÄŸÄ±nÄ±zda sistem otomatik gÃ¼ncelleyecektir.\n`;

        await queryPublic(
            `INSERT INTO \`public\`.billing_reminder_log (tenant_id, kind, message) VALUES (?, 'mail_sent', ?)`,
            [p.tenant_id, `Mail denemesi: payment#${p.id} due=${dueStr}`]
        );

        const mail = await trySendMail({ to, subject, text });
        return res.json({ ok: true, mailSent: mail.ok, reason: mail.reason || undefined });
    } catch (error) {
        console.error('sendPaymentDueMail error:', error);
        res.status(500).json({ error: 'Mail gÃ¶nderilemedi' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Muhasebe detay: yaklaÅŸan Ã¶demeler, vadeli, bildirim log
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        res.status(500).json({ error: 'YaklaÅŸan Ã¶demeler alÄ±namadÄ±' });
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
        res.status(500).json({ error: 'Vadeli Ã¶demeler alÄ±namadÄ±' });
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
        res.status(500).json({ error: 'Bildirim loglarÄ± alÄ±namadÄ±' });
    }
};

export const getAccountingAllPayments = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const { status, type, from, to, tenant, payment_method } = req.query;
        const params: any[] = [];
        /** KiracÄ±ya baÄŸlÄ± satÄ±rlar + tenant_id NULL iken saas_admin_id bu bayiye ait cÃ¼zdan yÃ¼klemeleri */
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
            SELECT ph.*, COALESCE(t.name, a.company_name, a.username) as tenant_name,
                   tb.plan_code as tb_plan_code,
                   tb.billing_cycle as tb_billing_cycle,
                   tb.monthly_recurring_total as tb_monthly_recurring_total,
                   tb.setup_fee_total as tb_setup_fee_total,
                   tb.next_payment_due as tb_next_payment_due
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            LEFT JOIN \`public\`.saas_admins a ON ph.saas_admin_id = a.id
            LEFT JOIN \`public\`.tenant_billing tb ON trim(tb.tenant_id::text) = trim(ph.tenant_id::text)
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

        const enriched = (rows || []).map((r: Record<string, unknown>) => ({
            ...r,
            cadence_key: paymentCadenceKey(r.payment_type as string, r.due_date),
        }));

        res.json({
            rows: enriched,
            summary: summary?.[0] || {},
        });
    } catch (error) {
        console.error('getAccountingAllPayments error:', error);
        res.status(500).json({ error: 'Ã–deme emirleri alÄ±namadÄ±' });
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
        res.status(500).json({ error: 'Fatura listesi alÄ±namadÄ±' });
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

/** Bayi: tenant veya tenant_id NULL iken kendi saas_admin satırı */
async function assertResellerPaymentRowAccess(req: Request, row: { tenant_id?: unknown; saas_admin_id?: unknown }): Promise<boolean> {
    if (req.user?.role === 'super_admin') return true;
    if (req.user?.role !== 'reseller') return false;
    const uid = Number(req.user.userId);
    if (row.tenant_id != null && String(row.tenant_id).trim() !== '') {
        return assertResellerOwnsTenant(req, String(row.tenant_id));
    }
    return Number(row.saas_admin_id) === uid;
}

/** Kurulum tek sefer; abonelik/ek modül vadeleri due_date ile tekrarlayan kabul edilir (UI metni i18n) */
function paymentCadenceKey(paymentType: string | null | undefined, dueDate: unknown): string {
    const p = String(paymentType || '').toLowerCase();
    const hasDue = dueDate != null && String(dueDate).trim() !== '';

    if (p === 'setup') return 'one_time_setup';
    if (p === 'subscription') return hasDue ? 'recurring_subscription' : 'subscription_settled';
    if (p === 'addon') return hasDue ? 'recurring_addon' : 'addon_charge';
    if (p === 'reseller_income') return 'commission';
    if (p === 'license_upgrade' || p === 'reseller_package_onboarding') return 'license_pool';
    if (p.includes('topup') || p === 'withdrawal') return 'wallet';
    if (p === 'license') return 'license_pool';
    return 'other';
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
            if (!ph) return res.status(404).json({ error: 'Fatura bulunamadÄ±' });
            if (!(await assertResellerOwnsTenant(req, ph.tenant_id != null ? String(ph.tenant_id) : null))) {
                return res.status(403).json({ error: 'Bu faturaya eriÅŸim yetkiniz yok' });
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
                notes: `${ph.tenant_name || ''} â€” ${paymentTypeDescription(ph.payment_type)}`,
            });
        }

        const inv = rows[0];
        if (!(await assertResellerOwnsTenant(req, inv.tenant_id != null ? String(inv.tenant_id) : null))) {
            return res.status(403).json({ error: 'Bu faturaya eriÅŸim yetkiniz yok' });
        }
        if (typeof inv.items === 'string') {
            try { inv.items = JSON.parse(inv.items); } catch {}
        }

        res.json(inv);
    } catch (error) {
        console.error('getInvoiceByNumber error:', error);
        res.status(500).json({ error: 'Fatura detayÄ± alÄ±namadÄ±' });
    }
};

/** Bayi/SaaS: tek ödeme kaydı — fatura kalemleri, faturalama özeti, modül satırları */
export const getPaymentFinanceDetail = async (req: Request, res: Response) => {
    try {
        await ensureInvoicesTable();
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz ödeme kimliği' });

        const [phRows]: any = await queryPublic(
            `
            SELECT ph.*,
                   COALESCE(t.name, a.company_name, a.username) AS tenant_name,
                   t.contact_email, t.contact_phone, t.tax_office, t.tax_number,
                   t.authorized_person, t.company_title, t.address AS tenant_address,
                   tb.plan_code, tb.billing_cycle, tb.setup_fee_total, tb.monthly_recurring_total,
                   tb.yearly_prepay_total, tb.next_payment_due, tb.payment_current
            FROM \`public\`.payment_history ph
            LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
            LEFT JOIN \`public\`.saas_admins a ON ph.saas_admin_id = a.id
            LEFT JOIN \`public\`.tenant_billing tb ON trim(tb.tenant_id::text) = trim(ph.tenant_id::text)
            WHERE ph.id = ?
            LIMIT 1
            `,
            [id],
        );
        const row = phRows?.[0];
        if (!row) return res.status(404).json({ error: 'Ödeme kaydı bulunamadı' });
        if (!(await assertResellerPaymentRowAccess(req, row))) {
            return res.status(403).json({ error: 'Bu ödeme kaydına erişim yetkiniz yok' });
        }

        const cadence_key = paymentCadenceKey(row.payment_type, row.due_date);

        let module_lines: any[] = [];
        if (row.tenant_id) {
            const [mods]: any = await queryPublic(
                `
                SELECT tm.module_code, tm.quantity, tm.setup_line_total, tm.monthly_line_total,
                       COALESCE(bm.name, tm.module_code) AS module_name,
                       bm.setup_price, bm.monthly_price
                FROM \`public\`.tenant_modules tm
                LEFT JOIN \`public\`.billing_modules bm ON tm.module_code = bm.code
                WHERE trim(tm.tenant_id::text) = trim(?::text)
                ORDER BY tm.module_code ASC
                `,
                [String(row.tenant_id)],
            );
            module_lines = mods || [];
        }

        let invoice: Record<string, unknown> | null = null;
        if (row.invoice_number) {
            const [invRows]: any = await queryPublic(
                `SELECT * FROM \`public\`.invoices WHERE invoice_number = ? LIMIT 1`,
                [row.invoice_number],
            );
            if (invRows?.[0]) {
                invoice = { ...invRows[0] } as Record<string, unknown>;
                if (typeof invoice.items === 'string') {
                    try {
                        invoice.items = JSON.parse(invoice.items as string);
                    } catch {
                        /* ignore */
                    }
                }
            }
        }

        if (!invoice && row.invoice_number) {
            const amount = Number(row.amount || 0);
            const taxRate = 19;
            const taxAmount = Math.round((amount * taxRate) / (100 + taxRate) * 100) / 100;
            const subtotal = Math.round((amount - taxAmount) * 100) / 100;
            invoice = {
                source: 'payment_fallback',
                invoice_number: row.invoice_number,
                tenant_id: row.tenant_id,
                tenant_name: row.tenant_name,
                items: [
                    {
                        description: paymentTypeDescription(row.payment_type),
                        quantity: 1,
                        unit_price: subtotal,
                        total: subtotal,
                    },
                ],
                subtotal,
                tax_rate: taxRate,
                tax_amount: taxAmount,
                total: amount,
                currency: row.currency || 'EUR',
                status: row.status,
                notes: String(row.description || ''),
            };
        }

        const tenant_billing =
            row.plan_code != null || row.setup_fee_total != null
                ? {
                      plan_code: row.plan_code,
                      billing_cycle: row.billing_cycle,
                      setup_fee_total: row.setup_fee_total != null ? Number(row.setup_fee_total) : null,
                      monthly_recurring_total: row.monthly_recurring_total != null ? Number(row.monthly_recurring_total) : null,
                      yearly_prepay_total: row.yearly_prepay_total != null ? Number(row.yearly_prepay_total) : null,
                      next_payment_due: row.next_payment_due,
                      payment_current: row.payment_current,
                  }
                : null;

        const payment = {
            id: row.id,
            tenant_id: row.tenant_id,
            tenant_name: row.tenant_name,
            saas_admin_id: row.saas_admin_id,
            amount: row.amount != null ? Number(row.amount) : null,
            currency: row.currency,
            payment_type: row.payment_type,
            payment_method: row.payment_method,
            status: row.status,
            description: row.description,
            due_date: row.due_date,
            paid_at: row.paid_at,
            created_at: row.created_at,
            invoice_number: row.invoice_number,
            created_by: row.created_by,
            cadence_key,
        };

        res.json({
            payment,
            tenant_billing,
            tenant_contact: {
                contact_email: row.contact_email,
                contact_phone: row.contact_phone,
                tax_office: row.tax_office,
                tax_number: row.tax_number,
                authorized_person: row.authorized_person,
                company_title: row.company_title,
                tenant_address: row.tenant_address,
            },
            module_lines,
            invoice,
        });
    } catch (error) {
        console.error('getPaymentFinanceDetail error:', error);
        res.status(500).json({ error: 'Ödeme detayı alınamadı' });
    }
};

export const getFinancialSummary = async (req: Request, res: Response) => {
    try {
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;
        const resellerId = userId != null ? Number(userId) : null;

        /**
         * Bayi komisyon satÄ±rlarÄ±: tenant_id Ã¼zerinden JOIN bazen PG tÃ¼r uyumsuzluÄŸunda 0 dÃ¶ner;
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

        // â”€â”€â”€ Bayi: komisyon = payment_history.reseller_income (+ kapsam) â”€â”€â”€
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

            const [commRows]: any = await queryPublic(
                `SELECT ph.amount, ph.description, ph.tenant_id::text as tenant_id
                 FROM \`public\`.payment_history ph
                 WHERE ph.status = 'paid' AND ph.payment_type = 'reseller_income' AND ${resellerPaymentScope}`,
                resellerScopeParams
            );
            const b = await aggregateResellerIncomeBreakdownAsync(commRows || []);

            let estimatedMonthlyCommission = 0;
            try {
                const [st]: any = await queryPublic(
                    `SELECT reseller_monthly_rate FROM "public"."system_settings" LIMIT 1`,
                );
                const mrate = Number(st?.[0]?.reseller_monthly_rate ?? 50) / 100;
                const [est]: any = await queryPublic(
                    `SELECT COALESCE(SUM(
                        CASE WHEN tb.billing_cycle::text = 'yearly'
                        THEN COALESCE(tb.yearly_prepay_total, 0) ELSE COALESCE(tb.monthly_recurring_total, 0) END
                    ), 0) AS base
                    FROM "public"."tenant_billing" tb
                    INNER JOIN "public"."tenants" t ON trim(tb.tenant_id::text) = trim(t.id::text)
                    WHERE t.reseller_id = ? AND t.status = 'active'`,
                    [resellerId],
                );
                estimatedMonthlyCommission = Math.round(Number(est?.[0]?.base || 0) * mrate * 100) / 100;
            } catch {
                estimatedMonthlyCommission = 0;
            }

            return res.json({
                totalEarnings: totalEarnings[0]?.total ?? 0,
                pendingRevenue: pendingRevenue[0]?.total ?? 0,
                walletBalance: Number(walletRows?.[0]?.wallet_balance ?? 0),
                monthlyEarnings,
                planDistribution,
                estimatedMonthlyCommission,
                commissionBreakdown: {
                    /** Dönem payı (aylık faturalama döngüsü) — açıklama kırılımı veya eski (monthly) satırları */
                    monthlyBillingCycle: b.monthlyBillingCycle,
                    yearlyBillingCycle: b.yearlyBillingCycle,
                    /** Modül kurulum komisyon payı (yeni format) veya açıklamada modül geçen eski satırlar */
                    salesWithAddonModules: b.salesWithAddonModules,
                    /** Plan kurulum komisyon payı (yeni format) veya kurulum/kurumsal anahtar kelimeli eski satırlar */
                    setupAndCorporate: b.setupAndCorporate,
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

        // Toplam gelir (KazanÃ§lar) â€” sÃ¼per admin
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

        // SÃ¼per admin: restoran Ã¶demeleri (abonelik / lisans / kurulum / ek)
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
        console.error('âŒ Financial summary error:', error);
        res.status(500).json({ error: 'Finansal Ã¶zet alÄ±namadÄ±' });
    }
};

/** Bayi komisyon yeniden hesaplama (payment_type her zaman reseller_income; dÃ¼zeltme tutarÄ± = hedef âˆ’ mevcut toplam) */
export async function runResellerCommissionRecalculation(resellerId: number): Promise<{
    updatedTenants: number;
    oldTotalCommission: number;
    newTotalCommission: number;
    diff: number;
    adjustmentRows: number;
    adjustmentNet: number;
    rates: { setupRate: number; monthlyRate: number };
}> {
    const [settingsRows]: any = await queryPublic(
        `SELECT reseller_setup_rate, reseller_monthly_rate FROM "public"."system_settings" LIMIT 1`,
    );
    const settings = settingsRows?.[0] || {};
    const setupRate = Number(settings.reseller_setup_rate ?? 75) / 100;
    const monthlyRate = Number(settings.reseller_monthly_rate ?? 50) / 100;

    const [tenantBillings]: any = await queryPublic(
        `SELECT tb.tenant_id, t.name as tenant_name, tb.billing_cycle, tb.plan_code,
                tb.setup_fee_total, tb.monthly_recurring_total, tb.yearly_prepay_total
         FROM "public"."tenant_billing" tb
         JOIN "public"."tenants" t ON trim(tb.tenant_id::text) = trim(t.id::text)
         WHERE t.reseller_id = $1`,
        [resellerId],
    );

    let updatedCount = 0;
    let totalOldCommission = 0;
    let totalNewCommission = 0;
    let adjustmentRows = 0;
    let adjustmentNet = 0;

    for (const tb of tenantBillings || []) {
        const [oldCommRows]: any = await queryPublic(
            `SELECT COALESCE(SUM(amount), 0) as total FROM "public"."payment_history"
             WHERE trim(tenant_id::text) = trim($1::text) AND payment_type = 'reseller_income' AND status = 'paid'`,
            [tb.tenant_id],
        );
        const oldTotal = Number(oldCommRows?.[0]?.total || 0);
        totalOldCommission += oldTotal;

        const [modRows]: any = await queryPublic(
            `SELECT tm.module_code, tm.quantity, bm.setup_price, bm.monthly_price
             FROM "public"."tenant_modules" tm
             JOIN "public"."billing_modules" bm ON tm.module_code = bm.code
             WHERE trim(tm.tenant_id::text) = trim($1::text)`,
            [tb.tenant_id],
        );

        let modulesSetup = 0;
        for (const m of modRows || []) {
            modulesSetup += Number(m.setup_price || 0) * Number(m.quantity || 1);
        }

        const planSetupFee = Number(tb.setup_fee_total || 0) - modulesSetup;
        const setupTotal = planSetupFee + modulesSetup;
        const monthlyTotal =
            tb.billing_cycle === 'yearly'
                ? Number(tb.yearly_prepay_total || 0)
                : Number(tb.monthly_recurring_total || 0);

        const newCommission = setupTotal * setupRate + monthlyTotal * monthlyRate;
        totalNewCommission += newCommission;

        const diff = Math.round((newCommission - oldTotal) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
            const invNo = `COMM-RECALC-${Date.now().toString(36).toUpperCase()}-${updatedCount}`;
            await queryPublic(
                `INSERT INTO "public"."payment_history" (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at)
                 VALUES ($1, $2, $3, 'EUR', 'reseller_income', 'adjustment', 'paid', $4, $5, NOW())`,
                [
                    tb.tenant_id,
                    resellerId,
                    diff,
                    `Komisyon düzeltmesi (${tb.billing_cycle}) — ${tb.tenant_name} [hedef: ${newCommission.toFixed(2)} €, önceki toplam: ${oldTotal.toFixed(2)} €]`,
                    invNo,
                ],
            );
            adjustmentRows += 1;
            adjustmentNet += diff;
        }
        updatedCount++;
    }

    return {
        updatedTenants: updatedCount,
        oldTotalCommission: Math.round(totalOldCommission * 100) / 100,
        newTotalCommission: Math.round(totalNewCommission * 100) / 100,
        diff: Math.round((totalNewCommission - totalOldCommission) * 100) / 100,
        adjustmentRows,
        adjustmentNet: Math.round(adjustmentNet * 100) / 100,
        rates: { setupRate: Math.round(setupRate * 100), monthlyRate: Math.round(monthlyRate * 100) },
    };
}

/** Bayi: komisyon oranlarÄ±nÄ± deÄŸiÅŸtirdikten sonra tÃ¼m eski reseller_income kayÄ±tlarÄ±nÄ± yeni oranlara gÃ¶re yeniden hesaplar */
export const recalculateResellerCommissionsHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'YalnÄ±zca bayi hesabÄ± eriÅŸebilir' });
        }
        const resellerId = Number(req.user.userId);
        const result = await runResellerCommissionRecalculation(resellerId);
        res.json({
            ok: true,
            ...result,
        });
    } catch (error) {
        console.error('âŒ recalculateResellerCommissions error:', error);
        res.status(500).json({ error: 'Komisyon yeniden hesaplanamadÄ±' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BUG-2 FIX: Bayi bazlÄ± komisyon Ã¶zet raporu (Admin paneli)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export const getResellerCommissionSummary = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'YalnÄ±zca sÃ¼per admin eriÅŸebilir' });
        }
        const { reseller_id, from, to } = req.query;

        let dateFilter = '';
        const params: any[] = [];

        if (reseller_id) {
            params.push(Number(reseller_id));
        }

        if (from) { dateFilter += ' AND ph.created_at >= ?'; params.push(from); }
        if (to)   { dateFilter += ' AND ph.created_at <= ?'; params.push(to); }

        // TÃ¼m bayilerin komisyon Ã¶zeti
        const resellerScope = reseller_id ? ' AND ph.saas_admin_id = ?' : '';
        const [summary]: any = await queryPublic(
            `SELECT
                a.id             AS reseller_id,
                a.username       AS reseller_username,
                a.company_name   AS company_name,
                a.wallet_balance AS wallet_balance,
                COALESCE(SUM(CASE WHEN ph.status = 'paid' THEN ph.amount ELSE 0 END), 0)    AS total_earned,
                COALESCE(SUM(CASE WHEN ph.status = 'pending' THEN ph.amount ELSE 0 END), 0) AS total_pending,
                COUNT(DISTINCT t.id)::int AS tenant_count
             FROM \`public\`.saas_admins a
             LEFT JOIN \`public\`.payment_history ph
                    ON ph.saas_admin_id = a.id
                   AND ph.payment_type = 'reseller_income'
                   ${dateFilter}
             LEFT JOIN \`public\`.tenants t ON t.reseller_id = a.id
             WHERE a.role = 'reseller'
             ${reseller_id ? 'AND a.id = ?' : ''}
             GROUP BY a.id, a.username, a.company_name, a.wallet_balance
             ORDER BY total_earned DESC`,
            reseller_id ? [...params, Number(reseller_id)] : params
        );

        // AylÄ±k kÄ±rÄ±lÄ±m
        const [monthly]: any = await queryPublic(
            `SELECT
                ph.saas_admin_id AS reseller_id,
                TO_CHAR(ph.created_at, 'YYYY-MM') AS month,
                SUM(ph.amount)::numeric AS total
             FROM \`public\`.payment_history ph
             WHERE ph.payment_type = 'reseller_income'
               AND ph.status = 'paid'
               ${reseller_id ? 'AND ph.saas_admin_id = ?' : ''}
               ${dateFilter}
             GROUP BY ph.saas_admin_id, TO_CHAR(ph.created_at, 'YYYY-MM')
             ORDER BY month ASC`,
            reseller_id ? [Number(reseller_id), ...(from ? [from] : []), ...(to ? [to] : [])] : [...(from ? [from] : []), ...(to ? [to] : [])]
        );

        // Restoran bazlÄ± komisyon detayÄ± (sadece tek bayi filtrelendiyse)
        let tenantBreakdown: any[] = [];
        if (reseller_id) {
            const [tb]: any = await queryPublic(
                `SELECT
                    t.id            AS tenant_id,
                    t.name          AS tenant_name,
                    t.created_at    AS tenant_created_at,
                    t.created_by    AS created_by,
                    tb.billing_cycle,
                    tb.monthly_recurring_total,
                    tb.setup_fee_total,
                    COALESCE(SUM(CASE WHEN ph.status='paid' THEN ph.amount ELSE 0 END), 0) AS commission_paid,
                    COALESCE(SUM(CASE WHEN ph.status='pending' THEN ph.amount ELSE 0 END), 0) AS commission_pending
                 FROM \`public\`.tenants t
                 LEFT JOIN \`public\`.tenant_billing tb ON trim(tb.tenant_id::text) = t.id::text
                 LEFT JOIN \`public\`.payment_history ph
                        ON trim(ph.tenant_id::text) = t.id::text
                       AND ph.payment_type = 'reseller_income'
                       AND ph.saas_admin_id = ?
                 WHERE t.reseller_id = ?
                 GROUP BY t.id, t.name, t.created_at, t.created_by, tb.billing_cycle, tb.monthly_recurring_total, tb.setup_fee_total
                 ORDER BY commission_paid DESC`,
                [Number(reseller_id), Number(reseller_id)]
            );
            tenantBreakdown = tb || [];
        }

        res.json({
            summary: summary || [],
            monthly: monthly || [],
            tenantBreakdown,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('âŒ getResellerCommissionSummary error:', error);
        res.status(500).json({ error: 'Komisyon Ã¶zeti alÄ±namadÄ±' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 2. GÃœVENLÄ°K & DENETÄ°M
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        res.status(500).json({ error: 'Audit loglar alÄ±namadÄ±' });
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
        res.status(500).json({ error: 'GiriÅŸ denemeleri alÄ±namadÄ±' });
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
        console.error('âŒ Security summary error:', error);
        res.status(500).json({ error: 'GÃ¼venlik Ã¶zeti alÄ±namadÄ±' });
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
        res.status(500).json({ error: 'API anahtarlarÄ± alÄ±namadÄ±' });
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
        res.status(201).json({ message: 'API anahtarÄ± oluÅŸturuldu', id: result.insertId, key });
    } catch (error) {
        res.status(500).json({ error: 'API anahtarÄ± oluÅŸturulamadÄ±' });
    }
};

export const revokeApiKey = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('UPDATE `public`.api_keys SET is_active = false WHERE id = ?', [id]);
        await logAudit(req, 'revoke_api_key', 'api_key', id, null, { revoked: true });
        res.json({ message: 'API anahtarÄ± iptal edildi' });
    } catch (error) {
        res.status(500).json({ error: 'API anahtarÄ± iptal edilemedi' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 3. RAPORLAMA & ANALÄ°TÄ°K
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    // â”€â”€â”€ AI INSIGHT: CHURN RISK (LicansÄ± bitmek Ã¼zere olanlar) â”€â”€â”€
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

    // â”€â”€â”€ REVENUE FORECAST (Gelecek ay beklenen tahsilat) â”€â”€â”€
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

    // â”€â”€â”€ PLAN REVENUE DISTRIBUTION â”€â”€â”€
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

    let estimatedMonthlyResellerCommission: number | undefined;
    if (isReseller && resellerId != null) {
        try {
            const [st]: any = await queryPublic(
                `SELECT reseller_monthly_rate FROM "public"."system_settings" LIMIT 1`,
            );
            const mrate = Number(st?.[0]?.reseller_monthly_rate ?? 50) / 100;
            const [est]: any = await queryPublic(
                `SELECT COALESCE(SUM(
                    CASE WHEN tb.billing_cycle::text = 'yearly'
                    THEN COALESCE(tb.yearly_prepay_total, 0) ELSE COALESCE(tb.monthly_recurring_total, 0) END
                ), 0) AS base
                FROM "public"."tenant_billing" tb
                INNER JOIN "public"."tenants" t ON trim(tb.tenant_id::text) = trim(t.id::text)
                WHERE t.reseller_id = ? AND t.status = 'active'`,
                [resellerId],
            );
            estimatedMonthlyResellerCommission = Math.round(Number(est?.[0]?.base || 0) * mrate * 100) / 100;
        } catch {
            estimatedMonthlyResellerCommission = 0;
        }
    }

    const forecastDisplay =
        revenueForecast > 0
            ? revenueForecast
            : estimatedMonthlyResellerCommission != null && estimatedMonthlyResellerCommission > 0
              ? estimatedMonthlyResellerCommission
              : 0;

    res.json({
        monthlyGrowth,
        churnRate,
        churnedCount,
        totalTenants: totalTenantCount,
        topTenants,
        planDistribution: planRevenueDist, // Use revenue scale for distribution
        revenueForecast,
        estimatedMonthlyResellerCommission,
        churnRiskCount,
        aiInsights: {
            forecastMessage:
                forecastDisplay > 0
                    ? `Next 30 days projection: +â‚¬${forecastDisplay.toLocaleString()}`
                    : 'Stable pipeline',
            riskLevel: churnRiskCount > (totalTenantCount * 0.1) ? 'critical' : (churnRiskCount > 0 ? 'warning' : 'healthy')
        }
    });
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 4. ABONELÄ°K & PLAN YÃ–NETÄ°MÄ°
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const getSubscriptionPlans = async (_req: Request, res: Response) => {
    try {
        await ensureDeviceResetQuotaSchema();
        const [rows] = await queryPublic('SELECT * FROM `public`.subscription_plans ORDER BY sort_order ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Planlar alÄ±namadÄ±' });
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

        if (updates.length === 0) return res.status(400).json({ error: 'GÃ¼ncellenecek alan yok' });

        values.push(id);
        await queryPublic(`UPDATE \`public\`.subscription_plans SET ${updates.join(', ')} WHERE id = ?`, values);
        await logAudit(req, 'update_plan', 'subscription_plan', id, null, req.body);

        res.json({ message: 'Plan gÃ¼ncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Plan gÃ¼ncellenemedi' });
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
        res.status(201).json({ message: 'Yeni plan oluÅŸturuldu', id: result.insertId });
    } catch (error: any) {
        if (error.code === '23505' || error.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'Bu plan kodu bir baÅŸkasÄ± tarafÄ±ndan kullanÄ±lÄ±yor' });
        res.status(500).json({ error: 'Plan oluÅŸturulamadÄ±' });
    }
};

export const deleteSubscriptionPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('DELETE FROM `public`.subscription_plans WHERE id = ?', [id]);
        await logAudit(req, 'delete_plan', 'subscription_plan', id, null, { deleted: true });
        res.json({ message: 'Plan sistemden kaldÄ±rÄ±ldÄ±' });
    } catch (error) {
        res.status(500).json({ error: 'Plan silinemedi' });
    }
};

export const getPromoCodes = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.promo_codes ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Promosyon kodlarÄ± alÄ±namadÄ±' });
    }
};

export const createPromoCode = async (req: Request, res: Response) => {
    try {
        const { code, discount_type, discount_value, max_uses, valid_from, valid_until } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.promo_codes (code, discount_type, discount_value, max_uses, valid_from, valid_until)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [code.toUpperCase(), discount_type, discount_value, max_uses || 100, valid_from || null, valid_until || null]);

        res.status(201).json({ message: 'Promosyon kodu oluÅŸturuldu', id: result.insertId });
    } catch (error: any) {
        if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Bu kod zaten mevcut' });
        res.status(500).json({ error: 'Promosyon kodu oluÅŸturulamadÄ±' });
    }
};

export const togglePromoCode = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('UPDATE `public`.promo_codes SET is_active = NOT is_active WHERE id = ?', [id]);
        res.json({ message: 'Promosyon kodu durumu gÃ¼ncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'GÃ¼ncelleme baÅŸarÄ±sÄ±z' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 5. CRM â€” MÃ¼ÅŸteri Ä°liÅŸkileri
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        res.status(500).json({ error: 'MÃ¼ÅŸteri notlarÄ± alÄ±namadÄ±', detail: (error as Error).message });
    }
};

export const createCustomerNote = async (req: Request, res: Response) => {
    try {
        const { tenant_id, note_type, subject, content } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM "public".tenants WHERE id = $1::uuid AND reseller_id = $2', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran iÃ§in not ekleme yetkiniz yok' });
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
        res.status(500).json({ error: 'SÃ¶zleÅŸmeler alÄ±namadÄ±', detail: (error as Error).message });
    }
};

export const createContract = async (req: Request, res: Response) => {
    try {
        const { tenant_id, start_date, end_date, monthly_amount, notes } = req.body;

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM "public".tenants WHERE id = $1::uuid AND reseller_id = $2', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran iÃ§in sÃ¶zleÅŸme oluÅŸturma yetkiniz yok' });
        }

        const contractNumber = `CTR-${Date.now().toString(36).toUpperCase()}`;

        const [result]: any = await queryPublic(`
            INSERT INTO "public".contracts (tenant_id, contract_number, start_date, end_date, monthly_amount, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [tenant_id, contractNumber, start_date, end_date || null, monthly_amount || 0, notes || '']);

        res.status(201).json({ message: 'SÃ¶zleÅŸme oluÅŸturuldu', id: result.insertId, contract_number: contractNumber });
    } catch (error) {
        console.error('[ERROR] createContract:', error);
        res.status(500).json({ error: 'SÃ¶zleÅŸme oluÅŸturulamadÄ±' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 6. MONÄ°TÃ–RÄ°NG & SÄ°STEM SAÄžLIÄžI
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const getSystemHealth = async (_req: Request, res: Response) => {
    try {
        // DB baÄŸlantÄ± testi
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
            /* tablo yoksa boÅŸ */
        }

        // Sistem metriÄŸi kaydet
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
        console.error('âŒ System health error:', error);
        res.status(500).json({ status: 'unhealthy', error: 'Sistem saÄŸlÄ±ÄŸÄ± kontrol edilemedi' });
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
        res.status(500).json({ error: 'Alert kurallarÄ± alÄ±namadÄ±' });
    }
};

export const createAlertRule = async (req: Request, res: Response) => {
    try {
        const { name, metric_type, threshold, operator, severity } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.alert_rules (name, metric_type, threshold, operator, severity)
            VALUES (?, ?, ?, ?, ?)
        `, [name, metric_type, threshold, operator || 'gt', severity || 'warning']);

        res.status(201).json({ message: 'Alert kuralÄ± oluÅŸturuldu', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Alert kuralÄ± oluÅŸturulamadÄ±' });
    }
};

export const toggleAlertRule = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('UPDATE `public`.alert_rules SET is_active = NOT is_active WHERE id = ?', [id]);
        res.json({ message: 'Alert kuralÄ± durumu gÃ¼ncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'GÃ¼ncelleme baÅŸarÄ±sÄ±z' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 7. GELÄ°ÅžMÄ°Åž DESTEK SÄ°STEMÄ°
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
            `SELECT tm.*, 
                    COALESCE(sa.username, sa2.username) as reseller_username,
                    COALESCE(sa.company_name, sa2.company_name) as reseller_company_name,
                    COALESCE(sa.email, sa2.email) as reseller_email,
                    COALESCE(sa.mobile_phone, sa2.mobile_phone) as reseller_phone
             FROM \`public\`.ticket_messages tm
             LEFT JOIN \`public\`.support_tickets st ON tm.ticket_id = st.id
             LEFT JOIN \`public\`.tenants ten ON trim(st.tenant_id::text) = trim(ten.id::text)
             LEFT JOIN \`public\`.saas_admins sa ON ten.reseller_id = sa.id
             LEFT JOIN \`public\`.saas_admins sa2 ON st.created_by_reseller_id = sa2.id
             WHERE tm.ticket_id = ?
             ORDER BY tm.created_at ASC`,
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
            SELECT st.*, t.name as tenant_name,
                   COALESCE(sa.username, sa2.username) as reseller_username, 
                   COALESCE(sa.company_name, sa2.company_name) as reseller_company_name,
                   COALESCE(sa.email, sa2.email) as reseller_email,
                   COALESCE(sa.mobile_phone, sa2.mobile_phone) as reseller_phone
            FROM \`public\`.support_tickets st
            LEFT JOIN \`public\`.tenants t ON trim(st.tenant_id::text) = trim(t.id::text)
            LEFT JOIN \`public\`.saas_admins sa ON t.reseller_id = sa.id
            LEFT JOIN \`public\`.saas_admins sa2 ON st.created_by_reseller_id = sa2.id
            WHERE st.id = ?
        `, [id]);

        if (ticket.length === 0) return res.status(404).json({ error: 'Ticket bulunamadı' });

        const [messages]: any = await queryPublic(
            `SELECT tm.*, 
                    COALESCE(sa.username, sa2.username) as reseller_username,
                    COALESCE(sa.company_name, sa2.company_name) as reseller_company_name,
                    COALESCE(sa.email, sa2.email) as reseller_email,
                    COALESCE(sa.mobile_phone, sa2.mobile_phone) as reseller_phone
             FROM \`public\`.ticket_messages tm
             LEFT JOIN \`public\`.support_tickets st ON tm.ticket_id = st.id
             LEFT JOIN \`public\`.tenants ten ON trim(st.tenant_id::text) = trim(ten.id::text)
             LEFT JOIN \`public\`.saas_admins sa ON ten.reseller_id = sa.id
             LEFT JOIN \`public\`.saas_admins sa2 ON st.created_by_reseller_id = sa2.id
             WHERE tm.ticket_id = ?
             ORDER BY tm.created_at ASC`,
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

        /* Åžemada first_response_at yok; gÃ¼ncelleme sÃ¼resi ile yaklaÅŸÄ±k yanÄ±t sÃ¼resi */
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
        console.error('âŒ Support stats error:', error);
        res.status(500).json({ error: 'Destek istatistikleri alÄ±namadÄ±' });
    }
};

// Knowledge Base
export const getKnowledgeBase = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.knowledge_base WHERE is_published = true ORDER BY view_count DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Bilgi bankasÄ± alÄ±namadÄ±' });
    }
};

export const createKBArticle = async (req: Request, res: Response) => {
    try {
        const { title, category, content, tags } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.knowledge_base (title, category, content, tags) VALUES (?, ?, ?, ?)
        `, [title, category || 'general', content, tags || '']);

        res.status(201).json({ message: 'Makale oluÅŸturuldu', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Makale oluÅŸturulamadÄ±' });
    }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 8. GELÄ°ÅžMÄ°Åž YEDEKLEME
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const createTenantBackup = async (req: Request, res: Response) => {
    try {
        const { tenant_id } = req.body;
        
        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT id FROM `public`.tenants WHERE id = ? AND reseller_id = ?', [tenant_id, req.user.userId]);
            if (check.length === 0) return res.status(403).json({ error: 'Bu restoran iÃ§in yedek oluÅŸturma yetkiniz yok' });
        }

        const [tenant]: any = await queryPublic('SELECT name, schema_name FROM `public`.tenants WHERE id = ?', [tenant_id]);
        if (tenant.length === 0) return res.status(404).json({ error: 'Tenant bulunamadÄ±' });

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
        res.status(201).json({ message: `${tenant[0].name} yedeÄŸi oluÅŸturuldu`, id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Tenant yedeÄŸi oluÅŸturulamadÄ±' });
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
        console.error('âŒ Backup stats error:', error);
        res.status(500).json({ error: 'Yedek istatistikleri alÄ±namadÄ±' });
    }
};
export const getResellerZReportsSummary = async (req: Request, res: Response) => {
    try {
        const isSuper = req.user?.role === 'super_admin';
        const saasAdminId = isSuper ? null : req.user?.userId;

        let query = 'SELECT id, schema_name as schemaName, name FROM `public`.tenants';
        const params: any[] = [];
        if (saasAdminId) {
            query += ' WHERE reseller_id = ?';
            params.push(saasAdminId);
        }

        const [tenants]: any = await queryPublic(query, params);

        if (tenants.length === 0) {
            return res.json({ summary: [], totalRevenue: 0, totalOrders: 0, totalCash: 0, totalCard: 0 });
        }

        let totalRevenue = 0;
        let totalOrders = 0;
        let totalCash = 0;
        let totalCard = 0;
        const summary = [];

        for (const t of tenants) {
            if (!t.schemaName) continue;
            try {
                const [result]: any = await queryPublic(`
                    SELECT 
                        COALESCE(SUM(total_revenue), 0) as rev,
                        COALESCE(SUM(total_orders), 0) as ord,
                        COALESCE(SUM(cash_total), 0) as cash,
                        COALESCE(SUM(card_total), 0) as card
                    FROM \`${t.schemaName}\`.daily_summaries
                `);

                if (result && result.length > 0) {
                    const rev = Number(result[0].rev) || 0;
                    const ord = Number(result[0].ord) || 0;
                    const cash = Number(result[0].cash) || 0;
                    const card = Number(result[0].card) || 0;

                    totalRevenue += rev;
                    totalOrders += ord;
                    totalCash += cash;
                    totalCard += card;

                    summary.push({
                        tenantId: t.id,
                        tenantName: t.name,
                        revenue: rev,
                        orders: ord,
                        cash: cash,
                        card: card
                    });
                }
            } catch (err) {
                console.error('Error fetching daily summaries for tenant ' + t.schemaName, err);
            }
        }

        summary.sort((a, b) => b.revenue - a.revenue);

        res.json({
            summary,
            totalRevenue,
            totalOrders,
            totalCash,
            totalCard
        });
    } catch (error) {
        console.error('getResellerZReportsSummary error:', error);
        res.status(500).json({ error: 'Bayi Z-Raporu özeti alinamadi' });
    }
};

export const suspendTenantForOverdueInvoice = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const isSuper = req.user?.role === 'super_admin';
        if (!isSuper) {
            return res.status(403).json({ error: 'Bu islem için yetkiniz yok' });
        }

        const [payments]: any = await queryPublic('SELECT * FROM `public`.payment_history WHERE id = ? LIMIT 1', [id]);
        const payment = payments?.[0];

        if (!payment) return res.status(404).json({ error: 'Fatura bulunamadi' });
        if (!payment.tenant_id) return res.status(400).json({ error: 'Faturaya bagli bir restoran bulunamadi' });
        
        await queryPublic('UPDATE `public`.tenants SET status = ? WHERE id = ?', ['suspended', payment.tenant_id]);

        if (payment.description) {
            await queryPublic('UPDATE `public`.payment_history SET description = ? WHERE id = ?', [payment.description + ' (Sistem kilitlendi)', id]);
        }

        res.json({ message: 'Restoran basariyla askiya alindi (Suspended)' });
    } catch (error) {
        console.error('suspendTenantForOverdueInvoice error:', error);
        res.status(500).json({ error: 'Islem basarisiz oldu' });
    }
};

export const getExpenses = async (req: Request, res: Response) => {
    try {
        const isSuper = req.user?.role === 'super_admin';
        const saasAdminId = isSuper ? null : req.user?.userId;

        let q = 'SELECT * FROM `public`.payment_history WHERE payment_type = ?';
        const p: any[] = ['expense'];
        if (saasAdminId) {
            q += ' AND saas_admin_id = ?';
            p.push(saasAdminId);
        }
        q += ' ORDER BY created_at DESC LIMIT 100';

        const [expenses]: any = await queryPublic(q, p);

        const totalExpense = (expenses || []).reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);

        res.json({
            expenses: (expenses || []).map((e: any) => ({
                id: e.id,
                amount: Number(e.amount),
                category: e.payment_method || 'other',
                description: e.description,
                createdAt: e.created_at
            })),
            totalExpense
        });
    } catch (error) {
        console.error('getExpenses error:', error);
        res.status(500).json({ error: 'Giderler alinamadi' });
    }
};

export const createExpense = async (req: Request, res: Response) => {
    try {
        const { amount, category, description } = req.body;
        const saasAdminId = req.user?.role === 'super_admin' ? null : req.user?.userId;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Geçerli bir tutar giriniz' });
        }

        const [expense]: any = await queryPublic(`
            INSERT INTO \`public\`.payment_history 
            (saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at, created_by, created_at)
            VALUES (?, ?, 'EUR', 'expense', ?, 'paid', ?, NOW(), ?, NOW())
        `, [
            saasAdminId || null, amount, category || 'other', description || 'Sistem gideri', req.user?.username || 'system'
        ]);

        res.json({ message: 'Gider basariyla eklendi', expenseId: expense?.insertId });
    } catch (error) {
        console.error('createExpense error:', error);
        res.status(500).json({ error: 'Gider eklenemedi' });
    }
};
