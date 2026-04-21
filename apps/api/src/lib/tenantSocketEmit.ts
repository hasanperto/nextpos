import type { Request } from 'express';
import type { Server as SocketServer } from 'socket.io';

/** Admin menü/katalog güncellemesi — POS `GET /sync/pull` ile hizalanır. */
export function emitTenantMenuCatalogStale(req: Request): void {
    const tenantId = req.tenantId;
    if (!tenantId) return;
    const io = req.app.get('io') as SocketServer | undefined;
    if (!io) return;
    io.to(`tenant:${tenantId}`).emit('sync:menu_revision', { at: Date.now() });
}

/** Salon/masa/bölge düzeni — konum güncellemesi `sync/pull` revizyonuna dahil olmayabilir; istemci masaları yeniler. */
export function emitTenantTablesStale(req: Request): void {
    const tenantId = req.tenantId;
    if (!tenantId) return;
    const io = req.app.get('io') as SocketServer | undefined;
    if (!io) return;
    io.to(`tenant:${tenantId}`).emit('sync:tables_changed', { at: Date.now() });
}
