import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiCheck, FiSearch } from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import io from 'socket.io-client';
import { getSocketOrigin } from '../lib/socketOrigin';
import { OfflineBanner } from '../components/OfflineBanner';
import { isNetworkOffline, isOfflineLocked } from '../lib/offlinePolicy';
import {
    loadKitchenTicketsCache,
    loadKitchenOfflineQueue,
    saveKitchenOfflineQueue,
    saveKitchenTicketsCache,
} from '../lib/operationalOfflineCache';
import { playNotification, triggerVisualFlash, primeNotificationAudio } from '../lib/notifications';

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
    global_notes?: string | null;
    payment_method_arrival?: 'cash' | 'card' | 'online' | null;
    payment_status?: string | null;
}

function timeLocaleForPos(lang: string): string {
    const l = String(lang || 'tr').toLowerCase();
    if (l === 'de') return 'de-DE';
    if (l === 'en') return 'en-US';
    return 'tr-TR';
}

function payArrivalShort(m: string | null | undefined, t: (k: string) => string): string {
    const u = String(m || 'cash').toLowerCase();
    if (u === 'card') return t('kitchen.monitor.pay_short_card');
    if (u === 'online') return t('kitchen.monitor.pay_short_online');
    return t('kitchen.monitor.payment_cash');
}

