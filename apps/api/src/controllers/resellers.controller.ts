import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { runResellerCommissionRecalculation } from './saas-advanced.controller.js';
import {
    computeResellerPlanPurchaseQuote,
    createResellerPlanCardCheckout,
    appendPlanPurchaseRollback,
    cancelResellerPlanPurchase,
} from '../services/reseller-plan-card-purchase.service.js';

function mapResellerRow(r: {
    id: number;
    username: string;
    email: string | null;
    fullName: string;
    companyName: string | null;
    role: string;
    isActive: boolean;
    commissionRate: Prisma.Decimal | null;
    availableLicenses: number;
    walletBalance: Prisma.Decimal;
    taxNumber?: string | null;
    taxOffice?: string | null;
    billingAddress?: string | null;
    city?: string | null;
    district?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    mobilePhone?: string | null;
    contactPerson?: string | null;
    adminNotes?: string | null;
    resellerPlanId: number | null;
    purchasePaymentMethod: string | null;
    resellerPlan?: { name: string; price: Prisma.Decimal; licenseCount: number } | null;
    createdAt: Date;
    total_tenants: number;
}) {
    return {
        id: r.id,
        username: r.username,
        email: r.email,
        active: r.isActive ? 1 : 0,
        role: r.role,
        company_name: r.companyName,
        full_name: r.fullName,
        commission_rate: r.commissionRate != null ? Number(r.commissionRate) : null,
        available_licenses: r.availableLicenses,
        wallet_balance: Number(r.walletBalance),
        tax_number: r.taxNumber ?? null,
        tax_office: r.taxOffice ?? null,
        billing_address: r.billingAddress ?? null,
        city: r.city ?? null,
        district: r.district ?? null,
        postal_code: r.postalCode ?? null,
        country: r.country ?? null,
        phone: r.phone ?? null,
        mobile_phone: r.mobilePhone ?? null,
        contact_person: r.contactPerson ?? null,
        admin_notes: r.adminNotes ?? null,
        reseller_plan_id: r.resellerPlanId,
        purchase_payment_method: r.purchasePaymentMethod,
        reseller_plan_name: r.resellerPlan?.name ?? null,
        reseller_plan_price: r.resellerPlan != null ? Number(r.resellerPlan.price) : null,
        reseller_plan_licenses: r.resellerPlan?.licenseCount ?? null,
        created_at: r.createdAt,
        total_tenants: r.total_tenants,
    };
}

export const getResellers = async (_req: Request, res: Response) => {
    try {
        const rows = await prisma.saasAdmin.findMany({
            where: { role: 'reseller' },
            orderBy: { createdAt: 'desc' },
            include: { resellerPlan: true },
        });
        const out = await Promise.all(
            rows.map(async (r) => {
                const total_tenants = await prisma.tenant.count({ where: { resellerId: r.id } });
                return mapResellerRow({ ...r, total_tenants });
            })
        );
        res.json(out);
    } catch (error) {
        console.error('getResellers error:', error);
        res.status(500).json({ error: 'Bayiler listelenemedi' });
    }
};

/**
 * GET /resellers/:id/tenants — Bayiye bağlı restoranlar listesi
 */
export const getResellerTenants = async (req: Request, res: Response) => {
    try {
        const resellerId = Number(req.params.id);
        if (!Number.isFinite(resellerId)) {
            return res.status(400).json({ error: 'Geçersiz bayi ID' });
        }
        const tenants = await prisma.tenant.findMany({
            where: { resellerId },
            orderBy: { createdAt: 'desc' },
        });
        const out = tenants.map((t) => ({
            id: t.id,
            name: t.name,
            schema_name: t.schemaName,
            status: t.status,
            subscription_plan: t.subscriptionPlan,
            license_expires_at: t.licenseExpiresAt,
            contact_email: t.contactEmail,
            contact_phone: t.contactPhone,
            max_users: t.maxUsers,
            max_branches: t.maxBranches,
            created_at: t.createdAt,
        }));
        res.json(out);
    } catch (error) {
        console.error('getResellerTenants error:', error);
        res.status(500).json({ error: 'Bayi restoranları listelenemedi' });
    }
};

/**
 * GET /resellers/:id/payments — Bayi ödeme geçmişi
 */
