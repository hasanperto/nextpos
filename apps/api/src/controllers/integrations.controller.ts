import { Request, Response } from 'express';
import { withTenant } from '../lib/db.js';
import { isTenantModuleEnabled } from '../services/billing.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

export const handleIncomingCall = async (req: Request, res: Response) => {
    try {
        const { tenant, key } = req.query;
        const { number, name } = req.body;

        if (!tenant || !number) {
            return res.status(400).json({ error: 'Tenant ID ve numara zorunludur' });
        }

        const tenantId = String(tenant);
        const apiKey = String(key || '');

        // Özel "DEMO" anahtarı veya geliştirme ortamı için esneklik
        const isDemo = apiKey === 'DEMO' || apiKey === 'ANAHTAR-YOK';

        const enabled = await isTenantModuleEnabled(tenantId, 'caller_id_android');
        if (!enabled) {
            return res.status(403).json({ error: 'Bu özellik mevcut paketinizde aktif değil.' });
        }

        await withTenant(tenantId, async (connection) => {
            const [branchRows]: any = await connection.query(
                "SELECT settings FROM branches WHERE id = 1"
            );
            
            const settings = branchRows?.[0]?.settings || {};
            const callerIdSettings = settings.callerId || {};

            // API Anahtarı doğrulaması (Eğer demo değilse)
            if (!isDemo && callerIdSettings.androidKey !== apiKey) {
                return res.status(403).json({ error: 'Geçersiz API Anahtarı' });
            }

            const [customerRows]: any = await connection.query(
                "SELECT id, name, address FROM customers WHERE phone LIKE ?",
                [`%${String(number).slice(-10)}%`]
            );

            const customer = customerRows[0] || null;

            const io = req.app.get('io');
            console.log(`📞 Çağrı bildirildi: ${number} (Tenant: ${tenantId})`);

            if (io) {
                // 1. Kiracı Bildirimi (Kasiyer Ekranı)
                io.to(`tenant:${tenantId}`).emit('INCOMING_CALL', {
                    number,
                    name: customer ? customer.name : (name || 'Bilinmeyen Numara'),
                    customerId: customer ? customer.id : null,
                    address: customer ? customer.address : null,
                    timestamp: new Date().toISOString()
                });

                // 2. SaaS Bildirimleri (Global & Bayi)
                const [[tRow]]: any = await connection.query(
                    "SELECT name, reseller_id FROM tenants WHERE id = ?", 
                    [tenantId]
                );
                
                const feedPayload = {
                    id: Date.now(),
                    type: 'call',
                    tenantId,
                    resellerId: tRow?.reseller_id || null,
                    tenantName: tRow?.name || tenantId,
                    number: String(number).replace(/(\d{3})(\d{3})(\d{4})/, '$1***$3'), // Gizlilik
                    timestamp: new Date().toISOString()
                };

                // Süper Admin'e gönder
                io.to('room:saas_admin').emit('GLOBAL_LIVE_FEED', feedPayload);

                // Eğer bayi varsa, ilgili bayi odasına da gönder
                if (tRow?.reseller_id) {
                    io.to(`reseller:${tRow.reseller_id}`).emit('GLOBAL_LIVE_FEED', feedPayload);
                }
            }
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('❌ Caller ID error:', error.message);
        const status = error.name === 'TenantError' ? 404 : 500;
        res.status(status).json({ 
            error: error.name === 'TenantError' ? 'Geçersiz Tenant ID' : 'Çağrı işlenemedi',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

type BotSession = {
    step:
        | 'HOME'
        | 'ORDER_SERVICE'
        | 'REGISTER_NAME'
        | 'ADDRESS'
        | 'ORDER_ENTRY'
        | 'CONFIRM'
        | 'SUGGESTIONS'
        | 'MENU_CATEGORIES'
        | 'MENU_PRODUCTS'
        | 'TRACK';
    categoryPage: number;
    productPage: number;
    categoryId: number | null;
    cart: { productId: number; name: string; qty: number; unitPrice: number }[];
    suggestions: { id: number; name: string; price: number }[];
    confirm?: {
        total: number;
        serviceLabel: string;
        addressLine?: string;
        lines: string[];
    };
    customerId: number | null;
    customerName: string | null;
    serviceType: 'takeaway' | 'delivery' | null;
    address: string | null;
    lastOrderId: number | null;
};

function asText(v: unknown): string {
    return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function normalizeMsg(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}

function parseIndex(text: string): number | null {
    const m = text.trim().match(/^(\d{1,3})$/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return n;
}

async function ensureWhatsAppSessionsTable(connection: any): Promise<void> {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            phone TEXT PRIMARY KEY,
            state JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function loadSession(connection: any, phone: string): Promise<BotSession> {
    await ensureWhatsAppSessionsTable(connection);
    const [rows]: any = await connection.query(`SELECT state FROM whatsapp_sessions WHERE phone = ? LIMIT 1`, [phone]);
    const raw = rows?.[0]?.state;
    const st: Partial<BotSession> = (typeof raw === 'string' ? JSON.parse(raw) : raw) || {};
    return {
        step:
            st.step === 'ORDER_SERVICE' ||
            st.step === 'REGISTER_NAME' ||
            st.step === 'ADDRESS' ||
            st.step === 'ORDER_ENTRY' ||
            st.step === 'CONFIRM' ||
            st.step === 'SUGGESTIONS' ||
            st.step === 'MENU_CATEGORIES' ||
            st.step === 'MENU_PRODUCTS' ||
            st.step === 'TRACK'
                ? st.step
                : 'HOME',
        categoryPage: Number.isFinite(Number(st.categoryPage)) ? Number(st.categoryPage) : 1,
        productPage: Number.isFinite(Number(st.productPage)) ? Number(st.productPage) : 1,
        categoryId: Number.isFinite(Number(st.categoryId)) ? Number(st.categoryId) : null,
        cart: Array.isArray(st.cart) ? (st.cart as any[]) : [],
        suggestions: Array.isArray(st.suggestions) ? (st.suggestions as any[]) : [],
        confirm: st.confirm && typeof st.confirm === 'object' ? (st.confirm as any) : undefined,
        customerId: Number.isFinite(Number(st.customerId)) ? Number(st.customerId) : null,
        customerName: typeof st.customerName === 'string' ? st.customerName : null,
        serviceType: st.serviceType === 'delivery' || st.serviceType === 'takeaway' ? st.serviceType : null,
        address: typeof st.address === 'string' ? st.address : null,
        lastOrderId: Number.isFinite(Number(st.lastOrderId)) ? Number(st.lastOrderId) : null,
    };
}

async function saveSession(connection: any, phone: string, next: BotSession): Promise<void> {
    await ensureWhatsAppSessionsTable(connection);
    await connection.query(
        `INSERT INTO whatsapp_sessions (phone, state, updated_at)
         VALUES (?, ?::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (phone) DO UPDATE SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP`,
        [phone, JSON.stringify(next)]
    );
}

async function listCategories(connection: any): Promise<{ id: number; name: string }[]> {
    const [rows]: any = await connection.query(
        `SELECT id, name
         FROM categories
         WHERE is_active = true
         ORDER BY sort_order ASC, id ASC`
    );
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({ id: Number(r.id), name: String(r.name) }));
}

async function listProductsByCategory(connection: any, categoryId: number): Promise<{ id: number; name: string; price: number }[]> {
    const [rows]: any = await connection.query(
        `SELECT id, name, base_price
         FROM products
         WHERE is_active = true AND category_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [categoryId]
    );
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        id: Number(r.id),
        name: String(r.name),
        price: Number(r.base_price || 0),
    }));
}

function renderHome(): string {
    return [
        'Merhaba 👋',
        '',
        'Ne yapmak istersiniz?',
        '1) Sipariş Ver',
        '2) Sipariş Sorgula',
        '3) Canlı Destek',
        '',
        'Lütfen 1, 2 veya 3 yazın.',
    ].join('\n');
}

function renderServiceType(): string {
    return [
        'Teslim şekli seçin:',
        '',
        '1) Gel-Al',
        '2) Paket',
        '',
        '0) Ana Menü',
    ].join('\n');
}

function renderOrderEntry(session: BotSession): string {
    const who = session.customerName ? `Hoş geldin ${session.customerName} 👋` : 'Sipariş akışı';
    const svc = session.serviceType === 'delivery' ? 'Paket' : 'Gel-Al';
    return [
        who,
        '',
        `Servis: ${svc}`,
        '',
        'Sipariş Ver:',
        '1) Öneri',
        '2) Menü',
        '9) Sepet',
        '8) Onayla',
        '0) Ana Menü',
    ].join('\n');
}

function renderSuggestions(list: { id: number; name: string; price: number }[]): string {
    const lines = list.map((p, i) => `${i + 1}) ${p.name} — ${Number(p.price).toFixed(2)}€`);
    return [
        'Öneriler:',
        '',
        ...lines,
        '',
        'Seçmek için 1-5 yazın',
        'Sepet: 9',
        'Menü: 2',
        '0) Sipariş ekranı',
    ].join('\n');
}

function renderConfirm(confirm: NonNullable<BotSession['confirm']>): string {
    return [
        'Onaylıyor musunuz?',
        '',
        `Servis: ${confirm.serviceLabel}`,
        confirm.addressLine || '',
        '',
        ...confirm.lines,
        '',
        `Toplam: ${confirm.total.toFixed(2)}€`,
        '',
        '1) Onayla',
        '2) İptal',
        '0) Sipariş ekranı',
    ].filter(Boolean).join('\n');
}

function generateOrderNo(): string {
    const n = Date.now();
    const suffix = String(n).slice(-6);
    return `WA${suffix}`;
}

function renderCategories(cats: { id: number; name: string }[], page: number): { text: string; pageCats: { id: number; name: string }[] } {
    const pageSize = 9;
    const p = Math.max(1, page);
    const start = (p - 1) * pageSize;
    const pageCats = cats.slice(start, start + pageSize);
    const lines = pageCats.map((c, i) => `${i + 1}) ${c.name}`);
    const hasPrev = p > 1;
    const hasNext = start + pageSize < cats.length;
    const nav: string[] = [];
    if (hasPrev) nav.push('98) Önceki');
    if (hasNext) nav.push('99) Sonraki');
    nav.push('0) Ana Menü');

    return {
        pageCats,
        text: ['Menü → Kategori seçin:', '', ...lines, '', ...nav].join('\n'),
    };
}

function renderProducts(products: { id: number; name: string; price: number }[], page: number): { text: string; pageProducts: { id: number; name: string; price: number }[] } {
    const pageSize = 9;
    const p = Math.max(1, page);
    const start = (p - 1) * pageSize;
    const pageProducts = products.slice(start, start + pageSize);
    const lines = pageProducts.map((x, i) => `${i + 1}) ${x.name} — ${Number(x.price).toFixed(2)}€`);
    const hasPrev = p > 1;
    const hasNext = start + pageSize < products.length;
    const nav: string[] = [];
    if (hasPrev) nav.push('98) Önceki');
    if (hasNext) nav.push('99) Sonraki');
    nav.push('0) Kategoriler');

    return {
        pageProducts,
        text: ['Ürünler → seçim yapın:', '', ...lines, '', ...nav].join('\n'),
    };
}

function addToCart(cart: BotSession['cart'], p: { id: number; name: string; price: number }): BotSession['cart'] {
    const next = [...cart];
    const i = next.findIndex((x) => Number(x.productId) === Number(p.id));
    if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + 1 };
    else next.push({ productId: p.id, name: p.name, qty: 1, unitPrice: p.price });
    return next;
}

function cartSummary(cart: BotSession['cart']): string {
    if (!cart.length) return 'Sepet boş.';
    const lines = cart.map((x) => `${x.qty}x ${x.name}`);
    const total = cart.reduce((a, x) => a + Number(x.unitPrice) * Number(x.qty), 0);
    return ['Sepet:', ...lines, '', `Ara Toplam: ${total.toFixed(2)}€`].join('\n');
}

async function findCustomerByPhone(connection: any, phone: string): Promise<{ id: number; name: string | null; address: string | null } | null> {
    const last10 = phone.slice(-10);
    const [rows]: any = await connection.query(
        `SELECT id, name, address
         FROM customers
         WHERE phone LIKE ?
         ORDER BY id DESC
         LIMIT 1`,
        [`%${last10}%`]
    );
    const c = rows?.[0];
    if (!c) return null;
    return { id: Number(c.id), name: c.name ? String(c.name) : null, address: c.address ? String(c.address) : null };
}

function isGreeting(text: string): boolean {
    const t = text.toLowerCase();
    return t === 'selam' || t === 'merhaba' || t === 's.a' || t === 'sa' || t.includes('selam') || t.includes('merhaba');
}

async function botHandleMessage(args: {
    connection: any;
    phone: string;
    message: string;
    tenantId: string;
    io?: any;
}): Promise<string> {
    const { connection, phone, tenantId, io, message } = args;
    const text = normalizeMsg(message).toLowerCase();
    const rawIndex = parseIndex(text);

    let session = await loadSession(connection, phone);

    if (!session.customerId) {
        try {
            const c = await findCustomerByPhone(connection, phone);
            if (c) {
                session = {
                    ...session,
                    customerId: c.id,
                    customerName: c.name,
                    address: c.address,
                };
            }
        } catch {
            /* ignore */
        }
    }

    if (text === '0') {
        const next: BotSession = {
            ...session,
            step: 'HOME',
            categoryId: null,
            categoryPage: 1,
            productPage: 1,
        };
        await saveSession(connection, phone, next);
        return renderHome();
    }

    if (isGreeting(text) || text === 'start') {
        const next: BotSession = { ...session, step: 'HOME' };
        await saveSession(connection, phone, next);
        return renderHome();
    }

    if (text === '00' || text === 'menu' || text === 'menü') {
        const next: BotSession = { ...session, step: 'MENU_CATEGORIES', categoryPage: 1, productPage: 1, categoryId: null };
        const cats = await listCategories(connection);
        const { text: out } = renderCategories(cats, next.categoryPage);
        await saveSession(connection, phone, next);
        return out;
    }

    if (session.step === 'HOME') {
        if (rawIndex === 1 || text.includes('sipariş') || text.includes('siparis')) {
            const next: BotSession = { ...session, step: 'ORDER_SERVICE' };
            await saveSession(connection, phone, next);
            return renderServiceType();
        }
        if (rawIndex === 2 || text.includes('sorgu') || text.includes('takip')) {
            const next: BotSession = { ...session, step: 'TRACK' };
            await saveSession(connection, phone, next);
            return ['Sipariş numaranızı yazın. Örn: 1024', '', '0) Ana Menü'].join('\n');
        }
        if (rawIndex === 3 || text.includes('destek')) {
            return ['Canlı destek yakında.', '', '0) Ana Menü'].join('\n');
        }
        return renderHome();
    }

    if (session.step === 'TRACK') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'HOME' };
            await saveSession(connection, phone, next);
            return renderHome();
        }
        const id = Number(String(text).replace(/\D/g, ''));
        if (!Number.isFinite(id) || id <= 0) {
            return ['Sipariş numarası geçersiz. Örn: 1024', '', '0) Ana Menü'].join('\n');
        }
        try {
            const [rows]: any = await connection.query(
                `SELECT id, status, order_type, total_amount, created_at
                 FROM orders
                 WHERE id = ?
                 LIMIT 1`,
                [id]
            );
            const o = rows?.[0];
            if (!o) return ['Sipariş bulunamadı.', '', '0) Ana Menü'].join('\n');
            const status = String(o.status || 'unknown');
            const total = Number(o.total_amount || 0).toFixed(2);
            const ot = String(o.order_type || '');
            return [
                `Sipariş #${id}`,
                `Durum: ${status}`,
                `Tip: ${ot}`,
                `Toplam: ${total}€`,
                '',
                '0) Ana Menü',
            ].join('\n');
        } catch {
            return ['Sorgulama şu anda yapılamadı.', '', '0) Ana Menü'].join('\n');
        }
    }

    if (session.step === 'ORDER_SERVICE') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'HOME' };
            await saveSession(connection, phone, next);
            return renderHome();
        }
        if (rawIndex === 1 || text.includes('gel')) {
            const next: BotSession = { ...session, serviceType: 'takeaway', step: session.customerName ? 'ORDER_ENTRY' : 'REGISTER_NAME' };
            await saveSession(connection, phone, next);
            if (next.step === 'REGISTER_NAME') return ['Ad Soyad yazın:', '', '0) Ana Menü'].join('\n');
            return renderOrderEntry(next);
        }
        if (rawIndex === 2 || text.includes('paket')) {
            const next: BotSession = { ...session, serviceType: 'delivery', step: session.customerName ? 'ADDRESS' : 'REGISTER_NAME' };
            await saveSession(connection, phone, next);
            if (next.step === 'REGISTER_NAME') return ['Ad Soyad yazın:', '', '0) Ana Menü'].join('\n');
            return ['Teslimat adresinizi yazın:', '', `Kayıtlı adres: ${next.address || '-'}`, '', '0) Ana Menü'].join('\n');
        }
        return renderServiceType();
    }

    if (session.step === 'REGISTER_NAME') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'HOME' };
            await saveSession(connection, phone, next);
            return renderHome();
        }
        const name = normalizeMsg(message);
        if (name.length < 2) return ['Ad Soyad yazın:', '', '0) Ana Menü'].join('\n');
        const next: BotSession = { ...session, customerName: name, step: session.serviceType === 'delivery' ? 'ADDRESS' : 'ORDER_ENTRY' };
        await saveSession(connection, phone, next);
        if (next.step === 'ADDRESS') {
            return ['Teslimat adresinizi yazın:', '', `Kayıtlı adres: ${next.address || '-'}`, '', '0) Ana Menü'].join('\n');
        }
        return renderOrderEntry(next);
    }

    if (session.step === 'ADDRESS') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'HOME' };
            await saveSession(connection, phone, next);
            return renderHome();
        }
        const addr = normalizeMsg(message);
        if (addr.length < 6) return ['Adres çok kısa. Lütfen tam adres yazın:', '', '0) Ana Menü'].join('\n');
        const next: BotSession = { ...session, address: addr, step: 'ORDER_ENTRY' };
        await saveSession(connection, phone, next);
        return renderOrderEntry(next);
    }

    if (session.step === 'ORDER_ENTRY') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'HOME' };
            await saveSession(connection, phone, next);
            return renderHome();
        }
        if (rawIndex === 1 || text.includes('öner') || text.includes('oneri')) {
            const [rows]: any = await connection.query(
                `SELECT id, name, base_price FROM products WHERE is_active = true ORDER BY random() LIMIT 5`
            );
            const suggestions = (Array.isArray(rows) ? rows : []).map((r: any) => ({
                id: Number(r.id),
                name: String(r.name),
                price: Number(r.base_price || 0),
            }));
            const next: BotSession = { ...session, step: 'SUGGESTIONS', suggestions };
            await saveSession(connection, phone, next);
            return renderSuggestions(next.suggestions);
        }
        if (rawIndex === 2 || text.includes('menü') || text.includes('menu')) {
            const next: BotSession = { ...session, step: 'MENU_CATEGORIES', categoryPage: 1, productPage: 1, categoryId: null };
            const cats = await listCategories(connection);
            const { text: out } = renderCategories(cats, next.categoryPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex === 9) {
            return [cartSummary(session.cart), '', '8) Onayla', '2) Menü', '0) Ana Menü'].join('\n');
        }
        if (rawIndex === 8) {
            if (!session.cart.length) return ['Sepet boş. Önce ürün ekleyin.', '', '2) Menü', '0) Ana Menü'].join('\n');
            const total = session.cart.reduce((a, x) => a + Number(x.unitPrice) * Number(x.qty), 0);
            const svc = session.serviceType === 'delivery' ? 'Paket' : 'Gel-Al';
            const addr = session.serviceType === 'delivery' ? `Adres: ${session.address || '-'}` : undefined;
            const lines = session.cart.map((x) => `${x.qty}x ${x.name}`);
            const confirm = { total: Math.round(total * 100) / 100, serviceLabel: svc, addressLine: addr, lines };
            const next: BotSession = { ...session, step: 'CONFIRM', confirm };
            await saveSession(connection, phone, next);
            return renderConfirm(confirm);
        }
        return renderOrderEntry(session);
    }

    if (session.step === 'CONFIRM') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'ORDER_ENTRY', confirm: undefined };
            await saveSession(connection, phone, next);
            return renderOrderEntry(next);
        }
        if (rawIndex === 2) {
            const next: BotSession = { ...session, step: 'ORDER_ENTRY', confirm: undefined };
            await saveSession(connection, phone, next);
            return ['Sipariş iptal edildi.', '', renderOrderEntry(next)].join('\n');
        }
        if (rawIndex === 1) {
            if (!session.cart.length) {
                const next: BotSession = { ...session, step: 'ORDER_ENTRY', confirm: undefined };
                await saveSession(connection, phone, next);
                return ['Sepet boş. Önce ürün ekleyin.', '', renderOrderEntry(next)].join('\n');
            }
            const total = session.cart.reduce((a, x) => a + Number(x.unitPrice) * Number(x.qty), 0);
            const orderNo = generateOrderNo();
            const payload = {
                id: orderNo,
                orderNo,
                phone: `+${phone}`,
                customerName: session.customerName || 'WhatsApp Müşterisi',
                total: Math.round(total * 100) / 100,
                receivedAt: new Date().toISOString(),
                items: session.cart.map((x) => ({ name: x.name, price: x.unitPrice, quantity: x.qty })),
                address: session.serviceType === 'delivery' ? session.address : null,
                note: session.serviceType === 'delivery' ? 'Paket siparişi' : 'Gel-Al siparişi',
                order_type: session.serviceType === 'delivery' ? 'delivery' : 'takeaway',
            };
            if (io) io.to(`tenant:${tenantId}`).emit('customer:whatsapp_order', payload);
            const next: BotSession = { ...session, cart: [], step: 'HOME', confirm: undefined, lastOrderId: Date.now() };
            await saveSession(connection, phone, next);
            return [
                'Siparişiniz alındı ✅',
                `Sipariş No: ${orderNo}`,
                'Kasaya iletildi.',
                '',
                '0) Ana Menü',
            ].join('\n');
        }
        if (session.confirm) return renderConfirm(session.confirm);
        const next: BotSession = { ...session, step: 'ORDER_ENTRY' };
        await saveSession(connection, phone, next);
        return renderOrderEntry(next);
    }

    if (session.step === 'SUGGESTIONS') {
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'ORDER_ENTRY' };
            await saveSession(connection, phone, next);
            return renderOrderEntry(next);
        }
        if (rawIndex === 2) {
            const next: BotSession = { ...session, step: 'MENU_CATEGORIES', categoryPage: 1, productPage: 1, categoryId: null };
            const cats = await listCategories(connection);
            const { text: out } = renderCategories(cats, next.categoryPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex === 9) {
            return [cartSummary(session.cart), '', '8) Onayla', '2) Menü', '0) Sipariş ekranı'].join('\n');
        }
        if (rawIndex != null && rawIndex >= 1 && rawIndex <= 5) {
            const picked = session.suggestions[rawIndex - 1];
            if (!picked) return renderSuggestions(session.suggestions);
            const next: BotSession = { ...session, cart: addToCart(session.cart, picked) };
            await saveSession(connection, phone, next);
            return ['Sepete eklendi ✅', `${picked.name}`, '', 'Başka seçim: 1-5', 'Sepet: 9', '0) Sipariş ekranı'].join('\n');
        }
        return renderSuggestions(session.suggestions);
    }

    if (session.step === 'MENU_CATEGORIES') {
        const cats = await listCategories(connection);
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'ORDER_ENTRY', categoryId: null, productPage: 1, categoryPage: 1 };
            await saveSession(connection, phone, next);
            return renderOrderEntry(next);
        }
        if (rawIndex === 98) {
            const next: BotSession = { ...session, categoryPage: Math.max(1, session.categoryPage - 1) };
            const { text: out } = renderCategories(cats, next.categoryPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex === 99) {
            const next: BotSession = { ...session, categoryPage: session.categoryPage + 1 };
            const { text: out } = renderCategories(cats, next.categoryPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex != null && rawIndex >= 1 && rawIndex <= 9) {
            const { pageCats } = renderCategories(cats, session.categoryPage);
            const picked = pageCats[rawIndex - 1];
            if (!picked) return renderCategories(cats, session.categoryPage).text;
            const next: BotSession = { ...session, step: 'MENU_PRODUCTS', categoryId: picked.id, productPage: 1 };
            const prods = await listProductsByCategory(connection, picked.id);
            const { text: out } = renderProducts(prods, next.productPage);
            await saveSession(connection, phone, next);
            return out;
        }
        return renderCategories(cats, session.categoryPage).text;
    }

    if (session.step === 'MENU_PRODUCTS') {
        if (!session.categoryId) {
            const next: BotSession = { ...session, step: 'MENU_CATEGORIES', categoryId: null, productPage: 1 };
            const cats = await listCategories(connection);
            const { text: out } = renderCategories(cats, next.categoryPage);
            await saveSession(connection, phone, next);
            return out;
        }

        const prods = await listProductsByCategory(connection, session.categoryId);
        if (rawIndex === 0) {
            const next: BotSession = { ...session, step: 'MENU_CATEGORIES', categoryId: null, productPage: 1 };
            const cats = await listCategories(connection);
            const { text: out } = renderCategories(cats, next.categoryPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex === 98) {
            const next: BotSession = { ...session, productPage: Math.max(1, session.productPage - 1) };
            const { text: out } = renderProducts(prods, next.productPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex === 99) {
            const next: BotSession = { ...session, productPage: session.productPage + 1 };
            const { text: out } = renderProducts(prods, next.productPage);
            await saveSession(connection, phone, next);
            return out;
        }
        if (rawIndex === 9) {
            const next: BotSession = { ...session };
            await saveSession(connection, phone, next);
            return [cartSummary(next.cart), '', '8) Onayla', '0) Kategoriler'].join('\n');
        }
        if (rawIndex === 8) {
            const next: BotSession = { ...session, step: 'ORDER_ENTRY' };
            await saveSession(connection, phone, next);
            return renderOrderEntry(next);
        }
        if (rawIndex != null && rawIndex >= 1 && rawIndex <= 9) {
            const { pageProducts } = renderProducts(prods, session.productPage);
            const picked = pageProducts[rawIndex - 1];
            if (!picked) return renderProducts(prods, session.productPage).text;
            const next: BotSession = { ...session, cart: addToCart(session.cart, picked) };
            await saveSession(connection, phone, next);
            return ['Sepete eklendi ✅', `${picked.name}`, '', 'Devam: başka ürün no', 'Sepet: 9', 'Kategoriler: 0', 'Sipariş ekranı: 8'].join('\n');
        }
        return renderProducts(prods, session.productPage).text + '\n\nSepet: 9\nSipariş ekranı: 8';
    }

    return renderHome();
}

function parseWhatsAppIncoming(body: any): { from: string; text: string } | null {
    if (body && typeof body.from === 'string' && typeof body.text === 'string') {
        return { from: body.from, text: body.text };
    }
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    const from = msg?.from;
    const text = msg?.text?.body;
    if (typeof from === 'string' && typeof text === 'string') return { from, text };
    return null;
}

export const verifyWhatsAppWebhook = async (req: Request, res: Response) => {
    const mode = asText(req.query['hub.mode']);
    const token = asText(req.query['hub.verify_token']);
    const challenge = asText(req.query['hub.challenge']);
    const expected = asText(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
    if (mode === 'subscribe' && token && expected && token === expected) {
        return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verify token invalid' });
};

export const handleWhatsAppWebhook = async (req: Request, res: Response) => {
    try {
        const { tenant, key } = req.query;
        if (!tenant) return res.status(400).json({ error: 'Tenant ID zorunludur' });
        const tenantId = String(tenant);
        const apiKey = String(key || '');
        const isDemo = apiKey === 'DEMO' || apiKey === 'ANAHTAR-YOK';

        const incoming = parseWhatsAppIncoming(req.body);
        if (!incoming) return res.status(200).json({ ok: true });
        const phone = incoming.from.replace(/\D/g, '');
        const message = incoming.text;

        await withTenant(tenantId, async (connection) => {
            const [branchRows]: any = await connection.query(`SELECT settings FROM branches WHERE id = 1`);
            const settings = branchRows?.[0]?.settings || {};
            const integrations = settings.integrations || {};
            const wa = integrations.whatsapp || {};

            if (!wa.enabled) return;
            if (!isDemo) {
                const expectedKey = String(wa.webhookKey || '').trim();
                if (!expectedKey) return;
                if (expectedKey !== apiKey) return;
            }

            const reply = await botHandleMessage({
                connection,
                phone,
                message,
                tenantId,
                io: req.app.get('io'),
            });
            await WhatsAppService.sendTextMessage({
                tenantId,
                to: phone,
                message: reply,
                settings: {
                    enabled: Boolean(wa.enabled),
                    phoneNumber: String(wa.phoneNumber || ''),
                    phoneNumberId: String(wa.phoneNumberId || ''),
                    apiKey: String(wa.apiKey || ''),
                },
            });
        });

        return res.json({ ok: true });
    } catch (error: any) {
        console.error('handleWhatsAppWebhook', error);
        return res.status(500).json({
            error: 'WhatsApp webhook işlenemedi',
            details: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
        });
    }
};

export const simulateWhatsAppBotHandler = async (req: any, res: Response) => {
    try {
        const tenantId = String(req.body?.tenantId || req.tenantId || req.user?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ error: 'Tenant ID zorunludur' });

        const phoneRaw = String(req.body?.phone || '+491620001122');
        const phone = phoneRaw.replace(/\D/g, '').slice(0, 20);
        const text = String(req.body?.text || '').trim();
        if (!text) return res.status(400).json({ error: 'Mesaj boş olamaz' });

        const reply = await withTenant(tenantId, async (connection) => {
            return botHandleMessage({ connection, phone, message: text, tenantId, io: req.app.get('io') });
        });

        return res.json({ ok: true, phone, text, reply });
    } catch (error: any) {
        console.error('simulateWhatsAppBotHandler', error);
        return res.status(500).json({
            error: 'Simülasyon başarısız',
            detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
        });
    }
};
