import { Request, Response } from 'express';
import { queryPublic, withTenant, withTenantTransaction } from '../lib/db.js';
import { emitTenantMenuCatalogStale } from '../lib/tenantSocketEmit.js';
import { delCacheByPrefix } from '../lib/cache.js';
import { ensureStockRecipeSchema } from '../services/stock-inventory.service.js';

const KITCHEN_STATIONS = new Set(['hot', 'bar', 'cold']);

async function ensureInventorySchema(conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await ensureStockRecipeSchema(conn);
}

function normalizeKitchenStation(raw: unknown): string {
    const x = String(raw ?? 'hot').toLowerCase().trim();
    return KITCHEN_STATIONS.has(x) ? x : 'hot';
}

// --- PRODUCTS ---

export const getProductsAdmin = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const products = await withTenant(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            const [rows]: any = await conn.query(
                `SELECT *,
                        (COALESCE(stock_qty, 0) <= COALESCE(min_stock_qty, 0)) AS is_low_stock
                 FROM products
                 ORDER BY id DESC`
            );
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
        const {
            category_id,
            name,
            description,
            base_price,
            price_takeaway,
            price_delivery,
            image_url,
            is_active,
            prep_time_min,
            allergens,
            translations,
            supplier_name,
            last_purchase_price,
            last_purchase_at,
        } = req.body;

        if (!category_id || !name || !base_price) {
            return res.status(400).json({ error: 'Eksik veri: category_id, name ve base_price zorunludur!' });
        }

        const [tenantRows]: any = await queryPublic('SELECT max_products FROM tenants WHERE id = ?', [tenantId]);
        const maxProducts = Number(tenantRows?.[0]?.max_products ?? 400);

        const result = await withTenant(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            if (Number.isFinite(maxProducts) && maxProducts > 0) {
                const [cntRows]: any = await conn.query(`SELECT COUNT(*) as c FROM products`);
                const currentCount = Number(cntRows?.[0]?.c ?? 0);
                if (currentCount >= maxProducts) {
                    throw new Error(`LIMIT_PRODUCTS:${maxProducts}`);
                }
            }
            const [insertResult]: any = await conn.query(
                `INSERT INTO products (category_id, name, description, base_price, price_takeaway, price_delivery, image_url, is_active, prep_time_min, allergens, translations, stock_qty, min_stock_qty, supplier_name, last_purchase_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)`,
                [
                    category_id,
                    name,
                    description || null,
                    base_price,
                    price_takeaway || base_price,
                    price_delivery || base_price,
                    image_url || null,
                    is_active !== false,
                    prep_time_min != null ? Number(prep_time_min) : 15,
                    allergens != null ? String(allergens) : null,
                    translations != null ? JSON.stringify(translations) : '{}',
                    Number(req.body.stock_qty ?? 0) || 0,
                    Number(req.body.min_stock_qty ?? 0) || 0,
                    supplier_name != null ? String(supplier_name).trim() || null : null,
                    last_purchase_price != null ? Number(last_purchase_price) : null,
                    last_purchase_at != null ? String(last_purchase_at) : null,
                ]
            );
            return insertResult;
        });

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true, message: 'Ürün başarıyla eklendi', id: result.insertId });
    } catch (error: any) {
        if (String(error?.message || '').startsWith('LIMIT_PRODUCTS:')) {
            const max = String(error.message).split(':')[1] || '0';
            return res.status(403).json({ error: `Ürün limitine ulaşıldı (${max}). Lütfen paketinizi yükseltin.` });
        }
        console.error('Ürün Ekleme Hatası:', error);
        res.status(500).json({ error: 'Ürün eklenirken hata oluştu' });
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = req.params.id;
        const {
            category_id,
            name,
            description,
            base_price,
            price_takeaway,
            price_delivery,
            image_url,
            is_active,
            prep_time_min,
            allergens,
            translations,
            stock_qty,
            min_stock_qty,
            supplier_name,
            last_purchase_price,
            last_purchase_at,
        } = req.body;

        await withTenant(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            await conn.query(
                `UPDATE products SET category_id=?, name=?, description=?, base_price=?, price_takeaway=?, price_delivery=?, image_url=?, is_active=?,
                prep_time_min = COALESCE(?, prep_time_min),
                allergens = COALESCE(?, allergens),
                translations = COALESCE(?::jsonb, translations),
                stock_qty = COALESCE(?, stock_qty),
                min_stock_qty = COALESCE(?, min_stock_qty),
                supplier_name = COALESCE(?, supplier_name),
                last_purchase_price = COALESCE(?, last_purchase_price),
                last_purchase_at = COALESCE(?, last_purchase_at)
                 WHERE id=?`,
                [
                    category_id,
                    name,
                    description || null,
                    base_price,
                    price_takeaway || base_price,
                    price_delivery || base_price,
                    image_url || null,
                    is_active,
                    prep_time_min != null ? Number(prep_time_min) : null,
                    allergens != null ? String(allergens) : null,
                    translations != null ? JSON.stringify(translations) : null,
                    stock_qty != null ? Number(stock_qty) : null,
                    min_stock_qty != null ? Number(min_stock_qty) : null,
                    supplier_name != null ? String(supplier_name).trim() || null : null,
                    last_purchase_price != null ? Number(last_purchase_price) : null,
                    last_purchase_at != null ? String(last_purchase_at) : null,
                    id,
                ]
            );
        });

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
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

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
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

