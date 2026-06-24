/**
 * Bayi lisans paketi — kart ile ödeme (Stripe Checkout).
 * Paket yükseltmesi yalnızca ödeme onaylandıktan sonra uygulanır.
 */
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { queryPublic } from '../lib/db.js';
import { getSystemStripeSecretKey } from './reseller-stripe-topup.service.js';
import { GatewayService, isVirtualPosTestMode } from './gateway.service.js';

const STRIPE_API_VERSION = '2025-02-24.acacia' as Stripe.LatestApiVersion;
const ROLLBACK_MARKER = '@@ROLLBACK@@';

export type PlanPurchaseRollbackMeta = {
    previousPlanId: number | null;
    licensesAdded: number;
    targetPlanId: number;
};

export function appendPlanPurchaseRollback(description: string, meta: PlanPurchaseRollbackMeta): string {
    return `${description} ${ROLLBACK_MARKER}${JSON.stringify(meta)}`;
}

export function parsePlanPurchaseRollback(description: string | null | undefined): {
    displayDescription: string;
    meta: PlanPurchaseRollbackMeta | null;
} {
    const raw = String(description ?? '');
    const idx = raw.indexOf(ROLLBACK_MARKER);
    if (idx < 0) {
        return { displayDescription: raw, meta: null };
    }
    const displayDescription = raw.slice(0, idx).trim();
    try {
        const meta = JSON.parse(raw.slice(idx + ROLLBACK_MARKER.length)) as PlanPurchaseRollbackMeta;
        return { displayDescription, meta };
    } catch {
        return { displayDescription: raw, meta: null };
    }
}

async function tryApplyPlanRevert(
    resellerId: number,
    meta: PlanPurchaseRollbackMeta
): Promise<boolean> {
    const reseller = await prisma.saasAdmin.findFirst({
        where: { id: resellerId, role: 'reseller' },
    });
    if (!reseller || reseller.resellerPlanId !== meta.targetPlanId) {
        return false;
    }

    const currentLicenses = Number(reseller.availableLicenses ?? 0);
    const nextLicenses = Math.max(0, currentLicenses - Math.max(0, meta.licensesAdded));

    await prisma.saasAdmin.update({
        where: { id: resellerId },
        data: {
            resellerPlanId: meta.previousPlanId,
            availableLicenses: nextLicenses,
            ...(meta.previousPlanId == null ? { purchasePaymentMethod: null } : {}),
        },
    });
    return true;
}

