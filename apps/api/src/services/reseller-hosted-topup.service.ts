/**
 * Bayi cüzdan — iyzico Checkout Form & PayTR iframe (hosted / sanal POS).
 * Kart verisi bu sunucuya gelmez; ödeme sağlayıcı sayfasında tamamlanır.
 */
import { createRequire } from 'module';
import crypto from 'crypto';
import { queryPublic } from '../lib/db.js';
import type { PaymentGatewayConfig } from './gateway.service.js';
import { isVirtualPosTestMode } from './gateway.service.js';
import { creditResellerTopupAfterCardPayment } from './reseller-topup-credit.service.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Iyzipay: any = require('iyzipay');

export function getApiPublicBaseUrl(): string {
    const u = process.env.API_PUBLIC_BASE_URL?.trim() || process.env.PUBLIC_API_URL?.trim();
    return u ? u.replace(/\/$/, '') : '';
}

function iyzicoUri(apiKey: string, saasTestMode: boolean): string {
    const k = String(apiKey || '').toLowerCase();
    if (saasTestMode || k.includes('sandbox') || process.env.IYZICO_SANDBOX === '1') {
        return 'https://sandbox-api.iyzipay.com';
    }
    return process.env.IYZICO_URI?.trim() || 'https://api.iyzipay.com';
}

function iyzipayClient(config: PaymentGatewayConfig) {
    const apiKey = String(config.iyzico_api_key || '').trim();
    const secretKey = String(config.iyzico_secret_key || '').trim();
    const saasTest = isVirtualPosTestMode(config);
    return new Iyzipay({
        apiKey,
        secretKey,
        uri: iyzicoUri(apiKey, saasTest),
    });
}

function promisifyIyzico<T>(fn: (cb: (err: Error | null, result: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
        fn((err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

export async function createIyzicoResellerWalletTopupCheckout(
    config: PaymentGatewayConfig,
    payload: {
        resellerId: number;
        amount: number;
        note: string | null;
        successUrl: string;
        cancelUrl: string;
        customerEmail?: string | null;
    }
): Promise<{ topupId: number; checkoutUrl: string }> {
    const publicBase = getApiPublicBaseUrl();
    if (!publicBase) {
        throw new Error(
            'iyzico geri çağrısı için API_PUBLIC_BASE_URL ortam değişkenini ayarlayın (örn. https://api.sizin-domain.com).'
        );
    }
    const apiKey = String(config.iyzico_api_key || '').trim();
    const secretKey = String(config.iyzico_secret_key || '').trim();
    if (!apiKey || !secretKey) {
        throw new Error('iyzico API anahtarları eksik (SaaS Ayarları).');
    }

    const { resellerId, amount, note, successUrl, cancelUrl, customerEmail } = payload;
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

    const conversationId = `rwt_${topupId}`;
    const priceStr = amount.toFixed(2);
    const iyzipay = iyzipayClient(config);
    const callbackUrl = `${publicBase}/api/v1/saas-public/callbacks/iyzico-reseller-topup`;

    const request = {
        locale: Iyzipay.LOCALE.TR,
        conversationId,
        price: priceStr,
        paidPrice: priceStr,
        currency: Iyzipay.CURRENCY.EUR,
        basketId: `B_RWT_${topupId}`,
        paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
        callbackUrl,
        merchantReturnUrl: `${publicBase}/api/v1/saas-public/return/iyzico-reseller?tid=${topupId}`,
        enabledInstallments: [1],
        buyer: {
            id: `reseller_${resellerId}`,
            name: 'Bayi',
            surname: String(topupId),
            gsmNumber: '+900000000000',
            email: customerEmail || `reseller_${resellerId}@nextpos.local`,
            identityNumber: '11111111111',
            registrationAddress: 'NextPOS',
            ip: '127.0.0.1',
            city: 'Istanbul',
            country: 'Turkey',
            zipCode: '34000',
        },
        shippingAddress: {
            contactName: 'Bayi',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'NextPOS',
            zipCode: '34000',
        },
        billingAddress: {
            contactName: 'Bayi',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'NextPOS',
            zipCode: '34000',
        },
        basketItems: [
            {
                id: `RWT_${topupId}`,
                name: 'Bayi cüzdan yükleme',
                category1: 'Wallet',
                itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
                price: priceStr,
            },
        ],
    };

    try {
        const result = await promisifyIyzico<any>((cb) => iyzipay.checkoutFormInitialize.create(request, cb));
        if (result?.status !== 'success' || !result?.paymentPageUrl) {
            await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]);
            throw new Error(String(result?.errorMessage || 'iyzico oturumu oluşturulamadı'));
        }
        const token = String(result.token || '');
        if (!token) {
            await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]);
            throw new Error('iyzico token alınamadı');
        }
        await queryPublic(
            `UPDATE \`public\`.reseller_wallet_topup_requests SET stripe_checkout_session_id = ? WHERE id = ? AND status = 'awaiting_card'`,
            [token, topupId]
        );
        return { topupId, checkoutUrl: String(result.paymentPageUrl) };
    } catch (e) {
        await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]).catch(() => {});
        throw e;
    }
}

