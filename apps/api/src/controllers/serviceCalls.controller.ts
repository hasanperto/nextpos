import { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { resolveServiceCallWaiterTarget } from '../lib/service-call-waiter-target.js';
import { getServiceCallEscalationSecondsFromDb } from '../lib/service-call-settings.js';

const patchStatusSchema = z.object({
    status: z.enum(['seen', 'in_progress', 'completed']),
});

async function ensureServiceCallsTargetUserColumn(connection: any): Promise<void> {
    try {
        await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS target_user_id INTEGER NULL`);
    } catch {
        /* ignore */
    }
}

/** Kasiyer çağrısında masa olmayabilir (table_id NULL) */
async function ensureServiceCallsTableIdNullable(connection: any): Promise<void> {
    try {
        await connection.query(`ALTER TABLE service_calls ALTER COLUMN table_id DROP NOT NULL`);
    } catch {
        /* ignore */
    }
}

async function ensureServiceCallAssigneeColumns(connection: any): Promise<void> {
    try {
        await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS assignee_set_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ NULL`);
    } catch {
        /* ignore */
    }
    try {
        await connection.query(`UPDATE service_calls SET assignee_set_at = created_at WHERE assignee_set_at IS NULL`);
    } catch {
        /* ignore */
    }
}

/** GET /api/v1/service-calls?status=pending&limit=40 */
export const listServiceCallsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
        const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 40));

        const allowed = new Set(['pending', 'seen', 'in_progress', 'completed']);
        const st = allowed.has(status) ? status : 'pending';

        const rows = await withTenant(tenantId, async (connection) => {
            await ensureServiceCallsTargetUserColumn(connection);
            await ensureServiceCallsTableIdNullable(connection);
            await ensureServiceCallAssigneeColumns(connection);
            const [r]: any = await connection.query(
                `SELECT sc.id, sc.table_id, sc.session_id, sc.call_type, sc.status, sc.message,
                        sc.created_at, sc.assignee_set_at, sc.responded_at, sc.responded_by, sc.target_user_id,
                        COALESCE(t.name, 'Kasiyer') AS table_name
                 FROM service_calls sc
                 LEFT JOIN tables t ON t.id = sc.table_id
                 WHERE sc.status = ?
                 ORDER BY sc.created_at ASC
                 LIMIT ?`,
                [st, limit]
            );
            return Array.isArray(r) ? r : [];
        });

        res.json(rows);
    } catch (e) {
        console.error('listServiceCallsHandler', e);
        res.status(500).json({ error: 'Servis çağrıları yüklenemedi' });
    }
};

const createCashierServiceCallSchema = z.object({
    /** İsteğe bağlı; yoksa kasiyer ekranından masa bağlantısız çağrı */
    tableId: z.number().int().positive().optional(),
    targetWaiterId: z.number().int().positive().nullable().optional(),
    message: z.string().max(500).optional(),
});

