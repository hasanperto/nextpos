import React from 'react';
import { FiX, FiCheck, FiShoppingCart, FiCornerUpRight, FiTrash2 } from 'react-icons/fi';
import { GiCookingPot } from 'react-icons/gi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';

export const KitchenStatusModal: React.FC = () => {
    const { orders, loadOrderToCart, updateOrderStatus } = usePosStore();
    const { showKitchenStatus, setKitchenStatus, setCartOpen } = useUIStore();

    if (!showKitchenStatus) return null;

    const filteredOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[80] flex items-center justify-center animate-in fade-in">
            <div className="bg-[var(--color-pos-bg-secondary)] w-[90%] md:w-[800px] h-[80vh] rounded-[32px] border border-[var(--color-pos-border-default)] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[var(--color-pos-bg-primary)]">
                    <h3 className="text-xl font-black flex items-center gap-3">
                        <GiCookingPot size={28} className="text-orange-500" /> MUTFAK DURUM TAKİBİ
                    </h3>
                    <button onClick={() => setKitchenStatus(false)} className="bg-white/5 p-2 rounded-full hover:bg-red-500 transition-colors">
                        <FiX size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4 pos-scrollbar">
                    {filteredOrders.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center opacity-30 py-20">
                            <FiCheck size={100} />
                            <p className="text-xl font-bold mt-4">Tüm siparişler tamamlandı!</p>
                        </div>
                    )}
                    {[...orders]
                        .filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
                        .sort((a, b) => {
                            const p: any = { 'ready': 1, 'preparing': 2, 'pending': 3 };
                            return p[a.status] - p[b.status];
                        })
                        .map(order => (
                            <div key={order.id} className={`border p-4 rounded-2xl flex flex-col gap-3 transition-all ${order.status === 'ready' ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5' :
                                'bg-[var(--color-pos-bg-tertiary)] border-white/5'
                                }`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] font-black tracking-widest text-[var(--color-pos-text-secondary)] uppercase">{order.id} • {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        <p className="font-black text-lg text-white">
                                            {order.orderType === 'dine_in' ? `🪑 MASA ${order.tableNumber}` : order.orderType === 'delivery' ? '🛵 PAKET' : '🥡 GEL-AL'}
                                        </p>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase shadow-sm ${order.status === 'ready' ? 'bg-emerald-500 text-white animate-pulse' :
                                        order.status === 'preparing' ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white'
                                        }`}>
                                        {order.status === 'ready' ? 'HAZIR ✓' : order.status === 'preparing' ? 'HAZIRLANIYOR' : 'BEKLEMEDE'}
                                    </span>
                                </div>

                                <div className="bg-black/20 p-3 rounded-xl">
                                    {order.items.map((i: any) => (
                                        <p key={i.cartId} className="text-xs font-bold text-gray-300">
                                            {i.qty}x {i.product.displayName} {i.variant && <span className="text-emerald-400">[{i.variant.displayName}]</span>}
                                        </p>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    {order.status === 'ready' && (
                                        <button
                                            onClick={() => {
                                                loadOrderToCart(order.id);
                                                setKitchenStatus(false);
                                                if (window.innerWidth < 1280) setCartOpen(true);
                                            }}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 py-3 rounded-xl font-black text-sm text-white shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                        >
                                            <FiShoppingCart size={18} /> ÖDEMEYE GEÇ (ADIYON AÇ)
                                        </button>
                                    )}

                                    {order.status === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    loadOrderToCart(order.id);
                                                    updateOrderStatus(order.id, 'cancelled');
                                                    setKitchenStatus(false);
                                                    if (window.innerWidth < 1280) setCartOpen(true);
                                                }}
                                                className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-black text-sm text-white active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                <FiCornerUpRight size={18} /> DÜZENLE
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm('Siparişi iptal etmek istediğinize emin misiniz?')) {
                                                        updateOrderStatus(order.id, 'cancelled');
                                                    }
                                                }}
                                                className="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white px-4 py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2"
                                            >
                                                <FiTrash2 size={18} /> İPTAL
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
};
