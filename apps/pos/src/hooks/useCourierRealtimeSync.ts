import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { posMessages, type PosLang } from '../i18n/posMessages';
import toast from 'react-hot-toast';

function tpl(t: (k: string) => string, key: string, vars: Record<string, string | number>): string {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{{${k}}}`).join(String(v));
    }
    return s;
}

function makeT(lang: string): (k: string) => string {
    const m = posMessages[lang as PosLang] || posMessages.tr;
    return (k: string) => m[k] || k;
}

export function useCourierRealtimeSync(onRefresh: () => void, currentLocation?: { lat: number; lng: number } | null): void {
    const tenantId = useAuthStore((s) => s.tenantId);
    const token = useAuthStore((s) => s.token);
    const courierId = useAuthStore((s) => s.user?.id);
    const lang = usePosStore((s) => s.lang);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const refreshRef = useRef(onRefresh);
    const socketRef = useRef<Socket | null>(null);
    const queueKey = `courier_loc_queue:${tenantId || 'none'}:${String(courierId || 'none')}`;

    const readQueue = (): { lat: number; lng: number; at: number }[] => {
        try {
            const raw = localStorage.getItem(queueKey);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    };
    const writeQueue = (rows: { lat: number; lng: number; at: number }[]) => {
        localStorage.setItem(queueKey, JSON.stringify(rows.slice(-50)));
    };
    const enqueueLocation = (loc: { lat: number; lng: number }) => {
        const q = readQueue();
        q.push({ ...loc, at: Date.now() });
        writeQueue(q);
    };
    const flushQueuedLocations = () => {
        const s = socketRef.current;
        if (!s || !s.connected || !tenantId) return;
        const q = readQueue();
        if (!q.length) return;
        for (const item of q) {
            s.emit('courier:location_update', {
                tenantId,
                courierId,
                location: { lat: item.lat, lng: item.lng },
            });
        }
        writeQueue([]);
    };

    // Update location via socket every 20s if changed
    useEffect(() => {
        if (!currentLocation || !tenantId) return;
        if (socketRef.current?.connected) {
            socketRef.current.emit('courier:location_update', {
                tenantId,
                courierId,
                location: currentLocation
            });
            flushQueuedLocations();
        } else {
            enqueueLocation(currentLocation);
        }
    }, [currentLocation, tenantId, courierId]);

    // Update the ref whenever onRefresh changes
    useEffect(() => {
        refreshRef.current = onRefresh;
    }, [onRefresh]);

    useEffect(() => {
        if (!tenantId || !token) return;

        const t = makeT(lang);
        const tplMsg = (key: string, vars: Record<string, string | number>) => tpl(t, key, vars);

        /** Kasiyer paneli ile aynı: API doğrudan (VITE_API_URL) veya Vite proxy (origin). */
        const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
        const socket = io(socketUrl, {
            path: '/socket.io',
            transports: ['websocket'],
            auth: { token },
            query: { tenantId },
            reconnection: true,
            reconnectionAttempts: 20,
            reconnectionDelay: 2000,
            timeout: 20000,
        });

        socketRef.current = socket;

        const flush = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                refreshRef.current();
                timerRef.current = null;
            }, 500);
        };

        const onConnect = () => {
            socket.emit('join:tenant', tenantId);
            socket.emit('presence:staff_register', { tenantId });
            flushQueuedLocations();
        };

        const onOrderReady = (data: any) => {
            if (data.orderType === 'delivery') {
                const name = data.customerName || t('courier.customer_unknown');
                toast.success(tplMsg('courier.ws_ready', { name }), { 
                    icon: '🛵',
                    duration: 8000,
                    position: 'top-center',
                    style: { background: '#e91e63', color: '#fff', fontWeight: '900', borderRadius: '24px' }
                });
                
                const audio = new Audio('/sounds/bell_ding.mp3'); 
                audio.play().catch(e => console.log('Audio play blocked:', e));
                flush();
            }
        };

        const onNewOrder = (data: any) => {
            if (data.orderType === 'delivery') {
                toast.success(t('courier.ws_new'), { icon: '📦', duration: 5000 });
                const audio = new Audio('/sounds/bell_ding.mp3');
                audio.play().catch(() => {});
                flush();
            }
        };

        const onCourierAssigned = (data: any) => {
            if (String(data.courierId) === String(courierId)) {
                const name = data.customerName || t('courier.customer_unknown');
                toast.success(tplMsg('courier.ws_assigned', { name }), { 
                    duration: 10000,
                    position: 'top-center',
                    style: { background: '#10b981', color: '#fff', fontWeight: '950', borderRadius: '24px', border: '5px solid rgba(255,255,255,0.2)' }
                });
                const audio = new Audio('/sounds/bell_ding.mp3');
                audio.play().catch(() => {});
                flush();
            }
        };

        const onLocationRequest = () => {
            if (currentLocation && tenantId) {
                socket.emit('courier:location_update', {
                    tenantId,
                    courierId,
                    location: currentLocation
                });
                toast.success(t('courier.ws_location_ok'), { icon: '📍', duration: 2000, position: 'bottom-center' });
            }
        };

        socket.on('connect', onConnect);
        socket.on('order:new', onNewOrder);
        socket.on('order:ready', onOrderReady);
        socket.on('order:status_changed', flush);
        socket.on('order:courier_assigned', onCourierAssigned);
        socket.on('order:courier_updated', flush);
        socket.on('courier:location_request', onLocationRequest);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            socket.off('connect', onConnect);
            socket.off('order:new', onNewOrder);
            socket.off('order:ready', onOrderReady);
            socket.off('order:status_changed', flush);
            socket.off('order:courier_assigned', onCourierAssigned);
            socket.off('order:courier_updated', flush);
            socket.off('courier:location_request', onLocationRequest);
            socket.removeAllListeners();
            socket.disconnect();
        };
    }, [tenantId, token, courierId, lang]);

    useEffect(() => {
        const onOnline = () => flushQueuedLocations();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [tenantId, courierId]);
}
