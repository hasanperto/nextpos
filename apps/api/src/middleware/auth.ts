// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Authentication & Tenant Middleware
// JWT doğrulama + tenant_id çıkarma + schema izolasyonu
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { withTenant } from '../lib/db.js';
import { getEffectiveMaxDevices } from '../services/billing.service.js';

// ═══════════════════════════════════════
// TypeScript Tip Tanımları
// ═══════════════════════════════════════

/**
 * JWT payload yapısı — her token bu bilgileri taşır.
 */
export interface JwtPayload {
    userId: string | number;
    username?: string;   // Kullanıcı adı (Audit log için)
    role: string;
    tenantId?: string;   // UUID — public.tenants.id (Tenant adminleri için zorunlu)
    branchId?: number;  // Şube ID (tenant_X.branches.id)
    resellerId?: number; // Bayi ID (public.tenants.reseller_id'ye karşılık gelir)
    isSaaSAdmin?: boolean; // SaaS Super Admin mi?
    iat?: number;
    exp?: number;
}

// Express Request'e tenant bilgilerini ekle
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
            tenantId?: string;
            branchId?: number;
        }
    }
}

// ═══════════════════════════════════════
// 1. JWT Authentication Middleware
// ═══════════════════════════════════════

/**
 * Authorization header'dan Bearer token'ı alır, doğrular ve
 * req.user, req.tenantId, req.branchId'yi set eder.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn(`[Auth] 401 Unauthorized: Header eksik veya geçersiz. URL: ${req.originalUrl}`);
            return res.status(401).json({
                error: 'Yetkilendirme gerekli',
                code: 'AUTH_REQUIRED',
            });
        }

        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'secret';

        try {
            const decoded = jwt.verify(token, secret) as JwtPayload;

            // Token'dan tenant bilgisi zorunlu (SaaS admin hariç)
            if (!decoded.isSaaSAdmin && !decoded.tenantId) {
                console.warn(`[Auth] 401 Unauthorized: Tenant ID eksik. URL: ${req.originalUrl}`);
                return res.status(401).json({
                    error: 'Geçersiz token: Tenant bilgisi eksik',
                    code: 'TENANT_MISSING',
                });
            }

            // Request'e kullanıcı ve tenant bilgilerini ekle
            req.user = decoded;
            req.tenantId = decoded.tenantId;
            req.branchId = decoded.branchId;

            // Enforce device count limit for operational roles (exclude admin and SaaS admin)
            const role = decoded.role?.toLowerCase();
            const isOperational = ['waiter', 'cashier', 'kitchen', 'courier'].includes(role);
            const devSkip = process.env.DEV_SKIP_DEVICE_BINDING === '1' || process.env.DEV_SKIP_DEVICE_BINDING === 'true';

            if (isOperational && !devSkip && decoded.tenantId) {
                const tenantId = decoded.tenantId;
                const headerDevice = req.headers['x-device-id'];
                const deviceId = String(headerDevice ?? '').trim().toLowerCase();

                if (!deviceId) {
                    return res.status(400).json({
                        error: 'Cihaz kimliği gerekli (x-device-id header eksik). Lütfen bu cihazdan tekrar giriş yapın.',
                        code: 'DEVICE_ID_REQUIRED',
                    });
                }

                const deviceStatus = await withTenant(tenantId, async (connection) => {
                    const [rows]: any = await connection.query(
                        `SELECT id, device_id FROM users WHERE id = ? LIMIT 1`,
                        [decoded.userId]
                    );
                    const user = rows?.[0];
                    if (!user) {
                        return { ok: false, status: 404, error: 'Kullanıcı bulunamadı', code: 'USER_NOT_FOUND' };
                    }

                    const boundDevice = String(user.device_id ?? '').trim().toLowerCase();
                    if (boundDevice && boundDevice !== deviceId) {
                        return { ok: false, status: 403, error: 'Bu cihaz yetkili değil veya başka bir kullanıcı kilitli.', code: 'DEVICE_MISMATCH' };
                    }

                    // Count total distinct devices
                    const [{ total } = { total: 3 }]: any = await Promise.all([getEffectiveMaxDevices(tenantId)]);
                    const [cntRows]: any = await connection.query(
                        `SELECT COUNT(DISTINCT device_id) as c FROM users WHERE device_id IS NOT NULL AND TRIM(device_id) <> ''`
                    );
                    const userDeviceCount = Number(cntRows?.[0]?.c ?? 0);

                    // Get kiosk device count from branch settings
                    const [branchRows]: any = await connection.query(
                        `SELECT settings FROM branches ORDER BY id ASC LIMIT 1`
                    );
                    const rawSettings = branchRows?.[0]?.settings;
                    let kioskDeviceCount = 0;
                    if (rawSettings) {
                        let settings: any = {};
                        try {
                            settings = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : rawSettings;
                            const linked = settings?.integrations?.kiosk?.linkedDevices;
                            if (Array.isArray(linked)) {
                                kioskDeviceCount = linked.length;
                            }
                        } catch { /* ignore */ }
                    }

                    const distinctCount = userDeviceCount + kioskDeviceCount;

                    // If user is not yet bound to this device, but we are at/over quota, block binding.
                    if (!boundDevice && distinctCount >= Number(total || 3)) {
                        return {
                            ok: false,
                            status: 403,
                            error: `Cihaz kotası doldu (en fazla ${Number(total || 3)}). Plan yükseltmesi veya «Ek Cihaz» gerekir.`,
                            code: 'DEVICE_QUOTA',
                        };
                    }

                    // Downgrade check: if distinctCount exceeds total allowed
                    if (distinctCount > Number(total || 3)) {
                        return {
                            ok: false,
                            status: 403,
                            error: `Cihaz kotası aşıldı (Kullanılan: ${distinctCount}, En fazla: ${Number(total || 3)}). Yönetici panelinden cihaz kilitlerini sıfırlayın veya paketinizi yükseltin.`,
                            code: 'DEVICE_QUOTA',
                        };
                    }

                    if (!boundDevice) {
                        // Bind it now
                        await connection.query(`UPDATE users SET device_id = ? WHERE id = ?`, [deviceId, decoded.userId]);
                    }

                    return { ok: true };
                });

                if (!deviceStatus.ok) {
                    return res.status(deviceStatus.status!).json({
                        error: deviceStatus.error,
                        code: deviceStatus.code,
                    });
                }
            }

            next();
        } catch (jwtErr: any) {
            console.warn(`[Auth] 401 Unauthorized: JWT Hatası (${jwtErr.name}). URL: ${req.originalUrl}`);
            if (jwtErr.name === 'TokenExpiredError') {
                return res.status(401).json({
                    error: 'Token süresi dolmuş',
                    code: 'TOKEN_EXPIRED',
                });
            }
            return res.status(401).json({
                error: 'Geçersiz token',
                code: 'INVALID_TOKEN',
            });
        }
    } catch (error: any) {
        console.error('❌ Auth Middleware Error:', error.message);
        return res.status(500).json({ error: 'Yetkilendirme hatası' });
    }
}

// ═══════════════════════════════════════
// 2. Role-Based Access Control (RBAC)
// ═══════════════════════════════════════

/**
 * Belirli roller için erişim kısıtlaması.
 * Kural dosyasından: "Bir personelin tek bir aktif operasyonel rolü olabilir"
 * 
 * @example
 * router.post('/close-day', requireRole('admin', 'cashier'), handler);
 */
export function requireRole(...allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Yetkilendirme gerekli',
                code: 'AUTH_REQUIRED',
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Bu işlem için yetkiniz yok. Gerekli roller: ${allowedRoles.join(', ')}`,
                code: 'FORBIDDEN',
            });
        }

        next();
    };
}

// ═══════════════════════════════════════
// 3. Optional Auth — Public endpoint'ler için
// Token varsa parse et, yoksa devam et
// ═══════════════════════════════════════

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const secret = process.env.JWT_SECRET || 'secret';
            const decoded = jwt.verify(token, secret) as JwtPayload;
            req.user = decoded;
            req.tenantId = decoded.tenantId;
            req.branchId = decoded.branchId;
        }
    } catch {
        // Token geçersizse sessizce devam et
    }
    next();
}
