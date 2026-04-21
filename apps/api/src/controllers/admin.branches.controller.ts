import { Request, Response } from 'express';
import { z } from 'zod';
import { queryPublic, withTenant } from '../lib/db.js';
import { migrateBillingTables } from '../services/billing.service.js';

const createBranchSchema = z.object({
    name: z.string().min(1),
    address: z.string().optional(),
    phone: z.string().optional(),
    default_language: z.string().optional(),
});

const updateBranchSchema = createBranchSchema.partial();

async function getMaxBranchesForTenant(tenantId: string): Promise<number> {
    await migrateBillingTables();
    const tid = String(tenantId).trim();
    const [rows]: any = await queryPublic(
        `SELECT sp.max_branches AS mb
         FROM "public".tenants t
         LEFT JOIN "public".subscription_plans sp ON LOWER(TRIM(sp.code)) = LOWER(TRIM(t.subscription_plan))
         WHERE t.id::text = ?`,
        [tid],
    );
    const mb = Number(rows?.[0]?.mb ?? 1);
    return Number.isFinite(mb) && mb > 0 ? mb : 1;
}

export const listBranchesAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const payload = await withTenant(tenantId, async (conn) => {
            const [rows]: any = await conn.query(
                `SELECT id, name, address, phone, default_language, is_online, last_sync, created_at
                 FROM branches
                 ORDER BY id ASC`,
            );
            return Array.isArray(rows) ? rows : [];
        });
        const maxBranches = await getMaxBranchesForTenant(tenantId);
        res.json({ branches: payload, maxBranches });
    } catch (e) {
        console.error('listBranchesAdmin', e);
        res.status(500).json({ error: 'Şubeler yüklenemedi' });
    }
};

export const createBranchAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createBranchSchema.parse(req.body);
        const maxBranches = await getMaxBranchesForTenant(tenantId);

        const result = await withTenant(tenantId, async (conn) => {
            const [cnt]: any = await conn.query(`SELECT COUNT(*)::int as c FROM branches`);
            const currentCount = Number(cnt?.[0]?.c ?? 0);
            if (currentCount >= maxBranches) {
                throw new Error(`LIMIT_BRANCHES:${maxBranches}`);
            }

            const [baseRows]: any = await conn.query(
                `SELECT settings, supported_languages, tax_number
                 FROM branches
                 ORDER BY id ASC
                 LIMIT 1`,
            );
            const base = baseRows?.[0] ?? {};
            const settings = base.settings ?? {};
            const supported = base.supported_languages ?? 'de,tr,en';
            const taxNumber = base.tax_number ?? null;

            const [ins]: any = await conn.query(
                `INSERT INTO branches (name, address, phone, tax_number, default_language, supported_languages, settings, is_online)
                 VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, true)`,
                [
                    String(data.name).trim(),
                    data.address != null ? String(data.address) : null,
                    data.phone != null ? String(data.phone) : null,
                    taxNumber,
                    data.default_language != null ? String(data.default_language) : 'de',
                    supported,
                    JSON.stringify(settings),
                ],
            );
            return ins;
        });

        res.status(201).json({ success: true, id: result.insertId });
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: e.issues });
        }
        if (String(e?.message || '').startsWith('LIMIT_BRANCHES:')) {
            const max = String(e.message).split(':')[1] || '1';
            return res.status(403).json({
                error: `Şube kotası doldu (en fazla ${max}). Lütfen paketinizi yükseltin.`,
            });
        }
        console.error('createBranchAdmin', e);
        res.status(500).json({ error: 'Şube oluşturulamadı' });
    }
};

export const updateBranchAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });
        const data = updateBranchSchema.parse(req.body);
        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Güncellenecek alan yok' });

        await withTenant(tenantId, async (conn) => {
            const parts: string[] = [];
            const vals: any[] = [];
            if (data.name != null) {
                parts.push('name = ?');
                vals.push(String(data.name).trim());
            }
            if (data.address !== undefined) {
                parts.push('address = ?');
                vals.push(data.address != null ? String(data.address) : null);
            }
            if (data.phone !== undefined) {
                parts.push('phone = ?');
                vals.push(data.phone != null ? String(data.phone) : null);
            }
            if (data.default_language !== undefined) {
                parts.push('default_language = ?');
                vals.push(data.default_language != null ? String(data.default_language) : 'de');
            }
            vals.push(id);
            await conn.query(`UPDATE branches SET ${parts.join(', ')} WHERE id = ?`, vals);
        });

        res.json({ success: true });
    } catch (e: any) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: e.issues });
        }
        console.error('updateBranchAdmin', e);
        res.status(500).json({ error: 'Şube güncellenemedi' });
    }
};

export const deleteBranchAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });
        if (id === 1) return res.status(400).json({ error: 'Ana şube silinemez' });

        await withTenant(tenantId, async (conn) => {
            await conn.query(`DELETE FROM branches WHERE id = ?`, [id]);
        });
        res.json({ success: true });
    } catch (e) {
        console.error('deleteBranchAdmin', e);
        res.status(500).json({ error: 'Şube silinemedi' });
    }
};