const KitchenTicketCard = ({
    ticket,
    handleStatus,
    formatElapsedTime,
    updateTicketItems,
    onPreview,
}: {
    ticket: KitchenTicketRow;
    handleStatus: (id: number, s: string) => void;
    formatElapsedTime: (date: string) => number;
    updateTicketItems: (ticketId: number, newItems: any[]) => Promise<void>;
    onPreview: (ticket: KitchenTicketRow) => void;
}) => {
    const { t } = usePosLocale();
    const items = useMemo(() => {
        const raw = ticket.items;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw || '[]');
            } catch {
                return [];
            }
        }
        return [];
    }, [ticket.items]);

    const elapsed = formatElapsedTime(ticket.created_at);
    const tableName = ticket.table_name_current || ticket.table_name || t('kitchen.monitor.outside_order');

    const orderTypeLine =
        ticket.order_type === 'dine_in'
            ? `🪑 ${t('cart.dineIn')}`
            : ticket.order_type === 'takeaway'
              ? `🛍️ ${t('cart.takeaway')}`
              : `📦 ${t('cart.delivery')}`;

    let stripClass = 'from-red-500 to-orange-500';
    let badgeBg = 'bg-red-500/10 border-red-500/20 text-red-400';
    let badgeLabel = t('kitchen.monitor.badge_new');

    let timeClass = 'text-emerald-400';
    let cardPulse = '';
    if (ticket.status !== 'ready') {
        if (elapsed > 15) {
            timeClass = 'text-red-400 font-black';
            cardPulse = 'animate-kitchen-danger-flash border-red-500/50';
        } else if (elapsed >= 5) {
            timeClass = 'text-amber-400 font-bold';
            cardPulse = 'border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.15)]';
        }
    }

    let qtyClass = 'bg-red-500/20 text-red-400';

    if (ticket.status === 'preparing') {
        stripClass = 'from-amber-500 to-yellow-400';
        badgeBg = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
        badgeLabel = t('kitchen.monitor.badge_preparing');
        qtyClass = 'bg-amber-500/20 text-amber-500';
    } else if (ticket.status === 'ready') {
        stripClass = 'from-emerald-600 to-emerald-400';
        badgeBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
        badgeLabel = t('kitchen.monitor.badge_ready');
        qtyClass = 'bg-emerald-500/20 text-emerald-500';
    }

    const notifyLabel =
        ticket.order_type === 'dine_in'
            ? t('kitchen.monitor.notify_waiter')
            : ticket.order_type === 'delivery'
              ? t('kitchen.monitor.notify_courier')
              : t('kitchen.monitor.notify_cashier');

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('ticketId', ticket.id.toString());
            }}
            className={`bg-[#0b1120] rounded-2xl border border-white/5 flex flex-col transition-all relative overflow-hidden group hover:border-white/10 cursor-grab active:cursor-grabbing ${cardPulse}`}
        >
            <div className={`h-1 w-full shrink-0 bg-gradient-to-r ${stripClass}`} />

            <div className="p-3 pb-2.5 flex items-start gap-2.5 border-b border-white/5">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="text-[18px] font-black text-slate-100 leading-none truncate">{tableName}</div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onPreview(ticket);
                            }}
                            className="w-6 h-6 rounded-md bg-white/5 border border-white/10 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer"
                            title="Büyüt"
                        >
                            <FiSearch size={12} />
                        </button>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                        {orderTypeLine} • {t('kitchen.monitor.waiter_prefix')}: {ticket.waiter_name || t('kitchen.monitor.system')}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-widest ${badgeBg}`}>
                            {badgeLabel}
                        </span>
                        {elapsed > 15 && ticket.status !== 'ready' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border border-red-500/30 bg-red-500/20 text-red-400 uppercase tracking-widest animate-pulse">
                                {t('kitchen.monitor.urgent')}
                            </span>
                        )}
                        {ticket.order_type !== 'dine_in' && (
                            <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-widest border-white/10 ${
                                    ticket.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                                }`}
                            >
                                {ticket.payment_status === 'paid'
                                    ? t('kitchen.monitor.payment_paid')
                                    : t('kitchen.monitor.payment_due').replace('{{method}}', payArrivalShort(ticket.payment_method_arrival, t))}
                            </span>
                        )}
                    </div>
                    {ticket.global_notes && (
                        <div className="mt-2 text-[11px] font-black italic text-orange-400 bg-orange-500/10 border-l-2 border-orange-500 px-2.5 py-1.5 rounded-r-md">
                            &quot; {ticket.global_notes} &quot;
                        </div>
                    )}
                </div>
                <div className="ml-auto text-right shrink-0">
                    <div className={`text-[22px] font-black tabular-nums leading-none ${timeClass}`}>
                        {elapsed} {t('kitchen.mins')}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 tracking-wider">{t('kitchen.monitor.wait_label')}</div>
                </div>
            </div>

            <div className="p-2 px-3.5 flex-1">
                {items.map((item: any, i: number) => {
                    const isDispatched = item.dispatched === true;
                    return (
                        <div key={i} className={`flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-opacity ${isDispatched ? 'opacity-40' : ''}`}>
                            <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[13px] font-black ${isDispatched ? 'bg-slate-800 text-slate-500' : qtyClass}`}>{item.quantity}</div>
                            <div className="flex-1">
                                <div className="text-[13px] font-bold text-slate-100">{item.product_name}</div>
                                {item.variant_name && <div className="text-[10px] font-semibold text-slate-500 mt-[1px]">{item.variant_name}</div>}
                                {item.notes && <div className="text-[10px] font-bold text-amber-500 mt-0.5">⚠ {item.notes}</div>}
                            </div>
                            
                            {isDispatched ? (
                                <div className="w-6 h-6 flex items-center justify-center text-[14px]" title={t('kitchen.monitor.dispatched') || 'Masaya Gönderildi'}>
                                    🚀
                                </div>
                            ) : (
                                <div
                                    onClick={() => {
                                        const newItems = [...items];
                                        newItems[i] = { ...newItems[i], is_ready: !newItems[i].is_ready };
                                        void updateTicketItems(ticket.id, newItems);
                                    }}
                                    className={`w-6 h-6 rounded-md border-[1.5px] flex items-center justify-center cursor-pointer transition-colors ${
                                        item.is_ready ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-slate-700 hover:border-slate-500 shadow-inner'
                                    }`}
                                >
                                    <FiCheck size={14} className={item.is_ready ? 'text-white' : 'text-transparent'} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="p-2.5 px-3.5 border-t border-white/5 flex flex-col gap-2">
                {ticket.status === 'preparing' && items.some((item: any) => item.is_ready && !item.dispatched) && (
                    <button
                        type="button"
                        onClick={async () => {
                            const newItems = items.map((item: any) => {
                                if (item.is_ready && !item.dispatched) {
                                    return { ...item, dispatched: true };
                                }
                                return item;
                            });
                            await updateTicketItems(ticket.id, newItems);
                            toast.success(t('kitchen.monitor.partial_sent') || 'Hazır ürünler masaya gönderildi! 🚀');
                        }}
                        className="w-full py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-400 rounded-xl text-xs font-black tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/15"
                    >
                        🚀 {t('kitchen.monitor.btn_partial_send') || 'KISMİ GÖNDER'}
                    </button>
                )}

                <div className="flex gap-2 w-full">
                    {ticket.status === 'waiting' && (
                        <button
                            onClick={() => handleStatus(ticket.id, 'preparing')}
                            className="flex-1 py-2.5 rounded-xl border transition-all text-xs font-extrabold tracking-white bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20 active:scale-95"
                        >
                            {t('kitchen.monitor.btn_start_prep')}
                        </button>
                    )}
                    {ticket.status === 'preparing' && (
                        <button
                            onClick={() => handleStatus(ticket.id, 'ready')}
                            className="flex-1 py-2.5 rounded-xl border transition-all text-xs font-extrabold tracking-white bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 active:scale-95"
                        >
                            {t('kitchen.monitor.btn_mark_ready')}
                        </button>
                    )}
                    {ticket.status === 'ready' && (
                        <>
                            <button
                                onClick={() => handleStatus(ticket.id, 'completed')}
                                className="flex-1 py-2.5 rounded-xl border transition-all text-xs font-extrabold tracking-white bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 active:scale-95"
                            >
                                {notifyLabel}
                            </button>
                            <button
                                onClick={() => handleStatus(ticket.id, 'completed')}
                                className="flex-none px-4 py-2.5 rounded-xl border transition-all text-xs font-extrabold tracking-white bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 active:scale-95"
                                title={t('kitchen.monitor.silent_complete')}
                            >
                                ✓
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const KitchenMonitor: React.FC = () => {
    const { station = 'all' } = useParams();
    const { getAuthHeaders, token, tenantId, logout, user } = useAuthStore();
    const { t, lang } = usePosLocale();
    const fetchSettings = usePosStore((s) => s.fetchSettings);

    const [tickets, setTickets] = useState<KitchenTicketRow[]>([]);
    const [completedTickets, setCompletedTickets] = useState<KitchenTicketRow[]>([]);
    const [isCompletedDrawerOpen, setIsCompletedDrawerOpen] = useState(false);
    const [networkOnline, setNetworkOnline] = useState(() => !isNetworkOffline());

    const [offlineQueue, setOfflineQueue] = useState<{ id: number; status: string }[]>(() => loadKitchenOfflineQueue());
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    useEffect(() => {
        const sync = () => setNetworkOnline(!isNetworkOffline());
        window.addEventListener('online', sync);
        window.addEventListener('offline', sync);
        return () => {
            window.removeEventListener('online', sync);
            window.removeEventListener('offline', sync);
        };
    }, []);

    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [previewTicket, setPreviewTicket] = useState<KitchenTicketRow | null>(null);

    useEffect(() => {
        const unlockAudio = async () => {
            const ok = await primeNotificationAudio();
            if (ok) setIsAudioEnabled(true);
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('pointerdown', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (user && user.role === 'waiter') {
            window.location.href = '/waiter';
        }
    }, [user]);

    const stationTabs = useMemo(
        () => {
            const allTabs = [
                { id: 'all', icon: '🍽️', label: t('kitchen.monitor.station_all') },
                { id: 'hot', icon: '🍕', label: t('kitchen.monitor.station_hot') },
                { id: 'cold', icon: '🥗', label: t('kitchen.monitor.station_cold') },
                { id: 'bar', icon: '🍹', label: t('kitchen.monitor.station_bar') },
            ];
            if (user?.role === 'kitchen' && user.kitchen_station && user.kitchen_station !== 'all') {
                return allTabs.filter((tab) => tab.id === user.kitchen_station);
            }
            return allTabs;
        },
        [t, user],
    );

    const toggleFS = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    useEffect(() => {
        const iv = setInterval(() => setCurrentTime(Date.now()), 15000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        saveKitchenOfflineQueue(offlineQueue);
    }, [offlineQueue]);

    const fetchTickets = useCallback(async () => {
        if (isOfflineLocked()) return;
        try {
            const baseUrl = station === 'all' ? `/api/v1/kitchen/tickets` : `/api/v1/kitchen/tickets?station=${station}`;
            const res = await fetch(baseUrl, { headers: getAuthHeaders() });

            if (res.status === 401) {
                toast.error(t('kitchen.monitor.session_expired'));
                logout();
                return;
            }

            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : [];
                setTickets(list);
                saveKitchenTicketsCache(station, list);
            }
        } catch (e) {
            console.error('Ticket pull failed', e);
            if (isNetworkOffline()) {
                const cached = loadKitchenTicketsCache(station);
                if (cached) setTickets(cached as KitchenTicketRow[]);
            }
        }
    }, [station, getAuthHeaders, logout, t]);

    const fetchCompletedTickets = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/kitchen/tickets/completed', { headers: getAuthHeaders() });
            if (res.ok) setCompletedTickets(await res.json());
        } catch (e) {}
    }, [getAuthHeaders]);

    const handleNewSignal = useCallback(() => {
        void fetchTickets();
        void playNotification('new_order');
        triggerVisualFlash('kitchen-main');
    }, [fetchTickets]);

    const fetchTicketsRef = useRef(fetchTickets);
    fetchTicketsRef.current = fetchTickets;

    const handleNewSignalRef = useRef(handleNewSignal);
    handleNewSignalRef.current = handleNewSignal;

    useEffect(() => {
        if (station) {
            localStorage.setItem('kitchen_default_station', station);
        }
        void fetchTickets();
    }, [station, fetchTickets]);

    useEffect(() => {
        const socket = io(getSocketOrigin(), {
            path: '/socket.io',
            transports: ['websocket'],
            auth: { token },
        });

        if (tenantId) {
            socket.emit('join:tenant', tenantId);
        }

        socket.on('kitchen:ticket_created', () => handleNewSignalRef.current());
        socket.on('kitchen:ticket_updated', () => fetchTicketsRef.current());
        socket.on('kitchen:ticket_merged', () => handleNewSignalRef.current());
        socket.on('kitchen:ticket_deleted', () => fetchTicketsRef.current());

        return () => {
            socket.disconnect();
        };
    }, [token, tenantId]);

    const updateTicketStatus = useCallback(
        async (ticketId: number, status: string, isRetry = false) => {
        if (isOfflineLocked()) {
            toast.error(t('offline.lock.blocked'));
            return;
        }
        if (isNetworkOffline() && !isRetry) {
            setOfflineQueue((prev) => [...prev, { id: ticketId, status }]);
            setTickets((prev) => prev.map((tk) => (tk.id === ticketId ? { ...tk, status: status as any } : tk)));
            toast.success(t('kitchen.monitor.toast_offline_queue'), { icon: '📡' });
            return;
        }

        try {
            const res = await fetch(`/api/v1/kitchen/tickets/${ticketId}/status`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });

            if (res.status === 401) {
                toast.error(t('kitchen.monitor.security_logout'));
                logout();
                return;
            }

            if (res.ok) {
                toast.success(
                    status === 'completed'
                        ? t('kitchen.monitor.toast_served_done')
                        : t('kitchen.monitor.toast_status_updated').replace('{{status}}', status.toUpperCase()),
                );
                if (status === 'preparing') {
                    setCompletedTickets((prev) => prev.filter((tk) => tk.id !== ticketId));
                }
                void fetchTickets();
                if (status === 'completed' || isCompletedDrawerOpen) void fetchCompletedTickets();
            }
        } catch (e) {
            if (!isRetry) {
                setOfflineQueue((prev) => [...prev, { id: ticketId, status }]);
                setTickets((prev) => prev.map((tk) => (tk.id === ticketId ? { ...tk, status: status as any } : tk)));
            }
        }
        },
        [t, getAuthHeaders, logout, fetchTickets, fetchCompletedTickets, isCompletedDrawerOpen],
    );

    useEffect(() => {
        if (!networkOnline || offlineQueue.length === 0) return;
        const processQueue = async () => {
            const currentQueue = [...offlineQueue];
            setOfflineQueue([]);
            for (const action of currentQueue) {
                await updateTicketStatus(action.id, action.status, true);
            }
        };
        void processQueue();
    }, [networkOnline, offlineQueue, updateTicketStatus]);

    const updateTicketItems = async (ticketId: number, newItems: any[]) => {
        setTickets((prev) => prev.map((tk) => (tk.id === ticketId ? { ...tk, items: JSON.stringify(newItems) } : tk)));
        try {
            const res = await fetch(`/api/v1/kitchen/tickets/${ticketId}/items`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: newItems }),
            });
            if (res.status === 401) {
                logout();
                return;
            }
        } catch (e) {
            console.error(e);
        }
    };

    const parseItems = (raw: any): any[] => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw || '[]');
            } catch {
                return [];
            }
        }
        return [];
    };

    const formatElapsedTime = useCallback(
        (date: string) => {
            const start = new Date(date).getTime();
            return Math.floor((currentTime - start) / 60000);
        },
        [currentTime],
    );

    const waiting = tickets.filter((tk) => tk.status === 'waiting');
    const preparing = tickets.filter((tk) => tk.status === 'preparing');
    const ready = tickets.filter((tk) => tk.status === 'ready');

    return (
        <div id="kitchen-main" className="h-screen bg-[#060a12] text-slate-100 flex flex-col font-sans overflow-hidden">
            <OfflineBanner />
            <header className="h-[58px] bg-[#0b1120] border-b border-white/5 flex items-center px-5 gap-4 shrink-0 shadow-sm">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-base font-black text-white">N</div>
                    <div>
                        <div className="text-base font-black text-slate-100 tracking-tight leading-none">NextPOS</div>
                        <div className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">{t('kitchen.monitor.screen_title')}</div>
                    </div>
                </div>

                <div className="w-px h-8 bg-white/5 mx-1" />

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <div className="text-xl font-black text-red-400 leading-none">{waiting.length}</div>
                        <div className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mt-1">{t('kitchen.monitor.stat_new')}</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="text-xl font-black text-amber-400 leading-none">{preparing.length}</div>
                        <div className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mt-1">{t('kitchen.monitor.stat_cooking')}</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="text-xl font-black text-emerald-400 leading-none">{ready.length}</div>
                        <div className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mt-1">{t('kitchen.monitor.stat_ready')}</div>
                    </div>
                </div>

                <div className="flex-1" />

                {offlineQueue.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-500/20 bg-orange-500/10 text-orange-400 text-xs font-bold animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        {t('kitchen.monitor.offline_pending').replace('{{n}}', String(offlineQueue.length))}
                    </div>
                )}

                <button
                    onClick={() => {
                        setIsCompletedDrawerOpen(!isCompletedDrawerOpen);
                        if (!isCompletedDrawerOpen) fetchCompletedTickets();
                    }}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg border transition-all text-xs font-bold ${
                        isCompletedDrawerOpen ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-white/5 bg-white/[0.04] text-slate-400 hover:text-slate-200'
                    }`}
                >
                    {t('kitchen.monitor.tab_completed')}
                </button>

                <button
                    onClick={toggleFS}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.04] text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors"
                >
                    {t('kitchen.monitor.fullscreen')}
                </button>

                {!isAudioEnabled ? (
                    <button
                        onClick={async () => {
                            const ok = await primeNotificationAudio();
                            if (ok) setIsAudioEnabled(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-bold animate-pulse"
                    >
                        🔇 {t('kitchen.monitor.audio_disabled') || 'Sesi Etkinleştir'}
                    </button>
                ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                        🔊 {t('kitchen.monitor.audio_enabled') || 'Ses Aktif'}
                    </div>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.04] text-slate-100 text-sm font-black tabular-nums">
                    {new Date().toLocaleTimeString(timeLocaleForPos(lang), { hour: '2-digit', minute: '2-digit' })}
                </div>
            </header>

            <div className="flex items-center bg-[#0b1120] border-b-2 border-white/5 px-5 shrink-0 overflow-x-auto no-scrollbar gap-1">
                {stationTabs.map((s) => (
                    <NavLink
                        key={s.id}
                        to={`/kitchen/${s.id}`}
                        className={({ isActive }) => `
                            flex items-center gap-2 px-6 h-[52px] text-[13px] font-bold whitespace-nowrap transition-all border-b-4 -mb-[2px]
                            ${isActive ? 'text-slate-100 border-purple-500' : 'text-slate-500 border-transparent hover:text-slate-300'}
                        `}
                    >
                        {({ isActive }) => (
                            <>
                                <span className={`w-7 h-7 rounded-md flex items-center justify-center text-sm ${isActive ? 'bg-purple-500/20' : 'bg-white/5'}`}>
                                    {s.icon}
                                </span>
                                {s.label}
                            </>
                        )}
                    </NavLink>
                ))}
            </div>

            <main className="flex-1 overflow-hidden p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                    <div className="flex flex-col bg-[#0b1120]/50 rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-3 border-b border-white/5 flex items-center gap-2 shrink-0 bg-red-500/5">
                            <h2 className="text-xs font-black tracking-widest uppercase text-red-400">{t('kitchen.monitor.col_new')}</h2>
                            <div className="ml-auto px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-[10px] font-black">{waiting.length}</div>
                        </div>
                        <div 
                            className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const id = Number(e.dataTransfer.getData('ticketId'));
                                if (id) updateTicketStatus(id, 'waiting');
                            }}
                        >
                            {waiting.map((tk, i) => (
                                <KitchenTicketCard
                                    key={tk.id || `wait-${i}`}
                                    ticket={tk}
                                    handleStatus={updateTicketStatus}
                                    formatElapsedTime={formatElapsedTime}
                                    updateTicketItems={updateTicketItems}
                                    onPreview={setPreviewTicket}
                                />
                            ))}
                            {waiting.length === 0 && (
                                <div className="text-center py-12 text-slate-600 text-xs font-bold uppercase tracking-widest">{t('kitchen.monitor.empty_waiting')}</div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col bg-[#0b1120]/50 rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-3 border-b border-white/5 flex items-center gap-2 shrink-0 bg-amber-500/5">
                            <h2 className="text-xs font-black tracking-widest uppercase text-amber-500">{t('kitchen.monitor.col_preparing')}</h2>
                            <div className="ml-auto px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 text-[10px] font-black">{preparing.length}</div>
                        </div>
                        <div 
                            className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const id = Number(e.dataTransfer.getData('ticketId'));
                                if (id) updateTicketStatus(id, 'preparing');
                            }}
                        >
                            {preparing.map((tk, i) => (
                                <KitchenTicketCard
                                    key={tk.id || `prep-${i}`}
                                    ticket={tk}
                                    handleStatus={updateTicketStatus}
                                    formatElapsedTime={formatElapsedTime}
                                    updateTicketItems={updateTicketItems}
                                    onPreview={setPreviewTicket}
                                />
                            ))}
                            {preparing.length === 0 && (
                                <div className="text-center py-12 text-slate-600 text-xs font-bold uppercase tracking-widest">{t('kitchen.monitor.empty_preparing')}</div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col bg-[#0b1120]/50 rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-3 border-b border-white/5 flex items-center gap-2 shrink-0 bg-emerald-500/5">
                            <h2 className="text-xs font-black tracking-widest uppercase text-emerald-400">{t('kitchen.monitor.col_ready')}</h2>
                            <div className="ml-auto px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-black">{ready.length}</div>
                        </div>
                        <div 
                            className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const id = Number(e.dataTransfer.getData('ticketId'));
                                if (id) updateTicketStatus(id, 'ready');
                            }}
                        >
                            {ready.map((tk, i) => (
                                <KitchenTicketCard
                                    key={tk.id || `ready-${i}`}
                                    ticket={tk}
                                    handleStatus={updateTicketStatus}
                                    formatElapsedTime={formatElapsedTime}
                                    updateTicketItems={updateTicketItems}
                                    onPreview={setPreviewTicket}
                                />
                            ))}
                            {ready.length === 0 && (
                                <div className="text-center py-12 text-slate-600 text-xs font-bold uppercase tracking-widest">{t('kitchen.monitor.empty_ready')}</div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {isCompletedDrawerOpen && (
                <div className="absolute top-[58px] right-0 bottom-0 w-[400px] bg-[#0b1120]/95 backdrop-blur-xl border-l border-white/10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-50 flex flex-col transform transition-transform">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-sm font-black tracking-widest uppercase text-slate-200">{t('kitchen.monitor.drawer_title')}</h2>
                        <button type="button" onClick={() => setIsCompletedDrawerOpen(false)} className="text-slate-500 hover:text-white p-2" aria-label={t('kitchen.close_modal')}>
                            ✕
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {completedTickets.map((ct) => (
                            <div key={ct.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-sm font-black text-slate-200">{ct.table_name || ct.table_name_current || t('kitchen.monitor.order_fallback')}</div>
                                        <div className="text-[10px] text-slate-500">
                                            {new Date(ct.created_at).toLocaleTimeString(timeLocaleForPos(lang))} - {t('kitchen.monitor.waiter_prefix')}: {ct.waiter_name}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateTicketStatus(ct.id, 'preparing')}
                                        className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/40 rounded-lg text-xs font-bold transition-all border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                                    >
                                        {t('kitchen.monitor.undo_prep')}
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {parseItems(ct.items).map((item: any, i: number) => (
                                        <div key={i} className="text-[11px] text-slate-400">
                                            • {item.quantity}x {item.product_name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {completedTickets.length === 0 && (
                            <div className="text-center py-10 opacity-50 text-xs font-bold text-slate-400 uppercase">{t('kitchen.monitor.empty_completed')}</div>
                        )}
                    </div>
                </div>
            )}

            {/* Premium Zoom Preview Modal */}
            {previewTicket && (
                <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#0b1120] border border-white/10 rounded-[32px] max-w-lg w-full p-8 shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden">
                        {/* Decorative top strip */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-pink-600" />
                        
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={() => setPreviewTicket(null)}
                            className="absolute top-6 right-6 w-9 h-9 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all hover:bg-white/10 cursor-pointer"
                        >
                            ✕
                        </button>

                        {/* Header info */}
                        <div className="mb-6">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                                Sipariş Detayı / KDS Kart Önizleme
                            </span>
                            <h2 className="text-3xl font-black text-white tracking-tight">
                                {previewTicket.table_name_current || previewTicket.table_name || t('kitchen.monitor.outside_order')}
                            </h2>
                            <div className="flex flex-wrap gap-2 mt-3">
                                <span className="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-xs font-black uppercase tracking-wider rounded-xl">
                                    {previewTicket.order_type === 'dine_in'
                                        ? `🪑 ${t('cart.dineIn')}`
                                        : previewTicket.order_type === 'takeaway'
                                          ? `🛍️ ${t('cart.takeaway')}`
                                          : `📦 ${t('cart.delivery')}`}
                                </span>
                                <span className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-wider rounded-xl">
                                    {formatElapsedTime(previewTicket.created_at)} {t('kitchen.mins')} {t('kitchen.monitor.wait_label')}
                                </span>
                            </div>
                        </div>

                        {/* Order Items List */}
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar mb-6">
                            {parseItems(previewTicket.items).map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-white/10 transition-colors">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 font-black flex items-center justify-center text-lg">
                                        {item.quantity}x
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-black text-slate-100 truncate">{item.product_name}</p>
                                        {item.variant_name && (
                                            <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 bg-white/5 text-slate-400 uppercase tracking-wider">
                                                {item.variant_name}
                                            </span>
                                        )}
                                        {item.notes && (
                                            <div className="mt-2 text-xs font-bold text-amber-500 bg-amber-500/10 border-l-2 border-amber-500 px-2 py-1 rounded-r-md">
                                                ⚠ {item.notes}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Global Notes */}
                        {previewTicket.global_notes && (
                            <div className="mb-6 p-4 bg-orange-500/10 border-l-4 border-orange-500 rounded-r-2xl">
                                <span className="text-[10px] font-black text-orange-400 uppercase tracking-wider block mb-1">Müşteri Notu</span>
                                <p className="text-xs font-bold text-slate-300 italic">&quot; {previewTicket.global_notes} &quot;</p>
                            </div>
                        )}

                        {/* Modal Action Footer */}
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setPreviewTicket(null)}
                                className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-black text-xs uppercase tracking-wider rounded-2xl border border-white/5 transition-all cursor-pointer active:scale-95"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KitchenMonitor;
