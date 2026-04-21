import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { FiX } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';

type QrReq = {
    orderId: number;
    tableName: string;
    customerName?: string;
    totalAmount?: string | number;
};

/** Kasiyer / admin: bekleyen QR siparişleri — Socket + periyodik API */
export const QrOrderQueueBar: React.FC = () => {
    const { user, getAuthHeaders, logout, tenantId, token } = useAuthStore();
    const [queue, setQueue] = useState<QrReq[]>([]);

    const mergeIncoming = useCallback((data: {
        orderId?: number;
        tableName?: string;
        customerName?: string;
        totalAmount?: string | number;
    }) => {
        const oid = data.orderId;
        if (oid == null || !Number.isFinite(oid)) return;
        setQueue((q) => {
            if (q.some((x) => x.orderId === oid)) return q;
            return [
                ...q,
                {
                    orderId: oid,
                    tableName: String(data.tableName ?? 'Masa'),
                    customerName: data.customerName,
                    totalAmount: data.totalAmount,
                },
            ];
        });
    }, []);

    const poll = useCallback(async () => {
        if (!tenantId) return;
        try {
            const qs = new URLSearchParams({
                status: 'pending',
                source: 'customer_qr',
                limit: '30',
                offset: '0',
            });
            const res = await fetch(`/api/v1/orders?${qs}`, { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (!res.ok) return;
            const rows = (await res.json()) as {
                id: number;
                total_amount?: string | number;
                table_name?: string;
                notes?: string;
            }[];
            if (!Array.isArray(rows)) return;
            const mapped: QrReq[] = rows.map((r) => {
                const guest =
                    r.notes && r.notes.startsWith('QR misafir:')
                        ? r.notes.split('|')[0].replace('QR misafir:', '').trim()
                        : undefined;
                return {
                    orderId: r.id,
                    tableName: String(r.table_name ?? 'Masa'),
                    customerName: guest,
                    totalAmount: r.total_amount,
                };
            });
            setQueue(mapped.sort((a, b) => a.orderId - b.orderId));
        } catch (e) {
            console.error(e);
        }
    }, [tenantId, getAuthHeaders, logout]);

    useEffect(() => {
        void poll();
        const t = window.setInterval(() => void poll(), 25000);
        return () => window.clearInterval(t);
    }, [poll]);

    useEffect(() => {
        if (!tenantId) return;
        const socket = io({
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            auth: token ? { token } : {},
        });
        const onConnect = () => {
            socket.emit('join:tenant', tenantId);
            socket.emit('presence:staff_register', { tenantId });
        };
        socket.on('connect', onConnect);
        socket.on('customer:order_request', mergeIncoming);
        const onStatus = (d: { orderId?: number; status?: string }) => {
            if (d.orderId != null && d.status && d.status !== 'pending') {
                setQueue((q) => q.filter((x) => x.orderId !== d.orderId));
            }
        };
        socket.on('order:status_changed', onStatus);
        return () => {
            socket.off('connect', onConnect);
            socket.off('customer:order_request', mergeIncoming);
            socket.off('order:status_changed', onStatus);
            socket.disconnect();
        };
    }, [tenantId, token, mergeIncoming]);

    const approve = async (orderId: number) => {
        const res = await fetch(`/api/v1/orders/${orderId}/approve-qr`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: '{}',
        });
        if (res.status === 401) {
            logout();
            return;
        }
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || 'Onaylanamadı. Lütfen tekrar deneyin.');
            return;
        }
        setQueue((q) => q.filter((x) => x.orderId !== orderId));
    };

    const reject = async (orderId: number) => {
        const res = await fetch(`/api/v1/orders/${orderId}/reject-qr`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: '{}',
        });
        if (res.status === 401) {
            logout();
            return;
        }
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || 'Reddedilemedi. Lütfen tekrar deneyin.');
            return;
        }
        setQueue((q) => q.filter((x) => x.orderId !== orderId));
    };

    if (user?.role !== 'cashier' && user?.role !== 'admin') {
        return null;
    }

    if (queue.length === 0) {
        return null;
    }

    return (
        <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="shrink-0 border-b border-amber-500/20 bg-[#0a0f1d]/90 backdrop-blur-3xl px-6 py-4 relative overflow-hidden group"
        >
            {/* Rhythmic Background Pulse */}
            <div className="absolute inset-0 bg-amber-500/5 animate-pulse-fast pointer-events-none opacity-30" />
            
            <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping-slow" />
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500/80">
                        SİSTEM: <span className="text-white">QR SİPARİŞ HAVUZU</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{queue.length} TALEP BEKLİYOR</span>
                    <div className="w-1 h-1 bg-slate-800 rounded-full" />
                    <span className="text-[9px] font-black text-emerald-500 uppercase animate-pulse">CANLI</span>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 relative z-10">
                <AnimatePresence>
                    {queue.map((q) => (
                        <motion.div
                            key={q.orderId}
                            layout
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="flex items-center gap-4 rounded-[20px] glass-dark border-amber-500/10 hover:border-amber-500/30 pl-4 pr-2 py-2 text-xs transition-all group/item shadow-xl"
                        >
                            <div className="flex flex-col border-r border-white/5 pr-4">
                                <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-0.5">#{q.orderId}</span>
                                <span className="text-sm font-black text-white italic tracking-tighter uppercase leading-none">{q.tableName}</span>
                            </div>
                            
                            <div className="flex flex-col min-w-[80px]">
                                <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">{q.customerName || 'MİSAFİR'}</span>
                                {q.totalAmount != null && (
                                    <span className="font-black text-emerald-400 tabular-nums">
                                        ₺{Number(q.totalAmount).toLocaleString()}
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-1.5 ml-2">
                                <button
                                    type="button"
                                    onClick={() => void reject(q.orderId)}
                                    className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center border border-rose-500/20 active:scale-90"
                                >
                                    <FiX size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void approve(q.orderId)}
                                    className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black text-[10px] text-white transition-all uppercase tracking-widest shadow-lg shadow-emerald-900/20 border border-emerald-400/20 active:scale-95"
                                >
                                    ONAYLA
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};
