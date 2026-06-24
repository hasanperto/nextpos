import jwt from 'jsonwebtoken';

export type OfflineSecurityConfig = {
    maxOfflineHours: number;
    requirePinOnOffline: boolean;
    strictHeartbeat: boolean;
    heartbeatFailBeforeSuspicious: number;
    pinUnlockHours: number;
};

export const DEFAULT_OFFLINE_SECURITY: OfflineSecurityConfig = {
    maxOfflineHours: 48,
    requirePinOnOffline: true,
    strictHeartbeat: true,
    heartbeatFailBeforeSuspicious: 3,
    pinUnlockHours: 12,
};

export function parseOfflineSecurity(settings: Record<string, unknown> | null | undefined): OfflineSecurityConfig {
    const raw = settings?.offlineSecurity as Partial<OfflineSecurityConfig> | undefined;
    const maxH = Number(raw?.maxOfflineHours);
    const failN = Number(raw?.heartbeatFailBeforeSuspicious);
    const unlockH = Number(raw?.pinUnlockHours);
    return {
        maxOfflineHours: Number.isFinite(maxH) && maxH > 0 ? Math.min(maxH, 168) : DEFAULT_OFFLINE_SECURITY.maxOfflineHours,
        requirePinOnOffline: raw?.requirePinOnOffline !== false,
        strictHeartbeat: raw?.strictHeartbeat !== false,
        heartbeatFailBeforeSuspicious:
            Number.isFinite(failN) && failN > 0 ? Math.min(Math.floor(failN), 10) : DEFAULT_OFFLINE_SECURITY.heartbeatFailBeforeSuspicious,
        pinUnlockHours: Number.isFinite(unlockH) && unlockH > 0 ? Math.min(unlockH, 72) : DEFAULT_OFFLINE_SECURITY.pinUnlockHours,
    };
}

function jwtSecret(): string {
    return (process.env.JWT_SECRET as string) || 'secret';
}

export type OfflineGraceClaims = {
    typ: 'offline_grace';
    tenantId: string;
    deviceId: string;
    graceExpiresAt: number;
};

export function issueOfflineGraceToken(params: {
    tenantId: string;
    deviceId: string;
    graceExpiresAt: number;
}): string {
    const ttlSec = Math.max(60, Math.ceil((params.graceExpiresAt - Date.now()) / 1000));
    return jwt.sign(
        {
            typ: 'offline_grace',
            tenantId: params.tenantId,
            deviceId: params.deviceId,
            graceExpiresAt: params.graceExpiresAt,
        } satisfies OfflineGraceClaims,
        jwtSecret(),
        { expiresIn: ttlSec },
    );
}

export function verifyOfflineGraceToken(token: string): OfflineGraceClaims | null {
    try {
        const decoded = jwt.verify(token, jwtSecret()) as OfflineGraceClaims & { typ?: string };
        if (decoded.typ !== 'offline_grace') return null;
        if (!decoded.tenantId || !decoded.deviceId || !Number.isFinite(Number(decoded.graceExpiresAt))) return null;
        if (Date.now() > Number(decoded.graceExpiresAt)) return null;
        return {
            typ: 'offline_grace',
            tenantId: String(decoded.tenantId),
            deviceId: String(decoded.deviceId),
            graceExpiresAt: Number(decoded.graceExpiresAt),
        };
    } catch {
        return null;
    }
}

export function computeGraceExpiresAt(maxOfflineHours: number): number {
    return Date.now() + maxOfflineHours * 60 * 60 * 1000;
}

export function computePinUnlockExpiresAt(pinUnlockHours: number): number {
    return Date.now() + pinUnlockHours * 60 * 60 * 1000;
}
