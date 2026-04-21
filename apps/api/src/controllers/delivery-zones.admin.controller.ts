import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant } from '../lib/db.js';

const zoneBodySchema = z.object({
    name: z.string().min(1, 'İsim gerekli'),
    min_order: z.coerce.number().min(0).optional(),
    delivery_fee: z.coerce.number().min(0).optional(),
    est_minutes: z.coerce.number().int().min(1).optional(),
    polygon: z.any().nullable().optional(),
    is_active: z.boolean().optional(),
    branch_id: z.coerce.number().nullable().optional(),
});

const zoneUpdateSchema = zoneBodySchema.partial();

export const listDeliveryZonesAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const payload = await withTenant(tenantId, async (conn) => {
            const [zones]: any = await conn.query(
                'SELECT * FROM delivery_zones ORDER BY id ASC'
            );
            const [branches]: any = await conn.query(
                'SELECT id, name FROM branches ORDER BY id ASC'
            );
            return {
                zones: Array.isArray(zones) ? zones : [],
                branches: Array.isArray(branches) ? branches : [],
            };
        });
        res.json(payload);
    } catch (e) {
        console.error('listDeliveryZonesAdmin', e);
        res.status(500).json({ error: 'Teslimat bölgeleri yüklenemedi' });
    }
};

export const createDeliveryZoneAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = zoneBodySchema.parse(req.body);
        const minOrder = data.min_order ?? 0;
        const deliveryFee = data.delivery_fee ?? 0;
        const estMinutes = data.est_minutes ?? 30;
        const isActive = data.is_active !== false;
        const polygonVal =
            data.polygon === undefined || data.polygon === null
                ? null
                : JSON.stringify(data.polygon);

        const result = await withTenant(tenantId, async (conn) => {
            const [ins]: any = await conn.query(
                `INSERT INTO delivery_zones (name, min_order, delivery_fee, est_minutes, polygon, is_active, branch_id)
                 VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`,
                [
                    String(data.name).trim(),
                    minOrder,
                    deliveryFee,
                    estMinutes,
                    polygonVal,
                    isActive,
                    data.branch_id ?? null,
                ]
            );
            return ins;
        });
        res.status(201).json({ success: true, id: result.insertId });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: e.issues });
        }
        console.error('createDeliveryZoneAdmin', e);
        res.status(500).json({ error: 'Bölge oluşturulamadı' });
    }
};

export const updateDeliveryZoneAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: 'Geçersiz id' });
        }
        const data = zoneUpdateSchema.parse(req.body);
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan yok' });
        }

        await withTenant(tenantId, async (conn) => {
            const parts: string[] = [];
            const vals: any[] = [];
            if (data.name != null) {
                parts.push('name = ?');
                vals.push(String(data.name).trim());
            }
            if (data.min_order != null) {
                parts.push('min_order = ?');
                vals.push(data.min_order);
            }
            if (data.delivery_fee != null) {
                parts.push('delivery_fee = ?');
                vals.push(data.delivery_fee);
            }
            if (data.est_minutes != null) {
                parts.push('est_minutes = ?');
                vals.push(data.est_minutes);
            }
            if (data.polygon !== undefined) {
                parts.push('polygon = ?::jsonb');
                vals.push(
                    data.polygon === null ? null : JSON.stringify(data.polygon)
                );
            }
            if (data.is_active != null) {
                parts.push('is_active = ?');
                vals.push(data.is_active);
            }
            if (data.branch_id !== undefined) {
                parts.push('branch_id = ?');
                vals.push(data.branch_id);
            }
            vals.push(id);
            await conn.query(
                `UPDATE delivery_zones SET ${parts.join(', ')} WHERE id = ?`,
                vals
            );
        });
        res.json({ success: true });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: e.issues });
        }
        console.error('updateDeliveryZoneAdmin', e);
        res.status(500).json({ error: 'Bölge güncellenemedi' });
    }
};

export const deleteDeliveryZoneAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: 'Geçersiz id' });
        }
        await withTenant(tenantId, async (conn) => {
            await conn.query('DELETE FROM delivery_zones WHERE id = ?', [id]);
        });
        res.json({ success: true });
    } catch (e) {
        console.error('deleteDeliveryZoneAdmin', e);
        res.status(500).json({ error: 'Bölge silinemedi' });
    }
};
