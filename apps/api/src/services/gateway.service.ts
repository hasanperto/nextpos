import { queryPublic } from '../lib/db.js';

export interface PaymentGatewayConfig {
    iyzico_api_key?: string;
    iyzico_secret_key?: string;
    paytr_merchant_id?: string;
    paytr_merchant_key?: string;
    paytr_merchant_salt?: string;
    stripe_public_key?: string;
    stripe_secret_key?: string;
    active_gateway: 'iyzico' | 'paytr' | 'stripe' | 'none';
    /** SaaS Ayarları: 1 = sandbox/test (iyzico URI, PayTR test_mode, Stripe sk_test_ beklenir) */
    virtual_pos_test_mode?: number | boolean;
}

export function isVirtualPosTestMode(config: PaymentGatewayConfig): boolean {
    const v = config.virtual_pos_test_mode;
    if (v === true || v === 1) return true;
    if (typeof v === 'string' && (v === '1' || String(v).toLowerCase() === 'true')) return true;
    return false;
}

export interface CheckoutSessionPayload {
    tenantId: string;
    amount: number;
    currency: string;
    description: string;
    callbackUrl: string;
    email?: string;
    items?: { id: string; name: string; price: number; quantity: number }[];
}

/** Bayi cüzdan kart yüklemesi — aktif sanal POS geçidine göre yönlendirilir */
export interface ResellerWalletTopupCheckoutPayload {
    resellerId: number;
    amount: number;
    note: string | null;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string | null;
}

export type ResellerWalletTopupCheckoutResult = {
    topupId: number;
    checkoutUrl: string;
    gateway: 'stripe' | 'iyzico' | 'paytr';
};

export class GatewayService {
    static async getConfig(): Promise<PaymentGatewayConfig> {
        try {
            const [rows]: any = await queryPublic('SELECT * FROM `public`.system_settings WHERE id = 1');
            const row = rows[0] || { active_gateway: 'none' };
            const raw = row.virtual_pos_test_mode;
            const virtual_pos_test_mode =
                raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true' ? 1 : 0;
            return { ...row, virtual_pos_test_mode };
        } catch (error) {
            console.error('❌ Failed to fetch gateway config:', error);
            return { active_gateway: 'none', virtual_pos_test_mode: 0 };
        }
    }

    static async createSession(payload: CheckoutSessionPayload) {
        const config = await this.getConfig();
        const gateway = config.active_gateway;

        if (gateway === 'none') {
            throw new Error('Aktif bir ödeme geçidi yapılandırılmamış. Lütfen SaaS ayarlarından bir ödeme geçidi seçin.');
        }

        console.log(`[GatewayService] Creating checkout session for ${gateway}...`, {
            tenantId: payload.tenantId,
            amount: payload.amount,
            currency: payload.currency
        });

        switch (gateway) {
            case 'iyzico':
                return this.createIyzicoSession(config, payload);
            case 'stripe':
                return this.createStripeSession(config, payload);
            case 'paytr':
                return this.createPayTRSession(config, payload);
            default:
                throw new Error('Desteklenmeyen ödeme geçidi');
        }
    }