export const createCategory = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { name, icon, sort_order, is_active, translations, branch_id, kitchen_station } = req.body;
        if (!name || String(name).trim() === '') {
            return res.status(400).json({ error: 'name zorunlu' });
        }
        const ks = normalizeKitchenStation(kitchen_station);
        const result = await withTenant(tenantId, async (conn) => {
            const [ins]: any = await conn.query(
                `INSERT INTO categories (name, icon, sort_order, is_active, translations, kitchen_station, branch_id)
                 VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`,
                [
                    String(name).trim(),
                    icon || 'utensils',
                    Number(sort_order) || 0,
                    is_active !== false,
                    translations != null ? JSON.stringify(translations) : '{}',
                    ks,
                    branch_id || null,
                ]
            );
            return ins;
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.status(201).json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('createCategory', e);
        res.status(500).json({ error: 'Kategori eklenemedi' });
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        const { name, icon, sort_order, is_active, translations, kitchen_station } = req.body;
        await withTenant(tenantId, async (conn) => {
            await conn.query(
                `UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon),
                 sort_order = COALESCE(?, sort_order), is_active = COALESCE(?, is_active),
                 translations = COALESCE(?::jsonb, translations),
                 kitchen_station = COALESCE(?, kitchen_station)
                 WHERE id = ?`,
                [
                    name != null ? String(name) : null,
                    icon ?? null,
                    sort_order != null ? Number(sort_order) : null,
                    is_active != null ? is_active : null,
                    translations != null ? JSON.stringify(translations) : null,
                    kitchen_station != null ? normalizeKitchenStation(kitchen_station) : null,
                    id,
                ]
            );
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true });
    } catch (e) {
        console.error('updateCategory', e);
        res.status(500).json({ error: 'Kategori güncellenemedi' });
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const id = Number(req.params.id);
        await withTenantTransaction(tenantId, async (conn) => {
            const [cnt]: any = await conn.query('SELECT COUNT(*)::int AS c FROM products WHERE category_id = ?', [id]);
            if (Number(cnt?.[0]?.c ?? 0) > 0) {
                throw new Error('CATEGORY_HAS_PRODUCTS');
            }
            await conn.query('DELETE FROM categories WHERE id = ?', [id]);
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message === 'CATEGORY_HAS_PRODUCTS') {
            return res.status(400).json({ error: 'Bu kategoride ürün var; önce taşıyın veya silin' });
        }
        console.error('deleteCategory', e);
        res.status(500).json({ error: 'Kategori silinemedi' });
    }
};

/** body: { product_ids: number[], mode: 'percent' | 'fixed', value: number } */
export const bulkUpdatePrices = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { product_ids, mode, value } = req.body;
        if (!Array.isArray(product_ids) || product_ids.length === 0 || !mode || value == null) {
            return res.status(400).json({ error: 'product_ids, mode ve value gerekli' });
        }
        const v = Number(value);
        if (Number.isNaN(v)) {
            return res.status(400).json({ error: 'Geçersiz değer' });
        }
        await withTenant(tenantId, async (conn) => {
            const placeholders = product_ids.map(() => '?').join(',');
            const targets = req.body.targets || ['base', 'takeaway', 'delivery'];
            
            if (mode === 'percent' || mode === 'fixed') {
                let sql = 'UPDATE products SET ';
                const sets = [];
                const params = [];

                if (targets.includes('base')) {
                    sets.push(mode === 'percent' 
                        ? 'base_price = ROUND((base_price * (1 + ? / 100.0))::numeric, 2)'
                        : 'base_price = GREATEST(0, base_price + ?)');
                    params.push(v);
                }
                if (targets.includes('takeaway')) {
                    sets.push(mode === 'percent'
                        ? 'price_takeaway = ROUND((price_takeaway * (1 + ? / 100.0))::numeric, 2)'
                        : 'price_takeaway = GREATEST(0, price_takeaway + ?)');
                    params.push(v);
                }
                if (targets.includes('delivery')) {
                    sets.push(mode === 'percent'
                        ? 'price_delivery = ROUND((price_delivery * (1 + ? / 100.0))::numeric, 2)'
                        : 'price_delivery = GREATEST(0, price_delivery + ?)');
                    params.push(v);
                }

                if (sets.length === 0) return;
                sql += sets.join(', ') + ` WHERE id IN (${placeholders})`;
                params.push(...product_ids);
                await conn.query(sql, params);
            } else if (mode === 'percent-of-base') {
                // Takeaway and/or Delivery based on Base
                let sql = 'UPDATE products SET ';
                const sets = [];
                const params = [];

                if (targets.includes('takeaway')) {
                    sets.push('price_takeaway = ROUND((base_price * (1 + ? / 100.0))::numeric, 2)');
                    params.push(v);
                }
                if (targets.includes('delivery')) {
                    sets.push('price_delivery = ROUND((base_price * (1 + ? / 100.0))::numeric, 2)');
                    params.push(v);
                }

                if (sets.length === 0) return;
                sql += sets.join(', ') + ` WHERE id IN (${placeholders})`;
                params.push(...product_ids);
                await conn.query(sql, params);
            } else {
                throw new Error('BAD_MODE');
            }
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message === 'BAD_MODE') {
            return res.status(400).json({ error: 'mode: percent veya fixed' });
        }
        console.error('bulkUpdatePrices', e);
        res.status(500).json({ error: 'Toplu fiyat güncellenemedi' });
    }
};

