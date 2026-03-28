import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryPublic } from '../lib/db.js';

export const getResellers = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic(`
            SELECT id, username, email, active, role, company_name, commission_rate, available_licenses, wallet_balance, created_at,
                   (SELECT COUNT(*) FROM \`public\`.tenants WHERE reseller_id = \`public\`.saas_admins.id) as total_tenants
            FROM \`public\`.saas_admins 
            WHERE role = 'reseller' 
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('getResellers error:', error);
        res.status(500).json({ error: 'Bayiler listelenemedi' });
    }
};

export const createReseller = async (req: Request, res: Response) => {
    try {
        const { username, password, email, company_name, commission_rate, available_licenses } = req.body;
        
        // Check duplicate missing in production but handled by constraints
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.saas_admins (username, password_hash, email, full_name, role, company_name, commission_rate, available_licenses, wallet_balance)
            VALUES (?, ?, ?, ?, 'reseller', ?, ?, ?, 0.00)
        `, [
            username, hashedPassword, email, company_name || username, 
            company_name || '', commission_rate || 60.00, available_licenses || 0
        ]);

        res.status(201).json({ message: 'Bayi/Partner başarıyla eklendi', id: result.insertId });
    } catch (error: any) {
        console.error('createReseller error:', error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kullanımda.' });
        res.status(500).json({ error: 'Bayi eklenemedi' });
    }
};

