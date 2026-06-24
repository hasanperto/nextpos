import React from 'react';

export type MaskType = 'phone' | 'price' | 'date' | 'tax' | 'pin' | 'number';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    label?: string;
    value: string | number;
    onChange: (v: string) => void;
    icon?: React.ReactNode;
    mask?: MaskType | ((val: string) => string);
}

export const applyMask = (val: string, mask?: MaskType | ((val: string) => string)): string => {
    if (!mask) return val;
    if (typeof mask === 'function') return mask(val);

    switch (mask) {
        case 'phone': {
            const clean = val.replace(/\D/g, '').slice(0, 11);
            if (clean.length <= 4) return clean;
            if (clean.length <= 7) return `${clean.slice(0, 4)} ${clean.slice(4)}`;
            if (clean.length <= 9) return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
            return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7, 9)} ${clean.slice(9)}`;
        }
        case 'price': {
            // Allows numbers and at most one dot/comma
            let clean = val.replace(/[^0-9.,]/g, '');
            // Replace comma with dot
            clean = clean.replace(/,/g, '.');
            // Restrict to single dot
            const parts = clean.split('.');
            if (parts.length > 2) {
                return `${parts[0]}.${parts.slice(1).join('')}`;
            }
            return clean;
        }
        case 'date': {
            const clean = val.replace(/\D/g, '').slice(0, 8);
            if (clean.length <= 2) return clean;
            if (clean.length <= 4) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
            return `${clean.slice(0, 2)}.${clean.slice(2, 4)}.${clean.slice(4)}`;
        }
        case 'tax': {
            return val.replace(/\D/g, '').slice(0, 10);
        }
        case 'pin': {
            return val.replace(/\D/g, '').slice(0, 6);
        }
        case 'number': {
            return val.replace(/\D/g, '');
        }
        default:
            return val;
    }
};

export const Input: React.FC<InputProps> = ({
    label,
    value,
    onChange,
    icon,
    mask,
    className = '',
    placeholder,
    type = 'text',
    ...props
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange(applyMask(val, mask));
    };

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
                <input
                    type={type}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={handleChange}
                    placeholder={placeholder}
                    className={`w-full rounded-2xl border border-white/10 bg-white/5 ${
                        icon ? 'pl-11' : 'px-5'
                    } py-3.5 text-sm font-bold text-white outline-none focus:border-emerald-500/50 focus:bg-white/[0.08] transition-all placeholder:text-slate-600 ${className}`}
                    {...props}
                />
            </div>
        </div>
    );
};
