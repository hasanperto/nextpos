import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import {
    printKitchenTicket,
    printReceiptTicket,
    reprintKitchenTicket,
    reprintReceiptTicket,
    shouldAutoPrintKitchen,
    shouldPrintReceiptOnPayment,
    shouldPrintReceiptOnSessionClose,
    type KitchenTicketSnapshot,
    type ReceiptTicketSnapshot,
} from '../lib/posPrint';
import {
    isOfflineNow,
    loadCategoriesCache,
    loadModifiersCache,
    loadProductsCache,
    loadTablesCache,
    notifyOfflineCacheOnce,
    saveCategoriesCache,
    saveModifiersCache,
    saveProductsCache,
    saveTablesCache,
} from '../lib/menuCache';
import { enqueuePendingSync, shouldQueueOfflineError } from '../lib/syncQueueClient';
import { useAuthStore } from './useAuthStore';
import { useUIStore } from './useUIStore';

interface PosCategory {
    id: number;
    name: string;
    displayName: string;
    icon: string;
}

export interface PosProductVariant {
    id: number;
    name: string;
    displayName: string;
    price: string;
    isDefault: boolean;
}

export interface PosProduct {
    id: number;
    categoryId: number;
    name: string;
    displayName: string;
    basePrice: string;
    imageUrl?: string;
    variants: PosProductVariant[];
    /** Ürüne atanmış modifikatörler (API `menu/products`) */
    modifiers?: PosModifier[];
}

interface CartItem {
    cartId: string;
    product: PosProduct;
    variant: PosProductVariant | null;
    modifiers: PosModifier[];
    qty: number;
    price: number;
    notes: string;
}

export interface PosModifier {
    id: number;
    name: string;
    displayName: string;
    price: string;
    category: string;
}

interface Order {
    id: string;
    /** API `orders.id` (örn. ödeme / mutfak eşlemesi) */
    remoteId?: number;
    sessionId?: number;
    items: CartItem[];
    total: number;
    orderType: 'dine_in' | 'takeaway' | 'delivery';
    status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
    customerName?: string;
    tableNumber?: string;
    createdAt: Date;
}

function mapApiOrderStatus(s: string | undefined): Order['status'] {
    switch (String(s || '').toLowerCase()) {
        case 'confirmed':
        case 'preparing':
            return 'preparing';
        case 'ready':
            return 'ready';
        case 'served':
        case 'completed':
            return 'delivered';
        case 'cancelled':
            return 'cancelled';
        default:
            return 'pending';
    }
}

/** Sepette ürün adlarını katalog ile zenginleştirir (API sadece isim döndüğünde) */
function enrichCartItemsWithCatalog(items: CartItem[], products: PosProduct[]): CartItem[] {
    return items.map((item) => {
        const p = products.find((pr) => pr.id === item.product.id);
        if (!p) return item;
        return {
            ...item,
            product: {
                ...item.product,
                name: p.name,
                displayName: p.displayName || item.product.displayName,
                basePrice: p.basePrice,
                categoryId: p.categoryId,
                variants: p.variants?.length ? p.variants : item.product.variants,
            },
        };
    });
}

