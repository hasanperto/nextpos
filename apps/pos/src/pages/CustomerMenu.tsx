import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { 
    FiBell, FiCreditCard, FiMinus, FiPlus, FiShoppingBag, FiX, 
    FiRefreshCw, FiUser, FiLogOut, FiDroplet, FiTrash2, FiChevronRight
} from 'react-icons/fi';
import * as FaIcons from 'react-icons/fa';

import { motion, AnimatePresence } from 'framer-motion';
import { CustomerIdentify } from '../components/pos/CustomerIdentify';

// --- Pulse Types & Translations ---
type LangCode = 'tr' | 'de' | 'en';

const TRANSLATIONS = {
    tr: {
        welcome: 'Hoş Geldiniz',
        scanQr: 'QR Kodunu Tara',
        guestLogin: 'Misafir Olarak Devam Et',
        loginTitle: 'Giriş Yap',
        waiter: 'Garson Çağır',
        bill: 'Hesap İste',
        water: 'Su İste',
        clean: 'Masa Temizliği',
        serviceSent: 'Talebiniz iletildi',
        cart: 'Sepetim',
        order: 'Sipariş Ver',
        preparing: 'Hazırlanıyor',
        ready: 'Hazır',
        delivered: 'Teslim Edildi',
        pending: 'Onay Bekliyor',
        emptyCart: 'Sepetiniz henüz boş',
        total: 'Toplam',
        details: 'Detaylar',
        exit: 'Çıkış',
        back: 'Geri Dön',
        guestName: 'İsminiz',
        note: 'Notunuz'
    },
    de: {
        welcome: 'Herzlich Willkommen',
        scanQr: 'QR-Code scannen',
        guestLogin: 'Als Gast fortfahren',
        loginTitle: 'Anmelden',
        waiter: 'Kellner rufen',
        bill: 'Rechnung bitte',
        water: 'Wasser bestellen',
        clean: 'Tisch abräumen',
        serviceSent: 'Anfrage gesendet',
        cart: 'Warenkorb',
        order: 'Bestellen',
        preparing: 'Wird zubereitet',
        ready: 'Fertig',
        delivered: 'Serviert',
        pending: 'Warten auf Bestätigung',
        emptyCart: 'Warenkorb ist leer',
        total: 'Gesamt',
        details: 'Details',
        exit: 'Beenden',
        back: 'Zurück',
        guestName: 'Ihr Name',
        note: 'Notiz'
    },
    en: {
        welcome: 'Welcome',
        scanQr: 'Scan QR Code',
        guestLogin: 'Continue as Guest',
        loginTitle: 'Login',
        waiter: 'Call Waiter',
        bill: 'Request Bill',
        water: 'Request Water',
        clean: 'Table Cleanup',
        serviceSent: 'Request sent',
        cart: 'My Cart',
        order: 'Place Order',
        preparing: 'Preparing',
        ready: 'Ready',
        delivered: 'Delivered',
        pending: 'Pending Approval',
        emptyCart: 'Your cart is empty',
        total: 'Total',
        details: 'Details',
        exit: 'Exit',
        back: 'Back',
        guestName: 'Your Name',
        note: 'Note'
    }
};

type Cat = { id: number; displayName: string; name: string; icon?: string };
type Mod = { id: number; name: string; price: string | number; categoryName?: string };
type Variant = { id: number; name: string; price: string | number; isDefault?: boolean };
type Product = {
    id: number;
    categoryId?: number;
    displayName: string;
    description?: string;
    image?: string;
    basePrice: string | number;
    variants: Variant[];
    modifiers: Mod[];
};

type CartLine = {
    key: string;
    productId: number;
    productName: string;
    variantId?: number;
    variantName?: string;
    quantity: number;
    modifierIds: number[];
    modifierLabel: string;
    unitPrice: number;
};

type LoginMode = 'idle' | 'login' | 'menu' | 'service_pick' | 'payment' | 'ready_board';
type ServiceType = 'dine_in' | 'delivery' | 'pickup';

const CategoryIcon = ({ iconName, className }: { iconName?: string; className?: string }) => {
    if (!iconName) return <span className={className}>🍽️</span>;
    // Check if it's an emoji (common in this project)
    if (/\p{Emoji}/u.test(iconName)) return <span className={className}>{iconName}</span>;
    
    const name = iconName.startsWith('Fa') ? iconName : `Fa${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`;
    const IconComponent = (FaIcons as any)[name];
    if (IconComponent) return <IconComponent className={className} />;
    
    return <span className={className}>🍽️</span>;
};


