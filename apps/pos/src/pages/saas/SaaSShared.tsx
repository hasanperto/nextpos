import React, { useId } from 'react';
import { 
    FiX, FiTrendingUp, FiTrendingDown, FiChevronDown, FiAlertCircle, 
    FiInfo, FiCheckCircle, FiZap 
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════
// Pulse Pro Shared UI Components for SaaS Admin 2026
// ═══════════════════════════════════════

export const StatCard: React.FC<{ 
    label: string; 
    value: string | number; 
    icon: any; 
    color: string; 
    sub?: string;
    trend?: string;
    trendStatus?: 'up' | 'down' | 'stable';
    dense?: boolean;
}> = ({ label, value, icon, color, sub, trend, trendStatus, dense = false }) => {
    const colorMap: any = {
        emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 group-hover:border-emerald-500/40',
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20 group-hover:border-blue-500/40',
        sky: 'text-sky-500 bg-sky-500/10 border-sky-500/20 group-hover:border-sky-500/40',
        amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20 group-hover:border-amber-500/40',
        red: 'text-red-500 bg-red-500/10 border-red-500/20 group-hover:border-red-500/40',
        rose: 'text-rose-500 bg-rose-500/10 border-rose-500/20 group-hover:border-rose-500/40',
        indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20 group-hover:border-indigo-500/40',
        slate: 'text-slate-500 bg-slate-500/10 border-slate-500/20 group-hover:border-slate-500/40',
        purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20 group-hover:border-purple-500/40',
        cyan: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20 group-hover:border-cyan-500/40',
    };

    const cClasses = colorMap[color] || colorMap.blue;
    const isUp = trendStatus === 'up' || (trend && trend.startsWith('+'));
    const isDown = trendStatus === 'down' || (trend && trend.startsWith('-'));

    return (
        <motion.div 
            whileHover={{ y: -4, scale: 1.01 }}
            className={`bg-slate-900/40 backdrop-blur-3xl p-6 rounded-[32px] border border-white/5 transition-all group overflow-hidden relative shadow-2xl ${dense ? 'pb-4' : ''}`}
        >
            <div className={`absolute -right-6 -top-6 p-8 opacity-5 group-hover:opacity-15 transition-all duration-700 ${cClasses.split(' ')[0]} rotate-12 group-hover:rotate-0 scale-150`}>
                {React.cloneElement(icon, { size: 100 })}
            </div>
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex justify-between items-start relative z-10">
                <div className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{label}</div>
                {trend && (
                    <div className={`text-[10px] font-black px-2.5 py-1 rounded-xl border border-white/5 flex items-center gap-1 shadow-xl ${
                        isUp ? 'text-emerald-400 bg-emerald-500/10' : 
                        isDown ? 'text-rose-400 bg-rose-500/10' : 
                        'text-blue-400 bg-blue-500/10'
                    }`}>
                        {isUp ? <FiTrendingUp size={10} /> : isDown ? <FiTrendingDown size={10} /> : <FiInfo size={10} />}
                        {trend}
                    </div>
                )}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-3 sm:mt-4 tracking-tighter relative z-10 italic group-hover:translate-x-1 transition-transform min-w-0 max-w-full truncate">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {sub && (
                <div className="text-[10px] text-slate-500 mt-2 font-black relative z-10 uppercase tracking-widest opacity-60 flex items-center gap-1.5">
                    <span className={`w-1 h-1 rounded-full ${cClasses.split(' ')[0].replace('text-', 'bg-')} animate-pulse`} />
                    {sub}
                </div>
            )}
        </motion.div>
    );
};

