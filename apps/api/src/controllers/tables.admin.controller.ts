import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { randomUUID } from 'crypto';
import { emitTenantTablesStale } from '../lib/tenantSocketEmit.js';

export const listSectionsAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const rows = await withTenant(tenantId, async (conn) => {
            const [r]: any = await conn.query(
                'SELECT * FROM sections ORDER BY sort_order ASC, id ASC'
            );
            return r;
        });
        res.json(Array.isArray(rows) ? rows : []);
    } catch (e) {
        console.error('listSectionsAdmin', e);
        res.status(500).json({ error: 'Bölgeler yüklenemedi' });
    }
};

export const createSection = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { name, floor = 0, sort_order = 0, is_active = true, branch_id, layout_data } = req.body;
        if (!name || String(name).trim() === '') {
            return res.status(400).json({ error: 'name zorunlu' });
        }
        const result = await withTenant(tenantId, async (conn) => {
            const [ins]: any = await conn.query(
                `INSERT INTO sections (name, floor, sort_order, is_active, branch_id, layout_data)
                 VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
                [
                    String(name).trim(),
                    Number(floor) || 0,
                    Number(sort_order) || 0,
                    is_active !== false,
                    branch_id || null,
                    layout_data != null ? JSON.stringify(layout_data) : '{}',
                ]
            );
            return ins;
        });
        emitTenantTablesStale(req);
        res.status(201).json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('createSection', e);
        res.status(500).json({ error: 'Bölge oluşturulamadı' });
    }
};

export const updateSection = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        const { name, floor, sort_order, is_active, layout_data } = req.body;
        await withTenant(tenantId, async (conn) => {
            const parts: string[] = [];
            const vals: any[] = [];
            if (name != null) {
                parts.push('name = ?');
                vals.push(name);
            }
            if (floor != null) {
                parts.push('floor = ?');
                vals.push(floor);
            }
            if (sort_order != null) {
                parts.push('sort_order = ?');
                vals.push(sort_order);
            }
            if (is_active != null) {
                parts.push('is_active = ?');
                vals.push(is_active);
            }
            if (layout_data != null) {
                parts.push('layout_data = ?::jsonb');
                vals.push(JSON.stringify(layout_data));
            }
            if (parts.length === 0) {
                return;
            }
            vals.push(id);
            await conn.query(`UPDATE sections SET ${parts.join(', ')} WHERE id = ?`, vals);
        });
        emitTenantTablesStale(req);
        res.json({ success: true });
    } catch (e) {
        console.error('updateSection', e);
        res.status(500).json({ error: 'Bölge güncellenemedi' });
    }
};

export const deleteSection = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        await withTenantTransaction(tenantId, async (conn) => {
            const [cnt]: any = await conn.query('SELECT COUNT(*)::int AS c FROM tables WHERE section_id = ?', [id]);
            const n = Number(cnt?.[0]?.c ?? 0);
            if (n > 0) {
                throw new Error('SECTION_HAS_TABLES');
            }
            await conn.query('DELETE FROM sections WHERE id = ?', [id]);
        });
        emitTenantTablesStale(req);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message === 'SECTION_HAS_TABLES') {
            return res.status(400).json({ error: 'Önce bu bölgedeki masaları silin veya taşıyın' });
        }
        console.error('deleteSection', e);
        res.status(500).json({ error: 'Bölge silinemedi' });
    }
};

export const createTable = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const {
            section_id,
            name,
            translations = {},
            capacity = 4,
            shape = 'square',
            position_x,
            position_y,
            branch_id,
        } = req.body;
        if (!section_id || !name) {
            return res.status(400).json({ error: 'section_id ve name zorunlu' });
        }
        const qr = `T-${randomUUID().slice(0, 8)}`;
        const result = await withTenant(tenantId, async (conn) => {
            const [ins]: any = await conn.query(
                `INSERT INTO tables (section_id, name, translations, capacity, shape, position_x, position_y, qr_code, branch_id)
                 VALUES (?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)`,
                [
                    section_id,
                    String(name).trim(),
                    JSON.stringify(translations),
                    capacity,
                    shape,
                    position_x ?? null,
                    position_y ?? null,
                    qr,
                    branch_id || null,
                ]
            );
            return ins;
        });
        emitTenantTablesStale(req);
        res.status(201).json({ success: true, id: result.insertId, qr_code: qr });
    } catch (e) {
        console.error('createTable', e);
        res.status(500).json({ error: 'Masa oluşturulamadı' });
    }
};

export const updateTable = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        const { section_id, name, translations, capacity, shape, position_x, position_y, status } = req.body;
        await withTenant(tenantId, async (conn) => {
            const parts: string[] = [];
            const vals: any[] = [];
            if (section_id != null) {
                parts.push('section_id = ?');
                vals.push(section_id);
            }
            if (name != null) {
                parts.push('name = ?');
                vals.push(name);
            }
            if (translations != null) {
                parts.push('translations = ?::jsonb');
                vals.push(JSON.stringify(translations));
            }
            if (capacity != null) {
                parts.push('capacity = ?');
                vals.push(capacity);
            }
            if (shape != null) {
                parts.push('shape = ?');
                vals.push(shape);
            }
            if (position_x != null) {
                parts.push('position_x = ?');
                vals.push(position_x);
            }
            if (position_y != null) {
                parts.push('position_y = ?');
                vals.push(position_y);
            }
            if (status != null) {
                parts.push('status = ?');
                vals.push(status);
            }
            if (parts.length === 0) {
                return;
            }
            vals.push(id);
            await conn.query(`UPDATE tables SET ${parts.join(', ')} WHERE id = ?`, vals);
        });
        emitTenantTablesStale(req);
        res.json({ success: true });
    } catch (e) {
        console.error('updateTable', e);
        res.status(500).json({ error: 'Masa güncellenemedi' });
    }
};

export const deleteTable = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        await withTenantTransaction(tenantId, async (conn) => {
            const [rows]: any = await conn.query(
                'SELECT current_session_id FROM tables WHERE id = ?',
                [id]
            );
            const sid = rows?.[0]?.current_session_id;
            if (sid) {
                throw new Error('TABLE_OCCUPIED');
            }
            await conn.query('DELETE FROM tables WHERE id = ?', [id]);
        });
        emitTenantTablesStale(req);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message === 'TABLE_OCCUPIED') {
            return res.status(400).json({ error: 'Aktif oturumu olan masa silinemez' });
        }
        console.error('deleteTable', e);
        res.status(500).json({ error: 'Masa silinemedi' });
    }
};

export const bulkGenerateTables = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const {
            section_id,
            prefix = 'Masa',
            start = 1,
            end = 4,
            capacity = 4,
            shape = 'square',
            branch_id,
            translations_prefix = { tr: 'Masa', en: 'Table', de: 'Tisch' }
        } = req.body;

        if (!section_id) return res.status(400).json({ error: 'section_id zorunlu' });

        const count = Number(end) - Number(start) + 1;
        if (count <= 0 || count > 100) {
            return res.status(400).json({ error: 'Geçersiz aralık (max 100)' });
        }

        await withTenantTransaction(tenantId, async (conn) => {
            for (let i = Number(start); i <= Number(end); i++) {
                const name = `${prefix} ${i}`;
                const translations: any = {};
                if (translations_prefix) {
                    Object.entries(translations_prefix).forEach(([lang, p]) => {
                        translations[lang] = `${p} ${i}`;
                    });
                }
                const qr = `T-${randomUUID().slice(0, 8)}`;
                await conn.query(
                    `INSERT INTO tables (section_id, name, translations, capacity, shape, qr_code, branch_id)
                     VALUES (?, ?, ?::jsonb, ?, ?, ?, ?)`,
                    [
                        section_id,
                        name,
                        JSON.stringify(translations),
                        capacity,
                        shape,
                        qr,
                        branch_id || null
                    ]
                );
            }
        });

        emitTenantTablesStale(req);
        res.json({ success: true, count });
    } catch (e) {
        console.error('bulkGenerateTables', e);
        res.status(500).json({ error: 'Toplu masa üretilemedi' });
    }
};