export const getResellerPayments = async (req: Request, res: Response) => {
    try {
        const resellerId = Number(req.params.id);
        if (!Number.isFinite(resellerId)) {
            return res.status(400).json({ error: 'Geçersiz bayi ID' });
        }
        const payments = await prisma.paymentHistory.findMany({
            where: { saasAdminId: resellerId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        const out = payments.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            currency: p.currency,
            payment_type: p.paymentType,
            payment_method: p.paymentMethod,
            status: p.status,
            description: p.description,
            paid_at: p.paidAt,
            created_at: p.createdAt,
            created_by: p.createdBy,
        }));
        res.json(out);
    } catch (error) {
        console.error('getResellerPayments error:', error);
        res.status(500).json({ error: 'Bayi ödeme geçmişi listelenemedi' });
    }
};
const ONBOARDING_PAYMENT_TYPES = new Set(['cash', 'invoice', 'complimentary']);

export const createReseller = async (req: Request, res: Response) => {
    try {
        const b = req.body || {};
        const {
            username,
            password,
            email,
            company_name,
            commission_rate,
            available_licenses,
            contact_person,
            active,
            tax_number,
            tax_office,
            billing_address,
            city,
            district,
            postal_code,
            country,
            phone,
            mobile_phone,
            admin_notes,
            reseller_plan_id: bodyPlanId,
            purchase_payment_method: bodyPayMethod,
        } = b;

        if (!username || !password || !email) {
            return res.status(400).json({ error: 'Kullanıcı adı, şifre ve e-posta zorunludur.' });
        }

        const resellerPlanIdRaw = bodyPlanId != null && bodyPlanId !== '' ? Number(bodyPlanId) : null;
        const hasPlan = resellerPlanIdRaw != null && Number.isFinite(resellerPlanIdRaw);

        let planRow: { id: number; name: string; price: Prisma.Decimal; licenseCount: number } | null = null;
        if (hasPlan) {
            planRow = await prisma.resellerPlan.findFirst({
                where: { id: resellerPlanIdRaw!, isActive: true },
            });
            if (!planRow) {
                return res.status(400).json({ error: 'Seçilen bayi paketi bulunamadı veya pasif.' });
            }
        }

        let payMethod: string | null = null;
        if (hasPlan && planRow) {
            const raw = bodyPayMethod != null ? String(bodyPayMethod).trim() : 'cash';
            if (!ONBOARDING_PAYMENT_TYPES.has(raw)) {
                return res.status(400).json({ error: 'Geçersiz satın ödeme şekli.' });
            }
            payMethod = raw;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const fullName = (contact_person && String(contact_person).trim()) || company_name || username;

        const baseLicenses = available_licenses != null ? Number(available_licenses) : 0;
        const extraFromPlan = planRow?.licenseCount ?? 0;
        const totalLicenses = baseLicenses + extraFromPlan;

        const createdBy = String(req.user?.username || 'super_admin');

        const row = await prisma.$transaction(async (tx) => {
            const adminRow = await tx.saasAdmin.create({
                data: {
                    username: String(username),
                    passwordHash: hashedPassword,
                    email: String(email),
                    fullName: String(fullName),
                    companyName: company_name ? String(company_name) : null,
                    role: 'reseller',
                    commissionRate: commission_rate != null ? Number(commission_rate) : 15,
                    availableLicenses: totalLicenses,
                    walletBalance: 0,
                    isActive: active !== false,
                    taxNumber: tax_number || null,
                    taxOffice: tax_office || null,
                    billingAddress: billing_address || null,
                    city: city || null,
                    district: district || null,
                    postalCode: postal_code || null,
                    country: country || 'Türkiye',
                    phone: phone || null,
                    mobilePhone: mobile_phone || null,
                    contactPerson: contact_person || null,
                    adminNotes: admin_notes || null,
                    resellerPlanId: planRow?.id ?? null,
                    purchasePaymentMethod: hasPlan ? payMethod : null,
                },
            });

            if (planRow && payMethod && payMethod !== 'complimentary') {
                const amount = Number(planRow.price);
                if (amount > 0) {
                    if (payMethod === 'cash') {
                        await tx.paymentHistory.create({
                            data: {
                                saasAdminId: adminRow.id,
                                amount: new Prisma.Decimal(amount),
                                currency: 'EUR',
                                paymentType: 'reseller_package_onboarding',
                                paymentMethod: 'cash',
                                status: 'paid',
                                paidAt: new Date(),
                                description: `Bayi açılış paketi (tahsil): ${planRow.name}`,
                                createdBy,
                            },
                        });
                    } else if (payMethod === 'invoice') {
                        await tx.paymentHistory.create({
                            data: {
                                saasAdminId: adminRow.id,
                                amount: new Prisma.Decimal(amount),
                                currency: 'EUR',
                                paymentType: 'reseller_package_onboarding',
                                paymentMethod: 'invoice',
                                status: 'pending',
                                description: `Bayi açılış paketi (fatura): ${planRow.name}`,
                                createdBy,
                            },
                        });
                    }
                }
            }

            return adminRow;
        });

        res.status(201).json({ message: 'Bayi/Partner başarıyla eklendi', id: row.id });
    } catch (error: any) {
        console.error('createReseller error:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kullanımda.' });
        }
        res.status(500).json({ error: 'Bayi eklenemedi' });
    }
};

