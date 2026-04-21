import { Request, Response } from 'express';
import { GatewayService, CheckoutSessionPayload } from '../services/gateway.service.js';
import { z } from 'zod';
import { queryPublic } from '../lib/db.js';

// ─────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────

const checkoutSchema = z.object({
    tenantId: z.string().uuid('Geçerli bir Tenant ID girilmelidir'),
    amount: z.number().positive('Tutar pozitif olmalıdır'),
    currency: z.string().default('EUR'),
    description: z.string().min(3, 'Açıklama gereklidir'),
    callbackUrl: z.string().url().optional(),
    paymentType: z.enum(['subscription', 'addon', 'license']).default('subscription')
});

// ─────────────────────────────────────
// Controller Methods
// ─────────────────────────────────────

export const createCheckoutSession = async (req: Request, res: Response) => {
    try {
        const data = checkoutSchema.parse(req.body);
        
        // 1. Tenant varlığını doğrula
        const [rows]: any = await queryPublic('SELECT id, name, contact_email FROM `public`.tenants WHERE id = ?', [data.tenantId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Tenant bulunamadı' });
        }
        const tenant = rows[0];

        // 2. Gateway üzerinden oturum oluştur
        const sessionPayload: CheckoutSessionPayload = {
            tenantId: data.tenantId,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            email: tenant.contact_email,
            callbackUrl: data.callbackUrl || `${req.protocol}://${req.get('host')}/api/v1/saas-public/payment-callback`
        };

        const session = await GatewayService.createSession(sessionPayload);

        res.json({
            message: 'Ödeme oturumu başarıyla oluşturuldu',
            ...session,
            tenantName: tenant.name
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Checkout session error:', error);
        res.status(500).json({ error: error?.message || 'Ödeme oturumu oluşturulamadı' });
    }
};

/**
 * Global Webhook İşleyicisi
 * Gateway'den gelen JSON payload'u GatewayService'e iletir
 */
export const handleGatewayWebhook = async (req: Request, res: Response) => {
    const gateway = String(req.params.gateway || '');
    const payload = req.body;
    const headers = req.headers;

    console.log(`[GatewayController] Received webhook for ${gateway}...`);

    try {
        // 1. Doğrulama (Imza kontrolü vb.) - GatewayService içinde ya da burada yapılabilir
        // Şimdilik simülasyon olarak başarılı kabul ediyoruz
        
        // Mock payload structure based on common gateways
        let tenantId = payload.tenantId || payload.orderId;
        const amount = payload.amount || payload.total;
        
        if (!tenantId) {
            // Stripe/Iyzico metadata içinde de olabilir
            tenantId = payload.data?.object?.metadata?.tenantId || payload.conversationId;
        }

        if (tenantId && amount) {
            await GatewayService.processSuccessfulPayment({
                tenantId,
                amount: Number(amount),
                currency: payload.currency || 'EUR',
                gateway,
                transactionId: payload.paymentId || payload.id || `TXN_${Date.now()}`,
                description: `Payment via ${gateway} Webhook`,
                paymentType: payload.paymentType || 'subscription'
            });

            // Başarılı ödeme akışını tetikliyoruz
            console.log(`✅ Webhook processed successfully for ${gateway}:${tenantId}`);
        }

        // Gateway'e 200 OK dön (Dönmezsen tekrar gönderirler)
        res.status(200).send('OK');
    } catch (error) {
        console.error(`❌ Webhook error for ${gateway}:`, error);
        res.status(500).json({ error: 'Webhook işlenemedi' });
    }
};

/**
 * Ödeme Sonrası Geri Dönüş (Callback)
 * Müşterinin (Tenant) ödeme sonrası yönlendirildiği sayfa backend'den geçerse:
 */
export const handlePaymentCallback = async (req: Request, res: Response) => {
    // Redirect to a frontend success/fail page
    const status = String(req.query.status || '');
    const tenantId = String(req.query.tenantId || '');
    
    console.log(`[GatewayController] Payment callback received: status=${status}, tenantId=${tenantId}`);
    
    // Uygulama başarısı veya hatası mesajını içeren POS adresine yönlendir
    const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/saas-payment-result?status=${status}&tenantId=${tenantId}`);
};
