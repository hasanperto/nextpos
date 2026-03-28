import React from 'react';
import { useParams } from 'react-router-dom';

export const CustomerMenu: React.FC = () => {
    const { tableId } = useParams();

    return (
        <div className="flex min-h-screen bg-slate-50 flex-col items-center pt-20 px-4">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">🍽️ Dijital Menü</h1>
            <p className="text-slate-500 font-medium">Masa: {tableId || 'Paket Sipariş'}</p>
            <div className="mt-10 p-6 bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md text-center">
                Müşteri QR ile siparişi gönderecek ve bu alanda WhatsApp onay akışı görünecek.
            </div>
        </div>
    );
};
