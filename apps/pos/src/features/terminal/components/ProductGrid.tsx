import React from 'react';
import { FiPlus } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=60";

// Variant size label shortener
function shortLabel(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('küçük') || n.includes('small') || n === 's') return 'S';
    if (n.includes('orta') || n.includes('medium') || n === 'm') return 'M';
    if (n.includes('büyük') || n.includes('large') || n === 'l') return 'L';
    if (n.includes('xl') || n.includes('extra')) return 'XL';
    if (n.length <= 3) return n.toUpperCase();
    return name.slice(0, 4);
}

interface ProductGridProps {
    searchTerm?: string;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ searchTerm = '' }) => {
    const { products, activeCategoryId, isLoading, addToCart, settings } = usePosStore();
    const { openProductModal } = useUIStore();

    const safeProducts = Array.isArray(products) ? products : [];

    // Filter by category
    let activeProducts = activeCategoryId === 0
        ? safeProducts.slice().sort((a, b) => Number(b.basePrice) - Number(a.basePrice)).slice(0, 20)
        : safeProducts.filter((p) => p.categoryId === activeCategoryId);

    // Filter by search
    if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        activeProducts = safeProducts.filter(p => 
            (p.displayName || p.name).toLowerCase().includes(q)
        );
    }

    const currencySymbol = settings?.currency || '₺';
    const formatPrice = (price: number) => `${currencySymbol}${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    if (isLoading && safeProducts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-30">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                <span className="text-sm font-bold text-white/40 uppercase tracking-widest">Yükleniyor...</span>
            </div>
        );
    }

    if (activeProducts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-20 p-10">
                <span className="text-5xl">🍽️</span>
                <p className="text-sm font-bold text-white uppercase tracking-widest">Ürün bulunamadı</p>
            </div>
        );
    }

    return (
        <section className="flex-1 bg-transparent overflow-y-auto no-scrollbar">
            <AnimatePresence mode="popLayout">
                <motion.div 
                    layout
                    className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 p-5"
                >
                    {activeProducts.map((p, idx) => {
                        const hasVariants = p.variants && p.variants.length > 0;
                        const defVariant = hasVariants ? (p.variants.find((v: any) => v.isDefault) || p.variants[0]) : null;
                        const defPrice = defVariant ? defVariant.price : p.basePrice;

                        return (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.25, delay: idx * 0.015 }}
                                key={p.id}
                                className="flex flex-col bg-[#111827] border border-white/[0.06] rounded-2xl overflow-hidden cursor-pointer group hover:border-emerald-500/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-200"
                            >
                                {/* Product Image */}
                                <div 
                                    className="relative h-[130px] w-full overflow-hidden bg-black/50"
                                    onClick={() => openProductModal(p)}
                                >
                                    <img
                                        src={p.imageUrl || DEFAULT_IMAGE}
                                        alt={p.displayName}
                                        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${!p.imageUrl && 'opacity-30 grayscale'}`}
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#111827] via-transparent to-transparent opacity-90" />
                                    
                                    {/* Quick Add Overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                            <FiPlus size={24} />
                                        </div>
                                    </div>
                                </div>

                                {/* Product Info */}
                                <div className="p-3 flex flex-col flex-1 gap-2">
                                    <h4 
                                        className="text-[13px] font-black text-white leading-tight tracking-tight line-clamp-2 group-hover:text-emerald-400 transition-colors cursor-pointer"
                                        onClick={() => openProductModal(p)}
                                    >
                                        {p.displayName}
                                        {hasVariants && <span className="text-[10px] font-bold text-white/30 ml-1">(S/M/L)</span>}
                                    </h4>

                                    {/* Variant Buttons or Simple Price */}
                                    {hasVariants ? (
                                        <div className={`${p.variants.length > 4 ? 'grid grid-cols-3' : 'flex items-center'} gap-1 mt-auto w-full`}>
                                            {p.variants.map((v: any, vi: number) => {
                                                const variantColors = [
                                                    'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30',
                                                    'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30',
                                                    'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30',
                                                    'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30',
                                                    'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30',
                                                    'bg-teal-600 hover:bg-teal-500 shadow-teal-900/30',
                                                ];
                                                const count = p.variants.length;
                                                // Dynamically adjust font size and padding based on count
                                                const isTight = count > 3;
                                                const isVeryTight = count > 5;
                                                
                                                return (
                                                    <button
                                                        key={v.id}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            addToCart(p, v, []);
                                                        }}
                                                        className={`flex flex-col items-center justify-center ${count > 4 ? 'min-h-[44px]' : 'flex-1'} ${isVeryTight ? 'py-1' : 'py-1.5'} rounded-lg ${variantColors[vi % variantColors.length]} text-white transition-all active:scale-95 shadow-md min-w-0 overflow-hidden`}
                                                        title={v.displayName || v.name}
                                                        aria-label={`${p.displayName} - ${v.displayName || v.name} ekle`}
                                                    >
                                                        <span className={`${isTight ? 'text-[10px]' : 'text-[11px]'} font-black leading-none truncate w-full text-center px-0.5`}>
                                                            {shortLabel(v.displayName || v.name)}
                                                        </span>
                                                        <span className="text-[10px] font-bold opacity-80 leading-tight mt-0.5 truncate w-full text-center px-0.5">
                                                            {formatPrice(Number(v.price))}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between mt-auto">
                                            <span className="text-lg font-black text-white tabular-nums tracking-tight">
                                                {formatPrice(Number(defPrice))}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    addToCart(p, null, []);
                                                }}
                                                className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-900/30 transition-all active:scale-90"
                                                aria-label={`${p.displayName} sepete ekle`}
                                                title={`${p.displayName} sepete ekle`}
                                            >
                                                <FiPlus size={20} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </section>
    );
};