export const listProductVariants = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const pid = Number(req.params.productId);
        const rows = await withTenant(tenantId, async (conn) => {
            const [r]: any = await conn.query(
                'SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
                [pid]
            );
            return r;
        });
        res.json(Array.isArray(rows) ? rows : []);
    } catch (e) {
        res.status(500).json({ error: 'Varyantlar yüklenemedi' });
    }
};

export const createProductVariant = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const pid = Number(req.params.productId);
        const { name, price, sort_order, is_default } = req.body;
        if (!name || price == null) {
            return res.status(400).json({ error: 'name ve price zorunlu' });
        }
        const result = await withTenant(tenantId, async (conn) => {
            const [ins]: any = await conn.query(
                `INSERT INTO product_variants (product_id, name, price, sort_order, is_default)
                 VALUES (?, ?, ?, ?, ?)`,
                [pid, String(name), Number(price), Number(sort_order) || 0, !!is_default]
            );
            return ins;
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.status(201).json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('createProductVariant', e);
        res.status(500).json({ error: 'Varyant eklenemedi' });
    }
};

export const updateProductVariant = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const vid = Number(req.params.variantId);
        const { name, price, sort_order, is_default } = req.body;
        await withTenant(tenantId, async (conn) => {
            await conn.query(
                `UPDATE product_variants SET name = COALESCE(?, name), price = COALESCE(?, price),
                 sort_order = COALESCE(?, sort_order), is_default = COALESCE(?, is_default) WHERE id = ?`,
                [name ?? null, price != null ? Number(price) : null, sort_order != null ? Number(sort_order) : null, is_default ?? null, vid]
            );
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Varyant güncellenemedi' });
    }
};

