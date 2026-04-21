import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withTenant, queryPublic } from '../lib/db.js';
import { trySendMail } from '../lib/email.js';
import {
    checkPasswordLockout,
    checkPinLockout,
    checkSaasLockout,
    checkSaas2faLockout,
    clearPasswordLockout,
    clearPinLockout,
    clearSaasLockout,
    clearSaas2faLockout,
    getClientIp,
    recordPasswordFailure,
    recordPinFailure,
    recordSaasFailure,
    recordSaas2faFailure,
} from '../lib/login-lockout.js';
import { prisma } from '../lib/prisma.js';
import type { JwtPayload } from '../middleware/auth.js';
import { ensureUsersDeviceIdColumn } from '../lib/userDeviceColumns.js';
import { getEffectiveMaxDevices, isTenantModuleEnabled, migrateBillingTables } from '../services/billing.service.js';

// ─────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    tenantId: z.string().uuid('Geçerli bir tenant UUID gerekli'),
    deviceId: z.string().min(8).optional(),
});

const pinLoginSchema = z.object({
    pinCode: z.string().length(6),
    tenantId: z.string().uuid('Geçerli bir tenant UUID gerekli'),
    deviceId: z.string().min(8).optional(),
});

function shouldSkipDeviceBinding(): boolean {
    const v = process.env.DEV_SKIP_DEVICE_BINDING;
    return v === '1' || v === 'true';
}

function pickDeviceId(req: Request, body: any): string | null {
    const h = req.headers['x-device-id'];
    const fromHeader = Array.isArray(h) ? h[0] : h;
    const raw = fromHeader || body?.deviceId;
    const s = String(raw ?? '').trim();
    return s ? s : null;
}

