import React, { useState } from 'react';
import { FiX, FiCheck, FiShoppingBag, FiCreditCard } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { usePosStore } from '../../../store/usePosStore';

interface SplitBillModalProps {
    sessionId: number;
    tableName: string;
    onClose: () => void;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({ sessionId, tableName, onClose }) => {
    const { orders, splitBill, settings } = usePosStore();
    
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

    // Seçilenlerin toplam tutarı
    const selectedTotal = allItems.reduce((sum, item) => {
        const selQty = selections[item.cartId] || 0;
        return sum + (item.price * selQty);
    }, 0);

    const handleSplitPay = async () => {
        if (selectedTotal <= 0) {
            toast.error('Lütfen ödenecek ürün seçin');
            return;
        }

        setIsSubmitting(true);
        
        // API'nin beklediği formata çevir
        // cartId içinden orderItemId'yi almamız lazım. 
        // OrderItem mapper'da `api-${oi.id}` demiştik.
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            
            <div className="relative w-full max-w-2xl bg-[#0f172a] border border-white/10 rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-300">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-transparent">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                            <FiShoppingBag className="text-emerald-400" />
                            HESAP BÖLME
                        </h2>
                        <p className="text-emerald-400/60 font-bold text-xs mt-1 tracking-widest uppercase">
                            {tableName} • Kısmi Ödeme Ekranı
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-xl"
                    >
                        <FiX size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 pos-scrollbar">
                    <div className="grid grid-cols-1 gap-2">
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
                                            ? 'bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                                            : 'bg-white/5 border-transparent hover:bg-white/10'
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

                                        <div className="flex items-center gap-4">
                                            {/* Quantity Adjuster */}
                                            {item.qty > 1 && (
                                                <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5" onClick={e => e.stopPropagation()}>
                                                    <button 
                                                        onClick={() => setQty(item.cartId, selQty - 1, item.qty)}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white"
                                                    >-</button>
                                                    <span className="w-8 text-center font-black text-emerald-400">{selQty}</span>
                                                    <button 
                                                        onClick={() => setQty(item.cartId, selQty + 1, item.qty)}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                                                    >+</button>
                                                </div>
                                            )}
                                            
                                            <div className="text-right min-w-[80px]">
                                                <div className="text-xs text-white/30 line-through">{settings?.currency || '€'}{(item.price * item.qty).toFixed(2)}</div>
                                                <div className={`font-black text-lg ${isSelected ? 'text-emerald-400' : 'text-white/60'}`}>
                                                    {settings?.currency || '€'}{(item.price * (isSelected ? selQty : item.qty)).toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-8 border-t border-white/5 bg-black/40">
                    <div className="flex flex-col sm:flex-row gap-6 items-center justify-between">
                        {/* Payment Selection */}
                        <div className="flex bg-white/5 p-1.5 rounded-2xl gap-2 w-full sm:w-auto">
                            <button 
                                onClick={() => setPaymentMethod('card')}
                                className={`flex-1 sm:px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    paymentMethod === 'card' ? 'bg-white text-black shadow-xl ring-4 ring-white/10' : 'text-white/40 hover:text-white'
                                }`}
                            >
                                <FiCreditCard /> KART
                            </button>
                            <button 
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex-1 sm:px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    paymentMethod === 'cash' ? 'bg-white text-black shadow-xl ring-4 ring-white/10' : 'text-white/40 hover:text-white'
                                }`}
                            >
                                💵 NAKİT
                            </button>
                        </div>

                        {/* Total & Action */}
                        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="text-right">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block mb-1">Seçilen Tutar</span>
                                <div className="text-3xl font-black text-emerald-400 tracking-tighter">{settings?.currency || '€'}{selectedTotal.toFixed(2)}</div>
                            </div>
                            
                            <button 
                                onClick={handleSplitPay}
                                disabled={selectedTotal <= 0 || isSubmitting}
                                className={`h-16 px-10 rounded-[20px] font-black text-lg flex items-center gap-3 transition-all shadow-2xl ${
                                    selectedTotal > 0 && !isSubmitting
                                    ? 'bg-emerald-500 text-white hover:bg-emerald-400 hover:scale-[1.02] shadow-emerald-500/20' 
                                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                                }`}
                            >
                                {isSubmitting ? 'İŞLENİYOR...' : (
                                    <> <FiCheck /> ÖDE </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
