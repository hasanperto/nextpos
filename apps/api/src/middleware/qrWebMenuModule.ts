import { Request, Response, NextFunction } from 'express';
import { isTenantQrWebMenuEnabled } from '../services/billing.service.js';

/**
 * Üretimde `qr_web_menu` lisansı olmadan `/api/v1/qr-web/*` engellenir.
 * Yerel: NODE_ENV !== production iken atlanır (QR_WEB_ENFORCE_MODULE=1 ile zorlanır).
 * Kaçış: QR_WEB_SKIP_MODULE_CHECK=1
 */
function shouldSkipModuleCheck(): boolean {
    const skip = process.env.QR_WEB_SKIP_MODULE_CHECK;
    if (skip === '1' || skip === 'true') return true;
    const enforce = process.env.QR_WEB_ENFORCE_MODULE;
    if (enforce === '1' || enforce === 'true') return false;
    return process.env.NODE_ENV !== 'production';
}

export async function requireQrWebMenuModule(req: Request, res: Response, next: NextFunction) {
    try {
        if (shouldSkipModuleCheck()) {
            next();
            return;
        }
        const tenantId = req.tenantId;
        if (!tenantId) {
            res.status(500).json({ error: 'Tenant çözümlenemedi', code: 'TENANT_MISSING' });
            return;
        }
        const ok = await isTenantQrWebMenuEnabled(tenantId);
        if (!ok) {
            res.status(403).json({
                error: 'QR Web Menü modülü bu restoran için aktif değil veya pakete dahil değil.',
                code: 'QR_WEB_MENU_FORBIDDEN',
            });
            return;
        }
        next();
    } catch (e) {
        next(e);
    }
}
