import React from 'react';
import { FiPhoneCall } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

export const CallerIdModal: React.FC = () => {
    const { setOrderType } = usePosStore();
    const { showCallerId, setCallerId, setActiveCustomer, setCartOpen, isCartOpen } = useUIStore();

    if (!showCallerId) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center animate-in fade-in">
            <div className="bg-[var(--color-pos-bg-primary)] p-8 rounded-[24px] border-2 border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.3)] max-w-sm w-full text-center relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                    <div className="w-32 h-32 bg-green-500 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white mb-6 animate-bounce shadow-lg shadow-green-500/50">
                        <FiPhoneCall size={36} />
                    </div>

                    <h3 className="text-2xl font-black text-[var(--color-pos-text-primary)] mb-1">GELEN ÇAĞRI</h3>
                    <p className="text-lg font-mono text-[var(--color-pos-warning)] mb-6 font-bold tracking-widest">0152 345 6789</p>

                    <div className="bg-[var(--color-pos-bg-secondary)] w-full rounded-xl p-4 mb-6 border border-[var(--color-pos-border-default)]">
                        <p className="text-[13px] text-[var(--color-pos-text-secondary)] font-medium mb-1 uppercase tracking-widest">Bilinen Müşteri (Caller ID)</p>
                        <p className="text-lg font-black text-[var(--color-pos-info)]">Kadir Mısırlı</p>
                        <p className="text-[12px] mt-1 italic text-[var(--color-pos-success)]">Sık sipariş veren müşteri (Gold Üye)</p>
                    </div>

                    <div className="flex gap-4 w-full">
                        <button onClick={() => setCallerId(false)} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 font-bold rounded-xl transition-all shadow-md">
                            Kapat
                        </button>
                        <button onClick={() => {
                            setCallerId(false);
                            setOrderType('delivery');
                            setActiveCustomer({ name: 'Kadir Mısırlı', phone: '0152 345 6789', address: 'Alexanderplatz 3, Mitte' });
                            if (!isCartOpen && window.innerWidth < 1280) setCartOpen(true);
                        }} className="flex-1 py-3 text-white bg-green-500 hover:bg-green-600 font-black tracking-wider rounded-xl transition-all shadow-md shadow-green-500/30">
                            Siparişi Aç
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
