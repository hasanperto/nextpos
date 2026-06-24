import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { getDeviceId } from '../lib/deviceId';
import { validateHeartbeatResponse } from '../lib/offlineAttestation';
import {
    getOfflinePolicyState,
    initOfflinePolicy,
    isNetworkOffline,
    markServerHeartbeatFailed,
    markServerHeartbeatSuccess,
    setOfflineSecuritySettings,
} from '../lib/offlinePolicy';

/**
 * Sunucu heartbeat, grace jetonu, şüpheli bağlantı ve 48 saat kilidi.
 */
export function useOfflinePolicyBootstrap(): void {
    const logout = useAuthStore((s) => s.logout);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders);
    const tenantId = useAuthStore((s) => s.tenantId);
    const settings = usePosStore((s) => s.settings);
    const lockedRef = useRef(false);

    useEffect(() => {
        const raw = (settings as { offlineSecurity?: Record<string, unknown> } | null)?.offlineSecurity;
        if (raw) setOfflineSecuritySettings(raw as Parameters<typeof setOfflineSecuritySettings>[0]);
    }, [settings]);

    useEffect(() => {
        return initOfflinePolicy();
    }, []);

    useEffect(() => {
        const enforceLock = () => {
            const state = getOfflinePolicyState();
            if (state.isGraceExpired && !lockedRef.current) {
                lockedRef.current = true;
                if (isAuthenticated) logout();
            }
            if (!state.isGraceExpired) lockedRef.current = false;
        };

        enforceLock();
        window.addEventListener('nextpos-offline-policy', enforceLock);
        const interval = window.setInterval(enforceLock, 30_000);

        return () => {
            window.removeEventListener('nextpos-offline-policy', enforceLock);
            window.clearInterval(interval);
        };
    }, [isAuthenticated, logout]);

    useEffect(() => {
        const heartbeat = async () => {
            if (isNetworkOffline()) {
                markServerHeartbeatFailed();
                return;
            }
            const headers = getAuthHeaders();
            if (!headers.Authorization || !tenantId) return;

            try {
                const res = await fetch('/api/v1/sync/heartbeat', {
                    headers: {
                        ...headers,
                        'x-device-id': getDeviceId(),
                    },
                });
                if (!res.ok) {
                    markServerHeartbeatFailed();
                    return;
                }
                const data = (await res.json()) as Parameters<typeof validateHeartbeatResponse>[0];
                if (validateHeartbeatResponse(data, tenantId)) {
                    if (data.offlineSecurity) {
                        setOfflineSecuritySettings(data.offlineSecurity as Parameters<typeof setOfflineSecuritySettings>[0]);
                    }
                    markServerHeartbeatSuccess();
                } else {
                    markServerHeartbeatFailed();
                }
            } catch {
                markServerHeartbeatFailed();
            }
        };

        void heartbeat();
        const onOnline = () => void heartbeat();
        window.addEventListener('online', onOnline);
        const interval = window.setInterval(() => void heartbeat(), 90_000);

        return () => {
            window.removeEventListener('online', onOnline);
            window.clearInterval(interval);
        };
    }, [getAuthHeaders, tenantId]);
}