async function loadTopupReturnUrls(topupId: number): Promise<{ ok?: string; fail?: string }> {
    const [rows]: any = await queryPublic(
        `SELECT return_success_url, return_cancel_url FROM \`public\`.reseller_wallet_topup_requests WHERE id = ?`,
        [topupId]
    );
    const r = rows?.[0];
    return {
        ok: r?.return_success_url ? String(r.return_success_url).trim() : undefined,
        fail: r?.return_cancel_url ? String(r.return_cancel_url).trim() : undefined,
    };
}

/** iyzico sunucu bildirimi (POST token) veya tarayıcı dönüşü (GET tid + token) */
export async function handleIyzicoResellerTopupCallback(token: string): Promise<{ ok: boolean; redirectUrl: string }> {
    const resellerBase = process.env.RESELLER_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:4001';
    const fallbackOk = `${resellerBase}/?topup=stripe_ok`;
    const fallbackFail = `${resellerBase}/?topup=stripe_cancel`;

    if (!token?.trim()) {
        return { ok: false, redirectUrl: fallbackFail };
    }

    const { GatewayService } = await import('./gateway.service.js');
    const config = await GatewayService.getConfig();
    if (config.active_gateway !== 'iyzico') {
        return { ok: false, redirectUrl: fallbackFail };
    }

    const iyzipay = iyzipayClient(config);
    let result: any;
    try {
        result = await promisifyIyzico<any>((cb) =>
            iyzipay.checkoutForm.retrieve({ locale: Iyzipay.LOCALE.TR, token: token.trim() }, cb)
        );
    } catch {
        return { ok: false, redirectUrl: fallbackFail };
    }

    const conv = String(result?.conversationId || '');
    const m = /^rwt_(\d+)$/.exec(conv);
    const topupId = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(topupId)) {
        return { ok: false, redirectUrl: fallbackFail };
    }

    const ret = await loadTopupReturnUrls(topupId);

    const paidPrice = Number(String(result?.paidPrice ?? result?.price ?? 0).replace(',', '.'));
    const statusOk = result?.status === 'success' && String(result?.paymentStatus || '').toUpperCase() === 'SUCCESS';

    if (!statusOk || !Number.isFinite(paidPrice)) {
        return { ok: false, redirectUrl: ret.fail || fallbackFail };
    }

    const cr = await creditResellerTopupAfterCardPayment({
        topupId,
        amountPaid: paidPrice,
        externalRef: token.trim(),
        paymentHistoryMethod: 'iyzico',
        auditAction: 'reseller_wallet_topup_iyzico_paid',
        createdBy: 'iyzico_callback',
        description: `Bayi cüzdan — iyzico (talep #${topupId})`,
    });

    return { ok: cr.ok, redirectUrl: cr.ok ? ret.ok || fallbackOk : ret.fail || fallbackFail };
}

/** Tarayıcı: ?tid= talep no — kayıtlı iyzico token ile sonucu çeker */
export async function handleIyzicoResellerBrowserReturn(topupId: number): Promise<{ redirectUrl: string }> {
    const resellerBase = process.env.RESELLER_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:4001';
    const fallbackOk = `${resellerBase}/?topup=stripe_ok`;
    const fallbackFail = `${resellerBase}/?topup=stripe_cancel`;
    if (!Number.isFinite(topupId)) {
        return { redirectUrl: fallbackFail };
    }
    const [rows]: any = await queryPublic(
        `SELECT stripe_checkout_session_id FROM \`public\`.reseller_wallet_topup_requests WHERE id = ? AND status = 'awaiting_card'`,
        [topupId]
    );
    const tok = String(rows?.[0]?.stripe_checkout_session_id || '').trim();
    if (!tok) {
        return { redirectUrl: fallbackFail };
    }
    const r = await handleIyzicoResellerTopupCallback(tok);
    return { redirectUrl: r.redirectUrl };
}

