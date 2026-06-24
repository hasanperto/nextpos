import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiChevronLeft,
    FiClock,
    FiGrid,
    FiLayers,
    FiMenu,
    FiSearch,
    FiShoppingBag,
    FiStar,
    FiWifi,
    FiX,
    FiPhone,
    FiMessageCircle,
} from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';

import { usePosStore } from '../store/usePosStore';
import { useUIStore } from '../store/useUIStore';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useCashierRealtimeSync } from '../hooks/useCashierRealtimeSync';

import { Header } from '../components/layout/Header';
import { TerminalLangAndUser } from '../components/layout/TerminalLangAndUser';
import { OfflineBanner } from '../components/OfflineBanner';
import { BillingWarning } from '../components/BillingWarning';
import { QrOrderQueueBar } from '../components/pos/QrOrderQueueBar';

import { CartPanel } from '../features/terminal/components/CartPanel';
import { ProductGrid } from '../features/terminal/components/ProductGrid';
import { TableFloorGrid } from '../features/terminal/components/TableFloorGrid';
import { ProductModal } from '../features/terminal/components/ProductModal';
import { KitchenStatusModal } from '../features/kitchen/components/KitchenStatusModal';
import { OnlineOrdersModal } from '../features/terminal/components/OnlineOrdersModal';
import { CallerIdModal } from '../features/terminal/components/CallerIdModal';
import { CallerIdNotification } from '../features/terminal/components/CallerIdNotification';
import { CallerIdOrderTypeSelectorModal } from '../features/terminal/components/CallerIdOrderTypeSelectorModal';
import { WaOrderModal } from '../features/terminal/components/WaOrderModal';
import { StaffMenu } from '../features/terminal/components/StaffMenu';
import { StaffPanelModal } from '../features/terminal/components/StaffPanelModal';

// Dinamik kategori renk paleti
const CATEGORY_COLORS = [
    { bg: 'from-blue-600/30 to-blue-800/20', border: 'border-blue-500/40', activeBg: 'from-blue-500 to-blue-700', text: 'text-blue-400', activeText: 'text-white' },
    { bg: 'from-violet-600/30 to-violet-800/20', border: 'border-violet-500/40', activeBg: 'from-violet-500 to-violet-700', text: 'text-violet-400', activeText: 'text-white' },
    { bg: 'from-rose-600/30 to-rose-800/20', border: 'border-rose-500/40', activeBg: 'from-rose-500 to-rose-700', text: 'text-rose-400', activeText: 'text-white' },
    { bg: 'from-emerald-600/30 to-emerald-800/20', border: 'border-emerald-500/40', activeBg: 'from-emerald-500 to-emerald-700', text: 'text-emerald-400', activeText: 'text-white' },
    { bg: 'from-purple-600/30 to-purple-800/20', border: 'border-purple-500/40', activeBg: 'from-purple-500 to-purple-700', text: 'text-purple-400', activeText: 'text-white' },
    { bg: 'from-cyan-600/30 to-cyan-800/20', border: 'border-cyan-500/40', activeBg: 'from-cyan-500 to-cyan-700', text: 'text-cyan-400', activeText: 'text-white' },
    { bg: 'from-orange-600/30 to-orange-800/20', border: 'border-orange-500/40', activeBg: 'from-orange-500 to-orange-700', text: 'text-orange-400', activeText: 'text-white' },
    { bg: 'from-teal-600/30 to-teal-800/20', border: 'border-teal-500/40', activeBg: 'from-teal-500 to-teal-700', text: 'text-teal-400', activeText: 'text-white' },
];

// Category icon renderer
const CategoryIcon: React.FC<{ iconName?: string; name: string; className?: string }> = ({ iconName, name, className = '' }) => {
    if (iconName && (iconName.startsWith('http') || iconName.startsWith('/'))) {
        return <img src={iconName} alt={name} className={`w-6 h-6 object-contain ${className}`} />;
    }
    if (iconName && iconName.length <= 4) {
        return <span className={`text-2xl leading-none ${className}`}>{iconName}</span>;
    }
    return <span className={`text-2xl leading-none ${className}`}>🍽️</span>;
};

