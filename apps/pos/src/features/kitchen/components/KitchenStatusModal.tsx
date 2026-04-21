import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiX, FiShoppingCart, FiClock, FiAlertCircle, FiRefreshCw, FiPackage } from 'react-icons/fi';
import { GiCookingPot } from 'react-icons/gi';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import { HandoverCenterContent } from '../../handover/HandoverCenterContent';
import { ModernConfirmModal } from '../../terminal/components/ModernConfirmModal';


interface KitchenTicketRow {
    id: number;
    order_id: number;
    table_name: string | null;
    waiter_name: string | null;
    status: 'waiting' | 'preparing' | 'ready' | 'completed' | 'cancelled';
    is_urgent: boolean;
    ticket_number: number | null;
    items: any;
    created_at: string;
    order_type: string;
    table_name_current?: string | null;
    station?: string;
}

export const KitchenStatusModal: React.FC = () => {
    const { loadOrderToCart } = usePosStore();
    const { getAuthHeaders, user } = useAuthStore();
    const { showKitchenStatus, setKitchenStatus, setCartOpen } = useUIStore();
    const { t } = usePosLocale();

    const handleAddTakeawayToCart = useCallback(
        async (orderId: number) => {
            await loadOrderToCart(String(orderId));
            setKitchenStatus(false);
            if (window.innerWidth < 1280) setCartOpen(true);
        },
        [loadOrderToCart, setKitchenStatus, setCartOpen]
    );

    const [modalTab, setModalTab] = useState<'kitchen' | 'handover'>('kitchen');
    const [handoverRefreshSignal, setHandoverRefreshSignal] = useState(0);
    const [tickets, setTickets] = useState<KitchenTicketRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState<{ id: number } | null>(null);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        try {
            // Kasiyer tüm istasyonları görsün
            const res = await fetch(`/api/v1/kitchen/tickets`, {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setTickets(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
            toast.error(t('kitchen.fetch_error'));
        } finally {
            setLoading(false);
        }

    }, [getAuthHeaders, t]);

    useEffect(() => {
        if (showKitchenStatus) {
            setModalTab('kitchen');
            void fetchTickets();
        }
    }, [showKitchenStatus, fetchTickets]);

    if (!showKitchenStatus) return null;

    const parseItems = (raw: any): any[] => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try { return JSON.parse(raw || '[]'); } catch { return []; }
        }
        return [];
    };

    const getElapsedTime = (createdAt: string) => {
        const start = new Date(createdAt).getTime();
        const diff = Date.now() - start;
        const mins = Math.floor(diff / 60000);
        return mins;
    };

    const getSLALevel = (ticket: KitchenTicketRow) => {
        const mins = getElapsedTime(ticket.created_at);
        if (ticket.status === 'waiting' && mins > 10) return 'critical';
        if (ticket.status === 'preparing' && mins > 20) return 'critical';
        if (ticket.status === 'ready' && mins > 5) return 'warning';
        return 'normal';
    };

    const TicketColumn = ({ 
        title, 
        statusColor, 
        tickets: colTickets, 
        emptyMsg,
        accentColor
    }: { 
        title: string; 
        statusColor: string; 
        tickets: KitchenTicketRow[]; 
        emptyMsg: string;
        accentColor: string;
    }) => {
        return (
            <div className="flex-1 flex flex-col min-w-[320px] bg-black/10 rounded-[32px] border border-white/5 overflow-hidden">
                <div className={`px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/5`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${statusColor} animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.2)]`} />
                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-white opacity-80">{title}</h4>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${accentColor}`}>
                        {colTickets.length}
                    </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 pos-scrollbar pb-10">
                    {colTickets.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center opacity-20 italic font-medium">
                            <FiAlertCircle size={28} />
                            <span className="text-[10px] font-bold mt-2 uppercase tracking-widest">{emptyMsg}</span>
                        </div>
                    ) : (
                        title === t('kitchen.ready') ? (

                            // Grouped Ready View by Table
                            (() => {
                                const groupedMap: Record<string, { tableName: string, items: any[], orderIds: Set<number>, ticketIds: Set<number>, types: Set<string> }> = {};
                                colTickets.forEach(t => {
                                    const key = t.table_name_current || t.table_name || 'PAKET';
                                    if (!groupedMap[key]) groupedMap[key] = { tableName: key, items: [], orderIds: new Set(), ticketIds: new Set(), types: new Set() };
                                    groupedMap[key].items.push(...parseItems(t.items));
                                    groupedMap[key].orderIds.add(t.order_id);
                                    groupedMap[key].ticketIds.add(t.id);
                                    groupedMap[key].types.add(t.order_type);
                                });

                                return Object.values(groupedMap).map((group, idx) => {
                                    const isDineIn = group.types.has('dine_in');
                                    return (
                                        <div key={idx} className="bg-[var(--color-pos-bg-tertiary)] border-2 border-emerald-500/30 rounded-2xl overflow-hidden shadow-lg group hover:border-emerald-500 transition-all">
                                            <div className={`px-3 py-1.5 flex justify-between items-center ${statusColor} text-white font-black italic tracking-widest text-[10px]`}>
                                                <span>{isDineIn ? `🪑 ${t('cart.dineIn')} ${group.tableName}` : group.tableName === 'PAKET' ? t('cart.takeaway') : group.tableName}</span>
                                                <div className="flex items-center gap-2">
                                                    {group.items.length} {t('kitchen.items_count')}
                                                </div>

                                            </div>
                                            <div className="p-4">
                                                <div className="space-y-1.5 mb-4 border-l-2 border-emerald-500 pl-3">
                                                    {group.items.reduce((acc: any[], cur: any) => {
                                                        const match = acc.find(x => x.product_name === cur.product_name && x.variant_name === cur.variant_name && x.notes === cur.notes);
                                                        if (match) match.quantity += cur.quantity; else acc.push({ ...cur });
                                                        return acc;
                                                    }, []).map((item, i) => (
                                                        <div key={i} className="text-[11px] font-bold text-white/90">
                                                            <span className="text-orange-500 mr-1">{item.quantity}x</span> 
                                                            {item.product_name}
                                                            {item.variant_name && <span className="text-blue-400 text-[9px] ml-1 opacity-60">[{item.variant_name}]</span>}
                                                            {item.notes && <p className="text-[9px] text-yellow-500 ml-4 font-medium italic">➲ {item.notes}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => { 
                                                            const firstOrderId = Array.from(group.orderIds)[0];
                                                            void loadOrderToCart(String(firstOrderId)); 
                                                            setKitchenStatus(false); 
                                                            if (window.innerWidth < 1280) setCartOpen(true); 
                                                        }}
                                                        className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-black text-[10px] text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 uppercase tracking-widest"
                                                    >
                                                        <FiShoppingCart size={14} /> {t('kitchen.take_to_cart')}
                                                    </button>

                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const ids = Array.from(group.ticketIds);
                                                                await Promise.all(ids.map(id => 
                                                                    fetch(`/api/v1/kitchen/tickets/${id}/status`, {
                                                                        method: 'PATCH',
                                                                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ status: 'completed' })
                                                                    })
                                                                ));
                                                                toast.success(t('kitchen.toast.delivered'));
                                                                void fetchTickets();
                                                            } catch (e) { toast.error(t('kitchen.toast.error')); }
                                                        }}
                                                        className="w-full h-8 border-2 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl font-black text-[9px] transition-all uppercase tracking-widest"
                                                    >
                                                        {t('kitchen.deliver_all')} ✓
                                                    </button>

                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()
                        ) : (
                            colTickets.map(ticket => {
                                const items = parseItems(ticket.items);
                                const tableName = ticket.table_name_current || ticket.table_name || '?';
                                return (
                                    <div key={ticket.id} className="bg-[var(--color-pos-bg-tertiary)] border border-white/5 rounded-2xl overflow-hidden shadow-lg group hover:border-white/20 transition-all">
                                        <div className={`px-3 py-1.5 flex justify-between items-center ${statusColor} text-white`}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black uppercase tracking-widest">
                                                    #{ticket.ticket_number ?? ticket.id} · S{ticket.order_id}
                                                </span>
                                                {getSLALevel(ticket) === 'critical' && (
                                                    <span className="bg-white text-rose-600 px-1.5 py-0.5 rounded text-[8px] font-black animate-pulse">
                                                        {t('kitchen.sla_delay')}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[9px] font-bold flex items-center gap-1 opacity-80">
                                                <FiClock size={10} /> {getElapsedTime(ticket.created_at)}{t('kitchen.mins')} {t('kitchen.ago')}
                                            </span>

                                        </div>
        
                                        <div className="p-4">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-orange-500 tracking-tighter uppercase italic">
                                                        {ticket.order_type === 'dine_in' ? `🪑 ${t('cart.dineIn')} ${tableName}` : ticket.order_type === 'delivery' ? `🛵 ${t('cart.delivery')}` : `🥡 ${t('cart.takeaway')}`}
                                                    </span>
                                                    <span className="text-[8px] font-black text-gray-500 uppercase mt-0.5">
                                                       {ticket.station === 'bar' ? `🍸 ${t('kitchen.station.bar')}` : ticket.station === 'cold' ? `🥗 ${t('kitchen.station.cold')}` : `🔥 ${t('kitchen.station.kitchen')}`}
                                                    </span>
                                                </div>
                                                {ticket.is_urgent && <span className="text-[9px] font-black text-rose-500 animate-pulse">{t('kitchen.urgent')}</span>}
                                            </div>

        
                                            <div className="space-y-1.5 mb-4 border-l-2 border-white/5 pl-3">
                                                {items.map((item: any, idx: number) => (
                                                    <div key={idx} className="text-[11px] font-bold text-white/90">
                                                        <span className="text-orange-500 mr-1">{item.quantity}x</span> 
                                                        {item.product_name}
                                                        {item.variant_name && <span className="text-blue-400 text-[9px] ml-1 opacity-60">[{item.variant_name}]</span>}
                                                        {item.notes && <p className="text-[9px] text-[var(--color-pos-warning)] ml-4 font-medium italic opacity-70">➲ {item.notes}</p>}
                                                    </div>
                                                ))}
                                            </div>

                                            {ticket.status === 'waiting' && (
                                                <button
                                                    onClick={async () => {
                                                        setCancelConfirm({ id: ticket.id });
                                                    }}
                                                    className="w-full h-10 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl font-black text-xs transition-all uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-white/20"
                                                >
                                                    {t('kitchen.cancel_ticket')}
                                                </button>

                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-300">
            <div 
                className="bg-[var(--color-pos-bg-secondary)] w-full max-w-[1200px] h-[95vh] lg:h-[90vh] rounded-[48px] border border-white/10 flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-500"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header + sekme (mutfak / teslim) */}
                <div className="px-4 sm:px-8 lg:px-10 py-6 sm:py-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between bg-white/5 border-b border-white/5 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 min-w-0">
                        <div
                            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-[24px] flex items-center justify-center border-2 shrink-0 shadow-[0_0_30px_rgba(0,0,0,0.35)] ${
                                modalTab === 'kitchen'
                                    ? 'bg-orange-500/20 border-orange-500/30'
                                    : 'bg-pink-600/20 border-pink-500/30'
                            }`}
                        >
                            {modalTab === 'kitchen' ? (
                                <GiCookingPot size={34} className="text-orange-500" />
                            ) : (
                                <FiPackage size={30} className="text-pink-400" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            {modalTab === 'kitchen' ? (
                                <>
                                    <h3 className="text-2xl sm:text-3xl font-black text-white italic tracking-tighter uppercase">
                                        {t('kitchen.title').split(' ')[0]}{' '}
                                        <span className="text-orange-500">{t('kitchen.title').split(' ').slice(1).join(' ')}</span>
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[.35em] opacity-80 mt-1">{t('kitchen.subtitle')}</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-2xl sm:text-3xl font-black text-white italic tracking-tighter uppercase">
                                        {t('kitchen.tab_handover').split(' ')[0]}{' '}
                                        <span className="text-pink-500">{t('kitchen.tab_handover').split(' ').slice(1).join(' ') || ''}</span>
                                    </h3>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[.35em] opacity-80 mt-1">{t('kitchen.subtitle_handover')}</p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
                        <div className="flex p-1 rounded-2xl bg-black/35 border border-white/10 shadow-inner w-full sm:w-auto max-w-xl">
                            <button
                                type="button"
                                onClick={() => setModalTab('kitchen')}
                                className={`flex-1 px-3 sm:px-5 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                    modalTab === 'kitchen'
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <GiCookingPot size={16} className="opacity-90 shrink-0" />
                                <span className="truncate">{t('kitchen.tab_kitchen')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setModalTab('handover')}
                                className={`flex-1 px-3 sm:px-5 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                    modalTab === 'handover'
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <FiPackage size={16} className="opacity-90 shrink-0" />
                                <span className="truncate">{t('kitchen.tab_handover')}</span>
                            </button>
                        </div>

                        <div className="flex items-center justify-end gap-2 sm:gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    if (modalTab === 'kitchen') void fetchTickets();
                                    else setHandoverRefreshSignal((n) => n + 1);
                                }}
                                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10 transition-all border border-white/10"
                                disabled={modalTab === 'kitchen' && loading}
                            >
                                <FiRefreshCw size={22} className={(modalTab === 'kitchen' && loading) ? 'animate-spin' : ''} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setKitchenStatus(false)}
                                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 hover:bg-rose-500/20 hover:text-rose-500 transition-all border border-white/10"
                                aria-label={t('kitchen.close_modal')}
                            >
                                <FiX size={26} />
                            </button>
                        </div>
                    </div>
                </div>

                {modalTab === 'kitchen' ? (
                    <div className="flex-1 overflow-x-auto p-4 sm:p-8 flex gap-4 sm:gap-6 overflow-y-hidden bg-black/10 min-h-0">
                        <TicketColumn
                            title={t('kitchen.waiting')}
                            statusColor="bg-orange-500"
                            accentColor="bg-orange-500/20 text-orange-400"
                            tickets={tickets.filter((t) => t.status === 'waiting')}
                            emptyMsg={t('kitchen.empty.waiting')}
                        />
                        <TicketColumn
                            title={t('kitchen.preparing')}
                            statusColor="bg-blue-600"
                            accentColor="bg-blue-500/20 text-blue-400"
                            tickets={tickets.filter((t) => t.status === 'preparing')}
                            emptyMsg={t('kitchen.empty.preparing')}
                        />
                        <TicketColumn
                            title={t('kitchen.ready')}
                            statusColor="bg-emerald-500"
                            accentColor="bg-emerald-500/20 text-emerald-400"
                            tickets={tickets.filter((t) => t.status === 'ready')}
                            emptyMsg={t('kitchen.empty.ready')}
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-black/10 px-2 pb-2 sm:px-4 sm:pb-4">
                        <HandoverCenterContent
                            embedded
                            hideToolbar
                            refreshSignal={handoverRefreshSignal}
                            variant="embedded_modal"
                            onAddTakeawayToCart={
                                user?.role === 'cashier' || user?.role === 'admin' ? handleAddTakeawayToCart : undefined
                            }
                        />
                    </div>
                )}

                <div className="px-6 sm:px-10 py-4 sm:py-5 bg-black/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0">
                    {modalTab === 'kitchen' ? (
                        <>
                            <div className="flex flex-wrap items-center gap-4 sm:gap-8 text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-orange-500" /> {t('kitchen.waiting').toUpperCase()}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-600" /> {t('kitchen.preparing').toUpperCase()}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> {t('kitchen.ready').split(' / ')[0].toUpperCase()}
                                </div>
                            </div>
                            <div className="text-[10px] font-black text-gray-400 opacity-30 italic">{t('kitchen.footer_kds_sync')}</div>
                        </>
                    ) : (
                        <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest w-full text-center sm:text-left">
                            {t('kitchen.subtitle_handover')} · Socket.io
                        </div>
                    )}
                </div>
            </div>
            <ModernConfirmModal
                isOpen={!!cancelConfirm}
                onClose={() => setCancelConfirm(null)}
                title={t('kitchen.cancel_ticket')}
                description={t('kitchen.cancel_confirm')}
                confirmText="İPTAL ET"
                cancelText="VAZGEÇ"
                type="danger"
                onConfirm={() => {
                    if (!cancelConfirm) return;
                    void (async () => {
                        try {
                            const res = await fetch(`/api/v1/kitchen/tickets/${cancelConfirm.id}/status`, {
                                method: 'PATCH',
                                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'cancelled' }),
                            });
                            if (res.ok) {
                                toast.success(t('kitchen.toast.cancelled'));
                                void fetchTickets();
                                return;
                            }
                            toast.error(t('kitchen.toast.error'));
                        } catch {
                            toast.error(t('kitchen.toast.error'));
                        }
                    })();
                }}
            />
        </div>
    );
};