export const deleteProductVariant = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const vid = Number(req.params.variantId);
        await withTenant(tenantId, async (conn) => {
            await conn.query('DELETE FROM product_variants WHERE id = ?', [vid]);
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Varyant silinemedi' });
    }
};

export const setProductModifiers = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const pid = Number(req.params.productId);
        const { modifier_ids } = req.body as { modifier_ids: number[] };
        if (!Array.isArray(modifier_ids)) {
            return res.status(400).json({ error: 'modifier_ids dizi olmalı' });
        }
        await withTenantTransaction(tenantId, async (conn) => {
            await conn.query('DELETE FROM product_modifiers WHERE product_id = ?', [pid]);
            for (const mid of modifier_ids) {
                await conn.query(
                    'INSERT INTO product_modifiers (product_id, modifier_id) VALUES (?, ?) ON CONFLICT (product_id, modifier_id) DO NOTHING',
                    [pid, mid]
                );
            }
        });
        emitTenantMenuCatalogStale(req);
        res.json({ success: true });
    } catch (e) {
        console.error('setProductModifiers', e);
        res.status(500).json({ error: 'Modifikatörler kaydedilemedi' });
    }
};

export const copyProductVariants = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { source_pid, target_pids } = req.body;

        if (!source_pid || !Array.isArray(target_pids) || target_pids.length === 0) {
            return res.status(400).json({ error: 'source_pid ve target_pids (dizi) gerekli' });
        }

        await withTenantTransaction(tenantId, async (conn) => {
            // 1. Kaynak ürünün varyantlarını getir
            const [variants]: any = await conn.query(
                'SELECT name, price, sort_order, is_default FROM product_variants WHERE product_id = ?',
                [source_pid]
            );

            if (!variants || (Array.isArray(variants) && variants.length === 0)) {
                return; // Kopyalanacak bir şey yok
            }

            for (const tpid of target_pids) {
                // 2. Hedef ürünün eski varyantlarını sil
                await conn.query('DELETE FROM product_variants WHERE product_id = ?', [tpid]);

                // 3. Yeni varyantları ekle
                for (const v of (variants as any[])) {
                    await conn.query(
                        `INSERT INTO product_variants (product_id, name, price, sort_order, is_default)
                         VALUES (?, ?, ?, ?, ?)`,
                        [tpid, v.name, v.price, v.sort_order, v.is_default]
                    );
                }
            }
        });

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true, message: 'Varyantlar başarıyla kopyalandı' });
    } catch (e) {
        console.error('copyProductVariants error:', e);
        res.status(500).json({ error: 'Varyantlar kopyalanamadı' });
    }
};

export const createModifier = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { name, price, category } = req.body;
        if (!name) return res.status(400).json({ error: 'name zorunlu' });

        const result = await withTenant(tenantId, async (conn) => {
            const [ins]: any = await conn.query(
                'INSERT INTO modifiers (name, price, category) VALUES (?, ?, ?)',
                [name, Number(price) || 0, category || '0_Ekstralar']
            );
            return ins;
        });
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.status(201).json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('createModifier error:', e);
        res.status(500).json({ error: 'Modifikatör oluşturulamadı' });
    }
};

