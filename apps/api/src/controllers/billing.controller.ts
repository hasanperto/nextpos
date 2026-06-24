import { Request, Response } from 'express';
import { z } from 'zod';
import {
    calculateQuote,
    getReactivationQuote,
    advanceBillingAfterPayment,
    migrateBillingTables,
    ensurePlanModuleRulesRows,
    getPlanModuleMatrix,
    getTenantEntitlements,
    putPlanModuleRulesBulk,
    purchaseAddonModulesForTenant,
    getBillingModulesAdminRows,
    insertBillingModuleRow,
    updateBillingModuleRow,
    removeBillingModuleRow,
    getTenantBillingStatus,
    formatPgDateOnly,
    payTenantInvoiceWithWallet,
} from '../services/billing.service.js';
import { queryPublic } from '../lib/db.js';
import { getQrWebDomainInfo, provisionQrWebSubdomain } from '../services/qrWebProvisioning.service.js';

const quoteSchema = z.object({
    planCode: z.string(),
    moduleCodes: z.array(z.string()).optional().default([]),
    extraDeviceQty: z.number().optional(),
    extraPrinterQty: z.number().optional(),
    billingCycle: z.enum(['monthly', 'yearly']),
    annualDiscountPercent: z.number().optional(),
});

export async function getBillingModulesHandler(_req: Request, res: Response) {
    try {
        await migrateBillingTables();
        await ensurePlanModuleRulesRows();
        const [rows]: any = await queryPublic(
            'SELECT code, name, description, category, setup_price, monthly_price, sort_order FROM `public`.billing_modules WHERE is_active = true ORDER BY sort_order'
        );
        res.json(rows || []);
    } catch (error: any) {
        console.error('getBillingModules:', error);
        res.status(500).json({ error: 'Modül listesi alınamadı' });
    }
}

export async function getBillingModulesAdminHandler(_req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const rows = await getBillingModulesAdminRows();
        res.json(rows);
    } catch (error: any) {
        console.error('getBillingModulesAdmin:', error);
        const dev = process.env.NODE_ENV !== 'production';
        res.status(500).json({
            error: 'Modül listesi alınamadı',
            ...(dev && error?.message ? { detail: String(error.message) } : {}),
        });
    }
}

const billingModuleCreateSchema = z.object({
    code: z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9_]+$/),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional().nullable(),
    category: z.enum(['core', 'feature', 'channel', 'device', 'service', 'integration']),
    setup_price: z.number().min(0),
    monthly_price: z.number().min(0),
    icon: z.string().max(50).optional().nullable(),
    sort_order: z.number().int().optional(),
});

const billingModulePatchSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional().nullable(),
    category: z.enum(['core', 'feature', 'channel', 'device', 'service', 'integration']).optional(),
    setup_price: z.number().min(0).optional(),
    monthly_price: z.number().min(0).optional(),
    icon: z.string().max(50).optional().nullable(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
});

export async function postBillingModuleHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const body = billingModuleCreateSchema.parse(req.body);
        await insertBillingModuleRow(body);
        res.status(201).json({ ok: true, message: 'Modül oluşturuldu', code: body.code });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
            return res.status(409).json({ error: 'Bu kod zaten kullanılıyor' });
        }
        console.error('postBillingModule:', error);
        res.status(500).json({ error: 'Modül oluşturulamadı' });
    }
}

export async function patchBillingModuleHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const code = paramId(req.params.code);
        if (!code) return res.status(400).json({ error: 'code gerekli' });
        const body = billingModulePatchSchema.parse(req.body);
        await updateBillingModuleRow(code, body);
        res.json({ ok: true, message: 'Modül güncellendi' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('patchBillingModule:', error);
        res.status(500).json({ error: 'Modül güncellenemedi' });
    }
}

export async function deleteBillingModuleHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const code = paramId(req.params.code);
        if (!code) return res.status(400).json({ error: 'code gerekli' });
        const hard = req.query.hard === '1' || req.query.hard === 'true';
        await removeBillingModuleRow(code, hard);
        res.json({ ok: true, message: hard ? 'Modül kalıcı silindi' : 'Modül pasifleştirildi' });
    } catch (error: any) {
        console.error('deleteBillingModule:', error);
        res.status(500).json({ error: 'Modül silinemedi' });
    }
}

