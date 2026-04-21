import { Request, Response } from 'express';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { getEffectiveMaxPrinters, migrateBillingTables } from '../services/billing.service.js';
import { emitTenantMenuCatalogStale, emitTenantTablesStale } from '../lib/tenantSocketEmit.js';
import { delCacheByPrefix } from '../lib/cache.js';

function defaultPrintStations() {
    return {
        printers: [
            { id: 'default-kitchen', name: 'Mutfak', role: 'kitchen' as const },
            { id: 'default-receipt', name: 'Adisyon / Fiş', role: 'receipt' as const },
        ],
        kitchenAutoPrint: true,
        receiptOnPayment: true,
        receiptOnSessionClose: true,
        reprintKitchenEnabled: true,
        reprintReceiptEnabled: true,
    };
}

export const getSettingsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const branchId = req.branchId || 1;

        // Fetch master info from public.tenants and local branch info
        const settings = await withTenant(tenantId, async (connection) => {
            // 1. Get branch info
            const [branchRows]: any = await connection.query(
                'SELECT * FROM branches WHERE id = ?',
                [branchId]
            );
            
            // 2. Get master registration info from public.tenants (Shared connection usually won't work across schemas if restricted, but here we use withTenant which is a pool/connection)
            // Note: withTenant changes search_path. We might need to use public.tenants explicitly.
            const [tenantRows]: any = await connection.query(
                'SELECT name, address, contact_phone as phone, tax_number as taxNumber, tax_office as taxOffice FROM public.tenants WHERE id = ?',
                [tenantId]
            );

            const masterInfo = tenantRows[0] || {};
            const branch = branchRows[0] || {};
            const baseSettings = branch.settings || {};
            
            return {
                id: branch.id,
                // Master info is immutable from public.tenants
                registration: {
                    name: masterInfo.name,
                    address: masterInfo.address,
                    phone: masterInfo.phone,
                    taxNumber: masterInfo.taxNumber,
                    taxOffice: masterInfo.taxOffice,
                },
                // Editable branch-level settings
                name: branch.name || masterInfo.name,
                address: branch.address || masterInfo.address,
                phone: branch.phone || masterInfo.phone,
                taxNumber: branch.taxNumber || masterInfo.taxNumber,
                language: branch.default_language || 'de',
                integrations: {
                    payment: baseSettings.integrations?.payment || { provider: 'manual', apiKey: '', terminalId: '', simulationMode: false },
                    whatsapp: baseSettings.integrations?.whatsapp || {
                        enabled: false,
                        phoneNumberId: '',
                        phoneNumber: '',
                        apiKey: '',
                        webhookKey: '',
                        sendWelcomeMessage: true,
                        sendOrderReadyMessage: true,
                        sendStatusUpdates: true,
                    },
                    callerId: baseSettings.integrations?.callerId || { enabled: false, source: 'android', createCustomerMode: 'after' },
                    hardware: baseSettings.integrations?.hardware || { drawerOpenCommand: '27,112,0,25,250', primaryPrinter: 'Default' },
                    onlineOrder: baseSettings.integrations?.onlineOrder || {
                        enabled: false,
                        autoCreateCustomer: true,
                        qrNotificationSound: 'bell_ding.mp3',
                        whatsappNotificationSound: 'whatsapp_alert.mp3',
                        alertInterval: 30,
                        allowGuestCheckout: true
                    },
                    kiosk: baseSettings.integrations?.kiosk || {
                        enabled: true,
                        allowSelfRegistration: true,
                        pairingSecret: '',
                        deviceNotes: '',
                        linkedDevices: [] as {
                            deviceCode?: string;
                            tableId?: number;
                            tableName?: string;
                            tableQrCode?: string;
                            label?: string;
                            createdAt?: string;
                            lastSeenAt?: string;
                        }[],
                    },
                    floorPlanMode: baseSettings.integrations?.floorPlanMode || 'grid',
                    applyFloorPlanTo: baseSettings.integrations?.applyFloorPlanTo || 'both',
                    printStations: baseSettings.integrations?.printStations || defaultPrintStations(),
                },
                receipt: baseSettings.receipt || {
                    header: branch.name || masterInfo.name || 'NextPOS Restoran',
                    footer: 'Teşekkür Ederiz',
                    showLogo: false,
                    showAddress: true,
                    showPhone: true
                },
                vat: baseSettings.vat || [
                    { label: 'Gıda (%7)', value: 7 },
                    { label: 'İçecek (%19)', value: 19 }
                ],
                /** Varsayılan KDV oranı (tekil, POS hesaplamaları için) — vat array'inden ilk standart oran alınır */
                taxRate: (() => {
                    const vatArr = baseSettings.vat;
                    if (Array.isArray(vatArr) && vatArr.length > 0) {
                        // En yüksek oranı varsayılan KDV olarak al (%19 genellikle standart)
                        const sorted = [...vatArr].sort((a, b) => b.value - a.value);
                        return sorted[0]?.value ?? 19;
                    }
                    return 19;
                })(),
                currency: baseSettings.currency || 'EUR',
                courier: baseSettings.courier || {
                    tipOptions: {
                        cardPercent: 5,
                        cashFixed: [10, 20, 50]
                    }
                },
                pickupSecurity: baseSettings.pickupSecurity || {
                    requirePIN: false,
                    logDuration: true
                },
                ...baseSettings
            };
        });

        const base = applySettingsDefaults(settings);
        try {
            await migrateBillingTables();
            const { total, base: bp, extra } = await getEffectiveMaxPrinters(tenantId);
            const ps = base.integrations?.printStations as Record<string, unknown> | undefined;
            const arr = ps?.printers;
            let printers = Array.isArray(arr) ? [...arr] : undefined;
            if (printers && printers.length > total) {
                printers = printers.slice(0, total);
            }
            res.json({
                ...base,
                billingLimits: {
                    maxPrinters: total,
                    basePrinters: bp,
                    extraPrintersPurchased: extra,
                },
                integrations: {
                    ...base.integrations,
                    printStations: {
                        ...ps,
                        ...(printers ? { printers } : {}),
                    },
                },
            });
        } catch (blErr) {
            console.warn('billingLimits / print clamp:', blErr);
            res.json({ ...base, billingLimits: { maxPrinters: 2, basePrinters: 2, extraPrintersPurchased: 0 } });
        }
    } catch (error) {
        console.error('❌ Settings error:', error);
        res.status(500).json({ error: 'Ayarlar yüklenemedi' });
    }
};

