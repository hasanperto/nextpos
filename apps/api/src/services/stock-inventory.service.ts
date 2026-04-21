/**
 * Reçete (BOM) + sipariş bazlı otomatik stok düşümü / iptal iadesi.
 * Tenant bağlantısı üzerinde çalışır (transaction içinde çağrılmalıdır).
 */

export class InsufficientStockError extends Error {
    readonly payload: {
        ingredient_product_id: number;
        ingredient_name: string;
        needed: number;
        available: number;
        /** Hangi menü satırı bu tüketimi tetikledi (debug / UI) */
        menu_product_id?: number;
        menu_variant_id?: number | null;
    };

    constructor(payload: InsufficientStockError['payload']) {
        super('INSUFFICIENT_STOCK');
        this.name = 'InsufficientStockError';
        this.payload = payload;
    }
}

type DbConn = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

export async function ensureStockRecipeSchema(conn: DbConn): Promise<void> {
    await conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0`);
    await conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_qty DECIMAL(12,3) NOT NULL DEFAULT 0`);
    await conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(180) NULL`);
    await conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_price DECIMAL(12,4) NULL`);
    await conn.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMP NULL`);
    await conn.query(`
        CREATE TABLE IF NOT EXISTS stock_movements (
            id SERIAL PRIMARY KEY,
            product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            delta_qty DECIMAL(12,3) NOT NULL,
            prev_qty DECIMAL(12,3) NOT NULL,
            next_qty DECIMAL(12,3) NOT NULL,
            reason VARCHAR(120) NOT NULL DEFAULT 'manual_adjustment',
            notes TEXT NULL,
            created_by INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await conn.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS ref_order_id INT NULL`);
    await conn.query(`
        CREATE TABLE IF NOT EXISTS product_recipe_items (
            id SERIAL PRIMARY KEY,
            product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            ingredient_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            qty_per_unit DECIMAL(14,6) NOT NULL DEFAULT 1,
            variant_id INT NULL
        )
    `);
    await conn.query(`ALTER TABLE product_recipe_items ADD COLUMN IF NOT EXISTS variant_id INT NULL`);
    try {
        await conn.query(`
            ALTER TABLE product_recipe_items
            ADD CONSTRAINT product_recipe_items_variant_fk
            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
        `);
    } catch {
        /* FK zaten var */
    }
    try {
        await conn.query(
            `ALTER TABLE product_recipe_items DROP CONSTRAINT IF EXISTS product_recipe_items_product_id_ingredient_product_id_key`
        );
    } catch {
        /* yok */
    }
    await conn.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_product_recipe_items_scope
        ON product_recipe_items (product_id, ingredient_product_id, COALESCE(variant_id, -1))
    `);
}

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** Varyant özel satır, yoksa genel (variant_id NULL) reçete; aynı hammadde için varyant kazanır. */
async function resolveRecipeLinesForOrderLine(
    conn: DbConn,
    productId: number,
    variantId: number | null | undefined
): Promise<{ ingredient_product_id: number; qty_per_unit: number }[]> {
    const pid = Math.floor(Number(productId));
    const vidRaw = variantId != null ? Math.floor(Number(variantId)) : null;
    const vid = vidRaw != null && Number.isFinite(vidRaw) && vidRaw > 0 ? vidRaw : null;

    const [genericRows]: any = await conn.query(
        `SELECT ingredient_product_id, qty_per_unit FROM product_recipe_items WHERE product_id = ? AND variant_id IS NULL`,
        [pid]
    );
    const map = new Map<number, number>();
    for (const r of Array.isArray(genericRows) ? genericRows : []) {
        const ing = Math.floor(Number(r.ingredient_product_id));
        if (!Number.isFinite(ing) || ing <= 0 || ing === pid) continue;
        map.set(ing, Math.max(0, num(r.qty_per_unit)) || 1);
    }

    if (vid != null) {
        const [specRows]: any = await conn.query(
            `SELECT ingredient_product_id, qty_per_unit FROM product_recipe_items WHERE product_id = ? AND variant_id = ?`,
            [pid, vid]
        );
        for (const r of Array.isArray(specRows) ? specRows : []) {
            const ing = Math.floor(Number(r.ingredient_product_id));
            if (!Number.isFinite(ing) || ing <= 0 || ing === pid) continue;
            map.set(ing, Math.max(0, num(r.qty_per_unit)) || 1);
        }
    }

    return [...map.entries()].map(([ingredient_product_id, qty_per_unit]) => ({ ingredient_product_id, qty_per_unit }));
}

