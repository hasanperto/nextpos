import { getOfflineSyncMaxAgeMs } from './syncQueueClient';
import {
    clearOfflineGrace,
    getOfflineGraceExpiresAt,
    getOfflinePinUnlockExpiresAt,
    getOfflineToken,
} from './offlineAttestation';

const OFFLINE_SINCE_KEY = 'nextpos_offline_since';
const LAST_ONLINE_AT_KEY = 'nextpos_last_online_at';

export type OfflineSecuritySettings = {
    maxOfflineHours: number;
    requirePinOnOffline: boolean;
    strictHeartbeat: boolean;
    heartbeatFailBeforeSuspicious: number;
    pinUnlockHours: number;
};

export const DEFAULT_OFFLINE_SECURITY: OfflineSecuritySettings = {
    maxOfflineHours: 48,
    requirePinOnOffline: true,
    strictHeartbeat: true,
    heartbeatFailBeforeSuspicious: 3,
    pinUnlockHours: 12,
};

export type ConnectionTrust = 'verified' | 'offline' | 'suspicious';

export type OfflinePolicyState = {
    isOffline: boolean;
    connectionTrust: ConnectionTrust;
    offlineSince: number | null;
    elapsedMs: number;
    graceRemainingMs: number;
    isGraceExpired: boolean;
    isLocked: boolean;
    needsOfflinePin: boolean;
    isSuspicious: boolean;
    maxGraceMs: number;
    heartbeatFailStreak: number;
};

let securitySettings: OfflineSecuritySettings = { ...DEFAULT_OFFLINE_SECURITY };
let serverVerifiedOnline = true;
let heartbeatFailStreak = 0;

function readOfflineSince(): number | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OFFLINE_SINCE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function writeOfflineSince(ts: number | null): void {
    if (typeof localStorage === 'undefined') return;
    if (ts == null) localStorage.removeItem(OFFLINE_SINCE_KEY);
    else localStorage.setItem(OFFLINE_SINCE_KEY, String(ts));
}

function writeLastOnlineAt(ts: number): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LAST_ONLINE_AT_KEY, String(ts));
}

export function setOfflineSecuritySettings(raw: Partial<OfflineSecuritySettings> | null | undefined): void {
    const maxH = Number(raw?.maxOfflineHours);
    const failN = Number(raw?.heartbeatFailBeforeSuspicious);
    const unlockH = Number(raw?.pinUnlockHours);
    securitySettings = {
        maxOfflineHours:
            Number.isFinite(maxH) && maxH > 0 ? Math.min(maxH, 168) : DEFAULT_OFFLINE_SECURITY.maxOfflineHours,
        requirePinOnOffline: raw?.requirePinOnOffline !== false,
        strictHeartbeat: raw?.strictHeartbeat !== false,
        heartbeatFailBeforeSuspicious:
            Number.isFinite(failN) && failN > 0
                ? Math.min(Math.floor(failN), 10)
                : DEFAULT_OFFLINE_SECURITY.heartbeatFailBeforeSuspicious,
        pinUnlockHours:
            Number.isFinite(unlockH) && unlockH > 0 ? Math.min(unlockH, 72) : DEFAULT_OFFLINE_SECURITY.pinUnlockHours,
    };
}

export function getOfflineSecuritySettings(): OfflineSecuritySettings {
    return securitySettings;
}

/** Gerçek çevrimdışı mı? (localhost bypass sadece VITE_OFFLINE_DEV=1 ile) */
export function isNetworkOffline(): boolean {
    if (typeof navigator === 'undefined') return false;
    const devBypass =
        import.meta.env.DEV &&
        import.meta.env.VITE_OFFLINE_DEV !== '1' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (devBypass) return false;
    return !navigator.onLine;
}

function isPinUnlockedNow(): boolean {
    const until = getOfflinePinUnlockExpiresAt();
    return until != null && Date.now() < until;
}

function getGraceExpiresAtMs(): number | null {
    const fromToken = getOfflineGraceExpiresAt();
    if (fromToken != null) return fromToken;
    const since = readOfflineSince();
    if (since == null) return null;
    const maxMs = securitySettings.maxOfflineHours * 60 * 60 * 1000;
    return since + maxMs;
}

function getConnectionTrust(): ConnectionTrust {
    const navigatorOffline = isNetworkOffline();
    const suspicious =
        !navigatorOffline &&
        securitySettings.strictHeartbeat &&
        (!serverVerifiedOnline || heartbeatFailStreak >= securitySettings.heartbeatFailBeforeSuspicious);

    if (suspicious) return 'suspicious';
    if (navigatorOffline || (securitySettings.strictHeartbeat && !serverVerifiedOnline)) return 'offline';
    return 'verified';
}

