import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';

export const getCategoriesHandler = async (req: Request, res: Response) => {
    try {
        const { lang } = req.query;
        const tenantId = req.tenantId!;

        const categories = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                'SELECT * FROM categories WHERE is_active = true ORDER BY sort_order ASC'
            );
            return rows;
        });

        const mapped = categories.map((cat: any) => {
            const translations = cat.translations || {};
            return {
                id: cat.id,
                name: cat.name,
                displayName: (lang && translations[lang as string]) || cat.name,
                icon: cat.icon,
                imageUrl: cat.image_url,
                sortOrder: cat.sort_order,
            };
        });

        res.json(mapped);
    } catch (error) {
        console.error('❌ Kategoriler hatası:', error);
        res.status(500).json({ error: 'Kategoriler yüklenemedi' });
    }
};

export const getProductsHandler = async (req: Request, res: Response) => {
    try {
        const { categoryId, lang } = req.query;
        const tenantId = req.tenantId!;

        const products = await withTenant(tenantId, async (connection) => {
            let query = `
                SELECT p.*, c.name as category_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.is_active = true
            `;
            const params: any[] = [];

            if (categoryId) {
                params.push(Number(categoryId));
                query += ` AND p.category_id = ?`;
            }

            query += ' ORDER BY p.sort_order ASC';

            const [rows]: any = await connection.query(query, params);

            // Her ürün için varyant ve modifikatörleri ayrı çek
            for (const row of rows) {
                const [variants]: any = await connection.query(
                    'SELECT id, product_id, name, price, sort_order, is_default FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC',
                    [row.id]
                );
                row.variants = variants || [];

                const [mods]: any = await connection.query(
                    `SELECT m.id, m.name, m.price, m.category
                     FROM product_modifiers pm
                     JOIN modifiers m ON pm.modifier_id = m.id
                     WHERE pm.product_id = ? AND m.is_active = true`,
                    [row.id]
                );
                row.modifiers = mods || [];
            }

            return rows;
        });

        const mapped = products.map((prod: any) => {
            const translations = prod.translations || {};
            const t = lang ? translations[lang as string] : null;
            return {
                id: prod.id,
                categoryId: prod.category_id,
                name: prod.name,
                displayName: t?.name || prod.name,
                basePrice: prod.base_price,
                imageUrl: prod.image_url,
                description: prod.description,
                displayDescription: t?.description || prod.description,
                prepTimeMin: prod.prep_time_min,
                variants: (prod.variants || []).map((v: any) => ({
                    id: v.id,
                    name: v.name,
                    displayName: v.name,
                    price: v.price,
                    isDefault: v.is_default === 1 || v.is_default === true,
                    sortOrder: v.sort_order,
                })),
                modifiers: (prod.modifiers || []).map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    displayName: m.name,
                    price: m.price,
                    category: m.category,
                })),
            };
        });

        res.json(mapped);
    } catch (error) {
        console.error('❌ Ürünler hatası:', error);
        res.status(500).json({ error: 'Ürünler yüklenemedi' });
    }
};

export const getProductByIdHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const productId = Number(req.params.id);

        const product = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                `SELECT p.*, c.name as category_name,
                        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'id', v.id, 'name', v.name, 'price', v.price
                           ))
                            FROM product_variants v WHERE v.product_id = p.id) as variants,
                        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'id', m.id, 'name', m.name, 'price', m.price
                           ))
                            FROM product_modifiers pm
                            JOIN modifiers m ON pm.modifier_id = m.id
                            WHERE pm.product_id = p.id AND m.is_active = true) as modifiers
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 WHERE p.id = ?`,
                [productId]
            );
            return rows[0] || null;
        });

        if (!product) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        res.json(product);
    } catch (error) {
        console.error('❌ Ürün detay hatası:', error);
        res.status(500).json({ error: 'Ürün detayı yüklenemedi' });
    }
};

export const getModifiersHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const lang = req.query.lang as string || 'tr';

        const modifiers = await withTenant(tenantId, async (connection) => {
            const [rows]: any = await connection.query(
                'SELECT * FROM modifiers WHERE is_active = true'
            );
            return rows;
        });

        const localizedModifiers = modifiers.map((m: any) => {
            let displayName = m.name;
            if (m.translations && typeof m.translations === 'object') {
                if (m.translations[lang]) {
                    displayName = m.translations[lang];
                }
            }
            return { ...m, displayName };
        });

        res.json(localizedModifiers);
    } catch (error) {
        console.error('❌ Modifiers hatası:', error);
        res.status(500).json({ error: 'Modifikatörler alınamadı' });
    }
};
