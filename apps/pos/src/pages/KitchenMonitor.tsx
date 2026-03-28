import React from 'react';
import { usePosStore } from '../store/usePosStore';
import { FiClock, FiCheck, FiPlay, FiAlertCircle, FiWifi } from 'react-icons/fi';
import { GiMeat, GiCookingPot } from 'react-icons/gi';

const KitchenMonitor = () => {
    const { orders, updateOrderStatus } = usePosStore();

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-orange-500';
            case 'preparing': return 'bg-blue-500';
            case 'ready': return 'bg-emerald-500';
            default: return 'bg-slate-500';
        }
    };

    const pendingOrders = orders.filter(o => o.status === 'pending');
    const preparingOrders = orders.filter(o => o.status === 'preparing');
    const readyOrders = orders.filter(o => o.status === 'ready');

    const OrderCard = ({ order }: { order: any }) => (
        <div className="bg-[var(--color-pos-bg-secondary)] border border-[var(--color-pos-border-default)] rounded-2xl overflow-hidden shadow-lg mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`px-4 py-2 text-white flex justify-between items-center ${getStatusColor(order.status)}`}>
                <span className="font-black tracking-widest text-sm">{order.id}</span>
                <span className="text-[10px] opacity-80 flex items-center gap-1">
                    <FiClock size={12} /> {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                    <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-sm ${order.orderType === 'dine_in' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' :
                            order.orderType === 'delivery' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                        {order.orderType === 'dine_in' ? `🪑 MASA ${order.tableNumber || '?'}` :
                            order.orderType === 'delivery' ? '🛵 PAKET SERVİS' : '🥡 GEL-AL'}
                    </div>
                    {order.customerName && (
                        <div className="text-sm font-black text-[var(--color-pos-info)]">{order.customerName}</div>
                    )}
                </div>

                <div className="space-y-3 mb-6">
                    {order.items.map((item: any) => (
                        <div key={item.cartId} className="flex justify-between items-start border-b border-white/5 pb-2 last:border-0">
                            <div className="text-sm">
                                <span className="font-mono font-black text-orange-500 mr-2 text-base">{item.qty}x</span>
                                <span className="font-black text-[var(--color-pos-text-primary)] text-[15px] uppercase tracking-tight">
                                    {item.product.displayName}
                                    {item.variant && (
                                        <span className="ml-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                            [{item.variant.displayName}]
                                        </span>
                                    )}
                                </span>
                                {item.notes && (
                                    <p className="text-[11px] text-[var(--color-pos-warning)] mt-1 ml-6 italic font-medium">
                                        ✨ {item.notes}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2">
                    {order.status === 'pending' && (
                        <button
                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                            <FiPlay size={18} /> BAŞLA
                        </button>
                    )}
                    {order.status === 'preparing' && (
                        <button
                            onClick={() => updateOrderStatus(order.id, 'ready')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                            <FiCheck size={18} /> HAZIR
                        </button>
                    )}
                    {order.status === 'ready' && (
                        <button
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                            TESLİM ET
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-screen w-full bg-[#0a0f18] text-white font-sans overflow-hidden">
            {/* BAŞLIK */}
            <header className="h-[70px] bg-[#111827] border-b border-white/10 flex items-center justify-between px-8 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                        <GiMeat size={28} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-black tracking-tighter uppercase italic">MUTFAK <span className="text-orange-500 italic">EKRANI</span></h1>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-gray-400">AKTİF SİPARİŞ</span>
                        <span className="text-xl font-black text-orange-500">{orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length}</span>
                    </div>
                    <div className="h-10 w-px bg-white/10"></div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-gray-400">ŞUBE: BERLIN CENTRAL</span>
                            <span className="text-sm font-black text-emerald-500"><FiWifi className="inline mr-1" /> ONLINE</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* ARAŞTIRMA / KOLONLAR */}
            <main className="flex-1 p-6 overflow-hidden flex gap-6">

                {/* KOLON: YENİ SİPARİŞLER */}
                <div className="flex-1 flex flex-col bg-black/20 rounded-[32px] border border-white/5 p-4 overflow-hidden">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(249,115,22,0.5)]"></div>
                        <h2 className="text-lg font-black tracking-widest uppercase">BEKLEYEN</h2>
                        <span className="ml-auto bg-orange-500/20 text-orange-500 px-3 py-1 rounded-full text-xs font-black">{pendingOrders.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 pos-scrollbar">
                        {pendingOrders.map(order => <OrderCard key={order.id} order={order} />)}
                        {pendingOrders.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-64 opacity-20">
                                <FiAlertCircle size={64} />
                                <p className="mt-4 font-bold">Yeni sipariş yok</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* KOLON: HAZIRLANIYOR */}
                <div className="flex-1 flex flex-col bg-black/20 rounded-[32px] border border-white/5 p-4 overflow-hidden">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                        <h2 className="text-lg font-black tracking-widest uppercase">HAZIRLANIYOR</h2>
                        <span className="ml-auto bg-blue-500/20 text-blue-500 px-3 py-1 rounded-full text-xs font-black">{preparingOrders.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 pos-scrollbar">
                        {preparingOrders.map(order => <OrderCard key={order.id} order={order} />)}
                    </div>
                </div>

                {/* KOLON: TAMAMLANDI */}
                <div className="flex-1 flex flex-col bg-black/20 rounded-[32px] border border-white/5 p-4 overflow-hidden">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                        <h2 className="text-lg font-black tracking-widest uppercase">HAZIR!</h2>
                        <span className="ml-auto bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-xs font-black">{readyOrders.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 pos-scrollbar">
                        {readyOrders.map(order => <OrderCard key={order.id} order={order} />)}
                    </div>
                </div>

            </main>
        </div>
    );
};

export default KitchenMonitor;
