import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiCheck, FiPlus, FiAlertCircle } from 'react-icons/fi';
import type { PosModifier, PosProduct, PosProductVariant } from '../../store/usePosStore';

type Props = {
    product: PosProduct;
    /** Mağaza dilinde tam modifikatör listesi (görünen ad + fiyat) */
    allModifiers: PosModifier[];
    currency?: string;
    onClose: () => void;
    onConfirm: (variant: PosProductVariant | null, mods: PosModifier[]) => void;
};

function pickInitialVariant(p: PosProduct): PosProductVariant | null {
    if (!p.variants?.length) return null;
    const def = p.variants.find((v) => v.isDefault);
    return def || p.variants[0];
}

export const OrderProductModal: React.FC<Props> = ({
    product,
    allModifiers,
    currency = '₺',
    onClose,
    onConfirm,
}) => {
    const [variant, setVariant] = useState<PosProductVariant | null>(() => pickInitialVariant(product));
    const [modalMods, setModalMods] = useState<PosModifier[]>([]);

    useEffect(() => {
        setVariant(pickInitialVariant(product));
        setModalMods([]);
    }, [product]);

    const formatPrice = (n: number) => `${currency}${Math.round(n)}`;

    const toggleMod = (m: PosModifier) => {
        setModalMods((prev) => {
            const exists = prev.find((x) => x.id === m.id);
            if (exists) return prev.filter((x) => x.id !== m.id);
            return [...prev, m];
        });
    };

    const { groupedMods, mandatoryGroups, missingGroups } = useMemo(() => {
        const relevantMods = allModifiers.filter((m) => {
            const isAssigned = product.modifiers?.some((pm) => Number(pm.id) === Number(m.id));
            if (isAssigned) return true;
            if (!m.category || m.category === 'topping') return false;
            const catIdStr = m.category.split('_')[0];
            return Number(catIdStr) === product.categoryId || Number(catIdStr) === 0;
        });

        const groups: Record<string, PosModifier[]> = {};
        relevantMods.forEach((m) => {
            const parts = (m.category || '').split('_');
            const gName =
                parts.length > 1 && parts[0] !== '' ? parts.slice(1).join('_') : 'Ekstra seçenekler';
            if (!groups[gName]) groups[gName] = [];
            groups[gName].push(m);
        });

        const mandatory = Object.keys(groups).filter((g) => g.includes('*'));
        const missing = mandatory.filter((g) => {
            const ids = groups[g].map((x) => x.id);
            return !modalMods.some((mm) => ids.includes(mm.id));
        });

        return { groupedMods: groups, mandatoryGroups: mandatory, missingGroups: missing };
    }, [product, allModifiers, modalMods]);

    const totalPrice = () => {
        let base = variant ? Number(variant.price) : Number(product.basePrice);
        const modExtra = modalMods.reduce((acc, m) => acc + Number(m.price), 0);
        return base + modExtra;
    };

    const canSubmit = missingGroups.length === 0;

    const handleConfirm = () => {
        if (!canSubmit) return;
        onConfirm(variant, modalMods);
        onClose();
    };

    return (
        <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Ürün özelleştir"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="w-full max-w-lg max-h-[min(90dvh,760px)] flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0f19] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6 sm:py-5 shrink-0">
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-black text-white italic tracking-tight uppercase leading-tight">
                                {product.displayName}
                            </h2>
                            {!canSubmit && (
                                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
                                    <FiAlertCircle size={14} /> Zorunlu seçenekleri işaretleyin
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-white touch-manipulation"
                            aria-label="Kapat"
                        >
                            <FiX size={22} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 space-y-6 sm:space-y-8">
                        {product.variants && product.variants.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500 mb-3">
                                    Porsiyon / varyant
                                </h3>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    {product.variants.map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => setVariant(v)}
                                            className={`rounded-2xl border-2 px-3 py-3 text-left transition-all touch-manipulation min-h-[52px] ${
                                                variant?.id === v.id
                                                    ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                                                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20'
                                            }`}
                                        >
                                            <span className="block text-[13px] font-black leading-tight">{v.displayName}</span>
                                            <span className="mt-1 block text-xs font-mono text-slate-400">
                                                {formatPrice(Number(v.price))}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {Object.keys(groupedMods).map((groupName) => {
                                const isMandatory = mandatoryGroups.includes(groupName);
                                const isMissing = missingGroups.includes(groupName);
                                return (
                                    <section
                                        key={groupName}
                                        className={`rounded-2xl border-2 p-4 transition-colors ${
                                            isMissing
                                                ? 'border-rose-500/40 bg-rose-500/5'
                                                : 'border-white/10 bg-white/[0.02]'
                                        }`}
                                    >
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                                {groupName.replace(/\*/g, '')}
                                                {isMandatory && (
                                                    <span
                                                        className={`ml-2 rounded px-2 py-0.5 text-[9px] ${
                                                            isMissing ? 'bg-rose-500 text-white' : 'bg-emerald-600/80 text-white'
                                                        }`}
                                                    >
                                                        Zorunlu
                                                    </span>
                                                )}
                                            </h4>
                                            {isMissing && (
                                                <span className="text-[10px] font-bold text-rose-400">Seçim gerekli</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {groupedMods[groupName].map((mod) => {
                                                const selected = !!modalMods.find((m) => m.id === mod.id);
                                                return (
                                                    <button
                                                        key={mod.id}
                                                        type="button"
                                                        onClick={() => toggleMod(mod)}
                                                        className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all touch-manipulation ${
                                                            selected
                                                                ? 'border-orange-500/70 bg-orange-500/10 text-orange-200'
                                                                : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/20'
                                                        }`}
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            <span
                                                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                                                                    selected
                                                                        ? 'border-orange-500 bg-orange-500 text-black'
                                                                        : 'border-slate-600 text-transparent'
                                                                }`}
                                                            >
                                                                <FiCheck size={12} />
                                                            </span>
                                                            <span className="text-[13px] font-bold leading-snug">
                                                                {mod.displayName}
                                                            </span>
                                                        </span>
                                                        {Number(mod.price) > 0 && (
                                                            <span className="shrink-0 rounded-md border border-orange-500/30 px-2 py-0.5 text-[11px] font-mono text-slate-300">
                                                                +{formatPrice(Number(mod.price))}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                    </div>

                    <div className="shrink-0 border-t border-white/10 bg-black/30 px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Satır tutarı</p>
                            <p className="text-2xl sm:text-3xl font-black italic text-emerald-400 tabular-nums">
                                {formatPrice(totalPrice())}
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={handleConfirm}
                            className={`inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-8 py-4 text-sm font-black uppercase tracking-widest transition-all touch-manipulation active:scale-[0.98] ${
                                canSubmit
                                    ? 'bg-[#e91e63] text-white shadow-lg shadow-pink-600/30 hover:bg-[#c2185b]'
                                    : 'cursor-not-allowed bg-white/10 text-slate-500'
                            }`}
                        >
                            <FiPlus size={20} /> Sepete ekle
                        </button>
                    </div>
            </motion.div>
        </motion.div>
    );
};

/** Varyant veya (ürün + kategori kuralı ile) seçilebilir modifikör varsa modal açılır */
export function productHasConfigurableOptions(p: PosProduct, allModifiers: PosModifier[]): boolean {
    if ((p.variants?.length ?? 0) > 0) return true;
    const relevant = allModifiers.filter((m) => {
        const isAssigned = p.modifiers?.some((pm) => Number(pm.id) === Number(m.id));
        if (isAssigned) return true;
        if (!m.category || m.category === 'topping') return false;
        const catIdStr = m.category.split('_')[0];
        return Number(catIdStr) === p.categoryId || Number(catIdStr) === 0;
    });
    return relevant.length > 0;
}
