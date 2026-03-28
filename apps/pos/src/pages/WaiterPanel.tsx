import React from 'react';

export const WaiterPanel: React.FC = () => {
    return (
        <div className="flex h-screen bg-slate-900 text-white flex-col items-center justify-center">
            <h1 className="text-3xl font-bold text-blue-400 mb-4">📱 Garson Ekranı (PWA)</h1>
            <p className="text-slate-400">Canlı masa durumları, sipariş girme ve mutfak bildirimleri burada olacak.</p>
        </div>
    );
};