export async function postQuoteHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const data = quoteSchema.parse(req.body);
        const quote = await calculateQuote({
            planCode: data.planCode,
            moduleCodes: data.moduleCodes || [],
            extraDeviceQty: data.extraDeviceQty,
            extraPrinterQty: data.extraPrinterQty,
            billingCycle: data.billingCycle,
            annualDiscountPercent: data.annualDiscountPercent,
        });
        const out: Record<string, unknown> = { ...quote };
        if (req.user?.role === 'reseller' && req.user?.isSaaSAdmin) {
            const [settingsRows]: any = await queryPublic('SELECT * FROM `public`.system_settings LIMIT 1');
            const s = settingsRows?.[0] || {
                reseller_setup_rate: 75,
                reseller_monthly_rate: 50,
                annual_discount_rate: 15,
            };
            const setupTotal = quote.setupFee + quote.modulesSetup;
            const resellerSetupPart = setupTotal * (Number(s.reseller_setup_rate) / 100);
            const resellerServicePart =
                data.billingCycle === 'yearly'
                    ? quote.yearlyPrepayTotal * (Number(s.reseller_monthly_rate) / 100)
                    : quote.monthlyRecurringTotal * (Number(s.reseller_monthly_rate) / 100);
            const totalResellerCommission = resellerSetupPart + resellerServicePart;
            const walletNetDelta = totalResellerCommission - quote.firstInvoiceTotal;
            out.resellerDirectSale = { totalResellerCommission, walletNetDelta };
        }
        res.json(out);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        res.status(400).json({ error: error.message || 'Teklif hesaplanamadı' });
    }
}

const recordPaymentSchema = z.object({
    billingCycle: z.enum(['monthly', 'yearly']).optional(),
    amount: z.number().optional(),
    description: z.string().optional(),
});

function paramId(p: string | string[] | undefined): string {
    if (Array.isArray(p)) return p[0] ?? '';
    return p ?? '';
}

export async function postRecordPaymentHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = paramId(req.params.tenantId);
        const body = recordPaymentSchema.parse(req.body);
        // Ödeme yapmadan önce mevcut due date'i yakalayalım (cron pending subscription kaydını bu due date ile bulacağız).
        const [tb]: any = await queryPublic(
            'SELECT billing_cycle, next_payment_due, monthly_recurring_total, yearly_prepay_total FROM `public`.tenant_billing WHERE trim(tenant_id::text) = ?',
            [tenantId]
        );
        const cycle = body.billingCycle || tb?.[0]?.billing_cycle || 'monthly';
        const dueDate = formatPgDateOnly(tb?.[0]?.next_payment_due);
        await advanceBillingAfterPayment(tenantId, cycle);

        if (dueDate) {
            // Pending subscription kaydı varsa paid işaretle.
            const [upd]: any = await queryPublic(
                `UPDATE \`public\`.payment_history
                 SET status = 'paid', paid_at = NOW()
                 WHERE tenant_id = ? AND payment_type = 'subscription' AND status = 'pending' AND due_date = ?`,
                [tenantId, dueDate]
            );
            const affectedRows = Number(upd?.affectedRows ?? 0);

            // Pending bulunamazsa (eskiden oluşturulmuşsa) paid kayıt ekleyelim.
            if (affectedRows === 0 && body.amount != null) {
                await queryPublic(
                    `INSERT INTO \`public\`.payment_history
                     (tenant_id, amount, currency, payment_type, payment_method, description, status, due_date, paid_at, created_by)
                     VALUES (?, ?, 'EUR', 'subscription', 'bank_transfer', ?, 'paid', ?, NOW(), ?)`,
                    [tenantId, body.amount, body.description || 'Abonelik ödemesi', dueDate, 'system']
                );
            }
        } else if (body.amount != null) {
            await queryPublic(
                `INSERT INTO \`public\`.payment_history
                 (tenant_id, amount, currency, payment_type, payment_method, description, status, created_by)
                 VALUES (?, ?, 'EUR', 'subscription', 'bank_transfer', ?, 'paid', ?)`,
                [tenantId, body.amount, body.description || 'Abonelik ödemesi', 'system']
            );
        }

        try {
            const [lastPh]: any = await queryPublic(
                `SELECT ph.*, t.name as tenant_name
                 FROM \`public\`.payment_history ph
                 LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
                 WHERE ph.tenant_id = ? AND ph.status = 'paid' AND ph.invoice_number IS NOT NULL
                 ORDER BY ph.paid_at DESC NULLS LAST LIMIT 1`,
                [tenantId]
            );
            const lp = lastPh?.[0];
            if (lp?.invoice_number) {
                const { createInvoiceFromPaidPayment } = await import('../controllers/saas-advanced.controller.js');
                await createInvoiceFromPaidPayment(lp, lp.invoice_number);
            }
        } catch {}

        res.json({ ok: true, message: 'Ödeme kaydedildi, vade ilerletildi' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('postRecordPayment:', error);
        res.status(500).json({ error: 'Ödeme kaydı başarısız' });
    }
}

