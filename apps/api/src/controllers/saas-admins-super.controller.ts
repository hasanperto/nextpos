/**
 * Süper yönetici: public.saas_admins listesi, aktif/pasif, şifre sıfırlama.
 */
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export async function listSaasAdminsHandler(req: Request, res: Response) {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Yalnızca süper yönetici' });
    }
    try {
        const rows = await prisma.saasAdmin.findMany({
            orderBy: { id: 'asc' },
            select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                role: true,
                isActive: true,
                lastLogin: true,
                createdAt: true,
                companyName: true,
                availableLicenses: true,
                walletBalance: true,
                resellerPlanId: true,
            },
        });
        return res.json(
            rows.map((r) => ({
                id: r.id,
                username: r.username,
                full_name: r.fullName,
                email: r.email,
                role: r.role,
                is_active: r.isActive,
                last_login: r.lastLogin,
                created_at: r.createdAt,
                company_name: r.companyName,
                available_licenses: r.availableLicenses,
                wallet_balance: Number(r.walletBalance),
                reseller_plan_id: r.resellerPlanId,
            })),
        );
    } catch (e) {
        console.error('listSaasAdminsHandler', e);
        return res.status(500).json({ error: 'Liste alınamadı' });
    }
}

const patchActiveSchema = z.object({ is_active: z.boolean() });

export async function patchSaasAdminActiveHandler(req: Request, res: Response) {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Yalnızca süper yönetici' });
    }
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });
        const parsed = patchActiveSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri', details: parsed.error.flatten() });
        const { is_active } = parsed.data;

        if (id === Number(req.user.userId) && !is_active) {
            return res.status(400).json({ error: 'Kendi hesabınızı pasifleştiremezsiniz' });
        }

        const existing = await prisma.saasAdmin.findFirst({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı' });

        if (!is_active && String(existing.role || '') === 'super_admin') {
            const otherActive = await prisma.saasAdmin.count({
                where: { role: 'super_admin', isActive: true, id: { not: id } },
            });
            if (otherActive === 0) {
                return res.status(400).json({ error: 'Son aktif süper yöneticiyi pasifleştiremezsiniz' });
            }
        }

        await prisma.saasAdmin.update({
            where: { id },
            data: { isActive: is_active },
        });
        return res.json({ message: 'Durum güncellendi', id, is_active });
    } catch (e) {
        console.error('patchSaasAdminActiveHandler', e);
        return res.status(500).json({ error: 'Güncellenemedi' });
    }
}

const resetPwSchema = z.object({ new_password: z.string().min(8).max(128) });

export async function resetSaasAdminPasswordHandler(req: Request, res: Response) {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Yalnızca süper yönetici' });
    }
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz id' });
        const parsed = resetPwSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
        const { new_password } = parsed.data;

        const existing = await prisma.saasAdmin.findFirst({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı' });

        const hashed = await bcrypt.hash(new_password, 10);
        await prisma.saasAdmin.update({
            where: { id },
            data: { passwordHash: hashed },
        });
        return res.json({ message: 'Şifre sıfırlandı', id });
    } catch (e) {
        console.error('resetSaasAdminPasswordHandler', e);
        return res.status(500).json({ error: 'Şifre güncellenemedi' });
    }
}