export const updateReseller = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const b = req.body || {};
        const {
            company_name,
            email,
            active,
            commission_rate,
            add_licenses,
            deduct_wallet,
            password,
            full_name,
            tax_number,
            tax_office,
            billing_address,
            city,
            district,
            postal_code,
            country,
            phone,
            mobile_phone,
            contact_person,
            admin_notes,
            add_wallet,
            set_wallet,
            upgrade_reseller_plan_id: rawUpgradePlanId,
            upgrade_payment_method: rawUpgradePay,
        } = b;

        const upgradePlanId =
            rawUpgradePlanId != null && rawUpgradePlanId !== '' ? Number(rawUpgradePlanId) : null;
        const wantsUpgrade = upgradePlanId != null && Number.isFinite(upgradePlanId);

        const existing = await prisma.saasAdmin.findFirst({
            where: { id: Number(id), role: 'reseller' },
            include: { resellerPlan: true },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Bayi bulunamadı' });
        }

        const data: Prisma.SaasAdminUpdateInput = {};

        if (company_name !== undefined) data.companyName = company_name;
        if (email !== undefined) data.email = email;
        if (active !== undefined) data.isActive = Boolean(active);
        if (commission_rate !== undefined) data.commissionRate = Number(commission_rate);
        if (full_name !== undefined) data.fullName = String(full_name);
        if (tax_number !== undefined) data.taxNumber = tax_number || null;
        if (tax_office !== undefined) data.taxOffice = tax_office || null;
        if (billing_address !== undefined) data.billingAddress = billing_address || null;
        if (city !== undefined) data.city = city || null;
        if (district !== undefined) data.district = district || null;
        if (postal_code !== undefined) data.postalCode = postal_code || null;
        if (country !== undefined) data.country = country || null;
        if (phone !== undefined) data.phone = phone || null;
        if (mobile_phone !== undefined) data.mobilePhone = mobile_phone || null;
        if (contact_person !== undefined) data.contactPerson = contact_person || null;
        if (admin_notes !== undefined) data.adminNotes = admin_notes || null;

        if (password && String(password).trim().length > 0) {
            data.passwordHash = await bcrypt.hash(String(password), 10);
        }

        if (add_licenses !== undefined) {
            data.availableLicenses = { increment: Number(add_licenses) };
        }
        if (deduct_wallet !== undefined) {
            const cur = Number(existing.walletBalance);
            const next = Math.max(0, cur - Number(deduct_wallet));
            data.walletBalance = new Prisma.Decimal(next);
        }
        if (add_wallet !== undefined) {
            data.walletBalance = { increment: Number(add_wallet) };
        }
        if (set_wallet !== undefined) {
            data.walletBalance = new Prisma.Decimal(Number(set_wallet));
        }

        const createdBy = String(req.user?.username || 'super_admin');

        if (!wantsUpgrade && Object.keys(data).length === 0) {
            return res.json({ message: 'Bayi profili güncellendi' });
        }

        await prisma.$transaction(async (tx) => {
            if (wantsUpgrade) {
                const newPlan = await tx.resellerPlan.findFirst({
                    where: { id: upgradePlanId!, isActive: true },
                });
                if (!newPlan) {
                    throw Object.assign(new Error('INVALID_PLAN'), { code: 'INVALID_PLAN' });
                }

                const hadPlan = Boolean(existing.resellerPlanId && existing.resellerPlan);
                const currentPrice = hadPlan && existing.resellerPlan ? Number(existing.resellerPlan.price) : 0;
                const newPrice = Number(newPlan.price);

                if (hadPlan && existing.resellerPlan) {
                    if (newPrice < currentPrice) {
                        throw Object.assign(new Error('DOWNGRADE'), { code: 'DOWNGRADE' });
                    }
                    if (newPrice === currentPrice) {
                        throw Object.assign(new Error('SAME_PLAN'), { code: 'SAME_PLAN' });
                    }
                }

                let finalCost: number;
                let finalLicenses: number;
                if (hadPlan && existing.resellerPlan) {
                    finalCost = newPrice - currentPrice;
                    finalLicenses = Math.max(0, newPlan.licenseCount - existing.resellerPlan.licenseCount);
                } else {
                    finalCost = newPrice;
                    finalLicenses = newPlan.licenseCount;
                }

                const payRaw = rawUpgradePay != null ? String(rawUpgradePay).trim() : 'cash';
                if (!ONBOARDING_PAYMENT_TYPES.has(payRaw)) {
                    throw Object.assign(new Error('INVALID_PAY'), { code: 'INVALID_PAY' });
                }

                await tx.saasAdmin.update({
                    where: { id: Number(id) },
                    data: {
                        resellerPlanId: newPlan.id,
                        purchasePaymentMethod: payRaw,
                        availableLicenses: { increment: finalLicenses },
                    },
                });

                if (payRaw !== 'complimentary' && finalCost > 0) {
                    const rollbackMeta = {
                        previousPlanId: existing.resellerPlanId,
                        licensesAdded: finalLicenses,
                        targetPlanId: newPlan.id,
                    };
                    if (payRaw === 'cash') {
                        await tx.paymentHistory.create({
                            data: {
                                saasAdminId: Number(id),
                                amount: new Prisma.Decimal(finalCost),
                                currency: 'EUR',
                                paymentType: 'license_upgrade',
                                paymentMethod: 'cash',
                                status: 'paid',
                                paidAt: new Date(),
                                description: appendPlanPurchaseRollback(
                                    `Bayi paket yükseltme (tahsil): ${existing.resellerPlan?.name ?? '—'} → ${newPlan.name}`,
                                    rollbackMeta
                                ),
                                createdBy,
                            },
                        });
                    } else if (payRaw === 'invoice') {
                        await tx.paymentHistory.create({
                            data: {
                                saasAdminId: Number(id),
                                amount: new Prisma.Decimal(finalCost),
                                currency: 'EUR',
                                paymentType: 'license_upgrade',
                                paymentMethod: 'invoice',
                                status: 'pending',
                                description: appendPlanPurchaseRollback(
                                    `Bayi paket yükseltme (fatura): ${existing.resellerPlan?.name ?? '—'} → ${newPlan.name}`,
                                    rollbackMeta
                                ),
                                createdBy,
                            },
                        });
                    }
                }
            }

            if (Object.keys(data).length > 0) {
                await tx.saasAdmin.update({
                    where: { id: Number(id) },
                    data,
                });
            }
        });

        res.json({ message: wantsUpgrade ? 'Bayi güncellendi ve paket yükseltmesi kaydedildi' : 'Bayi profili güncellendi' });
    } catch (error: any) {
        console.error('updateReseller error:', error);
        if (error?.code === 'INVALID_PLAN') {
            return res.status(400).json({ error: 'Geçersiz veya pasif paket.' });
        }
        if (error?.code === 'DOWNGRADE') {
            return res.status(400).json({
                error: 'Düşük pakete geçiş yapılamaz. Yalnızca daha yüksek fiyatlı paket seçilebilir.',
            });
        }
        if (error?.code === 'SAME_PLAN') {
            return res.status(400).json({ error: 'Aynı pakete geçiş yapılamaz.' });
        }
        if (error?.code === 'INVALID_PAY') {
            return res.status(400).json({ error: 'Geçersiz ödeme şekli.' });
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ error: 'Bu e-posta başka bir hesapta kullanılıyor.' });
        }
        res.status(500).json({ error: 'Bayi güncellenemedi' });
    }
};