/** POST /api/v1/service-calls/from-cashier — kasiyer seçili garsona garson çağrısı */
export const createCashierServiceCallHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = createCashierServiceCallSchema.parse(req.body);

        const result = await withTenantTransaction(tenantId, async (connection) => {
            await ensureServiceCallsTargetUserColumn(connection);
            await ensureServiceCallsTableIdNullable(connection);
            await ensureServiceCallAssigneeColumns(connection);

            const explicitTargetWaiterId =
                data.targetWaiterId != null && Number.isFinite(Number(data.targetWaiterId))
                    ? Number(data.targetWaiterId)
                    : null;
            if (explicitTargetWaiterId != null) {
                const [wRows]: any = await connection.query(
                    `SELECT id, name, role, status FROM users WHERE id = ? AND role = 'waiter' AND status = 'active'`,
                    [explicitTargetWaiterId]
                );
                if (!wRows?.length) {
                    throw new Error('WAITER_NOT_FOUND');
                }
            }

            const tid = data.tableId != null && Number.isFinite(Number(data.tableId)) ? Number(data.tableId) : null;
            let tableName = 'Kasiyer';
            let sessionWaiterId: number | null = null;
            let sessionId: number | null = null;
            let sectionId: number | null = null;

            if (tid != null) {
                const [tRows]: any = await connection.query(`SELECT id, name, section_id FROM tables WHERE id = ?`, [tid]);
                if (!tRows?.length) {
                    throw new Error('TABLE_NOT_FOUND');
                }
                tableName = String(tRows[0].name);
                sectionId =
                    tRows[0].section_id != null && Number.isFinite(Number(tRows[0].section_id))
                        ? Number(tRows[0].section_id)
                        : null;
                const [sRows]: any = await connection.query(
                    `SELECT id, waiter_id FROM table_sessions
                     WHERE table_id = ? AND status = 'active'
                     ORDER BY opened_at DESC LIMIT 1`,
                    [tid]
                );
                const sess = sRows?.[0];
                sessionId = sess?.id != null ? Number(sess.id) : null;
                sessionWaiterId = sess?.waiter_id != null ? Number(sess.waiter_id) : null;
            }

            const targetUserId =
                explicitTargetWaiterId == null
                    ? null // Tum garsonlara acik cagri
                    : await resolveServiceCallWaiterTarget(connection, {
                          sectionId,
                          sessionWaiterId,
                          explicitWaiterId: explicitTargetWaiterId,
                      });
            if (explicitTargetWaiterId != null && targetUserId == null) {
                throw new Error('NO_WAITER_AVAILABLE');
            }

            const msg =
                data.message?.trim() ||
                JSON.stringify({ from: 'cashier', cashierId: req.user?.userId ?? null });

            const [ins]: any = await connection.query(
                `INSERT INTO service_calls (table_id, session_id, call_type, status, message, target_user_id, assignee_set_at)
                 VALUES (?, ?, 'call_waiter', 'pending', ?, ?, CURRENT_TIMESTAMP)`,
                [tid, sessionId, msg, targetUserId]
            );
            const newId = ins.insertId as number;

            const [caRow]: any = await connection.query(`SELECT created_at FROM service_calls WHERE id = ?`, [newId]);
            const createdRaw = caRow?.[0]?.created_at;
            const createdAt =
                createdRaw != null ? new Date(createdRaw).toISOString() : new Date().toISOString();

            return {
                id: newId,
                tableId: tid,
                tableName,
                sessionWaiterId,
                targetWaiterId: targetUserId,
                createdAt,
                message: msg,
            };
        });

        const io = req.app.get('io');
        if (io) {
            const payload = {
                tenantId,
                serviceCallId: result.id,
                tableId: result.tableId,
                tableName: result.tableName,
                callType: 'call_waiter',
                message: result.message,
                waiterId: result.sessionWaiterId,
                targetWaiterId: result.targetWaiterId,
                fromCashier: true,
                createdAt: result.createdAt,
            };
            io.to(`tenant:${tenantId}`).emit('customer:service_call', payload);
            if (result.targetWaiterId != null) {
                io.to(`tenant:${tenantId}:waiter:${result.targetWaiterId}`).emit('customer:service_call', payload);
            }
        }

        res.status(201).json({ success: true, id: result.id });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'WAITER_NOT_FOUND') {
            return res.status(404).json({ error: 'Garson bulunamadı veya aktif değil' });
        }
        if (error.message === 'TABLE_NOT_FOUND') {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }
        if (error.message === 'NO_WAITER_AVAILABLE') {
            return res.status(409).json({ error: 'Müsait garson bulunamadı (tümü molada olabilir)' });
        }
        console.error('createCashierServiceCallHandler', error);
        res.status(500).json({ error: 'Çağrı oluşturulamadı' });
    }
};

