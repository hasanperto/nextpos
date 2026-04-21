import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';

type ReservationStatus = 'reserved' | 'seated' | 'cancelled' | 'no_show';

async function ensureReservationsTable(conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await conn.query(`
        CREATE TABLE IF NOT EXISTS table_reservations (
            id SERIAL PRIMARY KEY,
            table_id INT NULL REFERENCES tables(id) ON DELETE SET NULL,
            customer_name VARCHAR(160) NOT NULL,
            phone VARCHAR(30) NULL,
            guest_count INT NOT NULL DEFAULT 2,
            reservation_at TIMESTAMP NOT NULL,
            notes TEXT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'reserved',
            created_by INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

export const listReservationsAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        const status = String(req.query.status || '');

        const rows = await withTenant(tenantId, async (conn: any) => {
            await ensureReservationsTable(conn);
            const where: string[] = [];
            const params: unknown[] = [];
            if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
                where.push('r.reservation_at >= ?::date');
                params.push(from);
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
                where.push('r.reservation_at < (?::date + INTERVAL \'1 day\')');
                params.push(to);
            }
            if (['reserved', 'seated', 'cancelled', 'no_show'].includes(status)) {
                where.push('r.status = ?');
                params.push(status);
            }
            const q = `
                SELECT
                    r.*,
                    t.name AS table_name,
                    s.name AS section_name
                FROM table_reservations r
                LEFT JOIN tables t ON t.id = r.table_id
                LEFT JOIN sections s ON s.id = t.section_id
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY r.reservation_at ASC, r.id ASC
            `;
            const [data]: any = await conn.query(q, params);
            return Array.isArray(data) ? data : [];
        });
        res.json(rows);
    } catch (e) {
        console.error('listReservationsAdmin', e);
        res.status(500).json({ error: 'Rezervasyonlar yüklenemedi' });
    }
};

export const createReservationAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const {
            table_id = null,
            customer_name,
            phone = null,
            guest_count = 2,
            reservation_at,
            notes = null,
            status = 'reserved',
        } = req.body || {};

        if (!customer_name || !String(customer_name).trim()) {
            return res.status(400).json({ error: 'customer_name zorunlu' });
        }
        if (!reservation_at || Number.isNaN(new Date(String(reservation_at)).getTime())) {
            return res.status(400).json({ error: 'Geçerli reservation_at zorunlu' });
        }
        if (!['reserved', 'seated', 'cancelled', 'no_show'].includes(String(status))) {
            return res.status(400).json({ error: 'Geçersiz status' });
        }

        const created = await withTenant(tenantId, async (conn: any) => {
            await ensureReservationsTable(conn);
            const [ins]: any = await conn.query(
                `INSERT INTO table_reservations
                    (table_id, customer_name, phone, guest_count, reservation_at, notes, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    table_id || null,
                    String(customer_name).trim(),
                    phone ? String(phone).trim() : null,
                    Math.max(1, Number(guest_count) || 1),
                    new Date(String(reservation_at)).toISOString(),
                    notes ? String(notes) : null,
                    status,
                    req.user?.userId ?? null,
                ]
            );
            if (table_id && status === 'reserved') {
                await conn.query(
                    `UPDATE tables SET status = 'reserved' WHERE id = ? AND status IN ('available', 'reserved')`,
                    [table_id]
                );
            }
            return ins;
        });
        res.status(201).json({ ok: true, id: created.insertId });
    } catch (e) {
        console.error('createReservationAdmin', e);
        res.status(500).json({ error: 'Rezervasyon oluşturulamadı' });
    }
};

export const updateReservationAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Geçersiz id' });

        await withTenant(tenantId, async (conn: any) => {
            await ensureReservationsTable(conn);
            const [rows]: any = await conn.query(`SELECT * FROM table_reservations WHERE id = ?`, [id]);
            const prev = rows?.[0];
            if (!prev) throw new Error('NOT_FOUND');

            const parts: string[] = [];
            const vals: unknown[] = [];
            const body = req.body || {};
            if (body.customer_name != null) {
                parts.push('customer_name = ?');
                vals.push(String(body.customer_name).trim());
            }
            if (body.phone != null) {
                parts.push('phone = ?');
                vals.push(body.phone ? String(body.phone).trim() : null);
            }
            if (body.guest_count != null) {
                parts.push('guest_count = ?');
                vals.push(Math.max(1, Number(body.guest_count) || 1));
            }
            if (body.reservation_at != null) {
                const dt = new Date(String(body.reservation_at));
                if (Number.isNaN(dt.getTime())) throw new Error('INVALID_DATE');
                parts.push('reservation_at = ?');
                vals.push(dt.toISOString());
            }
            if (body.notes != null) {
                parts.push('notes = ?');
                vals.push(body.notes ? String(body.notes) : null);
            }
            if (body.table_id != null) {
                parts.push('table_id = ?');
                vals.push(body.table_id || null);
            }
            if (body.status != null) {
                if (!['reserved', 'seated', 'cancelled', 'no_show'].includes(String(body.status))) {
                    throw new Error('INVALID_STATUS');
                }
                parts.push('status = ?');
                vals.push(String(body.status));
            }
            if (parts.length === 0) return;

            parts.push('updated_at = CURRENT_TIMESTAMP');
            vals.push(id);
            await conn.query(`UPDATE table_reservations SET ${parts.join(', ')} WHERE id = ?`, vals);

            const nextStatus = String(body.status ?? prev.status);
            const nextTableId = Number(body.table_id ?? (prev.table_id || 0));
            if (nextTableId > 0) {
                if (nextStatus === 'reserved') {
                    await conn.query(`UPDATE tables SET status = 'reserved' WHERE id = ? AND status IN ('available', 'reserved')`, [nextTableId]);
                } else if (nextStatus === 'seated') {
                    await conn.query(`UPDATE tables SET status = 'occupied' WHERE id = ?`, [nextTableId]);
                } else if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
                    await conn.query(`UPDATE tables SET status = 'available' WHERE id = ? AND status = 'reserved'`, [nextTableId]);
                }
            }
        });

        res.json({ ok: true });
    } catch (e: any) {
        if (e.message === 'NOT_FOUND') return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
        if (e.message === 'INVALID_STATUS') return res.status(400).json({ error: 'Geçersiz status' });
        if (e.message === 'INVALID_DATE') return res.status(400).json({ error: 'Geçersiz tarih' });
        console.error('updateReservationAdmin', e);
        res.status(500).json({ error: 'Rezervasyon güncellenemedi' });
    }
};

export const deleteReservationAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Geçersiz id' });

        await withTenant(tenantId, async (conn: any) => {
            await ensureReservationsTable(conn);
            const [rows]: any = await conn.query(`SELECT table_id, status FROM table_reservations WHERE id = ?`, [id]);
            const row = rows?.[0];
            if (!row) throw new Error('NOT_FOUND');
            await conn.query(`DELETE FROM table_reservations WHERE id = ?`, [id]);
            if (row.table_id && row.status === 'reserved') {
                await conn.query(`UPDATE tables SET status = 'available' WHERE id = ? AND status = 'reserved'`, [row.table_id]);
            }
        });
        res.json({ ok: true });
    } catch (e: any) {
        if (e.message === 'NOT_FOUND') return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
        console.error('deleteReservationAdmin', e);
        res.status(500).json({ error: 'Rezervasyon silinemedi' });
    }
};

