import React from 'react';
import { FiPlus } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80";

export const ProductGrid: React.FC = () => {
    const { products, activeCategoryId, isLoading } = usePosStore();
    const { openProductModal } = useUIStore();

    const safeProducts = Array.isArray(products) ? products : [];

    const activeProducts = activeCategoryId === 0
        ? safeProducts.slice().sort((a, b) => Number(b.basePrice) - Number(a.basePrice)).slice(0, 8)
        : safeProducts.filter((p) => p.categoryId === activeCategoryId);

    const formatPrice = (price: number) => `€${price.toFixed(2)}`;

    if (isLoading && safeProducts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-xl text-[var(--color-pos-text-secondary)]">
                <span className="animate-spin text-5xl mb-4">↻</span>
                Menüler yükleniyor...
            </div>
        );
    }

    return (
        <section className="flex-1 bg-[var(--color-pos-bg-primary)] pos-scrollbar overflow-y-auto rounded-xl">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-2">
                {activeProducts.map((p) => {
                    const hasVariants = p.variants && p.variants.length > 0;
                    const defPrice = hasVariants
                        ? (p.variants.find((v: any) => v.isDefault)?.price || p.variants[0].price)
                        : p.basePrice;

                    return (
                        <div
                            key={p.id}
                            onClick={() => openProductModal(p)}
                            className="flex flex-col bg-[var(--color-pos-bg-secondary)] border border-[var(--color-pos-border-default)] rounded-2xl overflow-hidden cursor-pointer hover:-translate-y-1 hover:border-[var(--color-pos-info)] hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-200"
                        >
                            <div className="relative h-[140px] w-full overflow-hidden bg-[var(--color-pos-bg-tertiary)] flex items-center justify-center group">
                                <img
                                    src={p.imageUrl || DEFAULT_IMAGE}
                                    alt={p.displayName}
                                    className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${!p.imageUrl && 'opacity-60 grayscale-[30%]'}`}
                                />
                                {!p.imageUrl && (
                                    <div className="absolute inset-0 flex items-center justify-center text-[var(--color-pos-text-primary)] opacity-50 font-bold bg-black/40 text-xs tracking-widest uppercase">
                                        No Image
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <FiPlus size={20} className="text-white" />
                                </div>
                            </div>

                            <div className="p-4 flex flex-col flex-1 justify-between bg-[var(--color-pos-bg-secondary)] border-t border-[var(--color-pos-border-default)]">
                                <div className="text-[14px] font-bold text-[var(--color-pos-text-primary)] mb-1 leading-snug">
                                    {p.displayName}
                                </div>

                                <div className="flex items-center justify-between mt-auto pt-2">
                                    {hasVariants && <span className="text-[10px] bg-[var(--color-pos-bg-tertiary)] px-2 py-1 rounded text-[var(--color-pos-text-secondary)] font-bold">VARYANTLI</span>}
                                    <div className="font-mono text-[16px] font-black text-[var(--color-pos-info)] ml-auto drop-shadow-sm">
                                        {formatPrice(Number(defPrice))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
