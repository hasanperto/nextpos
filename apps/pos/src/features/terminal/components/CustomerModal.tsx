import React from 'react';
import { FiX, FiUser } from 'react-icons/fi';
import { useUIStore } from '../../../store/useUIStore';

export const CustomerModal: React.FC = () => {
    const { showCustomerModal, setCustomerModal, setActiveCustomer } = useUIStore();

    if (!showCustomerModal) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center animate-in fade-in">
            <div className="bg-[var(--color-pos-bg-secondary)] p-6 rounded-[24px] border border-[var(--color-pos-border-default)] max-w-md w-full relative">
                <button onClick={() => setCustomerModal(false)} className="absolute top-4 right-4 text-[var(--color-pos-text-secondary)] hover:text-white p-2 bg-[var(--color-pos-bg-tertiary)] rounded-full">
                    <FiX size={20} />
                </button>

                <h3 className="text-xl font-black text-[var(--color-pos-text-primary)] mb-4 flex items-center gap-2">
                    <FiUser className="text-[var(--color-pos-info)]" /> MÜŞTERİ SEÇ / EKLE
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-[var(--color-pos-text-secondary)] uppercase">Telefon veya İsimle Ara</label>
                        <input type="text" placeholder="0171 234 56 78" className="w-full mt-1 bg-[var(--color-pos-bg-tertiary)] text-[var(--color-pos-text-primary)] px-4 py-3 rounded-xl border border-[var(--color-pos-border-default)] outline-none focus:border-[var(--color-pos-info)]" />
                    </div>

                    <div className="border border-[var(--color-pos-border-active)] bg-[var(--color-pos-bg-primary)] rounded-xl p-4 flex flex-col items-center justify-center text-center mt-6">
                        <p className="text-sm font-bold text-[var(--color-pos-info)] mb-2">Müşteriye Özel Sadakat QR Kodu</p>
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=NEXTPOS_CUST_DEMO`} alt="QR" className="rounded-lg shadow border-2 border-white mb-2" />
                        <p className="text-[11px] text-[var(--color-pos-text-muted)]">Müşteri telefonuna okutarak adresi hızlı kaydedebilir veya menüden sipariş edebilir.</p>
                    </div>

                    <div className="pt-2">
                        <button onClick={() => {
                            setActiveCustomer({ name: 'Misafir Müşteri', phone: '+49 YENI', address: 'Kaydedilmedi' });
                            setCustomerModal(false);
                        }} className="w-full bg-[var(--color-pos-info)] text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20">
                            Yeni Kayıt Profilini Seç
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
