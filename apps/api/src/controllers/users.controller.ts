import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withTenant, queryPublic } from '../lib/db.js';

const userSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6).optional(),
    name: z.string().min(2),
    role: z.enum(['admin', 'cashier', 'waiter', 'kitchen', 'courier']),
    pinCode: z.string().length(6).optional(),
    branchId: z.number().optional(),
    status: z.enum(['active', 'inactive']).default('active'),
});

export const listUsersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const users = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT id, username, name, role, pin_code, status, last_login, branch_id, created_at 
                 FROM users ORDER BY role ASC, name ASC`
            );
            return rows;
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcılar listelenemedi' });
    }
};

export const createUserHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const data = userSchema.parse(req.body);

        // 1. Limit Kontrolü (public schema'dan max_users oku)
        const [tenantRows]: any = await queryPublic(
            'SELECT max_users FROM tenants WHERE id = ?',
            [tenantId]
        );
        const maxUsers = tenantRows[0]?.max_users || 5;

        const result = await withTenant(tenantId, async (connection) => {
            // Mevcut kullanıcı sayısını say
            const [countRows]: any = await connection.query('SELECT COUNT(*) as count FROM users');
            const currentCount = countRows[0].count;

            if (currentCount >= maxUsers) {
                throw new Error(`Kullanıcı limitine ulaşıldı (${maxUsers}). Lütfen paketinizi yükseltin.`);
            }

            if (!data.password) throw new Error('Yeni kullanıcı için şifre gereklidir');

            const hash = await bcrypt.hash(data.password, 10);
            const [insertResult]: any = await connection.query(
                `INSERT INTO users (username, password_hash, name, role, pin_code, branch_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [data.username, hash, data.name, data.role, data.pinCode || null, data.branchId || null, data.status]
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

        await withTenant(tenantId, async (connection) => {
            const updates: string[] = [];
            const values: any[] = [];

            if (data.username) { updates.push('username = ?'); values.push(data.username); }
            if (data.name) { updates.push('name = ?'); values.push(data.name); }
            if (data.role) { updates.push('role = ?'); values.push(data.role); }
            if (data.pinCode) { updates.push('pin_code = ?'); values.push(data.pinCode); }
            if (data.branchId) { updates.push('branch_id = ?'); values.push(data.branchId); }
            if (data.status) { updates.push('status = ?'); values.push(data.status); }

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
