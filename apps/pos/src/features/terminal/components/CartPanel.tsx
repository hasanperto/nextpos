import React from 'react';
import { FiPlus, FiMinus, FiTrash2, FiX, FiCheck, FiUser } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

export const CartPanel: React.FC = () => {
    const {
        lang, cart, updateQty, clearCart, orderType, setOrderType,
        getCartTotal, createOrder
    } = usePosStore();

    const {
        isCartOpen, setCartOpen, setCustomerModal, activeCustomer,
        selectedCourier, setSelectedCourier,
        setEditingCartId, openProductModal
    } = useUIStore();

    const { subtotal, tax, total } = getCartTotal();

    const formatPrice = (price: number) => `€${price.toFixed(2)}`;

    const startEditCartItem = (item: any) => {
        if (item.qty > 1) {
            updateQty(item.cartId, item.qty - 1);
            setEditingCartId(null);
        } else {
            setEditingCartId(item.cartId);
        }
        openProductModal(item.product);
    };

    return (
        <aside className={`w-[90%] md:w-[420px] flex flex-col bg-[var(--color-pos-bg-secondary)] border border-[var(--color-pos-border-default)] overflow-hidden shadow-2xl drop-shadow-2xl transition-all duration-300 z-50
            ${isCartOpen ? 'fixed inset-y-0 right-0 rounded-l-[24px]' : 'hidden xl:flex rounded-[20px] relative'}
        `}>

            <div className="bg-[#3B82F6] px-5 py-3 flex flex-col gap-3 text-white shadow-md z-10">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black tracking-wider flex items-center gap-2">
                        <span>🧾</span> ADİSYON SEPETİ
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={clearCart} className="hover:bg-red-500 bg-red-500/80 px-2.5 py-1.5 flex items-center gap-1.5 rounded-lg transition-colors font-bold text-xs" title="Sepeti Temizle">
                            <FiTrash2 size={14} /> <span className="hidden md:inline">Temizle</span>
                        </button>
                        <button onClick={() => setCartOpen(false)} className="xl:hidden bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg transition-colors font-bold text-xs">
                            <FiX size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex bg-black/20 p-1 rounded-xl">
                    <button
                        onClick={() => setOrderType('dine_in')}
                        className={`flex-1 py-1.5 text-xs font-black tracking-wide rounded-lg transition-all touch-target ${orderType === 'dine_in' ? 'bg-white text-blue-600 shadow-md transform scale-100' : 'text-blue-100 hover:text-white drop-shadow-sm scale-95'}`}>
                        MASADA 🪑
                    </button>
                    <button
                        onClick={() => setOrderType('takeaway')}
                        className={`flex-1 py-1.5 text-xs font-black tracking-wide rounded-lg transition-all touch-target ${orderType === 'takeaway' ? 'bg-white text-blue-600 shadow-md transform scale-100' : 'text-blue-100 hover:text-white drop-shadow-sm scale-95'}`}>
                        GEL-AL 🥡
                    </button>
                    <button
                        onClick={() => setOrderType('delivery')}
                        className={`flex-1 py-1.5 text-xs font-black tracking-wide rounded-lg transition-all touch-target ${orderType === 'delivery' ? 'bg-white text-blue-600 shadow-md transform scale-100' : 'text-blue-100 hover:text-white drop-shadow-sm scale-95'}`}>
                        PAKET 🛵
                    </button>
                </div>

                {orderType === 'dine_in' && (
                    <div className="bg-blue-800/40 border border-blue-400/30 rounded-lg py-1.5 px-3 flex justify-between items-center cursor-pointer hover:bg-blue-800/60 transition-colors">
                        <span className="text-xs font-medium text-blue-100">Seçili Masa:</span>
                        <span className="text-sm font-black text-white">Masa 8 (Teras) ▾</span>
                    </div>
                )}

                {orderType === 'delivery' && (
                    <div className="bg-blue-800/60 p-3 rounded-xl border border-blue-400/20 flex flex-col gap-2 shadow-inner">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-blue-100 tracking-widest uppercase">Müşteri BİLGİSİ</span>
                            <button onClick={() => setCustomerModal(true)} className="text-[10px] bg-blue-500 hover:bg-blue-400 px-2 py-1 rounded font-bold transition-all shadow shadow-blue-500/30 text-white flex gap-1 items-center">
                                <FiUser size={12} /> {activeCustomer ? 'Değiştir' : 'Seç / Ekle'}
                            </button>
                        </div>
                        {activeCustomer ? (
                            <div className="text-sm font-black text-white leading-tight">
                                - {activeCustomer.name} <br />
                                <span className="text-xs font-medium text-blue-200 block drop-shadow-md">📍 {activeCustomer.phone} • {activeCustomer.address}</span>
                            </div>
                        ) : (
                            <div className="text-[11px] text-blue-300 italic mb-1 bg-black/10 p-1.5 rounded-md text-center">Henüz müşteri atanmadı. Gel-Al harici siparişlerde adres/telefon gereklidir!</div>
                        )}

                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-blue-100 w-12 text-right">Kurye:</span>
                            <select
                                className="flex-1 bg-blue-900 border border-blue-400/30 text-white text-[11px] p-2 rounded outline-none font-bold"
                                value={selectedCourier}
                                onChange={(e) => setSelectedCourier(e.target.value)}
                            >
                                <option value="">(Otomatik Atanır - Seçilmedi)</option>
                                <option value="ali">🟢 Motorlu Kurye Ali (Boşta)</option>
                                <option value="mehmet">🟢 Mehmet (Boşta)</option>
                                <option value="veli">🔴 Veli (Tuzla Dağıtımında)</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 pos-scrollbar overflow-y-auto px-2 py-2">
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--color-pos-text-muted)] text-base font-medium">
                        <span className="text-6xl mb-4 opacity-50">🛒</span>
                        Henüz ürün eklenmedi
                    </div>
                ) : (
                    cart.map((item) => (
                        <div key={item.cartId} className="flex px-4 py-4 mb-2 bg-[var(--color-pos-bg-tertiary)] rounded-xl border border-[var(--color-pos-border-default)] items-center group shadow-sm transition-all hover:border-[var(--color-pos-info)]">

                            <div className="flex flex-col gap-2 items-center mr-4 bg-[var(--color-pos-bg-primary)] rounded-lg p-1 border border-[var(--color-pos-border-default)]">
                                <button onClick={() => updateQty(item.cartId, item.qty + 1)} className="p-2 bg-[var(--color-pos-bg-elevated)] rounded-md hover:text-white hover:bg-[var(--color-pos-info)] transition-colors touch-target"><FiPlus size={18} /></button>
                                <div className="text-[var(--color-pos-text-primary)] font-mono font-black text-lg">{item.qty}</div>
                                <button onClick={() => updateQty(item.cartId, item.qty - 1)} className="p-2 bg-[var(--color-pos-bg-elevated)] rounded-md hover:text-[var(--color-pos-danger)] hover:bg-red-500/20 transition-colors touch-target">
                                    {item.qty === 1 ? <FiTrash2 size={18} /> : <FiMinus size={18} />}
                                </button>
                            </div>

                            <div
                                className="flex-1 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors"
                                onClick={() => startEditCartItem(item)}
                            >
                                <div className="text-[15px] font-bold text-[var(--color-pos-text-primary)] leading-tight">{item.product.displayName}</div>
                                {item.notes && <div className="text-[12px] text-[var(--color-pos-warning)] mt-1.5 font-medium tracking-wide">➡ {item.notes}</div>}
                            </div>

                            <div className="font-mono font-black text-[var(--color-pos-text-primary)] text-right min-w-[70px] text-[18px] flex items-center justify-end">
                                {formatPrice(item.price * item.qty)}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* FATURA ÖZETİ */}
            <div className="px-5 py-5 bg-[var(--color-pos-bg-tertiary)] border-t border-[var(--color-pos-border-default)] z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.15)]">
                <div className="flex justify-between text-[var(--color-pos-text-secondary)] text-sm mb-2 font-medium">
                    <span>{lang === 'de' ? 'Zwischensumme:' : lang === 'en' ? 'Subtotal:' : 'Ara Toplam:'}</span>
                    <span className="font-mono font-bold">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[var(--color-pos-danger)] text-sm mb-4 font-medium">
                    <span>{lang === 'de' ? 'MwSt (19%):' : lang === 'en' ? 'VAT (19%):' : 'KDV (%19):'}</span>
                    <span className="font-mono font-bold">{formatPrice(tax)}</span>
                </div>
                <div className="flex justify-between items-center bg-[var(--color-pos-bg-secondary)] rounded-xl py-4 px-5 border-2 border-[var(--color-pos-border-active)] shadow-[var(--shadow-glow)] shadow-teal-500/20">
                    <span className="font-black text-xl text-[var(--color-pos-text-primary)] tracking-wider">
                        {lang === 'de' ? 'GESAMT:' : lang === 'en' ? 'TOTAL:' : 'TOPLAM TUTAR:'}
                    </span>
                    <span className="font-mono text-3xl font-black text-[var(--color-pos-success)]">{formatPrice(total)}</span>
                </div>
            </div>

            <div className="p-4 bg-[var(--color-pos-bg-primary)] flex gap-3 h-[110px]">
                <button className="flex-1 bg-[var(--color-pos-bg-tertiary)] hover:bg-[var(--color-pos-bg-elevated)] border-2 border-[var(--color-pos-border-default)] text-[var(--color-pos-text-primary)] font-bold rounded-xl text-base transition-all active:scale-95 shadow-lg">
                    <span className="block text-2xl mb-1">💳</span> Kredi Kartı
                </button>
                <button
                    className={`flex-[1.5] text-white font-black text-xl rounded-xl border-none tracking-widest transition-all transform active:scale-95 shadow-xl flex flex-col items-center justify-center
                  ${cart.length > 0
                            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 shadow-emerald-500/40'
                            : 'bg-[var(--color-pos-bg-tertiary)] text-[var(--color-pos-text-muted)] cursor-not-allowed opacity-50 shadow-none'}`}
                    disabled={cart.length === 0}
                >
                    <span className="block text-3xl mb-1">💵</span>
                    {lang === 'de' ? 'ZAHLEN' : lang === 'en' ? 'PAY CASH' : 'NAKİT ÖDEME'}
                </button>
            </div>

            <div className="px-4 pb-4">
                <button
                    onClick={() => {
                        createOrder(activeCustomer?.name, orderType === 'dine_in' ? '8' : undefined);
                        setCartOpen(false);
                    }}
                    disabled={cart.length === 0}
                    className={`w-full py-4 rounded-xl font-black text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3
                ${cart.length > 0 ? 'bg-orange-500 hover:bg-orange-400' : 'bg-gray-700 opacity-50 cursor-not-allowed'}
               `}
                >
                    <FiCheck size={24} /> MUTFAĞA GÖNDER
                </button>
            </div>

        </aside>
    );
};
