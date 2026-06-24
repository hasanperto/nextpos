import React, { useState } from 'react';
import { FiX, FiCheck, FiShoppingBag, FiCreditCard, FiDollarSign, FiGrid } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { usePosStore } from '../../../store/usePosStore';

interface SplitBillModalProps {
    sessionId: number;
    tableName: string;
    onClose: () => void;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({ sessionId, tableName, onClose }) => {
    const { orders, splitBill, settings, submitSessionPayment, tables } = usePosStore();
    
    // Aktif sekmeyi takip et: 'items' (Ürün Bazlı) | 'amount' (Tutar Bazlı)
    const [activeTab, setActiveTab] = useState<'items' | 'amount'>('items');

    // Bu session'a ait tüm ödenmemiş kalemleri bul
    const sessionOrders = orders.filter(o => o.sessionId === sessionId && o.status !== 'cancelled');
    
    // Düzleştirilmiş ürün listesi (SplitSelection için)
    const allItems = sessionOrders.flatMap(o => o.items.map(item => ({
        ...item,
        orderId: o.id,
        remoteId: o.remoteId
    })));

    // Seçilen ürünler ve miktarları: { [cartId]: selectedQty }
    const [selections, setSelections] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card');

    // Tutar bazlı parçalı ödeme state'leri
    const [amountInput, setAmountInput] = useState<string>('');

    const currency = settings?.currency || '€';

    // Masanın kalan toplam borç tutarını bul (API tables cache'inden veya sipariş kalemlerinden)
    const currentTable = tables?.find(t => Number(t.active_session_id) === Number(sessionId));
    const tableRemaining = currentTable ? Number(currentTable.total_amount || 0) : allItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const toggleItem = (cartId: string, maxQty: number) => {
        setSelections(prev => {
            const current = prev[cartId] || 0;
            if (current >= maxQty) {
                const next = { ...prev };
                delete next[cartId];
                return next;
            }
            return { ...prev, [cartId]: current + 1 };
        });
    };

    const setQty = (cartId: string, qty: number, maxQty: number) => {
        if (qty <= 0) {
            setSelections(prev => {
                const next = { ...prev };
                delete next[cartId];
                return next;
            });
            return;
        }
        if (qty > maxQty) return;
        setSelections(prev => ({ ...prev, [cartId]: qty }));
    };

    // Seçilen ürünlerin toplam tutarı
    const selectedTotal = allItems.reduce((sum, item) => {
        const selQty = selections[item.cartId] || 0;
        return sum + (item.price * selQty);
    }, 0);

    // Ürün bazlı ödemeyi gönder
    const handleItemsPay = async () => {
        if (selectedTotal <= 0) {
            toast.error('Lütfen ödenecek ürün seçin');
            return;
        }

        setIsSubmitting(true);
        
        // API'nin beklediği formata çevir (orderItemId'yi parse et)
        const itemsToPay = allItems
            .filter(item => selections[item.cartId] > 0)
            .map(item => {
                const orderItemId = Number(item.cartId.replace('api-', ''));
                return {
                    orderItemId,
                    quantity: selections[item.cartId]
                };
            });

        const res = await splitBill(sessionId, itemsToPay, {
            method: paymentMethod,
            tipAmount: 0
        });

        setIsSubmitting(false);

        if (res.ok) {
            toast.success('Kısmi ödeme başarıyla alındı', { id: `payment-succ-sess-${sessionId}` });
            onClose();
        } else {
            toast.error(res.error || 'Ödeme alınamadı');
        }
    };

    // Tutar bazlı ödemeyi gönder
    const handleAmountPay = async () => {
        const val = parseFloat(amountInput);
        if (isNaN(val) || val <= 0) {
            toast.error('Lütfen geçerli bir tutar girin');
            return;
        }
        if (val > tableRemaining + 0.01) {
            toast.error(`Girilen tutar kalan bakiyeden (${currency}${tableRemaining.toFixed(2)}) büyük olamaz`);
            return;
        }

        setIsSubmitting(true);
        try {
            const r = await submitSessionPayment(sessionId, val, paymentMethod);
            if (r.ok) {
                toast.success(`${currency}${val.toFixed(2)} tutarında ${paymentMethod === 'cash' ? 'nakit' : 'kart'} ödemesi alındı`, { id: `payment-succ-sess-${sessionId}` });
                if (r.sessionClosed) {
                    toast.success('Masa hesabı tamamen kapandı', { id: `payment-session-closed-${sessionId}` });
                }
                onClose();
            } else {
                toast.error(r.error || 'Ödeme alınamadı');
            }
        } catch (e) {
            toast.error('Bağlantı hatası oluştu');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Klavye/Keypad basma fonksiyonu
    const handleKeypadPress = (val: string) => {
        if (val === 'C') {
            setAmountInput('');
        } else if (val === '.') {
            if (!amountInput.includes('.')) {
                setAmountInput(prev => prev === '' ? '0.' : prev + '.');
            }
        } else if (val === '00') {
            if (amountInput !== '' && amountInput !== '0') {
                setAmountInput(prev => prev + '00');
            }
        } else {
            setAmountInput(prev => {
                if (prev === '0') return val;
                return prev + val;
            });
        }
    };

    const handleQuickAdd = (increment: number) => {
        setAmountInput(prev => {
            const current = parseFloat(prev || '0');
            const target = current + increment;
            return Math.min(tableRemaining, target).toFixed(2);
        });
    };

    const setExactTotal = () => {
        setAmountInput(tableRemaining.toFixed(2));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <div className="absolute inset-0" onClick={onClose} />
            
            <div className="relative w-full max-w-3xl bg-[#0f172a] border border-white/10 rounded-[32px] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in duration-300">
                
                {/* Header */}
                <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-transparent">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3 italic">
                            <FiShoppingBag className="text-emerald-400" />
                            PARÇALI ÖDEME
                        </h2>
                        <p className="text-emerald-400/60 font-bold text-xs mt-1 tracking-widest uppercase">
                            {tableName} • HESAP BÖLME PANELİ
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-xl"
                    >
                        <FiX size={24} />
                    </button>
                </div>

                {/* Sekme Seçici (Tab Swapper) */}
                <div className="px-8 py-3 bg-[#0a0f1d] border-b border-white/5 flex gap-4">
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                            activeTab === 'items'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                                : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        <FiGrid size={14} /> Ürün Seçimi ile Öde
                    </button>
                    <button
                        onClick={() => setActiveTab('amount')}
                        className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                            activeTab === 'amount'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                                : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        <FiDollarSign size={14} /> Tutar Girerek Öde
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 pos-scrollbar min-h-[300px]">
                    {activeTab === 'items' ? (
                        /* SECENEK 1: ÜRÜN BAZLI ÖDEME */
                        <div className="grid grid-cols-1 gap-2.5">
                            {allItems.length === 0 ? (
                                <div className="text-center py-20 text-white/20 font-bold italic">
                                    Bu masaya ait ödenmemiş ürün bulunamadı.
                                </div>
                            ) : (
                                allItems.map(item => {
                                    const selQty = selections[item.cartId] || 0;
                                    const isSelected = selQty > 0;
                                    
                                    return (
                                        <div 
                                            key={item.cartId}
                                            onClick={() => toggleItem(item.cartId, item.qty)}
                                            className={`flex items-center p-4 rounded-2xl border transition-all cursor-pointer group ${
                                                isSelected 
                                                ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.05)]' 
                                                : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/5'
                                            }`}
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isSelected ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/40'}`}>
                                                        {item.qty} ADET
                                                    </span>
                                                    <h4 className="font-bold text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight">
                                                        {item.product.displayName}
                                                    </h4>
                                                </div>
                                                {item.notes && <p className="text-[10px] text-white/30 italic mt-1">{item.notes}</p>}
                                            </div>

                                            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                                                {/* Adet Ayarlayıcı */}
                                                {item.qty > 1 && (
                                                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
                                                        <button 
                                                            onClick={() => setQty(item.cartId, selQty - 1, item.qty)}
                                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 transition-colors"
                                                        >-</button>
                                                        <span className="w-6 text-center font-black text-emerald-400 text-xs sm:text-sm">{selQty}</span>
                                                        <button 
                                                            onClick={() => setQty(item.cartId, selQty + 1, item.qty)}
                                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors"
                                                        >+</button>
                                                    </div>
                                                )}
                                                
                                                <div className="text-right min-w-[70px] sm:min-w-[80px] flex flex-col justify-center">
                                                    {item.qty > 1 && (
                                                        <div className="text-[10px] sm:text-xs text-white/30 line-through leading-none mb-0.5">{currency}{(item.price * item.qty).toFixed(2)}</div>
                                                    )}
                                                    <div className={`font-black text-base sm:text-lg tabular-nums leading-none ${isSelected ? 'text-emerald-400' : 'text-white/60'}`}>
                                                        {currency}{(item.price * (isSelected ? selQty : item.qty)).toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        /* SECENEK 2: TUTAR BAZLI ÖDEME */
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                            {/* Sol Bölüm: Bakiye Kartı & Tutar Input */}
                            <div className="md:col-span-6 flex flex-col justify-between gap-5 bg-white/5 rounded-3xl p-6 border border-white/5">
                                <div className="space-y-4">
                                    <div className="bg-[#020611]/60 border border-white/5 rounded-2xl p-4 text-center">
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] block mb-1">Masanın Kalan Toplam Borcu</span>
                                        <div className="text-4xl font-black text-white italic tracking-tighter tabular-nums">
                                            {currency}{tableRemaining.toFixed(2)}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2 block">Ödeme Alınacak Tutar</label>
                                        <div className="relative">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-emerald-400">{currency}</span>
                                            <input
                                                type="text"
                                                readOnly
                                                value={amountInput}
                                                placeholder="0.00"
                                                className="w-full bg-[#020611]/80 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-3xl font-black text-white focus:outline-none focus:border-emerald-500/50 transition-all font-mono tracking-tight text-right tabular-nums placeholder:text-white/10"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Hızlı Artış & Tanımlama Butonları */}
                                <div className="space-y-3">
                                    <div className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Hızlı Tutar Tanımla</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={setExactTotal}
                                            className="py-3.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-[11px] font-black text-emerald-400 transition-all active:scale-[0.98]"
                                        >
                                            TAM TUTARI AL
                                        </button>
                                        <button 
                                            onClick={() => handleQuickAdd(5)}
                                            className="py-3.5 px-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[11px] font-black text-white/70 transition-all active:scale-[0.98]"
                                        >
                                            + {currency}5.00
                                        </button>
                                        <button 
                                            onClick={() => handleQuickAdd(10)}
                                            className="py-3.5 px-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[11px] font-black text-white/70 transition-all active:scale-[0.98]"
                                        >
                                            + {currency}10.00
                                        </button>
                                        <button 
                                            onClick={() => handleQuickAdd(50)}
                                            className="py-3.5 px-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[11px] font-black text-white/70 transition-all active:scale-[0.98]"
                                        >
                                            + {currency}50.00
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Sağ Bölüm: Premium Nümerik Dokunmatik Klavye */}
                            <div className="md:col-span-6 flex flex-col justify-center bg-black/40 rounded-3xl p-5 border border-white/5">
                                <div className="grid grid-cols-3 gap-2">
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '00'].map(val => (
                                        <button
                                            key={val}
                                            onClick={() => handleKeypadPress(val)}
                                            className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/[0.03] text-xl font-black text-white transition-all active:scale-95 active:bg-white/15"
                                        >
                                            {val}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => handleKeypadPress('C')}
                                    className="mt-2 w-full h-14 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-black text-sm uppercase tracking-widest transition-all active:scale-[0.99]"
                                >
                                    TUTARI TEMİZLE (C)
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer (Payment Selection & Submit Bar) */}
                <div className="px-8 py-6 border-t border-white/5 bg-[#070b16]">
                    <div className="flex flex-col sm:flex-row gap-5 items-center justify-between">
                        
                        {/* Ödeme Yöntemi Seçimi */}
                        <div className="flex bg-white/5 p-1 rounded-2xl gap-2 w-full sm:w-auto">
                            <button 
                                onClick={() => setPaymentMethod('card')}
                                className={`flex-1 sm:px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    paymentMethod === 'card' 
                                        ? 'bg-white text-black shadow-xl ring-4 ring-white/5' 
                                        : 'text-white/40 hover:text-white'
                                }`}
                            >
                                <FiCreditCard /> KART ÖDEMESİ
                            </button>
                            <button 
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex-1 sm:px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    paymentMethod === 'cash' 
                                        ? 'bg-white text-black shadow-xl ring-4 ring-white/5' 
                                        : 'text-white/40 hover:text-white'
                                }`}
                            >
                                💵 NAKİT ÖDEME
                            </button>
                        </div>

                        {/* Sonuç & Ödeme Tetikleme Butonu */}
                        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-4 sm:pt-0">
                            {activeTab === 'items' ? (
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block mb-0.5">Seçilen Ürün Tutarı</span>
                                    <div className="text-2xl font-black text-emerald-400 tracking-tighter tabular-nums">
                                        {currency}{selectedTotal.toFixed(2)}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block mb-0.5">Ödenecek Tutar</span>
                                    <div className="text-2xl font-black text-emerald-400 tracking-tighter tabular-nums">
                                        {currency}{parseFloat(amountInput || '0').toFixed(2)}
                                    </div>
                                </div>
                            )}
                            
                            <button 
                                onClick={activeTab === 'items' ? handleItemsPay : handleAmountPay}
                                disabled={
                                    isSubmitting || 
                                    (activeTab === 'items' ? selectedTotal <= 0 : !amountInput || parseFloat(amountInput) <= 0)
                                }
                                className={`h-15 px-9 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2.5 transition-all shadow-2xl ${
                                    (activeTab === 'items' ? selectedTotal > 0 : amountInput && parseFloat(amountInput) > 0) && !isSubmitting
                                    ? 'bg-emerald-500 text-white hover:bg-emerald-400 hover:scale-[1.02] hover:shadow-emerald-500/20 active:scale-[0.98]' 
                                    : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
                                }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        İŞLENİYOR...
                                    </>
                                ) : (
                                    <> <FiCheck size={16} /> ÖDEMEYİ AL </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

