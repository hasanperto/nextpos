/**
 * Bayi cüzdan yükleme — Stripe Checkout + webhook ile otomatik onay.
 * Google Pay / Apple Pay: Stripe Checkout oturumunda Dashboard ayarına bağlı olarak sunulur.
 */
import Stripe from 'stripe';
import { queryPublic } from '../lib/db.js';
import { creditResellerTopupAfterCardPayment } from './reseller-topup-credit.service.js';

const STRIPE_API_VERSION = '2025-02-24.acacia' as Stripe.LatestApiVersion;

export async function getSystemStripeSecretKey(): Promise<string | null> {
    const env = process.env.STRIPE_SECRET_KEY?.trim();
    if (env) return env;
    try {
        const [rows]: any = await queryPublic(`SELECT stripe_secret_key FROM \`public\`.system_settings WHERE id = 1`, []);
        const sk = String(rows?.[0]?.stripe_secret_key ?? '').trim();
        return sk || null;
    } catch {
        return null;
    }
}

/** Stripe Checkout — yalnızca sanal POS’ta Stripe seçiliyken GatewayService üzerinden çağrılmalıdır. */
export async function createStripeResellerWalletTopupCheckout(
    params: {
        resellerId: number;
        amount: number;
        note: string | null;
        successUrl: string;
        cancelUrl: string;
        customerEmail?: string | null;
    },
    opts?: { virtualPosTestMode?: boolean }
): Promise<{ topupId: number; checkoutUrl: string }> {
    const secret = await getSystemStripeSecretKey();
    if (!secret) {
        throw new Error(
            'Stripe secret key tanımlı değil: SaaS Paneli → Ayarlar → Stripe Secret Key veya ortam değişkeni STRIPE_SECRET_KEY.'
        );
    }
    if (opts?.virtualPosTestMode && !secret.startsWith('sk_test_')) {
        throw new Error(
            'Sanal POS test modu açık: Stripe Secret Key sk_test_ ile başlamalıdır (canlı anahtar kullanılamaz).'
        );
    }
    const stripe = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
    const { resellerId, amount, note, successUrl, cancelUrl, customerEmail } = params;
    if (!Number.isFinite(amount) || amount < 10) {
        throw new Error('Geçersiz tutar');
    }

    const [ins]: any = await queryPublic(
        `
        INSERT INTO \`public\`.reseller_wallet_topup_requests
            (reseller_id, amount, currency, note, status, payment_method, transfer_reference, transfer_date, transfer_time, return_success_url, return_cancel_url)
        VALUES (?, ?, 'EUR', ?, 'awaiting_card', 'admin_card', NULL, NULL, NULL, ?, ?)
        `,
        [resellerId, amount, note, successUrl, cancelUrl]
    );
    const topupId = Number(ins?.insertId);
    if (!Number.isFinite(topupId)) {
        throw new Error('Talep kaydı oluşturulamadı');
    }

    const unitAmount = Math.round(amount * 100);
    if (unitAmount < 1000) {
        await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]);
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
                            name: 'NEXTPOS bayi cüzdan yükleme',
                            description: `Talep #${topupId}`,
                        },
                    },
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                nextpos_kind: 'reseller_wallet_topup',
                topup_id: String(topupId),
                reseller_id: String(resellerId),
            },
            payment_intent_data: {
                metadata: {
                    nextpos_kind: 'reseller_wallet_topup',
                    topup_id: String(topupId),
                    reseller_id: String(resellerId),
                },
            },
        });

        const url = session.url;
        if (!url) {
            await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]);
            throw new Error('Stripe oturum URL üretilemedi');
        }

        await queryPublic(
            `UPDATE \`public\`.reseller_wallet_topup_requests SET stripe_checkout_session_id = ? WHERE id = ? AND status = 'awaiting_card'`,
            [session.id, topupId]
        );

        return { topupId, checkoutUrl: url };
    } catch (e) {
        await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]).catch(() => {});
        throw e;
    }
}

export async function fulfillResellerWalletTopupFromStripeSession(session: Stripe.Checkout.Session): Promise<{ credited: boolean }> {
    if (session.metadata?.nextpos_kind !== 'reseller_wallet_topup') {
        return { credited: false };
    }
    const topupId = Number(session.metadata?.topup_id);
    if (!Number.isFinite(topupId)) {
        return { credited: false };
    }
    if (session.payment_status !== 'paid') {
        return { credited: false };
    }
    if (String(session.currency || '').toLowerCase() !== 'eur') {
        console.warn('[reseller-stripe-topup] non-EUR session', session.id);
        return { credited: false };
    }

    const amountPaid = (session.amount_total ?? 0) / 100;

    const [selRows]: any = await queryPublic(
        `SELECT id, amount::text as amount, status, payment_method, stripe_checkout_session_id FROM \`public\`.reseller_wallet_topup_requests WHERE id = ?`,
        [topupId]
    );
    const row = Array.isArray(selRows) ? selRows[0] : selRows;
    if (!row) {
        return { credited: false };
    }
    if (row.status === 'approved') {
        return { credited: true };
    }
    const expected = Number(row.amount);
    if (!Number.isFinite(expected) || Math.abs(expected - amountPaid) > 0.02) {
        console.error('[reseller-stripe-topup] amount mismatch', { topupId, expected, amountPaid });
        return { credited: false };
    }
    if (row.stripe_checkout_session_id && row.stripe_checkout_session_id !== session.id) {
        console.error('[reseller-stripe-topup] session id mismatch', row.stripe_checkout_session_id, session.id);
        return { credited: false };
    }

    const cr = await creditResellerTopupAfterCardPayment({
        topupId,
        amountPaid,
        externalRef: session.id,
        paymentHistoryMethod: 'stripe',
        auditAction: 'reseller_wallet_topup_stripe_paid',
        createdBy: 'stripe_webhook',
        description: `Bayi cüzdan — Stripe (talep #${topupId})`,
    });
    return { credited: cr.ok };
}