async function enforceRoleModuleAccess(params: {
    tenantId: string;
    role: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; status: number; error: string; code: string; module: string }> {
    const role = String(params.role || '').toLowerCase().trim();
    const moduleByRole: Record<string, string> = {
        waiter: 'waiter_tablet',
        kitchen: 'kitchen_display',
        courier: 'courier_module',
    };
    const moduleCode = moduleByRole[role];
    if (!moduleCode) return { ok: true };
    await migrateBillingTables();
    const enabled = await isTenantModuleEnabled(params.tenantId, moduleCode);
    if (!enabled) {
        return {
            ok: false,
            status: 403,
            error: 'Bu kullanıcı rolü mevcut paketinizde aktif değil. Lütfen paketinizi yükseltin veya ilgili modülü açın.',
            code: 'ROLE_MODULE_LOCKED',
            module: moduleCode,
        };
    }
    return { ok: true };
}

async function enforceOrBindDevice(params: {
    tenantId: string;
    userId: number;
    deviceId: string | null;
    role?: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; status: number; error: string; code: string; maxDevices?: number }> {
    if (shouldSkipDeviceBinding()) return { ok: true };
    const role = String(params.role || '').toLowerCase().trim();
    if (role === 'admin') {
        return withTenant(params.tenantId, async (connection) => {
            await ensureUsersDeviceIdColumn(connection);
            await connection.query(`UPDATE users SET device_id = NULL WHERE id = ?`, [params.userId]);
            return { ok: true };
        });
    }
    const deviceId = String(params.deviceId ?? '').trim();
    if (!deviceId) {
        return { ok: false, status: 400, error: 'Cihaz kimliği gerekli. Lütfen bu cihazdan tekrar giriş yapın.', code: 'DEVICE_ID_REQUIRED' };
    }
    const normalized = deviceId.toLowerCase();

    return withTenant(params.tenantId, async (connection) => {
        await ensureUsersDeviceIdColumn(connection);
        const [rows]: any = await connection.query(`SELECT id, device_id FROM users WHERE id = ? LIMIT 1`, [params.userId]);
        const row = rows?.[0];
        if (!row) {
            return { ok: false, status: 404, error: 'Kullanıcı bulunamadı', code: 'USER_NOT_FOUND' };
        }

        const current = String(row.device_id ?? '').trim().toLowerCase();
        if (current) {
            if (current !== normalized) {
                return { ok: false, status: 403, error: 'Bu kullanıcı farklı bir cihaza kilitli. Yönetici panelinden cihaz kilidini sıfırlayın.', code: 'DEVICE_MISMATCH' };
            }
            return { ok: true };
        }

        const [{ total } = { total: 3 }]: any = await Promise.all([getEffectiveMaxDevices(params.tenantId)]);
        const [cntRows]: any = await connection.query(
            `SELECT COUNT(DISTINCT device_id) as c FROM users WHERE device_id IS NOT NULL AND TRIM(device_id) <> ''`,
        );
        const distinctCount = Number(cntRows?.[0]?.c ?? 0);

        const [sameDeviceRows]: any = await connection.query(
            `SELECT 1 FROM users WHERE LOWER(TRIM(device_id)) = LOWER(TRIM(?)) LIMIT 1`,
            [normalized],
        );
        const alreadyKnownDevice = Array.isArray(sameDeviceRows) && sameDeviceRows.length > 0;

        if (!alreadyKnownDevice && distinctCount >= Number(total || 3)) {
            return {
                ok: false,
                status: 403,
                error: `Cihaz kotası doldu (en fazla ${Number(total || 3)}). Plan yükseltmesi veya «Ek Cihaz» gerekir.`,
                code: 'DEVICE_QUOTA',
                maxDevices: Number(total || 3),
            };
        }

        await connection.query(`UPDATE users SET device_id = ? WHERE id = ?`, [normalized, params.userId]);
        return { ok: true };
    });
}

const saasLoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

const saas2faVerifySchema = z.object({
    token: z.string().min(10),
    code: z.string().min(4).max(10),
});

let _saas2faFieldsReady = false;
async function ensureSaas2faFields(): Promise<void> {
    if (_saas2faFieldsReady) return;
    try {
        const cols = [
            'two_factor_enabled BOOLEAN DEFAULT FALSE',
            "two_factor_method VARCHAR(20) DEFAULT 'none'",
            'two_factor_code VARCHAR(12)',
            'two_factor_expires_at TIMESTAMPTZ',
            'two_factor_secret VARCHAR(128)',
            'two_factor_backup_codes TEXT',
        ];
        for (const col of cols) {
            try {
                await queryPublic(`ALTER TABLE \`public\`.saas_admins ADD COLUMN IF NOT EXISTS ${col}`);
            } catch {
                /* ignore */
            }
        }
        _saas2faFieldsReady = true;
    } catch {
        /* ignore */
    }
}

function makeSaasAccessToken(admin: {
    id: number;
    username: string;
    role?: string | null;
}): string {
    const role = admin.role || 'super_admin';
    const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
        userId: admin.id,
        username: admin.username,
        role,
        isSaaSAdmin: true,
    };
    return jwt.sign(
        tokenPayload,
        (process.env.JWT_SECRET as string) || 'secret',
        { expiresIn: '12h' },
    );
}

function base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = input.toUpperCase().replace(/=+$/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = alphabet.indexOf(ch);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function hotp(secretBase32: string, counter: number): string {
    const key = base32Decode(secretBase32);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter % 0x100000000, 4);
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
}

function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
    const nowCounter = Math.floor(Date.now() / 30000);
    const normalized = String(code).replace(/\s+/g, '');
    for (let i = -window; i <= window; i++) {
        if (hotp(secretBase32, nowCounter + i) === normalized) return true;
    }
    return false;
}

function parseBackupCodes(raw: unknown): string[] {
    if (!raw) return [];
    try {
        const arr = JSON.parse(String(raw));
        if (!Array.isArray(arr)) return [];
        return arr.map((v) => String(v)).filter(Boolean);
    } catch {
        return [];
    }
}

