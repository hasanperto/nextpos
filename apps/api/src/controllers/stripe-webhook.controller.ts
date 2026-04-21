import type { Request, Response } from 'express';
import Stripe from 'stripe';
import {
    fulfillResellerWalletTopupFromStripeSession,
    getSystemStripeSecretKey,
} from '../services/reseller-stripe-topup.service.js';

const STRIPE_API_VERSION = '2025-02-24.acacia' as Stripe.LatestApiVersion;

/**
 * Stripe webhook — raw body gerekli (express.json öncesi mount edilir).
 * Stripe CLI: stripe listen --forward-to localhost:PORT/api/v1/saas-public/webhooks/stripe
 */
export async function handleStripeWebhook(req: Request, res: Response) {
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!whSecret) {
        console.error('[Stripe webhook] STRIPE_WEBHOOK_SECRET tanımlı değil');
        return res.status(500).send('Webhook secret not configured');
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
        return res.status(400).send('Missing stripe-signature');
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
        console.error('[Stripe webhook] body Buffer değil — route sırasını kontrol edin (raw parser)');
        return res.status(500).send('Invalid body');
    }

    let event: Stripe.Event;
    try {
        const secret = await getSystemStripeSecretKey();
        if (!secret) {
            return res.status(500).send('Stripe secret not configured');
        }
        const stripe = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
        event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Stripe webhook] verify failed:', msg);
        return res.status(400).send(`Webhook Error: ${msg}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            await fulfillResellerWalletTopupFromStripeSession(session);
        }
    } catch (e) {
        console.error('[Stripe webhook] handler error:', e);
        return res.status(500).json({ error: 'handler failed' });
    }

    return res.status(200).json({ received: true });
}
