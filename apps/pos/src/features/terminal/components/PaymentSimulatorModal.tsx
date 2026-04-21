import React from 'react';
import { FiCreditCard, FiWifi, FiCheckCircle, FiXCircle, FiLoader } from 'react-icons/fi';
import { useUIStore } from '../../../store/useUIStore';

export const PaymentSimulatorModal: React.FC = () => {
    const { paymentSimulation, setPaymentSimulation } = useUIStore();
    const { isOpen, amount, status, method } = paymentSimulation;

    if (!isOpen) return null;

    const providerNames: Record<string, string> = {
        sumup: 'SumUp Air',
        stripe: 'Stripe Terminal',
        iyzico: 'Iyzico Android POS',
        manual: 'External Terminal'
    };

    const steps = [
        { id: 'connecting', label: `${providerNames[method] || 'Terminal'} Bağlanıyor...`, icon: <FiLoader className="animate-spin" /> },
        { id: 'waiting_card', label: 'Kartı Yaklaştırın / Takın', icon: <FiWifi className="animate-pulse" /> },
        { id: 'processing', label: 'İşlem Onaylanıyor...', icon: <FiLoader className="animate-spin text-blue-500" /> },
        { id: 'success', label: 'Ödeme Başarılı!', icon: <FiCheckCircle className="text-emerald-500" /> },
        { id: 'error', label: 'İşlem Reddedildi!', icon: <FiXCircle className="text-red-500" /> }
    ];

    const handleSimulatorComplete = () => {
        if (paymentSimulation.onComplete) {
            paymentSimulation.onComplete();
        }
        setPaymentSimulation({ isOpen: false });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-[420px] bg-white rounded-[40px] overflow-hidden shadow-2xl relative border-8 border-slate-300">
                
                {/* Header / Antenna area */}
                <div className="h-10 bg-slate-200 flex justify-center items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                </div>

                <div className="p-10 flex flex-col items-center text-center">
                    <div className="w-24 h-24 mb-8 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 group">
                        {status === 'connecting' && <FiLoader size={48} className="animate-spin text-blue-500" />}
                        {status === 'waiting_card' && <FiWifi size={48} className="animate-pulse text-emerald-500" />}
                        {status === 'processing' && <FiLoader size={48} className="animate-spin text-indigo-500" />}
                        {status === 'success' && <FiCheckCircle size={56} className="text-emerald-500 animate-bounce" />}
                        {status === 'error' && <FiXCircle size={56} className="text-red-500 animate-shake" />}
                    </div>

                    <div className="mb-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ÖDEYECEK TUTAR</span>
                        <h2 className="text-4xl font-black text-slate-800 mt-1">€{amount.toFixed(2)}</h2>
                    </div>

                    <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-10">
                        <p className="text-sm font-black text-slate-600 uppercase tracking-widest leading-relaxed">
                            {steps.find(s => s.id === status)?.label}
                        </p>
                        {status === 'waiting_card' && (
                            <div className="mt-4 flex justify-center gap-3">
                                <div className="w-8 h-5 bg-slate-200 rounded animate-pulse"></div>
                                <div className="w-8 h-5 bg-slate-200 rounded animate-pulse delay-75"></div>
                                <div className="w-8 h-5 bg-slate-200 rounded animate-pulse delay-150"></div>
                            </div>
                        )}
                    </div>

                    <div className="flex w-full gap-3">
                        {status === 'waiting_card' && (
                            <button 
                                onClick={() => setPaymentSimulation({ status: 'processing' })}
                                className="flex-1 bg-slate-900 text-white rounded-2xl py-4 font-black text-xs hover:bg-black transition-all active:scale-95"
                            >
                                KARTI DOKUNDUR (SİMÜLE ET)
                            </button>
                        )}
                        {(status === 'success' || status === 'error') && (
                            <button 
                                onClick={handleSimulatorComplete}
                                className={`flex-1 rounded-2xl py-4 font-black text-xs transition-all active:scale-95 text-white ${status === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}
                            >
                                {status === 'success' ? 'TAMAMLANDI' : 'KAPAT'}
                            </button>
                        )}
                        {status !== 'success' && status !== 'error' && (
                            <button 
                                onClick={() => setPaymentSimulation({ isOpen: false })}
                                className="flex-1 bg-white border border-slate-200 text-slate-400 rounded-2xl py-4 font-black text-xs hover:bg-slate-50 transition-all active:scale-95"
                            >
                                İPTAL
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center px-8">
                     <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">NEXTPOS TERMINAL SIM v1.0</span>
                     <div className="flex items-center gap-2">
                        <FiCreditCard size={14} className="text-slate-300" />
                        <FiWifi size={14} className="text-slate-300" />
                     </div>
                </div>
            </div>
        </div>
    );
};
