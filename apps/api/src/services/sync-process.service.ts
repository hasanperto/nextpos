import type { Request } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import {
    createOrderSchema,
    checkoutOrderSchema,
    runTenantCreateOrder,
    runTenantCheckout,
} from '../controllers/orders.controller.js';
import { getEffectiveMaxDevices, getEffectiveMaxPrinters } from './billing.service.js';

export type SyncProcessResult = { processed: number; failed: number };

function emitOrderNew(
    io: SocketServer | undefined,
    tenantId: string,
    orderId: number,
    tableId: number | undefined,
    orderType: string,
    billing?: { maxPrinters: number; maxDevices: number }
) {
    if (!io) return;
    io.to(`tenant:${tenantId}`).emit('order:new', {
        orderId,
        tableId,
        orderType,
        ...(billing ? { billingLimits: billing } : {}),
    });
}

function emitCheckout(
    io: SocketServer | undefined,
    tenantId: string,
    orderId: number,
    tableId: number | undefined,
    orderType: string
) {
    if (!io) return;
    emitOrderNew(io, tenantId, orderId, tableId, orderType);
    io.to(`tenant:${tenantId}`).emit('payment:received', {
        orderId,
        paymentStatus: 'paid',
    });
}

/**
 * `pending` sync_queue satırlarını siparişe / ödemeye çevirir (offline POS senkronu).
 */
export async function processPendingSyncQueue(tenantId: string, req: Request): Promise<SyncProcessResult> {
    const io = req.app.get('io') as SocketServer | undefined;
    const rows = await prisma.syncQueue.findMany({
        where: { tenantId, status: 'pending' },
        orderBy: { createdAt: 'asc' },
    });

    let processed = 0;
    let failed = 0;

    for (const row of rows) {
        try {
            const payload = row.payload as Record<string, unknown>;

            if (row.entityType === 'pos_order') {
                const parsed = createOrderSchema.safeParse(payload);
                if (!parsed.success) {
                    throw new Error(`VALIDATION: ${parsed.error.message}`);
                }
                const order = await runTenantCreateOrder(tenantId, parsed.data, req);
                let billing: { maxPrinters: number; maxDevices: number } | undefined;
                try {
                    const [mp, md] = await Promise.all([
                        getEffectiveMaxPrinters(tenantId),
                        getEffectiveMaxDevices(tenantId),
                    ]);
                    billing = { maxPrinters: mp.total, maxDevices: md.total };
                } catch {
                    /* kotasız devam */
                }
                emitOrderNew(
                    io,
                    tenantId,
                    Number(order.id),
                    parsed.data.tableId,
                    parsed.data.orderType,
                    billing
                );
            } else if (row.entityType === 'pos_checkout') {
                const parsed = checkoutOrderSchema.safeParse(payload);
                if (!parsed.success) {
                    throw new Error(`VALIDATION: ${parsed.error.message}`);
                }
                const out = await runTenantCheckout(tenantId, parsed.data, req);
                emitCheckout(
                    io,
                    tenantId,
                    Number(out.order.id),
                    parsed.data.tableId,
                    parsed.data.orderType
                );
            } else {
                throw new Error(`UNKNOWN_ENTITY:${row.entityType}`);
            }

            await prisma.syncQueue.update({
                where: { id: row.id },
                data: { status: 'synced', syncedAt: new Date(), errorMessage: null },
            });
            processed++;
        } catch (e: any) {
            const msg = String(e?.message ?? e).slice(0, 500);
            console.error(`sync_queue id=${row.id}`, e);
            await prisma.syncQueue.update({
                where: { id: row.id },
                data: {
                    status: 'failed',
                    retryCount: { increment: 1 },
                    errorMessage: msg,
                },
            });
            failed++;
        }
    }

    return { processed, failed };
}
