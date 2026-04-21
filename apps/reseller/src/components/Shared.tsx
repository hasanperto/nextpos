import type React from 'react';

export function MenuItem({ icon, label, active, onClick, badge }: {
    icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold transition-all group relative
                ${active ? 'bg-blue-600/15 text-blue-400 shadow-lg shadow-blue-600/5' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
        >
            <span className={`transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</span>
            {label}
            {badge != null && badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">{badge}</span>
            )}
        </button>
    );
}

export function StatCard({ label, value, icon, color = 'blue' }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
    const cls: Record<string, string> = {
        blue: 'from-blue-600/15 border-blue-500/20 text-blue-400',
        emerald: 'from-emerald-600/15 border-emerald-500/20 text-emerald-400',
        orange: 'from-orange-600/15 border-orange-500/20 text-orange-400',
        red: 'from-red-600/15 border-red-500/20 text-red-400',
        indigo: 'from-indigo-600/15 border-indigo-500/20 text-indigo-400',
    };
    const accent = (cls[color] || cls.blue).split(' ').pop();
    return (
        <div className={`bg-gradient-to-br ${cls[color] || cls.blue} border rounded-2xl p-5 relative overflow-hidden`}>
            <div className="absolute top-3 right-3 opacity-10 scale-150">{icon}</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</div>
            <div className={`text-2xl font-black ${accent}`}>{value}</div>
        </div>
    );
}

export function Modal({ show, onClose, title, children, className }: {
    show: boolean; onClose: () => void; title: string; children: React.ReactNode;
    /** örn. max-w-2xl */
    className?: string;
}) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-slate-900 border border-white/10 w-full ${className || 'max-w-xl'} rounded-2xl overflow-hidden shadow-2xl animate-zoom max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">{title}</h3>
                    <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-lg">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 min-h-0">{children}</div>
            </div>
        </div>
    );
}

export function EmptyState({ text }: { text: string }) {
    return (
        <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/5">
            <span className="text-slate-500 text-xs font-bold">{text}</span>
        </div>
    );
}

export function Input({
    label,
    value,
    onChange,
    type = 'text',
    placeholder,
    required,
    icon,
    inputMode,
    maxLength,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    required?: boolean;
    icon?: React.ReactNode;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    maxLength?: number;
}) {
    return (
        <div className="relative">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                inputMode={inputMode}
                maxLength={maxLength}
                className={`w-full bg-white/5 border border-white/10 rounded-xl py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600 ${icon ? 'pl-10 pr-4' : 'px-4'}`}
            />
            {icon ? <span className="absolute left-3 top-[31px] text-slate-500">{icon}</span> : null}
        </div>
    );
}

export function Select({ label, value, onChange, options }: {
    label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
    return (
        <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">{label}</label>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}