export async function getPlanModuleMatrixHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        await ensurePlanModuleRulesRows();
        const planCode = paramId(req.params.planCode);
        if (!planCode) {
            return res.status(400).json({ error: 'planCode gerekli' });
        }
        const matrix = await getPlanModuleMatrix(planCode);
        res.json({ planCode, modules: matrix });
    } catch (error: any) {
        console.error('getPlanModuleMatrix:', error);
        res.status(500).json({ error: 'Plan modül matrisi alınamadı' });
    }
}

const planRulesPutSchema = z.object({
    rules: z.record(z.string(), z.enum(['included', 'addon', 'locked'])),
});

export async function putPlanModuleRulesHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const planCode = paramId(req.params.planCode);
        if (!planCode) {
            return res.status(400).json({ error: 'planCode gerekli' });
        }
        const body = planRulesPutSchema.parse(req.body);
        await putPlanModuleRulesBulk(planCode, body.rules);
        const matrix = await getPlanModuleMatrix(planCode);
        res.json({ ok: true, planCode, modules: matrix });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('putPlanModuleRules:', error);
        res.status(400).json({ error: error.message || 'Kayıt başarısız' });
    }
}

const tenantAddonsSchema = z.object({
    module_codes: z.array(z.string()).min(1),
    extra_device_qty: z.number().min(1).optional(),
    extra_printer_qty: z.number().min(1).optional(),
    /** SaaS panel: ek modül satışı için ödeme yöntemi (payment_history + tahsilat) */
    payment_method: z.enum(['wallet_balance', 'bank_transfer', 'admin_card', 'cash']),
});

export async function postTenantAddonsHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = paramId(req.params.tenantId);
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }
        if (req.user?.role === 'reseller') {
            const [rows]: any = await queryPublic(
                `SELECT 1 FROM \`public\`.tenants WHERE trim(id::text) = trim(?) AND reseller_id = ? LIMIT 1`,
                [tenantId, req.user.userId]
            );
            if (!rows?.length) {
                return res.status(403).json({ error: 'Bu restorana modül ekleme yetkiniz yok' });
            }
        }
        const body = tenantAddonsSchema.parse(req.body);
        const result = await purchaseAddonModulesForTenant(
            tenantId,
            body.module_codes,
            body.extra_device_qty,
            body.payment_method,
            req.user?.username || 'saas_admin',
            body.extra_printer_qty
        );
        res.json({ ok: true, ...result });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('postTenantAddons:', error);
        res.status(400).json({ error: error.message || 'Modül eklenemedi' });
    }
}

export async function getTenantEntitlementsHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = paramId(req.params.tenantId);
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }
        if (req.user?.role === 'reseller') {
            const [rows]: any = await queryPublic(
                `SELECT 1 FROM \`public\`.tenants WHERE trim(id::text) = trim(?) AND reseller_id = ? LIMIT 1`,
                [tenantId, req.user.userId]
            );
            if (!rows?.length) {
                return res.status(403).json({ error: 'Bu restoranın modül bilgisine erişim yetkiniz yok' });
            }
        }
        const { entitlements, billingSnapshot } = await getTenantEntitlements(tenantId);
        res.json({ tenantId, entitlements, billingSnapshot });
    } catch (error: any) {
        console.error('getTenantEntitlements:', error);
        res.status(500).json({ error: 'Yetkiler alınamadı' });
    }
}

export async function getReactivationQuoteHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = paramId(req.params.tenantId);
        const result = await getReactivationQuote(tenantId);
        if (!result.ok) {
            return res.status(404).json(result);
        }
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Teklif alınamadı' });
    }
}
export async function getTenantBillingStatusHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = req.tenantId || paramId(req.params.tenantId);
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }
        const status = await getTenantBillingStatus(tenantId);
        res.json(status);
    } catch (error: any) {
        console.error('getTenantBillingStatus:', error);
        res.status(500).json({ error: 'Ödeme durumu alınamadı' });
    }
}

