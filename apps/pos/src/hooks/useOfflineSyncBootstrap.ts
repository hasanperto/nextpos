import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { flushPendingSync, getOfflineSyncMaxAgeMs } from '../lib/syncQueueClient';

/**
 * Oturum açıkken: çevrimdışı senkron kuyruğunu internet gelince ve periyodik olarak sunucuya iter.
 * Süresi dolmuş (VITE_OFFLINE_SYNC_MAX_HOURS, varsayılan 48 saat) kayıtları uyarır.
 */
export function useOfflineSyncBootstrap(): void {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders);
    const token = useAuthStore((s) => s.token);
    const flushing = useRef(false);

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        const run = async () => {
            if (!navigator.onLine || flushing.current) return;
            const headers = getAuthHeaders();
            if (!headers.Authorization) return;
            flushing.current = true;
            try {
                const r = await flushPendingSync(getAuthHeaders);
                if (r.expiredDropped > 0) {
                    const h = Math.round(getOfflineSyncMaxAgeMs() / (60 * 60 * 1000));
                    toast.error(
                        `Çevrimdışı kuyrukta ${r.expiredDropped} kayıt süresi doldu (${h} saat) ve silindi. Yeniden işlem gerekir.`,
                        { duration: 8000 },
                    );
                }
            } catch (e) {
                console.warn('flushPendingSync', e);
            } finally {
                flushing.current = false;
            }
        };

        void run();

        const onOnline = () => void run();
        window.addEventListener('online', onOnline);
        const interval = window.setInterval(() => void run(), 60_000);

        return () => {
            window.removeEventListener('online', onOnline);
            window.clearInterval(interval);
        };
    }, [isAuthenticated, token, getAuthHeaders]);
}
