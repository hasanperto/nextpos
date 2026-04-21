// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Reseller Real-Time Notification Service
// Bayilere (Reseller) kiracı hareketlerini (satış, durum) canlı iletir
// ═══════════════════════════════════════════════════════════════════════════

import { Server as SocketServer } from 'socket.io';
import pool from '../lib/db.js';

interface ResellerSaleUpdate {
    tenantId: string;
    tenantName: string;
    orderId: number;
    amount: number;
    orderType: string;
    timestamp: string;
}

/** 
 * Kiracı-Bayi Eşleşme Önbelleği
 * DB yükünü azaltmak için Map kullanıyoruz 
 */
const tenantResellerCache = new Map<string, number | null>();

/**
 * Kiracının bağlı olduğu bayi ID'sini bulur
 */
async function getTenantResellerId(tenantId: string): Promise<number | null> {
    if (tenantResellerCache.has(tenantId)) {
        return tenantResellerCache.get(tenantId)!;
    }

    try {
        const [rows]: any = await pool.query(
            'SELECT reseller_id, name FROM public.tenants WHERE id = ?',
            [tenantId]
        );
        const rid = rows[0]?.reseller_id || null;
        tenantResellerCache.set(tenantId, rid);
        return rid;
    } catch {
        return null;
    }
}

/**
 * Bir satış (ödeme) gerçekleştiğinde bayiyi bilgilendirir
 */
export async function notifyResellerOfSale(io: SocketServer, tenantId: string, sale: Omit<ResellerSaleUpdate, 'tenantName'>) {
    const resellerId = await getTenantResellerId(tenantId);
    if (!resellerId) return;

    try {
        // Kiracı adını önbellekten veya DB'den al (getTenantResellerId zaten çekebilir aslında)
        const [rows]: any = await pool.query('SELECT name FROM public.tenants WHERE id = ?', [tenantId]);
        const tenantName = rows[0]?.name || tenantId;

        const data: ResellerSaleUpdate = {
            ...sale,
            tenantName,
        };

        // Bayi odasına (reseller:X) bildirimi gönder
        io.to(`reseller:${resellerId}`).emit('reseller:sale_update', data);
        
        console.log(`📡 Bayi Bildirimi: ${tenantName} -> ${sale.amount} TL (Bayi: ${resellerId})`);
    } catch (e: any) {
        console.warn('⚠️ Reseller notification failed:', e.message);
    }
}

/**
 * Kiracı sistem durumu değişikliklerini iletir (Online/Offline)
 */
export async function notifyResellerOfStatus(io: SocketServer, tenantId: string, status: string) {
    const resellerId = await getTenantResellerId(tenantId);
    if (!resellerId) return;

    io.to(`reseller:${resellerId}`).emit('reseller:tenant_status', {
        tenantId,
        status,
        timestamp: new Date().toISOString()
    });
}
