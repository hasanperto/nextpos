import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { withTenant } from '../lib/db.js';
import { ensureUsersWaiterSectionColumns, pickLeastLoadedWaiterForSection } from '../lib/waiterSectionColumns.js';
import { getServiceCallEscalationSecondsFromDb } from '../lib/service-call-settings.js';

function parseCashierIdFromMessage(message: unknown): number | null {
    if (typeof message !== 'string' || !message.trim()) return null;
    try {
        const parsed = JSON.parse(message);
        const from = parsed?.from;
        const cashierId = Number(parsed?.cashierId);
        if (from === 'cashier' && Number.isFinite(cashierId) && cashierId > 0) {
            return cashierId;
        }
    } catch {
        /* ignore */
    }
    return null;
}

async function ensureServiceCallEscalationColumns(connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ NULL`);
    await connection.query(
        `ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS assignee_set_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
    );
    try {
        await connection.query(`UPDATE service_calls SET assignee_set_at = created_at WHERE assignee_set_at IS NULL`);
    } catch {
        /* ignore */
    }
}

/**
 * Bekleyen garson çağrıları: atanmış hedef assignee_set_at üzerinden (admin ayarı, varsayılan 60 sn) yanıt yoksa başka garsona iletir (bir kez).
 */
export async function runServiceCallEscalationTick(io: SocketServer | undefined): Promise<void> {
    const tenants = await prisma.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
    });

    for (const { id: tenantId } of tenants) {
        try {
            await withTenant(tenantId, async (connection: any) => {
                await ensureUsersWaiterSectionColumns(connection);
                await ensureServiceCallEscalationColumns(connection);
                try {
                    await connection.query(`ALTER TABLE service_calls ADD COLUMN IF NOT EXISTS target_user_id INTEGER NULL`);
                } catch {
                    /* ignore */
                }

                const staleSec = await getServiceCallEscalationSecondsFromDb(connection, 1);

                const [rows]: any = await connection.query(
                    `SELECT sc.id, sc.table_id, sc.session_id, sc.target_user_id, sc.call_type, sc.message, sc.assignee_set_at,
                            t.section_id,
                            (SELECT ts.waiter_id FROM table_sessions ts WHERE ts.id = sc.session_id) AS session_waiter_id,
                            COALESCE(t.name, '') AS table_name
                     FROM service_calls sc
                     LEFT JOIN tables t ON t.id = sc.table_id
                     WHERE sc.status = 'pending'
                       AND sc.call_type = 'call_waiter'
                       AND sc.escalated_at IS NULL
                       AND sc.assignee_set_at < NOW() - (? * INTERVAL '1 second')`,
                    [staleSec]
                );

                const list = Array.isArray(rows) ? rows : [];
                for (const row of list) {
                    const scId = Number(row.id);
                    if (!Number.isFinite(scId)) continue;

                    const sectionId =
                        row.section_id != null && Number.isFinite(Number(row.section_id))
                            ? Number(row.section_id)
                            : null;

                    let currentTarget: number | null =
                        row.target_user_id != null && Number.isFinite(Number(row.target_user_id))
                            ? Number(row.target_user_id)
                            : null;
                    if (currentTarget == null && row.session_waiter_id != null) {
                        currentTarget = Number(row.session_waiter_id);
                    }
                    if (currentTarget == null || !Number.isFinite(currentTarget)) continue;

                    const replacement = await pickLeastLoadedWaiterForSection(connection, sectionId, {
                        excludeUserIds: [currentTarget],
                    });
                    if (replacement == null || replacement === currentTarget) continue;

                    const [updMeta]: any = await connection.query(
                        `UPDATE service_calls
                         SET target_user_id = ?,
                             assignee_set_at = CURRENT_TIMESTAMP,
                             escalated_at = CURRENT_TIMESTAMP
                         WHERE id = ? AND status = 'pending' AND escalated_at IS NULL`,
                        [replacement, scId]
                    );
                    const affected = Number(updMeta?.affectedRows ?? 0);
                    if (!affected) continue;

                    const tableId =
                        row.table_id != null && Number.isFinite(Number(row.table_id)) ? Number(row.table_id) : null;
                    const tableName = String(row.table_name || '');

                    if (io) {
                        const cashierId = parseCashierIdFromMessage(row.message);
                        const payload = {
                            tenantId,
                            serviceCallId: scId,
                            tableId,
                            tableName,
                            callType: 'call_waiter',
                            waiterId:
                                row.session_waiter_id != null && Number.isFinite(Number(row.session_waiter_id))
                                    ? Number(row.session_waiter_id)
                                    : null,
                            targetWaiterId: replacement,
                            escalated: true,
                            /** Yeni atanan garson için devralma penceresi */
                            createdAt: new Date().toISOString(),
                        };
                        io.to(`tenant:${tenantId}`).emit('customer:service_call', payload);
                        io.to(`tenant:${tenantId}:waiter:${replacement}`).emit('customer:service_call', payload);
                        if (cashierId != null) {
                            io.to(`tenant:${tenantId}`).emit('cashier:service_call_unanswered', {
                                tenantId,
                                serviceCallId: scId,
                                cashierId,
                                targetWaiterId: currentTarget,
                                redirectedWaiterId: replacement,
                                waitedSeconds: staleSec,
                            });
                        }
                    }
                }
            });
        } catch (e) {
            console.warn('[service-call-escalation]', tenantId, e);
        }
    }
}
