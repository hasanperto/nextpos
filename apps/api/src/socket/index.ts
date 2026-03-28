// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Socket.io Handlers (Multi-Tenant)
// Tenant-aware gerçek zamanlı iletişim
// ═══════════════════════════════════════════════════════════════════════════

import { Server as SocketServer, Socket } from 'socket.io';

export function setupSocketHandlers(io: SocketServer) {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client bağlandı: ${socket.id}`);

        // ═══ TENANT KATILIM ═══
        // Her client önce tenant odasına katılmalı
        socket.on('join:tenant', (tenantId: string) => {
            socket.join(`tenant:${tenantId}`);
            console.log(`🏢 ${socket.id} → tenant:${tenantId}`);
        });

        // ═══ ROOM KATILIM ═══
        socket.on('join:branch', (data: { tenantId: string; branchId: number }) => {
            socket.join(`tenant:${data.tenantId}:branch:${data.branchId}`);
            console.log(`📍 ${socket.id} → branch:${data.branchId}`);
        });

        socket.on('join:table', (data: { tenantId: string; tableId: number }) => {
            socket.join(`tenant:${data.tenantId}:table:${data.tableId}`);
            console.log(`📍 ${socket.id} → table:${data.tableId}`);
        });

        socket.on('join:kitchen', (data: { tenantId: string; branchId: number }) => {
            socket.join(`tenant:${data.tenantId}:kitchen:${data.branchId}`);
            console.log(`📍 ${socket.id} → kitchen:${data.branchId}`);
        });

        socket.on('join:waiter', (data: { tenantId: string; userId: number }) => {
            socket.join(`tenant:${data.tenantId}:waiter:${data.userId}`);
            console.log(`📍 ${socket.id} → waiter:${data.userId}`);
        });

        socket.on('join:courier', (data: { tenantId: string; userId: number }) => {
            socket.join(`tenant:${data.tenantId}:courier:${data.userId}`);
            console.log(`📍 ${socket.id} → courier:${data.userId}`);
        });

        // ═══ SİPARİŞ OLAYLARI ═══
        socket.on('order:new', (data) => {
            const t = data.tenantId;
            io.to(`tenant:${t}:kitchen:${data.branchId}`).emit('order:new', data);
            io.to(`tenant:${t}`).emit('order:new', data);
            console.log(`📦 Yeni sipariş: Masa ${data.tableName} (tenant: ${t})`);
        });

        socket.on('order:status_changed', (data) => {
            const t = data.tenantId;
            io.to(`tenant:${t}`).emit('order:status_changed', data);
            if (data.waiterId) {
                io.to(`tenant:${t}:waiter:${data.waiterId}`).emit('order:status_changed', data);
            }
        });

        // ═══ MUTFAK OLAYLARI ═══
        socket.on('kitchen:item_ready', (data) => {
            const t = data.tenantId;
            // KURAL: Sadece ilgili garsona bildirim
            if (data.waiterId) {
                io.to(`tenant:${t}:waiter:${data.waiterId}`).emit('kitchen:item_ready', data);
            }
            io.to(`tenant:${t}`).emit('kitchen:item_ready', data);
            if (data.tableId) {
                io.to(`tenant:${t}:table:${data.tableId}`).emit('kitchen:item_ready', data);
            }
            console.log(`✅ Hazır: ${data.itemName} → Masa ${data.tableName} (tenant: ${t})`);
        });

        // ═══ MASA OLAYLARI ═══
        socket.on('table:status_changed', (data) => {
            io.to(`tenant:${data.tenantId}`).emit('table:status_changed', data);
        });

        // ═══ MÜŞTERİ QR OLAYLARI ═══
        socket.on('customer:order_request', (data) => {
            const t = data.tenantId;
            // KURAL: QR siparişi doğrudan mutfağa düşmez, garson onayı bekler
            if (data.waiterId) {
                io.to(`tenant:${t}:waiter:${data.waiterId}`).emit('customer:order_request', data);
            }
            io.to(`tenant:${t}`).emit('customer:order_request', data);
            console.log(`📱 QR Sipariş talebi: Masa ${data.tableName} - ${data.customerName} (tenant: ${t})`);
        });

        socket.on('customer:order_approved', (data) => {
            const t = data.tenantId;
            io.to(`tenant:${t}:table:${data.tableId}`).emit('customer:order_approved', data);
            io.to(`tenant:${t}:kitchen:${data.branchId}`).emit('order:new', data);
        });

        socket.on('customer:order_rejected', (data) => {
            io.to(`tenant:${data.tenantId}:table:${data.tableId}`).emit('customer:order_rejected', data);
        });

        // ═══ MASA KİLİTLEME (PESSIMISTIC LOCK) ═══
        // KURAL: Bir garson tabletten masaya girdiğinde, o masa diğer cihazlara 30 saniye kilitlenir.
        socket.on('table:lock', (data) => {
            const t = data.tenantId;
            // Diğer tüm istemcilere (garsonlara, vs.) bu masanın kilitlendiğini bildir
            io.to(`tenant:${t}`).emit('table:locked', {
                tableId: data.tableId,
                waiterName: data.waiterName,
                lockedAt: Date.now(),
                expiresIn: 30000 // 30 saniye
            });
            console.log(`🔒 Masa Kilitlendi: ${data.tableId} (tenant: ${t}) - Yapan: ${data.waiterName}`);
        });

        socket.on('table:unlock', (data) => {
            const t = data.tenantId;
            // Kilidi kaldır
            io.to(`tenant:${t}`).emit('table:unlocked', {
                tableId: data.tableId,
            });
            console.log(`🔓 Masa Kilidi Açıldı: ${data.tableId} (tenant: ${t})`);
        });

        socket.on('customer:service_call', (data) => {
            const t = data.tenantId;
            io.to(`tenant:${t}`).emit('customer:service_call', data);
            if (data.waiterId) {
                io.to(`tenant:${t}:waiter:${data.waiterId}`).emit('customer:service_call', data);
            }
            console.log(`🔔 Servis çağrısı: Masa ${data.tableName} → ${data.callType} (tenant: ${t})`);
        });

        // ═══ TESLİMAT OLAYLARI ═══
        socket.on('delivery:status_changed', (data) => {
            io.to(`tenant:${data.tenantId}`).emit('delivery:status_changed', data);
        });

        // ═══ BAĞLANTI KOPMA ═══
        socket.on('disconnect', () => {
            console.log(`🔌 Client ayrıldı: ${socket.id}`);
        });
    });

    console.log('🔌 Socket.io handler\'lar kuruldu (Multi-Tenant)');
}
