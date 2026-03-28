import React from 'react';
import { FiX, FiCheck, FiPlus } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

export const ProductModal: React.FC = () => {
    const { lang, modifiers, addToCart, updateQty } = usePosStore();
    const {
        modalProduct, modalVariant, modalMods, editingCartId,
        setModalVariant, toggleModalMod, closeProductModal, setEditingCartId
    } = useUIStore();

    if (!modalProduct) return null;

    const formatPrice = (price: number) => `€${price.toFixed(2)}`;

    const getModalTotalPrice = () => {
        let base = modalVariant ? Number(modalVariant.price) : Number(modalProduct.basePrice);
        let modExtra = modalMods.reduce((acc, m) => acc + Number(m.price), 0);
        return base + modExtra;
    };

    const handleModalSubmit = () => {
        const { updateCartItem } = usePosStore.getState();
        if (modalProduct) {
            if (editingCartId) {
                updateCartItem(editingCartId, modalVariant, modalMods);
                setEditingCartId(null);
            } else {
                addToCart(modalProduct, modalVariant, modalMods);
            }
            closeProductModal();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-[var(--color-pos-bg-secondary)] w-[95%] md:w-[700px] max-h-[90vh] rounded-[24px] border border-[var(--color-pos-border-default)] flex flex-col shadow-2xl shadow-black overflow-hidden transform animate-in slide-in-from-bottom-8">

                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-pos-border-default)] bg-[var(--color-pos-bg-primary)]">
                    <h2 className="text-2xl font-black text-[var(--color-pos-info)] tracking-wide">{modalProduct.displayName}</h2>
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
                                <span className="text-blue-500">📏</span> Porsiyon Boyutu Seçin
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

                    <div>
                        {(() => {
                            const relevantMods = modifiers.filter(m => {
                                if (!m.category) return false;
                                const catIdStr = m.category.split('_')[0];
                                return Number(catIdStr) === modalProduct.categoryId || Number(catIdStr) === 0;
                            });

                            if (relevantMods.length === 0) {
                                return <div className="text-[var(--color-pos-text-muted)] italic py-4">Bu ürüne özel ekstra/not seçeneği bulunmamaktadır.</div>;
                            }

                            const groupedMods: Record<string, typeof modifiers> = {};
                            relevantMods.forEach(m => {
                                const parts = m.category.split('_');
                                const gName = parts.length > 1 ? parts.slice(1).join('_') : 'Ekstra Özellikler';
                                if (!groupedMods[gName]) groupedMods[gName] = [];
                                groupedMods[gName].push(m);
                            });

                            return (
                                <div className="flex flex-col gap-5">
                                    {Object.keys(groupedMods).map(groupName => (
                                        <div key={groupName} className="bg-[var(--color-pos-bg-primary)] p-4 rounded-xl border border-[var(--color-pos-border-default)]">
                                            <h4 className="font-bold text-[var(--color-pos-text-secondary)] mb-3 text-[14px] uppercase tracking-wide">{groupName}</h4>
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
                                    ))}
                                </div>
                            );
                        })()}
                    </div>

                </div>

                <div className="px-6 py-5 bg-[var(--color-pos-bg-primary)] border-t border-[var(--color-pos-border-default)] flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[var(--color-pos-text-secondary)] text-sm font-semibold mb-1">Toplam Tutar</span>
                        <span className="font-mono text-3xl font-black text-[var(--color-pos-success)]">{formatPrice(getModalTotalPrice())}</span>
                    </div>
                    <button
                        onClick={handleModalSubmit}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-5 rounded-xl text-xl font-black tracking-widest shadow-lg shadow-emerald-500/30 transition-all active:scale-95 touch-target flex gap-2 items-center"
                    >
                        <FiPlus size={24} /> SEPETE EKLE
                    </button>
                </div>
            </div>
        </div>
    );
};
