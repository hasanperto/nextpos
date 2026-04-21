// ═══════════════════════════════════════════════════════════════════════════
// NextPOS — Authentication & Tenant Middleware
// JWT doğrulama + tenant_id çıkarma + schema izolasyonu
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
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
