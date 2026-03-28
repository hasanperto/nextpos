import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withTenant, queryPublic } from '../lib/db.js';
import type { JwtPayload } from '../middleware/auth.js';

// ─────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    tenantId: z.string().uuid('Geçerli bir tenant UUID gerekli'),
});

const pinLoginSchema = z.object({
    pinCode: z.string().length(6),
    tenantId: z.string().uuid('Geçerli bir tenant UUID gerekli'),
});

const saasLoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

// ─────────────────────────────────────
// Controller Methods
// ─────────────────────────────────────

export const login = async (req: Request, res: Response) => {
    try {
        const { username, password, tenantId } = loginSchema.parse(req.body);

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
            const [rows]: any = await connection.query(
                `SELECT u.*, b.name as branch_name, b.default_language 
                 FROM users u 
                 LEFT JOIN branches b ON u.branch_id = b.id 
                 WHERE u.username = ?`,
                [username]
            );
            return rows[0] || null;
        });

        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Şifre hatalı' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Kullanıcı hesabı devre dışı' });
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
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                preferredLanguage: user.preferred_language,
                branchId: user.branch_id,
                branchName: user.branch_name,
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
        const { pinCode, tenantId } = pinLoginSchema.parse(req.body);

        // 1. Check Tenant Status
        const [tenantRows]: any = await queryPublic(
            'SELECT status, name FROM `public`.tenants WHERE id = ?',
            [tenantId]
        );

        if (tenantRows.length === 0 || tenantRows[0].status !== 'active') {
            return res.status(403).json({ error: 'Restoran hesabı pasif veya bulunamadı' });
        }

        const user = await withTenant(tenantId, async (connection) => {
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
            return res.status(401).json({ error: 'Geçersiz PIN' });
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
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                preferredLanguage: user.preferred_language,
                branchId: user.branch_id,
                branchName: user.branch_name,
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

        const [rows]: any = await queryPublic(
            'SELECT * FROM public.saas_admins WHERE username = ?',
            [username]
        );

        console.log(`🔑 SaaS Login Attempt | Username: [${username}] | Rows found: ${rows.length}`);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'SaaS Admin bulunamadı' });
        }

        const admin = rows[0];
        const isValid = await bcrypt.compare(password, admin.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Şifre hatalı' });
        }

        const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
            userId: admin.id,
            username: admin.username,
            role: admin.role,
            isSaaSAdmin: true
        };

        const accessToken = jwt.sign(
            tokenPayload,
            (process.env.JWT_SECRET as string) || 'secret',
            { expiresIn: '12h' }
        );

        await queryPublic(
            'UPDATE public.saas_admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [admin.id]
        );

        res.json({
            accessToken,
            user: {
                id: admin.id,
                username: admin.username,
                name: admin.full_name || admin.company_name,
                role: admin.role,
                wallet_balance: admin.wallet_balance,
                available_licenses: admin.available_licenses,
                subscription_plan_id: admin.subscription_plan_id
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
