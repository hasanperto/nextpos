import type { Request } from 'express';

type Entry = { fails: number; lockedUntil?: number };

const store = new Map<string, Entry>();

function maxFails(): number {
    const n = parseInt(process.env.AUTH_LOCKOUT_MAX_FAILS ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
}

function lockoutMs(): number {
    const min = parseInt(process.env.AUTH_LOCKOUT_MINUTES ?? '', 10);
    const m = Number.isFinite(min) && min > 0 ? min : 15;
    return m * 60 * 1000;
}

function getEntry(key: string): Entry | undefined {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.lockedUntil != null && Date.now() >= e.lockedUntil) {
        store.delete(key);
        return undefined;
    }
    return e;
}

export function getClientIp(req: Request): string {
    const ip = req.ip || req.socket?.remoteAddress;
    return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
}

export type LockoutResult =
    | { locked: false }
    | { locked: true; retryAfterSec: number };

function isLocked(entry: Entry | undefined): LockoutResult {
    if (!entry?.lockedUntil) return { locked: false };
    const now = Date.now();
    if (now >= entry.lockedUntil) {
        return { locked: false };
    }
    return { locked: true, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
}

export function checkPasswordLockout(tenantId: string, username: string, ip: string): LockoutResult {
    const key = `pwd:${tenantId}:${username.trim().toLowerCase()}:${ip}`;
    return isLocked(getEntry(key));
}

export function recordPasswordFailure(tenantId: string, username: string, ip: string): LockoutResult {
    const key = `pwd:${tenantId}:${username.trim().toLowerCase()}:${ip}`;
    const e = getEntry(key) ?? { fails: 0 };
    const max = maxFails();
    const duration = lockoutMs();

    e.fails += 1;
    if (e.fails >= max) {
        e.lockedUntil = Date.now() + duration;
        e.fails = 0;
    }
    store.set(key, e);
    return isLocked(e);
}

export function clearPasswordLockout(tenantId: string, username: string, ip: string): void {
    const key = `pwd:${tenantId}:${username.trim().toLowerCase()}:${ip}`;
    store.delete(key);
}

export function checkPinLockout(tenantId: string, ip: string): LockoutResult {
    const key = `pin:${tenantId}:${ip}`;
    return isLocked(getEntry(key));
}

export function recordPinFailure(tenantId: string, ip: string): LockoutResult {
    const key = `pin:${tenantId}:${ip}`;
    const e = getEntry(key) ?? { fails: 0 };
    const max = maxFails();
    const duration = lockoutMs();
    e.fails += 1;
    if (e.fails >= max) {
        e.lockedUntil = Date.now() + duration;
        e.fails = 0;
    }
    store.set(key, e);
    return isLocked(e);
}

export function clearPinLockout(tenantId: string, ip: string): void {
    store.delete(`pin:${tenantId}:${ip}`);
}

export function checkSaasLockout(username: string, ip: string): LockoutResult {
    const key = `saas:${username.trim().toLowerCase()}:${ip}`;
    return isLocked(getEntry(key));
}

export function recordSaasFailure(username: string, ip: string): LockoutResult {
    const key = `saas:${username.trim().toLowerCase()}:${ip}`;
    const e = getEntry(key) ?? { fails: 0 };
    const max = maxFails();
    const duration = lockoutMs();
    e.fails += 1;
    if (e.fails >= max) {
        e.lockedUntil = Date.now() + duration;
        e.fails = 0;
    }
    store.set(key, e);
    return isLocked(e);
}

export function clearSaasLockout(username: string, ip: string): void {
    store.delete(`saas:${username.trim().toLowerCase()}:${ip}`);
}

export function checkSaas2faLockout(username: string, ip: string): LockoutResult {
    const key = `saas2fa:${username.trim().toLowerCase()}:${ip}`;
    return isLocked(getEntry(key));
}

export function recordSaas2faFailure(username: string, ip: string): LockoutResult {
    const key = `saas2fa:${username.trim().toLowerCase()}:${ip}`;
    const e = getEntry(key) ?? { fails: 0 };
    const max = maxFails();
    const duration = lockoutMs();
    e.fails += 1;
    if (e.fails >= max) {
        e.lockedUntil = Date.now() + duration;
        e.fails = 0;
    }
    store.set(key, e);
    return isLocked(e);
}

export function clearSaas2faLockout(username: string, ip: string): void {
    store.delete(`saas2fa:${username.trim().toLowerCase()}:${ip}`);
}
