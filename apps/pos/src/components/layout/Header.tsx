import React from 'react';
import { FiMenu, FiClock, FiWifi, FiPhoneCall, FiSettings } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { usePosStore } from '../../store/usePosStore';
import { useUIStore } from '../../store/useUIStore';

export const Header: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { lang, setLang, orders } = usePosStore();
    const { setCallerId, setKitchenStatus, setWaOrder } = useUIStore();

    // Mutfak Yoğunluğu Hesaplama (Bekleme Süresi)
    const activeOrders = orders.filter(o => ['pending', 'preparing'].includes(o.status));
    const estimatedWaitTime = 10 + (activeOrders.length * 3);

    const handleLangToggle = () => {
        const nextLang = lang === 'de' ? 'tr' : lang === 'tr' ? 'en' : 'de';
        setLang(nextLang);
    };

    return (
        <header className="flex items-center justify-between h-[50px] px-4 bg-[var(--color-pos-bg-primary)] border-b border-[var(--color-pos-border-default)]">
            <div className="flex items-center gap-4 text-sm font-medium">
                <button className="flex items-center gap-2 hover:text-[var(--color-pos-accent-primary)] transition-colors touch-target">
                    <FiMenu size={24} />
                </button>
                {user?.role === 'admin' && (
                    <button onClick={() => navigate('/admin')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors font-bold shadow-md active:scale-95">
                        <FiSettings size={18} /> Yönetim Paneli
                    </button>
                )}
                <span className="text-base font-bold hidden md:block">Açık Masa: 8</span>
                <span className="text-[var(--color-pos-text-secondary)] hidden md:block">|</span>
                <span className="text-[var(--color-pos-text-secondary)] hidden md:block">Kasiyer: Ahmet Y.</span>

                {/* SİMÜLASYON: Telefon Çalıyor Butonu */}
                <button
                    onClick={() => setCallerId(true)}
                    className="ml-2 flex items-center gap-2 bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white px-3 py-2 rounded-lg transition-colors border border-green-500/30 font-bold active:scale-95"
                >
                    <FiPhoneCall className="animate-pulse" size={18} /> Çağrı Demo
                </button>

                <button
                    onClick={() => setKitchenStatus(true)}
                    className="ml-2 flex items-center gap-2 bg-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white px-3 py-2 rounded-lg transition-colors border border-orange-500/30 font-bold active:scale-95"
                >
                    🍳 Mutfak Takip
                    <span className="bg-orange-600 text-white text-[10px] px-1.5 rounded-full">
                        {orders.filter(o => o.status !== 'delivered').length}
                    </span>
                </button>

                <div className="ml-4 flex items-center gap-1.5 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700/50">
                    <FiClock className="text-orange-400" size={16} />
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold uppercase leading-none">Hazırlık Süresi</span>
                        <span className="text-sm font-black text-white leading-none mt-1">{estimatedWaitTime} DK</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 text-sm font-medium">
                {/* SİMÜLASYON: WhatsApp Siparişi */}
                <button
                    onClick={() => setWaOrder(true)}
                    className="flex items-center gap-2 bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366] hover:text-white px-3 py-2 rounded-lg transition-colors border border-[#25D366]/30 font-bold active:scale-95 shadow-[0_0_15px_rgba(37,211,102,0.3)] animate-pulse relative"
                >
                    <FaWhatsapp size={20} /> <span className="hidden md:inline">WP Siparişi (Tıkla!)</span>
                    <span className="bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full absolute -top-1 -right-1 shadow border border-[var(--color-pos-bg-primary)]">1</span>
                </button>

                <button
                    onClick={handleLangToggle}
                    className="flex items-center gap-2 font-bold bg-[var(--color-pos-bg-tertiary)] hover:bg-[var(--color-pos-bg-elevated)] px-4 py-2 rounded-lg transition-colors border border-[var(--color-pos-border-default)]"
                >
                    {lang === 'de' ? '🇩🇪 DE' : lang === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN'}
                </button>
                <span className="text-[var(--color-pos-success)] font-semibold drop-shadow-md hidden md:inline">BULUT: BAĞLI</span>
                <div className="flex items-center gap-3 text-[var(--color-pos-success)] ml-2">
                    <FiWifi size={20} />
                    <FiClock size={20} className="text-[var(--color-pos-text-secondary)]" />
                </div>
            </div>
        </header>
    );
};