    /**
     * Bayi cüzdan “kart” yüklemesi — SaaS Ayarları’ndaki **aktif sanal POS geçidi** (`active_gateway`).
     * Stripe: Checkout + webhook. iyzico: Checkout Form + callback. PayTR: iframe + merchant_notify.
     */
    static async createResellerWalletTopupCheckout(
        payload: ResellerWalletTopupCheckoutPayload
    ): Promise<ResellerWalletTopupCheckoutResult> {
        const config = await this.getConfig();
        const gateway = config.active_gateway;

        if (gateway === 'none') {
            throw new Error(
                'Aktif sanal POS geçidi yok. SaaS Ayarları → Ödeme geçidinden Stripe, iyzico veya PayTR seçin.'
            );
        }

        switch (gateway) {
            case 'stripe': {
                const { createStripeResellerWalletTopupCheckout } = await import('./reseller-stripe-topup.service.js');
                const out = await createStripeResellerWalletTopupCheckout(payload, {
                    virtualPosTestMode: isVirtualPosTestMode(config),
                });
                return { topupId: out.topupId, checkoutUrl: out.checkoutUrl, gateway: 'stripe' };
            }
            case 'iyzico': {
                const { createIyzicoResellerWalletTopupCheckout } = await import('./reseller-hosted-topup.service.js');
                const out = await createIyzicoResellerWalletTopupCheckout(config, payload);
                return { topupId: out.topupId, checkoutUrl: out.checkoutUrl, gateway: 'iyzico' };
            }
            case 'paytr': {
                const { createPaytrResellerWalletTopupCheckout } = await import('./reseller-hosted-topup.service.js');
                const out = await createPaytrResellerWalletTopupCheckout(config, payload);
                return { topupId: out.topupId, checkoutUrl: out.checkoutUrl, gateway: 'paytr' };
            }
            default:
                throw new Error('Desteklenmeyen ödeme geçidi');
        }
    }

    private static async createIyzicoSession(config: PaymentGatewayConfig, payload: CheckoutSessionPayload) {
        // İleride gerçek iyzico Node.js SDK'sı entegre edilecek (iyzipay)
        // Şimdilik API endpoint'lerine simülasyon veya dummy URL dönüyoruz
        return {
            status: 'success',
            gateway: 'iyzico',
            paymentUrl: `https://sandbox-checkout.iyzipay.com/auth/mock?token=mock_tok_${payload.tenantId}_${Date.now()}`,
            token: `token_${payload.tenantId}_${Date.now()}`,
            expiryDate: 3600
        };
    }

    private static async createStripeSession(config: PaymentGatewayConfig, payload: CheckoutSessionPayload) {
        // Stripe Checkout Session API simülasyonu
        return {
            status: 'success',
            gateway: 'stripe',
            paymentUrl: `https://checkout.stripe.com/pay/mock_cs_${payload.tenantId}_${Date.now()}`,
            sessionId: `cs_test_${payload.tenantId}_${Date.now()}`
        };
    }

    private static async createPayTRSession(config: PaymentGatewayConfig, payload: CheckoutSessionPayload) {
        // PayTR iframe API simülasyonu
        return {
            status: 'success',
            gateway: 'paytr',
            paymentUrl: `https://www.paytr.com/odeme/guvenli/mock_${payload.tenantId}`,
            token: `paytr_token_${payload.tenantId}_${Date.now()}`
        };
    }

    /**
     * Webhook doğrulama ve işlem tamamlama
     * Bu metod hem webhook endpoint'lerinden hem de manuel başarı sorgulamalarından çağrılabilir.
     */
    static async processSuccessfulPayment(params: {
        tenantId: string,
        amount: number,
        currency: string,
        gateway: string,
        transactionId: string,
        description: string,
        paymentType?: string // 'subscription', 'addon', 'license'
    }) {
        console.log(`[GatewayService] Processing successful payment for tenant ${params.tenantId}...`);

        try {
            // 1. Ödeme kaydını oluştur
            const [result]: any = await queryPublic(`
                INSERT INTO \`public\`.payment_history 
                (tenant_id, amount, currency, payment_type, payment_method, status, description, paid_at)
                VALUES (?, ?, ?, ?, ?, 'paid', ?, NOW())
            `, [
                params.tenantId,
                params.amount,
                params.currency,
                params.paymentType || 'subscription',
                params.gateway,
                params.description
            ]);

            // 2. Fatura oluştur (opsiyonel, billing service handle edebilir)
            
            // 3. Eğer abonelik ise tenant vade tarihini uzat
            if (params.paymentType === 'subscription') {
                await queryPublic(`
                    UPDATE \`public\`.tenants 
                    SET license_expires_at = COALESCE(license_expires_at, NOW()) + INTERVAL '1 month',
                        status = 'active'
                    WHERE id = ?
                `, [params.tenantId]);
            }

            return { success: true, paymentId: result.insertId };
        } catch (error) {
            console.error('❌ Error processing payment:', error);
            throw error;
        }
    }
}
