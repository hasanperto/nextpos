import React from 'react';
import { FaPizzaSlice, FaBurger, FaIceCream, FaGlassWater, FaCookie } from 'react-icons/fa6';
import { GiMeat, GiDonerKebab } from 'react-icons/gi';
import { FiStar } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';

export const getCategoryIcon = (iconName: string, size = 24) => {
    switch (iconName) {
        case 'star': return <FiStar size={size} />;
        case 'pizza-slice': return <FaPizzaSlice size={size} />;
        case 'drumstick-bite': return <GiMeat size={size} />;
        case 'utensils': return <GiDonerKebab size={size} />;
        case 'cookie': return <FaCookie size={size} />;
        case 'cake-candles': return <FaIceCream size={size} />;
        case 'glass-water': return <FaGlassWater size={size} />;
        default: return <FaBurger size={size} />;
    }
};

export const CategorySidebar: React.FC = () => {
    const { activeCategoryId, setActiveCategory, categories, isLoading } = usePosStore();
    const safeCategories = Array.isArray(categories) ? categories : [];

    return (
        <aside className="w-[124px] flex gap-2 flex-col pos-scrollbar overflow-y-auto pb-4">
            <button
                onClick={() => setActiveCategory(0)}
                className={`flex flex-col items-center justify-center py-3 mb-2 rounded-xl transition-all border transform active:scale-95
              ${activeCategoryId === 0
                        ? 'bg-amber-500 border-amber-500 text-white shadow-[var(--shadow-glow)] shadow-amber-500/30'
                        : 'bg-[var(--color-pos-bg-secondary)] border-[var(--color-pos-border-default)] hover:bg-[var(--color-pos-bg-tertiary)]'}`}
            >
                <span className="text-[28px] mb-1">⭐</span>
                <span className="font-black text-[11px] tracking-wider text-center px-1 uppercase">POpüler</span>
            </button>

            <div className="grid grid-cols-1 gap-2">
                {isLoading && safeCategories.length === 0 ? (
                    <div className="text-center text-sm py-4">Yükleniyor...</div>
                ) : (
                    safeCategories.map((cat: any) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`flex flex-col items-center justify-center gap-2 w-full h-[95px] rounded-[16px] border border-transparent transition-all duration-300 transform active:scale-95
                    ${activeCategoryId === cat.id
                                    ? 'bg-[var(--color-pos-accent-primary)] text-white shadow-[var(--shadow-glow)] shadow-emerald-500/20'
                                    : 'bg-[var(--color-pos-bg-secondary)] text-[var(--color-pos-text-primary)] hover:bg-[var(--color-pos-bg-tertiary)] border-[var(--color-pos-border-default)]'
                                }`}
                        >
                            {getCategoryIcon(cat.icon, 28)}
                            <span className="text-[12px] font-bold text-center leading-tight px-1">{cat.displayName}</span>
                        </button>
                    ))
                )}
            </div>
        </aside>
    );
};