/** PayTR: ödeme tutarı kuruş (TRY) veya minor unit; EUR için amount * 100 */
export async function createPaytrResellerWalletTopupCheckout(
    config: PaymentGatewayConfig,
    payload: {
        resellerId: number;
        amount: number;
        note: string | null;
        successUrl: string;
        cancelUrl: string;
        customerEmail?: string | null;
    }
): Promise<{ topupId: number; checkoutUrl: string }> {
    const publicBase = getApiPublicBaseUrl();
    if (!publicBase) {
        throw new Error('PayTR için API_PUBLIC_BASE_URL tanımlayın.');
    }
    const merchant_id = String(config.paytr_merchant_id || '').trim();
    const merchant_key = String(config.paytr_merchant_key || '').trim();
    const merchant_salt = String(config.paytr_merchant_salt || '').trim();
    if (!merchant_id || !merchant_key || !merchant_salt) {
        throw new Error('PayTR mağaza bilgileri eksik (SaaS Ayarları).');
    }

    const { resellerId, amount, note, successUrl, cancelUrl, customerEmail } = payload;
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

    const merchant_oid = `RWT${topupId}${Date.now()}`;
    const user_ip = '127.0.0.1';
    const email = customerEmail || `reseller_${resellerId}@nextpos.local`;
    const payment_amount = String(Math.round(amount * 100));
    const basketPrice = amount.toFixed(2);
    const user_basket = Buffer.from(JSON.stringify([['Bayi cüzdan yukleme', basketPrice, 1]])).toString('base64');
    const no_installment = '1';
    const max_installment = '0';
    const currency = 'EUR';
    const test_mode =
        process.env.PAYTR_TEST_MODE === '1' || isVirtualPosTestMode(config) ? '1' : '0';
    const hash_str = `${merchant_id}${user_ip}${merchant_oid}${email}${payment_amount}${user_basket}${no_installment}${max_installment}${currency}${test_mode}`;
    const paytr_token = crypto.createHmac('sha256', merchant_key).update(hash_str + merchant_salt).digest('base64');

    const merchant_ok_url = successUrl;
    const merchant_fail_url = cancelUrl;
    const merchant_notify_url = `${publicBase}/api/v1/saas-public/callbacks/paytr-reseller-topup`;

    const form = new URLSearchParams({
        merchant_id,
        user_ip,
        merchant_oid,
        email,
        payment_amount,
        paytr_token,
        user_basket,
        no_installment,
        max_installment,
        currency,
        test_mode,
        user_name: 'Bayi',
        user_address: 'NextPOS',
        user_phone: '05000000000',
        merchant_ok_url,
        merchant_fail_url,
        merchant_notify_url,
        debug_on: '1',
        lang: 'tr',
    });

    try {
        const r = await fetch('https://www.paytr.com/odeme/api/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        });
        const j = (await r.json()) as { status?: string; token?: string; reason?: string };
        if (j.status !== 'success' || !j.token) {
            await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]);
            throw new Error(String(j.reason || 'PayTR token alınamadı'));
        }
        await queryPublic(
            `UPDATE \`public\`.reseller_wallet_topup_requests SET stripe_checkout_session_id = ? WHERE id = ? AND status = 'awaiting_card'`,
            [merchant_oid, topupId]
        );
        return { topupId, checkoutUrl: `https://www.paytr.com/odeme/guvenli/${j.token}` };
    } catch (e) {
        await queryPublic(`UPDATE \`public\`.reseller_wallet_topup_requests SET status = 'checkout_failed' WHERE id = ?`, [topupId]).catch(() => {});
        throw e;
    }
}

export async function handlePaytrResellerTopupNotify(body: Record<string, string>): Promise<'OK' | 'FAIL'> {
    const { GatewayService } = await import('./gateway.service.js');
    const config = await GatewayService.getConfig();
    if (config.active_gateway !== 'paytr') {
        return 'FAIL';
    }
    const merchant_key = String(config.paytr_merchant_key || '').trim();
    const merchant_salt = String(config.paytr_merchant_salt || '').trim();
    const merchant_oid = body.merchant_oid || '';
    const status = body.status;
    const total_amount = body.total_amount || '';
    const hash = body.hash || '';

    if (!merchant_oid || !hash) {
        return 'FAIL';
    }

    const verify = crypto
        .createHmac('sha256', merchant_key)
        .update(merchant_oid + merchant_salt + status + total_amount)
        .digest('base64');

    if (verify !== hash) {
        return 'FAIL';
    }

    if (status !== 'success') {
        return 'OK';
    }

    const m = /^RWT(\d+)/.exec(merchant_oid);
    const topupId = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(topupId)) {
        return 'FAIL';
    }

    const amountPaid = Number(total_amount) / 100;
    const cr = await creditResellerTopupAfterCardPayment({
        topupId,
        amountPaid,
        externalRef: merchant_oid,
        paymentHistoryMethod: 'paytr',
        auditAction: 'reseller_wallet_topup_paytr_paid',
        createdBy: 'paytr_callback',
        description: `Bayi cüzdan — PayTR (talep #${topupId})`,
    });

    return cr.ok ? 'OK' : 'FAIL';
}
