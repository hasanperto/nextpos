/**
 * NextPOS — Kupon & Kampanya Routes
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    createCampaignHandler,
    getCampaignsHandler,
    updateCampaignHandler,
    deleteCampaignHandler,
    createCouponHandler,
    generateBulkCouponsHandler,
    getCouponsHandler,
    deleteCouponHandler,
    validateCouponHandler,
    redeemCouponHandler,
    getCouponStatsHandler,
    sendCouponsViaSmsHandler,
} from '../controllers/coupon.controller.js';

export const couponsRouter = Router();

couponsRouter.use(authMiddleware);

// ── Kampanyalar ──
couponsRouter.post('/campaigns', createCampaignHandler);
couponsRouter.get('/campaigns', getCampaignsHandler);
couponsRouter.patch('/campaigns/:id', updateCampaignHandler);
couponsRouter.delete('/campaigns/:id', deleteCampaignHandler);

// ── Kuponlar ──
couponsRouter.post('/', createCouponHandler);
couponsRouter.post('/bulk', generateBulkCouponsHandler);
couponsRouter.get('/', getCouponsHandler);
couponsRouter.delete('/:id', deleteCouponHandler);

// ── Doğrulama & Kullanım ──
couponsRouter.post('/validate', validateCouponHandler);
couponsRouter.post('/redeem', redeemCouponHandler);

// ── İstatistikler ──
couponsRouter.get('/stats', getCouponStatsHandler);

// ── SMS Dağıtımı ──
couponsRouter.post('/send-sms', sendCouponsViaSmsHandler);

export default couponsRouter;
