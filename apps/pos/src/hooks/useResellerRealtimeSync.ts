import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSaaSStore } from '../store/useSaaSStore';

/**
 * Bayi (Reseller) veya Süper Admin için gerçek zamanlı akış.
 * 'reseller' odasına katılır ve satış/tenant durumlarını dinler.
 */
export function useResellerRealtimeSync(): void {
    const { token, admin, addLiveFeedItem, fetchTenants, fetchStats } = useSaaSStore();

    useEffect(() => {
        if (!token || !admin) return;
        if (admin.role !== 'reseller' && admin.role !== 'super_admin') return;

        /** Aynı origin → Vite /socket.io proxy. WS sorununda .env: VITE_SOCKET_ORIGIN=http://127.0.0.1:3001 */
        const origin =
            (import.meta.env.VITE_SOCKET_ORIGIN as string | undefined)?.replace(/\/$/, '') ||
            (typeof window !== 'undefined' ? window.location.origin : '');
        const socket: Socket = io(origin, {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            reconnectionDelay: 1000,
            auth: { token },
        });

        const onConnect = () => {
            console.log('📡 Reseller/Admin Socket Connected');
            if (admin.role === 'super_admin') {
                socket.emit('join:saas_admin');
            } else if (admin.role === 'reseller' && admin.id) {
                socket.emit('join:reseller', admin.id);
            }
        };

        const onSaleUpdate = (data: any) => {
            addLiveFeedItem({
                type: 'sale',
                id: Date.now(),
                ...data
            });
            if (data.amount) {
                useSaaSStore.getState().updateStatsOnSale(Number(data.amount));
            }
        };

        const onTenantStatus = (data: any) => {
            addLiveFeedItem({
                type: 'status',
                id: Date.now(),
                ...data
            });
            fetchTenants(); // Listeyi güncelle
        };

        const onGlobalLiveFeed = (data: any) => {
            addLiveFeedItem(data);
        };

        socket.on('connect', onConnect);
        socket.on('reseller:sale_update', onSaleUpdate);
        socket.on('reseller:tenant_status', onTenantStatus);
        socket.on('GLOBAL_LIVE_FEED', onGlobalLiveFeed);

        return () => {
            socket.off('connect', onConnect);
            socket.off('reseller:sale_update', onSaleUpdate);
            socket.off('reseller:tenant_status', onTenantStatus);
            socket.off('GLOBAL_LIVE_FEED', onGlobalLiveFeed);
            socket.disconnect();
        };
    }, [token, admin, addLiveFeedItem, fetchTenants, fetchStats]);
}
