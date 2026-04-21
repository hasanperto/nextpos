import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiGrid, FiLayout, FiShoppingBag, FiMaximize, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import io from 'socket.io-client';
import { useAuthStore } from '../../store/useAuthStore';
import { usePosLocale } from '../../contexts/PosLocaleContext';
import { playNotification, triggerVisualFlash } from '../../lib/notifications';

export interface HandoverOrder {
    id: number;
    table_name?: string | null;
    customer_name?: string | null;
    order_type: 'dine_in' | 'takeaway' | 'delivery' | 'web';
    status: string;
    updated_at: string;
    items?: any[];
    payment_status?: string;
}

type Props = {
    embedded?: boolean;
    hideToolbar?: boolean;
    refreshSignal?: number;
    variant?: 'embedded_modal' | 'standalone_page';
    /** Sadece mutfak modalında (kasiyer); /handover sayfasında verilmez */
    onAddTakeawayToCart?: (orderId: number) => void | Promise<void>;
};

const isGelAlType = (o: HandoverOrder) => o.order_type === 'takeaway' || o.order_type === 'web';
const isPaid = (o: HandoverOrder) => String(o.payment_status || '').toLowerCase() === 'paid';

function timeLocaleForPos(lang: string): string {
    const l = String(lang || 'tr').toLowerCase();
    if (l === 'de') return 'de-DE';
    if (l === 'en') return 'en-US';
    return 'tr-TR';
}

