import { Router } from 'express';
import { 
    createCheckoutSession, 
    handleGatewayWebhook, 
    handlePaymentCallback 
} from '../controllers/gateway.controller.js';
import {
    postIyzicoResellerWalletTopupCallback,
    getIyzicoResellerWalletReturn,
    postPaytrResellerWalletNotify,
} from '../controllers/reseller-topup-public.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

export const saasPublicRouter = Router();

// ────────────────────────────────────────────────────────
// GLOBAL WEBHOOKLAR (Public - No Auth)
// ────────────────────────────────────────────────────────

// Stripe, Iyzico veya PayTR'den gelen asenkron bildirimler
saasPublicRouter.post('/webhooks/:gateway', handleGatewayWebhook);

saasPublicRouter.post('/callbacks/iyzico-reseller-topup', postIyzicoResellerWalletTopupCallback);
saasPublicRouter.get('/return/iyzico-reseller', getIyzicoResellerWalletReturn);
saasPublicRouter.post('/callbacks/paytr-reseller-topup', postPaytrResellerWalletNotify);

// Payment callback (Müşterinin ödeme sonrası yönlendirildiği URL)
saasPublicRouter.get('/payment-callback', handlePaymentCallback);

// ────────────────────────────────────────────────────────
// CHECKOUT OTURUMU (Auth Gerekli - SaaS Admin / Reseller)
// ────────────────────────────────────────────────────────

// Manuel ödeme linki oluşturma (Örn: "Ödeme hatırlatması gönder")
saasPublicRouter.post('/checkout', authMiddleware, requireRole('super_admin', 'reseller'), createCheckoutSession);

export default saasPublicRouter;
