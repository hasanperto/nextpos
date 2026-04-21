import { useMemo } from 'react';
import { FiCreditCard } from 'react-icons/fi';

function formatPan(digits: string): string {
    const d = digits.replace(/\D/g, '').slice(0, 19);
    if (!d) return '•••• •••• •••• ••••';
    const parts: string[] = [];
    for (let i = 0; i < d.length; i += 4) {
        parts.push(d.slice(i, i + 4));
    }
    return parts.join(' ');
}

function formatExpiry(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export type WalletCardVisualProps = {
    gatewayLabel: string;
    disclaimer: string;
    labelPreviewFields: string;
    labelName: string;
    labelNumber: string;
    labelExpiry: string;
    labelCvc: string;
    labelCard: string;
    placeholderName: string;
    placeholderNumber: string;
    placeholderCvc: string;
    cardholderName: string;
    cardNumberDigits: string;
    expiry: string;
    cvc: string;
    focused: 'number' | 'name' | 'expiry' | 'cvc' | null;
    onFocusField: (f: WalletCardVisualProps['focused']) => void;
    onChangeName: (v: string) => void;
    onChangeNumber: (v: string) => void;
    onChangeExpiry: (v: string) => void;
    onChangeCvc: (v: string) => void;
};

export function WalletCardVisual({
    gatewayLabel,
    disclaimer,
    labelPreviewFields,
    labelName,
    labelNumber,
    labelExpiry,
    labelCvc,
    labelCard,
    placeholderName,
    placeholderNumber,
    placeholderCvc,
    cardholderName,
    cardNumberDigits,
    expiry,
    cvc,
    focused,
    onFocusField,
    onChangeName,
    onChangeNumber,
    onChangeExpiry,
    onChangeCvc,
}: WalletCardVisualProps) {
    const displayNumber = useMemo(() => formatPan(cardNumberDigits), [cardNumberDigits]);
    const displayExp = useMemo(() => formatExpiry(expiry), [expiry]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div
                className="relative aspect-[1.586/1] max-w-md w-full rounded-[24px] overflow-hidden shadow-2xl border border-white/10"
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #312e81 100%)',
                }}
            >
                <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.5),transparent_50%)]" />
                <div className="absolute top-4 right-4 flex items-center gap-2 px-2 py-1 rounded-lg bg-black/30 border border-white/10">
                    <FiCreditCard className="text-violet-300" size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-violet-200">{gatewayLabel}</span>
                </div>
                <div className="relative z-10 p-6 h-full flex flex-col justify-between text-white">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">{labelCard}</p>
                        <p
                            className={`font-mono text-lg sm:text-xl tracking-widest break-all transition-transform ${
                                focused === 'number' ? 'scale-[1.02] text-white' : 'text-slate-200'
                            }`}
                        >
                            {displayNumber}
                        </p>
                    </div>
                    <div className="flex justify-between items-end gap-4">
                        <div>
                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">{labelName}</p>
                            <p className={`text-sm font-bold uppercase tracking-wide truncate max-w-[180px] ${focused === 'name' ? 'text-white' : 'text-slate-300'}`}>
                                {cardholderName.trim() || placeholderName}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">{labelExpiry}</p>
                            <p className={`font-mono text-sm ${focused === 'expiry' ? 'text-white' : 'text-slate-300'}`}>{displayExp || 'MM/YY'}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">{labelCvc}</p>
                            <p className={`font-mono text-sm ${focused === 'cvc' ? 'text-white' : 'text-slate-300'}`}>
                                {cvc ? '•'.repeat(Math.min(cvc.length, 4)) : '•••'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3 w-full max-w-md">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{labelPreviewFields}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">{disclaimer}</p>
                <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{labelName}</label>
                    <input
                        value={cardholderName}
                        onChange={(e) => onChangeName(e.target.value.toUpperCase())}
                        onFocus={() => onFocusField('name')}
                        onBlur={() => onFocusField(null)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
                        placeholder={placeholderName}
                        autoComplete="cc-name"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{labelNumber}</label>
                    <input
                        value={cardNumberDigits}
                        onChange={(e) => onChangeNumber(e.target.value.replace(/\D/g, '').slice(0, 19))}
                        onFocus={() => onFocusField('number')}
                        onBlur={() => onFocusField(null)}
                        inputMode="numeric"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-mono tracking-wider placeholder:text-slate-600"
                        placeholder={placeholderNumber}
                        autoComplete="cc-number"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{labelExpiry}</label>
                        <input
                            value={displayExp}
                            onChange={(e) => onChangeExpiry(e.target.value.replace(/\D/g, ''))}
                            onFocus={() => onFocusField('expiry')}
                            onBlur={() => onFocusField(null)}
                            inputMode="numeric"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder:text-slate-600"
                            placeholder="MM/YY"
                            autoComplete="cc-exp"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{labelCvc}</label>
                        <input
                            value={cvc}
                            onChange={(e) => onChangeCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            onFocus={() => onFocusField('cvc')}
                            onBlur={() => onFocusField(null)}
                            inputMode="numeric"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder:text-slate-600"
                            placeholder={placeholderCvc}
                            autoComplete="cc-csc"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
