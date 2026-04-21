import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { withTenant } from '../lib/db.js';
import { getCategoriesHandler, getProductsHandler } from './menu.controller.js';
import {
    resolveTableByQrHandler,
    createQrMenuOrderHandler,
    createQrServiceCallHandler,
    createExternalOrderHandler,
    trackOrderHandler,
    qrIdentifyCustomerHandler,
    qrMenuSpotlightHandler,
} from './qr.controller.js';

export {
    resolveTableByQrHandler as qrWebResolveTableHandler,
    createQrMenuOrderHandler as qrWebCreateOrderHandler,
    createQrServiceCallHandler as qrWebServiceCallHandler,
    createExternalOrderHandler as qrWebExternalOrderHandler,
    trackOrderHandler as qrWebTrackOrderHandler,
    qrIdentifyCustomerHandler as qrWebIdentifyHandler,
    qrMenuSpotlightHandler as qrWebSpotlightHandler,
};

export const qrWebCategoriesHandler = (req: Request, res: Response) => getCategoriesHandler(req, res);
export const qrWebProductsHandler = (req: Request, res: Response) => getProductsHandler(req, res);

export const qrWebConfigHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                id: true,
                name: true,
                settings: true,
                contactPhone: true,
                address: true,
            },
        });

        if (!tenant) {
            return res.status(404).json({ error: 'Restoran bulunamadı' });
        }

        const settings = (tenant.settings as Record<string, any>) || {};

        let currency = 'EUR';
        try {
            const tenantSettings = await withTenant(tenantId, async (connection) => {
                const [rows]: any = await connection.query(
                    `SELECT key, value FROM settings WHERE key IN ('currency', 'restaurant_logo', 'theme_color', 'default_lang') LIMIT 10`
                );
                return rows || [];
            });
            for (const row of tenantSettings) {
                if (row.key === 'currency') currency = row.value;
            }
        } catch {
            // settings tablosu yoksa veya boşsa varsayılan
        }

        res.json({
            tenantId: tenant.id,
            restaurantName: tenant.name,
            phone: tenant.contactPhone,
            address: tenant.address,
            currency,
            logo: settings.restaurant_logo || settings.logo || null,
            themeColor: settings.theme_color || settings.themeColor || '#e11d48',
            languages: settings.languages || ['tr', 'de', 'en'],
            defaultLang: settings.default_lang || settings.defaultLang || 'tr',
        });
    } catch (e) {
        console.error('qrWebConfigHandler', e);
        res.status(500).json({ error: 'Restoran bilgisi alınamadı' });
    }
};