/** SaaS: kiracının QR Web alt domain kayıtları + modül durumu */
export async function getTenantQrWebDomainHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = paramId(req.params.tenantId);
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }
        const info = await getQrWebDomainInfo(tenantId);
        res.json({ tenantId, ...info });
    } catch (error: any) {
        console.error('getTenantQrWebDomain:', error);
        res.status(500).json({ error: error.message || 'QR domain bilgisi alınamadı' });
    }
}

/** SaaS: `qr_web_menu` aktifse tenant_qr_domains satırı oluşturur (QR_WEB_PARENT_DOMAIN gerekli) */
export async function postTenantQrWebDomainProvisionHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const tenantId = paramId(req.params.tenantId);
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }
        const result = await provisionQrWebSubdomain(tenantId);
        res.json({ tenantId, ...result });
    } catch (error: any) {
        console.error('postTenantQrWebDomainProvision:', error);
        res.status(400).json({ error: error.message || 'Provizyon başarısız' });
    }
}

export async function postCheckoutLinkHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const paymentHistoryId = Number(req.params.paymentHistoryId);
        if (isNaN(paymentHistoryId)) {
            return res.status(400).json({ error: 'Geçersiz fatura ID' });
        }

        // Faturayı çek
        const [rows]: any = await queryPublic(
            'SELECT * FROM `public`.payment_history WHERE id = ?',
            [paymentHistoryId]
        );
        const invoice = rows?.[0];
        if (!invoice) {
            return res.status(404).json({ error: 'Fatura bulunamadı' });
        }
        if (invoice.status === 'paid') {
            return res.status(400).json({ error: 'Bu fatura zaten ödenmiş' });
        }

        // Tenant çöz
        const tenantId = invoice.tenant_id || invoice.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'Faturada tenantId bilgisi eksik' });
        }

        const [tenants]: any = await queryPublic(
            'SELECT name, contact_email FROM `public`.tenants WHERE id::text = ?',
            [tenantId]
        );
        const tenant = tenants?.[0] || { name: 'NextPOS Müşterisi' };

        const { GatewayService } = await import('../services/gateway.service.js');
        const session = await GatewayService.createSession({
            tenantId,
            amount: Number(invoice.amount),
            currency: invoice.currency || 'EUR',
            description: invoice.description || `Abonelik Ödemesi (Fatura: #${invoice.id})`,
            email: tenant.contact_email || undefined,
            callbackUrl: `http://localhost:3001/api/v1/billing/checkout/callback?paymentHistoryId=${paymentHistoryId}`,
            items: [
                {
                    id: `inv_${paymentHistoryId}`,
                    name: invoice.description || 'Abonelik Servis Ücreti',
                    price: Number(invoice.amount),
                    quantity: 1
                }
            ]
        });

        res.json({ ok: true, paymentUrl: session.paymentUrl, gateway: session.gateway });
    } catch (error: any) {
        console.error('postCheckoutLink:', error);
        res.status(500).json({ error: error.message || 'Ödeme linki oluşturulamadı' });
    }
}

