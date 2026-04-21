import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiMenu, FiClock, FiWifi, FiPhoneCall, FiSettings, FiLayers, FiShoppingBag, FiLogOut, FiBell } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { usePosStore } from '../../store/usePosStore';
import { useUIStore } from '../../store/useUIStore';
import { subscribePendingSyncCount } from '../../lib/syncQueueClient';
import { usePosLocale } from '../../contexts/PosLocaleContext';
import { POS_LANGS } from '../../i18n/posMessages';
import { CashierCallWaiterModal } from '../../features/terminal/components/CashierCallWaiterModal';

export const Header: React.FC = () => {
    const navigate = useNavigate();
    const { user, logout, billingWorkspace } = useAuthStore();
    const { t, lang } = usePosLocale();
    const {
        setLang,
        orders,
        cashierView,
        setCashierView,
        selectedTable,
        setOrderType,
        occupiedTableCount,
        fetchTables,
        tables,
    } = usePosStore();
    
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const { 
        setCallerId, 
        setKitchenStatus, 
        setWaOrder, 
        setStaffMenu,
        pendingOnlineOrders, 
        pendingWaOrders,
        pendingCalls,

        isOnlineOrderAlertActive, 
        setOnlineOrderAlert,
        setOnlineOrders
    } = useUIStore();

    const [syncPending, setSyncPending] = useState(0);
    const [callWaiterOpen, setCallWaiterOpen] = useState(false);
    const callWaiterButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => subscribePendingSyncCount(setSyncPending), []);

    const handleLangToggle = () => {
        const currentIndex = POS_LANGS.findIndex(l => l.code === lang);
        const nextIndex = (currentIndex + 1) % POS_LANGS.length;
        setLang(POS_LANGS[nextIndex].code);
    };

    const activeLang = POS_LANGS.find(l => l.code === lang) || POS_LANGS[0];

    /**
     * Teslim merkezi «HAZIR PAKET HATTI» ile aynı: ready + masa dışı (gel-al / paket / web→takeaway).
     * Salon (dine_in) hazır siparişleri bu sayıya dahil değil.
     */
    const readyPackageLineCount = useMemo(
        () => orders.filter((o) => o.status === 'ready' && o.orderType !== 'dine_in').length,
        [orders],
    );

    const prevPackageLineRef = useRef<number | null>(null);
    const [packageLineNewFlash, setPackageLineNewFlash] = useState(false);

    useEffect(() => {
        if (prevPackageLineRef.current === null) {
            prevPackageLineRef.current = readyPackageLineCount;
            return;
        }
        if (readyPackageLineCount > prevPackageLineRef.current) {
            setPackageLineNewFlash(true);
            prevPackageLineRef.current = readyPackageLineCount;
            const t = window.setTimeout(() => setPackageLineNewFlash(false), 6500);
            return () => clearTimeout(t);
        }
        prevPackageLineRef.current = readyPackageLineCount;
    }, [readyPackageLineCount]);

    const entitlementMap = useMemo(() => {
        const out: Record<string, boolean> = {};
        const list = billingWorkspace?.entitlements;
        if (Array.isArray(list)) {
            for (const e of list) {
                if (e?.code) out[String(e.code)] = Boolean(e.enabled);
            }
        }
        return out;
    }, [billingWorkspace]);

    const canUseCallerId = entitlementMap.caller_id_android !== false;
    const canUseWhatsAppOrders = entitlementMap.whatsapp_orders !== false;

    return (
        <header className="flex items-center justify-between h-16 px-6 bg-[#020617]/80 backdrop-blur-3xl border-b border-white/[0.03] z-50 transition-all">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setStaffMenu(true)}
                        className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/5 active:scale-90"
                    >
                        <FiMenu size={20} />
                    </button>

                    
                    {user?.role === 'admin' && (
                        <button 
                            onClick={() => navigate('/admin')} 
                            className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/10 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-blue-900/10"
                        >
                            <FiSettings size={14} /> <span className="hidden lg:inline">{t('nav.admin')}</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center bg-black/40 rounded-2xl border border-white/5 p-1 shadow-inner">
                    <button
                        onClick={() => { void fetchTables(); setCashierView('floor'); }}
                        className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${cashierView === 'floor' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <FiLayers size={14} /> <span>{t('nav.tables')}</span>
                    </button>
                    <button
                        onClick={() => {
                            setCashierView('menu');
                            if (!selectedTable) setOrderType('takeaway');
                        }}
                        className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${cashierView === 'menu' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <FiShoppingBag size={14} /> <span>{t('nav.menu')}</span>
                    </button>
                </div>

                <div className="h-4 w-px bg-white/5 hidden xl:block" />

                <div className="hidden xl:flex items-center gap-3">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">{t('nav.occupancy')}</span>
                    <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-lg font-black text-white italic tabular-nums leading-none">{occupiedTableCount()}</span>
                        <span className="text-[10px] text-slate-600 font-bold">/ {tables.length}</span>
                    </div>
                    </div>
                    {selectedTable && (
                        <div className="flex items-center gap-3 ml-2 pl-3 border-l border-white/10">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest leading-none">{t('nav.active')}</span>
                                <span className="text-sm font-black text-white uppercase italic tracking-tight mt-1">{selectedTable.name}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3">
                {(user?.role === 'cashier' || user?.role === 'admin') && (
                    <button
                        ref={callWaiterButtonRef}
                        type="button"
                        onClick={() => {
                            void fetchTables();
                            setCallWaiterOpen(true);
                        }}
                        title="Garson çağır"
                        className="relative h-10 px-3 sm:px-4 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-[#0a0e1a] transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-2 active:scale-95"
                    >
                        <FiBell size={16} className="shrink-0" />
                        <span className="hidden sm:inline">Garson çağır</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setKitchenStatus(true)}
                    title={
                        readyPackageLineCount > 0
                            ? t('nav.ready_package_line_tooltip').replace('{{n}}', String(readyPackageLineCount))
                            : t('nav.kitchen')
                    }
                    className={`relative h-10 px-4 pt-2 border rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 active:scale-95 ${
                        readyPackageLineCount > 0
                            ? packageLineNewFlash
                                ? 'bg-rose-500/35 text-rose-100 border-rose-400/70 shadow-[0_0_22px_rgba(244,63,94,0.45)]'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/30 shadow-lg shadow-rose-900/20'
                            : 'bg-orange-500/5 text-orange-400 border-white/5 hover:bg-orange-500 hover:text-white'
                    }`}
                >
                    {readyPackageLineCount > 0 && (
                        <span
                            className={`absolute -top-1.5 left-1/2 z-10 min-w-[1.35rem] h-5 px-1 -translate-x-1/2 flex items-center justify-center rounded-lg bg-gradient-to-br from-pink-600 to-rose-600 text-white font-black text-[10px] tabular-nums leading-none border border-white/20 ${
                                packageLineNewFlash ? 'animate-kitchen-package-line-blink' : 'shadow-lg shadow-pink-900/40'
                            }`}
                        >
                            {readyPackageLineCount}
                        </span>
                    )}
                    <FiClock
                        size={16}
                        className={
                            readyPackageLineCount > 0
                                ? packageLineNewFlash
                                    ? 'animate-pulse-fast text-rose-100'
                                    : 'text-rose-300'
                                : ''
                        }
                    />
                    <span className="hidden md:inline">{t('nav.kitchen')}</span>
                </button>

                <div className="h-6 w-px bg-white/5 hidden lg:block" />

                <button
                    onClick={() => { setOnlineOrderAlert(false); setOnlineOrders(true); }}
                    className={`h-10 flex items-center gap-2 px-4 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                        isOnlineOrderAlertActive 
                            ? 'bg-rose-500 text-white border-rose-400 animate-pulse-fast shadow-lg shadow-rose-900/20' 
                            : pendingOnlineOrders > 0 
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                                : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10'
                    }`}
                >
                    <FiWifi size={16} />
                    <span className="hidden xl:inline">B2B</span>
                    {pendingOnlineOrders > 0 && (
                         <div className="px-1.5 py-0.5 rounded-md bg-black/40 text-white font-black text-[9px]">
                            {pendingOnlineOrders}
                        </div>
                    )}
                </button>

                {canUseCallerId && (
                    <button
                        onClick={() => setCallerId(true)}
                        className="relative w-10 h-10 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl transition-all border border-emerald-500/10 flex items-center justify-center active:scale-90 shadow-sm"
                    >
                        <FiPhoneCall size={16} className={pendingCalls > 0 ? "animate-pulse" : ""} />
                        {pendingCalls > 0 && (
                            <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white font-black text-[9px] shadow-lg shadow-emerald-500/30">
                                {pendingCalls}
                            </div>
                        )}
                    </button>
                )}

                {canUseWhatsAppOrders && (
                    <button
                        onClick={() => setWaOrder(true)}
                        className="relative h-10 px-4 flex items-center justify-center gap-2 bg-[#25D366]/5 text-[#25D366] border border-[#25D366]/10 rounded-xl hover:bg-[#25D366] hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider active:scale-95 shadow-sm"
                    >
                        <FaWhatsapp size={16} className={pendingWaOrders > 0 ? "animate-bounce" : ""} /> 
                        <span className="hidden lg:inline">{t('nav.whatsapp')}</span>
                        {pendingWaOrders > 0 && (
                            <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md bg-[#25D366] text-white font-black text-[9px] shadow-lg shadow-[#25D366]/30 animate-pulse">
                                {pendingWaOrders}
                            </div>
                        )}
                    </button>
                )}

                <div className="h-6 w-px bg-white/5 hidden lg:block" />

                <div className="hidden lg:flex items-center gap-3 px-4 h-10 bg-white/[0.02] border border-white/[0.03] rounded-xl group cursor-help transition-colors hover:bg-white/[0.05]">
                    <div className="relative">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase group-hover:text-emerald-500 transition-colors">{t('nav.cloudSync')}</span>
                </div>

                <div className="h-6 w-px bg-white/5 hidden xl:block" />

                <button
                    onClick={handleLangToggle}
                    className="h-10 px-3 bg-white/5 border border-white/5 rounded-xl flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-white transition-all active:scale-95 shadow-sm"
                >
                    <span>{activeLang.emoji}</span>
                    <span className="tracking-widest">{activeLang.code.toUpperCase()}</span>
                </button>

                <div className="hidden md:flex items-center gap-3">
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 opacity-50">STATION_STAFF</span>
                        <span className="text-xs font-black text-white uppercase italic tracking-tight">{user?.name || 'OFFLINE'}</span>
                    </div>
                     <button 
                        onClick={() => logout()}
                        className="w-10 h-10 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all active:scale-90 border border-transparent hover:border-rose-400/20 flex items-center justify-center p-0"
                    >
                        <FiLogOut size={16} />
                    </button>
                </div>

                {syncPending > 0 && (
                    <div className="px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl text-[9px] font-black animate-pulse shadow-lg shadow-amber-900/10 ml-2">
                        {syncPending}
                    </div>
                )}
                

                <div className="h-6 w-px bg-white/5 ml-2" />

                <div className="flex flex-col items-end min-w-[80px]">
                    <span className="text-sm font-black text-white tabular-nums leading-none mb-1">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                        {currentTime.toLocaleDateString([], { weekday: 'long' })}
                    </span>
                </div>
            </div>
            <CashierCallWaiterModal
                open={callWaiterOpen}
                onClose={() => setCallWaiterOpen(false)}
                onAfterSubmit={() => void fetchTables()}
                anchorRef={callWaiterButtonRef}
            />
        </header>
    );
};

export default Header;
