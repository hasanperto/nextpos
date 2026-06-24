import React, { useId } from 'react';
import { 
    FiX, FiTrendingUp, FiTrendingDown, FiChevronDown, FiAlertCircle, 
    FiInfo, FiCheckCircle, FiZap 
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';

// ═══════════════════════════════════════
// Pulse Pro Shared UI Components for SaaS Admin 2026 - Minimal & Responsive
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
        emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
        blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10',
        sky: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10',
        amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
        red: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10',
        rose: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10',
        indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10',
        slate: 'text-slate-600 dark:text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-500/10',
        purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10',
        cyan: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10',
    };

    const cClasses = colorMap[color] || colorMap.blue;
    const isUp = trendStatus === 'up' || (trend && trend.startsWith('+'));
    const isDown = trendStatus === 'down' || (trend && trend.startsWith('-'));

    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${dense ? 'pb-4' : ''}`}>
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cClasses}`}>
                    {React.cloneElement(icon, { size: 16 })}
                </div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{label}</span>
            </div>
            
            <div className="text-2xl font-bold text-slate-800 dark:text-white truncate">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>

            {(sub || trend) && (
                <div className="flex items-center justify-between mt-2">
                    {sub && <div className="text-xs text-slate-500 dark:text-slate-400 truncate pr-2">{sub}</div>}
                    {trend && (
                        <div className={`text-xs font-medium flex items-center gap-1 ${
                            isUp ? 'text-emerald-500' : 
                            isDown ? 'text-rose-500' : 
                            'text-blue-500'
                        }`}>
                            {isUp ? <FiTrendingUp size={12} /> : isDown ? <FiTrendingDown size={12} /> : null}
                            {trend}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const MenuItem: React.FC<{ icon: any; label: string; active?: boolean; onClick?: () => void; badge?: number }> = ({ icon, label, active, onClick, badge }) => (
    <button onClick={onClick} className="w-full relative overflow-hidden outline-none flex items-center px-4 py-3 my-1 rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-white/5 bg-transparent dark:bg-transparent">

        <div className={`flex items-center gap-3 w-full ${
            active 
                ? 'text-blue-600 dark:text-blue-400 font-bold' 
                : 'text-slate-600 dark:text-slate-500 dark:text-slate-400 font-medium'
        }`}>
            <span className={`${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {React.cloneElement(icon, { size: 18 })}
            </span>
            <span className="flex-1 text-left truncate text-sm">{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className="bg-rose-500 text-slate-800 dark:text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">
                    {badge}
                </span>
            )}
        </div>
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 dark:bg-blue-500 rounded-r-full" />}
    </button>
);

export const InputGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string; id?: string }> = ({ label, value, onChange, type = 'text', placeholder, id }) => {
    const autoId = useId();
    const inputId = id || `input-${autoId}`;
    return (
        <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-xs font-semibold text-slate-600 dark:text-slate-500 dark:text-slate-400 px-1 block cursor-pointer">
                {label}
            </label>
            <input 
                id={inputId}
                type={type} 
                value={value} 
                onChange={(e) => onChange(e.target.value)} 
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-500 dark:text-slate-400" 
                placeholder={placeholder} 
            />
        </div>
    );
};

export const SelectGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; options: { label: string; value: any }[] }> = ({ label, value, onChange, options }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-500 dark:text-slate-400 px-1 block">{label}</label>
        <div className="relative group">
            <select 
                value={value} 
                onChange={(e) => onChange(e.target.value)} 
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-slate-400">
                <FiChevronDown size={18} />
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
}> = ({ show, onClose, title, children, maxWidth = 'max-w-lg', titleUppercase = false }) => {
    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full ${maxWidth} flex flex-col max-h-fit rounded-2xl overflow-hidden shadow-sm relative my-auto`}
                    >
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900">
                            <h3 className={`text-lg font-bold text-slate-800 dark:text-white ${titleUppercase ? 'uppercase tracking-wide text-sm' : ''}`}>{title}</h3>
                            <button 
                                type="button" 
                                onClick={onClose} 
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-100 dark:bg-slate-800 transition-colors"
                            >
                                <FiX size={20} />
                            </button>
                        </div>
                        <div className="p-6 custom-scrollbar flex-1 relative z-10 overflow-y-auto max-h-[80vh] sm:max-h-fit">
                            {children}
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
    const innerPad = dense ? 'p-0' : 'p-5 sm:p-6';

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm uppercase tracking-wide">
                    {icon && <span className="text-slate-500 dark:text-slate-400">{React.cloneElement(icon, { size: 16 })}</span>}
                    {title}
                </h3>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            <div className={`${innerPad} flex-1 overflow-auto`}>{children}</div>
        </div>
    );
};

export const EmptyState: React.FC<{ icon: any; message: string }> = ({ icon, message }) => (
    <div className="text-center py-16 text-slate-500 flex flex-col items-center">
        <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-4 text-slate-500 dark:text-slate-400">
            {React.cloneElement(icon, { size: 28 })}
        </div>
        <p className="text-sm font-medium">{message}</p>
    </div>
);

export const ToggleGroup: React.FC<{ label: string; active: boolean; onChange: (v: boolean) => void }> = ({ label, active, onChange }) => (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors">
        <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-600 dark:text-slate-500 dark:text-slate-400">{label}</span>
        </div>
        <button 
            type="button"
            onClick={() => onChange(!active)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${active ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);

export const TableLoadingState: React.FC<{ colSpan: number }> = ({ colSpan }) => {
    const { t } = useSaaSLocale();
    return (
        <tr>
            <td colSpan={colSpan} className="py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-xs font-semibold text-slate-500 animate-pulse">{t('common.syncing')}</span>
                </div>
            </td>
        </tr>
    );
};

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
        className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors relative whitespace-nowrap text-sm font-medium ${
            active 
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 bg-transparent dark:bg-transparent'
        }`}
    >
        <span>{React.cloneElement(icon, { size: 16 })}</span>
        <span>{label}</span>
        {count !== undefined && count > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-md ml-1 ${
                active ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
            }`}>
                {count}
            </span>
        )}
    </button>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: 'emerald' | 'rose' | 'amber' | 'blue' | 'slate' }> = ({ children, color = 'blue' }) => {
    const colors = {
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
        rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-500 dark:text-slate-400',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[color]}`}>
            {children}
        </span>
    );
};

export const BottomNavItem: React.FC<{ icon: any; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 min-w-[60px] h-full transition-colors ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-600 dark:text-slate-500 dark:text-slate-400'}`}>
        <div className="p-1">
            {React.cloneElement(icon, { size: 20 })}
        </div>
        <span className="text-[10px] font-semibold truncate max-w-full px-1">{label}</span>
    </button>
);