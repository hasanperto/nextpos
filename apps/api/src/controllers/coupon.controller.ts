/**
 * NextPOS — Kupon & Kampanya API Controller
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
    ensureCouponTables,
    createCampaign,
    getCampaigns,
    updateCampaign,
    deleteCampaign,
    createCoupon,
    generateBulkCoupons,
    getCoupons,
    deleteCoupon,
    validateCoupon,
    redeemCoupon,
    findAutoApplyCampaign,
    getCouponStats,
} from '../services/coupon.service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const discountTypeSchema = z.enum(['percent', 'fixed', 'free_item', 'free_delivery']);
const audienceFilterSchema = z.enum(['all', 'tier_bronze', 'tier_silver', 'tier_gold', 'new_customer', 'vip']);
const couponStatusSchema = z.enum(['active', 'paused', 'expired', 'depleted']);

const createCampaignSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    discount_type: discountTypeSchema,
    discount_value: z.number().positive(),
    discount_item_id: z.number().optional(),
    target_category_id: z.number().int().positive().optional(),
    target_product_id: z.number().int().positive().optional(),
    applicable_order_types: z.string().optional(),
    min_order_amount: z.number().min(0).default(0),
    max_discount_amount: z.number().optional(),
    start_date: z.string(), // ISO date string
    end_date: z.string(),
    usage_limit_total: z.number().int().min(0).optional(),
    usage_limit_per_customer: z.number().int().min(0).optional(),
    audience_filter: audienceFilterSchema.default('all'),
    is_auto_apply: z.boolean().default(false),
});

const createCouponSchema = z.object({
    campaign_id: z.number().optional(),
    customer_id: z.number().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    discount_type: discountTypeSchema,
    discount_value: z.number().positive(),
    target_category_id: z.number().int().positive().optional(),
    target_product_id: z.number().int().positive().optional(),
    applicable_order_types: z.string().optional(),
    min_order_amount: z.number().min(0).default(0),
    max_discount_amount: z.number().optional(),
    valid_from: z.string().optional(),
    valid_until: z.string(),
    usage_limit: z.number().int().min(0).default(0),
});

const generateBulkSchema = z.object({
    campaign_id: z.number(),
    count: z.number().int().min(1).max(1000),
    customer_ids: z.array(z.number()).optional(),
    phone_list: z.array(z.string()).optional(),
    valid_days: z.number().int().min(1).default(30),
});

const validateCouponSchema = z.object({
    code: z.string().min(1),
    order_amount: z.number().positive(),
    customer_id: z.number().optional(),
    order_type: z.string().optional(),
    cart_items: z.array(z.object({
        product_id: z.number(),
        category_id: z.number().optional(),
        price: z.number(),
        quantity: z.number()
    })).optional(),
});

const redeemCouponSchema = z.object({
    code: z.string().min(1),
    order_id: z.number(),
    order_amount: z.number().positive(),
    customer_id: z.number().optional(),
    order_type: z.string().optional(),
    cart_items: z.array(z.object({
        product_id: z.number(),
        category_id: z.number().optional(),
        price: z.number(),
        quantity: z.number()
    })).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// KAMPANYA ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

export const createCampaignHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createCampaignSchema.parse(req.body);

        const campaign = await createCampaign(tenantId, data);

        res.status(201).json(campaign);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        console.error('createCampaignHandler:', error);
        res.status(500).json({ error: 'Kampanya oluşturulamadı' });
    }
};

export const getCampaignsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { status } = req.query;

        await ensureCouponTables(tenantId);
        
        const campaigns = await getCampaigns(
            tenantId,
            status as any
        );

        res.json(campaigns);
    } catch (error: any) {
        console.error('getCampaignsHandler error:', error.message || error);
        res.status(500).json({ error: 'Kampanyalar yüklenemedi' });
    }
};

export const updateCampaignHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const campaignId = Number(req.params.id);

        if (!campaignId) {
            return res.status(400).json({ error: 'Geçersiz kampanya ID' });
        }

        const campaign = await updateCampaign(tenantId, campaignId, req.body);

        res.json(campaign);
    } catch (error: any) {
        console.error('updateCampaignHandler:', error);
        res.status(500).json({ error: 'Kampanya güncellenemedi' });
    }
};

export const deleteCampaignHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const campaignId = Number(req.params.id);

        if (!campaignId) {
            return res.status(400).json({ error: 'Geçersiz kampanya ID' });
        }

        await deleteCampaign(tenantId, campaignId);

        res.json({ ok: true, message: 'Kampanya silindi' });
    } catch (error: any) {
        console.error('deleteCampaignHandler:', error);
        res.status(500).json({ error: 'Kampanya silinemedi' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// KUPON ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

export const createCouponHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createCouponSchema.parse(req.body);

        const coupon = await createCoupon(tenantId, data);

        res.status(201).json(coupon);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        console.error('createCouponHandler:', error);
        res.status(500).json({ error: 'Kupon oluşturulamadı' });
    }
};

export const generateBulkCouponsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = generateBulkSchema.parse(req.body);

        const coupons = await generateBulkCoupons(
            tenantId,
            data.campaign_id,
            data.count,
            {
                customer_ids: data.customer_ids,
                phone_list: data.phone_list,
                valid_days: data.valid_days,
            }
        );

        res.status(201).json({
            created: coupons.length,
            coupons: coupons.map(c => ({
                code: c.code,
                phone: c.phone,
                customer_id: c.customer_id,
            })),
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'CAMPAIGN_NOT_FOUND') {
            return res.status(404).json({ error: 'Kampanya bulunamadı' });
        }
        console.error('generateBulkCouponsHandler:', error);
        res.status(500).json({ error: 'Toplu kupon üretilemedi' });
    }
};

export const getCouponsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { status, customer_id, campaign_id } = req.query;

        const coupons = await getCoupons(tenantId, {
            status: status as any,
            customer_id: customer_id ? Number(customer_id) : undefined,
            campaign_id: campaign_id ? Number(campaign_id) : undefined,
        });

        res.json(coupons);
    } catch (error: any) {
        console.error('getCouponsHandler:', error);
        res.status(500).json({ error: 'Kuponlar yüklenemedi' });
    }
};

export const deleteCouponHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const couponId = Number(req.params.id);

        if (!couponId) {
            return res.status(400).json({ error: 'Geçersiz kupon ID' });
        }

        await deleteCoupon(tenantId, couponId);

        res.json({ ok: true, message: 'Kupon silindi' });
    } catch (error: any) {
        console.error('deleteCouponHandler:', error);
        res.status(500).json({ error: 'Kupon silinemedi' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOĞRULAMA & KULLANIM
// ═══════════════════════════════════════════════════════════════════════════════

export const validateCouponHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = validateCouponSchema.parse(req.body);

        const result = await validateCoupon(
            tenantId,
            data.code,
            data.order_amount,
            data.customer_id,
            data.order_type,
            data.cart_items
        );

        res.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        console.error('validateCouponHandler:', error);
        res.status(500).json({ error: 'Kupon doğrulanamadı' });
    }
};

export const redeemCouponHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = redeemCouponSchema.parse(req.body);

        const result = await redeemCoupon(
            tenantId,
            data.code,
            data.order_id,
            data.order_amount,
            data.customer_id,
            data.order_type,
            data.cart_items
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        console.error('redeemCouponHandler:', error);
        res.status(500).json({ error: 'Kupon kullanılamadı' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// İSTATİSTİK
// ═══════════════════════════════════════════════════════════════════════════════

export const getCouponStatsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;

        const stats = await getCouponStats(tenantId);

        res.json(stats);
    } catch (error: any) {
        console.error('getCouponStatsHandler:', error);
        res.status(500).json({ error: 'İstatistikler yüklenemedi' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SMS İLE DAĞITIM (WhatsApp Service entegrasyonu)
// ═══════════════════════════════════════════════════════════════════════════════

export const sendCouponsViaSmsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { campaign_id, phone_list, valid_days } = req.body;

        if (!campaign_id || !Array.isArray(phone_list) || phone_list.length === 0) {
            return res.status(400).json({ error: 'campaign_id ve phone_list zorunludur' });
        }

        // Kuponları oluştur
        const coupons = await generateBulkCoupons(
            tenantId,
            campaign_id,
            phone_list.length,
            { phone_list, valid_days: valid_days || 30 }
        );

        // WhatsApp servisi ile gönder (opsiyonel)
        try {
            const { WhatsAppService } = await import('../services/whatsapp.service.js');
            const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER || '';
            const apiKey = process.env.WHATSAPP_API_KEY || '';
            const waEnabled = Boolean(phoneNumber && apiKey);

            for (const coupon of coupons) {
                if (coupon.phone) {
                    await WhatsAppService.sendTextMessage({
                        tenantId,
                        to: coupon.phone,
                        message: `🎁 NextPOS Kampanyası!\n\nKupon Kodunuz: ${coupon.code}\nGeçerlilik: ${valid_days || 30} gün\n\nİyi alışverişler!`,
                        settings: {
                            enabled: waEnabled,
                            phoneNumber,
                            apiKey,
                        },
                    });
                }
            }
        } catch (e) {
            console.warn('WhatsApp gönderimi başarısız:', e);
            // SMS başarısız olsa bile kuponlar oluşturuldu
        }

        res.json({
            ok: true,
            created: coupons.length,
            message: `${coupons.length} kupon oluşturuldu ve SMS gönderimi başlatıldı`,
        });
    } catch (error: any) {
        console.error('sendCouponsViaSmsHandler:', error);
        res.status(500).json({ error: 'SMS dağıtımı başlatılamadı' });
    }
};