export async function getCheckoutCallbackHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const paymentHistoryId = Number(req.query.paymentHistoryId);
        if (isNaN(paymentHistoryId)) {
            return res.status(400).send('Geçersiz ödeme parametreleri');
        }

        // Faturayı doğrula
        const [rows]: any = await queryPublic(
            'SELECT * FROM `public`.payment_history WHERE id = ?',
            [paymentHistoryId]
        );
        const invoice = rows?.[0];
        if (!invoice) {
            return res.status(404).send('Ödeme kaydı bulunamadı');
        }

        if (invoice.status !== 'paid') {
            const tenantId = invoice.tenant_id || invoice.tenantId;
            if (invoice.payment_type === 'wallet_deposit') {
                await depositTenantWallet(
                    tenantId,
                    Number(invoice.amount),
                    invoice.payment_method || 'credit_card',
                    invoice.description || 'Cüzdan Bakiye Yükleme',
                    String(paymentHistoryId),
                    paymentHistoryId
                );
            } else {
                // 1. Vadeyi ilerlet ve restoranı aktife çek
                const [tb]: any = await queryPublic(
                    'SELECT billing_cycle FROM `public`.tenant_billing WHERE trim(tenant_id::text) = ?',
                    [tenantId]
                );
                const cycle = tb?.[0]?.billing_cycle || 'monthly';
                await advanceBillingAfterPayment(tenantId, cycle);

                // 2. Faturayı güncelle
                await queryPublic(
                    "UPDATE `public`.payment_history SET status = 'paid', paid_at = NOW() WHERE id = ?",
                    [paymentHistoryId]
                );
            }
            
            try {
                const [lastPh]: any = await queryPublic(
                    `SELECT ph.*, t.name as tenant_name
                     FROM \`public\`.payment_history ph
                     LEFT JOIN \`public\`.tenants t ON trim(ph.tenant_id::text) = t.id::text
                     WHERE ph.id = ?`,
                    [paymentHistoryId]
                );
                const lp = lastPh?.[0];
                if (lp?.invoice_number) {
                    const { createInvoiceFromPaidPayment } = await import('../controllers/saas-advanced.controller.js');
                    await createInvoiceFromPaidPayment(lp, lp.invoice_number);
                }
            } catch {}
        }

        // Kullanıcıyı frontend POS ekranına başarıyla yönlendir
        res.redirect(`http://localhost:5173/cashier?payment=success&id=${paymentHistoryId}`);
    } catch (error: any) {
        console.error('getCheckoutCallback:', error);
        res.redirect(`http://localhost:5173/cashier?payment=error&message=${encodeURIComponent(error.message || 'odeme_hatasi')}`);
    }
}

export async function postPayWithResellerWalletHandler(req: Request, res: Response) {
    try {
        await migrateBillingTables();
        const paymentHistoryId = Number(req.params.paymentHistoryId);
        if (isNaN(paymentHistoryId)) {
            return res.status(400).json({ error: 'Geçersiz fatura ID' });
        }

        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Bu işlem yalnızca bayiler tarafından yapılabilir' });
        }
        const resellerId = req.user.userId;

        // Faturayı doğrula
        const [rows]: any = await queryPublic(
            'SELECT * FROM `public`.payment_history WHERE id = ?',
            [paymentHistoryId]
        );
        const invoice = rows?.[0];
        if (!invoice) {
            return res.status(404).json({ error: 'Fatura bulunamadı' });
        }
        if (invoice.status === 'paid') {
            return res.status(400).json({ error: 'Bu fatura zaten ödenmiş' });
        }

        const tenantId = invoice.tenant_id || invoice.tenantId;
        // Tenant'ın bu bayiye ait olduğunu doğrula
        const [tenants]: any = await queryPublic(
            'SELECT name, reseller_id FROM `public`.tenants WHERE id::text = ?',
            [tenantId]
        );
        const tenant = tenants?.[0];
        if (!tenant) {
            return res.status(404).json({ error: 'Restoran bulunamadı' });
        }
        if (tenant.reseller_id !== resellerId) {
            return res.status(403).json({ error: 'Bu restoranın faturasını ödeme yetkiniz yok' });
        }

        // Bayi cüzdan bakiyesini kontrol et
        const [resellers]: any = await queryPublic(
            'SELECT wallet_balance FROM `public`.saas_admins WHERE id = ?',
            [resellerId]
        );
        const reseller = resellers?.[0];
        if (!reseller) {
            return res.status(404).json({ error: 'Bayi kaydı bulunamadı' });
        }

        const cost = Number(invoice.amount);
        const balance = Number(reseller.wallet_balance || 0);
        if (balance < cost) {
            return res.status(400).json({ 
                error: 'Cüzdan bakiyesi yetersiz', 
                detail: `Fatura tutarı ${cost.toFixed(2)} €, mevcut bakiyeniz ${balance.toFixed(2)} €.` 
            });
        }

        // Cüzdandan düşüp faturayı paid yapalım ve vadeyi uzatalım
        const [tb]: any = await queryPublic(
            'SELECT billing_cycle FROM `public`.tenant_billing WHERE trim(tenant_id::text) = ?',
            [tenantId]
        );
        const cycle = tb?.[0]?.billing_cycle || 'monthly';

        // Veritabanı transaction işlemi
        const pool = (await import('../lib/db.js')).default;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Bayi bakiyesini düş
            await client.query(
                'UPDATE saas_admins SET wallet_balance = wallet_balance - $1::numeric WHERE id = $2',
                [cost, resellerId]
            );

            // 2. Faturayı paid işaretle
            await client.query(
                "UPDATE payment_history SET status = 'paid', paid_at = NOW(), payment_method = 'wallet_balance', created_by = $1 WHERE id = $2",
                [req.user.username || 'reseller', paymentHistoryId]
            );

            // 3. Vadeyi ilerlet
            await advanceBillingAfterPayment(tenantId, cycle);

            await client.query('COMMIT');
        } catch (trxErr) {
            await client.query('ROLLBACK');
            throw trxErr;
        } finally {
            client.release();
        }

        res.json({ ok: true, message: 'Ödeme bayi cüzdanı ile başarıyla tamamlandı' });
    } catch (error: any) {
        console.error('postPayWithResellerWallet:', error);
        res.status(500).json({ error: error.message || 'Cüzdanla ödeme işlemi başarısız' });
    }
}