export const deleteReseller = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const n = await prisma.saasAdmin.deleteMany({
            where: { id: Number(id), role: 'reseller' },
        });
        if (n.count === 0) {
            return res.status(404).json({ error: 'Bayi bulunamadı' });
        }
        res.json({ message: 'Bayi tamamen sistemden kaldırıldı' });
    } catch (error) {
        console.error('deleteReseller error:', error);
        res.status(500).json({ error: 'Bayi silinemedi, lütfen altındaki restoranların sahipliğini değiştirin.' });
    }
};

function mapResellerPlanRow(p: {
    id: number;
    name: string;
    code: string;
    price: Prisma.Decimal;
    licenseCount: number;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}) {
    return {
        id: p.id,
        name: p.name,
        code: p.code,
        price: Number(p.price),
        license_count: p.licenseCount,
        description: p.description,
        is_active: p.isActive ? 1 : 0,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
    };
}

function coerceBool(v: unknown, fallback: boolean): boolean {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === '1') return true;
    if (v === 0 || v === '0') return false;
    return Boolean(v);
}

// ═══════════════════════════════════════
// Bayi lisans paketleri + satın alma (Prisma / PostgreSQL)
// ═══════════════════════════════════════

export const getResellerPlans = async (req: Request, res: Response) => {
    try {
        const isSuper = req.user?.role === 'super_admin';
        const listAll = isSuper && String(req.query.all) === '1';
        const rows = await prisma.resellerPlan.findMany({
            where: listAll ? undefined : { isActive: true },
            orderBy: { price: 'asc' },
        });
        res.json(rows.map(mapResellerPlanRow));
    } catch (error) {
        console.error('getResellerPlans error:', error);
        res.status(500).json({ error: 'Planlar yüklenemedi' });
    }
};

