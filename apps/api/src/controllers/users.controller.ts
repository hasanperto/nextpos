import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withTenant, queryPublic } from '../lib/db.js';
import { ensureUsersWaiterSectionColumns } from '../lib/waiterSectionColumns.js';
import { ensureUsersDeviceIdColumn } from '../lib/userDeviceColumns.js';
import {
    consumeTenantDeviceResetQuota,
    releaseConsumedTenantDeviceResetQuota,
} from '../services/device-reset-quota.service.js';

const userSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6).optional(),
    name: z.string().min(2),
    role: z.enum(['admin', 'cashier', 'waiter', 'kitchen', 'courier']),
    pinCode: z.string().length(6).optional(),
    branchId: z.number().optional(),
    status: z.enum(['active', 'inactive']).default('active'),
    /** Garson: true = tüm salon, false = tek bölge (waiterSectionId) */
    waiterAllSections: z.boolean().optional(),
    waiterSectionId: z.number().nullable().optional(),
    kitchenStation: z.string().optional(),
});

/** Kasiyer / garson: paket siparişinde kurye seçimi için (salt okunur) */
/** Kasiyer: garson çağrısı modalında seçim için aktif garson listesi */
export const listActiveWaitersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const rows = await withTenant(tenantId, async (connection) => {
            await ensureUsersWaiterSectionColumns(connection);
            const [r]: any = await connection.query(
                `SELECT id, name, username,
                        COALESCE(waiter_all_sections, TRUE) AS waiter_all_sections,
                        waiter_section_id
                 FROM users
                 WHERE role = 'waiter' AND status = 'active'
                 ORDER BY name ASC`
            );
            return Array.isArray(r) ? r : [];
        });
        res.json(rows);
    } catch (error) {
        console.error('listActiveWaitersHandler', error);
        res.status(500).json({ error: 'Garson listesi alınamadı' });
    }
};

export const listCouriersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const rows = await withTenant(tenantId, async (connection) => {
            const [r]: any = await connection.query(
                `SELECT id, name, username, status
                 FROM users
                 WHERE role = 'courier' AND status = 'active'
                 ORDER BY name ASC`
            );
            return r;
        });
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Kurye listesi alınamadı' });
    }
};

export const listUsersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const [tenantRows]: any = await queryPublic(
            'SELECT max_users FROM tenants WHERE id = ?',
            [tenantId]
        );
        const maxUsers = tenantRows[0]?.max_users || 5;

        const users = await withTenant(tenantId, async (connection) => {
            await ensureUsersWaiterSectionColumns(connection);
            await ensureUsersDeviceIdColumn(connection);
            const [rows]: any = await connection.query(
                `SELECT id, username, name, role, pin_code, status, last_login, branch_id, created_at,
                        waiter_all_sections, waiter_section_id, kitchen_station, device_id
                 FROM users ORDER BY role ASC, name ASC`
            );
            return rows;
        });
        res.json({ users, maxUsers });
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcılar listelenemedi' });
    }
};

export const resetUserDeviceHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
        await withTenant(tenantId, async (connection) => {
            await ensureUsersDeviceIdColumn(connection);
            await connection.query(`UPDATE users SET device_id = NULL WHERE id = ?`, [id]);
        });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Cihaz kilidi sıfırlanamadı' });
    }
};

export const resetAllUserDevicesHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        let quotaLogId: number | null = null;
        try {
            const quota = await consumeTenantDeviceResetQuota({
                tenantId,
                actorRole: String(req.user?.role || 'admin'),
                actorUserId: req.user?.userId ?? null,
                source: 'pos_admin_settings',
            });
            quotaLogId = quota.logId;

            await withTenant(tenantId, async (connection) => {
                await ensureUsersDeviceIdColumn(connection);
                await connection.query(`UPDATE users SET device_id = NULL`);
            });

            res.json({
                ok: true,
                quota: {
                    month: quota.month,
                    monthly: quota.quota,
                    used: quota.used,
                    remaining: quota.remaining,
                },
            });
        } catch (inner: any) {
            if (inner?.message === 'DEVICE_RESET_QUOTA_EXCEEDED') {
                return res.status(403).json({ error: 'Bu ay cihaz sıfırlama hakkınız doldu.' });
            }
            if (quotaLogId != null) {
                await releaseConsumedTenantDeviceResetQuota(quotaLogId);
            }
            throw inner;
        }
    } catch {
        res.status(500).json({ error: 'Cihaz kilitleri sıfırlanamadı' });
    }
};

