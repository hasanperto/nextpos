import { Request, Response } from 'express';
import { z } from 'zod';
import { queryPublic } from '../lib/db.js';

const subscriptionPlanSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    priceMonthly: z.number().min(0),
    priceYearly: z.number().min(0).optional(),
    currency: z.string().default('EUR'),
    maxUsers: z.number().min(1),
    maxBranches: z.number().min(1),
    features: z.array(z.string()).optional(),
    isFeatured: z.boolean().default(false),
    status: z.enum(['active', 'inactive']).default('active'),
});

export const listPlansHandler = async (_req: Request, res: Response) => {
    try {
        const [rows]: any = await queryPublic('SELECT * FROM `public`.subscription_plans ORDER BY monthly_fee ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Planlar alınamadı' });
    }
};

export const createPlanHandler = async (req: Request, res: Response) => {
    try {
        const data = subscriptionPlanSchema.parse(req.body);
        
        const [result]: any = await queryPublic(
            `INSERT INTO \`public\`.subscription_plans (
                name, code, monthly_fee, setup_fee, max_users, max_branches, max_products, features, is_active, trial_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name, data.name.toLowerCase().replace(/\s+/g, '_'), data.priceMonthly, data.priceYearly || 0,
                data.maxUsers, data.maxBranches, 500, JSON.stringify(data.features || []), 1, 14
            ]
        );

        res.status(201).json({ id: result.insertId, ...data });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const updatePlanHandler = async (req: Request, res: Response) => {
    try {
        const data = subscriptionPlanSchema.partial().parse(req.body);
        const { id } = req.params;

        const updates: string[] = [];
        const values: any[] = [];

        if (data.name) { updates.push('name = ?'); values.push(data.name); }
        if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
        if (data.priceMonthly !== undefined) { updates.push('price_monthly = ?'); values.push(data.priceMonthly); }
        if (data.priceYearly !== undefined) { updates.push('price_yearly = ?'); values.push(data.priceYearly); }
        if (data.currency) { updates.push('currency = ?'); values.push(data.currency); }
        if (data.maxUsers !== undefined) { updates.push('max_users = ?'); values.push(data.maxUsers); }
        if (data.maxBranches !== undefined) { updates.push('max_branches = ?'); values.push(data.maxBranches); }
        if (data.features) { updates.push('features = ?'); values.push(JSON.stringify(data.features)); }
        if (data.isFeatured !== undefined) { updates.push('is_featured = ?'); values.push(data.isFeatured); }
        if (data.status) { updates.push('status = ?'); values.push(data.status); }

        if (updates.length > 0) {
            values.push(id);
            await queryPublic(`UPDATE \`public\`.subscription_plans SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        res.json({ message: 'Plan güncellendi' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const deletePlanHandler = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('DELETE FROM `public`.subscription_plans WHERE id = ?', [id]);
        res.json({ message: 'Plan silindi' });
    } catch (error) {
        res.status(500).json({ error: 'Plan silinemedi' });
    }
};
