import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';

// --- PRODUCTS ---

export const getProductsAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const products = await withTenant(tenantId, async (conn) => {
            const [rows]: any = await conn.query('SELECT * FROM products ORDER BY id DESC');
            return rows;
        });
        res.json(products);
    } catch (error) {
        console.error('Admin Products Fetch Yüklenemedi:', error);
        res.status(500).json({ error: 'Ürünler yüklenemedi' });
    }
};

export const createProduct = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { category_id, name, description, base_price, price_takeaway, price_delivery, image_url, is_active } = req.body;

        if (!category_id || !name || !base_price) {
            return res.status(400).json({ error: 'Eksik veri: category_id, name ve base_price zorunludur!' });
        }

        const result = await withTenant(tenantId, async (conn) => {
            const [insertResult]: any = await conn.query(
                `INSERT INTO products (category_id, name, description, base_price, price_takeaway, price_delivery, image_url, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [category_id, name, description || null, base_price, price_takeaway || base_price, price_delivery || base_price, image_url || null, is_active !== false]
            );
            return insertResult;
        });

        res.json({ success: true, message: 'Ürün başarıyla eklendi', id: result.insertId });
    } catch (error) {
        console.error('Ürün Ekleme Hatası:', error);
        res.status(500).json({ error: 'Ürün eklenirken hata oluştu' });
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = req.params.id;
        const { category_id, name, description, base_price, price_takeaway, price_delivery, image_url, is_active } = req.body;

        await withTenant(tenantId, async (conn) => {
            await conn.query(
                `UPDATE products SET category_id=?, name=?, description=?, base_price=?, price_takeaway=?, price_delivery=?, image_url=?, is_active=?
                 WHERE id=?`,
                [category_id, name, description || null, base_price, price_takeaway || base_price, price_delivery || base_price, image_url || null, is_active, id]
            );
        });

        res.json({ success: true, message: 'Ürün başarıyla güncellendi' });
    } catch (error) {
        console.error('Ürün Güncelleme Hatası:', error);
        res.status(500).json({ error: 'Ürün güncellenirken hata oluştu' });
    }
};

export const deleteProduct = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = req.params.id;

        await withTenant(tenantId, async (conn) => {
            // Foreign key constraints check (Variants & Modifiers)
            await conn.query('DELETE FROM product_variants WHERE product_id=?', [id]);
            await conn.query('DELETE FROM product_modifiers WHERE product_id=?', [id]);
            await conn.query('DELETE FROM products WHERE id=?', [id]);
        });

        res.json({ success: true, message: 'Ürün başarıyla silindi' });
    } catch (error) {
        console.error('Ürün Silme Hatası:', error);
        res.status(500).json({ error: 'Ürün silinirken hata oluştu' });
    }
};

// --- CATEGORIES ---

export const getCategoriesAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const categories = await withTenant(tenantId, async (conn) => {
            const [rows]: any = await conn.query('SELECT * FROM categories ORDER BY sort_order ASC, id DESC');
            return rows;
        });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Kategoriler yüklenemedi' });
    }
};
