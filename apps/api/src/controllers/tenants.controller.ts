import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pool, { createTenant, listTenants, queryPublic, invalidateTenantCache, updateTenantMasterPassword, TenantError, withTenant } from '../lib/db.js';
import { prisma } from '../lib/prisma.js';
import { migrateBillingTables, seedTenantBilling, calculateQuote, type QuoteBreakdown } from '../services/billing.service.js';
import { provisionQrWebSubdomain } from '../services/qrWebProvisioning.service.js';
import { GatewayService, isVirtualPosTestMode } from '../services/gateway.service.js';
import { creditResellerTopupAfterCardPayment } from '../services/reseller-topup-credit.service.js';
import { runAuditRetentionCleanup } from '../services/audit-retention.service.js';
import { ensureUsersDeviceIdColumn } from '../lib/userDeviceColumns.js';
import {
    ensureDeviceResetQuotaSchema,
    consumeTenantDeviceResetQuota,
    getTenantDeviceResetSummaries,
    releaseConsumedTenantDeviceResetQuota,
} from '../services/device-reset-quota.service.js';

async function logResellerTopupAudit(
    req: Request,
    auditAction: 'reseller_wallet_topup_approved' | 'reseller_wallet_topup_rejected',
    topupId: number,
    extra: Record<string, unknown>
): Promise<void> {
    try {
        await queryPublic(
            `
            INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                String(req.user?.userId ?? 'system'),
                auditAction,
                'reseller_wallet_topup_request',
                String(topupId),
                null,
                JSON.stringify(extra),
                req.ip || req.socket?.remoteAddress || '',
                String(req.headers['user-agent'] || ''),
            ]
        );
    } catch (e) {
        console.warn('logResellerTopupAudit:', e);
    }
}

let _tBillingFieldsOk = false;
async function ensureTenantBillingFields(): Promise<void> {
    if (_tBillingFieldsOk) return;
    try {
        for (const col of ['tax_office VARCHAR(100)', 'tax_number VARCHAR(30)', 'authorized_person VARCHAR(150)', 'company_title VARCHAR(255)']) {
            const name = col.split(' ')[0];
            try { await queryPublic(`ALTER TABLE \`public\`.tenants ADD COLUMN IF NOT EXISTS ${name} ${col.split(' ').slice(1).join(' ')}`); } catch {}
        }
        _tBillingFieldsOk = true;
    } catch {}
}

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
    admin_username: z.string().optional(),
    module_codes: z.array(z.string()).optional(),
    extra_device_qty: z.number().min(1).optional(),
    extra_printer_qty: z.number().min(1).optional(),
    /** Bayi doğrudan satış: havale=askıda bekleyen ödeme; kart=sanal POS taslağı; bakiye=net tahsilat */
    payment_method: z.enum(['bank_transfer', 'admin_card', 'wallet_balance']).optional(),
    /** Havale: ödeme hatırlatması gönder (e-posta altyapısı hazır olduğunda) */
    send_payment_notification: z.boolean().optional(),
});

function resellerCommissionFromQuote(
    quote: QuoteBreakdown,
    billingCycle: 'monthly' | 'yearly',
    s: { reseller_setup_rate?: number; reseller_monthly_rate?: number }
): number {
    const setupTotal = quote.setupFee + quote.modulesSetup;
    const resellerSetupPart = setupTotal * (Number(s.reseller_setup_rate ?? 75) / 100);
    const resellerServicePart =
        billingCycle === 'yearly'
            ? quote.yearlyPrepayTotal * (Number(s.reseller_monthly_rate ?? 50) / 100)
            : quote.monthlyRecurringTotal * (Number(s.reseller_monthly_rate ?? 50) / 100);
    return resellerSetupPart + resellerServicePart;
}

const updateTenantSchema = z.object({
    name: z.string().min(2).optional(),
    status: z.enum(['active', 'suspended', 'inactive']).optional(),
    subscriptionPlan: z.enum(['basic', 'pro', 'enterprise']).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    authorizedPerson: z.string().optional(),
    taxOffice: z.string().optional(),
    taxNumber: z.string().optional(),
    companyTitle: z.string().optional(),
    specialLicenseKey: z.string().optional(),
    address: z.string().optional(),
    maxUsers: z.number().min(1).optional(),
    maxBranches: z.number().min(1).optional(),
    deviceResetQuotaOverride: z.number().int().min(0).max(200).nullable().optional(),
    /** Kiracı şemasında `admin` kullanıcı şifresi + public.tenants.master_password senkron */
    masterPassword: z.string().min(8).max(128).optional(),
});

async function autoProvisionQrWebIfSelected(tenantId: string, moduleCodes?: string[]): Promise<void> {
    const hasQrWebMenu = Array.isArray(moduleCodes) && moduleCodes.includes('qr_web_menu');
    if (!hasQrWebMenu) return;

    const provision = await provisionQrWebSubdomain(tenantId);
    if (!provision.ok) {
        const reason = provision.skipped || provision.deployment?.error || 'qr_web_provision_failed';
        try {
            await prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    status: 'suspended',
                    settings: {
                        qr_web_provisioning_error: reason,
                        qr_web_provisioning_failed_at: new Date().toISOString(),
                    } as any,
                },
            });
        } catch (e) {
            console.warn('Tenant suspend failed after QR automation error:', e);
        }
        throw new Error(`QR Web otomasyon başarısız: ${reason}`);
    }
}

const updateResellerProfileSchema = z.object({
    name: z.string().min(2).max(120).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(40).optional().or(z.literal('')),
    mobile_phone: z.string().max(40).optional().or(z.literal('')),
    contact_person: z.string().max(150).optional().or(z.literal('')),
    company_name: z.string().max(255).optional().or(z.literal('')),
    tax_number: z.string().max(50).optional().or(z.literal('')),
    tax_office: z.string().max(120).optional().or(z.literal('')),
    billing_address: z.string().max(1500).optional().or(z.literal('')),
    city: z.string().max(100).optional().or(z.literal('')),
    district: z.string().max(100).optional().or(z.literal('')),
    postal_code: z.string().max(20).optional().or(z.literal('')),
    country: z.string().max(80).optional().or(z.literal('')),
    two_factor_enabled: z.boolean().optional(),
    two_factor_method: z.enum(['none', 'email', 'authenticator']).optional(),
});

const changeResellerPasswordSchema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8).max(128),
});

const setupAuthenticatorSchema = z.object({
    issuer: z.string().min(1).max(60).optional(),
});

const verifyAuthenticatorSchema = z.object({
    code: z.string().min(6).max(8),
});

let _resellerSecurityFieldsOk = false;
async function ensureResellerSecurityFields(): Promise<void> {
    if (_resellerSecurityFieldsOk) return;
    try {
        const cols = [
            'two_factor_enabled BOOLEAN DEFAULT FALSE',
            "two_factor_method VARCHAR(20) DEFAULT 'none'",
            'two_factor_secret VARCHAR(128)',
            'two_factor_temp_secret VARCHAR(128)',
            'two_factor_backup_codes TEXT',
            'company_name VARCHAR(255)',
            'phone VARCHAR(40)',
            'mobile_phone VARCHAR(40)',
            'contact_person VARCHAR(150)',
            'tax_number VARCHAR(50)',
            'tax_office VARCHAR(120)',
            'billing_address TEXT',
            'city VARCHAR(100)',
            'district VARCHAR(100)',
            'postal_code VARCHAR(20)',
            "country VARCHAR(80) DEFAULT 'Türkiye'",
        ];
        for (const colDef of cols) {
            try {
                await queryPublic(`ALTER TABLE \`public\`.saas_admins ADD COLUMN IF NOT EXISTS ${colDef}`);
            } catch {
                /* ignore */
            }
        }
        _resellerSecurityFieldsOk = true;
    } catch {
        /* ignore */
    }
}

