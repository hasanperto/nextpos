import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getSocketOrigin } from '../lib/socketOrigin';
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

        const socket: Socket = io(getSocketOrigin(), {
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
        socket.on('saas:live_feed', onGlobalLiveFeed);

        return () => {
            socket.off('connect', onConnect);
            socket.off('reseller:sale_update', onSaleUpdate);
            socket.off('reseller:tenant_status', onTenantStatus);
            socket.off('GLOBAL_LIVE_FEED', onGlobalLiveFeed);
            socket.off('saas:live_feed', onGlobalLiveFeed);
            socket.disconnect();
        };
    }, [token, admin, addLiveFeedItem, fetchTenants, fetchStats]);
}