function mapApiItemsToCart(raw: unknown): CartItem[] {
    let arr: unknown = raw;
    if (typeof raw === 'string') {
        try {
            arr = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(arr)) return [];
    return arr.map((oi: Record<string, unknown>, idx: number) => ({
        cartId: `api-${oi.id ?? idx}`,
        product: {
            id: Number(oi.product_id) || 0,
            categoryId: 0,
            name: '',
            displayName: String(oi.product_name ?? oi.name ?? 'Ürün'),
            basePrice: '0',
            variants: [],
        },
        variant: oi.variant_name
            ? {
                  id: 0,
                  name: '',
                  displayName: String(oi.variant_name),
                  price: '0',
                  isDefault: false,
              }
            : null,
        modifiers: [] as PosModifier[],
        qty: Number(oi.quantity) || 1,
        price: Number(oi.unit_price ?? oi.price) || 0,
        notes: String(oi.notes ?? ''),
    }));
}

function mapApiRowToOrder(row: Record<string, unknown>): Order {
    const id = Number(row.id);
    const items = mapApiItemsToCart(row.items);
    const total = parseFloat(String(row.total_amount ?? 0));
    const ot = String(row.order_type || 'dine_in');
    const orderType: Order['orderType'] =
        ot === 'web'
            ? 'takeaway'
            : ot === 'takeaway' || ot === 'delivery' || ot === 'dine_in'
              ? ot
              : 'dine_in';
    const tableName = row.table_name ? String(row.table_name) : undefined;
    const nameRaw = row.customer_name ? String(row.customer_name) : row.delivery_phone ? String(row.delivery_phone) : '';
    return {
        id: `ORD-${id}`,
        remoteId: id,
        sessionId: Number(row.session_id) || undefined,
        items,
        total,
        orderType,
        status: mapApiOrderStatus(String(row.status)),
        customerName: nameRaw || `Sipariş #${id}`,
        tableNumber: tableName,
        createdAt: new Date(String(row.created_at || Date.now())),
    };
}

export interface CashierTableInfo {
    id: number;
    name: string;
    translations?: Record<string, string>;
    section_name?: string;
    capacity?: number;
    active_session_id?: number | null;
    status?: string;
    opened_at?: string;
    total_amount?: number;
    guest_count?: number;
    guest_name?: string;
    customer_name?: string;
    shape?: string;
    position_x?: number;
    position_y?: number;
}

export interface SelectedTableInfo {
    id: number;
    name: string;
    translations?: Record<string, string>;
    sectionName: string;
    /** Açık oturum varsa sipariş bu oturuma bağlanır */
    sessionId?: number | null;
    /** Offline açılışta veya senkron grubunda kullanılır */
    clientSessionId?: string | null;
    customerName?: string;
    guestName?: string;
    guestCount?: number;
}

interface PosState {
    // ═══ GLOBAL ═══
    lang: string;
    setLang: (lang: string) => void;
    branchId: number;
    settings: any | null;
    fetchSettings: () => Promise<void>;

    /** Kasiyer: kat planı ↔ ürün kataloğu */
    cashierView: 'floor' | 'menu';
    setCashierView: (v: 'floor' | 'menu') => void;
    tables: CashierTableInfo[];
    fetchTables: () => Promise<void>;
    /** Boş masa için oturum açar; API `POST /tables/:id/open` — dolu masada mevcut session döner */
    openTableSession: (tableId: number, guestCount?: number, customerId?: number | null) => Promise<{ sessionId: number } | null>;
    selectedTable: SelectedTableInfo | null;
    setSelectedTable: (t: SelectedTableInfo | null) => void;

    // ═══ MENÜ ═══
    categories: PosCategory[];
    products: PosProduct[];
    modifiers: PosModifier[];
    activeCategoryId: number | null;
    isLoading: boolean;

    fetchCategories: () => Promise<void>;
    fetchProducts: () => Promise<void>;
    fetchModifiers: () => Promise<void>;
    setActiveCategory: (id: number) => void;

    occupiedTableCount: () => number;

    // ═══ ADİSYON / SEPET ═══
    cart: CartItem[];
    orderType: 'dine_in' | 'takeaway' | 'delivery';
    setOrderType: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
    addToCart: (product: PosProduct, variant?: PosProductVariant | null, mods?: PosModifier[]) => void;
    removeFromCart: (cartId: string) => void;
    updateQty: (cartId: string, qty: number) => void;
    updateCartItem: (cartId: string, variant: PosProductVariant | null, mods?: PosModifier[]) => void;
    clearCart: () => void;

    // ═══ KUPON & KAMPANYA ═══
    appliedCoupon: {
        code: string;
        discount_amount: number;
        discount_type: 'percent' | 'fixed' | 'free_item' | 'free_delivery';
        description: string;
    } | null;
    couponInput: string;
    setCouponInput: (code: string) => void;
    validateCoupon: (code: string, orderAmount: number, customerId?: number, orderType?: string, cartItems?: any[]) => Promise<{ valid: boolean; error?: string; discount_amount?: number; description?: string }>;
    applyCoupon: (code: string) => Promise<void>;
    removeCoupon: () => void;
    /** Sepette kullanılacak sadakat puanı (10 puan ≈ 1 birim tutar indirimi; API ile aynı) */
    loyaltyRedeemPoints: number;
    setLoyaltyRedeemPoints: (n: number) => void;

    // ═══ SİPARİŞLER (MUTFAK) ═══
    orders: Order[];
    createOrder: (customerName?: string, tableNumber?: string) => void;
    /** Sepeti API'ye gönderir; başarıda sepeti temizler */
    submitRemoteOrder: (ctx: {
        activeCustomer?: { id?: number; name?: string; phone?: string; address?: string; reward_points?: number } | null;
        takeawayPhone?: string;
        courierId?: number;
        paymentMethodArrival?: 'cash' | 'card' | 'online';
        notes?: string;
    }) => Promise<{ ok: boolean; error?: string; queuedOffline?: boolean; orderId?: number; sessionId?: number }>;
    /** Sipariş + tam ödeme (nakit/kart) — tek akış */
    submitOrderAndPay: (
        method: 'cash' | 'card',
        ctx: {
            activeCustomer?: { id?: number; name?: string; phone?: string; address?: string; reward_points?: number } | null;
            takeawayPhone?: string;
            courierId?: number;
            receivedAmount?: number;
        },
        skipSimulation?: boolean
    ) => Promise<{ ok: boolean; error?: string; queuedOffline?: boolean; simulated?: boolean; orderId?: number; sessionId?: number }>;
    updateOrderStatus: (
        orderId: string,
        status: Order['status'],
        pinCode?: string
    ) => Promise<{ ok: boolean; error?: string; needsPin?: boolean }>;
    /** Mevcut siparişi sepete yükler; gel-al ödemesi için checkoutTargetRemoteId set eder */
    loadOrderToCart: (orderId: string, externalOrder?: any) => Promise<boolean>;
    /** Gel-al kasada ödeme: yeni POST /checkout yerine mevcut siparişe ödeme */
    checkoutTargetRemoteId: number | null;
    addFakeReadyOrder: () => void;

    getCartTotal: () => {
        subtotal: number;
        tax: number;
        total: number;
        coupon_discount: number;
        loyalty_discount: number;
        final_total: number;
    };

    fetchOrders: () => Promise<void>;
    splitBill: (sessionId: number, items: { orderItemId: number; quantity: number }[], payment: { method: string; tipAmount?: number; receivedAmount?: number }) => Promise<{ ok: boolean; error?: string }>;
    checkoutSession: (sessionId: number, payment: { method: string; tipAmount?: number; receivedAmount?: number }, skipSimulation?: boolean) => Promise<{ ok: boolean; error?: string; simulated?: boolean }>;
    /** GET /users/couriers — paket kurye seçimi */
    couriers: { id: number; name: string }[];
    fetchCouriers: () => Promise<void>;
    
    /** Parçalı ödeme: Bir seanstaki bakiyenin bir kısmını kapatır */
    submitSessionPayment: (sessionId: number, amount: number, method: string, notes?: string, tipAmount?: number) => Promise<{ ok: boolean; error?: string; sessionClosed?: boolean }>;
    /** Ürün transferi: Bir masadaki ürünü başka bir masaya taşır */
    transferTableItem: (orderItemId: number, quantity: number, targetTableId: number) => Promise<{ ok: boolean; error?: string }>;
    /** Masayı / Oturumu tamamen iptal eder */
    cancelTableSession: (tableId: number) => Promise<{ ok: boolean; error?: string }>;

    /** Son yazdırılan mutfak / adisyon (yeniden yazdır) */
    lastKitchenSnapshot: KitchenTicketSnapshot | null;
    lastReceiptSnapshot: ReceiptTicketSnapshot | null;
    reprintLastKitchenTicket: () => void;
    reprintLastReceipt: () => void;

    /** Masa başındaki yetkili bilgisini yerel state'de tutar (real-time sync) */
    tablePresence: Record<number, string | null>;
    setTablePresence: (tableId: number, waiterName: string | null) => void;
}

export const usePosStore = create<PosState>()(
    persist(
        (set, get) => ({
            lang: 'tr',
            branchId: 1,
            settings: null,
            fetchSettings: async () => {
                try {
                    const res = await fetch('/api/v1/sync/settings', {
                        headers: useAuthStore.getState().getAuthHeaders()
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const raw = String(data?.language ?? 'tr').toLowerCase();
                        const posLang = raw === 'de' ? 'de' : raw === 'en' ? 'en' : 'tr';
                        set({ settings: data });
                        if (get().lang !== posLang) {
                            get().setLang(posLang);
                        }
                    }
                } catch (e) {
                    console.error('Settings fetch error:', e);
                }
            },
            orderType: 'dine_in',
            setOrderType: (type) => {
                if (type !== 'dine_in') {
                    // Takeaway/Delivery → masayı bırak, sepeti koru, menüye geç (Hızlı Satış)
                    set({ orderType: type, selectedTable: null, cashierView: 'menu', checkoutTargetRemoteId: null });
                } else {
                    // Masa → Kat planına geç
                    set({ orderType: type, cashierView: 'floor', checkoutTargetRemoteId: null });
                }
            },

            cashierView: 'menu',
            setCashierView: (v) => set({ cashierView: v }),
            tables: [],
            selectedTable: null,
            setSelectedTable: (t) => set({ selectedTable: t }),

            fetchTables: async () => {
                const applyCachedTables = async (): Promise<boolean> => {
                    const cached = await loadTablesCache();
                    if (cached === null) return false;
                    set({ tables: cached as CashierTableInfo[] });
                    notifyOfflineCacheOnce();
                    return true;
                };

                if (isOfflineNow()) {
                    const ok = await applyCachedTables();
                    if (!ok) set({ tables: [] });
                    return;
                }

                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch('/api/v1/tables', { headers });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return;
                    }
                    if (!res.ok) throw new Error(String(res.status));
                    const data = await res.json();
                    const tables = Array.isArray(data) ? data : [];
                    set({ tables });
                    void saveTablesCache(tables);
                } catch (e) {
                    console.error('Masalar yüklenemedi:', e);
                    if (e instanceof Error && e.message.includes('Oturum')) {
                        set({ tables: [] });
                        return;
                    }
                    const ok = await applyCachedTables();
                    if (!ok) set({ tables: [] });
                }
            },

            openTableSession: async (tableId, guestCount = 1, customerId = null) => {
                const clientSessionId = crypto.randomUUID();
                
                if (isOfflineNow()) {
                    // Masayı yerel olarak 'occupied' gösterip bir clientSessionId atıyoruz
                    const tables = get().tables.map(t => t.id === tableId ? { ...t, active_session_id: -1, status: 'occupied' } : t);
                    set({ tables });
                    return { sessionId: -1, clientSessionId };
                }

                try {
                    const headers = {
                        ...useAuthStore.getState().getAuthHeaders(),
                        'Content-Type': 'application/json',
                    };
                    const res = await fetch(`/api/v1/tables/${tableId}/open`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ guestCount, customerId, clientSessionId }),
                    });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return null;
                    }
                    if (!res.ok) return null;
                    const data = (await res.json()) as { id?: number };
                    const sid = data?.id;
                    if (sid == null) return null;
                    await get().fetchTables();
                    const sessionId = Number(sid);
                    get().setSelectedTable({
                        id: tableId,
                        name: get().tables.find(t => t.id === tableId)?.name || '',
                        translations: get().tables.find(t => t.id === tableId)?.translations || {},
                        sectionName: get().tables.find(t => t.id === tableId)?.section_name || '',
                        sessionId,
                        clientSessionId,
                    });
                    return { sessionId, clientSessionId };
                } catch (e) {
                    console.error('Masa açma (offline fallback?):', e);
                    if (shouldQueueOfflineError(e)) {
                         const tables = get().tables.map(t => t.id === tableId ? { ...t, active_session_id: -1, status: 'occupied' } : t);
                         set({ tables });
                         return { sessionId: -1, clientSessionId };
                    }
                    return null;
                }
            },

            occupiedTableCount: () => {
                const { tables } = get();
                return tables.filter(
                    (t) => t.active_session_id != null && Number(t.active_session_id) !== 0
                ).length;
            },

            categories: [],
            products: [],
            modifiers: [],
            activeCategoryId: null,
            isLoading: false,

            setLang: (lang) => {
                set({ lang });
                // Dil değiştiğinde verileri tekrar çek
                get().fetchCategories();
                get().fetchProducts();
                get().fetchModifiers();
            },

            fetchCategories: async () => {
                set({ isLoading: true });
                const lang = get().lang;

                const applyCached = async (): Promise<boolean> => {
                    const cached = await loadCategoriesCache(lang);
                    if (cached === null) return false;
                    set({ categories: cached as PosCategory[], isLoading: false });
                    if (cached.length > 0 && !get().activeCategoryId) {
                        set({ activeCategoryId: (cached[0] as PosCategory).id });
                    }
                    notifyOfflineCacheOnce();
                    return true;
                };

                if (isOfflineNow()) {
                    const ok = await applyCached();
                    if (!ok) set({ categories: [], isLoading: false });
                    return;
                }

                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch(`/api/v1/menu/categories?lang=${lang}`, { headers });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        throw new Error('Oturum süresi dolmuş');
                    }
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    const categories = Array.isArray(data) ? data : [];
                    set({ categories, isLoading: false });
                    void saveCategoriesCache(lang, categories);

                    if (categories.length > 0 && !get().activeCategoryId) {
                        set({ activeCategoryId: categories[0].id });
                    }
                } catch (error) {
                    console.error('Kategoriler çekilemedi:', error);
                    if (error instanceof Error && error.message.includes('Oturum')) {
                        set({ categories: [], isLoading: false });
                        return;
                    }
                    const ok = await applyCached();
                    if (!ok) set({ categories: [], isLoading: false });
                }
            },

            fetchProducts: async () => {
                set({ isLoading: true });
                const lang = get().lang;

                const applyCached = async (): Promise<boolean> => {
                    const cached = await loadProductsCache(lang);
                    if (cached === null) return false;
                    set({ products: cached as PosProduct[], isLoading: false });
                    notifyOfflineCacheOnce();
                    return true;
                };

                if (isOfflineNow()) {
                    const ok = await applyCached();
                    if (!ok) set({ products: [], isLoading: false });
                    return;
                }

                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch(`/api/v1/menu/products?lang=${lang}`, { headers });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        throw new Error('Oturum süresi dolmuş');
                    }
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    const products = Array.isArray(data) ? data : [];
                    set({ products, isLoading: false });
                    void saveProductsCache(lang, products);
                } catch (error) {
                    console.error('Ürünler çekilemedi:', error);
                    if (error instanceof Error && error.message.includes('Oturum')) {
                        set({ products: [], isLoading: false });
                        return;
                    }
                    const ok = await applyCached();
                    if (!ok) set({ products: [], isLoading: false });
                }
            },

            fetchModifiers: async () => {
                const lang = get().lang;

                const applyCached = async (): Promise<boolean> => {
                    const cached = await loadModifiersCache(lang);
                    if (cached === null) return false;
                    set({ modifiers: cached as PosModifier[] });
                    notifyOfflineCacheOnce();
                    return true;
                };

                if (isOfflineNow()) {
                    const ok = await applyCached();
                    if (!ok) set({ modifiers: [] });
                    return;
                }

                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch(`/api/v1/menu/modifiers?lang=${lang}`, { headers });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        throw new Error('Oturum süresi dolmuş');
                    }
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    const modifiers = Array.isArray(data) ? data : [];
                    set({ modifiers });
                    void saveModifiersCache(lang, modifiers);
                } catch (error) {
                    console.error('Modifikatörler çekilemedi:', error);
                    if (error instanceof Error && error.message.includes('Oturum')) {
                        set({ modifiers: [] });
                        return;
                    }
                    const ok = await applyCached();
                    if (!ok) set({ modifiers: [] });
                }
            },

            setActiveCategory: (id) => set({ activeCategoryId: id }),

            // ═══ ADİSYON FONKSİYONLARI ═══
            cart: [],
            checkoutTargetRemoteId: null as number | null,

            addToCart: (product, variant, mods = []) => {
                const { cart } = get();

                let basePrice = variant ? Number(variant.price) : Number(product.basePrice);
                let modsTotal = mods.reduce((sum, m) => sum + Number(m.price), 0);
                const finalPrice = basePrice + modsTotal;

                // Modifikatör adlarını notlara çevir
                let allNotes = [];
                if (variant) allNotes.push(variant.displayName);
                mods.forEach(m => allNotes.push(m.displayName));

                const noteStr = allNotes.join(', ');

                const modsIdStr = mods.map(m => m.id).sort().join('-');
                const cartId = `${product.id}-${variant?.id || 'base'}-${modsIdStr}-${Date.now()}`;

                const newItem: CartItem = {
                    cartId,
                    product,
                    variant: variant || null,
                    modifiers: mods,
                    qty: 1,
                    price: finalPrice,
                    notes: noteStr,
                };
                set({ cart: [...cart, newItem], checkoutTargetRemoteId: null });
            },

            removeFromCart: (cartId) => {
                set({ cart: get().cart.filter((i) => i.cartId !== cartId), checkoutTargetRemoteId: null });
            },

            updateQty: (cartId, qty) => {
                if (qty <= 0) {
                    get().removeFromCart(cartId);
                    return;
                }
                set({
                    cart: get().cart.map((i) => (i.cartId === cartId ? { ...i, qty } : i)),
                    checkoutTargetRemoteId: null,
                });
            },

            updateCartItem: (cartId: string, variant: PosProductVariant | null, mods: PosModifier[] = []) => {
                const { cart } = get();
                const itemIndex = cart.findIndex(i => i.cartId === cartId);
                if (itemIndex === -1) return;

                const item = cart[itemIndex];
                let basePrice = variant ? Number(variant.price) : Number(item.product.basePrice);
                let modsTotal = mods.reduce((sum, m) => sum + Number(m.price), 0);
                const finalPrice = basePrice + modsTotal;

                let allNotes = [];
                if (variant) allNotes.push(variant.displayName);
                mods.forEach(m => allNotes.push(m.displayName));
                const noteStr = allNotes.join(', ');

                const updatedCart = [...cart];
                updatedCart[itemIndex] = {
                    ...item,
                    variant: variant || null,
                    modifiers: mods,
                    price: finalPrice,
                    notes: noteStr
                };
                set({ cart: updatedCart, checkoutTargetRemoteId: null });
            },

            clearCart: () =>
                set({ cart: [], checkoutTargetRemoteId: null, appliedCoupon: null, couponInput: '', loyaltyRedeemPoints: 0 }),

            // ═══ KUPON & KAMPANYA ═══
            appliedCoupon: null,
            couponInput: '',

            setCouponInput: (code) => set({ couponInput: code }),

            validateCoupon: async (code, orderAmount, customerId, orderType, cartItems) => {
                if (!code.trim()) return { valid: false, error: 'Kupon kodu girin' };
                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch('/api/v1/coupons/validate', {
                        method: 'POST',
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, order_amount: orderAmount, customer_id: customerId, order_type: orderType, cart_items: cartItems }),
                    });
                    const data = await res.json();
                    return data;
                } catch {
                    return { valid: false, error: 'Bağlantı hatası' };
                }
            },

            applyCoupon: async (code) => {
                const { validateCoupon, cart, orderType } = get();
                const activeCustomer = useUIStore.getState().activeCustomer;
                const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
                const customerId =
                    typeof activeCustomer?.id === 'number' ? activeCustomer.id : undefined;

                const cartItemsData = cart.map(item => ({
                    product_id: item.product.id,
                    category_id: item.product.categoryId,
                    price: item.price,
                    quantity: item.qty
                }));

                const result = await validateCoupon(code, total, customerId, orderType, cartItemsData);
                if (result.valid && result.discount_amount !== undefined) {
                    set({
                        appliedCoupon: {
                            code,
                            discount_amount: result.discount_amount,
                            discount_type: 'percent',
                            description: result.description || `${code} kuponu`,
                        },
                        couponInput: '',
                    });
                    toast.success(result.description || 'Kupon uygulandı');
                } else {
                    toast.error(result.error || 'Kupon geçersiz');
                }
            },

            removeCoupon: () => set({ appliedCoupon: null, couponInput: '' }),

            loyaltyRedeemPoints: 0,
            setLoyaltyRedeemPoints: (n) => set({ loyaltyRedeemPoints: Math.max(0, Math.floor(Number(n) || 0)) }),

            // ═══ SİPARİŞ FONKSİYONLARI ═══
            orders: [],

            createOrder: (customerName, tableNumber) => {
                const { cart, orderType, getCartTotal, orders } = get();
                if (cart.length === 0) return;

                const newOrder: Order = {
                    id: `ORD-${Date.now()}`,
                    items: [...cart],
                    total: getCartTotal().total,
                    orderType,
                    status: 'pending',
                    customerName,
                    tableNumber,
                    createdAt: new Date(),
                };

                set({
                    orders: [newOrder, ...orders],
                    cart: []
                });
            },

            submitRemoteOrder: async (ctx) => {
                const { cart, orderType, getCartTotal, orders, selectedTable } = get();
                if (cart.length === 0) {
                    return { ok: false, error: 'Sepet boş' };
                }

                if (orderType === 'dine_in' && !selectedTable) {
                    // Masada değilse ve masa seçili değilse otomatik Gel-Al (Hızlı Satış) moduna geç
                    set({ orderType: 'takeaway' });
                }

                if (orderType === 'takeaway') {
                    // Kasiyer için telefon opsiyonel hale getirildi (Hızlı Satış)
                }

                if (orderType === 'delivery') {
                    const phone = ctx.activeCustomer?.phone?.trim();
                    const addr = ctx.activeCustomer?.address?.trim();
                    if (!phone || !addr) {
                        return { ok: false, error: 'Paket için müşteri telefon ve adres gerekli' };
                    }
                }

                const items = cart.map((item) => ({
                    productId: item.product.id,
                    variantId: item.variant?.id,
                    quantity: item.qty,
                    unitPrice: item.price,
                    modifiers: item.modifiers.map((m) => ({
                        id: m.id,
                        name: m.name,
                        price: m.price,
                    })),
                    notes: item.notes || undefined,
                }));

                const deliveryPhone =
                    orderType === 'delivery'
                        ? ctx.activeCustomer?.phone || undefined
                        : orderType === 'takeaway'
                          ? ctx.takeawayPhone?.trim() || ctx.activeCustomer?.phone?.trim()
                          : undefined;

                const body: Record<string, unknown> = {
                    orderType,
                    source: 'cashier',
                    isUrgent: false,
                    items,
                    tableId: orderType === 'dine_in' ? selectedTable?.id : undefined,
                    sessionId:
                        orderType === 'dine_in' && selectedTable?.sessionId && Number(selectedTable.sessionId) > 0
                            ? Number(selectedTable.sessionId)
                            : undefined,
                    deliveryAddress:
                        orderType === 'delivery' ? ctx.activeCustomer?.address?.trim() : undefined,
                    deliveryPhone,
                    customerName: ctx.activeCustomer?.name || undefined,
                    clientSessionId: selectedTable?.clientSessionId || undefined,
                    courierId:
                        orderType === 'delivery' &&
                        ctx.courierId != null &&
                        Number.isFinite(Number(ctx.courierId))
                            ? Number(ctx.courierId)
                            : undefined,
                    paymentMethodArrival: ctx.paymentMethodArrival || 'cash',
                    notes: ctx.notes || undefined,
                    customerId: typeof ctx.activeCustomer?.id === 'number' ? ctx.activeCustomer.id : undefined,
                    loyaltyPointsToRedeem:
                        get().loyaltyRedeemPoints > 0 ? get().loyaltyRedeemPoints : undefined,
                };

                try {
                    const headers = {
                        ...useAuthStore.getState().getAuthHeaders(),
                        'Content-Type': 'application/json',
                    };
                    const res = await fetch('/api/v1/orders', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(body),
                    });

                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }

                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        const err = (data as { error?: string })?.error || `Sunucu hatası (${res.status})`;
                        return { ok: false, error: err };
                    }

                    const oid = (data as { id?: number })?.id;
                    const cartSnapshot = [...cart];
                    const tableForPrint = selectedTable;
                    const newOrder: Order = {
                        id: oid != null ? `ORD-${oid}` : `ORD-${Date.now()}`,
                        remoteId: oid != null ? oid : undefined,
                        items: [...cart],
                        total: getCartTotal().final_total,
                        orderType,
                        status: 'pending',
                        customerName: ctx.activeCustomer?.name,
                        tableNumber:
                            orderType === 'dine_in' && tableForPrint
                                ? `${tableForPrint.name} (${tableForPrint.sectionName})`
                                : undefined,
                        createdAt: new Date(),
                    };

                    set({
                        orders: [newOrder, ...orders],
                        cart: [],
                        selectedTable: null,
                        cashierView: 'floor',
                        loyaltyRedeemPoints: 0,
                    });

                    await get().fetchTables();
                    await get().fetchOrders();

                    if (oid != null) {
                        const st = get().settings;
                        if (st && shouldAutoPrintKitchen(st)) {
                            const otLabel =
                                orderType === 'dine_in' ? 'Masa' : orderType === 'takeaway' ? 'Gel-Al' : 'Paket';
                            const snap: KitchenTicketSnapshot = {
                                restaurantName: String(st.name || 'Restoran'),
                                orderId: oid,
                                tableLabel:
                                    orderType === 'dine_in' && tableForPrint
                                        ? `${tableForPrint.name} (${tableForPrint.sectionName})`
                                        : undefined,
                                orderTypeLabel: otLabel,
                                lines: cartSnapshot.map((ci) => ({
                                    name: `${ci.product.name}${ci.variant ? ` (${ci.variant.name})` : ''}`,
                                    qty: ci.qty,
                                    notes: ci.notes || undefined,
                                })),
                                orderNotes: ctx.notes,
                            };
                            printKitchenTicket({ settings: st, ...snap });
                            set({ lastKitchenSnapshot: snap });
                        }
                    }

                    return { ok: true, orderId: oid as number, sessionId: (body.sessionId as number) || undefined };
                } catch (e) {
                    console.error(e);
                    if (shouldQueueOfflineError(e)) {
                        try {
                            await enqueuePendingSync('pos_order', body);
                            set({ cart: [], loyaltyRedeemPoints: 0 });
                            try {
                                await get().fetchTables();
                            } catch {
                                /* çevrimdışı */
                            }
                            return { ok: true, queuedOffline: true };
                        } catch (qe) {
                            console.error(qe);
                        }
                    }
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },

            submitOrderAndPay: async (method, ctx, skipSimulation = false) => {
                const { cart, orderType, getCartTotal, orders, selectedTable, settings, checkoutTargetRemoteId } = get();

                /** Teslim ekranından yüklenen hazır gel-al: mevcut siparişe ödeme (yeni mutfak fişi yok) */
                if (checkoutTargetRemoteId != null && orderType === 'takeaway') {
                    if (method === 'card' && settings?.integrations?.payment?.simulationMode && !skipSimulation) {
                        const { setPaymentSimulation } = useUIStore.getState();
                        const total = getCartTotal().final_total;
                        setPaymentSimulation({
                            isOpen: true,
                            amount: total,
                            status: 'connecting',
                            method: settings.integrations.payment.provider,
                            onComplete: () => get().submitOrderAndPay(method, ctx, true),
                        });
                        return { ok: true, simulated: true };
                    }

                    const cartTotal = getCartTotal().final_total;
                    const headers = {
                        ...useAuthStore.getState().getAuthHeaders(),
                        'Content-Type': 'application/json',
                    };
                    try {
                        const res = await fetch(`/api/v1/orders/${checkoutTargetRemoteId}/pay-takeaway`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                payment: {
                                    method,
                                    tipAmount: 0,
                                    ...(method === 'cash' ? { receivedAmount: ctx.receivedAmount ?? cartTotal } : {}),
                                },
                            }),
                        });
                        if (res.status === 401) {
                            useAuthStore.getState().logout();
                            return { ok: false, error: 'Oturum süresi doldu' };
                        }
                        const pack = res.ok ? await res.json().catch(() => ({})) : null;
                        if (!res.ok) {
                            const err = (pack as { error?: string })?.error || `HTTP ${res.status}`;
                            return { ok: false, error: err };
                        }
                        set({
                            cart: [],
                            checkoutTargetRemoteId: null,
                            selectedTable: null,
                            cashierView: 'floor',
                        });
                        await get().fetchOrders();
                        await get().fetchTables();
                        return { ok: true, orderId: checkoutTargetRemoteId };
                    } catch (e) {
                        console.error(e);
                        return { ok: false, error: 'Bağlantı hatası' };
                    }
                }

                // Kredi kartı simülasyon kontrolü
                if (method === 'card' && settings?.integrations?.payment?.simulationMode && !skipSimulation) {
                    const { setPaymentSimulation } = useUIStore.getState();
                    const total = getCartTotal().final_total;
                    
                    setPaymentSimulation({ 
                        isOpen: true, 
                        amount: total, 
                        status: 'connecting', 
                        method: settings.integrations.payment.provider,
                        onComplete: () => get().submitOrderAndPay(method, ctx, true)
                    });
                    return { ok: true, simulated: true };
                }

                if (cart.length === 0) {
                    // Eğer sepet boş ama aktif bir masa/session varsa, tüm masayı kapatmaya çalış
                    if (orderType === 'dine_in' && selectedTable?.sessionId) {
                        return get().checkoutSession(Number(selectedTable.sessionId), { method });
                    }
                    return { ok: false, error: 'Sepet boş' };
                }

                if (orderType === 'dine_in' && !selectedTable) {
                    // Masada değilse ve masa seçili değilse otomatik Gel-Al (Hızlı Satış) moduna geç
                    set({ orderType: 'takeaway' });
                }

                if (orderType === 'takeaway') {
                    // Kasiyer için telefon opsiyonel hale getirildi (Hızlı Satış)
                }

                if (orderType === 'delivery') {
                    const phone = ctx.activeCustomer?.phone?.trim();
                    const addr = ctx.activeCustomer?.address?.trim();
                    if (!phone || !addr) {
                        return { ok: false, error: 'Paket için müşteri telefon ve adres gerekli' };
                    }
                }

                const items = cart.map((item) => ({
                    productId: item.product.id,
                    variantId: item.variant?.id,
                    quantity: item.qty,
                    unitPrice: item.price,
                    modifiers: item.modifiers.map((m) => ({
                        id: m.id,
                        name: m.name,
                        price: m.price,
                    })),
                    notes: item.notes || undefined,
                }));

                const deliveryPhone =
                    orderType === 'delivery'
                        ? ctx.activeCustomer?.phone || undefined
                        : orderType === 'takeaway'
                          ? ctx.takeawayPhone?.trim() || ctx.activeCustomer?.phone?.trim()
                          : undefined;

                const body: Record<string, unknown> = {
                    orderType,
                    source: 'cashier',
                    isUrgent: false,
                    items,
                    tableId: orderType === 'dine_in' ? selectedTable?.id : undefined,
                    sessionId:
                        orderType === 'dine_in' && selectedTable?.sessionId
                            ? Number(selectedTable.sessionId)
                            : undefined,
                    deliveryAddress:
                        orderType === 'delivery' ? ctx.activeCustomer?.address?.trim() : undefined,
                    deliveryPhone,
                    customerName: ctx.activeCustomer?.name || undefined,
                    clientSessionId: selectedTable?.clientSessionId || undefined,
                    courierId:
                        orderType === 'delivery' &&
                        ctx.courierId != null &&
                        Number.isFinite(Number(ctx.courierId))
                            ? Number(ctx.courierId)
                            : undefined,
                    customerId: typeof ctx.activeCustomer?.id === 'number' ? ctx.activeCustomer.id : undefined,
                    loyaltyPointsToRedeem:
                        get().loyaltyRedeemPoints > 0 ? get().loyaltyRedeemPoints : undefined,
                };

                // Eğer sessionId -1 (offline açılmış masa) ise, sunucuya sessionId göndermiyoruz (clientSessionId üzerinden seans açacak)
                if (body.sessionId === -1) delete body.sessionId;

                const headers = {
                    ...useAuthStore.getState().getAuthHeaders(),
                    'Content-Type': 'application/json',
                };

                const cartTotal = getCartTotal().final_total;

                const checkoutPayload: Record<string, unknown> = {
                    ...body,
                    payment: {
                        method,
                        tipAmount: 0,
                        ...(method === 'cash' ? { receivedAmount: ctx.receivedAmount ?? cartTotal } : {}),
                    },
                };

                try {
                    const resCheckout = await fetch('/api/v1/orders/checkout', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(checkoutPayload),
                    });

                    if (resCheckout.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }

                    const pack = resCheckout.ok ? await resCheckout.json().catch(() => ({})) : null;
                    if (!resCheckout.ok) {
                        const err = (pack as { error?: string })?.error || `HTTP ${resCheckout.status}`;
                        return { ok: false, error: err };
                    }

                    const orderData = (pack as { order?: { id?: number } })?.order;
                    const oid = orderData?.id;
                    if (oid == null) {
                        return { ok: false, error: 'Sipariş yanıtı geçersiz' };
                    }

                    const cartSnapshot = [...cart];
                    const tableForReceipt = selectedTable;
                    const totals = getCartTotal();

                    const newOrder: Order = {
                        id: `ORD-${oid}`,
                        remoteId: oid,
                        items: [...cart],
                        total: totals.final_total,
                        orderType,
                        status: 'delivered',
                        customerName: ctx.activeCustomer?.name,
                        tableNumber:
                            orderType === 'dine_in' && tableForReceipt
                                ? `${tableForReceipt.name} (${tableForReceipt.sectionName})`
                                : undefined,
                        createdAt: new Date(),
                    };

                    set({
                        orders: [newOrder, ...orders],
                        cart: [],
                        selectedTable: null,
                        cashierView: 'floor',
                        loyaltyRedeemPoints: 0,
                    });

                    await get().fetchTables();
                    await get().fetchOrders();

                    const stAfter = get().settings;
                    if (stAfter && shouldPrintReceiptOnPayment(stAfter)) {
                        const lineTotals = cartSnapshot.map((ci) => {
                            const modSum = ci.modifiers.reduce((a, m) => a + Number(m.price || 0), 0);
                            return {
                                name: `${ci.product.name}${ci.variant ? ` (${ci.variant.name})` : ''}`,
                                qty: ci.qty,
                                lineTotal: (ci.price + modSum) * ci.qty,
                            };
                        });
                        const snap: ReceiptTicketSnapshot = {
                            restaurantName: String(stAfter.name || 'Restoran'),
                            address: stAfter.address,
                            phone: stAfter.phone,
                            orderId: oid,
                            orderType,
                            tableLabel:
                                orderType === 'dine_in' && tableForReceipt
                                    ? `${tableForReceipt.name} (${tableForReceipt.sectionName})`
                                    : undefined,
                            methodLabel: method === 'cash' ? 'Nakit' : 'Kart',
                            lines: lineTotals,
                            total: totals.final_total,
                            currency: stAfter.currency || 'EUR',
                            header: stAfter.receipt?.header,
                            footer: stAfter.receipt?.footer,
                        };
                        printReceiptTicket({ settings: stAfter, ...snap });
                        set({ lastReceiptSnapshot: snap });
                    }

                    return { ok: true, orderId: oid as number, sessionId: (body.sessionId as number) || undefined };
                } catch (e) {
                    console.error(e);
                    if (shouldQueueOfflineError(e)) {
                        try {
                            await enqueuePendingSync('pos_checkout', checkoutPayload);
                            set({ cart: [], loyaltyRedeemPoints: 0 });
                            try {
                                await get().fetchTables();
                            } catch {
                                /* çevrimdışı */
                            }
                            return { ok: true, queuedOffline: true };
                        } catch (qe) {
                            console.error(qe);
                        }
                    }
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },

            updateOrderStatus: async (orderId, status, pinCode) => {
                const prev = get().orders.find((x) => x.id === orderId);
                const rid = prev?.remoteId;

                const toApiStatus = (s: Order['status']): string =>
                    s === 'delivered'
                        ? 'completed'
                        : s === 'cancelled'
                          ? 'cancelled'
                          : s === 'ready'
                            ? 'ready'
                            : s === 'preparing'
                              ? 'preparing'
                              : 'pending';

                /** İptal: önce API (PIN gerekebilir), başarıda yerel güncelle */
                if (status === 'cancelled' && rid != null) {
                    try {
                        const body: Record<string, unknown> = {
                            status: 'cancelled',
                        };
                        if (pinCode && pinCode.trim()) body.pinCode = pinCode.trim();

                        const res = await fetch(`/api/v1/orders/${rid}/status`, {
                            method: 'PATCH',
                            headers: {
                                ...useAuthStore.getState().getAuthHeaders(),
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(body),
                        });
                        const j = (await res.json().catch(() => ({}))) as {
                            error?: string;
                            code?: string;
                        };

                        if (res.status === 403 && j.code === 'PIN_REQUIRED') {
                            return { ok: false, needsPin: true };
                        }
                        if (res.status === 403 && j.code === 'INVALID_PIN') {
                            return { ok: false, error: j.error || 'Geçersiz PIN' };
                        }
                        if (!res.ok) {
                            return { ok: false, error: j.error || 'İptal edilemedi' };
                        }

                        set({
                            orders: get().orders.map((o) =>
                                o.id === orderId ? { ...o, status: 'cancelled' } : o
                            ),
                        });
                        await get().fetchOrders();
                        return { ok: true };
                    } catch {
                        await get().fetchOrders();
                        return { ok: false, error: 'Bağlantı hatası' };
                    }
                }

                if (status === 'cancelled' && rid == null) {
                    set({
                        orders: get().orders.map((o) =>
                            o.id === orderId ? { ...o, status: 'cancelled' } : o
                        ),
                    });
                    return { ok: true };
                }

                set({
                    orders: get().orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
                });

                if (rid == null) return { ok: true };

                const apiStatus = toApiStatus(status);
                try {
                    const res = await fetch(`/api/v1/orders/${rid}/status`, {
                        method: 'PATCH',
                        headers: {
                            ...useAuthStore.getState().getAuthHeaders(),
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ status: apiStatus }),
                    });
                    const j = (await res.json().catch(() => ({}))) as { error?: string };
                    if (!res.ok) {
                        await get().fetchOrders();
                        return { ok: false, error: j.error || 'Durum güncellenemedi' };
                    }
                    await get().fetchOrders();
                    return { ok: true };
                } catch {
                    await get().fetchOrders();
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },

            loadOrderToCart: async (orderId, externalOrder) => {
                await get().fetchOrders();
                const { orders, tables, products } = get();

                let order = orders.find((o) => o.id === orderId || o.remoteId === Number(orderId));

                if (!order && externalOrder) {
                    const numericId = Number(String(externalOrder.id || '').replace('ORD-', '').replace(/[^0-9]/g, ''));
                    order = orders.find((o) => o.id === `ORD-${numericId}` || o.remoteId === numericId);
                }

                if (!order && externalOrder) {
                    order = {
                        id: String(externalOrder.id || ''),
                        remoteId: Number(externalOrder.id) || undefined,
                        sessionId: undefined,
                        items: mapApiItemsToCart(externalOrder.items || []),
                        total: Number(externalOrder.total_amount || externalOrder.total || 0),
                        orderType: (externalOrder.order_type === 'delivery' ? 'delivery' : 'takeaway') as Order['orderType'],
                        status: mapApiOrderStatus(String(externalOrder.status || 'pending')),
                        customerName: String(externalOrder.customer_name || externalOrder.customerName || 'Müşteri'),
                        tableNumber: undefined,
                        createdAt: new Date(String(externalOrder.created_at || Date.now())),
                    };
                }

                if (!order) {
                    set({ checkoutTargetRemoteId: null });
                    return false;
                }

                let foundTable: SelectedTableInfo | null = null;
                if (order.orderType === 'dine_in' && order.sessionId) {
                    const tableRow = tables.find((t) => Number(t.active_session_id) === Number(order.sessionId));
                    if (tableRow) {
                        foundTable = {
                            id: tableRow.id,
                            name: tableRow.name,
                            sectionName: tableRow.section_name || '',
                            sessionId: tableRow.active_session_id,
                        };
                    }
                }

                const merged = enrichCartItemsWithCatalog([...order.items], products);
                const useExistingPay =
                    order.remoteId != null &&
                    order.orderType === 'takeaway' &&
                    order.status === 'ready';

                set({
                    cart: merged,
                    orderType: order.orderType,
                    selectedTable: foundTable,
                    cashierView: 'menu',
                    checkoutTargetRemoteId: useExistingPay ? order.remoteId! : null,
                });
                return true;
            },

            addFakeReadyOrder: () => {
                set((s) => {
                    const fakeOrder = {
                        id: `TEST-${Date.now()}`,
                        remoteId: Date.now(),
                        orderType: 'takeaway' as const,
                        status: 'ready' as const,
                        total: 15.5,
                        items: [],
                        createdAt: new Date(),
                        customerName: 'Tübingen Test User'
                    };
                    return { orders: [fakeOrder, ...s.orders] };
                });
            },

            getCartTotal: () => {
                const { cart, appliedCoupon, settings, loyaltyRedeemPoints } = get();
                const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
                // VAT oranı: API'den gelen taxRate veya %19 varsayılan
                const vatRate = (settings?.taxRate ?? 19) / 100;
                const subtotal = total / (1 + vatRate);
                const tax = total - subtotal;

                const coupon_discount = appliedCoupon?.discount_amount || 0;
                const afterCoupon = Math.max(0, total - coupon_discount);
                const loyalty_discount =
                    loyaltyRedeemPoints > 0 ? Math.min(afterCoupon, loyaltyRedeemPoints / 10) : 0;
                const final_total = Math.max(0, afterCoupon - loyalty_discount);

                return { subtotal, tax, total, coupon_discount, loyalty_discount, final_total };
            },

            couriers: [],
            fetchCouriers: async () => {
                if (isOfflineNow()) return;
                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch('/api/v1/users/couriers', { headers });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return;
                    }
                    if (!res.ok) return;
                    const data = (await res.json()) as { id: number; name: string }[];
                    const list = Array.isArray(data) ? data : [];
                    set({ couriers: list.map((c) => ({ id: c.id, name: c.name })) });
                } catch (e) {
                    console.error('Kuryeler yüklenemedi:', e);
                }
            },

            fetchOrders: async () => {
                if (isOfflineNow()) return;
                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch('/api/v1/orders?limit=80&offset=0', { headers });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return;
                    }
                    if (!res.ok) return;
                    const data = await res.json();
                    const rows = Array.isArray(data) ? data : [];
                    const mapped = rows.map((r) => mapApiRowToOrder(r as Record<string, unknown>));
                    set({ orders: mapped });
                } catch (e) {
                    console.error('Siparişler yüklenemedi:', e);
                }
            },
            splitBill: async (sessionId: number, items: { orderItemId: number; quantity: number }[], payment: any) => {
                const headers = {
                    ...useAuthStore.getState().getAuthHeaders(),
                    'Content-Type': 'application/json',
                };
                try {
                    const res = await fetch('/api/v1/orders/split-checkout', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ 
                            sessionId, 
                            items, 
                            payment,
                            loyaltyPointsToRedeem: get().loyaltyRedeemPoints > 0 ? get().loyaltyRedeemPoints : undefined
                        }),
                    });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }
                    const data = await res.json();
                    if (!res.ok) {
                        return { ok: false, error: data.error || 'Bölme hatası' };
                    }
                    // Verileri tazele
                    await get().fetchOrders();
                    await get().fetchTables();
                    
                    if (data.sessionClosed) {
                        set({ selectedTable: null, cashierView: 'floor' });
                    }
                    
                    return { ok: true };
                } catch (e) {
                    console.error(e);
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },
            checkoutSession: async (sessionId: number, payment: any, skipSimulation = false) => {
                const { settings } = get();
                if (payment.method === 'card' && settings?.integrations?.payment?.simulationMode && !skipSimulation) {
                    const { setPaymentSimulation } = useUIStore.getState();
                    const tables = get().tables;
                    const table = tables.find(t => Number(t.active_session_id) === Number(sessionId));
                    const amount = table?.total_amount || 0;
                    
                    setPaymentSimulation({ 
                        isOpen: true, 
                        amount: Number(amount), 
                        status: 'connecting', 
                        method: settings.integrations.payment.provider,
                        onComplete: () => get().checkoutSession(sessionId, payment, true)
                    });
                    return { ok: true, simulated: true };
                }

                const headers = {
                    ...useAuthStore.getState().getAuthHeaders(),
                    'Content-Type': 'application/json',
                };
                try {
                    const res = await fetch('/api/v1/orders/checkout-session', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ 
                            sessionId, 
                            payment,
                            loyaltyPointsToRedeem: get().loyaltyRedeemPoints > 0 ? get().loyaltyRedeemPoints : undefined
                        }),
                    });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }
                    const data = await res.json();
                    if (!res.ok) {
                        return { ok: false, error: data.error || 'Masa kapatma hatası' };
                    }

                    const stCs = get().settings;
                    const totalPaid = data.totalPaid != null ? Number(data.totalPaid) : NaN;
                    if (
                        stCs &&
                        shouldPrintReceiptOnSessionClose(stCs) &&
                        Number.isFinite(totalPaid) &&
                        totalPaid > 0
                    ) {
                        const tables = get().tables;
                        const table = tables.find((t) => Number(t.active_session_id) === Number(sessionId));
                        const snap: ReceiptTicketSnapshot = {
                            restaurantName: String(stCs.name || 'Restoran'),
                            address: stCs.address,
                            phone: stCs.phone,
                            orderId: Number(sessionId),
                            tableLabel: table ? String(table.name) : `Oturum #${sessionId}`,
                            methodLabel: payment.method === 'cash' ? 'Nakit' : 'Kart',
                            lines: [{ name: 'Masa hesabı (kapanış)', qty: 1, lineTotal: totalPaid }],
                            total: totalPaid,
                            currency: stCs.currency || 'EUR',
                            header: stCs.receipt?.header,
                            footer: stCs.receipt?.footer,
                        };
                        printReceiptTicket({ settings: stCs, ...snap });
                        set({ lastReceiptSnapshot: snap });
                    }
                    
                    // Başarılıysa verileri tazele ve kat planına dön
                    await get().fetchOrders();
                    await get().fetchTables();
                    
                    if (data.sessionClosed) {
                        set({ 
                            selectedTable: null, 
                            cashierView: 'floor',
                            cart: []
                        });
                    }
                    
                    return { ok: true };
                } catch (e) {
                    console.error(e);
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },
            submitSessionPayment: async (sessionId: number, amount: number, method: string, notes?: string, tipAmount?: number) => {
                const { getAuthHeaders } = useAuthStore.getState();
                try {
                    const res = await fetch(`/api/v1/payments/session/${sessionId}`, {
                        method: 'POST',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, amount, method, notes, tipAmount }),
                    });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }
                    const data = await res.json();
                    if (!res.ok) return { ok: false, error: data.error || 'Ödeme alınamadı' };
                    await get().fetchTables();
                    await get().fetchOrders();
                    return { ok: true, sessionClosed: data.sessionClosed };
                } catch (e) {
                    console.error(e);
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },
            transferTableItem: async (orderItemId: number, quantity: number, targetTableId: number) => {
                const { getAuthHeaders } = useAuthStore.getState();
                try {
                    const res = await fetch('/api/v1/tables/transfer-item', {
                        method: 'POST',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderItemId, quantity, targetTableId }),
                    });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }
                    if (!res.ok) {
                        const j = await res.json();
                        return { ok: false, error: j.error || 'Transfer başarısız' };
                    }
                    await get().fetchTables();
                    await get().fetchOrders();
                    return { ok: true };
                } catch (e) {
                    console.error(e);
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },
            cancelTableSession: async (tableId: number) => {
                const { getAuthHeaders } = useAuthStore.getState();
                try {
                    const res = await fetch(`/api/v1/tables/${tableId}/cancel`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                    });
                    if (res.status === 401) {
                        useAuthStore.getState().logout();
                        return { ok: false, error: 'Oturum süresi doldu' };
                    }
                    if (!res.ok) {
                        const j = await res.json();
                        return { ok: false, error: j.error || 'İptal başarısız' };
                    }
                    set({ selectedTable: null, cart: [] });
                    await get().fetchTables();
                    return { ok: true };
                } catch (e) {
                    console.error(e);
                    return { ok: false, error: 'Bağlantı hatası' };
                }
            },

            tablePresence: {},

            lastKitchenSnapshot: null,
            lastReceiptSnapshot: null,
            reprintLastKitchenTicket: () => {
                const st = get().settings;
                const snap = get().lastKitchenSnapshot;
                if (!st || !snap) return;
                const ps = st.integrations?.printStations;
                if (ps && ps.reprintKitchenEnabled === false) return;
                reprintKitchenTicket(st, snap);
            },
            reprintLastReceipt: () => {
                const st = get().settings;
                const snap = get().lastReceiptSnapshot;
                if (!st || !snap) return;
                const ps = st.integrations?.printStations;
                if (ps && ps.reprintReceiptEnabled === false) return;
                reprintReceiptTicket(st, snap);
            },

            setTablePresence: (tableId, waiterName) => {
                set((s) => ({
                    tablePresence: {
                        ...s.tablePresence,
                        [tableId]: waiterName
                    }
                }));
            },
        }),
        {
            name: 'nextpos-storage',
            partialize: (state) => {
                const {
                    orders: _orders,
                    tables: _tables,
                    checkoutTargetRemoteId: _co,
                    loyaltyRedeemPoints: _loy,
                    ...rest
                } = state;
                return { ...rest, tables: [], checkoutTargetRemoteId: null, loyaltyRedeemPoints: 0 };
            },
        }
    )
);