function base32Encode(buf: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = input.toUpperCase().replace(/=+$/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = alphabet.indexOf(ch);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function hotp(secretBase32: string, counter: number): string {
    const key = base32Decode(secretBase32);
    const b = Buffer.alloc(8);
    b.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    b.writeUInt32BE(counter % 0x100000000, 4);
    const h = crypto.createHmac('sha1', key).update(b).digest();
    const offset = h[h.length - 1] & 0x0f;
    const code =
        ((h[offset] & 0x7f) << 24) |
        ((h[offset + 1] & 0xff) << 16) |
        ((h[offset + 2] & 0xff) << 8) |
        (h[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
}

function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
    const counter = Math.floor(Date.now() / 30000);
    const normalized = String(code).replace(/\s+/g, '');
    for (let i = -window; i <= window; i++) {
        if (hotp(secretBase32, counter + i) === normalized) return true;
    }
    return false;
}

function parseBackupCodes(raw: unknown): string[] {
    if (!raw) return [];
    try {
        const arr = JSON.parse(String(raw));
        if (!Array.isArray(arr)) return [];
        return arr.map((v) => String(v)).filter(Boolean);
    } catch {
        return [];
    }
}

function generateBackupCodes(count = 8): string[] {
    const out: string[] = [];
    while (out.length < count) {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        if (!out.includes(code)) out.push(code);
    }
    return out;
}

// ─────────────────────────────────────
// Controller Methods
// ─────────────────────────────────────

export const createTenantHandler = async (req: Request, res: Response) => {
    try {
        const data: any = createTenantSchema.parse(req.body);
        const sendPaymentNotification = !!data.send_payment_notification;
        delete data.send_payment_notification;

        const planCode = data.subscription_plan || 'basic';
        try {
            const [planRows]: any = await queryPublic(
                'SELECT max_users, max_branches FROM `public`.subscription_plans WHERE code = ? LIMIT 1',
                [planCode]
            );
            const pr = planRows?.[0];
            if (pr) {
                data.max_users = Number(pr.max_users) || 10;
                data.max_branches = Number(pr.max_branches) || 1;
            } else {
                data.max_users = data.max_users ?? 10;
                data.max_branches = data.max_branches ?? 1;
            }
        } catch {
            data.max_users = data.max_users ?? 10;
            data.max_branches = data.max_branches ?? 1;
        }

        let resellerIdForPost: number | null = null;
        let directSaleQuote: QuoteBreakdown | null = null;
        let directSaleCommission = 0;
        let directSaleBillingCycle: 'monthly' | 'yearly' = 'monthly';

        // Bayi ise otomatik kendi ID'sini ata
        if (req.user?.role === 'reseller') {
            data.reseller_id = req.user.userId;
            const resellerId = req.user.userId;
            resellerIdForPost = Number(resellerId);
            const { license_usage_type, payment_interval = 'monthly' } = req.body;

            const [resellers]: any = await queryPublic('SELECT available_licenses, wallet_balance FROM `public`.saas_admins WHERE id = ?', [resellerId]);
            const reseller = resellers[0];
            const [settings]: any = await queryPublic('SELECT * FROM `public`.system_settings LIMIT 1');
            const s = settings[0] || {
                reseller_setup_rate: 75,
                system_setup_rate: 25,
                reseller_monthly_rate: 50,
                system_monthly_rate: 50,
                annual_discount_rate: 15,
            };

            if (license_usage_type === 'prepaid') {
                if (reseller.available_licenses <= 0) {
                    return res.status(400).json({ error: 'Yetersiz lisans bakiyesi. Lütfen mağazadan yeni lisans paketi satın alın.' });
                }
                await queryPublic('UPDATE `public`.saas_admins SET available_licenses = available_licenses - 1 WHERE id = ?', [resellerId]);
                data.status = 'active';
                // Prepaid: komisyon hesapla ve payment_history + cüzdan güncelle
                try {
                    await migrateBillingTables();
                    const planCodePre = data.subscription_plan || 'basic';
                    const billingCyclePre = data.payment_interval === 'yearly' ? 'yearly' : 'monthly';
                    const quotePre = await calculateQuote({
                        planCode: planCodePre,
                        moduleCodes: data.module_codes || [],
                        extraDeviceQty: data.extra_device_qty,
                        extraPrinterQty: data.extra_printer_qty,
                        billingCycle: billingCyclePre,
                        annualDiscountPercent: Number(s.annual_discount_rate ?? 15),
                    });
                    const prepaidCommission = resellerCommissionFromQuote(quotePre, billingCyclePre, s);
                    if (prepaidCommission > 0) {
                        await queryPublic(`UPDATE "public"."saas_admins" SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2`, [prepaidCommission, resellerId]);
                        await queryPublic(
                            `INSERT INTO "public"."payment_history"
                                (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at)
                             VALUES ($1, $2, $3, 'EUR', 'reseller_income', 'license', 'paid', $4, NOW())`,
                            [
                                'PLACEHOLDER_TENANT_ID',
                                resellerId,
                                prepaidCommission,
                                `Lisans Havuzu komisyonu (${billingCyclePre}) — ${data.name}`,
                            ]
                        );
                        // tenant.id henüz yok, sonra güncelle
                        data._pendingCommission = prepaidCommission;
                        data._pendingCommissionBillingCycle = billingCyclePre;
                    }
                } catch (qe) {
                    console.warn('⚠️ Prepaid komisyon hesaplanamadı:', qe);
                }
            } else if (license_usage_type === 'direct_sale') {
                if (!data.payment_method) {
                    return res.status(400).json({ error: 'Doğrudan satışta ödeme yöntemi seçilmelidir' });
                }

                try {
                    await migrateBillingTables();
                    const planCodeDs = data.subscription_plan || 'pro';
                    const billingCycle = payment_interval === 'yearly' ? 'yearly' : 'monthly';
                    const quote = await calculateQuote({
                        planCode: planCodeDs,
                        moduleCodes: data.module_codes || [],
                        extraDeviceQty: data.extra_device_qty,
                        extraPrinterQty: data.extra_printer_qty,
                        billingCycle,
                        annualDiscountPercent: Number(s.annual_discount_rate ?? 15),
                    });

                    const totalResellerCommission = resellerCommissionFromQuote(quote, billingCycle, s);
                    const firstInvoiceTotal = quote.firstInvoiceTotal;
                    const walletNetDelta = totalResellerCommission - firstInvoiceTotal;
                    directSaleQuote = quote;
                    directSaleCommission = totalResellerCommission;
                    directSaleBillingCycle = billingCycle;

                    if (data.payment_method === 'admin_card') {
                        const draftPayload = { ...data, license_usage_type: 'direct_sale', payment_interval, payment_method: 'admin_card' };
                        const draftId = uuidv4();
                        await queryPublic(
                            `INSERT INTO \`public\`.tenant_creation_drafts (id, reseller_id, payload, expires_at) VALUES (?, ?, ?::jsonb, NOW() + INTERVAL '24 hours')`,
                            [draftId, resellerId, JSON.stringify(draftPayload)]
                        );
                        return res.status(200).json({
                            requires_card_payment: true,
                            draftId,
                            message: 'Sanal POS ödemesini tamamlayın; başarılı olunca restoran oluşturulur.',
                        });
                    }

                    if (data.payment_method === 'bank_transfer') {
                        data.status = 'suspended';
                        data.settings = {
                            pending_bank_transfer: true,
                            send_payment_notification: sendPaymentNotification,
                            first_invoice_total: firstInvoiceTotal,
                            /** Havale onayında reseller_income yazmak için */
                            reseller_commission_amount: totalResellerCommission,
                        };
                    } else if (data.payment_method === 'wallet_balance') {
                        const wb = Number(reseller?.wallet_balance ?? 0);
                        if (wb + walletNetDelta < 0) {
                            return res.status(400).json({
                                error: `Cüzdan bakiyesi yetersiz. Gerekli: ${Math.abs(walletNetDelta).toFixed(2)} € (mevcut: ${wb.toFixed(2)} €)`,
                            });
                        }
                        await queryPublic(`UPDATE \`public\`.saas_admins SET wallet_balance = wallet_balance + ? WHERE id = ?`, [
                            walletNetDelta,
                            resellerId,
                        ]);
                        data.status = 'active';
                    }
                } catch (qe: any) {
                    return res.status(400).json({ error: qe?.message || 'Fiyat / modül hesaplanamadı' });
                }
            }
        }

        const tenant = await createTenant(data);
        await autoProvisionQrWebIfSelected(tenant.id, data.module_codes);

        // Prepaid: tenant oluştuktan sonra komisyon kaydını gerçek tenant_id ile ekle
        if (req.user?.role === 'reseller' && data.license_usage_type === 'prepaid' && resellerIdForPost != null) {
            const pendingComm = data._pendingCommission as number | undefined;
            const pendingCycle = data._pendingCommissionBillingCycle as string | undefined;
            if (pendingComm && pendingComm > 0) {
                try {
                    await queryPublic(
                        `UPDATE "public"."payment_history" SET tenant_id = $1 WHERE tenant_id = 'PLACEHOLDER_TENANT_ID' AND payment_type = 'reseller_income'`,
                        [tenant.id]
                    );
                    // seedTenantBilling çağrısı aşağıda
                } catch (e) {
                    console.warn('Prepaid komisyon tenant_id güncelleme hatası:', e);
                }
            }
        }

        try {
            await migrateBillingTables();
            const planCodeBill = data.subscription_plan || 'basic';
            const billingCycleBill = data.payment_interval === 'yearly' ? 'yearly' : 'monthly';
            await seedTenantBilling(
                tenant.id,
                planCodeBill,
                billingCycleBill,
                data.module_codes || [],
                data.extra_device_qty,
                data.extra_printer_qty
            );
        } catch (billingErr) {
            console.warn('⚠️ Faturalama satırları oluşturulamadı (tenant yine de açıldı):', billingErr);
        }

        if (req.user?.role === 'reseller' && data.license_usage_type === 'direct_sale' && resellerIdForPost != null) {
            const quote = directSaleQuote;
            const totalResellerCommission = directSaleCommission;
            const billingCycle = directSaleBillingCycle;
            const modNote =
                (data.module_codes?.length ?? 0) > 0 ? ` + modüller: ${(data.module_codes || []).join(', ')}` : '';

            if (!quote || totalResellerCommission <= 0) {
                console.warn('Doğrudan satış ödeme kaydı atlandı: teklif/komisyon yok');
            } else {
                try {
                    if (data.payment_method === 'wallet_balance') {
                        const invGen = () => {
                            const n = new Date();
                            return `INV-${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
                        };
                        const walletNetDelta = totalResellerCommission - quote.firstInvoiceTotal;
                        const payLabel = `cüzdan (net ${walletNetDelta >= 0 ? '+' : ''}${walletNetDelta.toFixed(2)} €)`;
                        // Bayi komisyonu
                        await queryPublic(
                            `INSERT INTO "public"."payment_history" (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at)
                             VALUES ($1, $2, $3, 'EUR', 'reseller_income', $4, 'paid', $5, $6, NOW())`,
                            [
                                tenant.id,
                                resellerIdForPost,
                                totalResellerCommission,
                                'wallet_balance',
                                `Komisyon (${billingCycle}) — ${data.name} · ödeme: ${payLabel}${modNote}`,
                                `COMM-${invGen()}`,
                            ]
                        );
                        // İlk dönem fatura kaydı (tenant'a fatura)
                        await queryPublic(
                            `INSERT INTO "public"."payment_history" (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at)
                             VALUES ($1, $2, $3, 'EUR', 'subscription', 'wallet_balance', 'paid', $4, $5, NOW())`,
                            [
                                tenant.id,
                                resellerIdForPost,
                                quote.firstInvoiceTotal,
                                `İlk dönem — ${data.name}${modNote}`,
                                invGen(),
                            ]
                        );
                    } else if (data.payment_method === 'bank_transfer') {
                        await queryPublic(
                            `INSERT INTO \`public\`.payment_history (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, due_date)
                             VALUES (?, ?, ?, 'EUR', 'subscription', 'bank_transfer', 'pending', ?, CURRENT_DATE + INTERVAL '14 days')`,
                            [
                                tenant.id,
                                resellerIdForPost,
                                quote.firstInvoiceTotal,
                                `İlk dönem — Havale bekleniyor: ${data.name}${modNote}`,
                            ]
                        );
                        if (sendPaymentNotification && data.contact_email) {
                            console.log(
                                `[notify] Havale ödemesi bekleniyor: ${data.name} · ${data.contact_email} · ${quote.firstInvoiceTotal.toFixed(2)} €`
                            );
                        }
                    }
                } catch (e) {
                    console.warn('Doğrudan satış ödeme kaydı oluşturulamadı (tenant oluşturuldu):', e);
                }
            }
        }

        const suspendedNote =
            data.status === 'suspended' && data.settings && (data.settings as any).pending_bank_transfer
                ? ' Restoran havale onayı / ödeme tamamlanana kadar askıda.'
                : '';
        res.status(201).json({
            message: `Restoran "${data.name}" oluşturuldu.${suspendedNote}`,
            tenant,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        // MySQL eski kod yolu
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Bu schema adı veya lisans kodu zaten kullanımda' });
        }
        // PostgreSQL unique ihlali
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Bu schema adı / lisans kodu / benzersiz alan zaten kullanımda' });
        }
        // Prisma unique ihlali
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Bu schema adı veya lisans kodu zaten kullanımda' });
        }
        console.error('❌ Tenant oluşturma hatası:', error);
        res.status(500).json({
            error: 'Tenant oluşturulamadı',
            detail:
                process.env.NODE_ENV === 'development'
                    ? String(error?.message || error)
                    : undefined,
        });
    }
};

const completeCardDraftSchema = z.object({
    success: z.boolean(),
    error_code: z.string().optional(),
});

/** Sanal POS simülasyonu / geri dönüşü: taslak → ödeme başarılıysa restoran oluştur */
export const completeTenantCardDraftHandler = async (req: Request, res: Response) => {
    try {
        const draftId = String(req.params.draftId);
        const body = completeCardDraftSchema.parse(req.body);
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        }
        const rid = Number(req.user.userId);

        const [rows]: any = await queryPublic(
            `SELECT payload FROM \`public\`.tenant_creation_drafts WHERE id = ? AND reseller_id = ? AND expires_at > NOW()`,
            [draftId, rid]
        );
        if (!rows?.length) {
            return res.status(404).json({ error: 'Taslak bulunamadı veya süresi doldu' });
        }

        let raw = rows[0].payload;
        if (typeof raw === 'string') raw = JSON.parse(raw);

        if (!body.success) {
            await queryPublic(`DELETE FROM \`public\`.tenant_creation_drafts WHERE id = ?`, [draftId]);
            return res.status(400).json({ ok: false, error_code: body.error_code || 'CARD_PAYMENT_FAILED' });
        }

        const data: any = createTenantSchema.parse(raw);
        data.reseller_id = rid;
        delete data.send_payment_notification;

        const planCode = data.subscription_plan || 'basic';
        try {
            const [planRows]: any = await queryPublic(
                'SELECT max_users, max_branches FROM `public`.subscription_plans WHERE code = ? LIMIT 1',
                [planCode]
            );
            const pr = planRows?.[0];
            if (pr) {
                data.max_users = Number(pr.max_users) || 10;
                data.max_branches = Number(pr.max_branches) || 1;
            } else {
                data.max_users = data.max_users ?? 10;
                data.max_branches = data.max_branches ?? 1;
            }
        } catch {
            data.max_users = data.max_users ?? 10;
            data.max_branches = data.max_branches ?? 1;
        }

        const [settings]: any = await queryPublic('SELECT * FROM `public`.system_settings LIMIT 1');
        const s = settings[0] || {
            reseller_setup_rate: 75,
            reseller_monthly_rate: 50,
            annual_discount_rate: 15,
        };
        const billingCycle = data.payment_interval === 'yearly' ? 'yearly' : 'monthly';

        await migrateBillingTables();
        const quote = await calculateQuote({
            planCode: data.subscription_plan || 'pro',
            moduleCodes: data.module_codes || [],
            extraDeviceQty: data.extra_device_qty,
            extraPrinterQty: data.extra_printer_qty,
            billingCycle,
            annualDiscountPercent: Number(s.annual_discount_rate ?? 15),
        });
        const totalResellerCommission = resellerCommissionFromQuote(quote, billingCycle, s);
        await queryPublic(`UPDATE \`public\`.saas_admins SET wallet_balance = wallet_balance + ? WHERE id = ?`, [
            totalResellerCommission,
            rid,
        ]);

        const tenant = await createTenant(data);
        await autoProvisionQrWebIfSelected(tenant.id, data.module_codes);

        try {
            await seedTenantBilling(
                tenant.id,
                data.subscription_plan || 'basic',
                billingCycle,
                data.module_codes || [],
                data.extra_device_qty,
                data.extra_printer_qty
            );
        } catch (billingErr) {
            console.warn('⚠️ Kart akışı seedTenantBilling:', billingErr);
        }

        const modNote =
            (data.module_codes?.length ?? 0) > 0 ? ` + modüller: ${(data.module_codes || []).join(', ')}` : '';
        const invGen = () => `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        // Bayi komisyonu
        await queryPublic(
            `INSERT INTO \`public\`.payment_history (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at)
             VALUES (?, ?, ?, 'EUR', 'reseller_income', 'admin_card', 'paid', ?, $5, NOW())`,
            [
                tenant.id,
                rid,
                totalResellerCommission,
                `Komisyon (${billingCycle}) — ${data.name} · ödeme: sanal POS (kart)${modNote}`,
                `COMM-${invGen()}`,
            ]
        );
        // Tenant ilk dönem faturası
        await queryPublic(
            `INSERT INTO \`public\`.payment_history (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at)
             VALUES (?, ?, ?, 'EUR', 'subscription', 'admin_card', 'paid', ?, $5, NOW())`,
            [
                tenant.id,
                rid,
                quote.firstInvoiceTotal,
                `İlk dönem — ${data.name}${modNote}`,
                invGen(),
            ]
        );

        await queryPublic(`DELETE FROM \`public\`.tenant_creation_drafts WHERE id = ?`, [draftId]);
        invalidateTenantCache(tenant.id);

        res.status(201).json({
            message: `Restoran "${data.name}" oluşturuldu (kart ödemesi onaylandı).`,
            tenant,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Kart taslağı tamamlama:', error);
        res.status(500).json({ error: error?.message || 'İşlem tamamlanamadı' });
    }
};

export const getTenantsHandler = async (req: Request, res: Response) => {
    try {
        const resellerId = req.user?.role === 'reseller' ? req.user.userId : undefined;
        const tenants: any[] = await listTenants(resellerId);
        if (req.user?.role === 'super_admin') {
            res.json(
                tenants.map((t) => ({
                    ...t,
                    device_reset_unlimited: true,
                }))
            );
            return;
        }

        const quotaMap = await getTenantDeviceResetSummaries(tenants.map((t) => String(t.id)));
        res.json(
            tenants.map((t) => {
                const q = quotaMap[String(t.id)];
                if (!q) return t;
                return {
                    ...t,
                    device_reset_quota_monthly: q.quota,
                    device_reset_quota_override: q.override,
                    device_reset_used: q.used,
                    device_reset_remaining: q.remaining,
                    device_reset_month: q.month,
                };
            })
        );
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

export const resetTenantUserDevicesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = String(req.params.id || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant id gerekli' });

        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'super_admin' && role !== 'reseller') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        const [rows]: any = await queryPublic(
            'SELECT id, reseller_id, status FROM `public`.tenants WHERE id = ? LIMIT 1',
            [tenantId]
        );
        const tenant = rows?.[0];
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant bulunamadı' });
        }
        if (role === 'reseller' && tenant.reseller_id != req.user?.userId) {
            return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
        }

        if (role === 'super_admin') {
            await withTenant(tenantId, async (connection) => {
                await ensureUsersDeviceIdColumn(connection);
                await connection.query('UPDATE users SET device_id = NULL');
            });
            res.json({ ok: true, quota: { unlimited: true } });
            return;
        }

        let quotaLogId: number | null = null;
        try {
            const quota = await consumeTenantDeviceResetQuota({
                tenantId,
                actorRole: role,
                actorUserId: req.user?.userId ?? null,
                source: 'saas_tenant_list',
            });
            quotaLogId = quota.logId;

            await withTenant(tenantId, async (connection) => {
                await ensureUsersDeviceIdColumn(connection);
                await connection.query('UPDATE users SET device_id = NULL');
            });

            res.json({
                ok: true,
                quota: {
                    month: quota.month,
                    monthly: quota.quota,
                    used: quota.used,
                    remaining: quota.remaining,
                },
            });
        } catch (inner: any) {
            if (inner?.message === 'DEVICE_RESET_QUOTA_EXCEEDED') {
                return res.status(403).json({ error: 'Bu tenant için aylık cihaz sıfırlama hakkı doldu.' });
            }
            if (quotaLogId != null) {
                await releaseConsumedTenantDeviceResetQuota(quotaLogId);
            }
            throw inner;
        }
    } catch (error) {
        console.error('resetTenantUserDevicesHandler:', error);
        res.status(500).json({ error: 'Cihaz kilitleri sıfırlanamadı' });
    }
};

/** Bayi paneli: tenant oluşturulduktan sonra kimlik bilgilerini e-posta ile gönder */
export const sendTenantCredentialsHandler = async (req: Request, res: Response) => {
    try {
        const { to, tenantName, schemaName, username, password } = req.body as {
            to: string; tenantName: string; schemaName: string; username: string; password: string;
        };

        if (!to || !schemaName) {
            return res.status(400).json({ error: 'E-posta ve schema name gerekli' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
        }

        const { trySendMail } = await import('../lib/email.js');
        const adminUsername = schemaName.replace(/^tenant_/, '').replace(/[^a-z0-9]/g, '') || 'admin';
        const result = await trySendMail({
            to,
            subject: `NextPOS — ${tenantName} Hesap Bilgileri`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1e40af;">NextPOS — Yeni Restoran Hesabı</h2>
                    <p><strong>Restoran:</strong> ${tenantName}</p>
                    <p><strong>Teknik Ad:</strong> ${schemaName}</p>
                    <hr/>
                    <h3>Hesap Bilgileri</h3>
                    <table style="border-collapse: collapse; width: 100%;">
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Rol</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Kullanıcı Adı</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Şifre</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">PIN</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Admin</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${adminUsername}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${password || 'admin123'}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">123456</td></tr>
                            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Kasiyer</td><td style="padding: 8px; border: 1px solid #e5e7eb;">cashier</td><td style="padding: 8px; border: 1px solid #e5e7eb;">kasa123</td><td style="padding: 8px; border: 1px solid #e5e7eb;">111111</td></tr>
                            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Garson</td><td style="padding: 8px; border: 1px solid #e5e7eb;">waiter</td><td style="padding: 8px; border: 1px solid #e5e7eb;">garson123</td><td style="padding: 8px; border: 1px solid #e5e7eb;">222222</td></tr>
                            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Mutfak</td><td style="padding: 8px; border: 1px solid #e5e7eb;">kitchen</td><td style="padding: 8px; border: 1px solid #e5e7eb;">mutfak123</td><td style="padding: 8px; border: 1px solid #e5e7eb;">333333</td></tr>
                        </tbody>
                    </table>
                    <p style="color: #dc2626; font-size: 12px; margin-top: 16px;">⚠️ Bu bilgileri güvenli bir yerde saklayın ve sadece ilgili kişilerle paylaşın.</p>
                </div>
            `,
        });

        if (!result.ok) {
            console.error('❌ E-posta gönderilemedi:', result.reason);
            return res.status(500).json({ error: 'E-posta gönderilemedi', detail: result.reason });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('❌ sendTenantCredentials hatası:', error);
        res.status(500).json({ error: 'E-posta gönderilemedi' });
    }
};

/** Tenant şemasında bir kullanıcının şifresini ve/veya PIN'ini değiştir */
export const changeTenantUserPasswordHandler = async (req: Request, res: Response) => {
    try {
        const { schema_name, username, new_password, new_pin } = req.body as {
            schema_name: string; username: string; new_password?: string; new_pin?: string;
        };

        if (!schema_name || !username) {
            return res.status(400).json({ error: 'schema_name ve username gerekli' });
        }
        if (!new_password && !new_pin) {
            return res.status(400).json({ error: 'new_password veya new_pin gerekli' });
        }
        if (new_password && new_password.length < 6) {
            return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
        }
        if (new_pin && !/^\d{4,6}$/.test(new_pin)) {
            return res.status(400).json({ error: 'PIN 4-6 rakam olmalı' });
        }

        // Yetki kontrolü: sadece standart hesapların şifresi değiştirilebilir
        const allowedUsers = new Set(['admin', 'cashier', 'waiter', 'kitchen']);
        if (!allowedUsers.has(username.toLowerCase())) {
            return res.status(403).json({ error: 'Sadece standart hesapların bilgileri değiştirilebilir' });
        }

        const { updateTenantUserPassword, updateTenantUserPin } = await import('../lib/db.js');
        if (new_password) {
            await updateTenantUserPassword(schema_name, username.toLowerCase(), new_password);
        }
        if (new_pin) {
            await updateTenantUserPin(schema_name, username.toLowerCase(), new_pin);
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('❌ changeTenantUserPassword hatası:', error);
        res.status(500).json({ error: 'Şifre değiştirilemedi' });
    }
};

export const updateTenantHandler = async (req: Request, res: Response) => {
    try {
        await ensureTenantBillingFields();
        await ensureDeviceResetQuotaSchema();
        const tenantId = String(req.params.id);
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
        if (data.companyTitle !== undefined) { updates.push('company_title = ?'); values.push(data.companyTitle); }
        if (data.specialLicenseKey !== undefined) { updates.push('special_license_key = ?'); values.push(data.specialLicenseKey); }
        if (data.address !== undefined) { updates.push('address = ?'); values.push(data.address); }
        if (data.maxUsers !== undefined) { updates.push('max_users = ?'); values.push(data.maxUsers); }
        if (data.maxBranches !== undefined) { updates.push('max_branches = ?'); values.push(data.maxBranches); }
        if (data.deviceResetQuotaOverride !== undefined) {
            updates.push('device_reset_quota_override = ?');
            values.push(data.deviceResetQuotaOverride);
        }

        if (updates.length === 0 && data.masterPassword === undefined) {
            return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
        }

        if (req.user?.role === 'reseller') {
            const [check]: any = await queryPublic('SELECT reseller_id, status FROM `public`.tenants WHERE id = ?', [tenantId]);
            if (!check.length || check[0].reseller_id != req.user.userId) {
                return res.status(403).json({ error: 'Bu restoranı güncelleme yetkiniz yok' });
            }
            if (String(check[0].status || '').toLowerCase() !== 'active') {
                return res.status(403).json({ error: 'Ödeme onayı bekleyen/askıda restoranlarda bayi işlem yapamaz' });
            }
            // Bayi düzenleme kısıtı: plan/statü/limit değişimleri sadece super admin.
            if (
                data.status !== undefined ||
                data.subscriptionPlan !== undefined ||
                data.maxUsers !== undefined ||
                data.maxBranches !== undefined ||
                data.deviceResetQuotaOverride !== undefined ||
                data.name !== undefined ||
                data.specialLicenseKey !== undefined
            ) {
                return res.status(403).json({ error: 'Bu alanları yalnızca super admin güncelleyebilir' });
            }
        }

        if (updates.length > 0) {
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(tenantId);
            const query = `UPDATE \`public\`.tenants SET ${updates.join(', ')} WHERE id = ?`;
            await queryPublic(query, values);
        }

        if (data.subscriptionPlan !== undefined) {
            try {
                await migrateBillingTables();
                await queryPublic(
                    `UPDATE \`public\`.tenant_billing SET plan_code = ? WHERE trim(tenant_id::text) = ?`,
                    [data.subscriptionPlan, tenantId]
                );
            } catch (e) {
                console.warn('tenant_billing plan_code senkron:', (e as Error)?.message);
            }
        }

        if (data.masterPassword !== undefined) {
            try {
                await updateTenantMasterPassword(tenantId, data.masterPassword);
            } catch (e: unknown) {
                if (e instanceof TenantError && e.code === 'TENANT_NOT_FOUND') {
                    return res.status(404).json({ error: 'Tenant bulunamadı' });
                }
                throw e;
            }
        }

        invalidateTenantCache(tenantId);

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

        const baseParams: unknown[] = [];
        let tenantsQuery = 'SELECT COUNT(*)::text as count FROM `public`.tenants';
        let activeQuery =
            "SELECT COUNT(*)::text as count FROM `public`.tenants WHERE status = 'active'";

        if (isReseller) {
            tenantsQuery += ' WHERE reseller_id = ?';
            activeQuery += ' AND reseller_id = ?';
            baseParams.push(userId);
        }

        const [tenants]: any = await queryPublic(tenantsQuery, baseParams);
        const [active]: any = await queryPublic(activeQuery, baseParams);

        let resellerData: {
            wallet_balance: number;
            available_licenses: number;
            reseller_plan_id: number | null;
            reseller_plan_name: string | null;
            reseller_plan_code: string | null;
            reseller_plan_license_cap: number | null;
            reseller_plan_price: number | null;
        } | null = null;
        if (isReseller && userId != null) {
            try {
                const a = await prisma.saasAdmin.findUnique({
                    where: { id: Number(userId) },
                    include: { resellerPlan: true },
                });
                if (a) {
                    resellerData = {
                        wallet_balance: Number(a.walletBalance),
                        available_licenses: a.availableLicenses,
                        reseller_plan_id: a.resellerPlanId ?? null,
                        reseller_plan_name: a.resellerPlan?.name ?? null,
                        reseller_plan_code: a.resellerPlan?.code ?? null,
                        reseller_plan_license_cap: a.resellerPlan?.licenseCount ?? null,
                        reseller_plan_price: a.resellerPlan != null ? Number(a.resellerPlan.price) : null,
                    };
                }
            } catch {
                resellerData = null;
            }
        }

        const activeCount = Number(active[0]?.count ?? 0);
        let monthlyRevenue = activeCount * 50;
        if (!isReseller) {
            try {
                const [mr]: any = await queryPublic(
                    `
                    SELECT COALESCE(SUM(amount), 0)::text as total FROM "public"."payment_history"
                    WHERE status = 'paid'
                      AND payment_type IN ('subscription','license','setup','addon')
                      AND COALESCE(paid_at, created_at) >= date_trunc('month', CURRENT_TIMESTAMP)
                `
                );
                const v = Number(mr[0]?.total ?? 0);
                if (v > 0) monthlyRevenue = v;
            } catch {
                /* tablo yoksa tahmini değer */
            }
        }

        res.json({
            totalTenants: Number(tenants[0]?.count ?? 0),
            activeTenants: activeCount,
            monthlyRevenue,
            systemHealth: 98,
            lastUpdate: new Date().toISOString(),
            resellerData,
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
        await migrateBillingTables();
        const isReseller = req.user?.role === 'reseller';
        const userId = req.user?.userId;

        let query = `
            SELECT t.*, ten.name as tenant_name
            FROM \`public\`.support_tickets t
            LEFT JOIN \`public\`.tenants ten ON trim(t.tenant_id::text) = trim(ten.id::text)
            WHERE 1=1
        `;
        const params: any[] = [];

        if (isReseller) {
            query += ' AND (ten.reseller_id = ? OR t.created_by_reseller_id = ?)';
            params.push(userId, userId);
        }

        query += ' ORDER BY t.created_at DESC';
        const [rows]: any = await queryPublic(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[ERROR] getSupportTicketsHandler:', error);
        res.status(500).json({ error: 'Talepler alınamadı', detail: (error as Error).message });
    }
};

export const updateTicketStatusHandler = async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
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

            if (!check?.length) {
                return res.status(403).json({ error: 'Bu talebi güncelleme yetkiniz yok' });
            }
        }

        await queryPublic('UPDATE `public`.support_tickets SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Talep durumu güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Talep güncellenemedi' });
    }
};

export const createSupportTicketHandler = async (req: Request, res: Response) => {
    try {
        await migrateBillingTables();
        const subject = req.body?.subject != null ? String(req.body.subject).trim() : '';
        const message = req.body?.message != null ? String(req.body.message).trim() : '';
        if (subject.length < 2) return res.status(400).json({ error: 'Konu en az 2 karakter olmalı' });
        if (!message) return res.status(400).json({ error: 'Mesaj gerekli' });

        const priorityRaw = req.body?.priority;
        const priority = ['low', 'medium', 'high'].includes(priorityRaw) ? priorityRaw : 'medium';
        const category = req.body?.category != null ? String(req.body.category).slice(0, 50) : 'general';
        let tenantId: string | null =
            req.body?.tenant_id != null && String(req.body.tenant_id).trim() !== '' ? String(req.body.tenant_id).trim() : null;
        let createdByReseller: number | null = null;

        const role = req.user?.role;
        if (role === 'reseller') {
            const rid = Number(req.user?.userId);
            if (tenantId) {
                const [own]: any = await queryPublic(
                    `SELECT 1 FROM \`public\`.tenants WHERE trim(id::text) = trim(?) AND reseller_id = ? LIMIT 1`,
                    [tenantId, rid]
                );
                if (!own?.length) return res.status(403).json({ error: 'Bu restoran için talep açma yetkiniz yok' });
            } else {
                createdByReseller = rid;
                tenantId = null;
            }
        } else if (role === 'super_admin') {
            if (!tenantId) return res.status(400).json({ error: 'tenant_id gerekli' });
        } else {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        const [result]: any = await queryPublic(
            `
            INSERT INTO \`public\`.support_tickets (tenant_id, subject, message, status, priority, category, created_by_reseller_id)
            VALUES (?, ?, ?, 'open', ?, ?, ?)
            `,
            [tenantId, subject, message, priority, category, createdByReseller]
        );
        const newId = result.insertId;
        if (newId != null) {
            const senderName =
                role === 'reseller' ? String(req.user?.username || 'Bayi') : String(req.user?.username || 'Admin');
            const senderType = role === 'reseller' ? 'reseller' : 'admin';
            await queryPublic(
                `INSERT INTO \`public\`.ticket_messages (ticket_id, sender_type, sender_name, message) VALUES (?, ?, ?, ?)`,
                [newId, senderType, senderName, message]
            );
        }

        res.status(201).json({ id: newId, message: 'Talep oluşturuldu' });
    } catch (error) {
        console.error('[ERROR] createSupportTicketHandler:', error);
        res.status(500).json({ error: 'Talep oluşturulamadı' });
    }
};

export const postResellerWalletTopupRequestHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        }
        await migrateBillingTables();
        const amount = Number(req.body?.amount);
        if (!Number.isFinite(amount) || amount < 10) {
            return res.status(400).json({ error: 'Geçerli tutar girin (minimum 10 €)' });
        }
        const note = req.body?.note != null ? String(req.body.note).slice(0, 500) : null;
        const rawPm = req.body?.payment_method;
        const pm = String(rawPm ?? 'bank_transfer').trim().toLowerCase();
        const allowedPm = new Set(['bank_transfer', 'cash', 'admin_card']);
        if (!allowedPm.has(pm)) {
            return res.status(400).json({ error: 'Ödeme yöntemi: havale (bank_transfer), nakit (cash) veya kart (admin_card)' });
        }

        const transferRefRaw = req.body?.transfer_reference != null ? String(req.body.transfer_reference).trim() : '';
        const transferRef = transferRefRaw.slice(0, 180);
        const transferDateRaw = req.body?.transfer_date != null ? String(req.body.transfer_date).trim() : '';
        const transferTimeRaw = req.body?.transfer_time != null ? String(req.body.transfer_time).trim().slice(0, 12) : '';

        let transferDate: string | null = null;
        let transferTime: string | null = transferTimeRaw || null;
        if (pm === 'bank_transfer') {
            if (!transferRef || transferRef.length < 3) {
                return res.status(400).json({ error: 'Havale için dekont / referans (en az 3 karakter) girin.' });
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDateRaw)) {
                return res.status(400).json({ error: 'Havale için işlem tarihi girin (YYYY-AA-GG).' });
            }
            transferDate = transferDateRaw;
        } else {
            transferTime = null;
        }

        const rid = Number(req.user.userId);

        if (pm === 'admin_card') {
            const gwConfig = await GatewayService.getConfig();
            const gwName = String(gwConfig.active_gateway ?? 'none').toLowerCase();
            if (isVirtualPosTestMode(gwConfig) && gwName === 'none') {
                const origin = String(req.get('origin') || '').replace(/\/$/, '');
                const base =
                    origin ||
                    String(process.env.RESELLER_PUBLIC_URL || '')
                        .trim()
                        .replace(/\/$/, '') ||
                    'http://localhost:4001';
                const successUrl = `${base}/?topup=stripe_ok`;
                const cancelUrl = `${base}/?topup=stripe_cancel`;
                const [ins]: any = await queryPublic(
                    `
                    INSERT INTO \`public\`.reseller_wallet_topup_requests
                        (reseller_id, amount, currency, note, status, payment_method, transfer_reference, transfer_date, transfer_time, return_success_url, return_cancel_url)
                    VALUES (?, ?, 'EUR', ?, 'awaiting_card', 'admin_card', NULL, NULL, NULL, ?, ?)
                    `,
                    [rid, amount, note, successUrl, cancelUrl]
                );
                const topupId = Number(ins?.insertId);
                if (!Number.isFinite(topupId)) {
                    return res.status(500).json({ error: 'Test talebi oluşturulamadı' });
                }
                const extRef = `virtual_pos_test_${topupId}`;
                const cr = await creditResellerTopupAfterCardPayment({
                    topupId,
                    amountPaid: amount,
                    externalRef: extRef,
                    paymentHistoryMethod: 'virtual_pos_test',
                    auditAction: 'reseller_wallet_topup_virtual_pos_test',
                    createdBy: 'system:virtual_pos_test_mode',
                    description: `Bayi cüzdan — sanal POS test simülasyonu (talep #${topupId})`,
                });
                if (!cr.ok) {
                    return res.status(500).json({ error: 'Test modu bakiye yüklemesi başarısız' });
                }
                return res.status(201).json({
                    id: topupId,
                    testModeSimulated: true,
                    message:
                        'Test modu: gerçek sanal POS yok; ödeme simüle edildi ve bakiye güncellendi.',
                });
            }

            const origin = String(req.get('origin') || '').replace(/\/$/, '');
            const base =
                origin ||
                String(process.env.RESELLER_PUBLIC_URL || '')
                    .trim()
                    .replace(/\/$/, '') ||
                'http://localhost:4001';
            const successUrl = `${base}/?topup=stripe_ok&session_id={CHECKOUT_SESSION_ID}`;
            const cancelUrl = `${base}/?topup=stripe_cancel`;
            try {
                const { topupId, checkoutUrl, gateway } = await GatewayService.createResellerWalletTopupCheckout({
                    resellerId: rid,
                    amount,
                    note,
                    successUrl,
                    cancelUrl,
                    customerEmail: null,
                });
                return res.status(201).json({
                    id: topupId,
                    checkoutUrl,
                    gateway,
                    message:
                        gateway === 'stripe'
                            ? 'Sanal POS (Stripe) ödeme sayfasına yönlendiriliyorsunuz; başarılı ödemede bakiye otomatik yüklenir.'
                            : 'Ödeme sayfasına yönlendiriliyorsunuz.',
                });
            } catch (e: any) {
                const msg = e?.message || 'Kart ödemesi başlatılamadı';
                console.error('[ERROR] postResellerWalletTopupRequestHandler stripe:', e);
                return res.status(400).json({ error: msg });
            }
        }

        const [result]: any = await queryPublic(
            `
            INSERT INTO \`public\`.reseller_wallet_topup_requests
                (reseller_id, amount, currency, note, status, payment_method, transfer_reference, transfer_date, transfer_time)
            VALUES (?, ?, 'EUR', ?, 'pending', ?, ?, ?, ?)
            `,
            [rid, amount, note, pm, pm === 'bank_transfer' ? transferRef : null, transferDate, pm === 'bank_transfer' ? transferTime : null]
        );
        res.status(201).json({
            id: result.insertId,
            message: 'Yükleme talebi alındı; yönetim onayı sonrası bakiyeniz güncellenir.',
        });
    } catch (error) {
        console.error('[ERROR] postResellerWalletTopupRequestHandler:', error);
        res.status(500).json({ error: 'Talep kaydedilemedi' });
    }
};

export const getResellerWalletTopupRequestsHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        }
        await migrateBillingTables();
        const rid = Number(req.user.userId);
        const [rows]: any = await queryPublic(
            `SELECT * FROM \`public\`.reseller_wallet_topup_requests WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 100`,
            [rid]
        );
        res.json(rows || []);
    } catch (error) {
        console.error('[ERROR] getResellerWalletTopupRequestsHandler:', error);
        res.status(500).json({ error: 'Talepler alınamadı' });
    }
};

/** Süper admin: bekleyen cüzdan talep adedi (dashboard) */
export const getAdminResellerWalletTopupPendingCountHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }
        await migrateBillingTables();
        const [rows]: any = await queryPublic(
            `SELECT COUNT(*)::int as c FROM \`public\`.reseller_wallet_topup_requests WHERE status = 'pending'`,
            []
        );
        res.json({ count: Number(rows?.[0]?.c ?? 0) });
    } catch (error) {
        console.error('[ERROR] getAdminResellerWalletTopupPendingCountHandler:', error);
        res.status(500).json({ error: 'Sayım alınamadı' });
    }
};

/** Süper admin: tüm bayi cüzdan yükleme talepleri */
export const getAdminResellerWalletTopupRequestsHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }
        await migrateBillingTables();
        const [rows]: any = await queryPublic(
            `
            SELECT r.*, a.username, a.company_name
            FROM \`public\`.reseller_wallet_topup_requests r
            LEFT JOIN \`public\`.saas_admins a ON r.reseller_id = a.id
            ORDER BY r.created_at DESC
            LIMIT 300
            `,
            []
        );
        res.json(rows || []);
    } catch (error) {
        console.error('[ERROR] getAdminResellerWalletTopupRequestsHandler:', error);
        res.status(500).json({ error: 'Talepler alınamadı' });
    }
};

