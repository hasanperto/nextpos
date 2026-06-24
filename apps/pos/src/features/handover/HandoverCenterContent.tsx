import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiGrid, FiLayout, FiShoppingBag, FiMaximize, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import io from 'socket.io-client';
import { useAuthStore } from '../../store/useAuthStore';
import { usePosLocale } from '../../contexts/PosLocaleContext';
import { playNotification, triggerVisualFlash } from '../../lib/notifications';
import { getSocketOrigin } from '../../lib/socketOrigin';
import { PinCodeModal } from '../terminal/components/PinCodeModal';
import { usePosStore } from '../../store/usePosStore';

export interface HandoverOrder {
    id: number;
    table_name?: string | null;
    customer_name?: string | null;
    courier_name?: string | null;
    delivery_address?: string | null;
    delivery_phone?: string | null;
    picked_up_at?: string | null;
    created_at?: string | null;
    order_type: 'dine_in' | 'takeaway' | 'delivery' | 'web';
    status: string;
    updated_at: string;
    items?: any[];
    payment_status?: string;
    guest_count?: number | null;
    total_amount?: number | string | null;
    total?: number | string | null;
}

type Props = {
    embedded?: boolean;
    hideToolbar?: boolean;
    refreshSignal?: number;
    variant?: 'embedded_modal' | 'standalone_page';
    /** Sadece mutfak modalında (kasiyer); /handover sayfasında verilmez */
    onAddTakeawayToCart?: (orderId: number, order?: any) => void | Promise<void>;
};

const isGelAlType = (o: HandoverOrder) => o.order_type === 'takeaway' || o.order_type === 'web';
const isPaid = (o: HandoverOrder) => String(o.payment_status || '').toLowerCase() === 'paid';
const isInBill = (o: HandoverOrder) => String(o.payment_status || '').toLowerCase() === 'in_bill';

function timeLocaleForPos(lang: string): string {
    const l = String(lang || 'tr').toLowerCase();
    if (l === 'de') return 'de-DE';
    if (l === 'en') return 'en-US';
    return 'tr-TR';
}

function handoverItemLabel(item: { product_name?: string; variant_name?: string | null }) {
    const base = String(item.product_name || '').trim();
    const v = item.variant_name ? String(item.variant_name).trim() : '';
    if (!base) return v || '—';
    return v ? `${base} · ${v}` : base;
}

