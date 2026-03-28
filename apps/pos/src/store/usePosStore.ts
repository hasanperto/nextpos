import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';

interface PosCategory {
    id: number;
    name: string;
    displayName: string;
    icon: string;
}

interface PosProductVariant {
    id: number;
    name: string;
    displayName: string;
    price: string;
    isDefault: boolean;
}

interface PosProduct {
    id: number;
    categoryId: number;
    name: string;
    displayName: string;
    basePrice: string;
    imageUrl?: string;
    variants: PosProductVariant[];
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

interface PosModifier {
    id: number;
    name: string;
    displayName: string;
    price: string;
    category: string;
}

interface Order {
    id: string;
    items: CartItem[];
    total: number;
    orderType: 'dine_in' | 'takeaway' | 'delivery';
    status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
    customerName?: string;
    tableNumber?: string;
    createdAt: Date;
}

interface PosState {
    // ═══ GLOBAL ═══
    lang: string;
    setLang: (lang: string) => void;
    branchId: number; // Demo için şimdilik sabit

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

    // ═══ ADİSYON / SEPET ═══
    cart: CartItem[];
    orderType: 'dine_in' | 'takeaway' | 'delivery';
    setOrderType: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
    addToCart: (product: PosProduct, variant?: PosProductVariant | null, mods?: PosModifier[]) => void;
    removeFromCart: (cartId: string) => void;
    updateQty: (cartId: string, qty: number) => void;
    updateCartItem: (cartId: string, variant: PosProductVariant | null, mods?: PosModifier[]) => void;
    clearCart: () => void;

    // ═══ SİPARİŞLER (MUTFAK) ═══
    orders: Order[];
    createOrder: (customerName?: string, tableNumber?: string) => void;
    updateOrderStatus: (orderId: string, status: Order['status']) => void;
    loadOrderToCart: (orderId: string) => void;

    getCartTotal: () => { subtotal: number; tax: number; total: number };
}

export const usePosStore = create<PosState>()(
    persist(
        (set, get) => ({
            lang: 'tr',
            branchId: 1,
            orderType: 'dine_in',
            setOrderType: (type) => set({ orderType: type }),

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
                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch(`/api/v1/menu/categories?lang=${get().lang}`, { headers });
                    if (res.status === 401) { useAuthStore.getState().logout(); throw new Error('Oturum süresi dolmuş'); }
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    const categories = Array.isArray(data) ? data : [];
                    set({ categories, isLoading: false });

                    // İlk kategoriyi seç
                    if (categories.length > 0 && !get().activeCategoryId) {
                        set({ activeCategoryId: categories[0].id });
                    }
                } catch (error) {
                    console.error('Kategoriler çekilemedi:', error);
                    set({ categories: [], isLoading: false });
                }
            },

            fetchProducts: async () => {
                set({ isLoading: true });
                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch(`/api/v1/menu/products?lang=${get().lang}`, { headers });
                    if (res.status === 401) { useAuthStore.getState().logout(); throw new Error('Oturum süresi dolmuş'); }
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    const products = Array.isArray(data) ? data : [];
                    set({ products, isLoading: false });
                } catch (error) {
                    console.error('Ürünler çekilemedi:', error);
                    set({ products: [], isLoading: false });
                }
            },

            fetchModifiers: async () => {
                try {
                    const headers = useAuthStore.getState().getAuthHeaders();
                    const res = await fetch(`/api/v1/menu/modifiers?lang=${get().lang}`, { headers });
                    if (res.status === 401) { useAuthStore.getState().logout(); throw new Error('Oturum süresi dolmuş'); }
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    const modifiers = Array.isArray(data) ? data : [];
                    set({ modifiers });
                } catch (error) {
                    console.error('Modifikatörler çekilemedi:', error);
                    set({ modifiers: [] });
                }
            },

            setActiveCategory: (id) => set({ activeCategoryId: id }),

            // ═══ ADİSYON FONKSİYONLARI ═══
            cart: [],

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
                set({ cart: [...cart, newItem] });
            },

            removeFromCart: (cartId) => {
                set({ cart: get().cart.filter((i) => i.cartId !== cartId) });
            },

            updateQty: (cartId, qty) => {
                if (qty <= 0) {
                    get().removeFromCart(cartId);
                    return;
                }
                set({
                    cart: get().cart.map((i) => (i.cartId === cartId ? { ...i, qty } : i)),
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
                set({ cart: updatedCart });
            },

            clearCart: () => set({ cart: [] }),

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

            updateOrderStatus: (orderId, status) => {
                set({
                    orders: get().orders.map(o => o.id === orderId ? { ...o, status } : o)
                });
            },

            loadOrderToCart: (orderId) => {
                const order = get().orders.find(o => o.id === orderId);
                if (order) {
                    set({
                        cart: [...order.items],
                        orderType: order.orderType
                    });
                }
            },

            getCartTotal: () => {
                const { cart } = get();
                const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
                // KDV oranı %18 varsayalım
                const subtotal = total / 1.18;
                const tax = total - subtotal;
                return { subtotal, tax, total };
            },
        }),
        { name: 'nextpos-storage' }
    )
);
