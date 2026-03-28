import React from 'react';
import { FiX, FiSearch, FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

// ═══════════════════════════════════════
// Shared UI Components for SaaS Admin
// ═══════════════════════════════════════

export const StatCard: React.FC<{ 
    label: string; 
    value: string | number; 
    icon: any; 
    color: string; 
    sub?: string;
    trend?: string;
}> = ({ label, value, icon, color, sub, trend }) => {
    const colorMap: any = {
        emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30 group-hover:border-emerald-500/50',
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/30 group-hover:border-blue-500/50',
        amber: 'text-amber-500 bg-amber-500/10 border-amber-500/30 group-hover:border-amber-500/50',
        red: 'text-red-500 bg-red-500/10 border-red-500/30 group-hover:border-red-500/50',
        indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30 group-hover:border-indigo-500/50',
        slate: 'text-slate-500 bg-slate-500/10 border-slate-500/30 group-hover:border-slate-500/50',
    };

    const cClasses = colorMap[color] || colorMap.blue;

    return (
        <div className={`bg-white/5 p-6 rounded-[24px] border border-white/10 transition-all group overflow-hidden relative ${cClasses.split(' ').slice(2).join(' ')}`}>
            <div className={`absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-all ${cClasses.split(' ')[0]}`}>
                {React.cloneElement(icon, { size: 60 })}
            </div>
            <div className="flex justify-between items-start">
                <div className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{label}</div>
                {trend && (
                    <div className={`text-[10px] font-bold flex items-center gap-1 ${trend.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trend.startsWith('+') ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />}
                        {trend}
                    </div>
                )}
            </div>
            <div className="text-2xl font-black text-white mt-1 tracking-tighter">{value}</div>
            {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
        </div>
    );
};

export const MenuItem: React.FC<{ icon: any; label: string; active?: boolean; onClick?: () => void; badge?: number }> = ({ icon, label, active, onClick, badge }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-5 py-3 rounded-xl transition-all font-bold text-sm ${
        active ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
    }`}>
        {React.cloneElement(icon, { size: 18 })}
        <span className="flex-1 text-left">{label}</span>
        {badge !== undefined && badge > 0 && <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badge}</span>}
    </button>
);

export const InputGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string }> = ({ label, value, onChange, type = 'text', placeholder }) => (
    <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{label}</label>
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-all" placeholder={placeholder} />
    </div>
);

export const SelectGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; options: { label: string; value: any }[] }> = ({ label, value, onChange, options }) => (
    <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{label}</label>
        <div className="relative">
            <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-all appearance-none">
                {options.map(o => <option key={o.value} value={o.value} className="bg-[#1E293B]">{o.label}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
        </div>
    </div>
);

export const Modal: React.FC<{ show: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string }> = ({ show, onClose, title, children, maxWidth = 'max-w-lg' }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <div className={`bg-slate-900 border border-white/10 w-full ${maxWidth} rounded-[24px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200`}>
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <h3 className="text-xl font-black text-white">{title.toUpperCase()}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"><FiX size={20} /></button>
                </div>
                <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

export const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
    <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Ara...'} className="bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none w-60 text-white" />
    </div>
);

export const SectionCard: React.FC<{ title: string; icon?: any; children: React.ReactNode; action?: React.ReactNode }> = ({ title, icon, children, action }) => (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
            <h3 className="text-lg font-bold flex items-center gap-2 text-white">{icon} {title}</h3>
            {action}
        </div>
        <div className="p-6">{children}</div>
    </div>
);

export const Badge: React.FC<{ text: string; color?: string }> = ({ text, color = 'blue' }) => {
    const colorMap: any = {
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        red: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return (
        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${colorMap[color] || colorMap.blue}`}>{text}</span>
    );
};

export const EmptyState: React.FC<{ icon: any; message: string }> = ({ icon, message }) => (
    <div className="text-center py-16 text-slate-500">
        <div className="mx-auto mb-3 opacity-30 flex justify-center">{React.cloneElement(icon, { size: 48 })}</div>
        <p className="text-sm font-medium">{message}</p>
    </div>
);

export const TableEmptyState: React.FC<{ icon: any; message: string; colSpan: number }> = ({ icon, message, colSpan }) => (
    <tr>
        <td colSpan={colSpan} className="px-6 py-20 text-center animate-in fade-in duration-700">
            <div className="flex flex-col items-center opacity-40">
                <div className="mb-4 p-4 bg-slate-800/10 rounded-full border border-white/5">{React.cloneElement(icon, { size: 40, className: "text-slate-500" })}</div>
                <p className="text-sm font-bold text-slate-500 tracking-tight">{message}</p>
            </div>
        </td>
    </tr>
);

export const TableLoadingState: React.FC<{ rows?: number; colSpan: number }> = ({ rows = 5, colSpan }) => (
    <>
        {Array(rows).fill(0).map((_, i) => (
            <tr key={i} className="animate-pulse">
                <td colSpan={colSpan} className="px-6 py-4">
                    <div className="h-12 bg-white/5 rounded-2xl w-full"></div>
                </td>
            </tr>
        ))}
    </>
);