const RESELLER_PURCHASE_PAYMENT_METHODS = new Set(['wallet_balance', 'bank_transfer', 'admin_card', 'cash']);

export const purchaseResellerPlan = async (req: Request, res: Response) => {
    try {
        const { planId, paymentMethod: rawPaymentMethod } = req.body;
        const resellerId = req.user?.userId;

        if (!resellerId) return res.status(401).json({ error: 'Giriş gerekli' });

        const paymentMethod = String(rawPaymentMethod ?? '').trim().toLowerCase();
        if (!RESELLER_PURCHASE_PAYMENT_METHODS.has(paymentMethod)) {
            return res.status(400).json({ error: 'Geçerli bir ödeme yöntemi seçin.' });
        }

        const rid = Number(resellerId);
        const pid = Number(planId);
        if (!Number.isFinite(pid)) {
            return res.status(400).json({ error: 'Geçerli planId gerekli' });
        }

        if (paymentMethod === 'admin_card') {
            const quoted = await computeResellerPlanPurchaseQuote(rid, pid);
            if (!quoted.ok) {
                return res.status(quoted.status).json({ error: quoted.error });
            }
            const origin = String(req.get('origin') || '').replace(/\/$/, '');
            const base =
                origin ||
                String(process.env.RESELLER_PUBLIC_URL || '')
                    .trim()
                    .replace(/\/$/, '') ||
                'http://localhost:4001';
            const successUrl = `${base}/?plan_purchase=ok&session_id={CHECKOUT_SESSION_ID}`;
            const cancelUrl = `${base}/?plan_purchase=cancel`;
            try {
                const reseller = await prisma.saasAdmin.findFirst({
                    where: { id: rid },
                    select: { email: true },
                });
                const { paymentHistoryId, checkoutUrl, gateway } = await createResellerPlanCardCheckout({
                    quote: quoted.quote,
                    successUrl,
                    cancelUrl,
                    customerEmail: reseller?.email,
                });
                return res.json({
                    requires_card_payment: true,
                    checkoutUrl,
                    gateway,
                    paymentHistoryId,
                    message:
                        'Kart ödeme sayfasına yönlendirileceksiniz. Ödeme onaylandıktan sonra paket tanımlanır.',
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Kart ödemesi başlatılamadı';
                return res.status(400).json({ error: msg });
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            const plan = await tx.resellerPlan.findFirst({
                where: { id: pid, isActive: true },
            });
            if (!plan) {
                return { error: 'Plan bulunamadı' as const, status: 404 };
            }

            const reseller = await tx.saasAdmin.findFirst({
                where: { id: rid, role: 'reseller' },
                include: { resellerPlan: true },
            });
            if (!reseller) {
                return { error: 'Bayi bulunamadı' as const, status: 404 };
            }

            const newPrice = Number(plan.price);
            const currentPrice = reseller.resellerPlan ? Number(reseller.resellerPlan.price) : 0;
            let finalCost = newPrice;
            let finalLicenses = plan.licenseCount;
            const hadPlan = Boolean(reseller.resellerPlanId);

            if (hadPlan && reseller.resellerPlan) {
                if (newPrice < currentPrice) {
                    return {
                        error: 'Düşük bir plana geçiş yapılamaz. Mevcut paketinizden daha üstün bir paket seçmelisiniz.',
                        status: 400,
                    } as const;
                }
                if (newPrice === currentPrice) {
                    return {
                        error: 'Aynı plana tekrar geçilemez. Zaten bu plana sahipsiniz.',
                        status: 400,
                    } as const;
                }
                finalCost = newPrice - currentPrice;
                finalLicenses = Math.max(
                    0,
                    plan.licenseCount - reseller.resellerPlan.licenseCount
                );
            }

            const wallet = Number(reseller.walletBalance);
            const previousPlanId = reseller.resellerPlanId;
            const baseDescription = `${hadPlan ? 'Yükseltme' : 'Satın alma'}: ${plan.name} paketi`;
            const description = appendPlanPurchaseRollback(baseDescription, {
                previousPlanId,
                licensesAdded: finalLicenses,
                targetPlanId: pid,
            });

            let nextWallet = wallet;
            let paymentStatus: 'paid' | 'pending' = 'pending';
            let paidAt: Date | null = null;
            let dueDate: Date | null = null;

            if (finalCost <= 0) {
                paymentStatus = 'paid';
                paidAt = new Date();
            } else if (paymentMethod === 'wallet_balance') {
                if (wallet < finalCost) {
                    return {
                        error: `Yetersiz bakiye. Bu işlem için €${finalCost.toFixed(2)} gereklidir. Mevcut: €${wallet.toFixed(2)}`,
                        status: 400,
                    } as const;
                }
                nextWallet = Math.max(0, wallet - finalCost);
                paymentStatus = 'paid';
                paidAt = new Date();
            } else if (paymentMethod === 'bank_transfer' || paymentMethod === 'cash') {
                dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 14);
            }

            await tx.saasAdmin.update({
                where: { id: rid },
                data: {
                    walletBalance: new Prisma.Decimal(nextWallet),
                    availableLicenses: { increment: finalLicenses },
                    resellerPlanId: pid,
                    purchasePaymentMethod: paymentMethod,
                },
            });

            let paymentHistoryId: number | null = null;

            if (finalCost > 0) {
                const paymentRow = await tx.paymentHistory.create({
                    data: {
                        saasAdminId: rid,
                        amount: new Prisma.Decimal(finalCost),
                        currency: 'EUR',
                        paymentType: 'license_upgrade',
                        paymentMethod,
                        status: paymentStatus,
                        paidAt,
                        due_date: dueDate,
                        description,
                        createdBy: String(resellerId),
                    },
                });
                paymentHistoryId = paymentRow.id;
            }

            return {
                ok: true as const,
                planName: plan.name,
                hadPlan,
                finalLicenses,
                planId: pid,
                paymentStatus,
                finalCost,
                paymentHistoryId,
            };
        });

        if ('error' in result && result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        if ('ok' in result && result.ok) {
            const pending = result.paymentStatus === 'pending' && result.finalCost > 0;
            return res.json({
                message: pending
                    ? `${result.planName} paketi ${result.hadPlan ? 'yükseltildi' : 'tanımlandı'}. €${result.finalCost.toFixed(2)} tutarındaki ödeme onay bekliyor; lisanslar hesabınıza eklendi. Ödeme gelmezse iptal edilebilir ve eski pakete dönülür.`
                    : `${result.planName} paketi başarıyla ${result.hadPlan ? 'yükseltildi' : 'satın alındı'}. Hesabınıza ${result.finalLicenses} yeni lisans eklendi.`,
                addedLicenses: result.finalLicenses,
                currentPlanId: result.planId,
                paymentStatus: result.paymentStatus,
                paymentHistoryId: result.paymentHistoryId ?? undefined,
            });
        }
        res.status(500).json({ error: 'Satın alma işlemi başarısız oldu' });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Satın alma işlemi başarısız oldu' });
    }
};

export const cancelResellerPlanPurchaseHandler = async (req: Request, res: Response) => {
    try {
        const resellerId = req.user?.userId;
        if (!resellerId) return res.status(401).json({ error: 'Giriş gerekli' });

        const paymentHistoryId = Number(req.body?.paymentHistoryId ?? req.body?.payment_id);
        if (!Number.isFinite(paymentHistoryId)) {
            return res.status(400).json({ error: 'Geçerli paymentHistoryId gerekli' });
        }

        const result = await cancelResellerPlanPurchase(Number(resellerId), paymentHistoryId);
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.json({ message: result.message, reverted: result.reverted });
    } catch (error) {
        console.error('cancelResellerPlanPurchase error:', error);
        res.status(500).json({ error: 'İptal işlemi başarısız oldu' });
    }
};

// ═══════════════════════════════════════
// Süper admin — bayi lisans paketi CRUD
// ═══════════════════════════════════════

export const addResellerPlan = async (req: Request, res: Response) => {
    try {
        const { name, code, price, license_count, description } = req.body || {};
        if (!name || !code || price === undefined || license_count === undefined) {
            return res.status(400).json({ error: 'name, code, price ve license_count zorunludur.' });
        }
        const row = await prisma.resellerPlan.create({
            data: {
                name: String(name),
                code: String(code),
                price: new Prisma.Decimal(Number(price)),
                licenseCount: Number(license_count),
                description: description != null ? String(description) : null,
                isActive: true,
            },
        });
        res.status(201).json({ message: 'Lisans paketi oluşturuldu', id: row.id });
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return res.status(409).json({ error: 'Bu kod zaten kullanılıyor.' });
        }
        console.error('addResellerPlan error:', e);
        res.status(500).json({ error: 'Plan oluşturulamadı' });
    }
};

export const updateResellerPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, code, price, license_count, description, is_active } = req.body || {};
        const cur = await prisma.resellerPlan.findUnique({ where: { id: Number(id) } });
        if (!cur) {
            return res.status(404).json({ error: 'Plan bulunamadı' });
        }
        await prisma.resellerPlan.update({
            where: { id: Number(id) },
            data: {
                name: name !== undefined ? String(name) : cur.name,
                code: code !== undefined ? String(code) : cur.code,
                price: price !== undefined ? new Prisma.Decimal(Number(price)) : cur.price,
                licenseCount:
                    license_count !== undefined ? Number(license_count) : cur.licenseCount,
                description:
                    description !== undefined
                        ? description === null
                            ? null
                            : String(description)
                        : cur.description,
                isActive:
                    is_active !== undefined ? coerceBool(is_active, cur.isActive) : cur.isActive,
            },
        });
        res.json({ message: 'Plan güncellendi' });
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return res.status(409).json({ error: 'Bu kod başka bir planda kullanılıyor.' });
        }
        console.error('updateResellerPlan error:', e);
        res.status(500).json({ error: 'Plan güncellenemedi' });
    }
};