function assertWaiterSection(data: {
    role: string;
    waiterAllSections?: boolean;
    waiterSectionId?: number | null;
}): string | null {
    if (data.role === 'waiter' && data.waiterAllSections === false) {
        if (data.waiterSectionId == null || !Number.isFinite(Number(data.waiterSectionId))) {
            return 'Tek bölge seçildiğinde bir bölge seçilmelidir';
        }
    }
    return null;
}

export const createUserHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = userSchema.parse(req.body);
        const wsErr = assertWaiterSection(data);
        if (wsErr) {
            return res.status(400).json({ error: wsErr });
        }

        // 1. Limit Kontrolü (public schema'dan max_users oku)
        const [tenantRows]: any = await queryPublic(
            'SELECT max_users FROM tenants WHERE id = ?',
            [tenantId]
        );
        const maxUsers = tenantRows[0]?.max_users || 5;

        const result = await withTenant(tenantId, async (connection) => {
            await ensureUsersWaiterSectionColumns(connection);
            // Mevcut kullanıcı sayısını say
            const [countRows]: any = await connection.query('SELECT COUNT(*) as count FROM users');
            const currentCount = countRows[0].count;

            if (currentCount >= maxUsers) {
                throw new Error(`Kullanıcı limitine ulaşıldı (${maxUsers}). Lütfen paketinizi yükseltin.`);
            }

            if (!data.password) throw new Error('Yeni kullanıcı için şifre gereklidir');

            const hash = await bcrypt.hash(data.password, 10);
            const wAll: boolean =
                data.role === 'waiter' ? data.waiterAllSections !== false : true;
            const wSec =
                data.role === 'waiter' && data.waiterAllSections === false && data.waiterSectionId != null
                    ? Number(data.waiterSectionId)
                    : null;
            const kSt = data.role === 'kitchen' ? (data.kitchenStation || 'all') : 'all';

            const [insertResult]: any = await connection.query(
                `INSERT INTO users (username, password_hash, name, role, pin_code, branch_id, status, waiter_all_sections, waiter_section_id, kitchen_station)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.username,
                    hash,
                    data.name,
                    data.role,
                    data.pinCode || null,
                    data.branchId || null,
                    data.status,
                    wAll,
                    wSec,
                    kSt,
                ]
            );

            return { id: insertResult.insertId, ...data, password: undefined };
        });

        res.status(201).json(result);
    } catch (error: any) {
        console.error('❌ Kullanıcı oluşturma hatası:', error.message);
        res.status(400).json({ error: error.message });
    }
};

export const updateUserHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const userId = req.params.id;
        const data = userSchema.partial().parse(req.body);
        if (data.waiterAllSections === false && data.waiterSectionId == null) {
            return res.status(400).json({ error: 'Tek bölge seçildiğinde bir bölge seçilmelidir' });
        }

        await withTenant(tenantId, async (connection) => {
            await ensureUsersWaiterSectionColumns(connection);
            const updates: string[] = [];
            const values: any[] = [];

            if (data.username) { updates.push('username = ?'); values.push(data.username); }
            if (data.name) { updates.push('name = ?'); values.push(data.name); }
            if (data.role) { updates.push('role = ?'); values.push(data.role); }
            if (data.pinCode) { updates.push('pin_code = ?'); values.push(data.pinCode); }
            if (data.branchId) { updates.push('branch_id = ?'); values.push(data.branchId); }
            if (data.status) { updates.push('status = ?'); values.push(data.status); }

            if (data.role && data.role !== 'waiter') {
                updates.push('waiter_all_sections = ?');
                values.push(true);
                updates.push('waiter_section_id = ?');
                values.push(null);
            } else {
                if (data.waiterAllSections !== undefined) {
                    updates.push('waiter_all_sections = ?');
                    values.push(Boolean(data.waiterAllSections));
                }
                if (data.waiterSectionId !== undefined) {
                    updates.push('waiter_section_id = ?');
                    values.push(data.waiterSectionId);
                }
            }

            if (data.role && data.role !== 'kitchen') {
                updates.push('kitchen_station = ?');
                values.push('all');
            } else if (data.kitchenStation !== undefined) {
                updates.push('kitchen_station = ?');
                values.push(data.kitchenStation);
            }

            if (data.password) {
                const hash = await bcrypt.hash(data.password, 10);
                updates.push('password_hash = ?');
                values.push(hash);
            }

            if (updates.length > 0) {
                values.push(userId);
                await connection.query(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                    values
                );
            }
        });

        res.json({ message: 'Kullanıcı güncellendi' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteUserHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const userId = req.params.id;

        await withTenant(tenantId, async (connection) => {
            // Son admin silinmesin kontrolü eklenebilir
            await connection.query('DELETE FROM users WHERE id = ?', [userId]);
        });

        res.json({ message: 'Kullanıcı silindi' });
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcı silinemedi' });
    }
};
