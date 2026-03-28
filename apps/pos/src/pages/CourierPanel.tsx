import React from 'react';

export const CourierPanel: React.FC = () => {
    return (
        <div className="flex h-screen bg-slate-900 text-white flex-col items-center justify-center">
            <h1 className="text-3xl font-bold text-orange-400 mb-4">🛵 Kurye Ekranı</h1>
            <p className="text-slate-400">Atanan paket servis siparişleri, harita yönlendirmesi ve teslimat onayı burada olacak.</p>
        </div>
    );
};