function isItemServedRow(item: { status?: string }) {
    return String(item.status || '').toLowerCase() === 'served';
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
    const { settings } = usePosStore();
    
    const currencySymbol = settings?.currency || '€';
    const formatPrice = (price: number) => `${currencySymbol}${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const [readyOrders, setReadyOrders] = useState<HandoverOrder[]>([]);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [loading, setLoading] = useState(true);
    const [detailOrder, setDetailOrder] = useState<HandoverOrder | null>(null);
    const [cancelPinOrderId, setCancelPinOrderId] = useState<number | null>(null);
    const [processingIds, setProcessingIds] = useState<Record<number, boolean>>({});

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
            const headers = getAuthHeaders();
            const [readyRes, queueRes] = await Promise.all([
                fetch('/api/v1/orders?status=ready', { headers }),
                fetch('/api/v1/orders?deliveryQueue=true', { headers }),
            ]);

            if (readyRes.status === 401 || queueRes.status === 401) {
                logout();
                return;
            }

            const [readyData, queueData] = await Promise.all([
                readyRes.ok ? readyRes.json() : Promise.resolve([]),
                queueRes.ok ? queueRes.json() : Promise.resolve([]),
            ]);

            const mergeById = (a: HandoverOrder[], b: HandoverOrder[]) => {
                const map = new Map<number, HandoverOrder>();

                const ts = (v?: string) => {
                    const n = new Date(String(v || '')).getTime();
                    return Number.isFinite(n) ? n : 0;
                };

                const addAll = (arr: HandoverOrder[]) => {
                    for (const o of arr || []) {
                        const id = Number(o?.id);
                        if (!Number.isFinite(id) || id <= 0) continue;

                        const prev = map.get(id);
                        if (!prev) {
                            map.set(id, o);
                            continue;
                        }

                        // Aynı sipariş tekrar geliyorsa güncel olanı tut
                        map.set(id, ts(o?.updated_at) >= ts(prev?.updated_at) ? o : prev);
                    }
                };

                addAll(a);
                addAll(b);

                return Array.from(map.values());
            };

            setReadyOrders(
                mergeById(
                    Array.isArray(readyData) ? readyData : [],
                    Array.isArray(queueData) ? queueData : []
                )
            );
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

        const socket = io(getSocketOrigin(), {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            auth: { token },
            query: tenantId ? { tenantId } : undefined,
            reconnection: true,
            reconnectionAttempts: 20,
            reconnectionDelay: 1500,
            timeout: 20000,
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
        socket.on('order:status_update', () => void fetchReadyOrders());
        socket.on('order:status_changed', () => void fetchReadyOrders());
        socket.on('order:picked_up', () => void fetchReadyOrders());

        return () => {
            socket.off('kitchen:item_ready', handleNewReady);
            socket.off('order:status_update');
            socket.off('order:status_changed');
            socket.off('order:picked_up');
            if (socket.connected) {
                socket.disconnect();
            } else {
                // Socket henüz bağlanmadıysa, bağlantı kurulunca kapat
                socket.once('connect', () => socket.disconnect());
            }
        };
    }, [fetchReadyOrders, token, tenantId, embedded]);

    const handlePickup = async (orderId: number) => {
        if (processingIds[orderId]) return;
        setProcessingIds((prev) => ({ ...prev, [orderId]: true }));
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
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || t('handover.error_unknown'));
            }
        } catch (e) {
            toast.error(t('handover.error_failed'));
        } finally {
            setProcessingIds((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    const handleCancelWithAdminPin = async (orderId: number, pinCode: string, notes?: string) => {
        const reason = String(notes || '').trim();
        try {
            const res = await fetch(`/api/v1/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'cancelled',
                    pinCode,
                    requireAdminPin: true,
                    notes: reason || undefined,
                }),
            });
            if (res.ok) {
                toast.success(t('courier.toast_cancel_ok'));
                setCancelPinOrderId(null);
                setDetailOrder(null);
                void fetchReadyOrders();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err?.error || t('handover.error_unknown'));
            }
        } catch {
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
        const isDelivery = o.order_type === 'delivery';

        // Kasiyer tarafında kurye hareketlerini sadece göstermek için:
        // - ready  -> teslim al (yönlendirme)
        // - shipped -> yolda
        // - completed -> teslim edildi
        // - cancelled -> iptal
        if (isDelivery) {
            const st = String(o.status || '').toLowerCase();
            if (st === 'shipped') {
                return <div className="w-full py-2 text-center text-[8px] font-bold text-indigo-300 uppercase tracking-wide">{t('b2b.status.shipped')}</div>;
            }
            if (st === 'completed') {
                return <div className="w-full py-2 text-center text-[8px] font-bold text-emerald-200/90 uppercase tracking-wide">{t('handover.package_done')}</div>;
            }
            if (st === 'cancelled') {
                return <div className="w-full py-2 text-center text-[8px] font-bold text-rose-300 uppercase tracking-wide">{t('courier.badge_cancelled')}</div>;
            }

            return <div className="w-full py-2 text-center text-[8px] font-bold text-slate-400 uppercase tracking-wide">{t('courier.pickup_required')}</div>;
        }

        if (gelAl && !isPaid(o)) {
            if (isInBill(o)) {
                return (
                    <div className="w-full py-2 text-center text-[8px] font-bold text-amber-200/90 uppercase tracking-wide">
                        {t('handover.payment_in_bill')}
                    </div>
                );
            }
            if (variant === 'embedded_modal' && onAddTakeawayToCart && isCounterStaff) {
                const isProcessing = processingIds[o.id];
                return (
                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (isProcessing) return;
                            setProcessingIds((prev) => ({ ...prev, [o.id]: true }));
                            try {
                                await onAddTakeawayToCart(o.id, o);
                            } catch (err) {
                                console.error('onAddTakeawayToCart failed', err);
                            } finally {
                                setProcessingIds((prev) => ({ ...prev, [o.id]: false }));
                            }
                        }}
                        className="w-full h-8 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                        {isProcessing ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            t('handover.add_to_bill')
                        )}
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
            const isProcessing = processingIds[o.id];
            return (
                <button
                    type="button"
                    disabled={isProcessing}
                    onClick={(e) => {
                        e.stopPropagation();
                        void handlePickup(o.id);
                    }}
                    className="w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                    {isProcessing ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        t('handover.deliver')
                    )}
                </button>
            );
        }

        const isProcessing = processingIds[o.id];
        return (
            <button
                type="button"
                disabled={isProcessing}
                onClick={(e) => {
                    e.stopPropagation();
                    void handlePickup(o.id);
                }}
                className="w-full h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
                {isProcessing ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    t('handover.package_done')
                )}
            </button>
        );
    };

    const renderFloorFooter = (o: HandoverOrder) => {
        const isProcessing = processingIds[o.id];
        return (
            <button
                type="button"
                disabled={isProcessing}
                onClick={(e) => {
                    e.stopPropagation();
                    void handlePickup(o.id);
                }}
                className="w-full h-8 bg-[#e91e63] hover:bg-[#ff1b7e] text-white rounded-lg font-black text-[8px] uppercase tracking-widst active:scale-95 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
                {isProcessing ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    t('handover.floor_mark_served')
                )}
            </button>
        );
    };

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

    const statusBadge = (status?: string) => {
        const st = String(status || '').toLowerCase();
        if (st === 'shipped') return t('b2b.status.shipped');
        if (st === 'completed') return t('handover.package_done');
        if (st === 'cancelled') return t('courier.badge_cancelled');
        if (st === 'ready') return t('courier.pickup_required');
        return st || '—';
    };

    const formatDateTime = (iso?: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString(timeLocaleForPos(lang), {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatMinsAgo = (iso?: string | null) => {
        if (!iso) return '—';
        const ms = new Date(iso).getTime();
        if (!Number.isFinite(ms)) return '—';
        const mins = Math.max(0, Math.floor((currentTime - ms) / 60000));
        return `${mins} ${t('handover.min_abbr')}`;
    };

    const openDetail = (o: HandoverOrder) => {
        setDetailOrder(o);
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
                                                className={`relative rounded-xl p-0 transition-all overflow-hidden group bg-gradient-to-br from-[#141a28] via-[#0c101c] to-[#080b12] shadow-lg shadow-black/40 ${
                                                    elapsed > 10
                                                        ? 'ring-1 ring-red-500/50 border border-red-500/25'
                                                        : elapsed > 5
                                                          ? 'ring-1 ring-orange-500/35 border border-orange-500/20'
                                                          : 'ring-1 ring-white/[0.06] border border-white/[0.07]'
                                                } ${listModeStandalone ? 'cursor-pointer hover:ring-pink-500/30 active:scale-[0.99]' : ''}`}
                                            >
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#e91e63] via-pink-500 to-rose-600 opacity-90" />
                                                <div className="pl-3.5 pr-2.5 py-2.5">
                                                    <div className="flex justify-between items-start gap-2 mb-2">
                                                        <div className="flex items-start gap-2 flex-1 min-w-0">
                                                            <div className="w-8 h-8 rounded-lg bg-[#e91e63]/15 border border-[#e91e63]/25 flex items-center justify-center text-[#e91e63] shrink-0">
                                                                <FiGrid size={15} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="text-[13px] sm:text-sm font-black text-white tracking-tight uppercase truncate leading-tight">
                                                                    {o.table_name || t('handover.quick_floor')}
                                                                </h4>
                                                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
                                                                    <span className="text-[7px] font-black text-pink-300/90 uppercase tracking-widest">
                                                                        {t('handover.bill_prefix')} #{o.id}
                                                                    </span>
                                                                    {o.customer_name ? (
                                                                        <span className="text-[7px] font-bold text-slate-500 truncate max-w-[8rem]">
                                                                            · {o.customer_name}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                <div className="text-[9px] font-black text-[#e91e63] italic mt-0.5 tabular-nums">
                                                                    {formatPrice(Number(o.total_amount || o.total || 0))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div
                                                            className={`shrink-0 flex flex-col items-end justify-center min-w-[2.75rem] px-2 py-1 rounded-lg border ${
                                                                elapsed > 10
                                                                    ? 'bg-red-500/15 border-red-500/35 text-red-300'
                                                                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                                                            }`}
                                                        >
                                                            <span className="text-lg font-black tabular-nums leading-none">{elapsed}</span>
                                                            <span className="text-[6px] font-black uppercase opacity-80">
                                                                {t('handover.min_abbr')}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="mb-2 rounded-lg bg-black/25 border border-white/[0.06] max-h-[4.5rem] overflow-y-auto no-scrollbar divide-y divide-white/[0.04]">
                                                        {o.items?.map((item: any, i: number) => {
                                                            const served = isItemServedRow(item);
                                                            const itemTotal = Number(item.total_price || (Number(item.unit_price || item.price || 0) * (item.quantity || 1)));
                                                            return (
                                                                <div
                                                                    key={i}
                                                                    className={`flex items-start gap-2 px-2 py-1.5 text-[9px] ${
                                                                        served ? 'bg-emerald-500/5' : ''
                                                                    }`}
                                                                >
                                                                    <span className="shrink-0 mt-0.5 min-w-[1.35rem] h-5 rounded-md bg-[#e91e63]/20 text-[#fda4af] font-black flex items-center justify-center text-[8px]">
                                                                        {item.quantity}×
                                                                    </span>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="font-bold text-slate-200 uppercase tracking-tight leading-snug line-clamp-2">
                                                                            {handoverItemLabel(item)}
                                                                        </p>
                                                                        {served ? (
                                                                            <span className="inline-flex mt-0.5 text-[6px] font-black uppercase tracking-wider text-emerald-400/95">
                                                                                {t('waiter.served_done')}
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="shrink-0 text-[8px] font-bold text-slate-400 tabular-nums self-center">
                                                                        {formatPrice(itemTotal)}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {listModeStandalone ? (
                                                        <p className="text-[8px] text-center text-slate-500 font-bold pt-0.5">
                                                            {t('handover.open_detail_hint')}
                                                        </p>
                                                    ) : (
                                                        renderFloorFooter(o)
                                                    )}
                                                </div>
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
                                                    <div className="text-[10px] font-black text-indigo-300 italic mt-1 tabular-nums">
                                                        {formatPrice(Number(o.total_amount || o.total || 0))}
                                                    </div>
                                                    {gelAl && (
                                                        <div
                                                            className={`text-[7px] font-black mt-1 uppercase ${
                                                                isPaid(o)
                                                                    ? 'text-emerald-400'
                                                                    : isInBill(o)
                                                                      ? 'text-amber-200'
                                                                      : 'text-amber-400'
                                                            }`}
                                                        >
                                                            {isPaid(o)
                                                                ? t('handover.payment_paid')
                                                                : isInBill(o)
                                                                  ? t('handover.payment_in_bill')
                                                                  : t('handover.payment_unpaid')}
                                                        </div>
                                                    )}

                    {o.order_type === 'delivery' && (
                        <div
                            className={`text-[7px] font-black mt-1 uppercase ${
                                String(o.status || '').toLowerCase() === 'completed'
                                    ? 'text-emerald-300'
                                    : String(o.status || '').toLowerCase() === 'shipped'
                                      ? 'text-indigo-300'
                                      : String(o.status || '').toLowerCase() === 'cancelled'
                                        ? 'text-rose-300'
                                        : 'text-slate-400'
                            }`}
                        >
                            {String(o.status || '').toLowerCase() === 'shipped'
                                ? t('b2b.status.shipped')
                                : String(o.status || '').toLowerCase() === 'completed'
                                  ? t('handover.package_done')
                                  : String(o.status || '').toLowerCase() === 'cancelled'
                                    ? t('courier.badge_cancelled')
                                    : t('courier.pickup_required')}
                        </div>
                    )}
                                                </div>
                                                <div className="text-xl font-black tabular-nums text-indigo-400 tracking-tighter leading-none">
                                                    {elapsed}
                                                    <span className="text-[7px] ml-0.5 font-black uppercase">{t('handover.min_abbr')}</span>
                                                </div>
                                            </div>

                                            <div className="mb-2 rounded-lg bg-black/20 border border-indigo-500/15 max-h-[4.5rem] overflow-y-auto no-scrollbar divide-y divide-indigo-500/10">
                                                {o.items?.map((item: any, i: number) => {
                                                    const served = isItemServedRow(item);
                                                    const itemTotal = Number(item.total_price || (Number(item.unit_price || item.price || 0) * (item.quantity || 1)));
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`flex items-start gap-2 px-2 py-1.5 text-[9px] ${
                                                                served ? 'bg-emerald-500/5' : ''
                                                            }`}
                                                        >
                                                            <span className="shrink-0 mt-0.5 min-w-[1.35rem] h-5 rounded-md bg-indigo-500/25 text-indigo-200 font-black flex items-center justify-center text-[8px]">
                                                                {item.quantity}×
                                                            </span>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="font-bold text-slate-200 uppercase tracking-tight leading-snug line-clamp-2">
                                                                    {handoverItemLabel(item)}
                                                                </p>
                                                                {served ? (
                                                                    <span className="inline-flex mt-0.5 text-[6px] font-black uppercase tracking-wider text-emerald-400/95">
                                                                        {t('waiter.served_done')}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="shrink-0 text-[8px] font-bold text-slate-400 tabular-nums self-center">
                                                                {formatPrice(itemTotal)}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
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
                {detailOrder && (
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
                                <div className="mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-xs sm:text-sm space-y-3.5 backdrop-blur-md">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Sol Sütun: Temel Bilgiler */}
                                        <div className="space-y-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Sipariş Türü:</span>
                                                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 font-black uppercase text-[10px] tracking-wide">
                                                    {orderTypeLabel(detailOrder.order_type)}
                                                </span>
                                            </div>

                                            {detailOrder.order_type === 'dine_in' ? (
                                                <>
                                                    <div className="text-slate-300">
                                                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Masa:</span>{' '}
                                                        <span className="font-black text-white">{detailOrder.table_name || t('handover.table_default')}</span>
                                                    </div>
                                                    {detailOrder.guest_count != null && Number(detailOrder.guest_count) > 0 && (
                                                        <div className="text-slate-300 flex items-center gap-1.5">
                                                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Kişi Sayısı:</span>{' '}
                                                            <span className="font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[11px]">
                                                                {detailOrder.guest_count} {t('cart.guestCount')}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-slate-300">
                                                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Müşteri:</span>{' '}
                                                        <span className="font-black text-white">{detailOrder.customer_name || t('handover.guest')}</span>
                                                    </div>
                                                    {detailOrder.delivery_phone && (
                                                        <div className="text-slate-300">
                                                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Telefon:</span>{' '}
                                                            <span className="font-bold text-slate-200">{detailOrder.delivery_phone}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {detailOrder.order_type === 'delivery' && (
                                                <>
                                                    <div className="text-slate-300">
                                                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Kurye:</span>{' '}
                                                        <span className="font-black text-slate-200">{detailOrder.courier_name || '—'}</span>
                                                    </div>
                                                    {detailOrder.picked_up_at && (
                                                        <div className="text-slate-300">
                                                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Teslim Alma:</span>{' '}
                                                            <span className="font-bold text-slate-300">{formatDateTime(detailOrder.picked_up_at)}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Sağ Sütun: Finansal & Durum Bilgileri */}
                                        <div className="space-y-2.5 sm:border-l sm:border-white/5 sm:pl-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Sipariş Durumu:</span>
                                                <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-black uppercase text-[10px] tracking-wide">
                                                    {statusBadge(detailOrder.status)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Ödeme Durumu:</span>
                                                <span className={`px-2 py-0.5 rounded font-black uppercase text-[10px] tracking-wide border ${
                                                    isPaid(detailOrder)
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                        : isInBill(detailOrder)
                                                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                }`}>
                                                    {isPaid(detailOrder)
                                                        ? t('handover.payment_paid')
                                                        : isInBill(detailOrder)
                                                          ? t('handover.payment_in_bill')
                                                          : t('handover.payment_unpaid')}
                                                </span>
                                            </div>

                                            <div className="flex items-baseline gap-2 pt-1">
                                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Toplam Tutar:</span>
                                                <span className="text-xl font-black text-white italic tracking-tighter tabular-nums">
                                                    {formatPrice(Number(detailOrder.total_amount || detailOrder.total || 0))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {detailOrder.order_type === 'delivery' && detailOrder.delivery_address && (
                                        <div className="pt-2.5 border-t border-white/5 text-slate-300">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] block mb-1">{t('courier.address')}:</span>
                                            <span className="font-semibold break-words leading-relaxed text-slate-200 bg-white/5 border border-white/5 p-2 rounded-lg block">
                                                {detailOrder.delivery_address}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {detailOrder.items?.map((item: any, i: number) => {
                                    const unitPrice = Number(item.unit_price || item.price || 0);
                                    const totalPrice = Number(item.total_price || (unitPrice * (item.quantity || 1)));
                                    return (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 text-sm sm:text-base font-bold text-slate-200"
                                        >
                                            <div className="flex items-start gap-3 sm:gap-4 md:gap-5 flex-1 min-w-0">
                                                <span className="text-indigo-400 tabular-nums shrink-0 min-w-[2.25rem] sm:min-w-[2.75rem] md:min-w-[3rem] text-right text-base sm:text-lg">
                                                    {item.quantity}×
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="uppercase tracking-tight break-words text-slate-200 text-sm sm:text-base font-bold">
                                                        {item.product_name}
                                                    </div>
                                                    {item.variant_name && (
                                                        <div className="text-xs text-slate-500 font-semibold mt-0.5">
                                                            {item.variant_name}
                                                        </div>
                                                    )}
                                                    {item.notes && (
                                                        <div className="text-xs text-amber-400/90 mt-1 italic">
                                                            ➲ {item.notes}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="text-right shrink-0">
                                                <div className="text-sm sm:text-base font-black text-white tabular-nums">
                                                    {formatPrice(totalPrice)}
                                                </div>
                                                {item.quantity > 1 && (
                                                    <div className="text-[10px] text-slate-500 font-semibold tabular-nums mt-0.5">
                                                        {formatPrice(unitPrice)} / adet
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="px-5 sm:px-7 md:px-10 pt-3 sm:pt-4 pb-5 sm:pb-7 md:pb-9 border-t border-white/10 bg-black/30 shrink-0 space-y-3 [&_button]:min-h-[2.75rem] sm:[&_button]:min-h-[3rem] md:[&_button]:min-h-[3.25rem] [&_button]:text-[10px] sm:[&_button]:text-xs md:[&_button]:text-sm [&_button]:rounded-xl [&_div]:text-xs sm:[&_div]:text-sm md:[&_div]:text-base [&_div]:leading-relaxed">
                                {detailOrder.order_type === 'dine_in' ? (
                                    renderFloorFooter(detailOrder)
                                ) : (
                                    <div className="space-y-2">{renderPackageFooter(detailOrder)}</div>
                                )}
                                {detailOrder.order_type === 'delivery' &&
                                    ['ready', 'shipped'].includes(String(detailOrder.status || '').toLowerCase()) && (
                                        <button
                                            type="button"
                                            onClick={() => setCancelPinOrderId(detailOrder.id)}
                                            className="w-full bg-rose-700/90 hover:bg-rose-600 text-white font-black uppercase tracking-widest transition-all outline-none"
                                        >
                                            {t('courier.cancel_btn')} (Admin PIN)
                                        </button>
                                    )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <PinCodeModal
                isOpen={cancelPinOrderId != null}
                onClose={() => setCancelPinOrderId(null)}
                onSuccess={(pinCode, notes) => {
                    if (cancelPinOrderId == null) return;
                    void handleCancelWithAdminPin(cancelPinOrderId, pinCode, notes);
                }}
                title={t('courier.cancel_btn')}
                description={t('cart.adminPinDesc')}
                showNotes
                skipServerVerify
            />

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};