export const HandoverCenterContent: React.FC<Props> = ({
    embedded = false,
    hideToolbar = false,
    refreshSignal = 0,
    variant = 'standalone_page',
    onAddTakeawayToCart,
}) => {
    const { getAuthHeaders, token, tenantId, logout, user } = useAuthStore();
    const { t, lang } = usePosLocale();
    const [readyOrders, setReadyOrders] = useState<HandoverOrder[]>([]);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [loading, setLoading] = useState(true);
    const [detailOrder, setDetailOrder] = useState<HandoverOrder | null>(null);

    const role = user?.role;
    const isCourier = role === 'courier';
    const isCounterStaff = role === 'cashier' || role === 'admin';
    const listModeStandalone = variant === 'standalone_page';

    useEffect(() => {
        const iv = setInterval(() => setCurrentTime(Date.now()), 10000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (!detailOrder) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDetailOrder(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [detailOrder]);

    const fetchReadyOrders = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/orders?status=ready', { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setReadyOrders(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('Fetch failed', e);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout]);

    useEffect(() => {
        if (!refreshSignal) return;
        void fetchReadyOrders();
    }, [refreshSignal, fetchReadyOrders]);

    useEffect(() => {
        void fetchReadyOrders();

        const socket = io(window.location.origin, {
            path: '/socket.io',
            transports: ['websocket'],
            auth: { token },
        });

        if (tenantId) {
            socket.emit('join:tenant', tenantId);
        }

        const handleNewReady = () => {
            void fetchReadyOrders();
            void playNotification('item_ready');
            triggerVisualFlash(embedded ? 'handover-embedded' : 'handover-main');
        };

        socket.on('kitchen:item_ready', handleNewReady);
        socket.on('order:status_update', () => fetchReadyOrders());
        socket.on('order:status_changed', () => fetchReadyOrders());
        socket.on('order:picked_up', () => fetchReadyOrders());

        return () => {
            socket.disconnect();
        };
    }, [fetchReadyOrders, token, tenantId, embedded]);

    const handlePickup = async (orderId: number) => {
        try {
            const res = await fetch(`/api/v1/orders/${orderId}/pickup`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinCode: '' }),
            });

            if (res.ok) {
                toast.success(t('handover.package_done'));
                setDetailOrder(null);
                void fetchReadyOrders();
            } else {
                const err = await res.json();
                toast.error(err.error || t('handover.error_unknown'));
            }
        } catch (e) {
            toast.error(t('handover.error_failed'));
        }
    };

    const formatElapsedTime = (date: string) => {
        if (!date) return 0;
        const start = new Date(date).getTime();
        return Math.floor((currentTime - start) / 60000);
    };

    const floorService = readyOrders.filter((o) => o.order_type === 'dine_in');
    const readyPackages = readyOrders.filter((o) => o.order_type !== 'dine_in');

    const toggleFS = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    /** Paket / gel-al kartı altı — modal ile aynı kurallar */
    const renderPackageFooter = (o: HandoverOrder) => {
        const gelAl = isGelAlType(o);

        if (gelAl && !isPaid(o)) {
            if (variant === 'embedded_modal' && onAddTakeawayToCart && isCounterStaff) {
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void onAddTakeawayToCart(o.id);
                        }}
                        className="w-full h-8 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all outline-none"
                    >
                        {t('handover.add_to_bill')}
                    </button>
                );
            }
            if (variant === 'standalone_page') {
                return (
                    <div className="w-full py-2 px-1 text-center text-[9px] font-bold text-amber-200/80 leading-snug">
                        {t('handover.pay_at_counter_hint')}
                    </div>
                );
            }
            return (
                <div className="w-full py-2 text-center text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                    —
                </div>
            );
        }

        if (gelAl && isPaid(o)) {
            if (!isCounterStaff) {
                return (
                    <div className="w-full py-2 text-center text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                        —
                    </div>
                );
            }
            return (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        void handlePickup(o.id);
                    }}
                    className="w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all outline-none"
                >
                    {t('handover.deliver')}
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    void handlePickup(o.id);
                }}
                className="w-full h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all outline-none"
            >
                {t('handover.package_done')}
            </button>
        );
    };

    const renderFloorFooter = (o: HandoverOrder) => (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                void handlePickup(o.id);
            }}
            className="w-full h-8 bg-[#e91e63] hover:bg-[#ff1b7e] text-white rounded-lg font-black text-[8px] uppercase tracking-widst active:scale-95 transition-all outline-none"
        >
            {t('handover.floor_mark_served')}
        </button>
    );

    if (loading) {
        return (
            <div
                className={
                    embedded
                        ? 'flex flex-1 min-h-[240px] items-center justify-center bg-[#060a12]'
                        : 'h-screen bg-[#060a12] flex items-center justify-center'
                }
            >
                <div className="w-16 h-16 border-4 border-[#e91e63] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const shellClass = embedded
        ? 'flex flex-col flex-1 min-h-0 bg-[#060a12] text-slate-100 font-sans overflow-hidden'
        : 'h-screen bg-[#060a12] text-slate-100 flex flex-col font-sans overflow-hidden';

    const toolbarSub =
        variant === 'standalone_page'
            ? `${t('handover.page_tagline').toUpperCase()} · ${readyOrders.length}`
            : t('handover.embedded_status').replace('{{n}}', String(readyOrders.length));

    const orderTypeLabel = (ot: string) => {
        switch (ot) {
            case 'dine_in':
                return t('handover.badge_salon');
            case 'takeaway':
                return t('cart.takeaway');
            case 'delivery':
                return t('cart.delivery');
            case 'web':
                return t('handover.order_type_web');
            default:
                return String(ot).toUpperCase();
        }
    };

    const fmtElapsedOrder = (mins: number, id: number) =>
        t('handover.elapsed_order').replace('{{mins}}', String(mins)).replace('{{id}}', String(id));

    const openDetail = (o: HandoverOrder) => {
        if (listModeStandalone) setDetailOrder(o);
    };

    return (
        <div id={embedded ? 'handover-embedded' : 'handover-main'} className={shellClass}>
            {!(embedded && hideToolbar) && (
                <header
                    className={`shrink-0 bg-[#0b1120] border-b border-white/5 flex items-center px-4 sm:px-6 gap-4 shadow-2xl ${
                        embedded ? 'h-11 py-1' : 'h-14'
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e91e63] to-pink-600 flex items-center justify-center text-white shadow-lg shadow-pink-600/20 shrink-0">
                            <FiGrid size={16} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xs sm:text-sm font-black text-white italic tracking-tighter uppercase leading-none truncate">
                                {t('handover.title')}
                            </h2>
                            <p className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-[0.35em] mt-0.5 truncate">
                                {toolbarSub}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-w-[8px]" />

                    <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                        <div className="flex items-center gap-3 sm:gap-4 pr-3 sm:pr-6 border-r border-white/5">
                            <div className="flex flex-col items-center">
                                <span className="text-base sm:text-lg font-black text-[#e91e63] leading-none">{floorService.length}</span>
                                <span className="text-[6px] sm:text-[7px] font-black text-slate-500 uppercase mt-0.5">
                                    {t('handover.toolbar_service')}
                                </span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-base sm:text-lg font-black text-indigo-400 leading-none">{readyPackages.length}</span>
                                <span className="text-[6px] sm:text-[7px] font-black text-slate-500 uppercase mt-0.5">
                                    {t('handover.toolbar_package')}
                                </span>
                            </div>
                        </div>

                        {!embedded && (
                            <button
                                type="button"
                                onClick={toggleFS}
                                className="p-2 bg-white/5 rounded-lg border border-white/5 text-slate-400 hover:text-white transition-all"
                            >
                                <FiMaximize size={16} />
                            </button>
                        )}

                        <div className="text-xs sm:text-sm font-black text-white italic tracking-tighter tabular-nums hidden sm:block">
                            {new Date().toLocaleTimeString(timeLocaleForPos(lang), { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </header>
            )}

            <main
                className={`min-h-0 overflow-hidden p-2 grid gap-2 ${
                    isCourier ? 'grid-cols-1 flex-1' : 'grid-cols-1 md:grid-cols-2 flex-1'
                }`}
            >
                {!isCourier && (
                    <section className="flex flex-col bg-white/[0.01] rounded-2xl border border-white/5 overflow-hidden min-h-0">
                        <div className="h-8 shrink-0 px-4 flex items-center justify-between border-b border-white/5 bg-[#e91e63]/5">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 bg-[#e91e63] rounded-full animate-pulse shadow-[0_0_8px_#e91e63]" />
                                <h3 className="text-[8px] font-black text-white uppercase tracking-[0.3em]">{t('handover.column_salon')}</h3>
                            </div>
                            <span className="text-[7px] font-black text-slate-600 uppercase italic">
                                {t('handover.count_waiting').replace('{{n}}', String(floorService.length))}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 no-scrollbar min-h-0">
                            {floorService.length === 0 ? (
                                <div className="h-32 flex flex-col items-center justify-center opacity-5">
                                    <FiLayout size={40} />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {floorService.map((o) => {
                                        const elapsed = formatElapsedTime(o.updated_at);
                                        return (
                                            <motion.div
                                                key={o.id}
                                                layout
                                                role={listModeStandalone ? 'button' : undefined}
                                                tabIndex={listModeStandalone ? 0 : undefined}
                                                onClick={() => openDetail(o)}
                                                onKeyDown={(e) => {
                                                    if (listModeStandalone && (e.key === 'Enter' || e.key === ' ')) {
                                                        e.preventDefault();
                                                        openDetail(o);
                                                    }
                                                }}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className={`bg-[#0b0f19] border rounded-xl p-2.5 transition-all relative overflow-hidden group ${
                                                    elapsed > 10 ? 'border-red-500/40' : elapsed > 5 ? 'border-orange-500/30' : 'border-white/5'
                                                } ${listModeStandalone ? 'cursor-pointer hover:border-white/20 active:scale-[0.99]' : ''}`}
                                            >
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-base font-black text-white italic tracking-tighter uppercase truncate leading-none">
                                                            {o.table_name || t('handover.quick_floor')}
                                                        </h4>
                                                        <div className="text-[7px] font-black text-[#e91e63] uppercase tracking-widest mt-1">
                                                            {t('handover.bill_prefix')} #{o.id}
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={`text-xl font-black italic tracking-tighter tabular-nums leading-none ${
                                                            elapsed > 10 ? 'text-red-500' : 'text-emerald-500'
                                                        }`}
                                                    >
                                                        {elapsed}
                                                        <span className="text-[7px] ml-0.5 font-black uppercase">{t('handover.min_abbr')}</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-0.5 mb-2 bg-white/5 rounded-lg p-1.5 border border-white/5 max-h-16 overflow-y-auto no-scrollbar">
                                                    {o.items?.map((item: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-1.5 font-bold text-[9px] text-slate-400">
                                                            <span className="text-[#e91e63]">{item.quantity}x</span>
                                                            <span className="truncate uppercase tracking-tight">{item.product_name}</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {listModeStandalone ? (
                                                    <p className="text-[8px] text-center text-slate-500 font-bold pt-1">{t('handover.open_detail_hint')}</p>
                                                ) : (
                                                    renderFloorFooter(o)
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                <section className="flex flex-col bg-white/[0.01] rounded-2xl border border-white/5 overflow-hidden min-h-0">
                    <div className="h-8 shrink-0 px-4 flex items-center justify-between border-b border-white/5 bg-indigo-500/5">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_#6366f1]" />
                            <h3 className="text-[8px] font-black text-white uppercase tracking-[0.3em]">
                                {isCourier ? t('handover.delivery_only_column') : t('handover.column_package')}
                            </h3>
                        </div>
                        <span className="text-[7px] font-black text-slate-600 uppercase italic">
                            {t('handover.count_exit').replace('{{n}}', String(readyPackages.length))}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 no-scrollbar min-h-0">
                        {readyPackages.length === 0 ? (
                            <div className="h-32 flex flex-col items-center justify-center opacity-5">
                                <FiShoppingBag size={40} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                                {readyPackages.map((o) => {
                                    const elapsed = formatElapsedTime(o.updated_at);
                                    const gelAl = isGelAlType(o);
                                    return (
                                        <motion.div
                                            key={o.id}
                                            layout
                                            role={listModeStandalone ? 'button' : undefined}
                                            tabIndex={listModeStandalone ? 0 : undefined}
                                            onClick={() => openDetail(o)}
                                            onKeyDown={(e) => {
                                                if (listModeStandalone && (e.key === 'Enter' || e.key === ' ')) {
                                                    e.preventDefault();
                                                    openDetail(o);
                                                }
                                            }}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={`bg-indigo-600/5 border border-indigo-600/10 rounded-xl p-2.5 transition-all relative overflow-hidden group ${
                                                listModeStandalone ? 'cursor-pointer hover:border-indigo-400/40 active:scale-[0.99]' : ''
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-1.5">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-base font-black text-white italic tracking-tighter uppercase truncate leading-none">
                                                        #{o.id}
                                                    </h4>
                                                    <div className="text-[7px] font-black text-indigo-400 uppercase tracking-widest mt-1 truncate">
                                                        {orderTypeLabel(o.order_type)} • {o.customer_name || t('handover.guest')}
                                                    </div>
                                                    {gelAl && (
                                                        <div
                                                            className={`text-[7px] font-black mt-1 uppercase ${
                                                                isPaid(o) ? 'text-emerald-400' : 'text-amber-400'
                                                            }`}
                                                        >
                                                            {isPaid(o) ? t('handover.payment_paid') : t('handover.payment_unpaid')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xl font-black tabular-nums text-indigo-400 tracking-tighter leading-none">
                                                    {elapsed}
                                                    <span className="text-[7px] ml-0.5 font-black uppercase">{t('handover.min_abbr')}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-0.5 mb-2 bg-indigo-500/5 rounded-lg p-1.5 border border-indigo-500/10 max-h-16 overflow-y-auto no-scrollbar">
                                                {o.items?.map((item: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-1.5 font-bold text-[9px] text-slate-400">
                                                        <span className="text-indigo-400">{item.quantity}x</span>
                                                        <span className="truncate uppercase tracking-tight">{item.product_name}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {listModeStandalone ? (
                                                <p className="text-[8px] text-center text-slate-500 font-bold pt-0.5">{t('handover.open_detail_hint')}</p>
                                            ) : (
                                                renderPackageFooter(o)
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            <AnimatePresence>
                {detailOrder && listModeStandalone && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-5 md:p-8 lg:p-10 bg-black/85 backdrop-blur-md"
                        onClick={() => setDetailOrder(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 8 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                            className="relative w-full max-w-md sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[min(92vh,920px)] overflow-hidden rounded-[24px] sm:rounded-[30px] lg:rounded-[36px] border border-white/15 bg-[#0b0f19] shadow-2xl shadow-black/60 flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3 sm:gap-5 px-5 sm:px-7 md:px-10 pt-5 sm:pt-7 md:pt-9 pb-3 sm:pb-4 border-b border-white/10 shrink-0">
                                <div className="min-w-0">
                                    <p className="text-[10px] sm:text-xs md:text-sm font-black text-indigo-400 uppercase tracking-[0.25em] sm:tracking-[0.35em]">
                                        {orderTypeLabel(detailOrder.order_type)}
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight mt-1 sm:mt-2 truncate">
                                        {detailOrder.order_type === 'dine_in'
                                            ? detailOrder.table_name || t('handover.table_default')
                                            : `#${detailOrder.id}`}
                                    </h3>
                                    <p className="text-xs sm:text-sm md:text-base text-slate-500 font-bold mt-1 sm:mt-2 tabular-nums">
                                        {fmtElapsedOrder(formatElapsedTime(detailOrder.updated_at), detailOrder.id)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDetailOrder(null)}
                                    className="shrink-0 p-2.5 sm:p-3 md:p-3.5 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                    aria-label={t('handover.modal_close')}
                                >
                                    <FiX className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 sm:px-7 md:px-10 py-4 sm:py-6 md:py-8 space-y-1 sm:space-y-2 min-h-0">
                                {detailOrder.items?.map((item: any, i: number) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-3 sm:gap-4 md:gap-5 py-2.5 sm:py-3 md:py-4 border-b border-white/5 last:border-0 text-base sm:text-lg md:text-xl font-bold text-slate-200 leading-snug sm:leading-normal"
                                    >
                                        <span className="text-indigo-400 tabular-nums shrink-0 min-w-[2.25rem] sm:min-w-[2.75rem] md:min-w-[3rem] text-right">
                                            {item.quantity}×
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="uppercase tracking-tight break-words">{item.product_name}</div>
                                            {item.variant_name && (
                                                <div className="text-xs sm:text-sm md:text-base text-slate-500 font-semibold mt-1 sm:mt-1.5">
                                                    {item.variant_name}
                                                </div>
                                            )}
                                            {item.notes && (
                                                <div className="text-xs sm:text-sm md:text-base text-amber-400/90 mt-1.5 sm:mt-2 italic leading-relaxed">
                                                    ➲ {item.notes}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="px-5 sm:px-7 md:px-10 pt-3 sm:pt-4 pb-5 sm:pb-7 md:pb-9 border-t border-white/10 bg-black/30 shrink-0 space-y-3 [&_button]:min-h-[2.75rem] sm:[&_button]:min-h-[3rem] md:[&_button]:min-h-[3.25rem] [&_button]:text-[10px] sm:[&_button]:text-xs md:[&_button]:text-sm [&_button]:rounded-xl [&_div]:text-xs sm:[&_div]:text-sm md:[&_div]:text-base [&_div]:leading-relaxed">
                                {detailOrder.order_type === 'dine_in' ? (
                                    renderFloorFooter(detailOrder)
                                ) : (
                                    <div className="space-y-2">{renderPackageFooter(detailOrder)}</div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};