export const updateReseller = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { company_name, active, commission_rate, add_licenses, deduct_wallet } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (company_name !== undefined) { updates.push('company_name = ?'); values.push(company_name); }
        if (active !== undefined) { updates.push('active = ?'); values.push(active); }
        if (commission_rate !== undefined) { updates.push('commission_rate = ?'); values.push(commission_rate); }
        
        // Add specific numeric fields atomically
        if (add_licenses !== undefined) { updates.push('available_licenses = available_licenses + ?'); values.push(add_licenses); }
        if (deduct_wallet !== undefined) { updates.push('wallet_balance = wallet_balance - ?'); values.push(deduct_wallet); }

        if (updates.length > 0) {
            values.push(id);
            await queryPublic(`UPDATE \`public\`.saas_admins SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        res.json({ message: 'Bayi profili güncellendi' });
    } catch (error) {
        console.error('updateReseller error:', error);
        res.status(500).json({ error: 'Bayi güncellenemedi' });
    }
};

export const deleteReseller = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('DELETE FROM `public`.saas_admins WHERE id = ? AND role = "reseller"', [id]);
        res.json({ message: 'Bayi tamamen sistemden kaldırıldı' });
    } catch (error) {
        console.error('deleteReseller error:', error);
        res.status(500).json({ error: 'Bayi silinemedi, lütfen altındaki restoranların sahipliğini değiştirin.' });
    }
};

// ═══════════════════════════════════════
// NEW: RESELLER STORE (Plan/License Purchase)
// ═══════════════════════════════════════

export const getResellerPlans = async (_req: Request, res: Response) => {
    try {
        const [rows] = await queryPublic('SELECT * FROM `public`.reseller_plans WHERE is_active = 1 ORDER BY price ASC');
        res.json(rows);
    } catch {
        res.status(500).json({ error: 'Planlar yüklenemedi' });
    }
};

export const purchaseResellerPlan = async (req: Request, res: Response) => {
    try {
        const { planId } = req.body;
        const resellerId = req.user?.userId;

        if (!resellerId) return res.status(401).json({ error: 'Giriş gerekli' });

        // 1. Get Plan Details
        const [plans]: any = await queryPublic('SELECT * FROM `public`.reseller_plans WHERE id = ?', [planId]);
        if (plans.length === 0) return res.status(404).json({ error: 'Plan bulunamadı' });
        const plan = plans[0];

        // 2. Get Current Reseller Data
        const [resellers]: any = await queryPublic(`
            SELECT sa.*, rp.price as current_price, rp.license_count as current_plan_licenses
            FROM \`public\`.saas_admins sa
            LEFT JOIN \`public\`.reseller_plans rp ON sa.subscription_plan_id = rp.id
            WHERE sa.id = ?
        `, [resellerId]);
        
        if (resellers.length === 0) return res.status(404).json({ error: 'Bayi bulunamadı' });
        const reseller = resellers[0];
        
        const currentPrice = parseFloat(reseller.current_price || 0);
        const newPrice = parseFloat(plan.price);
        
        let finalCost = newPrice;
        let finalLicenses = plan.license_count;

        // 3. Upgrade Logic
        if (reseller.subscription_plan_id) {
            if (newPrice < currentPrice) {
                return res.status(400).json({ error: 'Düşük bir plana geçiş yapılamaz. Mevcut paketinizden daha üstün bir paket seçmelisiniz.' });
            }
            
            if (newPrice === currentPrice) {
                 // Option: Allow 'Renewing' or just block? User said 'üst plana geçiş'
                 return res.status(400).json({ error: 'Aynı plana tekrar geçilemez. Zaten bu plana sahipsiniz.' });
            }

            // Calculation for UPGRADE: Pay difference, get difference in licenses?
            // Or pay full? User said 'hesaplama yapılarak'.
            // Let's go with difference
            finalCost = newPrice - currentPrice;
            finalLicenses = plan.license_count - (reseller.current_plan_licenses || 0);
        }

        // 4. Check Wallet
        const wallet = parseFloat(reseller.wallet_balance);
        if (wallet < finalCost) {
            return res.status(400).json({ error: `Yetersiz bakiye. Bu yükseltme için €${finalCost.toFixed(2)} gereklidir. Mevcut: €${wallet.toFixed(2)}` });
        }

        // 5. Perform Transaction
        await queryPublic(`
            UPDATE \`public\`.saas_admins 
            SET wallet_balance = wallet_balance - ?, 
                available_licenses = available_licenses + ?,
                subscription_plan_id = ?
            WHERE id = ?
        `, [finalCost, finalLicenses, planId, resellerId]);

        // 6. Record Payment History
        await queryPublic(`
            INSERT INTO \`public\`.payment_history (tenant_id, amount, currency, payment_type, status, description)
            VALUES (?, ?, 'EUR', 'license_upgrade', 'paid', ?)
        `, [resellerId, finalCost, `Upgrade: ${reseller.subscription_plan_id ? 'Upgrade to' : 'Purchase of'} ${plan.name} pack`]);

        res.json({ 
            message: `${plan.name} paketi başarıyla ${reseller.subscription_plan_id ? 'yükseltildi' : 'satın alındı'}. Hesabınıza ${finalLicenses} yeni lisans eklendi.`,
            addedLicenses: finalLicenses,
            currentPlanId: planId
        });

    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Satın alma işlemi başarısız oldu' });
    }
};

// ═══════════════════════════════════════
// NEW: SUPER ADMIN - LICENSE PACKAGE MGMT
// ═══════════════════════════════════════

export const addResellerPlan = async (req: Request, res: Response) => {
    try {
        const { name, code, price, license_count, description } = req.body;
        const [result]: any = await queryPublic(`
            INSERT INTO \`public\`.reseller_plans (name, code, price, license_count, description, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        `, [name, code, price, license_count, description || '']);
        res.status(201).json({ message: 'Lisans paketi oluşturuldu', id: result.insertId });
    } catch (e) {
        res.status(500).json({ error: 'Plan oluşturulamadı' });
    }
};

export const updateResellerPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, price, license_count, is_active } = req.body;
        await queryPublic(`
            UPDATE \`public\`.reseller_plans SET name = ?, price = ?, license_count = ?, is_active = ? WHERE id = ?
        `, [name, price, license_count, is_active, id]);
        res.json({ message: 'Plan güncellendi' });
    } catch (e) {
        res.status(500).json({ error: 'Plan güncellenemedi' });
    }
};

export const deleteResellerPlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await queryPublic('DELETE FROM `public`.reseller_plans WHERE id = ?', [id]);
        res.json({ message: 'Plan silindi' });
    } catch (e) {
        res.status(500).json({ error: 'Plan silinemedi' });
    }
};