/**
 * Satılan menü kalemlerine göre reçete satırlarından hammaddeleri düşer.
 * `variantId`: sipariş satırındaki varyant; reçetede hem genel hem varyant satırları kullanılabilir.
 */
export async function applyOrderRecipeDeduction(
    conn: DbConn,
    orderId: number,
    lines: { productId: number; quantity: number; variantId?: number | null }[],
    userId: number | string | null
): Promise<void> {
    const need = new Map<number, number>();

    for (const line of lines) {
        const pid = Math.floor(Number(line.productId));
        const qty = Math.max(0, num(line.quantity));
        if (!Number.isFinite(pid) || pid <= 0 || qty <= 0) continue;

        const recs = await resolveRecipeLinesForOrderLine(conn, pid, line.variantId);
        for (const r of recs) {
            const ing = r.ingredient_product_id;
            if (!Number.isFinite(ing) || ing <= 0 || ing === pid) continue;
            const qpu = r.qty_per_unit;
            need.set(ing, (need.get(ing) || 0) + qpu * qty);
        }
    }

    if (need.size === 0) return;

    const sorted = [...need.keys()].sort((a, b) => a - b);

    for (const ingId of sorted) {
        const consume = need.get(ingId)!;
        if (consume <= 0) continue;

        const [prows]: any = await conn.query(
            `SELECT id, name, COALESCE(stock_qty, 0)::text AS stock_qty FROM products WHERE id = ? FOR UPDATE`,
            [ingId]
        );
        const row = prows?.[0];
        if (!row) {
            throw new InsufficientStockError({
                ingredient_product_id: ingId,
                ingredient_name: `#${ingId}`,
                needed: consume,
                available: 0,
            });
        }

        const prev = num(row.stock_qty);
        const next = prev - consume;
        if (next < 0) {
            throw new InsufficientStockError({
                ingredient_product_id: ingId,
                ingredient_name: String(row.name || `#${ingId}`),
                needed: consume,
                available: prev,
            });
        }

        await conn.query(`UPDATE products SET stock_qty = ? WHERE id = ?`, [next, ingId]);
        await conn.query(
            `INSERT INTO stock_movements (product_id, delta_qty, prev_qty, next_qty, reason, notes, created_by, ref_order_id)
             VALUES (?, ?, ?, ?, 'order_recipe_deduction', ?, ?, ?)`,
            [
                ingId,
                -consume,
                prev,
                next,
                JSON.stringify({ orderId, kind: 'recipe_deduction' }),
                userId != null ? Number(userId) : null,
                orderId,
            ]
        );
    }
}

/**
 * Sipariş iptalinde reçete düşümünü geri alır (idempotent: hareket yoksa no-op).
 */
export async function reverseOrderRecipeDeduction(
    conn: DbConn,
    orderId: number,
    userId: number | string | null
): Promise<void> {
    const [movs]: any = await conn.query(
        `SELECT id, product_id, delta_qty FROM stock_movements WHERE ref_order_id = ? AND reason = 'order_recipe_deduction'`,
        [orderId]
    );
    const list = (Array.isArray(movs) ? movs : []) as { id: number; product_id: number; delta_qty: unknown }[];
    if (list.length === 0) return;

    const byProduct = [...list].sort((a, b) => a.product_id - b.product_id);

    for (const m of byProduct) {
        const pid = Math.floor(Number(m.product_id));
        const delta = num(m.delta_qty);
        const restore = -delta;
        if (restore === 0) continue;

        const [prows]: any = await conn.query(
            `SELECT id, COALESCE(stock_qty, 0)::text AS stock_qty FROM products WHERE id = ? FOR UPDATE`,
            [pid]
        );
        const row = prows?.[0];
        if (!row) continue;
        const prev = num(row.stock_qty);
        const next = Math.max(0, prev + restore);
        await conn.query(`UPDATE products SET stock_qty = ? WHERE id = ?`, [next, pid]);
        await conn.query(
            `INSERT INTO stock_movements (product_id, delta_qty, prev_qty, next_qty, reason, notes, created_by, ref_order_id)
             VALUES (?, ?, ?, ?, 'order_cancel_restore', ?, ?, ?)`,
            [pid, restore, prev, next, JSON.stringify({ orderId, kind: 'recipe_restore' }), userId != null ? Number(userId) : null, orderId]
        );
    }
}
