import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch, FiShoppingBag, FiX, FiStar, FiGrid } from 'react-icons/fi';
import * as FaIcons from 'react-icons/fa';

import { motion, AnimatePresence } from 'framer-motion';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';
import { Header } from '../components/layout/Header';
import { CartPanel } from '../features/terminal/components/CartPanel';
import { TableFloorGrid } from '../features/terminal/components/TableFloorGrid';
import { OnlineOrdersModal } from '../features/terminal/components/OnlineOrdersModal';
import { CallerIdModal } from '../features/terminal/components/CallerIdModal';
import { CallerIdNotification } from '../features/terminal/components/CallerIdNotification';
import { KitchenStatusModal } from '../features/kitchen/components/KitchenStatusModal';
import { WaOrderModal } from '../features/terminal/components/WaOrderModal';
import { ProductGrid } from '../features/terminal/components/ProductGrid';
import { ProductModal } from '../features/terminal/components/ProductModal';
import { StaffMenu } from '../features/terminal/components/StaffMenu';
import { StaffPanelModal } from '../features/terminal/components/StaffPanelModal';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { BillingWarning } from '../components/BillingWarning';

import { useCashierRealtimeSync } from '../hooks/useCashierRealtimeSync';

// Category icon map — fallback to grid
const CATEGORY_ICONS: Record<string, string> = {
    pizza: '🍕', kebap: '🥙', kebab: '🥙', döner: '🌯', doner: '🌯',
    tatlı: '🍰', tatli: '🍰', dessert: '🍰', içecek: '🥤', icecek: '🥤',
    drink: '🥤', salata: '🥗', salad: '🥗', çorba: '🍲', corba: '🍲',
    soup: '🍲', burger: '🍔', makarna: '🍝', pasta: '🍝', kahvaltı: '🍳',
    meze: '🫒', atıştırmalık: '🍿', snack: '🍿', tavuk: '🍗', chicken: '🍗',
    et: '🥩', meat: '🥩', balık: '🐟', fish: '🐟', kahve: '☕', coffee: '☕',
};

function getCategoryEmoji(name: string): string {
    const lower = name.toLowerCase().replace(/\s/g, '');
    for (const [key, emoji] of Object.entries(CATEGORY_ICONS)) {
        if (lower.includes(key)) return emoji;
    }
    return '🍽️';
}

const CategoryIcon = ({ iconName, name, className }: { iconName?: string; name: string; className?: string }) => {
    if (!iconName || iconName === 'utensils') {
        return <span className={className}>{getCategoryEmoji(name)}</span>;
    }
    
    // Check if it's an emoji
    if (/\p{Emoji}/u.test(iconName)) return <span className={className}>{iconName}</span>;
    
    const iconKey = iconName.startsWith('Fa') ? iconName : `Fa${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`;
    const IconComponent = (FaIcons as any)[iconKey];
    
    if (IconComponent) return <IconComponent className={className} />;
    return <span className={className}>{getCategoryEmoji(name)}</span>;
};


// Premium color palette for category cards
const CATEGORY_COLORS = [
    { bg: 'from-amber-600/30 to-amber-800/20', border: 'border-amber-500/40', activeBg: 'from-amber-500 to-amber-700', text: 'text-amber-400', activeText: 'text-white' },
    { bg: 'from-emerald-600/30 to-emerald-800/20', border: 'border-emerald-500/40', activeBg: 'from-emerald-500 to-emerald-700', text: 'text-emerald-400', activeText: 'text-white' },
    { bg: 'from-blue-600/30 to-blue-800/20', border: 'border-blue-500/40', activeBg: 'from-blue-500 to-blue-700', text: 'text-blue-400', activeText: 'text-white' },
    { bg: 'from-rose-600/30 to-rose-800/20', border: 'border-rose-500/40', activeBg: 'from-rose-500 to-rose-700', text: 'text-rose-400', activeText: 'text-white' },
    { bg: 'from-purple-600/30 to-purple-800/20', border: 'border-purple-500/40', activeBg: 'from-purple-500 to-purple-700', text: 'text-purple-400', activeText: 'text-white' },
    { bg: 'from-cyan-600/30 to-cyan-800/20', border: 'border-cyan-500/40', activeBg: 'from-cyan-500 to-cyan-700', text: 'text-cyan-400', activeText: 'text-white' },
    { bg: 'from-orange-600/30 to-orange-800/20', border: 'border-orange-500/40', activeBg: 'from-orange-500 to-orange-700', text: 'text-orange-400', activeText: 'text-white' },
    { bg: 'from-teal-600/30 to-teal-800/20', border: 'border-teal-500/40', activeBg: 'from-teal-500 to-teal-700', text: 'text-teal-400', activeText: 'text-white' },
];

