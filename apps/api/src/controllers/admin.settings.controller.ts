import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { withTenant, withTenantTransaction } from '../lib/db.js';
import { getEffectiveMaxPrinters, getEffectiveMaxDevices, migrateBillingTables } from '../services/billing.service.js';
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
                offlineSecurity: baseSettings.offlineSecurity || {
                    maxOfflineHours: 48,
                    requirePinOnOffline: true,
                    strictHeartbeat: true,
                    heartbeatFailBeforeSuspicious: 3,
                    pinUnlockHours: 12,
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
                try {
                    await withTenant(tenantId, async (connection) => {
                        const [rows]: any = await connection.query('SELECT settings FROM branches WHERE id = ?', [branchId]);
                        const b = rows?.[0];
                        if (b) {
                            const originalSettings = typeof b.settings === 'string' ? JSON.parse(b.settings) : b.settings || {};
                            if (originalSettings.integrations?.printStations) {
                                originalSettings.integrations.printStations.printers = printers;
                                await connection.query(
                                    'UPDATE branches SET settings = ? WHERE id = ?',
                                    [JSON.stringify(originalSettings), branchId]
                                );
                            }
                        }
                    });
                } catch (saveErr) {
                    console.warn('[Billing] Failed to auto-clamp printer settings in DB:', saveErr);
                }
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
    const esc = Number(int.serviceCallEscalationSeconds);
    const serviceCallEscalationSeconds =
        Number.isFinite(esc) && esc >= 15 ? Math.min(600, Math.floor(esc)) : 60;
    const ps = (int.printStations as Record<string, unknown> | undefined) || {};
    const av = (payload.accountingVisibility as Record<string, unknown> | undefined) || {};
    return {
        ...payload,
        integrations: {
            ...int,
            longOccupiedMinutes,
            serviceCallEscalationSeconds,
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

        const { total: maxDevices } = await getEffectiveMaxDevices(tenantId);
        const linkedKiosks = (otherSettings as { integrations?: { kiosk?: { linkedDevices?: unknown[] } } })?.integrations
            ?.kiosk?.linkedDevices;
        const kioskDeviceCount = Array.isArray(linkedKiosks) ? linkedKiosks.length : 0;

        const userDeviceCount = await withTenant(tenantId, async (connection) => {
            const [cntRows]: any = await connection.query(
                `SELECT COUNT(DISTINCT device_id) as c FROM users WHERE device_id IS NOT NULL AND TRIM(device_id) <> ''`
            );
            return Number(cntRows?.[0]?.c ?? 0);
        });

        const totalDevices = userDeviceCount + kioskDeviceCount;
        if (totalDevices > maxDevices) {
            return res.status(400).json({
                error: `Cihaz kotası aşıldı (Kullanılan: ${totalDevices}, En fazla: ${maxDevices}). Ek cihaz bağlayabilmek için planınızı yükseltin veya «Ek Cihaz» modülü satın alın.`,
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
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Demo seed is disabled in production', code: 'FORBIDDEN' });
    }
    try {
        const tenantId = req.tenantId!;
        const userId = req.user?.userId;
        const { confirmReset, preset, password, pinCode } = req.body || {};
        const selectedPreset = String(preset || 'restaurant_courier');

        if (!userId) {
            return res.status(401).json({ error: 'Yetkilendirme hatası.' });
        }
        if (confirmReset !== true) {
            return res.status(400).json({ error: 'Demo yükleme için onay gerekli (confirmReset=true).' });
        }
        if (selectedPreset !== 'restaurant_courier') {
            return res.status(400).json({ error: 'Desteklenmeyen demo seti.' });
        }

        const authOk = await withTenant(tenantId, async (conn) => {
            const [userRows]: any = await conn.query(`SELECT password_hash, pin_code FROM users WHERE id = ?`, [userId]);
            const user = userRows?.[0];
            if (!user) return false;
            let ok = false;
            if (password) {
                ok = await bcrypt.compare(password, user.password_hash);
            }
            if (!ok && pinCode && user.pin_code) {
                ok = (String(pinCode) === String(user.pin_code));
            }
            return ok;
        });

        if (!authOk) {
            return res.status(401).json({ error: 'Geçersiz şifre veya PIN kodu.' });
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
                 WHERE status IN ('pending', 'confirmed', 'preparing', 'ready', 'shipped')`
            );
            const activeOrderCount = Number(activeOrderRows?.[0]?.c || 0);
            if (activeOrderCount > 0) {
                throw new Error('ACTIVE_ORDERS');
            }

            // Clear transaction and history tables first to prevent foreign key errors
            await conn.query('DELETE FROM deliveries');
            await conn.query('DELETE FROM kitchen_tickets');
            await conn.query('DELETE FROM order_items');
            await conn.query('DELETE FROM payments');
            await conn.query('DELETE FROM orders');
            await conn.query('DELETE FROM table_sessions');
            await conn.query('DELETE FROM service_calls');

            // Reset order: child -> parent
            await conn.query('DELETE FROM product_modifiers');
            await conn.query('DELETE FROM product_variants');
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
                    `INSERT INTO products (category_id, name, description, base_price, price_takeaway, price_delivery, image_url, is_active, prep_time_min, allergens, translations, branch_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
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
                        1,
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
            // 🛡️ Self-healing: Ensure columns exist in orders table
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_settled BOOLEAN DEFAULT FALSE`);
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0`);
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_owner_type VARCHAR(16) DEFAULT 'courier'`);
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_split_json JSONB`);
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP NULL`);
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(255) NULL`);
            await conn.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_signature TEXT NULL`);

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

export const revokeKioskHandler = async (req: Request, res: Response) => {
    try {
        const tenantId = req.tenantId!;
        const branchId = req.branchId || 1;
        const deviceCode = req.params.deviceCode;

        await withTenant(tenantId, async (connection) => {
            const [branchRows]: any = await connection.query('SELECT settings FROM branches WHERE id = ?', [branchId]);
            if (!branchRows[0]) return;
            const settings = branchRows[0].settings || {};
            if (settings.integrations?.kiosk?.linkedDevices) {
                settings.integrations.kiosk.linkedDevices = settings.integrations.kiosk.linkedDevices.filter((d: any) => d.deviceCode !== deviceCode);
                await connection.query('UPDATE branches SET settings = ? WHERE id = ?', [JSON.stringify(settings), branchId]);
            }
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`tenant:${tenantId}`).emit('kiosk:revoked');
        }

        res.json({ success: true, message: 'Cihaz yetkisi iptal edildi.' });
    } catch (error) {
        console.error('❌ Revoke kiosk error:', error);
        res.status(500).json({ error: 'Cihaz yetkisi iptal edilemedi.' });
    }
};

export const clearDemoContentHandler = async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Demo seed is disabled in production', code: 'FORBIDDEN' });
    }
    try {
        const tenantId = req.tenantId!;
        const userId = req.user?.userId;
        const { password, pinCode } = req.body || {};

        if (!userId) {
            return res.status(401).json({ error: 'Yetkilendirme hatası.' });
        }

        const authOk = await withTenant(tenantId, async (conn) => {
            const [userRows]: any = await conn.query(`SELECT password_hash, pin_code FROM users WHERE id = ?`, [userId]);
            const user = userRows?.[0];
            if (!user) return false;
            let ok = false;
            if (password) {
                ok = await bcrypt.compare(password, user.password_hash);
            }
            if (!ok && pinCode && user.pin_code) {
                ok = (String(pinCode) === String(user.pin_code));
            }
            return ok;
        });

        if (!authOk) {
            return res.status(401).json({ error: 'Geçersiz şifre veya PIN kodu.' });
        }

        await withTenantTransaction(tenantId, async (conn) => {
            const [activeTableRows]: any = await conn.query(
                'SELECT COUNT(*)::int AS c FROM tables WHERE current_session_id IS NOT NULL'
            );
            const activeTableCount = Number(activeTableRows?.[0]?.c || 0);
            if (activeTableCount > 0) {
                throw new Error('ACTIVE_TABLE_SESSIONS');
            }

            const [activeOrderRows]: any = await conn.query(
                `SELECT COUNT(*)::int AS c FROM orders
                 WHERE status IN ('pending', 'confirmed', 'preparing', 'ready', 'shipped')`
            );
            const activeOrderCount = Number(activeOrderRows?.[0]?.c || 0);
            if (activeOrderCount > 0) {
                throw new Error('ACTIVE_ORDERS');
            }

            // Clear transaction and history tables first to prevent foreign key errors
            await conn.query('DELETE FROM deliveries');
            await conn.query('DELETE FROM kitchen_tickets');
            await conn.query('DELETE FROM order_items');
            await conn.query('DELETE FROM customer_point_history');
            await conn.query('DELETE FROM payments');
            await conn.query('DELETE FROM orders');
            await conn.query('DELETE FROM table_sessions');
            await conn.query('DELETE FROM service_calls');

            // Reset order: child -> parent
            await conn.query('DELETE FROM product_modifiers');
            await conn.query('DELETE FROM product_variants');
            await conn.query('DELETE FROM products');
            await conn.query('DELETE FROM modifiers');
            await conn.query('DELETE FROM categories');
            await conn.query('DELETE FROM tables');
            await conn.query('DELETE FROM sections');
        });

        emitTenantTablesStale(req);
        emitTenantMenuCatalogStale(req);
        await delCacheByPrefix(`menu:${tenantId}:`);

        res.json({
            ok: true,
            message: 'Tüm menü, masa, bölüm ve sipariş verileri başarıyla silindi.'
        });
    } catch (error: any) {
        if (error?.message === 'ACTIVE_TABLE_SESSIONS') {
            return res.status(409).json({ error: 'Aktif masa oturumu varken veriler silinemez.' });
        }
        if (error?.message === 'ACTIVE_ORDERS') {
            return res.status(409).json({ error: 'Bekleyen siparişler varken veriler silinemez.' });
        }
        console.error('❌ Clear content error:', error);
        res.status(500).json({ error: 'Tüm veriler silinemedi.' });
    }
};
