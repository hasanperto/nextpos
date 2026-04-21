/**
 * QR Web Menü: üst domain (QR_WEB_PARENT_DOMAIN) altında alt domain kaydı (tenant_qr_domains).
 * Modül `qr_web_menu` aktifken kullanılır; aaPanel / DNS wildcard ile eşleşir.
 */
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { invalidateDomainCache } from '../middleware/domainTenant.js';
import { withTenant } from '../lib/db.js';
import { isTenantQrWebMenuEnabled } from './billing.service.js';
import { provisionQrWebInAaPanel } from './qrWebAaPanelAutomation.service.js';

const QR_MODULE_CODE = 'qr_web_menu';

function normalizeDnsLabel(input: string): string {
    const s = input
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 40);
    return s || 'menu';
}

/** Restoran adından örn. qrpizzakebab — çakışmada sayı eklenir */
function baseLabelFromTenantName(name: string): string {
    const n = normalizeDnsLabel(name);
    const prefix = String(process.env.QR_WEB_SUBDOMAIN_PREFIX || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 8);
    let label = `${prefix}${n}`.slice(0, 32);
    if (label.length < 4) label = `${prefix}menu${n}`.slice(0, 32);
    return label;
}

export type ProvisionResult = {
    ok: boolean;
    domain: string | null;
    created: boolean;
    deployment?: {
        ok: boolean;
        siteDir?: string;
        confPath?: string;
        certIssued?: boolean;
        error?: string;
    };
    skipped?: string;
};

/**
 * Modül lisansı yoksa veya QR_WEB_PARENT_DOMAIN tanımlı değilse no-op (hata fırlatmaz).
 */
export async function provisionQrWebSubdomain(tenantId: string): Promise<ProvisionResult> {
    const enabled = await isTenantQrWebMenuEnabled(tenantId);
    if (!enabled) {
        return { ok: true, domain: null, created: false, skipped: 'qr_web_menu_module_disabled' };
    }

    const parent = (process.env.QR_WEB_PARENT_DOMAIN || '').trim().toLowerCase().replace(/^\./, '');
    if (!parent) {
        return { ok: true, domain: null, created: false, skipped: 'QR_WEB_PARENT_DOMAIN_unset' };
    }

    const existing = await prisma.tenantQrDomain.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { id: 'asc' },
    });
    if (existing) {
        return { ok: true, domain: existing.domain, created: false, skipped: 'already_provisioned' };
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            name: true,
            status: true,
            schemaName: true,
            subscriptionPlan: true,
            contactEmail: true,
            contactPhone: true,
            address: true,
            settings: true,
        },
    });
    if (!tenant || tenant.status !== 'active') {
        return { ok: false, domain: null, created: false, skipped: 'tenant_inactive' };
    }

    let branchSettings: unknown = {};
    try {
        const branchRows = await withTenant(tenantId, async (conn) => {
            const [rows]: any = await conn.query(
                `SELECT id, name, settings
                 FROM branches
                 ORDER BY id ASC
                 LIMIT 1`
            );
            return rows;
        });
        branchSettings = branchRows?.[0]?.settings ?? {};
    } catch {
        branchSettings = {};
    }

    let base = baseLabelFromTenantName(tenant.name);
    for (let attempt = 0; attempt < 40; attempt++) {
        const label =
            attempt === 0
                ? base
                : `${base.slice(0, 24)}${attempt}`.slice(0, 32);
        const fullDomain = `${label}.${parent}`;

        const row = await prisma.tenantQrDomain.findUnique({ where: { domain: fullDomain } });
        if (!row) {
            const created = await prisma.tenantQrDomain.create({
                data: {
                    tenantId,
                    domain: fullDomain,
                    isActive: true,
                    isVerified: false,
                },
            });
            try {
                const deployment = await provisionQrWebInAaPanel({
                    domain: fullDomain,
                    tenant: {
                        id: tenant.id,
                        name: tenant.name,
                        schemaName: tenant.schemaName,
                        status: tenant.status,
                        subscriptionPlan: tenant.subscriptionPlan,
                        contactEmail: tenant.contactEmail,
                        contactPhone: tenant.contactPhone,
                        address: tenant.address,
                        settings: tenant.settings ?? {},
                        branchSettings,
                    },
                });
                if (!deployment.ok) {
                    await prisma.tenantQrDomain.delete({ where: { id: created.id } });
                    invalidateDomainCache(fullDomain);
                    return {
                        ok: false,
                        domain: null,
                        created: false,
                        deployment: { ok: false, error: deployment.error },
                        skipped: 'aapanel_automation_failed',
                    };
                }

                await prisma.tenantQrDomain.update({
                    where: { id: created.id },
                    data: { isVerified: true, isActive: true },
                });
                invalidateDomainCache(fullDomain);
                return {
                    ok: true,
                    domain: fullDomain,
                    created: true,
                    deployment: {
                        ok: true,
                        siteDir: deployment.siteDir,
                        confPath: deployment.confPath,
                        certIssued: deployment.certIssued,
                    },
                };
            } catch (e: any) {
                await prisma.tenantQrDomain.delete({ where: { id: created.id } });
                invalidateDomainCache(fullDomain);
                return {
                    ok: false,
                    domain: null,
                    created: false,
                    deployment: { ok: false, error: String(e?.message || e) },
                    skipped: 'aapanel_automation_exception',
                };
            }
        }
        if (row.tenantId === tenantId) {
            invalidateDomainCache(fullDomain);
            return { ok: true, domain: fullDomain, created: false, skipped: 'already_provisioned' };
        }
        base = `${base.slice(0, 20)}${randomBytes(2).toString('hex')}`.slice(0, 32);
    }

    return { ok: false, domain: null, created: false, skipped: 'could_not_allocate_label' };
}

export async function getQrWebDomainInfo(tenantId: string): Promise<{
    moduleCode: string;
    moduleEnabled: boolean;
    parentDomainConfigured: boolean;
    domains: { domain: string; isActive: boolean; isVerified: boolean }[];
}> {
    const moduleEnabled = await isTenantQrWebMenuEnabled(tenantId);
    const parent = Boolean((process.env.QR_WEB_PARENT_DOMAIN || '').trim());
    const domains = await prisma.tenantQrDomain.findMany({
        where: { tenantId },
        select: { domain: true, isActive: true, isVerified: true },
        orderBy: { id: 'asc' },
    });
    return {
        moduleCode: QR_MODULE_CODE,
        moduleEnabled,
        parentDomainConfigured: parent,
        domains,
    };
}