/** Süper admin: talep onay (bakiye ekle) veya red */
export const patchAdminResellerWalletTopupRequestHandler = async (req: Request, res: Response) => {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Yetkisiz' });
    }
    const { id } = req.params;
    const action = req.body?.action;
    if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ error: 'action: approve veya reject olmalı' });
    }
    const rid = Number(id);
    if (!Number.isFinite(rid)) {
        return res.status(400).json({ error: 'Geçersiz id' });
    }

    await migrateBillingTables();
    const client = await pool.connect();
    try {
        if (action === 'reject') {
            const up = await client.query(
                `UPDATE "public"."reseller_wallet_topup_requests" SET status = 'rejected' WHERE id = $1 AND status IN ('pending', 'awaiting_card') RETURNING reseller_id, amount`,
                [rid]
            );
            if (up.rowCount === 0) {
                return res.status(400).json({ error: 'Talep bulunamadı veya zaten işlendi' });
            }
            const rej = up.rows[0] as { reseller_id: number; amount: string };
            void logResellerTopupAudit(req, 'reseller_wallet_topup_rejected', rid, {
                reseller_id: rej.reseller_id,
                amount: Number(rej.amount),
            });
            return res.json({ ok: true, status: 'rejected' });
        }

        await client.query('BEGIN');
        const up = await client.query(
            `UPDATE "public"."reseller_wallet_topup_requests" SET status = 'approved' WHERE id = $1 AND status = 'pending' RETURNING reseller_id, amount, note, payment_method`,
            [rid]
        );
        if (up.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Talep bulunamadı veya zaten işlendi' });
        }
        const row = up.rows[0] as { reseller_id: number; amount: string; note: string | null; payment_method?: string | null };
        const amt = Number(row.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'Geçersiz tutar' });
        }
        await client.query(
            `UPDATE "public"."saas_admins" SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2`,
            [amt, row.reseller_id]
        );
        const notePart = row.note && String(row.note).trim() ? ` · ${String(row.note).trim().slice(0, 400)}` : '';
        const desc = `Bayi cüzdan yükleme onayı (talep #${rid})${notePart}`;
        const createdBy = String(req.user?.username || req.user?.userId || 'admin');
        const rawPm = String(row.payment_method ?? 'bank_transfer').toLowerCase();
        const payMethod = ['bank_transfer', 'cash', 'admin_card'].includes(rawPm) ? rawPm : 'bank_transfer';
        const phIns = await client.query(
            `
            INSERT INTO "public"."payment_history"
                (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at, created_by)
            VALUES (NULL, $1, $2, 'EUR', 'reseller_wallet_topup', $5, 'paid', $3, NOW(), $4)
            RETURNING id
            `,
            [row.reseller_id, amt, desc, createdBy, payMethod]
        );
        const paymentHistoryId = phIns.rows[0]?.id as number | undefined;
        await client.query('COMMIT');
        void logResellerTopupAudit(req, 'reseller_wallet_topup_approved', rid, {
            reseller_id: row.reseller_id,
            amount: amt,
            payment_history_id: paymentHistoryId ?? null,
        });
        return res.json({ ok: true, status: 'approved', credited: amt, payment_history_id: paymentHistoryId ?? null });
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        console.error('[ERROR] patchAdminResellerWalletTopupRequestHandler:', e);
        return res.status(500).json({ error: 'İşlem başarısız' });
    } finally {
        client.release();
    }
};