export function getOfflinePolicyState(): OfflinePolicyState {
    const maxGraceMs = getOfflineSyncMaxAgeMs();
    const trust = getConnectionTrust();
    const isOffline = trust !== 'verified';
    const isSuspicious = trust === 'suspicious';
    const offlineSince = isOffline ? readOfflineSince() : null;
    const graceExpiresAt = getGraceExpiresAtMs();
    const graceRemainingMs =
        graceExpiresAt != null ? Math.max(0, graceExpiresAt - Date.now()) : Math.max(0, maxGraceMs - (offlineSince ? Date.now() - offlineSince : 0));
    const elapsedMs = offlineSince != null ? Math.max(0, Date.now() - offlineSince) : 0;
    const isGraceExpired = graceExpiresAt != null ? Date.now() > graceExpiresAt : isOffline && offlineSince != null && elapsedMs >= maxGraceMs;

    const hasValidGraceToken =
        getOfflineToken() != null &&
        graceExpiresAt != null &&
        Date.now() < graceExpiresAt;

    const needsOfflinePin =
        securitySettings.requirePinOnOffline &&
        isOffline &&
        !isSuspicious &&
        !hasValidGraceToken &&
        !isPinUnlockedNow() &&
        !isGraceExpired;

    const needsSuspiciousPin = isSuspicious && !isPinUnlockedNow();

    const isLocked = isGraceExpired || needsOfflinePin || needsSuspiciousPin;

    return {
        isOffline,
        connectionTrust: trust,
        offlineSince,
        elapsedMs,
        graceRemainingMs,
        isGraceExpired,
        isLocked,
        needsOfflinePin,
        isSuspicious,
        maxGraceMs,
        heartbeatFailStreak,
    };
}

export function isOfflineGraceExpired(): boolean {
    return getOfflinePolicyState().isGraceExpired;
}

export function isOfflineLocked(): boolean {
    return getOfflinePolicyState().isLocked;
}

export function needsOfflinePinUnlock(): boolean {
    const s = getOfflinePolicyState();
    if (s.isGraceExpired) return false;
    return s.needsOfflinePin || (s.isSuspicious && !isPinUnlockedNow());
}

export function canUsePosOffline(): boolean {
    return !isOfflineLocked();
}

export function markServerHeartbeatSuccess(): void {
    serverVerifiedOnline = true;
    heartbeatFailStreak = 0;
    writeOfflineSince(null);
    writeLastOnlineAt(Date.now());
    window.dispatchEvent(new CustomEvent('nextpos-offline-policy'));
}

export function markServerHeartbeatFailed(): void {
    serverVerifiedOnline = false;
    heartbeatFailStreak += 1;
    if (readOfflineSince() == null) {
        writeOfflineSince(Date.now());
    }
    window.dispatchEvent(new CustomEvent('nextpos-offline-policy'));
}

/** İnternet kesildiğinde sayaç başlat */
export function markNetworkOffline(): void {
    if (!isNetworkOffline()) return;
    serverVerifiedOnline = false;
    if (readOfflineSince() == null) {
        writeOfflineSince(Date.now());
    }
    window.dispatchEvent(new CustomEvent('nextpos-offline-policy'));
}

/** Başarılı sunucu iletişimi — sayaç sıfırlanır (heartbeat tercih edilir) */
export function markOnlineSuccess(): void {
    markServerHeartbeatSuccess();
}

/** navigator online event — gerçek bağlantı heartbeat ile doğrulanana kadar sayaç devam eder */
export function markNetworkOnline(): void {
    window.dispatchEvent(new CustomEvent('nextpos-offline-policy'));
}

export function markOfflinePinUnlocked(pinUnlockExpiresAt: number | null | undefined, graceExpiresAt: number): void {
    if (pinUnlockExpiresAt != null && Number.isFinite(pinUnlockExpiresAt)) {
        try {
            localStorage.setItem('nextpos_offline_pin_unlock_v2', String(pinUnlockExpiresAt));
        } catch {
            /* ignore */
        }
    }
    try {
        localStorage.setItem('nextpos_offline_grace_exp_v2', String(graceExpiresAt));
    } catch {
        /* ignore */
    }
    serverVerifiedOnline = false;
    heartbeatFailStreak = 0;
    window.dispatchEvent(new CustomEvent('nextpos-offline-policy'));
}

export function resetOfflineSecurityState(): void {
    serverVerifiedOnline = true;
    heartbeatFailStreak = 0;
    clearOfflineGrace();
    writeOfflineSince(null);
}

let initialized = false;

/** Uygulama genelinde online/offline dinleyicileri */
export function initOfflinePolicy(): () => void {
    if (typeof window === 'undefined') return () => {};
    if (initialized) return () => {};
    initialized = true;

    if (isNetworkOffline()) markNetworkOffline();

    const onOffline = () => markNetworkOffline();
    const onOnline = () => markNetworkOnline();

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
        initialized = false;
    };
}

export function formatGraceRemaining(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 48) return `${hours}h ${remMins}m`;
    const days = Math.floor(hours / 24);
    return `${days}g ${hours % 24}h`;
}
