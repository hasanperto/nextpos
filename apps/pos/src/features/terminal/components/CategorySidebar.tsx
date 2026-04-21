import React from 'react';
import { FaPizzaSlice, FaBurger, FaIceCream, FaGlassWater, FaCookie } from 'react-icons/fa6';
import { GiMeat, GiDonerKebab } from 'react-icons/gi';
import { FiStar } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { usePosStore } from '../../../store/usePosStore';

export const getCategoryIcon = (iconName: string, size = 26) => {
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
        <aside className="w-[120px] flex gap-3 flex-col pos-scrollbar overflow-y-auto pb-6 relative group">
            <div className="absolute inset-0 bg-white/[0.01] -z-10 rounded-[2rem]" />
            
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveCategory(0)}
                className={`flex flex-col items-center justify-center h-[110px] shrink-0 rounded-[2.5rem] transition-all border relative overflow-hidden group/btn
              ${activeCategoryId === 0
                        ? 'bg-amber-500 border-amber-400 text-white shadow-[0_0_30px_rgba(245,158,11,0.2)]'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'}`}
            >
                {activeCategoryId === 0 && (
                    <motion.div layoutId="cat-active-glow" className="absolute inset-x-0 bottom-0 h-1 bg-white/50 blur-[2px]" />
                )}
                <span className="text-3xl mb-2 filter drop-shadow-[0_0_10px_rgba(245,158,11,0.4)] group-hover/btn:scale-110 transition-transform">⭐</span>
                <span className="font-black text-[10px] tracking-[0.2em] text-center px-1 uppercase leading-tight">POpüler</span>
            </motion.button>

            <div className="flex flex-col gap-3">
                {isLoading && safeCategories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-20">
                         <div className="w-8 h-8 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
                    </div>
                ) : (
                    safeCategories.map((cat: any) => (
                        <motion.button
                            layout
                            key={cat.id}
                            whileHover={{ scale: 1.02, x: 2 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`flex flex-col items-center justify-center gap-3 w-full h-[110px] rounded-[2.5rem] border transition-all duration-300 relative overflow-hidden group/btn
                    ${activeCategoryId === cat.id
                                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_40px_rgba(16,185,129,0.2)]'
                                    : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10 hover:text-slate-300'
                                }`}
                        >
                            {activeCategoryId === cat.id && (
                                <motion.div layoutId="cat-active-glow" className="absolute inset-x-0 bottom-0 h-1 bg-white/50 blur-[2px]" />
                            )}
                            <div className={`transition-transform duration-500 ${activeCategoryId === cat.id ? 'scale-110 text-white' : 'group-hover/btn:scale-110 text-slate-500 group-hover/btn:text-slate-300'}`}>
                                {getCategoryIcon(cat.icon, 30)}
                            </div>
                            <span className="text-[10px] font-black text-center leading-tight px-1 uppercase tracking-[0.1em]">{cat.displayName}</span>
                        </motion.button>
                    ))
                )}
            </div>
        </aside>
    );
};