// --- Reseller Profile & Security ---
export const getResellerProfileHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        }
        await ensureResellerSecurityFields();
        const [rows]: any = await queryPublic(
            `SELECT 
                id,
                username,
                COALESCE(full_name, username) as name,
                email,
                phone,
                mobile_phone,
                contact_person,
                company_name,
                tax_number,
                tax_office,
                billing_address,
                city,
                district,
                postal_code,
                country,
                COALESCE(two_factor_enabled, FALSE) as two_factor_enabled,
                COALESCE(two_factor_method, 'none') as two_factor_method,
                two_factor_backup_codes,
                COALESCE(wallet_balance, 0) as wallet_balance,
                COALESCE(available_licenses, 0) as available_licenses,
                COALESCE(commission_rate, 0) as commission_rate
             FROM \`public\`.saas_admins
             WHERE id = ?
             LIMIT 1`,
            [req.user.userId],
        );
        if (!rows?.length) return res.status(404).json({ error: 'Bayi kaydı bulunamadı' });
        const row = rows[0];
        const backupCodes = parseBackupCodes(row.two_factor_backup_codes);
        res.json({
            ...row,
            backup_codes_remaining: backupCodes.length,
        });
    } catch (error) {
        res.status(500).json({ error: 'Bayi profili alınamadı' });
    }
};

