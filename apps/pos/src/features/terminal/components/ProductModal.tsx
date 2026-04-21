import React, { useMemo } from 'react';
import { FiX, FiCheck, FiPlus, FiAlertCircle } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

export const ProductModal: React.FC = () => {
    const { lang, modifiers, addToCart, settings } = usePosStore();
    const { t } = usePosLocale();
    const {
        modalProduct, modalVariant, modalMods, editingCartId,
        setModalVariant, toggleModalMod, closeProductModal, setEditingCartId
    } = useUIStore();

    const currencySymbol = settings?.currency || '€';
    const formatPrice = (price: number) => `${currencySymbol}${price.toFixed(2)}`;

    const getModalTotalPrice = () => {
        let base = modalVariant ? Number(modalVariant.price) : Number(modalProduct?.basePrice || 0);
        let modExtra = modalMods.reduce((acc, m) => acc + Number(m.price), 0);
        return base + modExtra;
    };

    // Calculate grouping and mandatory status
    const { groupedMods, mandatoryGroups, missingGroups } = useMemo(() => {
        if (!modalProduct) return { groupedMods: {}, mandatoryGroups: [], missingGroups: [] };

        const relevantMods = modifiers.filter(m => {
            const isAssigned = (modalProduct as any).modifiers?.some((pm: any) => Number(pm.id) === Number(m.id));
            if (isAssigned) return true;
            if (!m.category || m.category === 'topping') return false;
            const catIdStr = m.category.split('_')[0];
            return Number(catIdStr) === modalProduct.categoryId || Number(catIdStr) === 0;
        });

        const groups: Record<string, typeof modifiers> = {};
        relevantMods.forEach(m => {
            const parts = (m.category || '').split('_');
            const gName = (parts.length > 1 && parts[0] !== '') ? parts.slice(1).join('_') : t('product.extraOptions');
            if (!groups[gName]) groups[gName] = [];
            groups[gName].push(m);
        });

        const mandatory = Object.keys(groups).filter(g => g.includes('*'));
        const missing = mandatory.filter(g => {
            const groupIds = groups[g].map(m => m.id);
            return !modalMods.some(mm => groupIds.includes(mm.id));
        });

        return { groupedMods: groups, mandatoryGroups: mandatory, missingGroups: missing };
    }, [modalProduct, modifiers, modalMods, t]);

    if (!modalProduct) return null;

    const isSubmitDisabled = missingGroups.length > 0;

    const handleModalSubmit = () => {
        if (isSubmitDisabled) return;

        const { updateCartItem } = usePosStore.getState();
        if (editingCartId) {
            updateCartItem(editingCartId, modalVariant, modalMods);
            setEditingCartId(null);
        } else {
            addToCart(modalProduct, modalVariant, modalMods);
        }
        closeProductModal();
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-[var(--color-pos-bg-secondary)] w-[95%] md:w-[700px] max-h-[90vh] rounded-[24px] border border-[var(--color-pos-border-default)] flex flex-col shadow-2xl shadow-black overflow-hidden transform animate-in slide-in-from-bottom-8">

                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-pos-border-default)] bg-[var(--color-pos-bg-primary)]">
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-black text-[var(--color-pos-info)] tracking-wide">{modalProduct.displayName}</h2>
                        {isSubmitDisabled && (
                            <span className="text-red-500 text-xs font-bold animate-pulse flex items-center gap-1 mt-1">
                                <FiAlertCircle /> {t('product.mandatoryWarning')}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={closeProductModal}
                        className="bg-[var(--color-pos-bg-tertiary)] hover:bg-red-500 text-[var(--color-pos-text-secondary)] hover:text-white p-2 rounded-full transition-colors touch-target"
                    >
                        <FiX size={26} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 pos-scrollbar">

                    {modalProduct.variants && modalProduct.variants.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-[var(--color-pos-text-primary)] mb-4 uppercase tracking-wider flex items-center gap-2">
                                <span className="text-blue-500">📏</span> {t('product.selectPortion')}
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {modalProduct.variants.map((v: any) => (
                                    <button
                                        key={v.id}
                                        onClick={() => setModalVariant(v)}
                                        className={`px-4 py-4 rounded-xl border-2 font-bold text-base transition-all touch-target flex flex-col items-center justify-center gap-1
                                            ${modalVariant?.id === v.id
                                                ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                                                : 'bg-[var(--color-pos-bg-tertiary)] border-[var(--color-pos-border-default)] hover:border-blue-500/50'}`}
                                    >
                                        <span>{v.translations?.[lang] || v.name}</span>
                                        <span className="font-mono text-sm opacity-80">{formatPrice(Number(v.price))}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-6">
                        {Object.keys(groupedMods).length === 0 ? (
                            <div className="text-[var(--color-pos-text-muted)] italic py-4">{t('product.noOptions')}</div>
                        ) : (
                            Object.keys(groupedMods).map(groupName => {
                                const isMandatory = mandatoryGroups.includes(groupName);
                                const isMissing = missingGroups.includes(groupName);
                                
                                return (
                                    <div 
                                        key={groupName} 
                                        className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                                            isMissing 
                                                ? 'bg-red-500/5 border-red-500/40 shadow-lg shadow-red-500/5' 
                                                : 'bg-[var(--color-pos-bg-primary)] border-[var(--color-pos-border-default)]'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-bold text-[var(--color-pos-text-secondary)] text-[14px] uppercase tracking-wide flex items-center gap-2">
                                                {groupName.replace('*', '')}
                                                {isMandatory && (
                                                    <span className={`px-2 py-0.5 rounded text-[10px] ${isMissing ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500 text-white'}`}>
                                                        {t('product.required')}
                                                    </span>
                                                )}
                                            </h4>
                                            {isMissing && <span className="text-red-500 text-[10px] font-bold uppercase tracking-tight">{t('product.noSelection')}</span>}
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {groupedMods[groupName].map(mod => {
                                                const isSelected = !!modalMods.find(m => m.id === mod.id);
                                                return (
                                                    <button
                                                        key={mod.id}
                                                        onClick={() => toggleModalMod(mod)}
                                                        className={`flex justify-between items-center px-4 py-3 rounded-lg border-2 font-bold transition-all touch-target
                                                                    ${isSelected
                                                                 ? 'bg-orange-500/10 border-orange-500 text-orange-500'
                                                                 : 'bg-[var(--color-pos-bg-tertiary)] border-[var(--color-pos-border-default)] hover:border-orange-500/50 text-[var(--color-pos-text-primary)]'}`}
                                                    >
                                                        <span className="flex items-center gap-3">
                                                            <span className={`w-5 h-5 rounded-md flex items-center justify-center border-2 ${isSelected ? 'bg-orange-500 border-orange-500 text-black' : 'border-[var(--color-pos-text-muted)] text-transparent'}`}>
                                                                <FiCheck size={14} />
                                                            </span>
                                                            <span className="text-[14px]">{mod.displayName}</span>
                                                        </span>
                                                        {Number(mod.price) > 0 && <span className="font-mono text-[13px] border border-orange-500/30 px-2 py-0.5 rounded-md text-[var(--color-pos-text-primary)]">+{formatPrice(Number(mod.price))}</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                </div>

                <div className="px-6 py-5 bg-[var(--color-pos-bg-primary)] border-t border-[var(--color-pos-border-default)] flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[var(--color-pos-text-secondary)] text-sm font-semibold mb-1">{t('product.totalPrice')}</span>
                        <span className="font-mono text-3xl font-black text-[var(--color-pos-success)]">{formatPrice(getModalTotalPrice())}</span>
                    </div>
                    <button
                        onClick={handleModalSubmit}
                        disabled={isSubmitDisabled}
                        className={`px-10 py-5 rounded-xl text-xl font-black tracking-widest transition-all active:scale-95 touch-target flex gap-2 items-center
                            ${isSubmitDisabled 
                                ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed border border-gray-500/30' 
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'}`}
                    >
                        <FiPlus size={24} /> {editingCartId ? t('product.update') : t('product.addToCart')}
                    </button>
                </div>
            </div>
        </div>
    );
};