export const copyProductModifiers = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { source_pid, target_pids } = req.body;

        if (!source_pid || !Array.isArray(target_pids) || target_pids.length === 0) {
            return res.status(400).json({ error: 'source_pid ve target_pids (dizi) gerekli' });
        }

        await withTenantTransaction(tenantId, async (conn) => {
            // 1. Kaynak ürünün modifikatörlerini getir
            const [modifiers]: any = await conn.query(
                'SELECT modifier_id FROM product_modifiers WHERE product_id = ?',
                [source_pid]
            );

            if (!modifiers || (Array.isArray(modifiers) && modifiers.length === 0)) {
                return; 
            }

            for (const tpid of target_pids) {
                // 2. Hedef ürünün eski modifikatörlerini sil
                await conn.query('DELETE FROM product_modifiers WHERE product_id = ?', [tpid]);

                // 3. Yeni modifikatörleri ekle
                for (const m of (modifiers as any[])) {
                    await conn.query(
                        'INSERT INTO product_modifiers (product_id, modifier_id) VALUES (?, ?)',
                        [tpid, m.modifier_id]
                    );
                }
            }
        });

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true, message: 'Modifikatörler başarıyla kopyalandı' });
    } catch (e) {
        console.error('copyProductModifiers error:', e);
        res.status(500).json({ error: 'Modifikatörler kopyalanamadı' });
    }
};