/**
 * 💳 NextPOS B2B FinTech & Prepaid Tenant Wallet Controllers
 */

import {
    depositTenantWallet,
    processTenantWalletCharge,
    transferResellerWalletToTenant
} from '../services/billing.service.js';

// Cüzdan hareket loglarını çek
export async function getTenantWalletTransactionsHandler(req: Request, res: Response) {
    try {
        const tenantId = req.params.tenantId || req.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'tenantId gerekli' });

        const [rows]: any = await queryPublic(
            'SELECT id, amount, balance_before as "balanceBefore", balance_after as "balanceAfter", type, description, reference_id as "referenceId", created_at as "createdAt" FROM `public`.tenant_wallet_transactions WHERE trim(tenant_id::text) = ? ORDER BY created_at DESC',
            [tenantId]
        );
        res.json(rows || []);
    } catch (error: any) {
        console.error('getTenantWalletTransactions:', error);
        res.status(500).json({ error: 'Cüzdan hareketleri alınamadı' });
    }
}

const depositWalletSchema = z.object({
    amount: z.number().min(1),
    paymentMethod: z.enum(['credit_card', 'bank_transfer']),
    description: z.string().min(3),
    isDirectSimulated: z.boolean().optional(),
});

export async function postDepositTenantWalletHandler(req: Request, res: Response) {
    try {
        const tenantId = paramId(req.params.tenantId);
        const body = depositWalletSchema.parse(req.body);

        if (body.paymentMethod === 'credit_card' && !body.isDirectSimulated) {
            const [payHistResult]: any = await queryPublic(`
                INSERT INTO \`public\`.payment_history
                (tenant_id, amount, currency, payment_type, payment_method, description, status, created_by)
                VALUES (?, ?, 'EUR', 'wallet_deposit', ?, ?, 'pending', ?)
                RETURNING id
            `, [tenantId, body.amount, body.paymentMethod, body.description || 'Cüzdan Bakiye Yükleme', req.user?.username || 'system']);

            const paymentHistoryId = payHistResult?.insertId;
            if (!paymentHistoryId) {
                throw new Error('Ödeme kaydı oluşturulamadı.');
            }

            const [tenants]: any = await queryPublic(
                'SELECT contact_email FROM `public`.tenants WHERE id::text = ?',
                [tenantId]
            );
            const tenant = tenants?.[0] || {};

            const { GatewayService } = await import('../services/gateway.service.js');
            const apiBase = String(process.env.API_PUBLIC_URL || process.env.PUBLIC_API_URL || '')
                .trim()
                .replace(/\/$/, '') || `http://127.0.0.1:${process.env.PORT || '3101'}`;
            const session = await GatewayService.createSession({
                tenantId: String(tenantId),
                amount: Number(body.amount),
                currency: 'EUR',
                description: body.description || `Cüzdan Bakiye Yükleme (Fatura: #${paymentHistoryId})`,
                email: tenant.contact_email || undefined,
                callbackUrl: `${apiBase}/api/v1/billing/checkout/callback?paymentHistoryId=${paymentHistoryId}`,
                items: [
                    {
                        id: `dep_${paymentHistoryId}`,
                        name: body.description || 'Cüzdan Bakiye Yükleme',
                        price: Number(body.amount),
                        quantity: 1
                    }
                ]
            });

            return res.json({
                ok: true,
                requiresPayment: true,
                paymentUrl: session.paymentUrl,
                gateway: session.gateway,
                paymentHistoryId
            });
        }

        if (body.paymentMethod === 'bank_transfer') {
            const [payHistResult]: any = await queryPublic(`
                INSERT INTO \`public\`.payment_history
                (tenant_id, amount, currency, payment_type, payment_method, description, status, created_by)
                VALUES (?, ?, 'EUR', 'wallet_deposit', ?, ?, 'pending', ?)
                RETURNING id
            `, [tenantId, body.amount, body.paymentMethod, body.description || 'Cüzdan Bakiye Yükleme', req.user?.username || 'system']);

            const paymentHistoryId = payHistResult?.insertId;

            return res.json({
                ok: true,
                requiresPayment: false,
                status: 'pending',
                paymentHistoryId,
                message: 'Havale/EFT talebiniz oluşturuldu. Lütfen banka hesabımıza transfer yaparken açıklama kısmına faturanın açıklamasını veya kodunu yazınız.'
            });
        }

        const result = await depositTenantWallet(
            tenantId,
            body.amount,
            body.paymentMethod,
            body.description,
            req.user?.username || 'system'
        );

        res.json({ ok: true, ...result });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('postDepositTenantWallet:', error);
        res.status(500).json({ error: error.message || 'Bakiye yükleme işlemi başarısız' });
    }
}