export const updateResellerProfileHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        }
        await ensureResellerSecurityFields();
        const parsed = updateResellerProfileSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Geçersiz profil verisi', details: parsed.error.errors });
        }
        const data = parsed.data;
        const map: Record<string, string> = {
            name: 'full_name',
            email: 'email',
            phone: 'phone',
            mobile_phone: 'mobile_phone',
            contact_person: 'contact_person',
            company_name: 'company_name',
            tax_number: 'tax_number',
            tax_office: 'tax_office',
            billing_address: 'billing_address',
            city: 'city',
            district: 'district',
            postal_code: 'postal_code',
            country: 'country',
            two_factor_enabled: 'two_factor_enabled',
            two_factor_method: 'two_factor_method',
        };

        const sets: string[] = [];
        const values: any[] = [];
        for (const [k, col] of Object.entries(map)) {
            if ((data as any)[k] !== undefined) {
                sets.push(`${col} = ?`);
                values.push((data as any)[k] === '' ? null : (data as any)[k]);
            }
        }
        if (!sets.length) return res.status(400).json({ error: 'Güncellenecek alan yok' });

        values.push(req.user.userId);
        await queryPublic(`UPDATE \`public\`.saas_admins SET ${sets.join(', ')} WHERE id = ?`, values);
        const [rows]: any = await queryPublic(
            `SELECT id, username, COALESCE(full_name, username) as name, email, phone, mobile_phone, contact_person,
                    company_name, tax_number, tax_office, billing_address, city, district, postal_code, country,
                    COALESCE(two_factor_enabled, FALSE) as two_factor_enabled, COALESCE(two_factor_method, 'none') as two_factor_method
             FROM \`public\`.saas_admins WHERE id = ? LIMIT 1`,
            [req.user.userId],
        );
        res.json({ message: 'Profil güncellendi', profile: rows?.[0] || null });
    } catch (error) {
        res.status(500).json({ error: 'Profil güncellenemedi' });
    }
};