const PosTerminal: React.FC = () => {
    const { 
        fetchSettings, fetchProducts, fetchCategories,
        cashierView, selectedTable, 
        setActiveCategory, activeCategoryId, categories
    } = usePosStore();
    const { isCartOpen, setCartOpen } = useUIStore();
    const { user } = useAuthStore();
    const { t } = usePosLocale();

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const searchRef = useRef<HTMLInputElement | null>(null);

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

    const hotkeysHint = useMemo(() => {
        return 'F3: Ürün ara · ESC: Temizle/Kapat · F2: Sepet';
    }, []);

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
    }, [searchTerm, setCartOpen]);

    const activeCat = categories.find(c => c.id === activeCategoryId);

    return (
        <div className="flex flex-col h-screen bg-[#0a0e1a] text-slate-200 overflow-hidden select-none font-sans">
            <Header />
            <BillingWarning />

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
                            <div className="w-[180px] xl:w-[200px] flex flex-col bg-[#0d1220] border-r border-white/[0.06] overflow-hidden shrink-0">
                                <div className="p-4 pb-3 border-b border-white/[0.04]">
                                    <div className="flex items-center gap-2">
                                        <FiGrid size={14} className="text-emerald-500" />
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.15em]">
                                            {t('terminal.categories') || 'Kategoriler'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                                    <button
                                        onClick={() => setActiveCategory(0)}
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
                                                    onClick={() => setActiveCategory(cat.id)}
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
                            </div>

                            {/* ═══════ CENTER: PRODUCTS ═══════ */}
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0e1a]">
                                <div className="flex items-center gap-4 px-5 py-3 border-b border-white/[0.05] bg-[#0d1220]/80">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="text-2xl">
                                            {activeCat ? (
                                                <CategoryIcon iconName={activeCat.icon} name={activeCat.displayName || activeCat.name} />
                                            ) : '⭐'}
                                        </div>

                                        <div className="flex flex-col min-w-0">
                                            <h2 className="text-lg font-black text-white tracking-tight truncate">
                                                {activeCat?.displayName || activeCat?.name || t('terminal.all') || 'Favoriler'}
                                            </h2>
                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                                                {selectedTable ? `${selectedTable.name} — ${selectedTable.sectionName}` : 'Hızlı Satış'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="relative w-60">
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
                                                aria-label="Aramayı temizle"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/20"
                                            >
                                                <FiX size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto no-scrollbar">
                                    <ProductGrid searchTerm={debouncedSearchTerm} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <CartPanel />

                <div className="xl:hidden fixed bottom-6 right-6 z-50">
                    <button
                        onClick={() => setCartOpen(!isCartOpen)}
                        aria-label={isCartOpen ? 'Sepeti kapat' : 'Sepeti aç'}
                        title={hotkeysHint}
                        className="w-16 h-16 bg-emerald-600 text-white rounded-2xl shadow-2xl shadow-emerald-900/40 flex items-center justify-center active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-white/20"
                    >
                        {isCartOpen ? <FiX size={24} /> : <FiShoppingBag size={24} />}
                    </button>
                </div>
            </main>

            <OnlineOrdersModal />
            <CallerIdModal />
            <CallerIdNotification />
            <ProductModal />
            <KitchenStatusModal />
            <WaOrderModal />
            <StaffMenu />
            <StaffPanelModal />
        </div>


    );
};

export default PosTerminal;