async function resolveRollbackMetaForPayment(payment: {
    description: string | null;
    amount: Prisma.Decimal | number;
    invoice_number: string | null;
    saasAdminId: number | null;
}): Promise<PlanPurchaseRollbackMeta | null> {
    const { meta: embedded } = parsePlanPurchaseRollback(payment.description);
    if (embedded) return embedded;

    const inv = String(payment.invoice_number || '');
    if (inv.startsWith('cs_')) {
        try {
            const secret = await getSystemStripeSecretKey();
            if (secret) {
                const stripe = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
                const session = await stripe.checkout.sessions.retrieve(inv);
                const m = session.metadata;
                if (m?.plan_id) {
                    const previousRaw = m.previous_plan_id;
                    return {
                        previousPlanId:
                            previousRaw != null && String(previousRaw) !== ''
                                ? Number(previousRaw)
                                : null,
                        licensesAdded: Number(m.final_licenses || 0),
                        targetPlanId: Number(m.plan_id),
                    };
                }
            }
        } catch {
            /* Stripe oturumu okunamadı */
        }
    }

    const { displayDescription } = parsePlanPurchaseRollback(payment.description);
    const desc = displayDescription.trim();
    if (!desc) return null;

    const arrowMatch = desc.match(/:\s*(.+?)\s*→\s*(.+?)(?:\s*\(|$)/);
    let targetPlan = null;
    let previousPlan = null;

    if (arrowMatch) {
        previousPlan = await prisma.resellerPlan.findFirst({
            where: { name: arrowMatch[1].trim() },
        });
        targetPlan = await prisma.resellerPlan.findFirst({
            where: { name: arrowMatch[2].trim() },
        });
    } else {
        const nameMatch = desc.match(/(?:Yükseltme|Satın alma):\s*(.+?)\s+paketi/i);
        if (nameMatch) {
            targetPlan = await prisma.resellerPlan.findFirst({
                where: { name: nameMatch[1].trim() },
            });
        }
    }

    if (!targetPlan) return null;

    const amount = Number(payment.amount);
    let previousPlanId: number | null = previousPlan?.id ?? null;
    let licensesAdded = targetPlan.licenseCount;

    if (previousPlan) {
        licensesAdded = Math.max(0, targetPlan.licenseCount - previousPlan.licenseCount);
    } else if (Math.abs(amount - Number(targetPlan.price)) < 0.02) {
        previousPlanId = null;
        licensesAdded = targetPlan.licenseCount;
    } else {
        const targetPrice = Number(targetPlan.price);
        const prev = await prisma.resellerPlan.findFirst({
            where: {
                isActive: true,
                price: new Prisma.Decimal(targetPrice - amount),
            },
        });
        previousPlanId = prev?.id ?? null;
        if (prev) {
            licensesAdded = Math.max(0, targetPlan.licenseCount - prev.licenseCount);
        }
    }

    const resellerId = payment.saasAdminId;
    if (resellerId) {
        const reseller = await prisma.saasAdmin.findFirst({ where: { id: resellerId } });
        if (reseller && reseller.resellerPlanId !== targetPlan.id) {
            return null;
        }
    }

    return {
        previousPlanId,
        licensesAdded,
        targetPlanId: targetPlan.id,
    };
}

export async function cancelResellerPlanPurchase(
    resellerId: number,
    paymentHistoryId: number
): Promise<
    | { ok: true; reverted: boolean; message: string }
    | { ok: false; error: string; status: number }
> {
    const payment = await prisma.paymentHistory.findFirst({
        where: {
            id: paymentHistoryId,
            saasAdminId: resellerId,
            paymentType: 'license_upgrade',
        },
    });
    if (!payment) {
        return { ok: false, error: 'Ödeme kaydı bulunamadı', status: 404 };
    }

    const status = String(payment.status || '').toLowerCase();
    if (status === 'paid') {
        return {
            ok: false,
            error: 'Tamamlanmış ödeme bayi panelinden iptal edilemez. Yönetim ile iletişime geçin.',
            status: 400,
        };
    }

    const wasAlreadyCancelled = status === 'cancelled';
    const meta = await resolveRollbackMetaForPayment(payment);

    let reverted = false;
    if (meta) {
        reverted = await tryApplyPlanRevert(resellerId, meta);
    }

    if (!wasAlreadyCancelled) {
        await prisma.paymentHistory.update({
            where: { id: paymentHistoryId },
            data: { status: 'cancelled' },
        });
    }

    if (reverted) {
        return {
            ok: true,
            reverted: true,
            message: wasAlreadyCancelled
                ? 'Önceki abonelik paketinize geri dönüldü.'
                : 'Ödeme iptal edildi ve önceki abonelik paketinize geri dönüldü.',
        };
    }

    if (wasAlreadyCancelled) {
        return {
            ok: true,
            reverted: false,
            message: meta
                ? 'Bu işlem zaten iptal edilmiş; paket önceki durumda.'
                : 'Bu işlem zaten iptal edilmiş. Paket geri alınamadı; yönetim ile iletişime geçin.',
        };
    }

    if (status === 'awaiting_card' || status === 'checkout_failed') {
        return {
            ok: true,
            reverted: false,
            message: 'Kart ödemesi iptal edildi. Paketiniz değişmedi.',
        };
    }

    if (!meta) {
        return {
            ok: true,
            reverted: false,
            message: 'Ödeme iptal edildi. Paket geri alma bilgisi bulunamadı; yönetim kontrolü gerekebilir.',
        };
    }

    return {
        ok: true,
        reverted: false,
        message: 'Ödeme iptal edildi. Paket zaten önceki durumdaydı.',
    };
}

export type PlanPurchaseQuote = {
    resellerId: number;
    planId: number;
    planName: string;
    previousPlanId: number | null;
    finalCost: number;
    finalLicenses: number;
    hadPlan: boolean;
    description: string;
};

export async function computeResellerPlanPurchaseQuote(
    resellerId: number,
    planId: number
): Promise<{ ok: true; quote: PlanPurchaseQuote } | { ok: false; error: string; status: number }> {
    const plan = await prisma.resellerPlan.findFirst({
        where: { id: planId, isActive: true },
    });
    if (!plan) {
        return { ok: false, error: 'Plan bulunamadı', status: 404 };
    }

    const reseller = await prisma.saasAdmin.findFirst({
        where: { id: resellerId, role: 'reseller' },
        include: { resellerPlan: true },
    });
    if (!reseller) {
        return { ok: false, error: 'Bayi bulunamadı', status: 404 };
    }

    const newPrice = Number(plan.price);
    const currentPrice = reseller.resellerPlan ? Number(reseller.resellerPlan.price) : 0;
    let finalCost = newPrice;
    let finalLicenses = plan.licenseCount;
    const hadPlan = Boolean(reseller.resellerPlanId);

    if (hadPlan && reseller.resellerPlan) {
        if (newPrice < currentPrice) {
            return {
                ok: false,
                error: 'Düşük bir plana geçiş yapılamaz. Mevcut paketinizden daha üstün bir paket seçmelisiniz.',
                status: 400,
            };
        }
        if (newPrice === currentPrice) {
            return {
                ok: false,
                error: 'Aynı plana tekrar geçilemez. Zaten bu plana sahipsiniz.',
                status: 400,
            };
        }
        finalCost = newPrice - currentPrice;
        finalLicenses = Math.max(0, plan.licenseCount - reseller.resellerPlan.licenseCount);
    }

    if (finalCost <= 0) {
        return { ok: false, error: 'Bu işlem için kart ödemesi gerekmez.', status: 400 };
    }

    const baseDescription = `${hadPlan ? 'Yükseltme' : 'Satın alma'}: ${plan.name} paketi`;
    const description = appendPlanPurchaseRollback(baseDescription, {
        previousPlanId: reseller.resellerPlanId,
        licensesAdded: finalLicenses,
        targetPlanId: plan.id,
    });

    return {
        ok: true,
        quote: {
            resellerId,
            planId: plan.id,
            planName: plan.name,
            previousPlanId: reseller.resellerPlanId,
            finalCost,
            finalLicenses,
            hadPlan,
            description,
        },
    };
}

export async function createResellerPlanCardCheckout(params: {
    quote: PlanPurchaseQuote;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string | null;
}): Promise<{ paymentHistoryId: number; checkoutUrl: string; gateway: string }> {
    const gwConfig = await GatewayService.getConfig();
    const gwName = String(gwConfig.active_gateway ?? 'none').toLowerCase();
    if (gwName === 'none') {
        throw new Error(
            'Aktif sanal POS geçidi yok. SaaS Ayarları → Ödeme geçidinden Stripe, iyzico veya PayTR seçin.'
        );
    }
    if (gwName !== 'stripe') {
        throw new Error(
            'Paket kart ödemesi şu an yalnızca Stripe ile destekleniyor. Havale veya cüzdan kullanın.'
        );
    }
    if (isVirtualPosTestMode(gwConfig)) {
        const secret = await getSystemStripeSecretKey();
        if (!secret?.startsWith('sk_test_')) {
            throw new Error(
                'Sanal POS test modu açık: Stripe Secret Key sk_test_ ile başlamalıdır (canlı anahtar kullanılamaz).'
            );
        }
    }

    const { quote, successUrl, cancelUrl, customerEmail } = params;
    const amount = quote.finalCost;

    const payment = await prisma.paymentHistory.create({
        data: {
            saasAdminId: quote.resellerId,
            amount: new Prisma.Decimal(amount),
            currency: 'EUR',
            paymentType: 'license_upgrade',
            paymentMethod: 'admin_card',
            status: 'awaiting_card',
            description: quote.description,
            createdBy: String(quote.resellerId),
        },
    });

    const secret = await getSystemStripeSecretKey();
    if (!secret) {
        await prisma.paymentHistory.update({
            where: { id: payment.id },
            data: { status: 'checkout_failed' },
        });
        throw new Error('Stripe secret key tanımlı değil.');
    }

    const stripe = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
    const unitAmount = Math.round(amount * 100);
    if (unitAmount < 100) {
        await prisma.paymentHistory.update({
            where: { id: payment.id },
            data: { status: 'checkout_failed' },
        });
        throw new Error('Stripe için tutar çok küçük');
    }

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: customerEmail || undefined,
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: 'eur',
                        unit_amount: unitAmount,
                        product_data: {
                            name: `NEXTPOS bayi paketi — ${quote.planName}`,
                            description: quote.description,
                        },
                    },
                },
            ],
            success_url: successUrl,
            cancel_url: `${cancelUrl}${cancelUrl.includes('?') ? '&' : '?'}payment_id=${payment.id}`,
            metadata: {
                nextpos_kind: 'reseller_plan_purchase',
                payment_history_id: String(payment.id),
                reseller_id: String(quote.resellerId),
                plan_id: String(quote.planId),
                previous_plan_id:
                    quote.previousPlanId != null ? String(quote.previousPlanId) : '',
                final_licenses: String(quote.finalLicenses),
            },
            payment_intent_data: {
                metadata: {
                    nextpos_kind: 'reseller_plan_purchase',
                    payment_history_id: String(payment.id),
                    reseller_id: String(quote.resellerId),
                    plan_id: String(quote.planId),
                    previous_plan_id:
                        quote.previousPlanId != null ? String(quote.previousPlanId) : '',
                    final_licenses: String(quote.finalLicenses),
                },
            },
        });

        const url = session.url;
        if (!url) {
            await prisma.paymentHistory.update({
                where: { id: payment.id },
                data: { status: 'checkout_failed' },
            });
            throw new Error('Stripe oturum URL üretilemedi');
        }

        await prisma.paymentHistory.update({
            where: { id: payment.id },
            data: { invoice_number: session.id },
        });

        return { paymentHistoryId: payment.id, checkoutUrl: url, gateway: 'stripe' };
    } catch (e) {
        await prisma.paymentHistory
            .update({
                where: { id: payment.id },
                data: { status: 'checkout_failed' },
            })
            .catch(() => {});
        throw e;
    }
}

