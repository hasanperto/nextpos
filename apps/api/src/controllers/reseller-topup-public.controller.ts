import type { Request, Response } from 'express';
import {
    handleIyzicoResellerTopupCallback,
    handleIyzicoResellerBrowserReturn,
    handlePaytrResellerTopupNotify,
} from '../services/reseller-hosted-topup.service.js';

/** iyzico sunucu bildirimi (checkout form) */
export const postIyzicoResellerWalletTopupCallback = async (req: Request, res: Response) => {
    try {
        const token = String(req.body?.token ?? req.query?.token ?? '');
        await handleIyzicoResellerTopupCallback(token);
        return res.status(200).type('text/plain').send('OK');
    } catch (e) {
        console.error('[iyzico reseller callback]', e);
        return res.status(500).type('text/plain').send('FAIL');
    }
};

/** iyzico ödeme sonrası tarayıcı dönüşü */
export const getIyzicoResellerWalletReturn = async (req: Request, res: Response) => {
    try {
        const tid = Number(req.query?.tid);
        const { redirectUrl } = await handleIyzicoResellerBrowserReturn(tid);
        return res.redirect(302, redirectUrl);
    } catch (e) {
        console.error('[iyzico reseller return]', e);
        const base = process.env.RESELLER_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:4001';
        return res.redirect(302, `${base}/?topup=stripe_cancel`);
    }
};

/** PayTR bildirim (merchant_notify_url) */
export const postPaytrResellerWalletNotify = async (req: Request, res: Response) => {
    try {
        const body = req.body as Record<string, string>;
        const out = await handlePaytrResellerTopupNotify(body);
        return res.status(200).type('text/plain').send(out);
    } catch (e) {
        console.error('[paytr reseller notify]', e);
        return res.status(500).type('text/plain').send('FAIL');
    }
};