export const changeResellerPasswordHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        }
        const parsed = changeResellerPasswordSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Geçersiz şifre verisi', details: parsed.error.errors });
        }
        const { current_password, new_password } = parsed.data;
        const [rows]: any = await queryPublic(
            'SELECT id, password_hash FROM `public`.saas_admins WHERE id = ? LIMIT 1',
            [req.user.userId],
        );
        const row = rows?.[0];
        if (!row) return res.status(404).json({ error: 'Bayi kaydı bulunamadı' });

        const ok = await bcrypt.compare(current_password, String(row.password_hash || ''));
        if (!ok) return res.status(400).json({ error: 'Mevcut şifre yanlış' });

        const hashed = await bcrypt.hash(new_password, 10);
        await queryPublic('UPDATE `public`.saas_admins SET password_hash = ? WHERE id = ?', [hashed, req.user.userId]);
        res.json({ message: 'Şifre güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Şifre güncellenemedi' });
    }
};

export const setupResellerAuthenticatorHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        await ensureResellerSecurityFields();
        const parsed = setupAuthenticatorSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri' });
        const issuer = (parsed.data.issuer || 'NextPOS').trim();
        const [rows]: any = await queryPublic(
            'SELECT username FROM `public`.saas_admins WHERE id = ? LIMIT 1',
            [req.user.userId],
        );
        const row = rows?.[0];
        if (!row) return res.status(404).json({ error: 'Bayi kaydı bulunamadı' });
        const username = String(row.username || `reseller_${req.user.userId}`);
        const secret = base32Encode(crypto.randomBytes(20));
        await queryPublic(
            `UPDATE \`public\`.saas_admins
             SET two_factor_temp_secret = ?, two_factor_method = 'authenticator'
             WHERE id = ?`,
            [secret, req.user.userId],
        );
        const label = encodeURIComponent(`${issuer}:${username}`);
        const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUrl)}`;
        res.json({
            message: 'Authenticator kurulumu oluşturuldu',
            secret,
            otpauth_url: otpauthUrl,
            qr_url: qrUrl,
        });
    } catch {
        res.status(500).json({ error: 'Authenticator kurulumu oluşturulamadı' });
    }
};

export const verifyResellerAuthenticatorHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        await ensureResellerSecurityFields();
        const parsed = verifyAuthenticatorSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Geçersiz doğrulama kodu' });
        const code = parsed.data.code;
        const [rows]: any = await queryPublic(
            `SELECT two_factor_temp_secret
             FROM \`public\`.saas_admins
             WHERE id = ?
             LIMIT 1`,
            [req.user.userId],
        );
        const row = rows?.[0];
        if (!row?.two_factor_temp_secret) return res.status(400).json({ error: 'Önce authenticator setup başlatın' });
        const secret = String(row.two_factor_temp_secret);
        if (!verifyTotp(secret, code)) return res.status(400).json({ error: 'Kod doğrulanamadı' });
        await queryPublic(
            `UPDATE \`public\`.saas_admins
             SET two_factor_secret = ?, two_factor_temp_secret = NULL, two_factor_enabled = TRUE, two_factor_method = 'authenticator'
             WHERE id = ?`,
            [secret, req.user.userId],
        );
        res.json({ message: 'Authenticator 2FA etkinleştirildi' });
    } catch {
        res.status(500).json({ error: 'Authenticator doğrulaması başarısız' });
    }
};

export const regenerateResellerBackupCodesHandler = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'reseller') return res.status(403).json({ error: 'Yalnızca bayi hesabı' });
        await ensureResellerSecurityFields();
        const [rows]: any = await queryPublic(
            `SELECT COALESCE(two_factor_enabled, FALSE) as two_factor_enabled
             FROM \`public\`.saas_admins
             WHERE id = ?
             LIMIT 1`,
            [req.user.userId],
        );
        const row = rows?.[0];
        if (!row) return res.status(404).json({ error: 'Bayi kaydı bulunamadı' });
        if (!row.two_factor_enabled) {
            return res.status(400).json({ error: 'Önce 2FA etkinleştirilmeli' });
        }
        const codes = generateBackupCodes(8);
        await queryPublic(
            `UPDATE \`public\`.saas_admins
             SET two_factor_backup_codes = ?
             WHERE id = ?`,
            [JSON.stringify(codes), req.user.userId],
        );
        res.json({
            message: 'Backup kodlar yenilendi',
            codes,
        });
    } catch {
        res.status(500).json({ error: 'Backup kodlar yenilenemedi' });
    }
};

// --- Subscription & License Management (New) ---