// Cüzdandan harcama düş (Super Admin)
const chargeWalletSchema = z.object({
    amount: z.number().min(0.01),
    chargeType: z.enum(['plan_charge', 'module_charge', 'setup_charge']),
    description: z.string().min(3),
});

export async function postTenantWalletChargeHandler(req: Request, res: Response) {
    try {
        const tenantId = paramId(req.params.tenantId);
        const body = chargeWalletSchema.parse(req.body);

        const result = await processTenantWalletCharge(
            tenantId,
            body.amount,
            body.chargeType,
            body.description
        );

        res.json({ ok: true, ...result });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('postTenantWalletCharge:', error);
        res.status(500).json({ error: error.message || 'Cüzdandan tahsilat başarısız' });
    }
}

// Bayi cüzdanından restoran cüzdanına transfer yap
const transferWalletSchema = z.object({
    tenantId: z.string().uuid(),
    amount: z.number().min(1),
    description: z.string().min(3),
});

export async function postTransferResellerWalletToTenantHandler(req: Request, res: Response) {
    try {
        if (req.user?.role !== 'reseller') {
            return res.status(403).json({ error: 'Bu işlem yalnızca bayiler tarafından yapılabilir' });
        }
        const resellerId = req.user.userId;
        const body = transferWalletSchema.parse(req.body);

        // Restoranın bu bayiye bağlı olduğunu doğrula
        const [rows]: any = await queryPublic(
            'SELECT 1 FROM `public`.tenants WHERE id::text = ? AND reseller_id = ? LIMIT 1',
            [body.tenantId, resellerId]
        );
        if (!rows?.length) {
            return res.status(403).json({ error: 'Bu restorana bakiye aktarma yetkiniz yok' });
        }

        const result = await transferResellerWalletToTenant(
            Number(resellerId),
            body.tenantId,
            body.amount,
            body.description
        );

        res.json({ ok: true, ...result });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('postTransferResellerWalletToTenant:', error);
        res.status(500).json({ error: error.message || 'Bakiye aktarımı başarısız' });
    }
}

