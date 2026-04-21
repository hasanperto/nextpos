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
        const dueDate = tb?.[0]?.next_payment_due ? String(tb[0].next_payment_due).slice(0, 10) : null;
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
