import type { NextFunction, Request, Response } from 'express';
import { queryPublic } from '../lib/db.js';

type JsonLike = Record<string, unknown> | unknown[] | string | number | boolean | null;

const SENSITIVE_KEYS = [
    'password',
    'new_password',
    'current_password',
    'password_hash',
    'token',
    'refreshToken',
    'accessToken',
    'authorization',
    'secret',
    'two_factor_code',
    'two_factor_secret',
    'two_factor_temp_secret',
    'two_factor_backup_codes',
    'pin',
    'pinCode',
    'api_key',
    'key_value',
];

function isSensitiveKey(key: string): boolean {
    const k = key.toLowerCase();
    return SENSITIVE_KEYS.some((item) => k.includes(item.toLowerCase()));
}

function truncate(input: string, max = 1500): string {
    if (input.length <= max) return input;
    return `${input.slice(0, max)}…`;
}

function sanitizeValue(value: unknown, depth = 0): JsonLike {
    if (depth > 4) return '[depth_limited]';
    if (value == null) return null;
    if (typeof value === 'string') return truncate(value, 500);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
        const limited = value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
        if (value.length > 25) limited.push(`[+${value.length - 25} items]`);
        return limited;
    }
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = isSensitiveKey(k) ? '[redacted]' : sanitizeValue(v, depth + 1);
        }
        return out;
    }
    return String(value);
}

export function apiAuditLogger(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const actor = (req as any).user as { userId?: string | number; role?: string; username?: string } | undefined;

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const action = `api_request:${req.method.toUpperCase()}`;
        const safeNewValue = sanitizeValue({
            method: req.method,
            original_url: req.originalUrl,
            path: req.path,
            query: req.query,
            params: req.params,
            body: req.body,
            status_code: res.statusCode,
            duration_ms: durationMs,
            success: res.statusCode < 400,
            tenant_id: (req as any).tenantId || null,
            actor_role: actor?.role || null,
            actor_username: actor?.username || null,
        });

        void queryPublic(
            `INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(actor?.userId ?? 'anonymous'),
                action,
                'api_request',
                `${req.method.toUpperCase()} ${req.path}`,
                null,
                JSON.stringify(safeNewValue),
                req.ip || req.socket.remoteAddress || null,
                String(req.headers['user-agent'] || ''),
            ],
        ).catch(() => {
            /* audit hatasi ana akisi bozmaz */
        });
    });

    next();
}