// Modül satın al (Otomatik cüzdan tahsilatı)
export async function postPurchaseModuleHandler(req: Request, res: Response) {
    try {
        const tenantId = paramId(req.params.tenantId);
        const moduleCode = paramId(req.params.moduleCode);

        if (!tenantId || !moduleCode) {
            return res.status(400).json({ error: 'tenantId ve moduleCode gerekli' });
        }

        // Modülü bul
        const [moduleRows]: any = await queryPublic(
            'SELECT * FROM `public`.billing_modules WHERE code = ? AND is_active = true',
            [moduleCode]
        );
        const mod = moduleRows?.[0];
        if (!mod) {
            return res.status(404).json({ error: 'Modül bulunamadı veya pasif durumda.' });
        }

        const setupCost = Number(mod.setup_price || 0);
        const monthlyCost = Number(mod.monthly_price || 0);
        const totalCost = setupCost + monthlyCost;

        // Cüzdandan düş
        const billingResult = await processTenantWalletCharge(
            tenantId,
            totalCost,
            'module_charge',
            `${mod.name} Modülü Aktivasyon (Kurulum: ${setupCost.toFixed(2)} € + 1. Ay: ${monthlyCost.toFixed(2)} €)`
        );

        // Modülü kiracıya ekle
        await queryPublic(`
            INSERT INTO \`public\`.tenant_modules (tenant_id, module_code, quantity, setup_line_total, monthly_line_total, is_active)
            VALUES (?, ?, 1, ?, ?, true)
            ON CONFLICT (tenant_id, module_code)
            DO UPDATE SET is_active = true, setup_line_total = EXCLUDED.setup_line_total, monthly_line_total = EXCLUDED.monthly_line_total
        `, [tenantId, moduleCode, setupCost, monthlyCost]);

        // Kiracının aylık tekrarlayan faturasını güncelle
        await queryPublic(`
            UPDATE \`public\`.tenant_billing
            SET monthly_recurring_total = monthly_recurring_total + ?
            WHERE trim(tenant_id::text) = ?
        `, [monthlyCost, tenantId]);

        res.json({
            ok: true,
            message: `${mod.name} modülü başarıyla satın alındı ve cüzdandan tahsil edildi.`,
            wallet: billingResult
        });
    } catch (error: any) {
        console.error('postPurchaseModule:', error);
        res.status(500).json({ error: error.message || 'Modül satın alım işlemi başarısız' });
    }
}

// Toptan Paket Satın Al (6 veya 12 Aylık Lisans Kilitleme)
const purchaseBulkPlanSchema = z.object({
    planCode: z.string(),
    months: z.number().refine(n => n === 6 || n === 12, {
        message: "Yalnızca 6 aylık veya 12 aylık paketler satın alınabilir."
    })
});

import {
    purchaseBulkPlanForTenant
} from '../services/billing.service.js';

export async function postPurchaseBulkPlanHandler(req: Request, res: Response) {
    try {
        const tenantId = paramId(req.params.tenantId);
        const body = purchaseBulkPlanSchema.parse(req.body);

        const result = await purchaseBulkPlanForTenant(
            tenantId,
            body.planCode,
            body.months
        );

        res.json({
            ok: true,
            message: `${body.months} aylık toptan paket satın alımı başarıyla tamamlandı. Fiyatınız kilitlendi ve vade tarihiniz güncellendi.`,
            ...result
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('postPurchaseBulkPlan:', error);
        res.status(500).json({ error: error.message || 'Toptan paket satın alım işlemi başarısız' });
    }
}

export async function getTenantPaymentHistoryHandler(req: Request, res: Response) {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }
        const [rows]: any = await queryPublic(
            'SELECT * FROM `public`.payment_history WHERE trim(tenant_id::text) = trim(?) ORDER BY created_at DESC',
            [tenantId]
        );
        res.json(rows || []);
    } catch (error: any) {
        console.error('getTenantPaymentHistory:', error);
        res.status(500).json({ error: 'Ödeme geçmişi alınamadı' });
    }
}

export async function getBillingPlansHandler(_req: Request, res: Response) {
    try {
        const [rows]: any = await queryPublic(
            'SELECT * FROM `public`.subscription_plans WHERE is_active = true ORDER BY sort_order ASC'
        );
        res.json(rows || []);
    } catch (error: any) {
        console.error('getBillingPlans:', error);
        res.status(500).json({ error: 'Planlar alınamadı' });
    }
}

export async function postPayWithTenantWalletHandler(req: Request, res: Response) {
    try {
        const paymentHistoryId = Number(req.params.paymentHistoryId);
        if (isNaN(paymentHistoryId)) {
            return res.status(400).json({ error: 'Geçersiz fatura ID' });
        }

        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId gerekli' });
        }

        const result = await payTenantInvoiceWithWallet({
            tenantId,
            paymentHistoryId,
            createdBy: req.user?.username || 'admin',
        });

        res.json(result);
    } catch (error: any) {
        const msg = error?.message || 'Cüzdanla ödeme işlemi başarısız';
        console.error('postPayWithTenantWallet:', error);
        const clientErr =
            msg.includes('yetersiz') ||
            msg.includes('zaten ödenmiş') ||
            msg.includes('bulunamadı') ||
            msg.includes('ödenemez') ||
            msg.includes('yetkiniz');
        res.status(clientErr ? 400 : 500).json({ error: msg });
    }
}


