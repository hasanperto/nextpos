import React from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { FiAlertTriangle, FiLogOut } from 'react-icons/fi';

export const ImpersonationBanner: React.FC = () => {
    const { isImpersonated, logout, tenantName } = useAuthStore();

    if (!isImpersonated) return null;

    const handleExit = () => {
        logout();
        window.location.href = '/login';
    };

    return (
        <div className="w-full bg-rose-600 border-b border-rose-500 text-white px-4 py-2.5 flex items-center justify-between shadow-xl z-[200] relative animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center animate-pulse shrink-0">
                    <FiAlertTriangle size={14} className="text-white" />
                </div>
                <div className="text-xs sm:text-sm font-bold tracking-tight">
                    <span className="font-black uppercase tracking-wider bg-black/30 px-2 py-0.5 rounded text-[10px] mr-2">Gölge Mod</span>
                    Şu anda <span className="underline font-extrabold">{tenantName || 'Kiracı'}</span> hesabını simüle ediyorsunuz. Yıkıcı işlemler engellenmiştir.
                </div>
            </div>
            <button
                onClick={handleExit}
                className="flex items-center gap-1.5 px-3 py-1 bg-white text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
            >
                <FiLogOut size={12} />
                Çıkış Yap
            </button>
        </div>
    );
};