/** Yeni alanlar için varsayılanlar (branch.settings JSON eski kayıtlarda eksik olabilir) */
function applySettingsDefaults(payload: any) {
    const int = (payload.integrations as Record<string, unknown> | undefined) || {};
    const lo = Number(int.longOccupiedMinutes);
    const longOccupiedMinutes =
        Number.isFinite(lo) && lo > 0 ? Math.min(720, Math.max(5, Math.floor(lo))) : 45;
    const ps = (int.printStations as Record<string, unknown> | undefined) || {};
    const av = (payload.accountingVisibility as Record<string, unknown> | undefined) || {};
    return {
        ...payload,
        integrations: {
            ...int,
            longOccupiedMinutes,
            printStations: {
                ...defaultPrintStations(),
                ...ps,
                printers: Array.isArray(ps.printers) && ps.printers.length > 0 ? ps.printers : defaultPrintStations().printers,
            },
        },
        accountingVisibility: {
            hideCancelled: Boolean(av.hideCancelled),
            hideDeleted: Boolean(av.hideDeleted),
        },
    };
}

export const updateSettingsHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const branchId = req.branchId || 1;
        const { name, address, phone, taxNumber, language, ...otherSettings } = req.body;

        await migrateBillingTables();
        const { total: maxPrinters } = await getEffectiveMaxPrinters(tenantId);
        const pr = (otherSettings as { integrations?: { printStations?: { printers?: unknown[] } } })?.integrations
            ?.printStations?.printers;
        if (Array.isArray(pr) && pr.length > maxPrinters) {
            return res.status(400).json({
                error: `Yazıcı istasyonu kotası aşıldı (en fazla ${maxPrinters}). Ek yazıcı için aboneliğe «Ek Yazıcı İstasyonu» modülü ekleyin.`,
            });
        }

        await withTenant(tenantId, async (connection) => {
            // Update branch static fields
            await connection.query(
                `UPDATE branches SET 
                    name = ?, 
                    address = ?, 
                    phone = ?, 
                    tax_number = ?, 
                    default_language = ?,
                    settings = ?
                 WHERE id = ?`,
                [
                    name, 
                    address, 
                    phone, 
                    taxNumber, 
                    language || 'de',
                    JSON.stringify(otherSettings),
                    branchId
                ]
            );
        });

        res.json({ success: true, message: 'Ayarlar güncellendi' });
    } catch (error) {
        console.error('❌ Update settings error:', error);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
};

