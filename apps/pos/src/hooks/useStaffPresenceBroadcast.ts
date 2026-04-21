import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Admin paneli ayrı Socket bağlantısı kullandığı için kasiyer hook'undan bağımsız;
 * SaaS'ta "çevrimiçi personel" listesine düşmek için tenant + JWT ile presence kaydı.
 */
export function useStaffPresenceBroadcast(): void {
    const tenantId = useAuthStore((s) => s.tenantId);
    const token = useAuthStore((s) => s.token);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!tenantId || !token) return;

        // Prevent duplicate connections from React StrictMode double-mount
        if (socketRef.current?.connected) return;

        const socket = io({
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            auth: { token },
        });
        socketRef.current = socket;

        const onConnect = () => {
            socket.emit('join:tenant', tenantId);
            socket.emit('presence:staff_register', { tenantId });
        };
        socket.on('connect', onConnect);

        return () => {
            socket.off('connect', onConnect);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [tenantId, token]);
}
