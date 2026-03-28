import React from 'react';
import { FiX, FiCheck } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa6';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

export const WaOrderModal: React.FC = () => {
    const { setOrderType, createOrder } = usePosStore();
    const { showWaOrder, setWaOrder, setActiveCustomer, setCartOpen, isCartOpen } = useUIStore();

    if (!showWaOrder) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center animate-in fade-in">
            <div className="bg-[var(--color-pos-bg-secondary)] p-6 rounded-[24px] border-2 border-[#25D366] shadow-[0_0_50px_rgba(37,211,102,0.15)] max-w-lg w-full relative">
                <button onClick={() => setWaOrder(false)} className="absolute top-4 right-4 text-[var(--color-pos-text-secondary)] hover:text-white p-2 bg-[var(--color-pos-bg-tertiary)] rounded-full">
                    <FiX size={20} />
                </button>

                <h3 className="text-xl font-black text-white mb-4 flex items-center gap-3 bg-[#25D366]/20 p-3 rounded-xl border border-[#25D366]/30">
                    <span className="bg-[#25D366] text-white p-2 rounded-full shadow-lg shadow-[#25D366]/50"><FaWhatsapp size={24} /></span>
                    YENİ WHATSAPP SİPARİŞİ
                </h3>

                <div className="space-y-4">
                    <div className="bg-[var(--color-pos-bg-primary)] p-4 rounded-xl border border-[var(--color-pos-border-default)]">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="text-[#25D366] font-bold text-sm">Gelen Numara ve Adres</p>
                                <p className="text-white font-black text-lg">Hakan Yılmaz (+49 162 987 65)</p>
                            </div>
                            <span className="bg-[var(--color-pos-bg-tertiary)] text-[var(--color-pos-text-primary)] px-2 py-1 rounded text-[11px] font-bold">2dk önce</span>
                        </div>
                        <div className="bg-blue-900/40 p-2 rounded-lg border border-blue-500/30 text-[13px] text-blue-100 font-medium">
                            📍 <strong>Teslimat Adresi:</strong> Friedrichstraße 42, 10117 Berlin<br />
                            <span className="text-[var(--color-pos-warning)]" >└ Not: Zile basmayın uyuyan bebek var.</span>
                        </div>
                    </div>

                    <div className="bg-[var(--color-pos-bg-primary)] p-4 rounded-xl border border-[var(--color-pos-border-default)]">
                        <p className="text-[var(--color-pos-text-secondary)] font-bold text-[11px] uppercase tracking-widest mb-3">Sipariş İçeriği</p>

                        <div className="flex justify-between border-b border-[var(--color-pos-border-active)] pb-2 mb-2">
                            <div className="font-bold">
                                <span className="text-[var(--color-pos-warning)]">1x</span> Special Pizza (Kalın Hamur) <br />
                                <span className="text-[11px] text-[var(--color-pos-text-secondary)]">+ Ekstra Sucuk, Acılı Sos</span>
                            </div>
                            <div className="font-mono font-black text-[var(--color-pos-info)]">€12.50</div>
                        </div>

                        <div className="flex justify-between border-b border-[var(--color-pos-border-active)] pb-2 mb-2">
                            <div className="font-bold">
                                <span className="text-[var(--color-pos-warning)]">1x</span> Döner Dürüm (Soğansız)
                            </div>
                            <div className="font-mono font-black text-[var(--color-pos-info)]">€7.00</div>
                        </div>

                        <div className="flex justify-between items-center mt-3 pt-2">
                            <span className="text-[var(--color-pos-text-secondary)] font-bold">TOPLAM E-ÖDEME:</span>
                            <span className="font-mono text-xl font-black text-[var(--color-pos-success)]">€19.50</span>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button onClick={() => setWaOrder(false)} className="px-6 py-4 text-[var(--color-pos-text-secondary)] bg-[var(--color-pos-bg-tertiary)] hover:bg-black font-bold rounded-xl transition-all border border-[var(--color-pos-border-default)]">
                            İptal / Reddet
                        </button>
                        <button onClick={() => {
                            setWaOrder(false);
                            setOrderType('delivery');
                            setActiveCustomer({ name: 'Hakan Yılmaz', phone: '+49 162 987 65', address: 'Friedrichstraße 42' });
                            createOrder('Hakan Yılmaz');
                            if (!isCartOpen && window.innerWidth < 1280) setCartOpen(true);
                        }} className="flex-1 text-white bg-blue-600 hover:bg-blue-500 font-black tracking-wider text-lg rounded-xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2">
                            <FiCheck size={24} /> ONAYLA ve MUTFAĞA GÖNDER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