export const adjustProductStock = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const pid = Number(req.params.id);
        const delta = Number(req.body?.delta_qty ?? 0);
        const reason = String(req.body?.reason || 'manual_adjustment').slice(0, 120);
        const notes = req.body?.notes != null ? String(req.body.notes) : null;
        if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: 'Geçersiz ürün' });
        if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'delta_qty sıfır olamaz' });

        const actorId = req.user?.userId ?? null;
        const result = await withTenantTransaction(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            const [rows]: any = await conn.query('SELECT id, stock_qty FROM products WHERE id = ? FOR UPDATE', [pid]);
            const row = rows?.[0];
            if (!row) throw new Error('NOT_FOUND');
            const prev = Number(row.stock_qty ?? 0);
            const next = Math.max(0, prev + delta);
            await conn.query('UPDATE products SET stock_qty = ? WHERE id = ?', [next, pid]);
            await conn.query(
                `INSERT INTO stock_movements (product_id, delta_qty, prev_qty, next_qty, reason, notes, created_by, ref_order_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
                [pid, delta, prev, next, reason, notes, actorId]
            );
            return { prev_qty: prev, next_qty: next };
        });

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true, ...result });
    } catch (e: any) {
        if (e.message === 'NOT_FOUND') return res.status(404).json({ error: 'Ürün bulunamadı' });
        console.error('adjustProductStock', e);
        res.status(500).json({ error: 'Stok güncellenemedi' });
    }
};

export const listStockMovements = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const pid = Number(req.params.id);
        if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: 'Geçersiz ürün' });
        const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
        const rows = await withTenant(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            const [r]: any = await conn.query(
                `SELECT sm.*, u.name AS created_by_name
                 FROM stock_movements sm
                 LEFT JOIN users u ON u.id = sm.created_by
                 WHERE sm.product_id = ?
                 ORDER BY sm.id DESC
                 LIMIT ?`,
                [pid, limit]
            );
            return Array.isArray(r) ? r : [];
        });
        res.json(rows);
    } catch (e) {
        console.error('listStockMovements', e);
        res.status(500).json({ error: 'Stok hareketleri yüklenemedi' });
    }
};

/** GET — menü ürünü için reçete satırları (hammadde ürünleri) */
export const getProductRecipe = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const productId = Number(req.params.productId);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ error: 'Geçersiz ürün' });
        }
        const rows = await withTenant(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            const [r]: any = await conn.query(
                `SELECT r.id, r.product_id, r.ingredient_product_id, r.qty_per_unit, r.variant_id,
                        ing.name AS ingredient_name,
                        pv.name AS variant_name
                 FROM product_recipe_items r
                 JOIN products ing ON ing.id = r.ingredient_product_id
                 LEFT JOIN product_variants pv ON pv.id = r.variant_id
                 WHERE r.product_id = ?
                 ORDER BY CASE WHEN r.variant_id IS NULL THEN 0 ELSE 1 END, r.variant_id, r.id ASC`,
                [productId]
            );
            return Array.isArray(r) ? r : [];
        });
        res.json(rows);
    } catch (e) {
        console.error('getProductRecipe', e);
        res.status(500).json({ error: 'Reçete yüklenemedi' });
    }
};

/** PUT — body: { lines: { ingredient_product_id: number, qty_per_unit: number, variant_id?: number | null }[] } */
export const putProductRecipe = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const productId = Number(req.params.productId);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ error: 'Geçersiz ürün' });
        }
        const raw = req.body?.lines;
        if (!Array.isArray(raw)) {
            return res.status(400).json({ error: 'lines dizisi gerekli' });
        }

        await withTenantTransaction(tenantId, async (conn) => {
            await ensureInventorySchema(conn);
            const [self]: any = await conn.query(`SELECT id FROM products WHERE id = ? LIMIT 1`, [productId]);
            if (!self?.length) throw new Error('PRODUCT_NOT_FOUND');

            await conn.query(`DELETE FROM product_recipe_items WHERE product_id = ?`, [productId]);

            const seen = new Set<string>();
            for (const row of raw) {
                const ingId = Math.floor(Number(row.ingredient_product_id));
                const qpu = Number(row.qty_per_unit);
                if (!Number.isFinite(ingId) || ingId <= 0) continue;
                if (ingId === productId) throw new Error('SELF_INGREDIENT');
                const variantIdRaw = row.variant_id;
                const variantId =
                    variantIdRaw != null && variantIdRaw !== ''
                        ? Math.floor(Number(variantIdRaw))
                        : null;
                if (variantId != null && (!Number.isFinite(variantId) || variantId <= 0)) {
                    throw new Error('BAD_VARIANT');
                }
                const scopeKey = `${ingId}:${variantId ?? 'null'}`;
                if (seen.has(scopeKey)) throw new Error('DUPLICATE_INGREDIENT');
                seen.add(scopeKey);
                if (!Number.isFinite(qpu) || qpu <= 0) throw new Error('BAD_QTY');

                const [ing]: any = await conn.query(`SELECT id FROM products WHERE id = ? LIMIT 1`, [ingId]);
                if (!ing?.length) throw new Error('INGREDIENT_NOT_FOUND');

                if (variantId != null) {
                    const [vr]: any = await conn.query(
                        `SELECT id FROM product_variants WHERE id = ? AND product_id = ? LIMIT 1`,
                        [variantId, productId]
                    );
                    if (!vr?.length) throw new Error('VARIANT_NOT_FOR_PRODUCT');
                }

                await conn.query(
                    `INSERT INTO product_recipe_items (product_id, ingredient_product_id, qty_per_unit, variant_id)
                     VALUES (?, ?, ?, ?)`,
                    [productId, ingId, qpu, variantId]
                );
            }
        });

        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);
        res.json({ success: true });
    } catch (e: any) {
        if (e.message === 'PRODUCT_NOT_FOUND') return res.status(404).json({ error: 'Ürün bulunamadı' });
        if (e.message === 'INGREDIENT_NOT_FOUND') return res.status(400).json({ error: 'Hammadde ürünü bulunamadı' });
        if (e.message === 'SELF_INGREDIENT') return res.status(400).json({ error: 'Ürün kendi hammaddesi olamaz' });
        if (e.message === 'DUPLICATE_INGREDIENT') return res.status(400).json({ error: 'Tekrarlayan hammadde' });
        if (e.message === 'BAD_QTY') return res.status(400).json({ error: 'qty_per_unit pozitif olmalı' });
        if (e.message === 'BAD_VARIANT') return res.status(400).json({ error: 'Geçersiz varyant' });
        if (e.message === 'VARIANT_NOT_FOR_PRODUCT') {
            return res.status(400).json({ error: 'Varyant bu menü ürününe ait değil' });
        }
        console.error('putProductRecipe', e);
        res.status(500).json({ error: 'Reçete kaydedilemedi' });
    }
};
