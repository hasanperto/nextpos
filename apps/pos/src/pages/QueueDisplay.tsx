import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { FiCheckCircle, FiClock, FiActivity, FiArrowRight } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { GiCookingPot } from 'react-icons/gi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';

interface QueueItem {
    id: number;
    ticket_number: number;
    status: 'waiting' | 'preparing' | 'ready';
    order_type: string;
}

const QueueDisplay: React.FC = () => {
    const { tenantId, token, getAuthHeaders } = useAuthStore();
    const { t } = usePosLocale();
    const [tickets, setTickets] = useState<QueueItem[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchQueue = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/kitchen/tickets', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setTickets(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        void fetchQueue();
        const fetchInterval = setInterval(fetchQueue, 15000);
        const clock = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => { clearInterval(fetchInterval); clearInterval(clock); };
    }, [fetchQueue]);

    useEffect(() => {
        if (!tenantId) return;
        const socket = io(window.location.origin, {
            path: '/socket.io',
            transports: ['websocket'],
            auth: token ? { token } : {},
        });
        socket.on('connect', () => socket.emit('join:tenant', tenantId));
        socket.on('kitchen:ticket_updated', fetchQueue);
        socket.on('kitchen:ticket_new', fetchQueue);
        return () => { socket.disconnect(); };
    }, [tenantId, token, fetchQueue]);

    const preparing = tickets.filter(item => item.status === 'waiting' || item.status === 'preparing');
    const ready = tickets.filter(item => item.status === 'ready');

    return (
        <div className="min-h-screen bg-[#020617] text-white p-16 font-sans overflow-hidden flex flex-col relative selection:bg-emerald-500/30">
            {/* TACTICAL ATMOSPHERE */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-emerald-600/5 rounded-full blur-[180px] animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[140px]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] brightness-150" />
            </div>

            {/* COMMAND HEADER */}
            <motion.header 
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex items-center justify-between mb-20 bg-white/[0.02] backdrop-blur-3xl p-12 rounded-[4rem] border border-white/5 shadow-2xl relative z-10"
            >
                <div className="flex items-center gap-12">
                    <motion.div 
                        whileHover={{ rotate: 180, scale: 1.1 }}
                        className="w-28 h-28 bg-emerald-600 rounded-[36px] flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)] relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                        <GiCookingPot size={60} className="text-white relative z-10" />
                    </motion.div>
                    <div>
                        <h1 className="text-8xl font-black italic tracking-tighter uppercase leading-none text-white">
                            SİPARİŞ <span className="text-emerald-500">EKRANI</span>
                        </h1>
                        <div className="flex items-center gap-5 mt-4">
                            <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-black tracking-[0.3em] uppercase italic">GLOBAL_SIGNAL_CORE</div>
                            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
                            <span className="text-xs font-black text-slate-500 uppercase tracking-[0.5em] opacity-40">READY_FOR_DEPLOYMENT</span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[140px] font-black text-white/5 tabular-nums leading-none tracking-tighter italic select-none">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </motion.header>

            <div className="flex-1 flex gap-16 relative z-10 overflow-hidden">
                {/* PREPARING SECTOR */}
                <div className="flex-[0.8] bg-[#0a0f1d]/40 rounded-[5rem] border border-white/[0.03] p-16 flex flex-col shadow-inner backdrop-blur-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-16 opacity-[0.02] pointer-events-none uppercase font-black text-9xl tracking-tight italic select-none">QUEUE</div>
                    
                    <div className="flex items-center justify-between mb-16 relative z-10">
                        <div className="flex items-center gap-8">
                            <div className="w-4 h-16 bg-amber-500/30 rounded-full blur-[2px]" />
                            <h2 className="text-6xl font-black uppercase tracking-[0.3em] text-slate-500 italic">{t('queue.preparing_title')}</h2>
                        </div>
                        <div className="px-8 py-3 bg-amber-500/10 border border-amber-500/20 rounded-3xl text-amber-500 text-xl font-black italic tracking-tighter shadow-2xl">
                            {preparing.length} <span className="text-xs tracking-widest opacity-60">{t('queue.orders_label')}</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-10 content-start pr-6 custom-scrollbar relative z-10">
                        <AnimatePresence mode="popLayout">
                            {preparing.map(ticket => (
                                <motion.div 
                                    key={ticket.id} 
                                    layout
                                    initial={{ scale: 0.9, opacity: 0, x: -20 }}
                                    animate={{ scale: 1, opacity: 1, x: 0 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className="bg-white/[0.02] border border-white/5 rounded-[4rem] p-12 text-center transition-all hover:bg-white/[0.04] group/item relative overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-full h-2 bg-amber-500/20 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                    <span className="text-8xl font-black text-slate-400 italic tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                                        #{ticket.ticket_number ?? ticket.id}
                                    </span>
                                    <div className="mt-6 flex items-center justify-center gap-3 text-slate-600">
                                        <FiActivity className="animate-pulse" />
                                        <span className="text-xs font-black uppercase tracking-[0.3em] italic">{t('queue.processing_label')}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {preparing.length === 0 && (
                            <div className="col-span-2 flex flex-col items-center justify-center h-full opacity-5 mt-20">
                                <GiCookingPot size={280} className="text-white mb-10" />
                                <p className="text-6xl font-black uppercase tracking-[0.5em] italic">ZERO_LOAD</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* READY SECTOR */}
                <div className="flex-1 bg-emerald-500/[0.03] rounded-[5rem] border border-emerald-500/10 p-16 flex flex-col shadow-[0_0_100px_rgba(16,185,129,0.1)] backdrop-blur-3xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none uppercase font-black text-9xl tracking-tight italic select-none">READY</div>
                    
                    <div className="flex items-center justify-between mb-16 relative z-10">
                        <div className="flex items-center gap-8">
                            <div className="w-4 h-16 bg-emerald-500 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.8)]" />
                            <h2 className="text-6xl font-black uppercase tracking-[0.3em] text-emerald-400 italic">{t('queue.ready_title')}</h2>
                        </div>
                        <div className="px-10 py-4 bg-emerald-500 text-white rounded-[2rem] text-2xl font-black italic tracking-tighter shadow-2xl shadow-emerald-500/40">
                            {ready.length} <span className="text-sm tracking-[0.2em] opacity-80">STOCKED</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-12 content-start pr-6 custom-scrollbar relative z-10">
                        <AnimatePresence mode="popLayout">
                            {ready.map(ticket => (
                                <motion.div 
                                    key={ticket.id} 
                                    layout
                                    initial={{ scale: 0.5, opacity: 0, y: 150 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.8, opacity: 0, y: -50 }}
                                    className="bg-emerald-600 text-white rounded-[5rem] p-16 text-center shadow-[0_40px_80px_rgba(0,0,0,0.4)] border-2 border-emerald-400/30 relative group/ready overflow-hidden"
                                >
                                    {/* RADIANT EFFECT */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/30 to-transparent animate-pulse-fast pointer-events-none" />
                                    <div className="absolute -inset-4 border-2 border-emerald-500 rounded-[5.5rem] animate-ping opacity-30 pointer-events-none" />
                                    
                                    <span className="text-[140px] font-black italic tracking-tighter leading-none block drop-shadow-2xl">
                                        #{ticket.ticket_number ?? ticket.id}
                                    </span>
                                    <div className="mt-10 flex flex-col items-center gap-6">
                                        <div className="px-8 py-3 bg-white/20 backdrop-blur-xl rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] border border-white/20 flex items-center gap-4">
                                            <FiCheckCircle size={24} className="animate-bounce" /> {t('queue.please_pickup')}
                                        </div>
                                        <div className="flex items-center gap-3 text-white/40 text-[10px] font-black uppercase tracking-[0.5em]">
                                            SIGNAL_MATCH_VERIFIED <FiArrowRight />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {ready.length === 0 && (
                            <div className="col-span-2 flex flex-col items-center justify-center h-full opacity-10 mt-20">
                                <FiClock size={200} className="mb-10 text-emerald-500/20" />
                                <p className="text-5xl font-black uppercase tracking-[0.5em] italic text-emerald-500/20">DEPLOYMENT_IDLE</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* STRATEGIC STATUS BAR */}
            <motion.footer 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-20 flex items-center justify-between py-12 border-t border-white/5 relative z-10 shrink-0"
            >
                <div className="flex items-center gap-16">
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.8em] italic">NETWORK_KERNEL</span>
                        <div className="flex items-center gap-4">
                            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse" />
                            <span className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">PULSE_SIGNAL_ACTIVE_CORE</span>
                        </div>
                    </div>
                    <div className="w-px h-12 bg-white/5" />
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.8em] italic">INTERFACE_VERSION</span>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">DS_ELITE_v4.4.2_TACTICAL</span>
                    </div>
                </div>

                <div className="flex items-center gap-12 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all cursor-crosshair">
                   <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                        <span className="text-[9px] font-black tracking-widest text-slate-600">READY</span>
                   </div>
                   <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-1.5 bg-amber-500 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
                        <span className="text-[9px] font-black tracking-widest text-slate-600">PROCESS</span>
                   </div>
                   <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-1.5 bg-rose-600 rounded-full opacity-30" />
                        <span className="text-[9px] font-black tracking-widest text-slate-600">ERROR</span>
                   </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.8em] italic">NEXTPOS_STATION_CLOUD</span>
                    <p className="text-3xl font-black text-white italic tracking-tighter opacity-80 leading-none">
                        STATION_NODE_ALPHA
                    </p>
                </div>
            </motion.footer>
        </div>
    );
};

export default QueueDisplay;