export const deleteResellerPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.resellerPlan.delete({
            where: { id: Number(id) },
        });
        res.json({ message: 'Plan silindi' });
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            return res.status(404).json({ error: 'Plan bulunamadı' });
        }
        console.error('deleteResellerPlan error:', e);
        res.status(500).json({ error: 'Plan silinemedi' });
    }
};

/**
 * GET /resellers/finance/settings
 */
export const getResellerFinanceSettings = async (req: Request, res: Response) => {
    try {
        const adminId = Number(req.user?.userId);
        const admin = await prisma.saasAdmin.findUnique({ where: { id: adminId } });
        if (!admin) return res.status(404).json({ error: 'Bayi bulunamadı' });
        
        res.json({
            bankIban: admin.bankIban || '',
            bankAccountName: admin.bankAccountName || ''
        });
    } catch (error) {
        console.error('getResellerFinanceSettings error:', error);
        res.status(500).json({ error: 'Finans ayarları alınamadı' });
    }
};

/**
 * PUT /resellers/finance/settings
 */
export const updateResellerFinanceSettings = async (req: Request, res: Response) => {
    try {
        const adminId = Number(req.user?.userId);
        const { bankIban, bankAccountName } = req.body;
        
        await prisma.saasAdmin.update({
            where: { id: adminId },
            data: {
                bankIban: bankIban ? String(bankIban) : null,
                bankAccountName: bankAccountName ? String(bankAccountName) : null
            }
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('updateResellerFinanceSettings error:', error);
        res.status(500).json({ error: 'Finans ayarları güncellenemedi' });
    }
};

/**
 * POST /resellers/finance/withdraw
 */
export const createResellerWithdrawal = async (req: Request, res: Response) => {
    try {
        const adminId = Number(req.user?.userId);
        const { amount, payoutMethod, note } = req.body;
        
        const reqAmount = Number(amount);
        if (!reqAmount || reqAmount <= 0) {
            return res.status(400).json({ error: 'Geçersiz tutar' });
        }
        
        const admin = await prisma.saasAdmin.findUnique({ where: { id: adminId } });
        if (!admin) return res.status(404).json({ error: 'Bayi bulunamadı' });
        
        if (Number(admin.walletBalance) < reqAmount) {
            return res.status(400).json({ error: 'Yetersiz bakiye' });
        }
        
        // 1. Create payout request
        const pr = await prisma.payoutRequest.create({
            data: {
                resellerId: adminId,
                amount: reqAmount,
                payoutMethod: payoutMethod || 'bank_transfer',
                bankIban: admin.bankIban,
                bankAccount: admin.bankAccountName,
                note: note || null,
            }
        });
        
        // 2. Deduct from wallet immediately (as pending withdrawal lock)
        await prisma.saasAdmin.update({
            where: { id: adminId },
            data: { walletBalance: { decrement: reqAmount } }
        });
        
        // 3. Log it in payment history as pending deduction
        await prisma.paymentHistory.create({
            data: {
                saasAdminId: adminId,
                amount: -reqAmount,
                paymentType: 'withdrawal',
                status: 'pending',
                description: `Para Çekme Talebi (#${pr.id})`,
                createdBy: req.user?.username
            }
        });
        
        res.json({ success: true, id: pr.id });
    } catch (error) {
        console.error('createResellerWithdrawal error:', error);
        res.status(500).json({ error: 'Çekim talebi oluşturulamadı' });
    }
};

/**
 * GET /resellers/finance/withdrawals
 */
export const getResellerWithdrawals = async (req: Request, res: Response) => {
    try {
        const adminId = Number(req.user?.userId);
        const list = await prisma.payoutRequest.findMany({
            where: { resellerId: adminId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(list);
    } catch (error) {
        console.error('getResellerWithdrawals error:', error);
        res.status(500).json({ error: 'Çekim talepleri listelenemedi' });
    }
};

/**
 * POST /resellers/finance/recalculate
 * tenant_billing + sistem oranlarıyla reseller_income düzeltme satırları (Finans sekmesi ile uyumlu)
 */
export const recalculateCommissions = async (req: Request, res: Response) => {
    try {
        const adminId = Number(req.user?.userId);
        const admin = await prisma.saasAdmin.findUnique({ where: { id: adminId } });
        if (!admin) return res.status(404).json({ error: 'Bayi bulunamadı' });

        const result = await runResellerCommissionRecalculation(adminId);
        res.json({
            success: true,
            addedTotal: result.adjustmentNet,
            recordsAdded: result.adjustmentRows,
            updatedTenants: result.updatedTenants,
            oldTotalCommission: result.oldTotalCommission,
            newTotalCommission: result.newTotalCommission,
            diff: result.diff,
        });
    } catch (error) {
        console.error('recalculateCommissions error:', error);
        res.status(500).json({ error: 'Komisyon hesaplaması başarısız oldu' });
    }
};