/** PATCH /api/v1/service-calls/:id/status */
export const patchServiceCallStatusHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: 'Geçersiz id' });
        }
        const body = patchStatusSchema.parse(req.body);
        const userId = req.user?.userId != null ? Number(req.user.userId) : null;

        let tableIdForEmit: number | null = null;
        let callTypeForEmit: string | null = null;

        const branchId = req.branchId || 1;
        let takeoverAfterSec = 60;

        await withTenantTransaction(tenantId, async (connection) => {
            await ensureServiceCallsTargetUserColumn(connection);
            await ensureServiceCallsTableIdNullable(connection);
            await ensureServiceCallAssigneeColumns(connection);
            takeoverAfterSec = await getServiceCallEscalationSecondsFromDb(connection, branchId);
            /** PG: LEFT JOIN + FOR UPDATE dış birleşimde 500 üretir; oturum garsonu alt sorgu ile alınır */
            const [rows]: any = await connection.query(
                `SELECT sc.id, sc.table_id, sc.created_at, sc.assignee_set_at, sc.session_id, sc.target_user_id, sc.call_type,
                        (SELECT ts.waiter_id FROM table_sessions ts WHERE ts.id = sc.session_id) AS session_waiter_id
                 FROM service_calls sc
                 WHERE sc.id = ?
                 FOR UPDATE`,
                [id]
            );
            const row = rows?.[0];
            if (!row) {
                throw new Error('NOT_FOUND');
            }
            tableIdForEmit = row.table_id != null ? Number(row.table_id) : null;
            callTypeForEmit = row.call_type != null ? String(row.call_type) : null;

            const userIdNum = userId != null && Number.isFinite(Number(userId)) ? Number(userId) : null;
            const targetUid =
                row.target_user_id != null && Number.isFinite(Number(row.target_user_id))
                    ? Number(row.target_user_id)
                    : null;
            const sessionW =
                row.session_waiter_id != null && Number.isFinite(Number(row.session_waiter_id))
                    ? Number(row.session_waiter_id)
                    : null;
            const assigneeId = targetUid != null ? targetUid : sessionW;

            if (userIdNum != null && assigneeId != null && assigneeId !== userIdNum) {
                const gateRaw = row.assignee_set_at ?? row.created_at;
                const gateMs = new Date(gateRaw).getTime();
                if (Number.isFinite(gateMs) && Date.now() - gateMs < takeoverAfterSec * 1000) {
                    throw new Error(`TAKEOVER_TOO_EARLY:${takeoverAfterSec}`);
                }
            }

            let sql = `UPDATE service_calls SET status = ?, responded_at = CURRENT_TIMESTAMP`;
            const params: unknown[] = [body.status];
            if (userId != null && Number.isFinite(userId)) {
                sql += `, responded_by = ?`;
                params.push(userId);
            }
            sql += ` WHERE id = ?`;
            params.push(id);
            await connection.query(sql, params as any[]);

            /**
             * Aynı masada birden fazla bekleyen garson çağrısı kalırsa,
             * biri "in_progress" olduğunda yenilemede tekrar düşebilir.
             * Bu yüzden ilgili çağrıyı kabul ederken aynı masa için diğer pending call_waiter kayıtlarını kapat.
             */
            if (
                body.status === 'in_progress' &&
                callTypeForEmit === 'call_waiter' &&
                tableIdForEmit != null
            ) {
                const closeOthersParams: unknown[] = [];
                let closeOthersSql = `
                    UPDATE service_calls
                    SET status = 'seen',
                        responded_at = CURRENT_TIMESTAMP
                `;
                if (userId != null && Number.isFinite(userId)) {
                    closeOthersSql += `, responded_by = ?`;
                    closeOthersParams.push(userId);
                }
                closeOthersSql += `
                    WHERE table_id = ?
                      AND call_type = 'call_waiter'
                      AND status = 'pending'
                      AND id <> ?
                `;
                closeOthersParams.push(tableIdForEmit, id);
                await connection.query(closeOthersSql, closeOthersParams as any[]);
            }
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('service_call:updated', {
                id,
                status: body.status,
                tableId: tableIdForEmit,
            });
            if (
                body.status === 'in_progress' &&
                tableIdForEmit != null &&
                callTypeForEmit === 'call_waiter'
            ) {
                io.to(`tenant:${tenantId}:table:${tableIdForEmit}`).emit('customer:service_call_accepted', {
                    tenantId,
                    tableId: tableIdForEmit,
                    serviceCallId: id,
                });
            }
        }

        res.json({ success: true });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.issues });
        }
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Kayıt bulunamadı' });
        }
        if (typeof error.message === 'string' && error.message.startsWith('TAKEOVER_TOO_EARLY')) {
            const sec = Number(error.message.split(':')[1]) || 60;
            return res.status(403).json({
                error: `Atanmış personel ${sec} sn içinde yanıtlamadıysa çağrıyı devralabilirsiniz.`,
                code: 'TAKEOVER_TOO_EARLY',
                waitSeconds: sec,
            });
        }
        console.error('patchServiceCallStatusHandler', error);
        res.status(500).json({ error: 'Güncellenemedi' });
    }
};
