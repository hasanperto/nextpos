/**
 * POS kiracısı JWT ile gelirken tenantId zaten authMiddleware tarafından set edilir.
 * SaaS (super_admin / reseller) token'ında tenant yok; kupon/kampanya yönetimi için
 * istemci x-tenant-id göndermeli. Reseller sadece kendi tenant'ları için kullanabilir.
 */
import type { Request, Response, NextFunction } from 'express';
import { queryPublic } from '../lib/db.js';

export async function couponTenantScopeMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        if (req.tenantId) {
            return next();
        }

        const u = req.user;
        if (!u?.isSaaSAdmin) {
            return res.status(401).json({
                error: 'Tenant bilgisi gerekli',
                code: 'TENANT_MISSING',
            });
        }

        const raw = req.headers['x-tenant-id'];
        const headerTenant = Array.isArray(raw) ? raw[0] : raw;
        const tid = String(headerTenant || '').trim();
        if (!tid) {
            return res.status(400).json({
                error: 'SaaS kupon yönetimi için x-tenant-id başlığı gerekli',
                code: 'TENANT_HEADER_REQUIRED',
            });
        }

        if (u.role === 'super_admin') {
            req.tenantId = tid;
            return next();
        }

        if (u.role === 'reseller') {
            const [rows]: any = await queryPublic(
                'SELECT id FROM `public`.tenants WHERE id = ? AND reseller_id = ? LIMIT 1',
                [tid, u.userId],
            );
            if (!Array.isArray(rows) || !rows.length) {
                return res.status(403).json({ error: 'Bu tenant için yetkiniz yok' });
            }
            req.tenantId = tid;
            return next();
        }

        return res.status(403).json({ error: 'Yetkisiz' });
    } catch (e) {
        console.error('couponTenantScopeMiddleware', e);
        return res.status(500).json({ error: 'Kiracı bağlamı oluşturulamadı' });
    }
}
