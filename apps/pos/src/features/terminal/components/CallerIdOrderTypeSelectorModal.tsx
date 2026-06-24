import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiNavigation, FiShoppingBag, FiCreditCard, FiDollarSign, FiClock, FiCheck, FiMapPin, FiUser } from 'react-icons/fi';
import { useUIStore } from '../../../store/useUIStore';
import { usePosStore } from '../../../store/usePosStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

export const CallerIdOrderTypeSelectorModal: React.FC = () => {
    const ui = useUIStore();
    const pos = usePosStore();
    const { t, lang } = usePosLocale();

    const [selectedType, setSelectedType] = useState<'delivery' | 'takeaway'>('delivery');
    const [deliveryPayment, setDeliveryPayment] = useState<'cash' | 'card' | 'online'>('cash');
    const [takeawayPayment, setTakeawayPayment] = useState<'cash' | 'card' | 'unpaid'>('unpaid');

    if (!ui.showCallerSelector || !ui.callerSelectorData) return null;

    const data = ui.callerSelectorData;

    const handleConfirm = () => {
        // Müşteri kartını sepet için ata
        if (data.customerId) {
            ui.setActiveCustomer({
                id: data.customerId,
                name: data.name,
                phone: data.number,
                address: data.address || ''
            });
        } else {
            // Taslak müşteri kaydı
            ui.setActiveCustomer({
                id: 0,
                name: data.name === t('caller.unknown_customer') ? '' : data.name,
                phone: data.number,
                address: data.address || ''
            });
        }

        // Sipariş türünü ayarla
        pos.setOrderType(selectedType);

        // Ödeme yöntemini ayarla (unpaid değilse sepete ilet)
        const payment = selectedType === 'delivery' ? deliveryPayment : takeawayPayment;
        if (payment === 'unpaid') {
            ui.setCallerPaymentMethod(null);
        } else {
            ui.setCallerPaymentMethod(payment);
        }

        // Sepeti aç ve bu modalı kapat
        ui.setCartOpen(true);
        ui.setCallerSelector(false);
    };

    // Dil bazlı çeviri etiketleri (TR, EN, DE)
    const labels = {
        title: lang === 'de' ? 'Bestelltyp & Zahlung' : lang === 'en' ? 'Order Type & Payment' : 'Sipariş Türü ve Ödeme Seçimi',
        subtitle: lang === 'de' ? 'Wählen Sie den Bestelltyp und die Zahlungsmethode für den Anruf' : lang === 'en' ? 'Select the order type and payment method for the incoming call' : 'Gelen çağrı için sipariş türünü ve ödeme yöntemini seçin',
        delivery: lang === 'de' ? 'Lieferservice' : lang === 'en' ? 'Delivery' : 'Paket Servis',
        takeaway: lang === 'de' ? 'Abholung' : lang === 'en' ? 'Takeaway' : 'Gel-Al',
        paymentMethod: lang === 'de' ? 'Zahlungsmethode' : lang === 'en' ? 'Payment Method' : 'Ödeme Yöntemi',
        cashOnDelivery: lang === 'de' ? 'Barzahlung bei Lieferung' : lang === 'en' ? 'Cash on Delivery' : 'Kapıda Nakit',
        cardOnDelivery: lang === 'de' ? 'Kartenzahlung bei Lieferung' : lang === 'en' ? 'Card on Delivery' : 'Kapıda Kredi Kartı',
        onlinePayment: lang === 'de' ? 'Online Zahlung' : lang === 'en' ? 'Online Payment' : 'Online Ödeme',
        cashAtCounter: lang === 'de' ? 'Barzahlung an der Kasse' : lang === 'en' ? 'Cash at Counter' : 'Kasada Nakit',
        cardAtCounter: lang === 'de' ? 'Kartenzahlung an der Kasse' : lang === 'en' ? 'Card at Counter' : 'Kasada Kredi Kartı',
        payLater: lang === 'de' ? 'Später bezahlen' : lang === 'en' ? 'Pay Later (Unpaid)' : 'Sonra Öde (Ödenmedi)',
        cancel: lang === 'de' ? 'Abbrechen' : lang === 'en' ? 'Cancel' : 'Vazgeç',
        startOrder: lang === 'de' ? 'Bestellung Starten' : lang === 'en' ? 'Start Order' : 'Siparişi Başlat'
    };

    return (
        <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-2xl z-[150] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#0f172a] border border-white/10 rounded-[36px] shadow-[0_0_100px_rgba(16,185,129,0.15)] max-w-xl w-full overflow-hidden relative"
            >
                {/* Close Button */}
                <button
                    onClick={() => ui.setCallerSelector(false)}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500 transition-all z-20"
                >
                    <FiX size={20} />
                </button>

                <div className="p-8">
                    {/* Customer Quick View Card */}
                    <div className="flex items-center gap-4 bg-white/5 p-5 rounded-3xl border border-white/[0.05] mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <FiUser size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-base font-black text-white truncate leading-tight uppercase">
                                {data.name}
                            </h4>
                            <p className="text-xs font-mono font-black text-emerald-400 tracking-wider mt-0.5">
                                {data.number}
                            </p>
                        </div>
                    </div>

                    {data.address && (
                        <div className="flex items-start gap-2.5 bg-white/[0.02] border border-white/5 p-4 rounded-2xl mb-6">
                            <FiMapPin className="text-amber-500 mt-0.5 shrink-0" size={14} />
                            <p className="text-[11px] font-medium text-slate-400 italic leading-relaxed line-clamp-2">
                                {data.address}
                            </p>
                        </div>
                    )}

                    <h3 className="text-xl font-black text-white tracking-tight uppercase mb-1">{labels.title}</h3>
                    <p className="text-xs text-slate-400 mb-8">{labels.subtitle}</p>

                    {/* Step 1: Order Type Selector */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <button
                            type="button"
                            onClick={() => setSelectedType('delivery')}
                            className={`p-6 rounded-3xl border text-left transition-all relative group flex flex-col gap-3 ${
                                selectedType === 'delivery'
                                    ? 'bg-blue-600 border-blue-500 shadow-xl shadow-blue-600/20'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                selectedType === 'delivery' ? 'bg-white text-blue-600' : 'bg-blue-500/10 text-blue-400'
                            }`}>
                                <FiNavigation size={20} />
                            </div>
                            <div>
                                <span className={`text-[10px] font-black uppercase tracking-wider block ${selectedType === 'delivery' ? 'text-white/70' : 'text-slate-500'}`}>
                                    MOD 01
                                </span>
                                <span className="text-base font-black text-white mt-0.5 block">{labels.delivery}</span>
                            </div>
                            {selectedType === 'delivery' && (
                                <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-white flex items-center justify-center text-blue-600">
                                    <FiCheck size={12} />
                                </div>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setSelectedType('takeaway')}
                            className={`p-6 rounded-3xl border text-left transition-all relative group flex flex-col gap-3 ${
                                selectedType === 'takeaway'
                                    ? 'bg-amber-600 border-amber-500 shadow-xl shadow-amber-600/20'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                selectedType === 'takeaway' ? 'bg-white text-amber-600' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                                <FiShoppingBag size={20} />
                            </div>
                            <div>
                                <span className={`text-[10px] font-black uppercase tracking-wider block ${selectedType === 'takeaway' ? 'text-white/70' : 'text-slate-500'}`}>
                                    MOD 02
                                </span>
                                <span className="text-base font-black text-white mt-0.5 block">{labels.takeaway}</span>
                            </div>
                            {selectedType === 'takeaway' && (
                                <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-white flex items-center justify-center text-amber-600">
                                    <FiCheck size={12} />
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Step 2: Payment Method Selector */}
                    <div className="space-y-3.5 mb-8">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">
                            {labels.paymentMethod}
                        </label>

                        {selectedType === 'delivery' ? (
                            <div className="grid grid-cols-3 gap-2.5">
                                {[
                                    { id: 'cash', label: labels.cashOnDelivery, icon: <FiDollarSign size={14} /> },
                                    { id: 'card', label: labels.cardOnDelivery, icon: <FiCreditCard size={14} /> },
                                    { id: 'online', label: labels.onlinePayment, icon: <FiClock size={14} /> }
                                ].map((pay) => (
                                    <button
                                        key={pay.id}
                                        type="button"
                                        onClick={() => setDeliveryPayment(pay.id as any)}
                                        className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2 ${
                                            deliveryPayment === pay.id
                                                ? 'bg-orange-500/25 border-orange-500/40 text-orange-400 shadow-md shadow-orange-950/20'
                                                : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        <div className={`p-2 rounded-xl transition-all ${deliveryPayment === pay.id ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-slate-500'}`}>
                                            {pay.icon}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-tight leading-tight block">{pay.label}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2.5">
                                {[
                                    { id: 'cash', label: labels.cashAtCounter, icon: <FiDollarSign size={14} /> },
                                    { id: 'card', label: labels.cardAtCounter, icon: <FiCreditCard size={14} /> },
                                    { id: 'unpaid', label: labels.payLater, icon: <FiClock size={14} /> }
                                ].map((pay) => (
                                    <button
                                        key={pay.id}
                                        type="button"
                                        onClick={() => setTakeawayPayment(pay.id as any)}
                                        className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2 ${
                                            takeawayPayment === pay.id
                                                ? 'bg-orange-500/25 border-orange-500/40 text-orange-400 shadow-md shadow-orange-950/20'
                                                : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        <div className={`p-2 rounded-xl transition-all ${takeawayPayment === pay.id ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-slate-500'}`}>
                                            {pay.icon}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-tight leading-tight block">{pay.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            type="button"
                            onClick={() => ui.setCallerSelector(false)}
                            className="h-14 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all active:scale-95"
                        >
                            {labels.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="col-span-2 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-950/40 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {labels.startOrder} →
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