/** PostgreSQL: system_settings üzerindeki SaaS paneli ek alanları (Prisma dışı) */
async function ensureSystemSettingsExtraColumnsPg(): Promise<void> {
    const stmts = [
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS tse_enabled SMALLINT DEFAULT 0`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS fiscal_provider VARCHAR(50) DEFAULT 'fiskaly'`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS tse_api_url VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS tse_api_key VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS tse_client_id VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS last_export_at TIMESTAMPTZ`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS compliance_mode VARCHAR(50) DEFAULT 'standard'`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS iyzico_api_key VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS iyzico_secret_key VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS paytr_merchant_id VARCHAR(100)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS paytr_merchant_key VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS paytr_merchant_salt VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS stripe_public_key VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS stripe_secret_key VARCHAR(255)`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS active_gateway VARCHAR(50) DEFAULT 'iyzico'`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS audit_retention_days INTEGER DEFAULT 90`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS reseller_bank_accounts_json TEXT`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS virtual_pos_test_mode SMALLINT DEFAULT 0`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS digital_receipt_enabled SMALLINT DEFAULT 0`,
        `ALTER TABLE \`public\`.system_settings ADD COLUMN IF NOT EXISTS archive_retention_years INTEGER DEFAULT 10`,
    ];
    for (const sql of stmts) {
        try {
            await queryPublic(sql);
        } catch (e) {
            console.warn('[system_settings] ensure column skipped:', e);
        }
    }
}

export const getSystemSettingsHandler = async (req: Request, res: Response) => {
    try {
        await migrateBillingTables();
        await ensureSystemSettingsExtraColumnsPg();
        // Sistem ayarları tablosu yoksa varsayılan dön
        const [rowList]: any = await queryPublic('SELECT * FROM `public`.system_settings LIMIT 1');
        const rows = Array.isArray(rowList) ? rowList : [];

        const defaultSettings: Record<string, unknown> = {
            id: 1,
            currency: 'EUR',
            base_subscription_fee: 500,
            monthly_license_fee: 50,
            trial_days: 14,
            audit_retention_days: 90,
            digital_receipt_enabled: 0,
            archive_retention_years: 10,
            iyzico_api_key: '',
            iyzico_secret_key: '',
            paytr_merchant_id: '',
            paytr_merchant_key: '',
            paytr_merchant_salt: '',
            stripe_public_key: '',
            stripe_secret_key: '',
            active_gateway: 'none',
            virtual_pos_test_mode: 0,
            reseller_bank_accounts: [] as unknown[],
        };

        if (rows.length === 0) {
            try {
                await queryPublic(`
                    INSERT INTO \`public\`.system_settings 
                    (id, currency, base_subscription_fee, monthly_license_fee, trial_days)
                    VALUES (1, 'EUR', 500, 50, 14)
                `);
            } catch {}
            return res.json(defaultSettings);
        }

        const merged = { ...defaultSettings, ...rows[0] } as Record<string, unknown>;
        let bankAccounts: unknown[] = [];
        try {
            const raw = merged.reseller_bank_accounts_json ?? merged.reseller_bank_accounts;
            if (typeof raw === 'string') {
                bankAccounts = JSON.parse(raw || '[]');
            } else if (Array.isArray(raw)) {
                bankAccounts = raw;
            }
        } catch {
            bankAccounts = [];
        }
        merged.reseller_bank_accounts = Array.isArray(bankAccounts) ? bankAccounts : [];

        if (req.user?.role === 'reseller') {
            const rawTm = merged.virtual_pos_test_mode;
            const virtual_pos_test_mode =
                rawTm === true || rawTm === 1 || rawTm === '1' || String(rawTm).toLowerCase() === 'true' ? 1 : 0;
            const safe: Record<string, unknown> = {
                currency: merged.currency,
                active_gateway: merged.active_gateway,
                stripe_public_key: merged.stripe_public_key,
                virtual_pos_test_mode,
                reseller_bank_accounts: merged.reseller_bank_accounts,
            };
            return res.json(safe);
        }

        delete merged.reseller_bank_accounts_json;
        merged.reseller_bank_accounts = bankAccounts;
        res.json(merged);
    } catch (error) {
        res.json({ currency: 'EUR', base_subscription_fee: 500, monthly_license_fee: 50, reseller_bank_accounts: [] });
    }
};

export const updateSystemSettingsHandler = async (req: Request, res: Response) => {
    try {
        const {
            base_subscription_fee,
            monthly_license_fee,
            currency,
            audit_retention_days,
            tse_enabled,
            fiscal_provider,
            tse_api_url,
            tse_api_key,
            tse_client_id,
            compliance_mode,
        } = req.body;

        await ensureSystemSettingsExtraColumnsPg();

        const [curRows]: any = await queryPublic('SELECT * FROM `public`.system_settings WHERE id = 1 LIMIT 1');
        const cur = Array.isArray(curRows) && curRows[0] ? curRows[0] : {};

        const n = (v: unknown, fallback: number) => {
            const x = Number(v);
            return Number.isFinite(x) ? x : fallback;
        };
        const baseFee = n(base_subscription_fee, n(cur.base_subscription_fee, 500));
        const monthlyFee = n(monthly_license_fee, n(cur.monthly_license_fee, 50));
        const retentionDays = Number.isFinite(Number(audit_retention_days))
            ? Math.max(1, Math.min(3650, Number(audit_retention_days)))
            : n(cur.audit_retention_days, 90);

        const vptmRaw = req.body.virtual_pos_test_mode;
        const virtual_pos_test_mode_param =
            vptmRaw === undefined || vptmRaw === null
                ? null
                : vptmRaw === true || vptmRaw === 1 || vptmRaw === '1'
                  ? 1
                  : 0;

        const bankAccountsPayload = Array.isArray(req.body.reseller_bank_accounts)
            ? req.body.reseller_bank_accounts
            : null;
        const reseller_bank_accounts_json =
            bankAccountsPayload != null
                ? JSON.stringify(bankAccountsPayload)
                : typeof req.body.reseller_bank_accounts_json === 'string'
                  ? req.body.reseller_bank_accounts_json
                  : undefined;

        const pickStr = (fromBody: unknown, fromRow: unknown, empty = '') =>
            fromBody !== undefined && fromBody !== null
                ? String(fromBody)
                : fromRow !== undefined && fromRow !== null
                  ? String(fromRow)
                  : empty;

        await queryPublic(
            `
            UPDATE \`public\`.system_settings 
            SET base_subscription_fee = ?, 
                monthly_license_fee = ?, 
                currency = ?,
                tse_enabled = ?,
                fiscal_provider = ?,
                tse_api_url = ?,
                tse_api_key = ?,
                tse_client_id = ?,
                compliance_mode = ?,
                iyzico_api_key = ?,
                iyzico_secret_key = ?,
                paytr_merchant_id = ?,
                paytr_merchant_key = ?,
                paytr_merchant_salt = ?,
                stripe_public_key = ?,
                stripe_secret_key = ?,
                active_gateway = ?,
                audit_retention_days = ?,
                virtual_pos_test_mode = COALESCE(?, virtual_pos_test_mode),
                reseller_bank_accounts_json = COALESCE(?, reseller_bank_accounts_json)
            WHERE id = 1
        `,
            [
                baseFee,
                monthlyFee,
                (currency != null && String(currency).trim()) || String(cur.currency || 'EUR'),
                tse_enabled === undefined || tse_enabled === null
                    ? Number(cur.tse_enabled) === 1
                        ? 1
                        : 0
                    : tse_enabled
                      ? 1
                      : 0,
                (fiscal_provider != null && String(fiscal_provider).trim()) ||
                    String(cur.fiscal_provider || 'fiskaly'),
                pickStr(tse_api_url, cur.tse_api_url),
                pickStr(tse_api_key, cur.tse_api_key),
                pickStr(tse_client_id, cur.tse_client_id),
                (compliance_mode != null && String(compliance_mode).trim()) ||
                    String(cur.compliance_mode || 'standard'),
                pickStr(req.body.iyzico_api_key, cur.iyzico_api_key),
                pickStr(req.body.iyzico_secret_key, cur.iyzico_secret_key),
                pickStr(req.body.paytr_merchant_id, cur.paytr_merchant_id),
                pickStr(req.body.paytr_merchant_key, cur.paytr_merchant_key),
                pickStr(req.body.paytr_merchant_salt, cur.paytr_merchant_salt),
                pickStr(req.body.stripe_public_key, cur.stripe_public_key),
                pickStr(req.body.stripe_secret_key, cur.stripe_secret_key),
                (req.body.active_gateway != null && String(req.body.active_gateway).trim()) ||
                    String(cur.active_gateway || 'iyzico'),
                retentionDays,
                virtual_pos_test_mode_param,
                reseller_bank_accounts_json ?? null,
            ]
        );

        if (audit_retention_days !== undefined && audit_retention_days !== null) {
            await runAuditRetentionCleanup();
        }

        res.json({ message: 'Sistem ayarları ve mali uyum parametreleri başarıyla güncellendi' });
    } catch (error: any) {
        console.error('❌ Settings update error:', error);
        const detail = error?.message || String(error);
        res.status(500).json({ error: 'Ayarlar güncellenemedi', detail });
    }
};
