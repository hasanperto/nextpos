/** Sunucu imzalı offline grace jetonu — istemci tarafı saklama ve doğrulama */

import { getDeviceId } from './deviceId';

const TOKEN_KEY = 'nextpos_offline_grace_token_v2';
const GRACE_KEY = 'nextpos_offline_grace_exp_v2';
const PIN_UNLOCK_KEY = 'nextpos_offline_pin_unlock_v2';

export type HeartbeatPayload = {
    ok?: boolean;
    tenantId?: string;
    deviceId?: string;
    serverTime?: string;
    graceExpiresAt?: number;
    pinUnlockExpiresAt?: number | null;
    offlineToken?: string;
    offlineSecurity?: {
        maxOfflineHours?: number;
        requirePinOnOffline?: boolean;
        strictHeartbeat?: boolean;
        heartbeatFailBeforeSuspicious?: number;
        pinUnlockHours?: number;
    };
};

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function storeOfflineGrace(token: string, graceExpiresAt: number, pinUnlockExpiresAt?: number | null): void {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(GRACE_KEY, String(graceExpiresAt));
        if (pinUnlockExpiresAt != null && Number.isFinite(pinUnlockExpiresAt)) {
            localStorage.setItem(PIN_UNLOCK_KEY, String(pinUnlockExpiresAt));
        }
    } catch {
        /* ignore */
    }
}

export function getOfflineToken(): string | null {
    try {
        const t = localStorage.getItem(TOKEN_KEY);
        return t && t.length > 20 ? t : null;
    } catch {
        return null;
    }
}

export function getOfflineGraceExpiresAt(): number | null {
    try {
        const raw = localStorage.getItem(GRACE_KEY);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

export function getOfflinePinUnlockExpiresAt(): number | null {
    try {
        const raw = localStorage.getItem(PIN_UNLOCK_KEY);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

export function clearOfflineGrace(): void {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(GRACE_KEY);
        localStorage.removeItem(PIN_UNLOCK_KEY);
    } catch {
        /* ignore */
    }
}

export function validateHeartbeatResponse(
    data: HeartbeatPayload,
    expectedTenantId: string,
): boolean {
    if (!data.ok || !data.offlineToken || !data.tenantId || !data.deviceId) return false;
    if (data.tenantId !== expectedTenantId) return false;
    if (data.deviceId !== getDeviceId()) return false;

    const serverMs = data.serverTime ? Date.parse(data.serverTime) : NaN;
    if (!Number.isFinite(serverMs) || Math.abs(Date.now() - serverMs) > MAX_CLOCK_SKEW_MS) return false;

    const grace = Number(data.graceExpiresAt);
    if (!Number.isFinite(grace) || grace <= Date.now()) return false;

    storeOfflineGrace(data.offlineToken, grace, data.pinUnlockExpiresAt ?? undefined);
    return true;
}

export function getOfflineAuthHeaders(): Record<string, string> {
    const token = getOfflineToken();
    const headers: Record<string, string> = {
        'x-device-id': getDeviceId(),
    };
    if (token) headers['x-offline-token'] = token;
    return headers;
}