export const MenuItem: React.FC<{ icon: any; label: string; active?: boolean; onClick?: () => void; badge?: number }> = ({ icon, label, active, onClick, badge }) => (
    <button onClick={onClick} className="w-full group relative overflow-hidden outline-none">
        <div className={`absolute inset-y-2 left-0 w-1 bg-blue-500 rounded-r-full transition-all duration-500 ${active ? 'opacity-100' : 'opacity-0 -translate-x-full'}`} />
        <div className={`flex items-center gap-4 px-6 py-4 mx-2 rounded-[24px] transition-all duration-400 relative z-10 ${
            active 
                ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/5 text-white shadow-[0_10px_30px_rgba(37,99,235,0.1)] border border-blue-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}>
            <span className={`transition-all duration-500 ${active ? 'text-blue-400 scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {React.cloneElement(icon, { size: 20 })}
            </span>
            <span className={`flex-1 text-left truncate text-xs font-black uppercase tracking-[0.15em] transition-all ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-xl shadow-rose-900/40 min-w-[22px] text-center animate-pulse border border-white/20">
                    {badge}
                </span>
            )}
        </div>
    </button>
);

export const InputGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string; id?: string }> = ({ label, value, onChange, type = 'text', placeholder, id }) => {
    const autoId = useId();
    const inputId = id || `input-${autoId}`;
    return (
        <div className="space-y-3">
            <label htmlFor={inputId} className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-2 block cursor-pointer">
                {label}
            </label>
            <input 
                id={inputId}
                type={type} 
                value={value} 
                onChange={(e) => onChange(e.target.value)} 
                className="w-full bg-white/[0.03] border border-white/10 rounded-[24px] px-6 py-4 text-sm text-white font-bold outline-none focus:border-blue-500/50 focus:bg-blue-500/10 transition-all shadow-inner placeholder:text-slate-700" 
                placeholder={placeholder} 
            />
        </div>
    );
};

export const SelectGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; options: { label: string; value: any }[] }> = ({ label, value, onChange, options }) => (
    <div className="space-y-3">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-2">{label}</label>
        <div className="relative group">
            <select 
                value={value} 
                onChange={(e) => onChange(e.target.value)} 
                className="w-full bg-white/[0.03] border border-white/10 rounded-[24px] px-6 py-4 text-sm text-white font-bold outline-none focus:border-blue-500/50 focus:bg-blue-500/10 transition-all appearance-none shadow-inner cursor-pointer"
            >
                {options.map(o => <option key={o.value} value={o.value} className="bg-[#0f172a] text-white py-2">{o.label}</option>)}
            </select>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-white transition-colors">
                <FiChevronDown size={20} />
            </div>
        </div>
    </div>
);

export const Modal: React.FC<{
    show: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
    titleUppercase?: boolean;
}> = ({ show, onClose, title, children, maxWidth = 'max-w-lg', titleUppercase = true }) => {
    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-2xl overflow-y-auto">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 40 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 40 }}
                        className={`bg-[#0a0f1d] border border-white/10 w-full ${maxWidth} flex flex-col max-h-fit rounded-[48px] overflow-hidden shadow-[0_0_120px_rgba(0,0,0,0.8)] relative my-auto`}
                    >
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-700 via-indigo-600 to-cyan-600" />
                        <div className="p-10 border-b border-white/5 flex justify-between items-center gap-4 bg-white/[0.02]">
                            <h3 className={`text-2xl font-black text-white tracking-tighter italic ${titleUppercase ? 'uppercase' : ''}`}>{title}</h3>
                            <button 
                                type="button" 
                                onClick={onClose} 
                                className="w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/5 shadow-2xl"
                            >
                                <FiX size={24} />
                            </button>
                        </div>
                        <div className="p-6 sm:p-8 md:p-10 custom-scrollbar flex-1 relative z-10 overflow-y-auto max-h-[70vh] sm:max-h-fit">
                            {children}
                        </div>
                        <div className="absolute bottom-0 right-0 p-20 opacity-[0.02] pointer-events-none">
                            <FiZap size={200} className="text-blue-500 rotate-12" />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export const SectionCard: React.FC<{
    title: string;
    icon?: any;
    children: React.ReactNode;
    action?: React.ReactNode;
    dense?: boolean;
}> = ({ title, icon, children, action, dense = false }) => {
    const innerPad = dense ? 'p-0' : 'p-8';

    return (
        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[48px] overflow-hidden shadow-2xl flex flex-col h-full group/card transition-all hover:border-white/10 relative">
            <div className="p-8 border-b border-white/5 bg-white/[0.02] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 shrink-0 relative z-10">
                <h3 className="text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-4 text-slate-400 group-hover/card:text-white transition-colors">
                    <span className="p-3 bg-white/5 rounded-2xl text-blue-500 shadow-xl border border-white/5 group-hover/card:scale-110 transition-transform">{icon && React.cloneElement(icon, { size: 16 })}</span>
                    <span className="truncate italic">{title}</span>
                </h3>
                {action && <div className="shrink-0 flex items-center relative z-20">{action}</div>}
            </div>
            <div className={`${innerPad} flex-1 overflow-visible relative z-10`}>{children}</div>
            
            {/* Glass decoration */}
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-600/5 blur-[100px] pointer-events-none" />
        </div>
    );
};

export const EmptyState: React.FC<{ icon: any; message: string }> = ({ icon, message }) => (
    <div className="text-center py-24 text-slate-500 flex flex-col items-center">
        <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-white/5 rounded-[40px] flex items-center justify-center mb-8 border border-white/5 text-slate-600 shadow-2xl group animate-pulse"
        >
            {React.cloneElement(icon, { size: 48, className: "opacity-40 group-hover:scale-110 transition-transform" })}
        </motion.div>
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-30 italic">{message}</p>
    </div>
);

export const ToggleGroup: React.FC<{ label: string; active: boolean; onChange: (v: boolean) => void }> = ({ label, active, onChange }) => (
    <div className="flex items-center justify-between p-6 bg-white/[0.03] rounded-[32px] border border-white/5 hover:border-blue-500/20 transition-all group/toggle shadow-inner">
        <div className="flex items-center gap-4">
            <div className={`p-2 rounded-xl border transition-colors ${active ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-slate-700/10 border-slate-700/20 text-slate-600'}`}>
                {active ? <FiCheckCircle size={14} /> : <FiAlertCircle size={14} />}
            </div>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest group-hover/toggle:text-white transition-colors">{label}</span>
        </div>
        <button 
            type="button"
            onClick={() => onChange(!active)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-500 outline-none shadow-2xl ${active ? 'bg-blue-600 shadow-blue-600/20' : 'bg-slate-800 shadow-inner'}`}
        >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-500 shadow-xl ${active ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);

export const TableLoadingState: React.FC<{ colSpan: number }> = ({ colSpan }) => (
    <tr>
        <td colSpan={colSpan} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">Synchronizing Data...</span>
            </div>
        </td>
    </tr>
);

export const TableEmptyState: React.FC<{ colSpan: number; icon: any; message: string }> = ({ colSpan, icon, message }) => (
    <tr>
        <td colSpan={colSpan}>
            <EmptyState icon={icon} message={message} />
        </td>
    </tr>
);
export const SubTab: React.FC<{ active: boolean; onClick: () => void; icon: any; label: string; count?: number }> = ({ active, onClick, icon, label, count }) => (
    <button
        onClick={onClick}
        className={`px-6 py-4 rounded-[20px] flex items-center gap-3 transition-all relative group h-14 ${
            active 
                ? 'bg-blue-600/20 text-white border border-blue-500/40 shadow-[0_0_40px_rgba(37,99,235,0.15)]' 
                : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/5'
        }`}
    >
        <span className={`transition-all duration-500 ${active ? 'text-blue-400 scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'text-slate-600 group-hover:text-slate-400'}`}>
            {React.cloneElement(icon, { size: 16 })}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap">{label}</span>
        {count !== undefined && count > 0 && (
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                active ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-slate-800/40 border-white/5 text-slate-500'
            }`}>
                {count}
            </span>
        )}
        {active && (
            <motion.div 
                layoutId="activeSubTab"
                className="absolute inset-0 border-2 border-blue-500/40 rounded-[20px] pointer-events-none"
            />
        )}
    </button>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: 'emerald' | 'rose' | 'amber' | 'blue' | 'slate' }> = ({ children, color = 'blue' }) => {
    const colors = {
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5',
        rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/5',
        amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/5',
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-500/5',
        slate: 'bg-slate-500/10 text-slate-400 border-slate-500/20 shadow-slate-500/5',
    };
    return (
        <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${colors[color]}`}>
            {children}
        </span>
    );
};