async function logSaas2faAudit(params: {
    userId: number | string;
    username: string;
    action: 'saas_2fa_verified' | 'saas_2fa_resend';
    method: 'email_otp' | 'authenticator_totp' | 'backup_code';
    req: Request;
    extra?: Record<string, unknown>;
}): Promise<void> {
    try {
        await queryPublic(
            `INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(params.userId),
                params.action,
                'saas_2fa',
                String(params.userId),
                null,
                JSON.stringify({
                    username: params.username,
                    method: params.method,
                    ...(params.extra || {}),
                }),
                getClientIp(params.req),
                String(params.req.headers['user-agent'] || ''),
            ],
        );
    } catch {
        /* audit log hatasi ana akisi bozmamali */
    }
}

// ─────────────────────────────────────
// Controller Methods
// ─────────────────────────────────────

export const login = async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.parse(req.body);
        const { username, password, tenantId } = parsed;
        const ip = getClientIp(req);
        const deviceId = pickDeviceId(req, parsed);

        const pwdLock = checkPasswordLockout(tenantId, username, ip);
        if (pwdLock.locked) {
            return res.status(429).json({
                error: 'Çok fazla başarısız giriş. Lütfen bekleyin.',
                retryAfterSec: pwdLock.retryAfterSec,
            });
        }

        // 1. Check Tenant Status in Public Schema
        const [tenantRows]: any = await queryPublic(
            'SELECT status, name, max_users FROM `public`.tenants WHERE id = ?',
            [tenantId]
        );

        if (tenantRows.length === 0) {
            return res.status(404).json({ error: 'Sistem kaydı bulunamadı' });
        }

        const tenant = tenantRows[0];
        if (tenant.status !== 'active') {
            return res.status(403).json({ 
                error: `Restoran hesabı (${tenant.name}) şu an pasif durumdadır. Lütfen yönetimle iletişime geçin.`,
                status: tenant.status 
            });
        }

        const user = await withTenant(tenantId, async (connection) => {
            await ensureUsersDeviceIdColumn(connection);
            const [rows]: any = await connection.query(
                `SELECT u.*, b.name as branch_name, b.default_language 
                 FROM users u 
                 LEFT JOIN branches b ON u.branch_id = b.id 
                 WHERE LOWER(u.username) = LOWER(?)`,
                [username]
            );
            return rows[0] || null;
        });

        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            const after = recordPasswordFailure(tenantId, username, ip);
            if (after.locked) {
                return res.status(429).json({
                    error: 'Çok fazla başarısız giriş. Hesap geçici olarak kilitlendi.',
                    retryAfterSec: after.retryAfterSec,
                });
            }
            return res.status(401).json({ error: 'Şifre hatalı' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Kullanıcı hesabı devre dışı' });
        }

        clearPasswordLockout(tenantId, username, ip);

        const roleGate = await enforceRoleModuleAccess({ tenantId, role: user.role });
        if (!roleGate.ok) {
            return res.status(roleGate.status).json({
                error: roleGate.error,
                code: roleGate.code,
                module: roleGate.module,
            });
        }

        const deviceGate = await enforceOrBindDevice({
            tenantId,
            userId: Number(user.id),
            deviceId,
            role: user.role,
        });
        if (!deviceGate.ok) {
            return res.status(deviceGate.status).json({ error: deviceGate.error, code: deviceGate.code, maxDevices: deviceGate.maxDevices });
        }

        const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
            userId: user.id,
            username: user.username,
            role: user.role,
            tenantId: tenantId,
            branchId: user.branch_id,
        };

        const accessToken = jwt.sign(
            tokenPayload,
            (process.env.JWT_SECRET || 'secret') as jwt.Secret,
            { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, tenantId },
            (process.env.JWT_REFRESH_SECRET || 'refresh-secret') as jwt.Secret,
            { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
        );

        await withTenant(tenantId, async (connection) => {
            await connection.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );
        });

        res.json({
            accessToken,
            refreshToken,
            tenantName: tenant.name,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                preferredLanguage: user.preferred_language,
                branchId: user.branch_id,
                branchName: user.branch_name,
                waiter_all_sections: user.waiter_all_sections,
                waiter_section_id: user.waiter_section_id,
                kitchen_station: user.kitchen_station,
            },
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri', details: error.errors });
        }
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

export const loginWithPin = async (req: Request, res: Response) => {
    try {
        const parsed = pinLoginSchema.parse(req.body);
        const { pinCode, tenantId } = parsed;
        const ip = getClientIp(req);
        const deviceId = pickDeviceId(req, parsed);

        const pinLock = checkPinLockout(tenantId, ip);
        if (pinLock.locked) {
            return res.status(429).json({
                error: 'Çok fazla PIN denemesi. Lütfen bekleyin.',
                retryAfterSec: pinLock.retryAfterSec,
            });
        }

        // 1. Check Tenant Status
        const [tenantRows]: any = await queryPublic(
            'SELECT status, name FROM `public`.tenants WHERE id = ?',
            [tenantId]
        );

        if (tenantRows.length === 0 || tenantRows[0].status !== 'active') {
            return res.status(403).json({ error: 'Restoran hesabı pasif veya bulunamadı' });
        }

        const user = await withTenant(tenantId, async (connection) => {
            await ensureUsersDeviceIdColumn(connection);
            const [rows]: any = await connection.query(
                `SELECT u.*, b.name as branch_name 
                 FROM users u 
                 LEFT JOIN branches b ON u.branch_id = b.id 
                 WHERE u.pin_code = ? AND u.status = 'active'`,
                [pinCode]
            );
            return rows[0] || null;
        });

        if (!user) {
            const after = recordPinFailure(tenantId, ip);
            if (after.locked) {
                return res.status(429).json({
                    error: 'Çok fazla PIN denemesi. Lütfen bekleyin.',
                    retryAfterSec: after.retryAfterSec,
                });
            }
            return res.status(401).json({ error: 'Geçersiz PIN' });
        }

        clearPinLockout(tenantId, ip);

        const roleGate = await enforceRoleModuleAccess({ tenantId, role: user.role });
        if (!roleGate.ok) {
            return res.status(roleGate.status).json({
                error: roleGate.error,
                code: roleGate.code,
                module: roleGate.module,
            });
        }

        const deviceGate = await enforceOrBindDevice({
            tenantId,
            userId: Number(user.id),
            deviceId,
            role: user.role,
        });
        if (!deviceGate.ok) {
            return res.status(deviceGate.status).json({ error: deviceGate.error, code: deviceGate.code, maxDevices: deviceGate.maxDevices });
        }

        const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
            userId: user.id,
            username: user.username,
            role: user.role,
            tenantId,
            branchId: user.branch_id,
        };

        const accessToken = jwt.sign(
            tokenPayload,
            (process.env.JWT_SECRET || 'secret') as jwt.Secret,
            { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, tenantId },
            (process.env.JWT_REFRESH_SECRET || 'refresh-secret') as jwt.Secret,
            { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
        );

        await withTenant(tenantId, async (connection) => {
            await connection.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );
        });

        res.json({
            accessToken,
            refreshToken,
            tenantName: tenantRows[0].name,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                preferredLanguage: user.preferred_language,
                branchId: user.branch_id,
                branchName: user.branch_name,
                waiter_all_sections: user.waiter_all_sections,
                waiter_section_id: user.waiter_section_id,
                kitchen_station: user.kitchen_station,
            },
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri' });
        }
        console.error('❌ PIN Login error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token gerekli' });
        }

        const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET || 'refresh-secret'
        ) as { userId: number; tenantId: string };

        const user = await withTenant(decoded.tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                'SELECT id, role, branch_id, status FROM users WHERE id = ?',
                [decoded.userId]
            );
            return rows[0] || null;
        });

        if (!user || user.status !== 'active') {
            return res.status(403).json({ error: 'Geçersiz token veya hesap devre dışı' });
        }

        const newAccessToken = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                role: user.role,
                tenantId: decoded.tenantId,
                branchId: user.branch_id,
            },
            (process.env.JWT_SECRET || 'secret') as jwt.Secret,
            { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
        );

        res.json({ accessToken: newAccessToken });
    } catch {
        res.status(401).json({ error: 'Token süresi dolmuş veya geçersiz' });
    }
};

export const logout = (_req: Request, res: Response) => {
    res.json({ message: 'Çıkış başarılı' });
};

export const saasLogin = async (req: Request, res: Response) => {
    try {
        const { username, password } = saasLoginSchema.parse(req.body);
        const ip = getClientIp(req);

        const saasLock = checkSaasLockout(username, ip);
        if (saasLock.locked) {
            return res.status(429).json({
                error: 'Çok fazla başarısız giriş. Lütfen bekleyin.',
                retryAfterSec: saasLock.retryAfterSec,
            });
        }

        const admin = await prisma.saasAdmin.findUnique({
            where: { username },
            include: { resellerPlan: true },
        });

        console.log(`🔑 SaaS Login Attempt | Username: [${username}] | Found: ${admin ? 'yes' : 'no'}`);
        if (!admin) {
            const after = recordSaasFailure(username, ip);
            if (after.locked) {
                return res.status(429).json({
                    error: 'Çok fazla başarısız giriş. Lütfen bekleyin.',
                    retryAfterSec: after.retryAfterSec,
                });
            }
            return res.status(401).json({ error: 'SaaS Admin bulunamadı' });
        }

        const isValid = await bcrypt.compare(password, admin.passwordHash);

        if (!isValid) {
            const after = recordSaasFailure(username, ip);
            if (after.locked) {
                return res.status(429).json({
                    error: 'Çok fazla başarısız giriş. Hesap geçici olarak kilitlendi.',
                    retryAfterSec: after.retryAfterSec,
                });
            }
            return res.status(401).json({ error: 'Şifre hatalı' });
        }

        const role = admin.role || 'super_admin';
        if (!admin.isActive) {
            return res.status(403).json({ error: 'Hesap devre dışı bırakılmış. Yönetici ile iletişime geçin.' });
        }

        clearSaasLockout(username, ip);
        await ensureSaas2faFields();

        const [rows]: any = await queryPublic(
            `SELECT COALESCE(two_factor_enabled, FALSE) as enabled,
                    COALESCE(two_factor_method, 'none') as method,
                    email,
                    two_factor_secret
             FROM \`public\`.saas_admins
             WHERE id = ?
             LIMIT 1`,
            [admin.id],
        );
        const twofa = rows?.[0] || { enabled: false, method: 'none', email: admin.email };
        const twoFactorEnabled = Boolean(twofa.enabled) && String(twofa.method || 'none') !== 'none';

        if (twoFactorEnabled) {
            let code: string | null = null;
            if (String(twofa.method) === 'email') {
                code = String(Math.floor(100000 + Math.random() * 900000));
                await queryPublic(
                    `UPDATE \`public\`.saas_admins
                     SET two_factor_code = ?, two_factor_expires_at = NOW() + INTERVAL '10 minutes'
                     WHERE id = ?`,
                    [code, admin.id],
                );
            }
            const challengeToken = jwt.sign(
                { saasAdminId: admin.id, username: admin.username, phase: 'saas_2fa' },
                (process.env.JWT_SECRET as string) || 'secret',
                { expiresIn: '10m' },
            );
            if (String(twofa.method) === 'email' && twofa.email && code) {
                const mail = await trySendMail({
                    to: String(twofa.email),
                    subject: 'NextPOS 2FA doğrulama kodu',
                    text: `Giriş doğrulama kodunuz: ${code}. Kod 10 dakika geçerlidir.`,
                });
                if (!mail.ok) {
                    console.warn('[2FA] mail gönderilemedi, code:', code, 'reason:', mail.reason);
                }
            } else {
                console.info('[2FA] authenticator challenge for', admin.username);
            }
            return res.json({
                requires_2fa: true,
                two_factor_method: String(twofa.method || 'email'),
                challenge_token: challengeToken,
            });
        }

        const accessToken = makeSaasAccessToken({ id: admin.id, username: admin.username, role });

        await prisma.saasAdmin.update({
            where: { id: admin.id },
            data: { lastLogin: new Date() },
        });

        res.json({
            accessToken,
            user: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                name: admin.fullName || admin.companyName || admin.username,
                role,
                wallet_balance: Number(admin.walletBalance),
                available_licenses: admin.availableLicenses,
                reseller_plan_id: admin.resellerPlanId ?? null,
                reseller_plan_name: admin.resellerPlan?.name ?? null,
                reseller_plan_code: admin.resellerPlan?.code ?? null,
                reseller_plan_license_cap: admin.resellerPlan?.licenseCount ?? null,
                reseller_plan_price:
                    admin.resellerPlan != null ? Number(admin.resellerPlan.price) : null,
            },
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri' });
        }
        console.error('❌ SaaS Login error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

export const verifySaas2fa = async (req: Request, res: Response) => {
    try {
        const { token, code } = saas2faVerifySchema.parse(req.body);
        const ip = getClientIp(req);
        const decoded = jwt.verify(
            token,
            (process.env.JWT_SECRET as string) || 'secret',
        ) as { saasAdminId: number; username: string; phase?: string };
        if (decoded.phase !== 'saas_2fa') {
            return res.status(401).json({ error: 'Geçersiz 2FA token' });
        }
        const codeLock = checkSaas2faLockout(decoded.username, ip);
        if (codeLock.locked) {
            return res.status(429).json({
                error: 'Çok fazla hatalı 2FA denemesi. Lütfen bekleyin.',
                retryAfterSec: codeLock.retryAfterSec,
            });
        }
        await ensureSaas2faFields();
        const [rows]: any = await queryPublic(
            `SELECT id, username, role, email, full_name, company_name, wallet_balance, available_licenses,
                    COALESCE(two_factor_method, 'none') as two_factor_method,
                    two_factor_code, two_factor_expires_at, two_factor_secret, two_factor_backup_codes
             FROM \`public\`.saas_admins
             WHERE id = ?
             LIMIT 1`,
            [decoded.saasAdminId],
        );
        const admin = rows?.[0];
        if (!admin) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        let backupCodeMatched: string | null = null;
        const backupCodes = parseBackupCodes(admin.two_factor_backup_codes);
        const normalizedCode = String(code).trim().toUpperCase();
        if (backupCodes.includes(normalizedCode)) {
            backupCodeMatched = normalizedCode;
        }
        if (String(admin.two_factor_method) === 'authenticator') {
            const validTotp = admin.two_factor_secret && verifyTotp(String(admin.two_factor_secret), code);
            if (!validTotp && !backupCodeMatched) {
                const after = recordSaas2faFailure(decoded.username, ip);
                if (after.locked) {
                    return res.status(429).json({
                        error: 'Çok fazla hatalı 2FA denemesi. Hesap geçici olarak kilitlendi.',
                        retryAfterSec: after.retryAfterSec,
                    });
                }
                return res.status(401).json({ error: '2FA kodu hatalı' });
            }
        } else {
            if (!backupCodeMatched && (!admin.two_factor_code || String(admin.two_factor_code) !== String(code))) {
                const after = recordSaas2faFailure(decoded.username, ip);
                if (after.locked) {
                    return res.status(429).json({
                        error: 'Çok fazla hatalı 2FA denemesi. Hesap geçici olarak kilitlendi.',
                        retryAfterSec: after.retryAfterSec,
                    });
                }
                return res.status(401).json({ error: '2FA kodu hatalı' });
            }
            if (!backupCodeMatched) {
                const exp = admin.two_factor_expires_at ? new Date(admin.two_factor_expires_at).getTime() : 0;
                if (!exp || Date.now() > exp) {
                    return res.status(401).json({ error: '2FA kodunun süresi doldu' });
                }
            }
        }

        clearSaas2faLockout(decoded.username, ip);
        let nextBackupCodes = backupCodes;
        if (backupCodeMatched) {
            nextBackupCodes = backupCodes.filter((c) => c !== backupCodeMatched);
        }
        await queryPublic(
            `UPDATE \`public\`.saas_admins
             SET two_factor_code = NULL, two_factor_expires_at = NULL, two_factor_backup_codes = ?, last_login = NOW()
             WHERE id = ?`,
            [JSON.stringify(nextBackupCodes), admin.id],
        );
        const usedMethod: 'email_otp' | 'authenticator_totp' | 'backup_code' = backupCodeMatched
            ? 'backup_code'
            : String(admin.two_factor_method) === 'authenticator'
              ? 'authenticator_totp'
              : 'email_otp';
        await logSaas2faAudit({
            userId: Number(admin.id),
            username: String(admin.username),
            action: 'saas_2fa_verified',
            method: usedMethod,
            req,
            extra: {
                backup_codes_remaining: nextBackupCodes.length,
            },
        });

        const accessToken = makeSaasAccessToken({
            id: Number(admin.id),
            username: String(admin.username),
            role: String(admin.role || 'super_admin'),
        });
        const profile = await prisma.saasAdmin.findUnique({
            where: { id: Number(admin.id) },
            include: { resellerPlan: true },
        });
        res.json({
            accessToken,
            user: {
                id: Number(admin.id),
                username: String(admin.username),
                email: admin.email ? String(admin.email) : null,
                name: String(admin.full_name || admin.company_name || admin.username),
                role: String(admin.role || 'super_admin'),
                wallet_balance: Number(admin.wallet_balance || 0),
                available_licenses: Number(admin.available_licenses || 0),
                reseller_plan_id: profile?.resellerPlanId ?? null,
                reseller_plan_name: profile?.resellerPlan?.name ?? null,
                reseller_plan_code: profile?.resellerPlan?.code ?? null,
                reseller_plan_license_cap: profile?.resellerPlan?.licenseCount ?? null,
                reseller_plan_price:
                    profile?.resellerPlan != null ? Number(profile.resellerPlan.price) : null,
            },
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Geçersiz veri' });
        }
        return res.status(401).json({ error: '2FA doğrulaması başarısız' });
    }
};

export const resendSaas2fa = async (req: Request, res: Response) => {
    try {
        const token = String(req.body?.token || '');
        if (!token) return res.status(400).json({ error: 'Token gerekli' });
        const decoded = jwt.verify(
            token,
            (process.env.JWT_SECRET as string) || 'secret',
        ) as { saasAdminId: number; phase?: string };
        if (decoded.phase !== 'saas_2fa') return res.status(401).json({ error: 'Geçersiz 2FA token' });
        await ensureSaas2faFields();
        const [rows]: any = await queryPublic(
            `SELECT id, username, email, COALESCE(two_factor_method, 'none') as two_factor_method
             FROM \`public\`.saas_admins WHERE id = ? LIMIT 1`,
            [decoded.saasAdminId],
        );
        const admin = rows?.[0];
        if (!admin) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        if (String(admin.two_factor_method) !== 'email') {
            return res.json({ ok: true, message: 'Authenticator yöntemi için yeniden gönderme yok' });
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await queryPublic(
            `UPDATE \`public\`.saas_admins SET two_factor_code = ?, two_factor_expires_at = NOW() + INTERVAL '10 minutes' WHERE id = ?`,
            [code, admin.id],
        );
        if (admin.email) {
            await trySendMail({
                to: String(admin.email),
                subject: 'NextPOS 2FA kodu (yeniden gönderim)',
                text: `Yeni doğrulama kodunuz: ${code}. Kod 10 dakika geçerlidir.`,
            });
        } else {
            console.info('[2FA resend] code for', admin.username, ':', code);
        }
        await logSaas2faAudit({
            userId: Number(admin.id),
            username: String(admin.username),
            action: 'saas_2fa_resend',
            method: 'email_otp',
            req,
        });
        return res.json({ ok: true, message: '2FA kodu yeniden gönderildi' });
    } catch {
        return res.status(401).json({ error: '2FA yeniden gönderme başarısız' });
    }
};

/** Masada ürün varken (iptal yetkisi için) admin şifresi doğrular */
export const verifyAdminPin = async (req: Request, res: Response) => {
    try {
        const { pinCode } = z.object({ pinCode: z.string().length(6) }).parse(req.body);
        const tenantId = req.tenantId!;

        const admin = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                "SELECT id FROM users WHERE pin_code = ? AND role = 'admin' AND status = 'active'",
                [pinCode]
            );
            return rows[0] || null;
        });

        if (!admin) {
            return res.status(401).json({ error: 'Geçersiz admin şifresi' });
        }

        res.json({ success: true, message: 'Doğrulama başarılı' });
    } catch {
        res.status(400).json({ error: 'Doğrulama hatası' });
    }
};
