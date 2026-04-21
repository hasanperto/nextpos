import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * JWT olmadan sadece x-tenant-id ile kiracı bağlamı (QR menü gibi halka açık uçlar).
 */
export async function publicTenantMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const raw = req.headers['x-tenant-id'];
        const tenantId = typeof raw === 'string' ? raw.trim() : '';
        if (!tenantId) {
            return res.status(400).json({ error: 'x-tenant-id başlığı gerekli' });
        }

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant || tenant.status !== 'active') {
            return res.status(403).json({ error: 'Restoran bulunamadı veya pasif' });
        }

        req.tenantId = tenantId;
        next();
    } catch (e) {
        console.error('publicTenantMiddleware', e);
        res.status(500).json({ error: 'Tenant doğrulanamadı' });
    }
}