// ─── Online Siparişler Seçim Popup'u ───────────────────────────────────────────
interface OnlineSelectPopupProps {
    onClose: () => void;
    onB2B: () => void;
    onWhatsApp: () => void;
    onCallerID: () => void;
    totalOnlineCount: number;
    pendingWaOrders: number;
    pendingCalls: number;
    canUseWhatsApp: boolean;
    canUseCallerId: boolean;
}

const OnlineSelectPopup: React.FC<OnlineSelectPopupProps> = ({
    onClose,
    onB2B,
    onWhatsApp,
    onCallerID,
    totalOnlineCount,
    pendingWaOrders,
    pendingCalls,
    canUseWhatsApp,
    canUseCallerId,
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-72 bg-[#0f1526]/98 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-white/50">Online Siparişler</span>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                <FiX size={14} />
            </button>
        </div>

        {/* Seçenekler */}
        <div className="p-3 space-y-2">
            {/* B2B / Platform Siparişleri */}
            <button
                onClick={() => { onB2B(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-400/40 transition-all active:scale-[0.98] group"
            >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-950/40 shrink-0">
                    <FiWifi size={16} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                    <div className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">Platform / B2B</div>
                    <div className="text-[10px] text-white/40">Yemeksepeti, GetirYemek vb.</div>
                </div>
                {totalOnlineCount > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-[#0b0f19] text-[9px] font-black flex items-center justify-center leading-none">
                        {totalOnlineCount}
                    </span>
                )}
            </button>

            {/* WhatsApp Siparişleri — yalnızca modül aktifse */}
            {canUseWhatsApp && (
            <button
                onClick={() => { onWhatsApp(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-400/40 transition-all active:scale-[0.98] group"
            >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md shadow-emerald-950/40 shrink-0">
                    <FaWhatsapp size={18} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                    <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">WhatsApp Siparişler</div>
                    <div className="text-[10px] text-white/40">Gelen WA mesaj siparişleri</div>
                </div>
                {pendingWaOrders > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center leading-none animate-pulse">
                        {pendingWaOrders}
                    </span>
                )}
            </button>
            )}

            {/* Caller ID — yalnızca modül aktifse */}
            {canUseCallerId && (
            <button
                onClick={() => { onCallerID(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-400/40 transition-all active:scale-[0.98] group"
            >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-md shadow-purple-950/40 shrink-0">
                    <FiPhone size={16} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                    <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">Caller ID / Telefon</div>
                    <div className="text-[10px] text-white/40">Gelen çağrılar & numaralar</div>
                </div>
                {pendingCalls > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-purple-500 text-white text-[9px] font-black flex items-center justify-center leading-none animate-pulse">
                        {pendingCalls}
                    </span>
                )}
            </button>
            )}
        </div>
    </motion.div>
);

// ─── Ana PosTerminal ───────────────────────────────────────────────────────────
const PosTerminal: React.FC = () => {
    const fetchSettings = usePosStore(s => s.fetchSettings);
    const fetchProducts = usePosStore(s => s.fetchProducts);
    const fetchCategories = usePosStore(s => s.fetchCategories);
    const cashierView = usePosStore(s => s.cashierView);
    const setCashierView = usePosStore(s => s.setCashierView);
    const selectedTable = usePosStore(s => s.selectedTable);
    const setActiveCategory = usePosStore(s => s.setActiveCategory);
    const activeCategoryId = usePosStore(s => s.activeCategoryId);
    const categories = usePosStore(s => s.categories);
    const setOrderType = usePosStore(s => s.setOrderType);
    const occupiedTableCount = usePosStore(s => s.occupiedTableCount);
    const orders = usePosStore(s => s.orders);
    const cart = usePosStore(s => s.cart);

    const isCartOpen = useUIStore(s => s.isCartOpen);
    const setCartOpen = useUIStore(s => s.setCartOpen);
    const setKitchenStatus = useUIStore(s => s.setKitchenStatus);
    const setOnlineOrders = useUIStore(s => s.setOnlineOrders);
    const setStaffMenu = useUIStore(s => s.setStaffMenu);
    const setCallerId = useUIStore(s => s.setCallerId);
    const setWaOrder = useUIStore(s => s.setWaOrder);

    const pendingOnlineOrders = useUIStore(s => s.pendingOnlineOrders);
    const pendingWaOrders = useUIStore(s => s.pendingWaOrders);
    const pendingCalls = useUIStore(s => s.pendingCalls);

    const user = useAuthStore(s => s.user);
    const billingWorkspace = useAuthStore(s => s.billingWorkspace);
    const { t } = usePosLocale();

    // ── Entitlement map: modül kontrol ────────────────────────────────
    const entitlementMap = useMemo(() => {
        const out: Record<string, boolean> = {};
        const list = billingWorkspace?.entitlements;
        if (Array.isArray(list)) {
            for (const e of list) {
                if (e?.code) out[String(e.code)] = Boolean(e.enabled);
            }
        }
        return out;
    }, [billingWorkspace]);

    const canUseCallerId = entitlementMap.caller_id_android !== false;
    const canUseWhatsAppOrders = entitlementMap.whatsapp_orders !== false;

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const searchRef = useRef<HTMLInputElement | null>(null);
    const [mobileMenuPhase, setMobileMenuPhase] = useState<'categories' | 'products'>('categories');
    const [showOnlineSelect, setShowOnlineSelect] = useState(false);

    // Bottom Navigation Badge Computations
    const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);

    const readyPackageLineCount = useMemo(
        () => orders.filter((o) => o.status === 'ready' && o.orderType !== 'dine_in').length,
        [orders],
    );

    const totalOnlineCount = pendingOnlineOrders + (canUseWhatsAppOrders ? pendingWaOrders : 0);

    const occupiedCount = useMemo(() => {
        return typeof occupiedTableCount === 'function' ? occupiedTableCount() : 0;
    }, [occupiedTableCount, orders]);

    // Toplam alert sayısı (yalnızca aktif modüllerin sayacı)
    const totalAlertCount = totalOnlineCount + (canUseCallerId ? pendingCalls : 0);

    // Activate Socket Listeners
    useCashierRealtimeSync();

    useEffect(() => {
        void fetchProducts();
        void fetchCategories();

        const initView = async () => {
            await fetchSettings();
            const s = usePosStore.getState().settings;
            const currentRole = user?.role;

            if (s?.integrations?.floorPlanMode === 'visual') {
                const applyTo = s.integrations.applyFloorPlanTo || 'both';
                const isWaiter = currentRole === 'waiter';
                const isAdminOrCashier = currentRole === 'admin' || currentRole === 'cashier';

                if (applyTo === 'both') {
                    usePosStore.getState().setCashierView('floor');
                } else if (applyTo === 'waiter' && isWaiter) {
                    usePosStore.getState().setCashierView('floor');
                } else if (applyTo === 'cashier' && isAdminOrCashier) {
                    usePosStore.getState().setCashierView('floor');
                } else {
                    usePosStore.getState().setCashierView('menu');
                }
            } else {
                usePosStore.getState().setCashierView('menu');
            }
        };
        void initView();
    }, [fetchSettings, fetchProducts, fetchCategories, user?.role]);

    useEffect(() => {
        const id = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 150);
        return () => window.clearTimeout(id);
    }, [searchTerm]);

    useEffect(() => {
        if (cashierView === 'menu') {
            setMobileMenuPhase('categories');
        }
    }, [cashierView]);

    const hotkeysHint = useMemo(() => {
        return t('terminal.hotkeysHint') || 'F3: Ürün ara · ESC: Temizle/Kapat · F2: Sepet';
    }, [t]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                searchRef.current?.focus();
                return;
            }
            if (e.key === 'F2') {
                e.preventDefault();
                setCartOpen(!useUIStore.getState().isCartOpen);
                return;
            }
            if (e.key === 'Escape') {
                if (showOnlineSelect) {
                    e.preventDefault();
                    setShowOnlineSelect(false);
                    return;
                }
                if (searchTerm) {
                    e.preventDefault();
                    setSearchTerm('');
                    return;
                }
                if (useUIStore.getState().isCartOpen) {
                    e.preventDefault();
                    setCartOpen(false);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [searchTerm, setCartOpen, showOnlineSelect]);

    const activeCat = categories.find(c => c.id === activeCategoryId);

    return (
        <div className="flex flex-col h-screen bg-[#0a0e1a] text-slate-200 overflow-hidden select-none font-sans">
            <Header />
            <OfflineBanner />
            <BillingWarning />
            <QrOrderQueueBar />

            <main className="flex-1 flex overflow-hidden relative">
                <AnimatePresence mode="wait">
                    {cashierView === 'floor' ? (
                        <motion.div
                            key="floor" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }}
                            className="flex-1 h-full"
                        >
                            <TableFloorGrid />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="flex-1 flex overflow-hidden"
                        >
                            {/* ═══════ LEFT: CATEGORY SIDEBAR ═══════ */}
                            <div
                                className={`flex flex-col bg-[#0d1220] border-r border-white/[0.06] overflow-hidden shrink-0 w-full max-md:min-h-0 md:w-[180px] xl:w-[200px] ${
                                    mobileMenuPhase === 'products' ? 'hidden md:flex' : 'flex'
                                }`}
                            >
                                <div className="p-4 pb-3 border-b border-white/[0.04]">
                                    <div className="flex items-center gap-2">
                                        <FiGrid size={14} className="text-emerald-500" />
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.15em]">
                                            {t('terminal.categories') || 'Kategoriler'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar pb-24 xl:pb-3">
                                    <button
                                        onClick={() => {
                                            setActiveCategory(0);
                                            setMobileMenuPhase('products');
                                        }}
                                        className={`w-full flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl border transition-all duration-200 active:scale-95 ${
                                            activeCategoryId === 0
                                                ? 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400/60 shadow-lg shadow-amber-900/30 text-white'
                                                : 'bg-gradient-to-br from-amber-600/20 to-amber-800/10 border-amber-500/20 text-amber-400 hover:border-amber-500/40 hover:bg-amber-600/30'
                                        }`}
                                    >
                                        <FiStar size={22} />
                                        <span className="text-[11px] font-black uppercase tracking-wide">
                                            {t('terminal.all') || 'Favoriler'}
                                        </span>
                                    </button>
                                    <div className="grid grid-cols-2 gap-2">
                                        {categories.map((cat, idx) => {
                                            const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                                            const isActive = activeCategoryId === cat.id;
                                            return (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => {
                                                        setActiveCategory(cat.id);
                                                        setMobileMenuPhase('products');
                                                    }}
                                                    className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 rounded-2xl border transition-all duration-200 active:scale-95 ${
                                                        isActive
                                                            ? `bg-gradient-to-br ${color.activeBg} ${color.border} shadow-lg ${color.activeText}`
                                                            : `bg-gradient-to-br ${color.bg} ${color.border} ${color.text} hover:brightness-125`
                                                    }`}
                                                >
                                                    <CategoryIcon iconName={cat.icon} name={cat.displayName || cat.name} className="text-2xl leading-none" />
                                                    <span className="text-[10px] font-bold uppercase tracking-tight leading-tight text-center line-clamp-2">
                                                        {cat.displayName || cat.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="shrink-0 border-t border-white/[0.06] p-3 bg-[#0a0e14]/90 backdrop-blur-sm hidden xl:block">
                                    <TerminalLangAndUser variant="sidebar" />
                                </div>
                            </div>

                            {/* ═══════ CENTER: PRODUCTS ═══════ */}
                            <div
                                className={`flex-1 flex flex-col overflow-hidden bg-[#0a0e1a] min-h-0 ${
                                    mobileMenuPhase === 'categories' ? 'hidden md:flex' : 'flex'
                                }`}
                            >
                                <div className="flex flex-wrap items-center gap-3 px-3 md:px-5 py-3 border-b border-white/[0.05] bg-[#0d1220]/80">
                                    <button
                                        type="button"
                                        onClick={() => setMobileMenuPhase('categories')}
                                        className="md:hidden shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-2.5 min-h-[2.5rem] rounded-xl border-2 border-emerald-500/55 bg-emerald-500/20 text-emerald-100 shadow-md shadow-emerald-950/40 hover:bg-emerald-500/30 hover:border-emerald-400/70 active:scale-[0.98] transition-all"
                                        aria-label={`${t('nav.menu')} — ${t('terminal.backToCategories')}`}
                                        title={t('terminal.backToCategories')}
                                    >
                                        <FiChevronLeft size={22} className="shrink-0 -mr-0.5" />
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                            {t('nav.menu')}
                                        </span>
                                    </button>
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="text-2xl shrink-0">
                                            {activeCat ? (
                                                <CategoryIcon iconName={activeCat.icon} name={activeCat.displayName || activeCat.name} />
                                            ) : '⭐'}
                                        </div>

                                        <div className="flex flex-col min-w-0">
                                            <h2 className="text-lg font-black text-white tracking-tight truncate">
                                                {activeCat?.displayName || activeCat?.name || t('terminal.all') || 'Favoriler'}
                                            </h2>
                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest truncate">
                                                {selectedTable ? `${selectedTable.name} — ${selectedTable.sectionName}` : t('terminal.quickSale') || 'Hızlı Satış'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="relative w-full md:w-60 md:shrink-0 basis-full md:basis-auto">
                                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                                        <input
                                            ref={searchRef}
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder={t('terminal.search') || "Ürün ara..."}
                                            aria-label={t('terminal.search')}
                                            className="w-full bg-white/5 border border-white/[0.06] rounded-xl pl-10 pr-10 py-3 text-sm font-bold text-white outline-none focus:border-emerald-500/40 transition-all placeholder:text-white/15"
                                        />
                                        {searchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchTerm('')}
                                                aria-label={t('terminal.clearSearch') || "Aramayı temizle"}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/20"
                                            >
                                                <FiX size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto no-scrollbar min-h-0 pb-24 xl:pb-4">
                                    <ProductGrid searchTerm={debouncedSearchTerm} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <CartPanel />

                {/* ═══════ PREMIUM MOBILE BOTTOM NAVIGATION DOCK ═══════ */}
                <div className="xl:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0b0f19]/95 backdrop-blur-xl border-t border-white/[0.06] shadow-[0_-8px_30px_rgba(0,0,0,0.5)] px-4 flex items-center justify-between z-40 pb-safe">

                    {/* 1. View Toggler (Masalar / Menü) */}
                    <button
                        onClick={() => {
                            if (cashierView === 'menu') {
                                setCashierView('floor');
                                setOrderType('dine_in');
                            } else {
                                setCashierView('menu');
                                if (!selectedTable) setOrderType('takeaway');
                            }
                        }}
                        className={`flex-1 flex flex-col items-center justify-center h-full relative transition-all active:scale-95 ${
                            cashierView === 'floor' ? 'text-blue-400' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {cashierView === 'menu' ? <FiLayers size={18} /> : <FiShoppingBag size={18} />}
                        <span className="text-[9px] font-black uppercase tracking-wider mt-1">
                            {cashierView === 'menu' ? (t('nav.tables') || 'Masalar') : (t('nav.menu') || 'Menü')}
                        </span>
                        {cashierView === 'menu' && occupiedCount > 0 && (
                            <span className="absolute top-1 right-[20%] min-w-4 h-4 px-1 rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center border border-slate-900 leading-none">
                                {occupiedCount}
                            </span>
                        )}
                    </button>

                    {/* 2. Kitchen Status */}
                    <button
                        onClick={() => setKitchenStatus(true)}
                        className="flex-1 flex flex-col items-center justify-center h-full relative text-slate-400 hover:text-white transition-all active:scale-95"
                    >
                        <FiClock size={18} />
                        <span className="text-[9px] font-black uppercase tracking-wider mt-1">
                            {t('nav.kitchen') || 'Mutfak'}
                        </span>
                        {readyPackageLineCount > 0 && (
                            <span className="absolute top-1 right-[20%] min-w-4 h-4 px-1 rounded-full bg-gradient-to-br from-pink-600 to-rose-600 text-white text-[8px] font-bold flex items-center justify-center border border-slate-900 leading-none animate-pulse">
                                {readyPackageLineCount}
                            </span>
                        )}
                    </button>

                    {/* 3. SEPET (Middle FAB — Centered) */}
                    <div className="flex-1 flex justify-center h-full relative">
                        <button
                            onClick={() => setCartOpen(!isCartOpen)}
                            className={`w-14 h-14 rounded-full flex items-center justify-center absolute -top-5 shadow-2xl active:scale-95 transition-all duration-300 border ${
                                isCartOpen
                                    ? 'bg-gradient-to-tr from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 border-rose-400/40 shadow-rose-900/30'
                                    : 'bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border-emerald-400/40 shadow-emerald-900/40'
                            }`}
                        >
                            {isCartOpen ? (
                                <FiX size={22} className="text-white" />
                            ) : (
                                <FiShoppingBag size={22} className="text-white" />
                            )}
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-[#0b0f19] text-[9px] font-black flex items-center justify-center border-2 border-[#0b0f19] shadow-md shadow-amber-950/55 leading-none">
                                    {cartCount}
                                </span>
                            )}
                        </button>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-10">
                            {t('cart.title') || 'Sepet'}
                        </span>
                    </div>

                    {/* 4. Online Siparişler (B2B + WhatsApp + Caller ID popup) */}
                    <button
                        onClick={() => setShowOnlineSelect(prev => !prev)}
                        className={`flex-1 flex flex-col items-center justify-center h-full relative transition-all active:scale-95 ${
                            showOnlineSelect ? 'text-amber-400' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <FiMessageCircle size={18} />
                        <span className="text-[9px] font-black uppercase tracking-wider mt-1">
                            Online
                        </span>
                        {totalAlertCount > 0 && (
                            <span className="absolute top-1 right-[20%] min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[8px] font-bold flex items-center justify-center border border-slate-900 leading-none">
                                {totalAlertCount}
                            </span>
                        )}
                    </button>

                    {/* 5. Personel (Staff Menu) */}
                    <button
                        onClick={() => setStaffMenu(true)}
                        className="flex-1 flex flex-col items-center justify-center h-full relative text-slate-400 hover:text-white transition-all active:scale-95"
                    >
                        <FiMenu size={18} />
                        <span className="text-[9px] font-black uppercase tracking-wider mt-1">
                            {t('staff.panel_title') || 'Personel'}
                        </span>
                    </button>
                </div>

                {/* Online Siparişler Seçim Popup */}
                <AnimatePresence>
                    {showOnlineSelect && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="xl:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                                onClick={() => setShowOnlineSelect(false)}
                            />
                            <div className="xl:hidden">
                                <OnlineSelectPopup
                                    onClose={() => setShowOnlineSelect(false)}
                                    onB2B={() => setOnlineOrders(true)}
                                    onWhatsApp={() => {
                                        setWaOrder(true);
                                    }}
                                    onCallerID={() => {
                                        setCallerId(true);
                                    }}
                                    totalOnlineCount={totalOnlineCount}
                                    pendingWaOrders={pendingWaOrders}
                                    pendingCalls={pendingCalls}
                                    canUseWhatsApp={canUseWhatsAppOrders}
                                    canUseCallerId={canUseCallerId}
                                />
                            </div>
                        </>
                    )}
                </AnimatePresence>
            </main>

            <OnlineOrdersModal />
            <CallerIdModal />
            <CallerIdNotification />
            <CallerIdOrderTypeSelectorModal />
            <ProductModal />
            <KitchenStatusModal />
            <WaOrderModal />
            <StaffMenu />
            <StaffPanelModal />
        </div>
    );
};

export default PosTerminal;