export const CustomerMenu: React.FC = () => {
    const { tableId: tableQr } = useParams();
    const [search] = useSearchParams();
    const [lang, setLang] = useState<LangCode>('tr');
    const t = TRANSLATIONS[lang];

    const tenantFromUrl = search.get('tenant')?.trim() || '';
    const [serviceType, setServiceType] = useState<ServiceType>('dine_in');
    const [view, setView] = useState<LoginMode>('idle');
    const tenant = tenantFromUrl || 'default';

    const [tableInfo, setTableInfo] = useState<{
        tableId: number;
        tableName: string;
        sectionName?: string;
    } | null>(null);

    const [categories, setCategories] = useState<Cat[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [catTab, setCatTab] = useState<number | 'all'>('all');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [guestName, setGuestName] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
    const [liveStatus, setLiveStatus] = useState<keyof typeof TRANSLATIONS.en>('pending');
    
    // Global Queue Monitor State
    const [readyOrders, setReadyOrders] = useState<any[]>([]);
    const [preparingOrders, setPreparingOrders] = useState<any[]>([]);

    const [detailProduct, setDetailProduct] = useState<Product | null>(null);
    const [selVariantId, setSelVariantId] = useState<number | null>(null);
    const [selModIds, setSelModIds] = useState<Set<number>>(new Set());
    const [modalQty, setModalQty] = useState(1);
    const [identifiedCustomer, setIdentifiedCustomer] = useState<any>(null);

    const socketRef = useRef<Socket | null>(null);
    const menuSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const qrHeaders = useMemo(() => ({
        'Content-Type': 'application/json',
        'x-tenant-id': tenant,
    }), [tenant]);

    const money = (n: number) => `₺${n.toFixed(0)}`;

    const unitFor = (p: Product, variantId: number | undefined, modIds: number[]): number => {
        const v = p.variants?.find((x) => x.id === variantId);
        let u = Number(v?.price ?? p.basePrice);
        for (const id of modIds) {
            const m = p.modifiers?.find((x) => x.id === id);
            if (m) u += Number(m.price);
        }
        return Math.round(u * 100) / 100;
    };

    const lineKey = (productId: number, variantId: number | undefined, ids: number[]) => {
        return `${productId}-${variantId ?? 0}-${[...ids].sort((a, b) => a - b).join(',')}`;
    };

    const loadMenu = useCallback(async (opts?: { silent?: boolean }) => {
        if (!tenant || !tableQr) return;
        if (!opts?.silent) setLoading(true);
        try {
            const [tRes, cRes, pRes] = await Promise.all([
                fetch(`/api/v1/qr/tables/${encodeURIComponent(tableQr)}`, { headers: { 'x-tenant-id': tenant } }),
                fetch(`/api/v1/qr/menu/categories?lang=${lang}`, { headers: { 'x-tenant-id': tenant } }),
                fetch(`/api/v1/qr/menu/products?lang=${lang}`, { headers: { 'x-tenant-id': tenant } }),
            ]);
            if (!tRes.ok) {
                setLoading(false);
                return;
            }
            const tData = await tRes.json();
            const cData = await cRes.json();
            const pData = await pRes.json();
            setTableInfo({
                tableId: tData.tableId,
                tableName: tData.tableName,
                sectionName: tData.sectionName,
            });
            setCategories(Array.isArray(cData) ? cData : []);
            setProducts(Array.isArray(pData) ? pData : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [tenant, tableQr, lang]);

    useEffect(() => {
        void loadMenu();
    }, [loadMenu]);

    useEffect(() => {
        if (!tenant || !tableInfo?.tableId) return;
        const socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        
        const scheduleMenuReload = () => {
            if (menuSyncRef.current) clearTimeout(menuSyncRef.current);
            menuSyncRef.current = setTimeout(() => {
                void loadMenu({ silent: true });
                menuSyncRef.current = null;
            }, 450);
        };
        
        socket.on('connect', () => {
            socket.emit('join:tenant', tenant);
            socket.emit('join:table', { tenantId: tenant, tableId: tableInfo.tableId });
        });
        
        socket.on('order:status_update', (data: { orderId: number; status: string }) => {
            if (Number(data.orderId) === pendingOrderId) {
                const statusMap: Record<string, string> = {
                    preparing: 'preparing',
                    ready: 'ready',
                    delivered: 'delivered',
                    completed: 'delivered'
                };
                const mapped = statusMap[data.status];
                if (mapped) setLiveStatus(mapped as any);
                if (data.status === 'ready') {
                    try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch {}
                    toast.success(t.ready, { icon: '🔔', duration: 5000 });
                }
            }
        });

        socket.on('sync:menu_revision', scheduleMenuReload);
        socket.on('sync:tables_changed', scheduleMenuReload);

        // Queue Display Listener
        socket.on('queue:update', (data: { ready: any[], preparing: any[] }) => {
            setReadyOrders(data.ready || []);
            setPreparingOrders(data.preparing || []);
        });
        
        return () => {
            socketRef.current = null;
            if (menuSyncRef.current) clearTimeout(menuSyncRef.current);
            socket.disconnect();
        };
    }, [tenant, tableInfo, pendingOrderId, t.ready, loadMenu]);

    const handleServiceRequest = async (type: string) => {
        if (!tableInfo) return;
        try {
            await fetch('/api/v1/qr/service-request', {
                method: 'POST',
                headers: qrHeaders,
                body: JSON.stringify({
                    tableId: tableInfo.tableId,
                    type,
                    guestName: guestName || 'Guest'
                })
            });
            toast.success(t.serviceSent, { 
                icon: type === 'waiter' ? '🔔' : type === 'bill' ? '💳' : '💧',
                style: { background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
            });
        } catch (e) {
            toast.error('Network Error');
        }
    };

    const placeOrder = async () => {
        if (cart.length === 0 || !tableInfo) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/qr/orders', {
                method: 'POST',
                headers: qrHeaders,
                body: JSON.stringify({
                    tableId: tableInfo.tableId,
                    guestName: guestName || 'Guest',
                    notes: note,
                    serviceType,
                    customerId: identifiedCustomer?.id || null,
                    items: cart.map(c => ({
                        productId: c.productId,
                        variantId: c.variantId,
                        modifierIds: c.modifierIds,
                        quantity: c.quantity
                    }))
                })
            });
            const data = await res.json();
            if (data.success) {
                setPendingOrderId(data.orderId);
                setCart([]);
                setLiveStatus('preparing');
                toast.success(t.preparing, { duration: 4000 });
            }
        } catch (e) {
            toast.error('Order Failed');
        } finally {
            setLoading(false);
        }
    };

    const addToCart = (p: Product, varId?: number, modIds: number[] = [], qty: number = 1) => {
        const key = lineKey(p.id, varId, modIds);
        const unit = unitFor(p, varId, modIds);
        const v = p.variants.find(x => x.id === varId);
        const modsLabels = modIds.map(id => p.modifiers.find(m => m.id === id)?.name).filter(Boolean).join(', ');

        setCart(prev => {
            const existing = prev.find(x => x.key === key);
            if (existing) {
                return prev.map(x => x.key === key ? { ...x, quantity: x.quantity + qty } : x);
            }
            return [...prev, {
                key,
                productId: p.id,
                productName: p.displayName,
                variantId: varId,
                variantName: v?.name,
                quantity: qty,
                modifierIds: modIds,
                modifierLabel: modsLabels,
                unitPrice: unit
            }];
        });
        toast.success(p.displayName, { icon: '🛒' });
    };

    const cartTotal = cart.reduce((acc, c) => acc + (c.unitPrice * c.quantity), 0);

    const renderIdle = () => (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#020617] overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                    transition={{ duration: 10, repeat: Infinity }}
                    className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full"
                />
                <motion.div 
                    animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
                    transition={{ duration: 12, repeat: Infinity, delay: 2 }}
                    className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-600/10 blur-[140px] rounded-full"
                />
            </div>

            <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="relative z-10 text-center"
            >
                <div className="text-9xl mb-8 animate-float">🍱</div>
                <h1 className="text-8xl font-black italic tracking-tighter text-white uppercase mb-4 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                    NEXT<span className="text-emerald-500">POS</span>
                </h1>
                <p className="text-xl font-black text-slate-500 uppercase tracking-[0.5em] mb-12 italic opacity-60">Digital Gastronomy Suite</p>
                
                <div className="flex gap-4 mb-12 justify-center">
                    {(['tr', 'de', 'en'] as LangCode[]).map(l => (
                        <button 
                            key={l}
                            onClick={() => setLang(l)}
                            className={`w-14 h-14 glass rounded-2xl flex items-center justify-center text-[10px] font-black transition-all ${lang === l ? 'bg-white/10 border-emerald-500 text-emerald-500 shadow-xl shadow-emerald-500/20' : 'text-slate-500 opacity-40 hover:opacity-100 hover:bg-white/5'}`}
                        >
                            {l.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col gap-4 items-center">
                    <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setView('service_pick')}
                        className="px-16 py-6 bg-emerald-600 text-white rounded-[32px] font-black text-xl uppercase tracking-[0.3em] shadow-[0_20px_60px_rgba(16,185,129,0.3)] border-t border-white/20 italic"
                    >
                        {t.welcome} →
                    </motion.button>
                    
                    <button 
                        onClick={() => setView('ready_board')}
                        className="mt-4 px-8 py-3 glass rounded-full border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] hover:text-white transition-colors"
                    >
                        Live Ready Queue
                    </button>
                </div>
            </motion.div>

            {tableInfo && (
                <div className="absolute bottom-12 px-8 py-3 glass rounded-full border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-[0.6em] italic">
                    {tableInfo.sectionName} // {tableInfo.tableName}
                </div>
            )}
        </div>
    );

    const renderServicePick = () => (
        <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center p-8">
            <div className="text-center mb-16">
                <h2 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-none mb-4">Choose Service</h2>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">Tactical Logistic Selection</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-[1000px]">
                {[
                    { id: 'dine_in', label: 'Dine-In', sub: 'At the restaurant', icon: '🍽️', color: 'emerald' },
                    { id: 'delivery', label: 'Delivery', sub: 'To your address', icon: '🛵', color: 'blue' },
                    { id: 'pickup', label: 'Pickup', sub: 'Takeaway order', icon: '🏪', color: 'amber' }
                ].map((s: any) => (
                    <motion.button
                        key={s.id}
                        whileHover={{ scale: 1.05, y: -10 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            setServiceType(s.id);
                            setView(s.id === 'dine_in' ? 'login' : 'menu');
                        }}
                        className={`p-10 glass-dark rounded-[48px] border-white/5 flex flex-col items-center text-center group transition-all hover:bg-white/[0.04] ${serviceType === s.id ? `border-${s.color}-500/50 shadow-2xl` : ''}`}
                    >
                        <div className={`w-24 h-24 rounded-[32px] mb-8 flex items-center justify-center text-5xl bg-${s.color}-500/10 group-hover:scale-110 transition-transform`}>
                            {s.icon}
                        </div>
                        <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-2">{s.label}</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.sub}</p>
                    </motion.button>
                ))}
            </div>

            <button 
                onClick={() => setView('idle')}
                className="mt-16 text-slate-600 font-black text-[10px] uppercase tracking-[0.5em] hover:text-white transition-colors"
            >
                ← Back to Home
            </button>
        </div>
    );

    const renderReadyBoard = () => (
        <div className="fixed inset-0 bg-[#020617] p-12 flex flex-col overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #334155 1px, transparent 0)', backgroundSize: '40px 40px' }} />
            
            <header className="flex items-center justify-between mb-16 relative z-10">
                <div className="flex items-center gap-8">
                    <h2 className="text-6xl font-black italic tracking-tighter text-white uppercase leading-none">ORDER<span className="text-emerald-500">HUB</span></h2>
                    <div className="h-12 w-[1px] bg-white/10" />
                    <div className="flex flex-col">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Live Production Queue</p>
                        <p className="text-xl font-black text-white uppercase italic tracking-tighter -mt-1 tabular-nums">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
                <button 
                    onClick={() => setView('idle')}
                    className="h-16 px-10 glass rounded-[24px] border-white/10 text-[11px] font-black text-white uppercase tracking-[0.4em] hover:bg-white/10 transition-all italic"
                >
                    Return Home
                </button>
            </header>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10 overflow-hidden">
                {/* Ready Column */}
                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_#10b981]" />
                        <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">Ready for Pickup</h3>
                        <span className="ml-auto glass px-6 py-1.5 rounded-full text-emerald-500 font-black text-xs tabular-nums">{readyOrders.length || 0}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <AnimatePresence>
                            {(readyOrders.length > 0 ? readyOrders : [
                                { id: 'A-12', name: 'Ahmet Y.', table: 'T-5' },
                                { id: 'B-45', name: 'Thomas M.', table: 'T-12' },
                                { id: 'C-09', name: 'Guest-X', table: 'T-8' }
                            ]).map((order, idx) => (
                                <motion.div
                                    key={order.id}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="h-44 glass rounded-[32px] border-emerald-500/20 bg-emerald-500/5 flex flex-col items-center justify-center text-center group relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <span className="text-4xl font-black text-white italic tracking-tighter font-mono mb-2">{order.id}</span>
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{order.name}</span>
                                    <div className="mt-4 px-4 py-1 glass rounded-lg text-[9px] font-black text-white/40 uppercase">{order.table || 'WEB'}</div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Preparing Column */}
                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse shadow-[0_0_15px_#3b82f6]" />
                        <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">Under Production</h3>
                        <span className="ml-auto glass px-6 py-1.5 rounded-full text-blue-500 font-black text-xs tabular-nums">{preparingOrders.length || 0}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                         {(preparingOrders.length > 0 ? preparingOrders : [
                            { id: 'D-22', name: 'Ayşe K.' },
                            { id: 'E-56', name: 'Guest-Y' },
                            { id: 'F-11', name: 'Markus' }
                        ]).map((order, idx) => (
                            <div key={order.id} style={{ transitionDelay: `${idx * 50}ms` }} className="h-40 glass rounded-[32px] border-white/5 bg-white/5 flex flex-col items-center justify-center text-center">
                                <span className="text-3xl font-black text-slate-400 italic tracking-tighter font-mono mb-2">{order.id}</span>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{order.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <footer className="mt-16 h-20 glass-dark rounded-[24px] border-white/5 flex items-center justify-center text-center relative z-10">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.8em]">PULSE_REALTIME_SYNC_ACTIVE // 60FPS_CORE</p>
            </footer>
        </div>
    );

    const renderLogin = () => (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#020617] p-8">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-[440px] space-y-8"
            >
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">{t.loginTitle}</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] mt-2 text-[10px] ">Secure Digital Identity</p>
                </div>

                    <div className="grid gap-4">
                        <CustomerIdentify 
                            isPublic 
                            tenantId={tenant} 
                            placeholder={t.scanQr}
                            onSelect={(c) => {
                                setIdentifiedCustomer(c);
                                if (c) {
                                    setGuestName(c.name);
                                    setView('menu');
                                }
                            }}
                        />

                        <button 
                            onClick={() => setView('menu')}
                            className="group relative h-24 glass-dark rounded-[24px] border-white/5 hover:border-emerald-500/50 transition-all p-6 flex items-center gap-6"
                        >
                            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                                <FiUser size={28} />
                            </div>
                            <div className="text-left">
                                <p className="text-white font-black text-lg leading-tight uppercase italic">{t.guestLogin}</p>
                                <p className="text-slate-500 text-[9px] font-black tracking-[0.3em] uppercase">QUICK_ACCESS_LOCAL</p>
                            </div>
                            <FiChevronRight className="ml-auto text-slate-600 group-hover:text-emerald-500 transition-colors" />
                        </button>
                    </div>

                <button 
                    onClick={() => setView('idle')}
                    className="w-full py-4 text-slate-600 font-black text-[9px] uppercase tracking-[0.5em] hover:text-white transition-colors"
                >
                    ← {t.back}
                </button>
            </motion.div>
        </div>
    );

    const renderMenu = () => (
        <div className="fixed inset-0 flex flex-col bg-[#020617]">
            {/* Mission Critical Tablet Header */}
            <header className="h-24 bg-[#080c16]/80 backdrop-blur-3xl border-b border-white/5 px-10 flex items-center justify-between z-50">
                <div className="flex items-center gap-8">
                    <h1 className="text-4xl font-black italic tracking-tighter text-white uppercase leading-none">NEXT<span className="text-emerald-500">POS</span></h1>
                    <div className="h-10 w-[1px] bg-white/10" />
                    <div className="flex flex-col">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{tableInfo?.sectionName}</p>
                        <p className="text-xl font-black text-emerald-500 uppercase italic tracking-tighter -mt-1">{tableInfo?.tableName}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <AnimatePresence>
                        {pendingOrderId && (
                            <motion.div 
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                className="glass px-6 py-2.5 rounded-full border-emerald-500/30 flex items-center gap-3"
                            >
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_#10b981]" />
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{t[liveStatus] || liveStatus}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <button 
                        onClick={() => setView('idle')}
                        className="w-14 h-14 glass rounded-2xl flex items-center justify-center text-rose-500 hover:bg-rose-600 hover:text-white transition-all shadow-xl active:scale-90"
                    >
                        <FiLogOut size={24} />
                    </button>
                    {identifiedCustomer && (
                        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                            <FiUser size={24} />
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Visual Category Sidebar */}
                <aside className="w-36 bg-[#080c16]/40 border-r border-white/5 overflow-y-auto py-10 flex flex-col items-center gap-6 no-scrollbar shrink-0">
                    <button 
                        onClick={() => setCatTab('all')}
                        className={`w-24 h-24 rounded-[32px] flex flex-col items-center justify-center gap-1.5 transition-all outline-none ${catTab === 'all' ? 'bg-emerald-600 text-white shadow-2xl shadow-emerald-900/40' : 'text-slate-600 hover:bg-white/5'}`}
                    >
                        <FiShoppingBag size={28} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">ALL_ITEMS</span>
                    </button>
                    {categories.map(cat => (
                        <button 
                            key={cat.id}
                            onClick={() => setCatTab(cat.id)}
                            className={`w-24 h-24 rounded-[32px] flex flex-col items-center justify-center gap-1.5 transition-all outline-none ${catTab === cat.id ? 'bg-emerald-600 text-white shadow-2xl shadow-emerald-900/40' : 'text-slate-600 hover:bg-white/5'}`}
                        >
                            <CategoryIcon iconName={cat.icon} className={catTab === cat.id ? 'text-3xl text-white' : 'text-3xl text-slate-500'} />
                            <span className="text-[9px] font-black uppercase tracking-tighter line-clamp-1 px-1 text-center">{cat.displayName}</span>
                        </button>

                    ))}
                </aside>

                {/* High-Fidelity Product Canvas */}
                <main className="flex-1 overflow-y-auto p-12 bg-[#020617]/10 relative no-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                        {products.filter(p => catTab === 'all' || p.categoryId === catTab).map(product => (
                            <motion.div 
                                key={product.id}
                                layout
                                className="group glass-dark rounded-[40px] overflow-hidden border-white/5 hover:border-emerald-500/20 transition-all flex flex-col shadow-xl"
                            >
                                <div className="h-56 bg-slate-900/40 flex items-center justify-center text-7xl relative overflow-hidden">
                                    {product.image ? (
                                        <img src={product.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-500 scale-105 group-hover:scale-100" alt="" />
                                    ) : (
                                        <span className="opacity-40">{product.categoryId === 2 ? '🍕' : '🍔'}</span>
                                    )}
                                    <div className="absolute top-6 left-6 glass px-5 py-2 rounded-full text-emerald-400 font-black text-xs font-mono shadow-xl border-emerald-500/30">
                                        {money(Number(product.basePrice))}
                                    </div>
                                </div>
                                <div className="p-10 flex flex-col flex-1">
                                    <h3 className="text-2xl font-black text-white italic tracking-tighter truncate uppercase leading-none">{product.displayName}</h3>
                                    <p className="text-slate-500 text-sm mt-3 line-clamp-2 h-10 font-bold uppercase tracking-tight opacity-60 leading-snug">
                                        {product.description || 'Premium localized selection for mission critical dining experience.'}
                                    </p>
                                    <div className="mt-10 flex gap-4">
                                        <button 
                                            onClick={() => addToCart(product, product.variants[0]?.id, [])}
                                            className="flex-1 h-16 bg-emerald-600 text-white rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-emerald-500 transition-all shadow-xl active:scale-95 border-emerald-400/20 border"
                                        >
                                            QUICK_ORDER
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setDetailProduct(product);
                                                setSelVariantId(product.variants[0]?.id || null);
                                                setSelModIds(new Set());
                                                setModalQty(1);
                                            }}
                                            className="w-16 h-16 glass rounded-[24px] flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:border-emerald-500/40 transition-all active:scale-95"
                                        >
                                            <FiPlus size={24} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </main>

                {/* Living Cart Sidebar (Always Visible on Tablet) */}
                <aside className="w-[420px] bg-[#080c16]/80 border-l border-white/5 flex flex-col backdrop-blur-3xl shadow-2xl relative z-40">
                    <div className="p-10 border-b border-white/5">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">{t.cart}</h2>
                            <div className="px-5 py-1.5 glass rounded-full text-emerald-500 font-black text-[10px] tracking-[0.3em] uppercase">{cart.length} ITEMS</div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { id: 'waiter', icon: <FiBell />, label: t.waiter },
                                { id: 'bill', icon: <FiCreditCard />, label: t.bill },
                                { id: 'water', icon: <FiDroplet />, label: t.water },
                                { id: 'clean', icon: <FiTrash2 />, label: t.clean },
                            ].map(btn => (
                                <button 
                                    key={btn.id}
                                    onClick={() => handleServiceRequest(btn.id)}
                                    className="flex flex-col items-center justify-center py-4 glass rounded-3xl gap-1.5 text-slate-500 hover:text-emerald-500 hover:border-emerald-500 group transition-all active:scale-90 shadow-lg"
                                >
                                    <span className="scale-125 group-hover:scale-150 transition-transform">{btn.icon}</span>
                                    <span className="text-[7px] font-black uppercase tracking-tighter mt-1">{btn.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar pb-32">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-10 text-center grayscale">
                                <FiShoppingBag size={80} className="mb-6" />
                                <p className="text-xs font-black text-white uppercase tracking-[0.5em]">{t.emptyCart}</p>
                            </div>
                        ) : (
                            cart.map(line => (
                                <motion.div 
                                    key={line.key}
                                    layout
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    className="p-6 glass-dark rounded-[32px] border-white/5 flex gap-5 shadow-lg group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] -rotate-45 translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                                    <div className="w-16 h-16 bg-slate-900/60 rounded-2xl flex items-center justify-center text-3xl shrink-0">🍕</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase truncate tracking-tight">{line.productName}</p>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1 line-clamp-1">{line.variantName} {line.modifierLabel ? `• ${line.modifierLabel}` : ''}</p>
                                        <p className="text-emerald-500 font-black font-mono text-xs mt-3 tracking-tighter">[{money(line.unitPrice * line.quantity)}]</p>
                                    </div>
                                    <div className="flex flex-col items-center justify-between">
                                        <div className="flex flex-col items-center gap-4 glass p-1.5 rounded-[20px] border-white/5">
                                            <button 
                                                onClick={() => setCart(prev => prev.map(x => x.key === line.key ? { ...x, quantity: x.quantity + 1 } : x))}
                                                className="w-8 h-8 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl transition-all"
                                            >
                                                <FiPlus size={16}/>
                                            </button>
                                            <span className="text-lg font-black text-white italic tracking-tighter">{line.quantity}</span>
                                            <button 
                                                onClick={() => setCart(prev => prev.map(x => x.key === line.key ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x).filter(x => x.quantity > 0))}
                                                className="w-8 h-8 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all"
                                            >
                                                <FiMinus size={16}/>
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>

                    <div className="p-10 border-t border-white/10 bg-[#080c16]/95 backdrop-blur-3xl absolute bottom-0 left-0 right-0 z-50">
                        <div className="grid grid-cols-2 gap-4 mb-8">
                             <input
                                className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-6 text-[10px] font-black text-white placeholder:text-slate-700 uppercase tracking-widest outline-none focus:border-emerald-500/40 transition-all"
                                placeholder={t.guestName}
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                            />
                            <input
                                className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-6 text-[10px] font-black text-white placeholder:text-slate-700 uppercase tracking-widest outline-none focus:border-emerald-500/40 transition-all"
                                placeholder={t.note}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center justify-between mb-8">
                            <span className="text-slate-600 font-black text-[11px] uppercase tracking-[0.4em] italic">{t.total}</span>
                            <span className="text-5xl font-black text-emerald-500 italic tracking-tighter font-mono leading-none">{money(cartTotal)}</span>
                        </div>
                        <motion.button 
                            whileTap={{ scale: 0.95 }}
                            disabled={cart.length === 0 || loading}
                            onClick={() => serviceType === 'dine_in' ? placeOrder() : setView('payment')}
                            className="w-full h-24 bg-emerald-600 disabled:bg-slate-900/50 text-white rounded-[32px] font-black text-xl uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(16,185,129,0.3)] hover:bg-emerald-500 transition-all text-center flex items-center justify-center gap-4 italic border-emerald-400/20 border"
                        >
                            {loading ? <FiRefreshCw className="animate-spin" size={32} /> : (<><FiShoppingBag size={32}/> {serviceType === 'dine_in' ? t.order : 'CHECKOUT'} </>) }
                        </motion.button>
                    </div>
                </aside>
            </div>
        </div>
    );

    const renderPayment = () => (
        <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center p-8 overflow-y-auto">
             <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-[500px]"
            >
                <div className="mb-12 text-center">
                     <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-2">Tactical Checkout</h2>
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Secure External Gateway</p>
                </div>

                <div className="glass-dark rounded-[48px] border-white/5 p-12 space-y-10">
                    <div className="flex justify-between items-center bg-white/5 p-8 rounded-[32px] border border-white/5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Grand Total</span>
                        <span className="text-5xl font-black text-emerald-500 italic tracking-tighter font-mono">{money(cartTotal)}</span>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-3">
                             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Card Identifier</label>
                             <div className="h-16 glass rounded-2xl border-white/5 flex items-center px-6 gap-4">
                                <FiCreditCard className="text-emerald-500" />
                                <input className="bg-transparent flex-1 outline-none text-white font-mono tracking-widest text-lg" placeholder="0000 0000 0000 0000" />
                             </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Expiry</label>
                                <input className="h-16 glass rounded-2xl border-white/5 w-full bg-transparent px-6 outline-none text-white font-mono text-lg" placeholder="MM/YY" />
                             </div>
                             <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">CVV</label>
                                <input className="h-16 glass rounded-2xl border-white/5 w-full bg-transparent px-6 outline-none text-white font-mono text-lg" placeholder="•••" type="password" />
                             </div>
                        </div>
                                 <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                setLoading(true);
                                setTimeout(() => {
                                    setLoading(false);
                                    placeOrder();
                                }, 1500);
                            }}
                            className="w-full h-20 bg-emerald-600 text-white rounded-[28px] font-black uppercase tracking-[0.2em] shadow-xl italic"
                         >
                            {loading ? <FiRefreshCw className="animate-spin mx-auto" /> : 'Confirm Payment'}
                         </motion.button>
                         <button 
                            onClick={() => setView('menu')}
                            className="h-14 glass rounded-[24px] text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hover:text-white transition-colors"
                        >
                            Return to Selection
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );

            {/* Product Detail Modal */}
    const renderProductModal = () => (
        <AnimatePresence>
            {detailProduct && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/90 backdrop-blur-xl">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="w-full max-w-[800px] bg-[#0b0f19] rounded-[64px] overflow-hidden border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,1)] flex flex-col md:flex-row h-[700px]"
                    >
                        <div className="w-full md:w-[45%] h-64 md:h-full bg-slate-900/60 relative">
                            {detailProduct.image ? (
                                <img src={detailProduct.image} className="w-full h-full object-cover opacity-60" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-9xl">🍕</div>
                            )}
                            <button
                                onClick={() => setDetailProduct(null)}
                                className="absolute top-10 left-10 w-16 h-16 glass rounded-full flex items-center justify-center text-white backdrop-blur-3xl shadow-2xl active:scale-90"
                            >
                                <FiX size={32} />
                            </button>
                        </div>
                        
                        <div className="flex-1 p-14 flex flex-col overflow-y-auto no-scrollbar">
                            <h3 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-tight mb-4">{detailProduct.displayName}</h3>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-[11px] leading-relaxed mb-10 opacity-60">{detailProduct.description || 'Premium mission-critical dining selection curated for excellence.'}</p>
                            
                            <div className="space-y-12 flex-1">
                                {detailProduct.variants.length > 1 && (
                                    <section>
                                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] mb-6">SELECT_SIZE</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            {detailProduct.variants.map(v => (
                                                <button
                                                    key={v.id}
                                                    onClick={() => setSelVariantId(v.id)}
                                                    className={`p-6 rounded-[32px] text-left border transition-all ${
                                                        selVariantId === v.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-2xl shadow-emerald-900/40' : 'bg-white/5 border-white/5 text-slate-500'
                                                    }`}
                                                >
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1">{v.name}</p>
                                                    <p className="text-2xl font-black italic tracking-tighter font-mono">{money(Number(v.price))}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {detailProduct.modifiers.length > 0 && (
                                    <section>
                                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] mb-6">PERSONALIZATION</p>
                                        <div className="flex flex-wrap gap-3">
                                            {detailProduct.modifiers.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => setSelModIds(prev => {
                                                        const n = new Set(prev);
                                                        if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                                                        return n;
                                                    })}
                                                    className={`px-8 py-4 rounded-full text-[10px] font-black italic tracking-widest border transition-all uppercase ${
                                                        selModIds.has(m.id) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-xl' : 'bg-white/5 border-white/5 text-slate-500'
                                                    }`}
                                                >
                                                    {m.name} [+{money(Number(m.price))}]
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>

                            <div className="mt-14 pt-10 border-t border-white/5">
                                <div className="flex items-center justify-between mb-10">
                                    <div className="flex items-center gap-8 bg-black/40 rounded-[24px] p-2 border border-white/5">
                                        <button onClick={() => setModalQty(q => Math.max(1, q - 1))} className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-white transition-colors"><FiMinus size={24}/></button>
                                        <span className="text-4xl font-black text-white italic tracking-tighter min-w-[30px] text-center font-mono">{modalQty}</span>
                                        <button onClick={() => setModalQty(q => q + 1)} className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"><FiPlus size={24}/></button>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.6em] mb-2">TOTAL_UNIT</p>
                                        <p className="text-6xl font-black text-white italic tracking-tighter font-mono leading-none">
                                            {money(unitFor(detailProduct, selVariantId || undefined, Array.from(selModIds)) * modalQty)}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        addToCart(detailProduct, selVariantId || undefined, Array.from(selModIds), modalQty);
                                        setDetailProduct(null);
                                    }}
                                    className="w-full h-24 bg-emerald-600 text-white rounded-[32px] font-black uppercase text-xl tracking-[0.3em] shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-95 transition-all italic border-emerald-400/20 border"
                                >
                                    CONFIRM_TO_CART
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    // Initial Error/Not Found View
    if (!tenant || !tableQr) return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center p-10">
            <div className="text-center p-16 glass rounded-[48px] border-emerald-500/20 max-w-xl shadow-[0_0_100px_rgba(16,185,129,0.1)]">
                <div className="text-9xl mb-10 animate-pulse">🍱</div>
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-6 leading-none">QR_INVALID_OR_NOT_FOUND</h2>
                <p className="text-slate-500 text-lg font-bold tracking-tight leading-relaxed uppercase opacity-60">Lütfen restoranın sunduğu geçerli bir QR kodunu tarayın veya personelden yardım isteyin.</p>
                <div className="mt-12 h-1 w-20 bg-emerald-500/20 mx-auto rounded-full" />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans overflow-hidden">
            <AnimatePresence mode="wait">
                {loading && products.length === 0 ? (
                    <motion.div 
                        key="loader"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 flex flex-col items-center justify-center bg-[#020617] z-[200]"
                    >
                        <FiRefreshCw className="animate-spin text-emerald-500" size={64} />
                        <p className="mt-8 text-[11px] font-black text-white uppercase tracking-[0.8em] animate-pulse">PULSE_SYNC_ACTIVE</p>
                    </motion.div>
                ) : (
                    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
                        {view === 'idle' && renderIdle()}
                        {view === 'service_pick' && renderServicePick()}
                        {view === 'ready_board' && renderReadyBoard()}
                        {view === 'login' && renderLogin()}
                        {view === 'menu' && renderMenu()}
                        {view === 'payment' && renderPayment()}
                        {renderProductModal()}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
