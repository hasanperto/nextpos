import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

const domainCache = new Map<string, { tenantId: string; ts: number }>();
const CACHE_TTL = 30_000;

function extractDomain(req: Request): string {
    const host = (req.hostname || req.headers.host || '').toLowerCase().split(':')[0];
    return host.replace(/^\[|\]$/g, '');
}

function isLocalDevHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

export async function domainTenantMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const domain = extractDomain(req);
        if (!domain) {
            return res.status(400).json({ error: 'Domain belirlenemedi' });
        }

        const allowLocalHeader =
            process.env.NODE_ENV !== 'production' && isLocalDevHost(domain);

        if (allowLocalHeader) {
            const raw = req.headers['x-tenant-id'];
            const fromHeader = typeof raw === 'string' ? raw.trim() : '';
            const fromEnv = (process.env.DEV_QR_WEB_TENANT_ID || '').trim();
            const tenantId = fromHeader || fromEnv;
            if (!tenantId) {
                return res.status(400).json({
                    error: 'Yerel geliştirme: istemci x-tenant-id göndermeli veya API .env içinde DEV_QR_WEB_TENANT_ID tanımlı olmalı',
                });
            }
            const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
            if (!tenant || tenant.status !== 'active') {
                return res.status(403).json({ error: 'Restoran bulunamadı veya pasif' });
            }
            req.tenantId = tenantId;
            next();
            return;
        }

        let tenantId: string | null = null;

        const cached = domainCache.get(domain);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            tenantId = cached.tenantId;
        } else {
            const record = await prisma.tenantQrDomain.findUnique({
                where: { domain },
            });
            if (!record || !record.isActive) {
                return res.status(404).json({ error: 'Bu domain için QR menü kaydı bulunamadı' });
            }
            tenantId = record.tenantId;
            domainCache.set(domain, { tenantId, ts: Date.now() });
        }

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId! } });
        if (!tenant || tenant.status !== 'active') {
            return res.status(403).json({ error: 'Restoran bulunamadı veya pasif' });
        }

        req.tenantId = tenantId!;
        next();
    } catch (e) {
        console.error('domainTenantMiddleware', e);
        res.status(500).json({ error: 'Domain doğrulanamadı' });
    }
}

export function invalidateDomainCache(domain?: string) {
    if (domain) {
        domainCache.delete(domain);
    } else {
        domainCache.clear();
    }
}