export const seedDemoContentHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const { confirmReset, preset } = req.body || {};
        const selectedPreset = String(preset || 'restaurant_courier');

        if (confirmReset !== true) {
            return res.status(400).json({ error: 'Demo yükleme için onay gerekli (confirmReset=true).' });
        }
        if (selectedPreset !== 'restaurant_courier') {
            return res.status(400).json({ error: 'Desteklenmeyen demo seti.' });
        }

        const result = await withTenantTransaction(tenantId, async (conn) => {
            const [activeTableRows]: any = await conn.query(
                'SELECT COUNT(*)::int AS c FROM tables WHERE current_session_id IS NOT NULL'
            );
            const activeTableCount = Number(activeTableRows?.[0]?.c || 0);
            if (activeTableCount > 0) {
                throw new Error('ACTIVE_TABLE_SESSIONS');
            }

            const [activeOrderRows]: any = await conn.query(
                `SELECT COUNT(*)::int AS c FROM orders
                 WHERE status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery')`
            );
            const activeOrderCount = Number(activeOrderRows?.[0]?.c || 0);
            if (activeOrderCount > 0) {
                throw new Error('ACTIVE_ORDERS');
            }

            // Reset order: child -> parent
            await conn.query('DELETE FROM product_modifiers');
            await conn.query('DELETE FROM product_variants');
            await conn.query('DELETE FROM product_ingredients');
            await conn.query('DELETE FROM products');
            await conn.query('DELETE FROM modifiers');
            await conn.query('DELETE FROM categories');
            await conn.query('DELETE FROM tables');
            await conn.query('DELETE FROM sections');

            const sectionIds: Record<string, number> = {};
            const insertSection = async (name: string, floor: number, sortOrder: number) => {
                const [ins]: any = await conn.query(
                    `INSERT INTO sections (name, floor, sort_order, is_active, branch_id, layout_data)
                     VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
                    [name, floor, sortOrder, true, 1, JSON.stringify({})]
                );
                return Number(ins?.insertId);
            };

            sectionIds.salon = await insertSection('Ana Salon', 0, 1);
            sectionIds.teras = await insertSection('Teras', 0, 2);
            sectionIds.paket = await insertSection('Paket / Kurye', 0, 3);

            const tableRows = [
                { sectionId: sectionIds.salon, name: 'Masa 1', cap: 4, shape: 'square', x: 80, y: 80 },
                { sectionId: sectionIds.salon, name: 'Masa 2', cap: 4, shape: 'square', x: 220, y: 80 },
                { sectionId: sectionIds.salon, name: 'Masa 3', cap: 6, shape: 'round', x: 360, y: 80 },
                { sectionId: sectionIds.salon, name: 'Masa 4', cap: 2, shape: 'square', x: 80, y: 200 },
                { sectionId: sectionIds.teras, name: 'Teras 1', cap: 4, shape: 'round', x: 220, y: 200 },
                { sectionId: sectionIds.teras, name: 'Teras 2', cap: 4, shape: 'round', x: 360, y: 200 },
                { sectionId: sectionIds.paket, name: 'Gel-Al Banko', cap: 1, shape: 'square', x: 120, y: 320 },
            ];
            for (let i = 0; i < tableRows.length; i++) {
                const t = tableRows[i];
                await conn.query(
                    `INSERT INTO tables (section_id, name, translations, capacity, shape, position_x, position_y, qr_code, branch_id)
                     VALUES (?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)`,
                    [
                        t.sectionId,
                        t.name,
                        JSON.stringify({ tr: t.name, en: t.name, de: t.name }),
                        t.cap,
                        t.shape,
                        t.x,
                        t.y,
                        `DEMO-T-${String(i + 1).padStart(2, '0')}`,
                        1,
                    ]
                );
            }

            const categoryIds: Record<string, number> = {};
            const categories = [
                { key: 'pizza', name: 'Pizzalar', station: 'hot', sort: 1 },
                { key: 'burger', name: 'Burgerler', station: 'hot', sort: 2 },
                { key: 'drink', name: 'İçecekler', station: 'bar', sort: 3 },
                { key: 'dessert', name: 'Tatlılar', station: 'cold', sort: 4 },
            ];
            for (const c of categories) {
                const [ins]: any = await conn.query(
                    `INSERT INTO categories (name, icon, sort_order, is_active, translations, kitchen_station, branch_id)
                     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`,
                    [c.name, 'utensils', c.sort, true, JSON.stringify({ tr: c.name, en: c.name, de: c.name }), c.station, 1]
                );
                categoryIds[c.key] = Number(ins?.insertId);
            }

            const productIds: Record<string, number> = {};
            const products = [
                { key: 'margherita', category: 'pizza', name: 'Pizza Margherita', base: 11.9, prep: 12 },
                { key: 'pepperoni', category: 'pizza', name: 'Pizza Pepperoni', base: 13.9, prep: 14 },
                { key: 'classic_burger', category: 'burger', name: 'Classic Burger', base: 10.9, prep: 10 },
                { key: 'cheese_burger', category: 'burger', name: 'Cheese Burger', base: 11.9, prep: 11 },
                { key: 'cola', category: 'drink', name: 'Kola 33cl', base: 3.5, prep: 2 },
                { key: 'ayran', category: 'drink', name: 'Ayran 30cl', base: 2.9, prep: 1 },
                { key: 'tiramisu', category: 'dessert', name: 'Tiramisu', base: 5.9, prep: 3 },
            ];
            for (const p of products) {
                const [ins]: any = await conn.query(
                    `INSERT INTO products (category_id, name, description, base_price, price_takeaway, price_delivery, image_url, is_active, prep_time_min, allergens, translations, stock_qty, min_stock_qty, supplier_name, last_purchase_price)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)`,
                    [
                        categoryIds[p.category],
                        p.name,
                        `${p.name} demo içeriği`,
                        p.base,
                        p.base,
                        p.base + 1.0,
                        null,
                        true,
                        p.prep,
                        null,
                        JSON.stringify({ tr: p.name, en: p.name, de: p.name }),
                        100,
                        10,
                        'Demo Tedarikçi',
                        Math.max(1, p.base - 2),
                        null,
                    ]
                );
                productIds[p.key] = Number(ins?.insertId);
            }

            const insertVariant = async (productId: number, name: string, price: number, sortOrder: number, isDefault = false) => {
                await conn.query(
                    `INSERT INTO product_variants (product_id, name, price, sort_order, is_default)
                     VALUES (?, ?, ?, ?, ?)`,
                    [productId, name, price, sortOrder, isDefault]
                );
            };

            for (const pKey of ['margherita', 'pepperoni', 'classic_burger', 'cheese_burger']) {
                const pid = productIds[pKey];
                await insertVariant(pid, 'Küçük', 0, 1, false);
                await insertVariant(pid, 'Orta', 2, 2, true);
                await insertVariant(pid, 'Büyük', 4, 3, false);
            }

            const modifierIds: Record<string, number> = {};
            const modifiers = [
                { key: 'extra_cheese', name: 'Ekstra Peynir', price: 1.5, category: '1_Ekstralar' },
                { key: 'jalapeno', name: 'Jalapeno', price: 1.0, category: '1_Ekstralar' },
                { key: 'ketchup', name: 'Ketçap', price: 0, category: '2_Soslar' },
                { key: 'mayonnaise', name: 'Mayonez', price: 0, category: '2_Soslar' },
            ];
            for (const m of modifiers) {
                const [ins]: any = await conn.query(
                    'INSERT INTO modifiers (name, price, category) VALUES (?, ?, ?)',
                    [m.name, m.price, m.category]
                );
                modifierIds[m.key] = Number(ins?.insertId);
            }

            const productModifierMap = [
                ['margherita', ['extra_cheese', 'jalapeno']],
                ['pepperoni', ['extra_cheese', 'jalapeno']],
                ['classic_burger', ['ketchup', 'mayonnaise', 'jalapeno']],
                ['cheese_burger', ['ketchup', 'mayonnaise', 'extra_cheese']],
            ] as const;
            for (const [pKey, mKeys] of productModifierMap) {
                for (const mk of mKeys) {
                    await conn.query(
                        'INSERT INTO product_modifiers (product_id, modifier_id) VALUES (?, ?) ON CONFLICT (product_id, modifier_id) DO NOTHING',
                        [productIds[pKey], modifierIds[mk]]
                    );
                }
            }

            return {
                sections: Object.keys(sectionIds).length,
                tables: tableRows.length,
                categories: categories.length,
                products: products.length,
                variants: 12,
                modifiers: modifiers.length,
                productModifierLinks: productModifierMap.reduce((acc, x) => acc + x[1].length, 0),
            };
        });

        emitTenantTablesStale(req);
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);

        res.json({
            ok: true,
            preset: selectedPreset,
            summary: result,
            message: 'Demo içerik başarıyla yüklendi.',
        });
    } catch (error: any) {
        if (error?.message === 'ACTIVE_TABLE_SESSIONS') {
            return res.status(409).json({ error: 'Aktif masa oturumu varken demo reset yapılamaz.' });
        }
        if (error?.message === 'ACTIVE_ORDERS') {
            return res.status(409).json({ error: 'Bekleyen siparişler varken demo reset yapılamaz.' });
        }
        console.error('❌ Seed demo content error:', error);
        res.status(500).json({ error: 'Demo içerik yüklenemedi.' });
    }
};
