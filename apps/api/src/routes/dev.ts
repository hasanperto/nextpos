import { Router } from 'express';
import { z } from 'zod';
import { withTenant } from '../lib/db.js';

const router = Router();

const resetDevicesSchema = z.object({
    tenantId: z.string().uuid(),
});

router.post('/reset-devices', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(404).json({ error: 'Not found' });
    }

    const ip = String(req.ip || '');
    const isLocal = ip.includes('127.0.0.1') || ip === '::1';
    if (!isLocal) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const { tenantId } = resetDevicesSchema.parse(req.body);
        const affected = await withTenant(tenantId, async (conn) => {
            const [r]: any = await conn.query(`UPDATE users SET device_id = NULL WHERE device_id IS NOT NULL`);
            return Number(r?.affectedRows ?? 0);
        });
        return res.json({ ok: true, affected });
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: e.issues });
        }
        console.error('dev/reset-devices error:', e);
        return res.status(500).json({ error: 'Reset başarısız' });
    }
});

export default router;