export async function fulfillResellerPlanPurchaseFromStripeSession(
    session: Stripe.Checkout.Session
): Promise<{ fulfilled: boolean }> {
    if (session.metadata?.nextpos_kind !== 'reseller_plan_purchase') {
        return { fulfilled: false };
    }
    if (session.payment_status !== 'paid') {
        return { fulfilled: false };
    }
    if (String(session.currency || '').toLowerCase() !== 'eur') {
        return { fulfilled: false };
    }

    const paymentHistoryId = Number(session.metadata?.payment_history_id);
    const resellerId = Number(session.metadata?.reseller_id);
    const planId = Number(session.metadata?.plan_id);
    const finalLicenses = Number(session.metadata?.final_licenses);
    if (!Number.isFinite(paymentHistoryId) || !Number.isFinite(resellerId) || !Number.isFinite(planId)) {
        return { fulfilled: false };
    }

    const amountPaid = (session.amount_total ?? 0) / 100;

    const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.paymentHistory.findFirst({
            where: { id: paymentHistoryId, saasAdminId: resellerId },
        });
        if (!payment) {
            return { fulfilled: false as const };
        }
        if (payment.status === 'paid') {
            return { fulfilled: true as const };
        }
        if (payment.status !== 'awaiting_card') {
            return { fulfilled: false as const };
        }
        const expected = Number(payment.amount);
        if (!Number.isFinite(expected) || Math.abs(expected - amountPaid) > 0.02) {
            return { fulfilled: false as const };
        }
        if (payment.invoice_number && payment.invoice_number !== session.id) {
            return { fulfilled: false as const };
        }

        await tx.saasAdmin.update({
            where: { id: resellerId },
            data: {
                resellerPlanId: planId,
                purchasePaymentMethod: 'admin_card',
                availableLicenses: { increment: Number.isFinite(finalLicenses) ? finalLicenses : 0 },
            },
        });

        await tx.paymentHistory.update({
            where: { id: paymentHistoryId },
            data: {
                status: 'paid',
                paidAt: new Date(),
                paymentMethod: 'stripe',
                invoice_number: session.id,
            },
        });

        return { fulfilled: true as const };
    });

    if (result.fulfilled) {
        try {
            await queryPublic(
                `
                INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    'stripe_webhook',
                    'reseller_plan_purchase_stripe_paid',
                    'payment_history',
                    String(paymentHistoryId),
                    null,
                    JSON.stringify({
                        reseller_id: resellerId,
                        plan_id: planId,
                        amount: amountPaid,
                        session_id: session.id,
                    }),
                    '',
                    '',
                ]
            );
        } catch {
            /* ignore */
        }
    }

    return result;
}
