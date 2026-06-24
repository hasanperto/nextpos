import React from 'react';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
    label?: string;
    value: string | number;
    onChange: (v: string) => void;
    icon?: React.ReactNode;
    options: { v: string | number; l: string }[];
}

export const Select: React.FC<SelectProps> = ({
    label,
    value,
    onChange,
    icon,
    options,
    className = '',
    ...props
}) => {
    return (
        <div className="group w-full">
            {label && (
                <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest group-focus-within:text-emerald-400 transition-colors">
                    {label}
                </label>
            )}
            <div className="relative flex items-center">
                {icon && (
                    <div className="absolute left-4 text-slate-400 group-focus-within:text-emerald-400 transition-colors pointer-events-none">
                        {icon}
                    </div>
                )}
                <select
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full rounded-2xl border border-white/10 bg-white/5 ${
                        icon ? 'pl-11' : 'px-5'
                    } py-3.5 text-sm font-bold text-white outline-none focus:border-emerald-500/50 focus:bg-white/[0.08] transition-all ${className}`}
                    {...props}
                >
                    {options.map((o) => (
                        <option key={o.v} value={o.v} className="bg-slate-900 text-white">
                            {o.l}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};
