// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Socket.io Handlers (Multi-Tenant)
// Tenant-aware gerçek zamanlı iletişim
// İsteğe bağlı: `handshake.auth.token` = JWT — join:tenant tenantId ile eşleşmeli
// ═══════════════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { Server as SocketServer, Socket } from 'socket.io';
import type { JwtPayload } from '../middleware/auth.js';
import { presenceRegister, presenceUnregister, presenceSnapshot, presenceUpdateLocation } from './presenceRegistry.js';

export function setupSocketHandlers(io: SocketServer) {
    io.use((socket, next) => {
        try {
            const auth = socket.handshake.auth as { token?: string } | undefined;
            const token = auth?.token;
            if (!token || typeof token !== 'string') {
                return next();
            }
            const secret = process.env.JWT_SECRET || 'secret';
            const decoded = jwt.verify(token, secret) as JwtPayload;
            if (!decoded.isSaaSAdmin && !decoded.tenantId) {
                return next(new Error('AUTH_TENANT'));
            }
            socket.data.jwt = decoded;
            next();
        } catch {
            return next(new Error('AUTH_INVALID'));
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client bağlandı: ${socket.id}`);

        // ═══ TENANT KATILIM ═══
        // Her client önce tenant odasına katılmalı
        socket.on('join:tenant', (tenantId: string) => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (jwtUser?.tenantId && jwtUser.tenantId !== tenantId) {
                console.warn(`⚠️ join:tenant tenant uyuşmazlığı: socket ${socket.id}`);
                return;
            }
            socket.join(`tenant:${tenantId}`);
            console.log(`🏢 ${socket.id} → tenant:${tenantId}${jwtUser ? ' (JWT)' : ''}`);
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

        socket.on('join:reseller', (resellerId: number | string) => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (!resellerId || !jwtUser) return;
            // KONTROL: Sadece admin veya ilgili reseller katılabilir
            const rid = Number(resellerId);
            if (!jwtUser.isSaaSAdmin && (jwtUser.role !== 'reseller' || jwtUser.resellerId !== rid)) {
                console.warn(`⚠️ join:reseller REDDEDİLDİ: socket ${socket.id} (resellerId: ${rid})`);
                return;
            }
            socket.join(`reseller:${rid}`);
            console.log(`🤝 ${socket.id} → reseller:${rid}`);
        });

        // ═══ PERSONEL ÇEVRİMİÇİ (POS → SaaS izleme) ═══
        socket.on('presence:staff_register', (data: { tenantId: string }) => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (!data?.tenantId || !jwtUser?.tenantId || jwtUser.isSaaSAdmin) return;
            if (jwtUser.tenantId !== data.tenantId) return;
            (socket.data as { presenceTenantId?: string }).presenceTenantId = data.tenantId;
            const staff = presenceRegister(data.tenantId, socket.id, {
                userId: jwtUser.userId,
                username: jwtUser.username ?? String(jwtUser.userId),
                role: jwtUser.role,
            });
            io.to(`tenant:${data.tenantId}:saas_presence_observers`).emit('presence:staff_update', {
                tenantId: data.tenantId,
                staff,
            });
        });

        /** SaaS JWT ile kiracı personel listesini canlı dinle */
        socket.on('join:saas_tenant_presence', (tenantId: string) => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (!tenantId || !jwtUser?.isSaaSAdmin) return;
            socket.join(`tenant:${tenantId}:saas_presence_observers`);
            socket.emit('presence:staff_snapshot', {
                tenantId,
                staff: presenceSnapshot(tenantId),
            });
        });

        socket.on('leave:saas_tenant_presence', (tenantId: string) => {
            if (!tenantId) return;
            socket.leave(`tenant:${tenantId}:saas_presence_observers`);
        });

        socket.on('join:saas_admin', () => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (jwtUser?.isSaaSAdmin) {
                socket.join('room:saas_admin');
                console.log(`🛡️ ${socket.id} → room:saas_admin (Super Admin)`);
            }
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
                io.to(`tenant:${t}:waiter:${data.waiterId}`).emit('order:ready', data); // backward compat
            }
            io.to(`tenant:${t}`).emit('kitchen:item_ready', data);
            io.to(`tenant:${t}`).emit('order:ready', data); // backward compat — POS cashier/waiter panels
            if (data.tableId) {
                io.to(`tenant:${t}:table:${data.tableId}`).emit('kitchen:item_ready', data);
                io.to(`tenant:${t}:table:${data.tableId}`).emit('order:ready', data);
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

        // ═══ MASA ODAĞI (LITE PRESENCE) ═══
        socket.on('table:focus', (data) => {
            const t = data.tenantId;
            socket.to(`tenant:${t}`).emit('table:focused', {
                tableId: data.tableId,
                waiterName: data.waiterName,
                waiterId: data.waiterId
            });
        });

        socket.on('table:blur', (data) => {
            const t = data.tenantId;
            socket.to(`tenant:${t}`).emit('table:blurred', {
                tableId: data.tableId,
                waiterId: data.waiterId
            });
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
        socket.on('courier:location_update', (data: { tenantId: string; location: { lat: number; lng: number } }) => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (!data?.tenantId || !jwtUser?.tenantId || jwtUser.role !== 'courier') return;
            if (jwtUser.tenantId !== data.tenantId) return;

            const staff = presenceUpdateLocation(data.tenantId, socket.id, data.location);
            
            // SaaS observer'lara veya admin'lere canlı konum güncellenmiş listeyi gönder
            io.to(`tenant:${data.tenantId}:saas_presence_observers`).emit('presence:staff_update', {
                tenantId: data.tenantId,
                staff,
            });
            
            // Ayrıca genel tenant odasına da gönderilebilir (Admin panel POS içindeyse)
            io.to(`tenant:${data.tenantId}`).emit('presence:staff_update', {
                tenantId: data.tenantId,
                staff,
            });
        });

        socket.on('admin:request_courier_location', (data: { tenantId: string }) => {
            const jwtUser = socket.data.jwt as JwtPayload | undefined;
            if (jwtUser?.role !== 'admin' && jwtUser?.role !== 'cashier') return;
            
            // Broadcast request to all couriers in this tenant
            io.to(`tenant:${data.tenantId}`).emit('courier:location_request');
        });

        socket.on('delivery:status_changed', (data) => {
            io.to(`tenant:${data.tenantId}`).emit('delivery:status_changed', data);
        });

        // ═══ BAĞLANTI KOPMA ═══
        socket.on('disconnect', () => {
            const tid = (socket.data as { presenceTenantId?: string }).presenceTenantId;
            if (tid) {
                const staff = presenceUnregister(tid, socket.id);
                io.to(`tenant:${tid}:saas_presence_observers`).emit('presence:staff_update', {
                    tenantId: tid,
                    staff,
                });
            }
            console.log(`🔌 Client ayrıldı: ${socket.id}`);
        });
    });

    console.log('🔌 Socket.io handler\'lar kuruldu (Multi-Tenant)');
}
