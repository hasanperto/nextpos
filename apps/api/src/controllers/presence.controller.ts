import { Request, Response } from 'express';
import { presenceSnapshot, presenceSnapshotAll } from '../socket/presenceRegistry.js';

/** GET /api/v1/tenants/presence — tüm kiracılar (süper admin) */
export function getAllTenantPresenceHandler(req: Request, res: Response) {
    if (!req.user?.isSaaSAdmin) {
        return res.status(403).json({ error: 'Sadece platform yöneticisi' });
    }
    res.json({ byTenant: presenceSnapshotAll() });
}

/** GET /api/v1/tenants/presence/:tenantId — tek kiracı */
export function getTenantPresenceHandler(req: Request, res: Response) {
    if (!req.user?.isSaaSAdmin) {
        return res.status(403).json({ error: 'Sadece platform yöneticisi' });
    }
    const raw = req.params.tenantId;
    const tenantId = Array.isArray(raw) ? raw[0] : raw;
    if (!tenantId || typeof tenantId !== 'string') {
        return res.status(400).json({ error: 'tenantId gerekli' });
    }
    res.json({ tenantId, staff: presenceSnapshot(tenantId) });
}
