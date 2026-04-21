import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { invalidateDomainCache } from '../middleware/domainTenant.js';

function routeStr(p: string | string[] | undefined): string {
    if (p == null) return '';
    return Array.isArray(p) ? String(p[0] ?? '') : String(p);
}

const domainSchema = z.object({
    domain: z
        .string()
        .min(5)
        .max(253)
        .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Geçersiz domain formatı')
        .transform((v) => v.toLowerCase()),
});

export const listQrDomainsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = routeStr(req.params.id);
        const domains = await prisma.tenantQrDomain.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(domains);
    } catch (e) {
        console.error('listQrDomainsHandler', e);
        res.status(500).json({ error: 'Domain listesi alınamadı' });
    }
};

export const addQrDomainHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = routeStr(req.params.id);
        const { domain } = domainSchema.parse(req.body);

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return res.status(404).json({ error: 'Restoran bulunamadı' });
        }

        const existing = await prisma.tenantQrDomain.findUnique({ where: { domain } });
        if (existing) {
            return res.status(409).json({ error: 'Bu domain zaten kayıtlı' });
        }

        const record = await prisma.tenantQrDomain.create({
            data: {
                tenantId,
                domain,
                isVerified: true,
                isActive: true,
            },
        });

        res.status(201).json(record);
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz domain', details: e.issues });
        }
        console.error('addQrDomainHandler', e);
        res.status(500).json({ error: 'Domain eklenemedi' });
    }
};

export const updateQrDomainHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = routeStr(req.params.id);
        const domainId = routeStr(req.params.domainId);
        const { isActive } = req.body;

        const record = await prisma.tenantQrDomain.findFirst({
            where: { id: Number(domainId), tenantId },
        });
        if (!record) {
            return res.status(404).json({ error: 'Domain kaydı bulunamadı' });
        }

        const updated = await prisma.tenantQrDomain.update({
            where: { id: record.id },
            data: {
                isActive: typeof isActive === 'boolean' ? isActive : record.isActive,
            },
        });

        invalidateDomainCache(record.domain);
        res.json(updated);
    } catch (e) {
        console.error('updateQrDomainHandler', e);
        res.status(500).json({ error: 'Domain güncellenemedi' });
    }
};

export const deleteQrDomainHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = routeStr(req.params.id);
        const domainId = routeStr(req.params.domainId);

        const record = await prisma.tenantQrDomain.findFirst({
            where: { id: Number(domainId), tenantId },
        });
        if (!record) {
            return res.status(404).json({ error: 'Domain kaydı bulunamadı' });
        }

        await prisma.tenantQrDomain.delete({ where: { id: record.id } });
        invalidateDomainCache(record.domain);

        res.json({ success: true });
    } catch (e) {
        console.error('deleteQrDomainHandler', e);
        res.status(500).json({ error: 'Domain silinemedi' });
    }
};

export const checkDomainAvailabilityHandler = async (req: Request, res: Response) => {
    try {
        const { domain } = domainSchema.parse({ domain: req.query.domain });

        const existing = await prisma.tenantQrDomain.findUnique({ where: { domain } });
        res.json({ available: !existing, domain });
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz domain', details: e.issues });
        }
        res.status(500).json({ error: 'Kontrol başarısız' });
    }
};
