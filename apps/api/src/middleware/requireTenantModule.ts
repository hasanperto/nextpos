import { Request, Response, NextFunction } from 'express';
import { isTenantModuleEnabled } from '../services/billing.service.js';

/** Yerelde tam deneme için: DEV_SKIP_TENANT_MODULE_ENFORCEMENT=1 */
function skipEnforcement(): boolean {
    const v = process.env.DEV_SKIP_TENANT_MODULE_ENFORCEMENT;
    return v === '1' || v === 'true';
}

/**
 * Kiracı JWT’si ile gelen isteklerde modül satın alma / plan dahil kontrolü.
 * SaaS süper admin istekleri tenant modülü gerektirmez.
 */
export function requireTenantModule(moduleCode: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (skipEnforcement()) {
                next();
                return;
            }
            if (req.user?.isSaaSAdmin) {
                next();
                return;
            }
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(403).json({ error: 'Tenant gerekli', code: 'TENANT_REQUIRED' });
                return;
            }
            const ok = await isTenantModuleEnabled(tenantId, moduleCode);
            if (!ok) {
                res.status(403).json({
                    error: 'Bu özellik mevcut paketinizde aktif değil.',
                    code: 'MODULE_NOT_ENTITLED',
                    module: moduleCode,
                });
                return;
            }
            next();
        } catch (e) {
            next(e);
        }
    };
}
