import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { 
    FiRefreshCw, FiLogOut, FiShoppingBag, FiX, 
    FiSearch, FiGrid, FiClock, FiPlus, FiMinus, 
    FiPieChart, FiLayout,
    FiCheckCircle, FiBell, FiChevronLeft, FiCreditCard,
    FiLayers, FiActivity, FiUser, FiBriefcase, FiMoreVertical, FiTrendingUp, FiArrowRight, FiTrash2
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { playNotification } from '../lib/notifications';
import { CustomerIdentify } from '../components/pos/CustomerIdentify';
import { OrderProductModal, productHasConfigurableOptions } from '../components/pos/OrderProductModal';
import type { PosModifier, PosProduct } from '../store/usePosStore';
import { getLongOccupiedThresholdMinutes } from '../lib/floorSettings';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

// Types
type TableRow = {
    id: number;
    name: string;
    /** Bölge filtresi (garson görev alanı) */
    section_id?: number | null;
    section_name?: string | null;
    status: 'empty' | 'occupied' | 'reserved' | 'dirty' | 'waiting' | 'ready' | 'billing';
    active_session_id?: number | null;
    /** CRM kayıtlı müşteri adı (GET /tables JOIN customers) */
    customer_name?: string | null;
    guest_name?: string | null;
    guest_count?: number | null;
    waiter_name?: string | null;
    /** Aktif oturumdaki personelin rolü (masayı açan: garson / kasiyer vb.) */
    waiter_role?: string | null;
    waiter_id?: number | null;
    total_amount?: number;
    session_opened_at?: string;
    capacity?: number;
};

type QrRequest = {
    orderId: number;
    tableId?: number | null;
    tableName: string;
    customerName?: string;
    totalAmount?: string | number;
    /** En müsait garsona yönlendirme; ses/toast önceliği */
    assignedWaiterId?: number | null;
};

/** Hesap / kasiyer çağrısı — tüm garsonlara gösterilir */
function isBillingServiceCallType(ct: string): boolean {
    const c = String(ct || '');
    return c === 'request_bill' || c === 'request_bill_card' || c === 'request_bill_cash';
}

type ZoneUser = { role?: string; waiter_all_sections?: unknown; waiter_section_id?: unknown } | null | undefined;

/** Garson: masa atanan bölgede mi? (Admin’de tek bölge / tüm salon) */
function isTableInWaiterAssignedSection(u: ZoneUser, table: TableRow): boolean {
    if (!u || u.role !== 'waiter') return true;
    const all =
        u.waiter_all_sections === undefined ||
        u.waiter_all_sections === null ||
        u.waiter_all_sections === true ||
        u.waiter_all_sections === 1 ||
        String(u.waiter_all_sections).toLowerCase() === 'true';
    if (all) return true;
    const sid = u.waiter_section_id;
    if (sid == null || sid === '') return true;
    const n = Number(sid);
    if (!Number.isFinite(n)) return true;
    const tSec = table.section_id != null ? Number(table.section_id) : NaN;
    if (!Number.isFinite(tSec)) return true;
    return n === tSec;
}

function waiterShouldApplyServiceCallOverlay(u: ZoneUser, table: TableRow, callType: string): boolean {
    if (isBillingServiceCallType(callType)) return true;
    return isTableInWaiterAssignedSection(u, table);
}

function tpl(t: (k: string) => string, key: string, vars: Record<string, string | number>): string {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{{${k}}}`).join(String(v));
    }
    return s;
}

function formatOccupiedTimer(openedAt: string | undefined, t: (k: string) => string, nowMs: number): string | null {
    if (!openedAt) return null;
    const diff = Math.floor((nowMs - new Date(openedAt).getTime()) / 60000);
    if (diff < 1) return t('waiter.timer_new');
    if (diff < 60) return `${diff}${t('waiter.timer_min_short')}`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return tpl(t, 'waiter.timer_hours_mins', { h, m });
}

type ServiceCallMeta = {
    serviceCallId: number;
    assignedWaiterId: number | null;
    createdAtMs: number;
};

/** Kasiyerden masasız hedef garson çağrısı (API `table_id` NULL) */
type CashierNoTableCall = {
    serviceCallId: number;
    created_at: string;
};

/** Hazır sipariş kalemi: varyant + modifikasyon satırları (API `variant_name`, JSON `modifiers`) */
function formatReadyOrderItemExtras(
    item: {
        variant_name?: string | null;
        modifiers?: unknown;
        notes?: string | null;
    },
    t: (k: string) => string,
    notePrefix = t('waiter.note_prefix')
): string[] {
    const lines: string[] = [];
    const vn = item.variant_name != null ? String(item.variant_name).trim() : '';
    if (vn) lines.push(vn);

    let raw = item.modifiers;
    if (raw == null || raw === '') return lines;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return lines;
        for (const m of parsed) {
            if (m == null) continue;
            if (typeof m === 'string') {
                lines.push(m);
                continue;
            }
            if (typeof m === 'object') {
                const o = m as Record<string, unknown>;
                const label =
                    (typeof o.name === 'string' && o.name) ||
                    (typeof o.label === 'string' && o.label) ||
                    (typeof o.modifier_name === 'string' && o.modifier_name);
                if (label) lines.push(String(label));
            }
        }
    } catch {
        /* ignore */
    }
    const note = item.notes != null ? String(item.notes).trim() : '';
    if (note) lines.push(`${notePrefix}${note}`);
    return lines;
}

const TableCard = ({
    table,
    status,
    readyAt,
    partialItems,
    onClick,
    onServe,
    serviceCallMeta,
    currentUserId,
}: {
    table: TableRow;
    status: TableRow['status'];
    readyAt?: number;
    partialItems?: string[];
    onClick: () => void;
    onServe?: (e: React.MouseEvent) => void;
    serviceCallMeta?: ServiceCallMeta | null;
    currentUserId?: number;
}) => {
    const { settings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '₺';
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        if (!table.session_opened_at) return;
        const iv = setInterval(() => setNowMs(Date.now()), 30000);
        return () => clearInterval(iv);
    }, [table.session_opened_at]);
    const timer = useMemo(
        () => formatOccupiedTimer(table.session_opened_at, t, nowMs),
        [table.session_opened_at, t, nowMs]
    );
    const openedAtTime = table.session_opened_at ? new Date(table.session_opened_at).getTime() : 0;
    const minutesOccupied = openedAtTime ? Math.floor((nowMs - openedAtTime) / 60000) : 0;
    const longOccupiedThreshold = getLongOccupiedThresholdMinutes(settings);
    /** Uzun süre dolu → kırmızı (Admin → Ayarlar → eşik dakika) */
    const isLongOccupied = status === 'occupied' && minutesOccupied > longOccupiedThreshold;
    
    // Ready Timer
    const [readyTimer, setReadyTimer] = useState(0);
    useEffect(() => {
        if (status !== 'ready' || !readyAt) return;
        setReadyTimer(Math.floor((Date.now() - readyAt) / 60000));
        const iv = setInterval(() => setReadyTimer(Math.floor((Date.now() - readyAt) / 60000)), 15000);
        return () => clearInterval(iv);
    }, [status, readyAt]);
    
    const getStatusConfig = () => {
        switch (status) {
            case 'ready':
                return { color: 'rose', icon: '🍽️', text: t('waiter.status_kitchen_ready'), pulse: 'animate-pulse-fast', shadow: 'shadow-rose-500/40' };
            case 'billing':
                return { color: 'blue', icon: '🧾', text: t('waiter.status_bill_requested'), pulse: 'animate-pulse-slow', shadow: 'shadow-blue-500/40' };
            case 'waiting':
                return { color: 'amber', icon: '🔔', text: t('waiter.status_waiter_call'), pulse: 'animate-pulse-fast', shadow: 'shadow-amber-500/40' };
            case 'occupied':
                return {
                    color: isLongOccupied ? 'occupiedLong' : 'occupiedFresh',
                    icon: '👤',
                    text: isLongOccupied ? t('waiter.status_long_stay') : t('waiter.status_occupied'),
                    pulse: isLongOccupied ? 'animate-pulse-slow' : '',
                    shadow: '',
                };
            case 'reserved':
                return { color: 'sky', icon: '📅', text: t('waiter.status_reserved'), pulse: '', shadow: '' };
            case 'dirty':
                return { color: 'slate', icon: '🧹', text: t('waiter.status_dirty'), pulse: '', shadow: '' };
            default:
                return { color: 'emerald', icon: '✨', text: t('waiter.status_empty'), pulse: '', shadow: '' };
        }
    };

    const config = getStatusConfig();
    const isBusy = status !== 'empty';

    const assigneeId = serviceCallMeta?.assignedWaiterId ?? null;
    const [takeoverNowMs, setTakeoverNowMs] = useState(() => Date.now());
    useEffect(() => {
        if ((status !== 'waiting' && status !== 'billing') || !serviceCallMeta || assigneeId == null) return;
        if (Number(currentUserId) === assigneeId) return;
        const iv = setInterval(() => setTakeoverNowMs(Date.now()), 1000);
        return () => clearInterval(iv);
    }, [status, serviceCallMeta, assigneeId, currentUserId]);

    const takeoverSecondsLeft = useMemo(() => {
        if (!serviceCallMeta || assigneeId == null) return 0;
        if (Number(currentUserId) === assigneeId) return 0;
        const elapsed = takeoverNowMs - serviceCallMeta.createdAtMs;
        return Math.max(0, Math.ceil((60_000 - elapsed) / 1000));
    }, [serviceCallMeta, assigneeId, currentUserId, takeoverNowMs]);
    
    // Color Mappings aligned with Pulse System
    /** Kasiyer TableFloorGrid ile uyumlu: boş=emerald; dolu=amber gradyan; uzun süre=kırmızı gradyan */
    const colorClasses: Record<string, string> = {
        emerald: 'border-2 border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300/90 shadow-black/30 group-hover:border-emerald-500/45 group-hover:bg-emerald-500/10',
        rose: 'border-2 border-rose-500/45 text-rose-100 bg-gradient-to-br from-rose-600/25 to-rose-900/15 shadow-lg shadow-rose-500/20',
        blue: 'border-2 border-blue-500/40 text-blue-100 bg-gradient-to-br from-blue-600/20 to-slate-900/20 shadow-lg shadow-blue-500/15',
        amber: 'border-2 border-amber-500/40 text-amber-50 bg-gradient-to-br from-amber-600/15 to-orange-900/10 shadow-lg shadow-amber-500/10',
        orange: 'border-2 border-orange-500/40 text-orange-50 bg-gradient-to-br from-orange-600/20 to-orange-900/15 shadow-orange-500/15',
        occupiedFresh:
            'border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/25 via-amber-600/15 to-orange-700/20 text-white shadow-[0_10px_40px_-12px_rgba(245,158,11,0.45)]',
        occupiedLong:
            'border-2 border-red-500/60 bg-gradient-to-br from-red-600/40 via-rose-700/25 to-red-950/35 text-white shadow-[0_12px_44px_-10px_rgba(239,68,68,0.55)] ring-2 ring-red-500/20',
        sky: 'border-2 border-sky-500/35 text-sky-100 bg-gradient-to-br from-sky-600/15 to-slate-900/20',
        slate: 'border-2 border-slate-600/40 text-slate-300 bg-slate-800/40',
    };

    const showLongPulse = status === 'occupied' && isLongOccupied;

    return (
        <motion.button
            layout
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`relative group w-full min-h-[132px] sm:min-h-[160px] sm:h-40 h-auto rounded-[2.2rem] overflow-hidden transition-all duration-300 shadow-xl touch-manipulation flex flex-col ${colorClasses[config.color] || colorClasses.emerald}`}
        >
            {/* Heartbeat Pulse Ring */}
            {(status === 'ready' || status === 'waiting' || status === 'billing') && (
                <div className={`absolute inset-0 border-2 rounded-[2.2rem] pointer-events-none ${
                    status === 'ready' ? 'border-rose-500 animate-ping-slow' : 
                    status === 'waiting' ? 'border-amber-500 animate-ping-slow' : 
                    'border-blue-500 animate-ping-slow opacity-50'
                }`} />
            )}
            {showLongPulse && (
                <div className="absolute inset-0 rounded-[2.2rem] pointer-events-none border-2 border-red-400/40 animate-pulse shadow-[inset_0_0_24px_rgba(239,68,68,0.15)]" aria-hidden />
            )}

            {/* Kasiyer grid ile uyum: sol üst sadece durum rozeti; personel altta sol */}
            <div className="absolute top-3 left-3 z-20 max-w-[70%] sm:max-w-[75%] flex flex-col items-start gap-1.5">
                <div className={`inline-flex px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl bg-black/35 backdrop-blur-md border border-white/15 text-[8px] sm:text-[9px] font-black tracking-[0.12em] sm:tracking-[0.18em] uppercase leading-tight text-white ${config.pulse}`}>
                    {config.text}
                </div>
                {(status === 'waiting' || status === 'billing') &&
                    takeoverSecondsLeft > 0 &&
                    assigneeId != null &&
                    Number(currentUserId) !== assigneeId && (
                        <span className="text-[8px] font-black text-amber-200/95 tracking-wide">
                            {t('waiter.takeover_label')}: {takeoverSecondsLeft}s
                        </span>
                    )}
            </div>
            {isBusy && table.total_amount != null && Number(table.total_amount) > 0 && (
                <div className="absolute top-3 right-3 z-20 bg-white/20 backdrop-blur-md px-2 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-black text-white shadow-lg border border-white/15 tabular-nums">
                    {currency}{Math.round(Number(table.total_amount))}
                </div>
            )}

            <div className="p-4 pt-11 sm:p-6 sm:pt-12 h-full flex flex-col justify-between items-start relative z-10 w-full gap-2 flex-1">
                <div className="flex flex-col items-start w-full gap-1 min-w-0">
                    <div className="flex items-baseline gap-2 w-full min-w-0">
                        <span className={`text-2xl sm:text-3xl font-black italic tracking-tighter leading-none truncate ${isBusy ? 'text-white' : 'text-slate-700'}`}>
                            {table.name}
                        </span>
                        {!isBusy && <span className="text-[10px] font-black text-slate-800 flex items-center gap-1 opacity-40 shrink-0"><FiUser size={10} /> {table.capacity || 4}</span>}
                    </div>
                    {isBusy && (
                        <div className="flex flex-col gap-1 w-full overflow-hidden">
                            <motion.span 
                                initial={{ opacity: 0, x: -5 }} 
                                animate={{ opacity: 1, x: 0 }}
                                className={`text-[10px] font-black uppercase tracking-widest mt-1 truncate max-w-full italic transition-colors ${isLongOccupied ? 'text-red-300' : 'text-amber-200/90'}`}
                            >
                                {(table.customer_name?.trim() || table.guest_name?.trim()) || `👤 ${t('waiter.guest_label')}`}
                            </motion.span>
                            {partialItems && partialItems.length > 0 && status !== 'ready' && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {partialItems.map((item, i) => (
                                        <span key={i} className="text-[9px] font-black bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded w-max border border-rose-500/20 shadow-sm truncate max-w-full">
                                            ✓ {item}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between w-full min-h-[48px]">
                    {status === 'ready' && onServe ? (
                        <button 
                            type="button"
                            onClick={onServe}
                            className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-500/50 hover:bg-rose-400 active:scale-[0.98] transition-all text-xs sm:text-sm touch-manipulation"
                        >
                            <span>✓ {t('waiter.served_done')}</span>
                            <span className="font-black bg-rose-900/40 px-2 py-0.5 rounded opacity-90">
                                {readyTimer}
                                {t('waiter.timer_min_short')}
                            </span>
                        </button>
                    ) : isBusy ? (
                        <div
                            className={`flex items-end gap-2 w-full mt-auto min-w-0 ${
                                table.waiter_name?.trim() ? 'justify-between' : 'justify-end'
                            }`}
                        >
                            {table.waiter_name?.trim() && (
                                <div className="flex items-center gap-2 min-w-0 max-w-[58%] sm:max-w-[55%] px-3 py-1.5 bg-black/45 rounded-2xl border border-white/10 backdrop-blur-md shrink">
                                    {table.waiter_role === 'cashier' ? (
                                        <FiBriefcase
                                            className={`shrink-0 ${isLongOccupied ? 'text-red-400' : 'text-amber-400'}`}
                                            size={12}
                                            aria-hidden
                                        />
                                    ) : (
                                        <FiUser
                                            className={`shrink-0 ${isLongOccupied ? 'text-red-400' : 'text-amber-400'}`}
                                            size={12}
                                            aria-hidden
                                        />
                                    )}
                                    <span
                                        className={`text-[11px] font-black tracking-tight truncate min-w-0 ${isLongOccupied ? 'text-red-200' : 'text-amber-100/90'}`}
                                    >
                                        {table.waiter_name.trim()}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/45 rounded-2xl border border-white/10 backdrop-blur-md shrink-0">
                                <FiClock size={12} className={isLongOccupied ? 'text-red-400 animate-pulse' : 'text-amber-400'} />
                                <span className={`text-[11px] font-black tabular-nums tracking-tight ${isLongOccupied ? 'text-red-200' : 'text-amber-100/90'}`}>{timer}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-[20px] bg-white/5 flex items-center justify-center text-slate-800 group-hover:bg-emerald-500 group-hover:text-white group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-500">
                            <FiPlus size={24} />
                        </div>
                    )}
                </div>
            </div>

            {/* Kasiyer grid ile aynı: dolu masada kapasite noktaları */}
            {isBusy && status === 'occupied' && (table.capacity || 0) > 0 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10 pointer-events-none">
                    {[...Array(Math.min(4, table.capacity || 0))].map((_, i) => (
                        <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${isLongOccupied ? 'bg-red-400/50 border border-red-400/60' : 'bg-amber-400/45 border border-amber-400/50'}`}
                        />
                    ))}
                </div>
            )}

            <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.08] transition-opacity bg-gradient-to-br from-white to-transparent pointer-events-none rounded-[2.2rem]" />
        </motion.button>
    );
};

const HandoverPINModal = ({ onConfirm, onClose }: { onConfirm: (pin: string) => void, onClose: () => void }) => {
    const { t } = usePosLocale();
    const [pin, setPin] = useState('');
    
    const handleDigit = (digit: string) => {
        if (pin.length < 4) setPin(prev => prev + digit);
    };

    const handleClear = () => setPin('');

    useEffect(() => {
        if (pin.length === 4) {
            onConfirm(pin);
            setPin('');
        }
    }, [pin, onConfirm]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-full max-w-sm bg-[#0c121d] rounded-[40px] border border-white/10 p-8 relative overflow-hidden shadow-2xl"
            >
                <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/10 rounded-full -ml-16 -mt-16" />
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2 text-center">
                    {t('waiter.pin_title_lead')}{' '}
                    <span className="text-rose-500">{t('waiter.pin_title_accent')}</span>
                </h3>
                <p className="text-[9px] font-bold text-slate-500 text-center uppercase tracking-widest mb-8">{t('waiter.pin_subtitle')}</p>
                
                <div className="flex justify-center gap-3 mb-10">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`w-12 h-16 rounded-2xl border-2 flex items-center justify-center transition-all ${pin.length > i ? 'bg-rose-500 border-rose-400 shadow-lg shadow-rose-500/20' : 'bg-white/5 border-white/5'}`}>
                            {pin.length > i && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'X'].map((val) => (
                        <button 
                            key={val}
                            onClick={() => {
                                if (val === 'C') handleClear();
                                else if (val === 'X') onClose();
                                else handleDigit(val);
                            }}
                            className={`h-16 rounded-2xl font-black text-lg transition-all active:scale-90 ${val === 'X' ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' : val === 'C' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-white/5 text-white hover:bg-white/10 border border-white/5'}`}
                        >
                            {val}
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    );
};

export const WaiterPanel: React.FC = () => {
    const { getAuthHeaders, logout, user, tenantId, token } = useAuthStore();
    const { t, lang } = usePosLocale();
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 10000);
        return () => clearInterval(interval);
    }, []);

    const formatElapsedTime = useCallback((date: string) => {
        if (!date) return 0;
        const start = new Date(date).getTime();
        return Math.floor((currentTime - start) / 60000);
    }, [currentTime]);

    const { 
        categories, products, modifiers, fetchCategories, fetchProducts, fetchModifiers, 
        setSelectedTable, setOrderType, selectedTable,
        cart, addToCart, removeFromCart, updateQty, clearCart,
        submitRemoteOrder, getCartTotal,
        settings, fetchSettings
    } = usePosStore();
    const currency = settings?.currency || '₺';

    // Local UI State
    const [view, setView] = useState<'floor' | 'order' | 'stats' | 'messages' | 'kitchen'>('floor');
    const [tables, setTables] = useState<TableRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sectionTab, setSectionTab] = useState<string>('all');
    const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [openModalTable, setOpenModalTable] = useState<TableRow | null>(null);
    const [openForm, setOpenForm] = useState({ guestCount: '2' });
    const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
    /** Sipariş ekranında sepet çekmecesi (varsayılan kapalı; FAB ile açılır) */
    const [orderCartOpen, setOrderCartOpen] = useState(false);
    const [tableStatuses, setTableStatuses] = useState<Record<number, TableRow['status']>>({});
    const [tableReadyTimes, setTableReadyTimes] = useState<Record<number, number>>({});
    const [partialReadyItems, setPartialReadyItems] = useState<Record<number, string[]>>({});
    /** Kiosk/QR garson çağrısı: devralma süresi ve PATCH için meta */
    const [pendingServiceCalls, setPendingServiceCalls] = useState<Record<number, ServiceCallMeta>>({});
    /** Kasiyer ekranından masasız gönderilen, hedefi bu garson olan bekleyen çağrılar */
    const [cashierNoTableCalls, setCashierNoTableCalls] = useState<CashierNoTableCall[]>([]);
    const cashierNoTableCallsRef = useRef<CashierNoTableCall[]>([]);
    useEffect(() => {
        cashierNoTableCallsRef.current = cashierNoTableCalls;
    }, [cashierNoTableCalls]);
    const cashierNoTableCompleteLock = useRef(false);
    const [qrQueue, setQrQueue] = useState<QrRequest[]>([]);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; confirmText: string; type: 'danger' | 'warning' | 'info'; onConfirm: () => void }>(null);
    /** QR siparişi adisyona alırken opsiyonel isim / alerji */
    const [qrAdisyonModal, setQrAdisyonModal] = useState<QrRequest | null>(null);
    const [qrAdisyonGuestName, setQrAdisyonGuestName] = useState('');
    const [qrAdisyonAllergy, setQrAdisyonAllergy] = useState('');
    const [qrAdisyonBusy, setQrAdisyonBusy] = useState(false);
    const [qrImportBusy, setQrImportBusy] = useState(false);
    const [readyOrders, setReadyOrders] = useState<any[]>([]);
    /** Hazır sipariş detay (teslim ekranı — kart tıklanınca) */
    const [readyOrderDetail, setReadyOrderDetail] = useState<any | null>(null);
    const [statsData] = useState<any>(null);
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [pinModal, setPinModal] = useState<{ open: boolean; tableId?: number | null; orderId?: number | null } | null>(null);
    const [identifiedCustomer, setIdentifiedCustomer] = useState<any>(null);
    const [customizeProduct, setCustomizeProduct] = useState<PosProduct | null>(null);

    const socketRef = useRef<Socket | null>(null);
    /** Hazır sipariş ses hatırlatıcısı: son uyarı zamanı (order id → epoch ms) */
    const readyOrderAlertRef = useRef<Record<number, number>>({});

    const onProductTap = (p: PosProduct) => {
        if (productHasConfigurableOptions(p, modifiers)) {
            setCustomizeProduct(p);
            return;
        }
        addToCart(p, null, []);
    };

    const handleServe = async (tableId: number, pinCode?: string) => {
        // In Waiter Panel, we usually find the order linked to table session
        const table = tables.find(t => t.id === tableId);
        if (!table || !table.active_session_id) return;

        try {
            // Find orders for this session that are 'ready'
            const oResp = await fetch(`/api/v1/orders?tableId=${tableId}&status=ready`, { headers: getAuthHeaders() });
            const readyOrders = await oResp.json();
            
            if (readyOrders.length === 0) {
                // If it's partial, maybe we just mark local? 
                // But usually we want to update the DB.
                setTableStatuses(prev => ({ ...prev, [tableId]: 'occupied' }));
                return;
            }

            // Mark all ready orders of this table as served
            for (const order of readyOrders) {
                const resp = await fetch(`/api/v1/orders/${order.id}/status`, {
                    method: 'PATCH',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'served', pinCode })
                });

                if (!resp.ok) {
                    const err = await resp.json();
                    if (err.error === 'INVALID_PIN') {
                        toast.error(t('waiter.toast_pin_wrong_order'), { id: 'pin-err' });
                        return;
                    }
                }
            }

            setTableStatuses(prev => ({ ...prev, [tableId]: 'occupied' }));
            setTableReadyTimes(prev => { const next = {...prev}; delete next[tableId]; return next; });
            setPinModal(null);
            toast.success(t('waiter.toast_orders_served'));
            void loadTables(true);
            void fetchReadyOrders();
        } catch (error) {
            toast.error(t('waiter.toast_connection_error'));
        }
    };

    const fetchReadyOrders = async () => {
        try {
            const resp = await fetch('/api/v1/orders?status=ready', { headers: getAuthHeaders() });
            if (resp.ok) {
                const data = await resp.json();
                setReadyOrders(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('Ready orders fetch error:', e);
        }
    };

    const handlePickup = async (orderId: number, pinCode?: string) => {
        // Enforce PIN if security is ON
        if (settings?.integrations?.pickupSecurity?.requirePIN && !pinCode) {
            setReadyOrderDetail(null);
            setPinModal({ open: true, orderId, tableId: null });
            return;
        }

        try {
            const resp = await fetch(`/api/v1/orders/${orderId}/pickup`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinCode })
            });

            if (resp.ok) {
                toast.success(t('waiter.toast_pickup_done'));
                setPinModal(null);
                setReadyOrderDetail(null);
                void fetchReadyOrders();
                void loadTables(true);
            } else {
                const err = await resp.json();
                if (err.code === 'INVALID_PIN') {
                    toast.error(t('waiter.toast_invalid_pin'));
                } else {
                    toast.error(err.error || t('waiter.toast_pickup_failed'));
                }
            }
        } catch (e) {
            toast.error(t('waiter.toast_server_disconnected'));
        }
    };


    // Initial Data Fetch
    useEffect(() => {
        void fetchCategories();
        void fetchProducts();
        void fetchModifiers();
        void loadTables();
        void fetchSettings();
    }, []);

    useEffect(() => {
        if (view !== 'kitchen') {
            setReadyOrderDetail(null);
            return;
        }
        void fetchReadyOrders();
    }, [view]);

    const readySalonOrders = useMemo(
        () => readyOrders.filter((o) => String(o.order_type) === 'dine_in'),
        [readyOrders]
    );

    /** Hazır salon siparişleri: 0–10 dk arası 2 dk’da bir, 10 dk sonrası her 1 dk ses (zil açıksa) */
    useEffect(() => {
        if (view !== 'kitchen') return;

        const tick = () => {
            if (!isAudioEnabled) return;
            const now = Date.now();
            const refMap = readyOrderAlertRef.current;
            const ids = new Set(readySalonOrders.map((o) => o.id));
            for (const k of Object.keys(refMap)) {
                if (!ids.has(Number(k))) delete refMap[Number(k)];
            }
            for (const o of readySalonOrders) {
                const readyMs = new Date(o.updated_at).getTime();
                if (!Number.isFinite(readyMs)) continue;
                const elapsedMin = (now - readyMs) / 60000;
                const gapMin = elapsedMin >= 10 ? 1 : 2;
                const last = refMap[o.id] ?? readyMs;
                if (now - last >= gapMin * 60 * 1000) {
                    void playNotification('item_ready');
                    refMap[o.id] = now;
                }
            }
        };

        const iv = window.setInterval(tick, 30000);
        tick();
        return () => window.clearInterval(iv);
    }, [view, readySalonOrders, isAudioEnabled]);


    const loadTables = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch('/api/v1/tables', { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                const fetchedTables = Array.isArray(data) ? data : [];
                setTables(fetchedTables);

                let scRows: {
                    id: number | string;
                    table_id: number | null;
                    call_type: string;
                    created_at: string;
                    target_user_id?: number | null;
                }[] = [];
                try {
                    const scRes = await fetch('/api/v1/service-calls?status=pending&limit=80', {
                        headers: getAuthHeaders(),
                        cache: 'no-store',
                    });
                    if (scRes.ok) {
                        const raw = await scRes.json();
                        scRows = Array.isArray(raw) ? raw : [];
                    }
                } catch {
                    /* ignore */
                }

                const callTableStatus = (ct: string): 'billing' | 'waiting' => {
                    const b =
                        ct === 'request_bill' ||
                        ct === 'request_bill_card' ||
                        ct === 'request_bill_cash';
                    return b ? 'billing' : 'waiting';
                };

                const nextPending: Record<number, ServiceCallMeta> = {};
                const callOverlay: Record<number, 'billing' | 'waiting'> = {};
                const noTableCashierCalls: CashierNoTableCall[] = [];
                if (user?.role === 'waiter') {
                    for (const c of scRows) {
                        if (c.table_id != null) continue;
                        if (c.target_user_id == null) continue;
                        if (Number(c.target_user_id) !== Number(user?.id)) continue;
                        const scid = Number(c.id);
                        if (!Number.isFinite(scid)) continue;
                        noTableCashierCalls.push({
                            serviceCallId: scid,
                            created_at: c.created_at,
                        });
                    }
                }
                setCashierNoTableCalls(noTableCashierCalls);

                for (const c of scRows) {
                    if (c.table_id == null) continue;
                    const tid = Number(c.table_id);
                    if (!Number.isFinite(tid) || tid <= 0) continue;
                    const tbl = fetchedTables.find((x: TableRow) => x.id === tid);
                    if (!tbl?.active_session_id) continue;
                    const ct = String(c.call_type ?? '');
                    if (
                        user?.role === 'waiter' &&
                        c.target_user_id != null &&
                        Number(c.target_user_id) !== Number(user?.id)
                    ) {
                        continue;
                    }
                    if (!waiterShouldApplyServiceCallOverlay(user, tbl, ct)) continue;
                    callOverlay[tid] = callTableStatus(ct);
                    nextPending[tid] = {
                        serviceCallId: Number(c.id),
                        assignedWaiterId: tbl.waiter_id != null ? Number(tbl.waiter_id) : null,
                        createdAtMs: new Date(c.created_at).getTime(),
                    };
                }
                setPendingServiceCalls(nextPending);

                setTableStatuses((prev) => {
                    const newStatuses = { ...prev };
                    fetchedTables.forEach((t: TableRow) => {
                        const current = newStatuses[t.id];
                        if (t.active_session_id) {
                            if (current !== 'billing' && current !== 'ready' && current !== 'waiting') {
                                newStatuses[t.id] = 'occupied';
                            }
                        } else {
                            newStatuses[t.id] = 'empty';
                        }
                    });
                    Object.entries(callOverlay).forEach(([tidStr, st]) => {
                        newStatuses[Number(tidStr)] = st;
                    });
                    return newStatuses;
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout, user]);

    const completeCashierNoTableCall = useCallback(
        async (rawId: number | string) => {
            const sid = Number(rawId);
            if (!Number.isFinite(sid) || sid <= 0) {
                toast.error(t('waiter.toast_invalid_call'));
                return;
            }
            if (cashierNoTableCompleteLock.current) return;
            cashierNoTableCompleteLock.current = true;

            const snapshot = cashierNoTableCallsRef.current.slice();
            setCashierNoTableCalls((prev) => prev.filter((x) => Number(x.serviceCallId) !== sid));

            try {
                const res = await fetch(`/api/v1/service-calls/${sid}/status`, {
                    method: 'PATCH',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'completed' }),
                });
                if (res.status === 401) {
                    logout();
                    setCashierNoTableCalls(snapshot);
                    return;
                }
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.error || t('waiter.toast_call_failed'));
                    setCashierNoTableCalls(snapshot);
                    return;
                }
                toast.success(t('waiter.toast_call_done'));
                void loadTables(true);
            } catch {
                toast.error(t('waiter.toast_connection_error'));
                setCashierNoTableCalls(snapshot);
            } finally {
                cashierNoTableCompleteLock.current = false;
            }
        },
        [getAuthHeaders, loadTables, logout, t]
    );

    // WebSocket Integration
    useEffect(() => {
        if (!tenantId || !user?.id) return;
        
        socketRef.current = io({
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            auth: token ? { token } : {},
        });

        const socket = socketRef.current;

        socket.on('connect', () => {
            socket.emit('join:tenant', tenantId);
            socket.emit('join:waiter', { tenantId, userId: Number(user?.id) });
        });

        socket.on('order:ready', (d: any) => {
            if (d.orderType === 'dine_in') {
                const table = tables.find(t => t.name === d.tableName || String(t.id) === String(d.tableId));
                if (table) {
                    setTableStatuses(prev => ({ ...prev, [table.id]: 'ready' }));
                    setTableReadyTimes(prev => ({ ...prev, [table.id]: Date.now() }));
                    setPartialReadyItems(prev => { const next={...prev}; delete next[table.id]; return next; });
                }
                toast.success(tpl(t, 'waiter.toast_table_ready', { name: d.tableName || '?' }), { icon: '🍽️', duration: 8000 });
                void playNotification('item_ready');
                void fetchReadyOrders();
            }
        });

        socket.on('kitchen:item_partial_ready', (d: any) => {
            const table = tables.find(t => t.name === d.tableName || String(t.id) === String(d.tableId));
            if (!table) return;
            const readyProducts = d.items?.filter((i: any) => i.is_ready).map((i: any) => i.quantity + 'x ' + i.product_name) || [];
            if (readyProducts.length > 0) {
                setPartialReadyItems(prev => ({ ...prev, [table.id]: readyProducts }));
            } else {
                setPartialReadyItems(prev => { const next={...prev}; delete next[table.id]; return next; });
            }
        });

        socket.on('customer:service_call', (d: any) => {
            const table = tables.find(
                (t) => t.name === d.tableName || String(t.id) === String(d.tableId)
            );
            const ct = String(d.callType ?? '');
            /** Sadece kasiyer → masasız hedef çağrıda hedef olmayan garson görmesin */
            const isCashierNoTableCall =
                d.fromCashier === true &&
                (d.tableId == null || d.tableId === undefined) &&
                d.serviceCallId != null;
            if (
                isCashierNoTableCall &&
                user?.role === 'waiter' &&
                d.targetWaiterId != null &&
                Number(d.targetWaiterId) !== Number(user?.id)
            ) {
                return;
            }
            if (
                d.fromCashier &&
                (d.tableId == null || d.tableId === undefined) &&
                d.serviceCallId != null
            ) {
                setCashierNoTableCalls((prev) => {
                    const sid = Number(d.serviceCallId);
                    if (!Number.isFinite(sid) || prev.some((x) => Number(x.serviceCallId) === sid)) return prev;
                    return [
                        ...prev,
                        {
                            serviceCallId: sid,
                            created_at:
                                typeof d.createdAt === 'string' && d.createdAt
                                    ? d.createdAt
                                    : new Date().toISOString(),
                        },
                    ];
                });
            }
            if (table && !waiterShouldApplyServiceCallOverlay(user, table, ct)) {
                return;
            }
            if (table) {
                const status =
                    d.callType === 'request_bill' ||
                    d.callType === 'request_bill_card' ||
                    d.callType === 'request_bill_cash'
                        ? 'billing'
                        : 'waiting';
                setTableStatuses((prev) => ({ ...prev, [table.id]: status }));
                const createdMs = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
                const assignee =
                    d.targetWaiterId != null && Number.isFinite(Number(d.targetWaiterId))
                        ? Number(d.targetWaiterId)
                        : d.waiterId != null && Number.isFinite(Number(d.waiterId))
                          ? Number(d.waiterId)
                          : null;
                setPendingServiceCalls((prev) => ({
                    ...prev,
                    [table.id]: {
                        serviceCallId: Number(d.serviceCallId),
                        assignedWaiterId: assignee,
                        createdAtMs: Number.isFinite(createdMs) ? createdMs : Date.now(),
                    },
                }));
            }
            const title = d.callType?.includes('bill') ? t('waiter.socket_bill') : t('waiter.socket_waiter');
            const place =
                d.fromCashier && (d.tableId == null || d.tableId === undefined)
                    ? t('waiter.socket_place_cashier')
                    : tpl(t, 'waiter.socket_place_table', { name: d.tableName ?? '?' });
            const notifySound =
                d.targetWaiterId == null ||
                !Number.isFinite(Number(d.targetWaiterId)) ||
                Number(d.targetWaiterId) === Number(user?.id);
            if (notifySound) {
                toast(`${title}: ${place}`, { icon: '🔔', duration: 6000 });
                void playNotification('service_call');
            }
        });

        socket.on('service_call:updated', (d: any) => {
            const scId = d.id != null ? Number(d.id) : NaN;
            if (Number.isFinite(scId)) {
                setCashierNoTableCalls((prev) => prev.filter((x) => Number(x.serviceCallId) !== scId));
            }
            const tid = d.tableId != null ? Number(d.tableId) : null;
            if (tid == null || !Number.isFinite(tid)) return;
            setPendingServiceCalls((prev) => {
                const next = { ...prev };
                delete next[tid];
                return next;
            });
            const st = String(d.status ?? '');
            if (st === 'completed' || st === 'in_progress' || st === 'seen') {
                setTableStatuses((prev) => {
                    if (prev[tid] === 'waiting' || prev[tid] === 'billing') {
                        return { ...prev, [tid]: 'occupied' };
                    }
                    return prev;
                });
            }
        });

        socket.on('customer:order_request', (d: any) => {
            const oid = d.orderId;
            if (oid == null) return;
            const assigned =
                d.assignedWaiterId != null && Number.isFinite(Number(d.assignedWaiterId))
                    ? Number(d.assignedWaiterId)
                    : null;
            setQrQueue((q) => {
                if (q.some((x) => x.orderId === oid)) return q;
                const tid = d.tableId != null && Number.isFinite(Number(d.tableId)) ? Number(d.tableId) : null;
                return [
                    ...q,
                    {
                        orderId: oid,
                        tableId: tid,
                        tableName: d.tableName || t('waiter.table_fallback'),
                        customerName: d.customerName,
                        totalAmount: d.totalAmount,
                        assignedWaiterId: assigned,
                    },
                ];
            });
            const forMe =
                assigned == null || !Number.isFinite(assigned) || assigned === Number(user?.id);
            if (forMe) {
                void playNotification('new_order');
                toast(
                    tpl(t, 'waiter.qr_assigned_toast', {
                        table: String(d.tableName || t('waiter.table_fallback')),
                    }),
                    { icon: '📱', duration: 6500 },
                );
            }
        });

        socket.on('order:status_changed', (d: any) => {
            if (d.status && d.status !== 'pending') {
                setQrQueue(q => q.filter(x => x.orderId !== d.orderId));
            }
        });

        return () => { socket.disconnect(); };
    }, [tenantId, user, token, tables, t]);

    // Interval refresh
    useEffect(() => {
        const iv = setInterval(() => loadTables(true), 30000);
        return () => clearInterval(iv);
    }, [loadTables]);

    // Filter Logic
    const sections = useMemo(() => {
        const names = new Set<string>();
        tables.forEach((x) => names.add(x.section_name || t('waiter.section_general')));
        return ['all', ...Array.from(names).sort()];
    }, [tables, t]);

    const filteredProducts = useMemo(() => {
        let list = products;
        if (activeCategoryId) list = list.filter(p => p.categoryId === activeCategoryId);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => p.displayName.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
        }
        return list;
    }, [products, activeCategoryId, searchQuery]);

    const cartQtyTotal = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

    const pendingQrForSelectedTable = useMemo((): QrRequest | null => {
        if (!selectedTable?.id) return null;
        const tid = selectedTable.id;
        const byId = qrQueue.find((q) => q.tableId != null && Number(q.tableId) === tid);
        if (byId) return byId;
        return qrQueue.find((q) => q.tableName === selectedTable.name) ?? null;
    }, [qrQueue, selectedTable?.id, selectedTable?.name]);

    const importQrOrderLinesToCart = useCallback(
        async (q: QrRequest) => {
            const tid =
                q.tableId != null && Number.isFinite(Number(q.tableId))
                    ? Number(q.tableId)
                    : tables.find((tb) => tb.name === q.tableName)?.id;
            if (tid == null || !Number.isFinite(Number(tid))) {
                toast.error(t('waiter.qr_import_fail'));
                return;
            }
            setQrImportBusy(true);
            try {
                const qs = new URLSearchParams({
                    status: 'pending',
                    source: 'customer_qr',
                    tableId: String(tid),
                    limit: '15',
                    offset: '0',
                });
                const res = await fetch(`/api/v1/orders?${qs}`, { headers: getAuthHeaders() });
                if (!res.ok) throw new Error('fetch');
                const orders = (await res.json()) as Array<{
                    id: number;
                    items?: Array<{
                        product_id: number;
                        variant_id?: number | null;
                        quantity: number | string;
                        modifiers?: unknown;
                    }>;
                }>;
                const order = orders.find((o) => o.id === q.orderId) ?? orders[0];
                if (!order?.items?.length) {
                    toast.error(t('waiter.qr_import_fail'));
                    return;
                }
                let skipped = 0;
                for (const line of order.items) {
                    const pid = Number(line.product_id);
                    const product = products.find((p) => p.id === pid);
                    if (!product) {
                        skipped++;
                        continue;
                    }
                    const vid = line.variant_id != null ? Number(line.variant_id) : NaN;
                    const variant =
                        Number.isFinite(vid) && vid > 0
                            ? product.variants?.find((v) => v.id === vid) ?? null
                            : null;
                    const lineMods: PosModifier[] = [];
                    try {
                        const raw =
                            typeof line.modifiers === 'string'
                                ? JSON.parse(line.modifiers)
                                : line.modifiers;
                        if (Array.isArray(raw)) {
                            for (const m of raw) {
                                const mid = Number((m as { id?: number }).id);
                                if (!Number.isFinite(mid)) continue;
                                const mod = modifiers.find((x) => x.id === mid);
                                if (mod) lineMods.push(mod);
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                    addToCart(product, variant || null, lineMods);
                    const newCart = usePosStore.getState().cart;
                    const last = newCart[newCart.length - 1];
                    const qn = Math.max(1, Math.floor(Number(line.quantity)) || 1);
                    if (last && qn > 1) {
                        updateQty(last.cartId, qn);
                    }
                }
                if (skipped > 0) {
                    toast(t('waiter.qr_import_partial'));
                } else {
                    toast.success(t('waiter.qr_import_ok'));
                }
                setOrderCartOpen(true);
            } catch {
                toast.error(t('waiter.qr_import_fail'));
            } finally {
                setQrImportBusy(false);
            }
        },
        [products, modifiers, tables, getAuthHeaders, addToCart, updateQty, t]
    );

    /** Çağrılar sekmesi rozeti: bölge garson + hesap + kasiyer masasız hedef çağrı */
    const messagesHubBadgeCount = useMemo(() => {
        let n = cashierNoTableCalls.length + qrQueue.length;
        for (const t of tables) {
            const s = tableStatuses[t.id];
            if (s === 'billing') n++;
            else if (s === 'waiting' && isTableInWaiterAssignedSection(user, t)) n++;
        }
        return n;
    }, [tables, tableStatuses, user, cashierNoTableCalls.length, qrQueue.length]);

    useEffect(() => {
        if (view !== 'order') setOrderCartOpen(false);
    }, [view]);

    useEffect(() => {
        if (view !== 'order' || !orderCartOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [orderCartOpen, view]);


    // Actions
    const onTableAction = async (tbl: TableRow) => {
        const st = tableStatuses[tbl.id] ?? 'empty';
        const pending = pendingServiceCalls[tbl.id];
        if ((st === 'waiting' || st === 'billing') && pending) {
            const uid = Number(user?.id);
            const assignee = pending.assignedWaiterId;
            const elapsed = Date.now() - pending.createdAtMs;
            const canTakeover = assignee == null || uid === assignee || elapsed >= 60_000;
            if (!canTakeover) {
                toast.error(
                    tpl(t, 'waiter.toast_takeover_wait', { sec: Math.ceil((60_000 - elapsed) / 1000) })
                );
                return;
            }
            try {
                const res = await fetch(`/api/v1/service-calls/${pending.serviceCallId}/status`, {
                    method: 'PATCH',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'in_progress' }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.error || t('waiter.toast_call_claim_failed'));
                    return;
                }
                setPendingServiceCalls((prev) => {
                    const n = { ...prev };
                    delete n[tbl.id];
                    return n;
                });
                setTableStatuses((prev) => ({ ...prev, [tbl.id]: 'occupied' }));
            } catch {
                toast.error(t('waiter.toast_connection_error'));
                return;
            }
        }

        const busy = tbl.active_session_id != null && Number(tbl.active_session_id) !== 0;
        if (busy) {
            setSelectedTable({
                id: tbl.id,
                name: tbl.name,
                sectionName: tbl.section_name || t('waiter.section_general'),
                sessionId: tbl.active_session_id,
            });
            setOrderType('dine_in');
            clearCart();
            setView('order');
        } else {
            setOpenModalTable(tbl);
            setOpenForm({ guestCount: '2' });
            setIdentifiedCustomer(null);
        }
    };

    const submitOpenTable = async () => {
        if (!openModalTable) return;
        try {
            const res = await fetch(`/api/v1/tables/${openModalTable.id}/open`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: identifiedCustomer?.id ?? null,
                    guestName: identifiedCustomer?.name?.trim() || null,
                    guestCount: Number(openForm.guestCount) || 1,
                    waiterId: Number(user?.id)
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setOpenModalTable(null);
                setSelectedTable({
                    id: openModalTable.id,
                    name: openModalTable.name,
                    sectionName: openModalTable.section_name || t('waiter.section_general'),
                    sessionId: data.sessionId
                });
                setOrderType('dine_in');
                clearCart();
                setView('order');
                void loadTables(true);
            }
        } catch (e) { toast.error(t('waiter.toast_table_open_failed')); }
    };

    const handleSendOrder = async () => {
        if (cart.length === 0) return;
        setIsSubmittingOrder(true);
        try {
            const res = await submitRemoteOrder({ activeCustomer: identifiedCustomer });
            if (res.ok) {
                toast.success(t('waiter.toast_kitchen_sent'));
                setOrderCartOpen(false);
                setView('floor');
                void loadTables(true);
            } else {
                toast.error(res.error || t('waiter.toast_send_failed'));
            }
        } catch (e) { toast.error(t('waiter.toast_connection_error')); }
        finally { setIsSubmittingOrder(false); }
    };

    const openQrAdisyonModal = (q: QrRequest) => {
        setQrAdisyonGuestName(String(q.customerName || '').trim());
        setQrAdisyonAllergy('');
        setQrAdisyonModal(q);
    };

    const submitQrAdisyon = async () => {
        if (!qrAdisyonModal) return;
        setQrAdisyonBusy(true);
        try {
            const payload: { guestName?: string; allergyNote?: string } = {};
            const gn = qrAdisyonGuestName.trim();
            const al = qrAdisyonAllergy.trim();
            if (gn) payload.guestName = gn;
            if (al) payload.allergyNote = al;
            const res = await fetch(`/api/v1/orders/${qrAdisyonModal.orderId}/approve-qr`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const oid = qrAdisyonModal.orderId;
                setQrAdisyonModal(null);
                setQrQueue((q) => q.filter((x) => x.orderId !== oid));
                void loadTables(true);
                toast.success(t('waiter.qr_adisyon_ok'));
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error((err as { error?: string }).error || t('waiter.toast_approve_failed'));
            }
        } catch {
            toast.error(t('waiter.toast_approve_failed'));
        } finally {
            setQrAdisyonBusy(false);
        }
    };

    const rejectQr = async (orderId: number) => {
        try {
            const res = await fetch(`/api/v1/orders/${orderId}/reject-qr`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: '{}'
            });
            if (res.ok) {
                setQrQueue(q => q.filter(x => x.orderId !== orderId));
            }
        } catch (e) { toast.error(t('waiter.toast_reject_failed')); }
    };

    const renderFloorView = () => (
        <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col p-3 sm:p-6 overflow-hidden mt-0 sm:mt-2 min-h-0"
        >
            <div className="flex items-center justify-between mb-4 sm:mb-8">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1 -mx-1 px-1 touch-pan-x">
                    <LayoutGroup id="sections">
                        {sections.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setSectionTab(s)}
                                className={`relative shrink-0 rounded-xl sm:rounded-2xl min-h-[44px] px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all no-tap-highlight touch-manipulation ${
                                    sectionTab === s ? 'text-white' : 'text-slate-500 bg-white/5 border border-white/5'
                                }`}
                            >
                                {sectionTab === s && (
                                    <motion.div 
                                        layoutId="active-sec"
                                        className="absolute inset-0 bg-[#e91e63] rounded-2xl shadow-xl shadow-pink-600/20"
                                    />
                                )}
                                <span className="relative z-10">{s === 'all' ? t('waiter.section_all') : s}</span>
                            </button>
                        ))}
                    </LayoutGroup>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar min-h-0 overscroll-contain">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-6">
                    {tables.filter(tbl => sectionTab === 'all' || (tbl.section_name || t('waiter.section_general')) === sectionTab).map((tbl) => (
                        <TableCard 
                            key={`table-${tbl.id}`} 
                            table={tbl} 
                            status={tableStatuses[tbl.id] || 'empty'}
                            readyAt={tableReadyTimes[tbl.id]}
                            partialItems={partialReadyItems[tbl.id]}
                            onClick={() => void onTableAction(tbl)}
                            serviceCallMeta={pendingServiceCalls[tbl.id] ?? null}
                            currentUserId={user?.id != null ? Number(user.id) : undefined}
                            onServe={(e) => {
                                e.stopPropagation();
                                if (settings?.pickupSecurity?.requirePIN) {
                                    setPinModal({ open: true, tableId: tbl.id });
                                } else {
                                    void handleServe(tbl.id);
                                }
                            }}
                        />
                    ))}
                </div>
                {tables.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-64 opacity-20">
                        <FiLayers size={64} className="mb-4 text-slate-500" />
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">{t('waiter.empty_no_tables')}</p>
                    </div>
                )}
            </div>
        </motion.div>
    );

    const renderOrderView = () => (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="flex-1 flex flex-col p-3 sm:p-6 h-full min-h-0 overflow-hidden relative"
        >
            {/* Catalog Section — tam genişlik; sepet FAB + çekmece */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[24px] sm:rounded-[48px] overflow-hidden shadow-2xl relative">
                <div className="p-4 sm:p-8 border-b border-white/5 space-y-4 sm:space-y-8 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                            <button type="button" onClick={() => setView('floor')} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 glass rounded-[18px] sm:rounded-[20px] flex items-center justify-center text-white/40 hover:text-white hover:bg-[#e91e63]/20 hover:border-[#e91e63]/30 transition-all touch-manipulation">
                                <FiChevronLeft size={24} />
                            </button>
                            <div className="min-w-0">
                                <h3 className="text-lg sm:text-2xl font-black italic text-white tracking-tighter truncate">
                                    {t('waiter.table_prefix')}{' '}
                                    <span className="text-[#e91e63] font-black">{usePosStore.getState().selectedTable?.name}</span>
                                </h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> {t('waiter.order_title')}
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-3 glass px-5 py-3 rounded-2xl border-white/5">
                            <FiActivity size={18} className="text-[#e91e63]" />
                            <span className="text-[10px] font-black text-white italic">WAITER {user?.id}</span>
                        </div>
                    </div>

                    {pendingQrForSelectedTable && (
                        <div className="rounded-2xl border border-[#e91e63]/35 bg-[#e91e63]/10 p-4 space-y-3">
                            <p className="text-[11px] font-bold text-white/90 leading-snug">{t('waiter.qr_order_screen_banner')}</p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={qrImportBusy}
                                    onClick={() => void importQrOrderLinesToCart(pendingQrForSelectedTable)}
                                    className="min-h-[44px] flex-1 rounded-xl bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/15 disabled:opacity-50 sm:flex-none"
                                >
                                    {qrImportBusy ? '…' : t('waiter.qr_pull_to_cart')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openQrAdisyonModal(pendingQrForSelectedTable)}
                                    className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 sm:flex-none"
                                >
                                    {t('waiter.qr_add_to_tab')}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="relative group">
                        <FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#e91e63] transition-colors" size={18} />
                        <input 
                            type="text" 
                            placeholder={t('waiter.search_menu')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl sm:rounded-3xl py-4 sm:py-5 pl-14 sm:pl-16 pr-4 sm:pr-8 text-sm font-black focus:border-[#e91e63]/30 focus:bg-white/[0.05] outline-none transition-all placeholder:text-slate-600 tracking-wide min-h-[48px] text-base sm:text-sm"
                        />
                    </div>

                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 touch-pan-x -mx-1 px-1">
                        <LayoutGroup id="catalog-cats">
                            <button 
                                type="button"
                                onClick={() => setActiveCategoryId(null)}
                                className={`relative shrink-0 min-h-[44px] px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all touch-manipulation ${activeCategoryId === null ? 'text-white' : 'text-slate-500 bg-white/5 border border-white/5'}`}
                            >
                                {activeCategoryId === null && (
                                    <motion.div layoutId="cat-active" className="absolute inset-0 bg-emerald-600 rounded-xl" />
                                )}
                                <span className="relative z-10">{t('waiter.cat_all')}</span>
                            </button>
                            {categories.map(cat => (
                                <button 
                                    type="button"
                                    key={cat.id}
                                    onClick={() => setActiveCategoryId(cat.id)}
                                    className={`relative shrink-0 min-h-[44px] px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all touch-manipulation ${activeCategoryId === cat.id ? 'text-white' : 'text-slate-500 bg-white/5 border border-white/5'}`}
                                >
                                    {activeCategoryId === cat.id && (
                                        <motion.div layoutId="cat-active" className="absolute inset-0 bg-emerald-600 rounded-xl" />
                                    )}
                                    <span className="relative z-10">{cat.displayName.toUpperCase()}</span>
                                </button>
                            ))}
                        </LayoutGroup>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-6 no-scrollbar custom-scrollbar overscroll-contain">
                    {filteredProducts.map(p => (
                        <motion.button 
                            key={`prod-${p.id}`}
                            type="button"
                            whileHover={{ scale: 1.05, y: -5 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onProductTap(p)}
                            className="relative group bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-[20px] sm:rounded-[32px] p-4 sm:p-6 text-left min-h-[120px] sm:h-40 sm:min-h-0 flex flex-col justify-between transition-all touch-manipulation active:scale-[0.98]"
                        >
                            <div className="flex flex-col">
                                <span className="text-[12px] font-black text-white leading-tight uppercase group-hover:text-[#e91e63] transition-colors line-clamp-3">
                                    {p.displayName}
                                </span>
                                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-2">{t('waiter.product_kitchen_line')}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-lg font-black text-white italic tracking-tighter">
                                    {currency}{Math.round(Number(p.basePrice))}
                                </span>
                                <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center text-white/20 group-hover:bg-[#e91e63] group-hover:text-white group-hover:shadow-lg group-hover:shadow-pink-600/30 transition-all border-white/5">
                                    <FiPlus size={20} />
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>
            </div>
        </motion.div>
    );

    const renderStatsView = () => (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 p-4 sm:p-8 overflow-y-auto no-scrollbar min-h-0 overscroll-contain"
        >
            <div className="max-w-4xl mx-auto space-y-10">
                <div className="flex items-center gap-6 mb-12">
                    <button onClick={() => setView('floor')} className="w-16 h-16 glass rounded-[24px] flex items-center justify-center text-white/40 hover:text-white transition-all">
                        <FiChevronLeft size={28} />
                    </button>
                    <div>
                        <h2 className="text-4xl font-black text-white italic tracking-tighter">
                            {t('waiter.stats_title_lead')}{' '}
                            <span className="text-[#e91e63]">{t('waiter.stats_title_accent')}</span>
                        </h2>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-[0.4em] mt-2">
                            {tpl(t, 'waiter.stats_sub', { id: user?.id ?? '—' })}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { label: t('waiter.stats_orders'), val: statsData?.totalOrders || '24', icon: <FiShoppingBag />, color: 'text-blue-400' },
                        { label: t('waiter.stats_tables'), val: statsData?.servedTables || '12', icon: <FiLayout />, color: 'text-[#e91e63]' },
                        { label: t('waiter.stats_avg'), val: currency + (statsData?.avgOrder || '480'), icon: <FiTrendingUp />, color: 'text-emerald-400' },
                    ].map((s, idx) => (
                        <div key={idx} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-10 rounded-[48px] shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 text-white/10 group-hover:text-white/20 transition-all">
                                {React.cloneElement(s.icon as any, { size: 64 })}
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-4">{s.label}</span>
                            <span className={`text-5xl font-black tracking-tighter italic ${s.color}`}>{s.val}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[48px] p-12 overflow-hidden relative">
                    <div className="flex items-center justify-between mb-10">
                        <h3 className="text-xl font-black italic text-white tracking-tighter">{t('waiter.stats_top')}</h3>
                        <FiTrendingUp className="text-[#e91e63]" size={24} />
                    </div>
                    <div className="space-y-6">
                        {[
                            { name: 'Napoli Pizza', qty: 42, growth: '+12%' },
                            { name: 'Coke Zero 0.33', qty: 38, growth: '+5%' },
                            { name: 'Tiramisu Klasik', qty: 15, growth: '+2%' },
                        ].map((p, idx) => (
                            <div key={idx} className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/5 rounded-[24px] hover:bg-white/[0.08] transition-all">
                                <div className="flex items-center gap-6">
                                    <span className="text-xl font-black text-slate-700 italic">0{idx+1}</span>
                                    <span className="text-sm font-black text-white uppercase tracking-widest">{p.name}</span>
                                </div>
                                <div className="flex items-center gap-10">
                                    <div className="flex flex-col items-end">
                                        <span className="text-xl font-black text-white">{p.qty}x</span>
                                        <span className="text-[9px] font-black text-emerald-500">{p.growth}</span>
                                    </div>
                                    <div className="w-12 h-1 px-8 bg-slate-800 rounded-full relative overflow-hidden hidden sm:block">
                                        <div className="absolute inset-y-0 left-0 bg-[#e91e63]" style={{ width: `${100 - (idx * 25)}%` }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );

    const renderMessagesView = () => {
        const zoneGarsonTables = tables.filter(
            (t) => tableStatuses[t.id] === 'waiting' && isTableInWaiterAssignedSection(user, t)
        );
        const hesapKasaTables = tables.filter((t) => tableStatuses[t.id] === 'billing');

        const callCard = (tbl: TableRow, mode: 'garson' | 'hesap') => {
            const billing = mode === 'hesap';
            return (
                <motion.div
                    key={`${mode}-${tbl.id}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-slate-900/60 backdrop-blur-3xl border border-white/10 p-8 rounded-[48px] flex items-center justify-between group overflow-hidden relative"
                >
                    <div className={`absolute top-0 left-0 w-1 h-full ${billing ? 'bg-blue-500' : 'bg-amber-500'}`} />
                    <div className="flex items-center gap-6 min-w-0">
                        <div
                            className={`relative w-16 h-16 shrink-0 rounded-[24px] flex items-center justify-center shadow-xl border ${
                                billing ? 'bg-blue-600/10 text-blue-500 border-blue-500/10' : 'bg-amber-600/10 text-amber-500 border-amber-500/10'
                            }`}
                        >
                            {billing ? <FiCreditCard size={28} /> : <FiBell size={28} className="animate-pulse-fast" />}
                            <div
                                className={`absolute -inset-2 border-2 rounded-[28px] animate-ping-slow ${
                                    billing ? 'border-blue-500/30' : 'border-amber-500/30'
                                }`}
                            />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span
                                className={`text-[10px] font-black uppercase tracking-[0.4em] mb-1.5 ${
                                    billing ? 'text-blue-500' : 'text-amber-500'
                                }`}
                            >
                                {billing ? t('waiter.call_card_billing') : t('waiter.call_card_zone')}
                            </span>
                            <span className="text-2xl font-black text-white italic tracking-tighter uppercase truncate leading-none mb-1">
                                {tpl(t, 'waiter.call_table', { name: tbl.name })}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                                {tbl.section_name ? `${tbl.section_name} · ` : ''}
                                {billing ? t('waiter.call_pay_request') : t('waiter.call_service_help')}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setTableStatuses((prev) => ({ ...prev, [tbl.id]: 'occupied' }))}
                        className="w-16 h-16 shrink-0 glass rounded-[24px] flex items-center justify-center text-slate-600 hover:text-emerald-500 transition-all border-white/5 active:scale-90"
                    >
                        <FiCheckCircle size={28} />
                    </button>
                </motion.div>
            );
        };

        return (
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 p-4 sm:p-8 overflow-y-auto no-scrollbar min-h-0 overscroll-contain"
            >
                <div className="max-w-4xl mx-auto space-y-12 pb-20">
                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <div className="w-1.5 h-1.5 bg-[#e91e63] rounded-full animate-pulse-fast" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">
                                    {t('waiter.qr_calls_section_title')}
                                </h3>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 tabular-nums">{qrQueue.length}</span>
                        </div>
                        {qrQueue.length === 0 ? (
                            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[40px] py-16 text-center">
                                <FiShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-15" />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">
                                    {t('waiter.qr_calls_section_empty')}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {qrQueue.map((q) => (
                                    <div
                                        key={q.orderId}
                                        className="flex flex-col gap-4 rounded-[32px] border border-[#e91e63]/25 bg-[#e91e63]/5 p-5 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex min-w-0 items-start gap-4">
                                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#e91e63]/20 text-[#e91e63]">
                                                <FiShoppingBag size={26} />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-black uppercase tracking-[0.35em] text-[#e91e63]">
                                                    {t('waiter.qr_tablet_order_badge')}
                                                </span>
                                                <p className="mt-1 break-words text-lg font-black uppercase italic tracking-tighter text-white">
                                                    {`${q.tableName} · ${q.customerName || t('waiter.guest_upper')} · ${currency}${Number(q.totalAmount ?? 0).toFixed(0)}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConfirm({
                                                        title: t('waiter.qr_reject_title'),
                                                        description: t('waiter.qr_reject_desc'),
                                                        confirmText: t('waiter.qr_reject_confirm'),
                                                        type: 'danger',
                                                        onConfirm: () => void rejectQr(q.orderId),
                                                    })
                                                }
                                                aria-label={t('waiter.qr_reject_title')}
                                                className="min-h-[48px] min-w-[48px] rounded-2xl border border-white/10 bg-white/5 px-3 text-rose-400 hover:bg-rose-500 hover:text-white"
                                            >
                                                <FiX size={22} className="mx-auto" />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={qrImportBusy}
                                                onClick={() => void importQrOrderLinesToCart(q)}
                                                className="min-h-[48px] rounded-2xl border border-white/15 bg-white/10 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/15 disabled:opacity-50"
                                            >
                                                {t('waiter.qr_pull_to_cart')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openQrAdisyonModal(q)}
                                                className="min-h-[48px] rounded-2xl bg-emerald-600 px-5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
                                            >
                                                {t('waiter.qr_add_to_tab')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse-fast" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">{t('waiter.calls_cashier_no_table')}</h3>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 tabular-nums">{cashierNoTableCalls.length}</span>
                        </div>
                        {cashierNoTableCalls.length === 0 ? (
                            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[40px] py-16 text-center">
                                <FiBriefcase className="w-12 h-12 mx-auto mb-3 opacity-15" />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">
                                    {t('waiter.calls_cashier_empty')}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {cashierNoTableCalls.map((c) => (
                                    <motion.div
                                        key={c.serviceCallId}
                                        role="button"
                                        tabIndex={0}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        onClick={() => void completeCashierNoTableCall(c.serviceCallId)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                void completeCashierNoTableCall(c.serviceCallId);
                                            }
                                        }}
                                        title={t('waiter.calls_card_done')}
                                        className="bg-slate-900/60 backdrop-blur-3xl border border-white/10 p-8 rounded-[48px] flex items-center justify-between group overflow-hidden relative cursor-pointer touch-manipulation active:scale-[0.99] select-none"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                                        <div className="flex items-center gap-6 min-w-0">
                                            <div className="relative w-16 h-16 shrink-0 rounded-[24px] flex items-center justify-center shadow-xl border bg-rose-600/10 text-rose-500 border-rose-500/10">
                                                <FiBriefcase size={28} className="animate-pulse-fast" />
                                                <div className="absolute -inset-2 border-2 rounded-[28px] animate-ping-slow border-rose-500/30" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-black uppercase tracking-[0.4em] mb-1.5 text-rose-500">
                                                    {t('waiter.calls_cashier_target')}
                                                </span>
                                                <span className="text-2xl font-black text-white italic tracking-tighter uppercase truncate leading-none mb-1">
                                                    {t('waiter.calls_no_table_call')}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                                                    {tpl(t, 'waiter.calls_from_cashier', { min: formatElapsedTime(c.created_at) })}
                                                </span>
                                            </div>
                                        </div>
                                        <div
                                            className="w-16 h-16 shrink-0 glass rounded-[24px] flex items-center justify-center text-emerald-500/90 border-white/5 pointer-events-none"
                                            aria-hidden
                                        >
                                            <FiCheckCircle size={28} />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse-fast" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">{t('waiter.calls_zone')}</h3>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 tabular-nums">{zoneGarsonTables.length}</span>
                        </div>
                        {zoneGarsonTables.length === 0 ? (
                            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[40px] py-16 text-center">
                                <FiBell className="w-12 h-12 mx-auto mb-3 opacity-15" />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">
                                    {t('waiter.calls_zone_empty')}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{zoneGarsonTables.map((t) => callCard(t, 'garson'))}</div>
                        )}
                    </section>

                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse-fast" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">{t('waiter.calls_billing')}</h3>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 tabular-nums">{hesapKasaTables.length}</span>
                        </div>
                        {hesapKasaTables.length === 0 ? (
                            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[40px] py-16 text-center">
                                <FiCreditCard className="w-12 h-12 mx-auto mb-3 opacity-15" />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">
                                    {t('waiter.calls_billing_empty')}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{hesapKasaTables.map((t) => callCard(t, 'hesap'))}</div>
                        )}
                    </section>
                </div>
            </motion.div>
        );
    };
    const renderReadyOrdersView = () => {
        return (
            <>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col min-h-0 bg-[#060a12] font-sans"
                >
                    <header className="shrink-0 bg-[#0b1120] border-b border-white/5 flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3 shadow-2xl">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e91e63] to-pink-600 flex items-center justify-center text-white shadow-md shrink-0">
                                <FiGrid className="w-[18px] h-[18px]" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xs sm:text-base font-black text-white italic tracking-tight uppercase truncate">
                                    {t('waiter.ready_header')}
                                </h2>
                                <p className="text-[9px] font-bold text-slate-500 mt-0.5 truncate">
                                    {tpl(t, 'waiter.ready_count', { n: readySalonOrders.length })}
                                </p>
                            </div>
                        </div>
                        <div className="text-sm font-black text-white tabular-nums bg-white/5 px-2 py-1 rounded-lg border border-white/5 shrink-0">
                            {new Date().toLocaleTimeString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto overscroll-contain p-1.5 sm:p-3 min-h-0 no-scrollbar">
                        {readySalonOrders.length === 0 ? (
                            <div className="h-full min-h-[140px] flex flex-col items-center justify-center opacity-20 py-10">
                                <FiLayout className="w-12 h-12 mb-2" />
                                <span className="text-[11px] font-bold text-center px-4">{t('waiter.ready_none')}</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-2.5">
                                {readySalonOrders.map((o) => {
                                    const elapsed = formatElapsedTime(o.updated_at);
                                    const n = Array.isArray(o.items) ? o.items.length : 0;
                                    const urgent = elapsed > 10;
                                    const warn = elapsed > 5 && !urgent;
                                    const accent =
                                        urgent
                                            ? 'from-red-500 via-rose-500 to-red-600 shadow-[0_0_24px_-4px_rgba(239,68,68,0.35)]'
                                            : warn
                                              ? 'from-amber-400 via-orange-500 to-amber-600 shadow-[0_0_20px_-4px_rgba(245,158,11,0.25)]'
                                              : 'from-emerald-400 via-teal-500 to-emerald-600 shadow-[0_0_18px_-4px_rgba(52,211,153,0.2)]';
                                    const surface =
                                        urgent
                                            ? 'border-red-500/20 bg-gradient-to-br from-red-950/50 via-[#0c1018] to-[#080a0f]'
                                            : warn
                                              ? 'border-amber-500/15 bg-gradient-to-br from-amber-950/30 via-[#0c1018] to-[#080a0f]'
                                              : 'border-white/[0.07] bg-gradient-to-br from-slate-900/90 via-[#0c1018] to-[#07090d]';
                                    return (
                                        <motion.button
                                            key={o.id}
                                            type="button"
                                            layout
                                            whileHover={{ y: -2 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setReadyOrderDetail(o)}
                                            className={`group relative w-full text-left overflow-hidden rounded-2xl border touch-manipulation min-h-[96px] shadow-xl shadow-black/40 transition-[box-shadow,border-color] duration-200 hover:border-white/12 hover:shadow-2xl hover:shadow-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e91e63]/40 ${surface}`}
                                        >
                                            <div
                                                className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${accent}`}
                                                aria-hidden
                                            />
                                            <div
                                                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-60"
                                                aria-hidden
                                            />
                                            <div className="relative pl-3.5 pr-2.5 py-2.5 flex flex-col gap-1.5 min-h-[96px]">
                                                <div className="flex items-start justify-between gap-2 min-w-0">
                                                    <span
                                                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                                            urgent
                                                                ? 'bg-red-500/15 text-red-200 ring-1 ring-red-500/25'
                                                                : warn
                                                                  ? 'bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/20'
                                                                  : 'bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/15'
                                                        }`}
                                                    >
                                                        {urgent ? t('waiter.ready_badge_critical') : warn ? t('waiter.ready_badge_wait') : t('waiter.ready_badge_ok')}
                                                    </span>
                                                    <div
                                                        className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 backdrop-blur-sm tabular-nums ${
                                                            urgent
                                                                ? 'border-red-500/25 bg-red-500/10 text-red-100'
                                                                : warn
                                                                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-50'
                                                                  : 'border-emerald-500/15 bg-emerald-500/10 text-emerald-50'
                                                        }`}
                                                    >
                                                        <FiClock className="h-3 w-3 opacity-70" aria-hidden />
                                                        <span className="text-[13px] font-black leading-none">
                                                            {elapsed}
                                                            <span className="text-[9px] font-bold opacity-80 ml-0.5">{t('waiter.timer_min_short')}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="min-w-0 flex-1 flex items-center">
                                                    <span className="text-[15px] sm:text-base font-black text-white tracking-tight truncate leading-none">
                                                        {o.table_name || t('waiter.table_fallback')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-white/[0.06]">
                                                    <span className="text-[9px] font-mono font-semibold text-[#e91e63]/90">
                                                        #{o.id}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-400 tabular-nums">
                                                        {tpl(t, 'waiter.items_count', { n })}
                                                    </span>
                                                </div>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </>
        );
    };

    return (
        <div className="flex h-[100dvh] min-h-0 flex-col bg-[#020617] text-slate-200 font-sans overflow-hidden relative selection:bg-[#e91e63] selection:text-white touch-manipulation pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
            {/* Background Blobs */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <motion.div 
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0], x: [0, 50, 0], y: [0, 30, 0] }}
                    transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                    className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#e91e63]/5 blur-[120px]"
                />
                <motion.div 
                    animate={{ scale: [1, 1.5, 1], rotate: [0, -60, 0], x: [0, -40, 0], y: [0, -20, 0] }}
                    transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-600/5 blur-[150px]"
                />
            </div>

            {/* Header */}
            <header className="h-16 sm:h-24 shrink-0 border-b border-white/5 bg-[#020617]/40 backdrop-blur-3xl px-4 sm:px-10 flex items-center justify-between gap-3 z-40 relative">
                <div className="flex items-center gap-3 sm:gap-10 min-w-0">
                    <button 
                        type="button"
                        onClick={() => setIsMenuOpen(true)}
                        className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl sm:rounded-3xl glass flex items-center justify-center text-white hover:bg-[#e91e63]/20 hover:border-[#e91e63]/30 transition-all group touch-manipulation active:scale-95"
                    >
                        <div className="w-6 flex flex-col items-start gap-1.5 group-hover:gap-2 transition-all">
                            <div className="w-full h-0.5 bg-white rounded-full group-hover:bg-[#e91e63]" />
                            <div className="w-2/3 h-0.5 bg-white rounded-full group-hover:bg-[#e91e63]" />
                        </div>
                    </button>
                    <div className="flex flex-col min-w-0">
                        <h1 className="text-xl sm:text-3xl font-black text-white italic tracking-tighter uppercase leading-none select-none truncate">
                            Next<span className="text-[#e91e63]">POS</span>
                        </h1>
                        <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2 ml-0.5 min-w-0">
                            <span className="text-[10px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] sm:tracking-[0.35em] opacity-80 shrink-0">{t('waiter.brand_waiter')}</span>
                            <div className="w-1 h-1 bg-[#e91e63] rounded-full animate-ping shrink-0" />
                            <span className="text-[10px] sm:text-[10px] font-black text-[#e91e63] uppercase tracking-[0.25em] sm:tracking-[0.35em] truncate">{user?.name}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-6 shrink-0">
                    <div className="hidden lg:flex items-center gap-4 glass px-6 py-3 rounded-full border-white/5">
                        <FiClock className="text-[#e91e63]" size={16} />
                        <span className="text-[10px] font-black tracking-widest text-white/50">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    
                    <button 
                        type="button"
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const ok = await playNotification('success');
                            setIsAudioEnabled(true);
                            if (!ok) {
                                toast.error(t('waiter.toast_sound_failed'));
                            }
                        }}
                        className={`w-12 h-12 sm:w-14 sm:h-14 glass rounded-[20px] sm:rounded-[24px] flex items-center justify-center transition-all relative touch-manipulation active:scale-95 ${isAudioEnabled ? 'text-emerald-500 bg-emerald-500/5' : 'text-slate-400 group-hover:text-white'}`}
                        title={t('waiter.sound_tooltip')}
                    >
                        <FiBell size={24} className={!isAudioEnabled ? 'animate-pulse' : ''} />
                        {!isAudioEnabled && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-[#020617]" />
                        )}
                    </button>

                    <button 
                        type="button"
                        onClick={() => void loadTables()}
                        aria-label={t('waiter.refresh') || 'Yenile'}
                        className="w-12 h-12 sm:w-14 sm:h-14 glass rounded-[20px] sm:rounded-[24px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all relative touch-manipulation active:scale-95"
                    >
                        <FiRefreshCw size={24} className={loading ? 'animate-spin' : ''} />
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => setIsMenuOpen(true)}
                        className="flex items-center gap-2 sm:gap-4 bg-white/5 p-1.5 sm:p-2 sm:pr-6 rounded-[22px] sm:rounded-[28px] border border-white/5 hover:border-white/10 transition-all group touch-manipulation active:scale-[0.98] min-h-[44px]"
                    >
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-pink-600/20 group-hover:scale-105 transition-transform shrink-0">
                            <FiUser size={20} />
                        </div>
                        <div className="hidden sm:flex flex-col text-left">
                            <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">{user?.name}</p>
                            <p className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.3em] mt-1.5">
                                {tpl(t, 'waiter.session_label', { id: user?.id ?? '—' })}
                            </p>
                        </div>
                    </button>
                </div>
            </header>

            {/* Main Area */}
            <main className="flex-1 overflow-hidden relative flex flex-col z-10 p-2 sm:p-4 pt-1 sm:pt-2 min-h-0">
                <AnimatePresence mode="wait">
                    {qrQueue.length > 0 && view === 'floor' && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0, y: -20 }}
                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                            exit={{ height: 0, opacity: 0, y: -20 }}
                            className="px-3 sm:px-10 py-3 sm:py-6 shrink-0 overflow-hidden"
                        >
                            <div className="bg-[#e91e63]/10 backdrop-blur-xl border border-[#e91e63]/20 rounded-[24px] sm:rounded-[40px] p-2">
                                {qrQueue.map(q => (
                                    <div key={q.orderId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/40 p-4 sm:p-6 rounded-[24px] sm:rounded-[36px] border border-white/10 shadow-2xl">
                                        <div className="flex items-start sm:items-center gap-4 sm:gap-10 min-w-0">
                                            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-[22px] sm:rounded-[28px] bg-[#e91e63]/20 flex items-center justify-center text-[#e91e63] shadow-lg shadow-pink-600/10">
                                                <FiShoppingBag size={28} className="animate-bounce" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                                    <span className="text-[9px] sm:text-[10px] font-black text-[#e91e63] uppercase tracking-[0.25em] sm:tracking-[0.4em]">
                                                        {t('waiter.qr_tablet_order_badge')}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-[#e91e63] text-white text-[8px] font-black rounded-full shadow-lg">{t('waiter.new_badge')}</span>
                                                </div>
                                                <span className="text-base sm:text-xl font-black text-white italic tracking-tighter uppercase break-words mt-1">
                                                    {q.tableName} · {q.customerName || t('waiter.guest_upper')} · {currency}{Number(q.totalAmount).toFixed(0)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 sm:gap-4 sm:pr-4 w-full sm:w-auto">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConfirm({
                                                        title: t('waiter.qr_reject_title'),
                                                        description: t('waiter.qr_reject_desc'),
                                                        confirmText: t('waiter.qr_reject_confirm'),
                                                        type: 'danger',
                                                        onConfirm: () => void rejectQr(q.orderId),
                                                    })
                                                }
                                                aria-label={t('waiter.qr_reject_title')}
                                                className="min-h-[48px] min-w-[48px] sm:w-16 sm:h-16 glass rounded-[20px] sm:rounded-[24px] flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white hover:shadow-xl hover:shadow-rose-600/30 transition-all touch-manipulation active:scale-95 shrink-0"
                                            >
                                                <FiX size={26} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openQrAdisyonModal(q)}
                                                className="flex-1 sm:flex-none min-h-[48px] h-12 sm:h-16 px-6 sm:px-12 bg-emerald-600 hover:bg-emerald-500 rounded-[20px] sm:rounded-[24px] text-[10px] sm:text-[11px] font-black uppercase tracking-[0.25em] sm:tracking-[0.4em] text-white shadow-[0_15px_40px_-5px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 sm:gap-3 transition-all active:scale-[0.98] touch-manipulation"
                                            >
                                                <FiCheckCircle size={20} className="shrink-0" /> {t('waiter.qr_add_to_tab')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {view === 'floor' && renderFloorView()}
                    {view === 'order' && renderOrderView()}
                    {view === 'stats' && renderStatsView()}
                    {(view as any) === 'kitchen' && renderReadyOrdersView()}
                    {view === 'messages' && renderMessagesView()}
                </AnimatePresence>
            </main>

            {/* Sipariş ekranı: sepet — alt menünün üstünde ortada (fixed değil; z-index üstte) */}
            {view === 'order' && (
                <div className="shrink-0 relative z-[60] flex justify-center px-3 sm:px-8 pt-2 pb-2 border-t border-white/10 bg-[#020617]/95 backdrop-blur-xl">
                    <motion.button
                        type="button"
                        layout
                        onClick={() => setOrderCartOpen(true)}
                        className={`flex items-center justify-center rounded-full border border-white/15 bg-[#e91e63] text-white shadow-[0_12px_40px_-8px_rgba(233,30,99,0.55)] backdrop-blur-md touch-manipulation active:scale-[0.97] transition-[padding,min-width,width] duration-200 ${
                            cartQtyTotal > 0
                                ? 'min-h-[52px] sm:min-h-[56px] px-5 sm:px-8 gap-2 sm:gap-3 w-[min(92vw,320px)] max-w-[320px]'
                                : 'h-14 w-14 sm:h-[60px] sm:w-[60px]'
                        }`}
                        aria-label={cartQtyTotal > 0 ? tpl(t, 'waiter.cart_aria', { n: cartQtyTotal }) : t('waiter.cart_open')}
                    >
                        <FiShoppingBag className="shrink-0" size={cartQtyTotal > 0 ? 22 : 24} />
                        {cartQtyTotal > 0 && (
                            <>
                                <span className="text-lg sm:text-xl font-black tabular-nums leading-none">{cartQtyTotal}</span>
                                <span className="text-sm sm:text-base font-black tabular-nums opacity-95 border-l border-white/30 pl-2 sm:pl-3 ml-0.5 whitespace-nowrap">
                                    ₺{Math.round(getCartTotal().final_total)}
                                </span>
                            </>
                        )}
                    </motion.button>
                </div>
            )}

            {/* Navigation Bar — mobil: tam genişlik, dokunmatik hedefler (Rapor → yan menü) */}
            <div className="shrink-0 flex items-stretch justify-center px-2 sm:px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 relative z-50 border-t border-white/5 bg-[#020617]/80 backdrop-blur-xl sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
                <div className="glass w-full max-w-4xl min-h-[64px] sm:min-h-[80px] h-auto px-1.5 sm:px-4 py-1.5 sm:py-2 rounded-[20px] sm:rounded-full flex items-stretch gap-1 sm:gap-2 border border-white/10 shadow-2xl">
                    {[
                        { id: 'floor', label: t('waiter.nav_floor'), short: t('waiter.nav_floor_short'), icon: <FiLayout /> },
                        { id: 'kitchen', label: t('waiter.nav_kitchen'), short: t('waiter.nav_kitchen_short'), icon: <FiGrid />, badge: readyOrders.length },
                        { id: 'messages', label: t('waiter.nav_calls'), short: t('waiter.nav_calls_short'), icon: <FiBell />, badge: messagesHubBadgeCount },
                        { id: 'more', label: t('waiter.nav_more'), short: t('waiter.nav_more_short'), icon: <FiMoreVertical /> },
                    ].map(item => (
                        <button 
                            type="button"
                            key={item.id}
                            onClick={() => {
                                if (item.id === 'more') setIsMenuOpen(true);
                                else setView(item.id as any);
                            }}
                            className={`relative flex-1 min-w-0 min-h-[56px] sm:min-h-14 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-[16px] sm:rounded-[24px] font-black uppercase tracking-tight sm:tracking-widest transition-all touch-manipulation active:scale-[0.97] px-1 py-1 sm:px-3 ${view === (item.id as any) ? 'bg-[#e91e63] text-white shadow-lg shadow-pink-600/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                        >
                            <span className="text-xl sm:text-xl shrink-0 opacity-90">{item.icon}</span>
                            <span className="text-[9px] sm:text-[10px] leading-none text-center max-w-[4.5rem] sm:max-w-none line-clamp-2 sm:truncate">
                                <span className="sm:hidden">{(item as { short?: string }).short}</span>
                                <span className="hidden sm:inline">{item.label}</span>
                            </span>
                            {(item as { badge?: number }).badge != null && (item as { badge?: number }).badge! > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 min-w-[1.25rem] h-5 px-1 bg-[#e91e63] text-white rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-black shadow-lg border-2 border-[#020617] animate-pulse">
                                    {(item as { badge?: number }).badge! > 99 ? '99+' : (item as { badge?: number }).badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hazır sipariş detayı — kök seviyede; main (z-10) içinde kaldığında alt menü (z-50) üstte kalıyordu */}
            <AnimatePresence>
                {readyOrderDetail && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md"
                        onClick={() => setReadyOrderDetail(null)}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 20, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28 }}
                            className="w-full sm:max-w-md max-h-[90dvh] overflow-hidden rounded-t-[28px] sm:rounded-3xl bg-[#0c121d] border border-white/10 shadow-2xl flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                                <div className="min-w-0">
                                    <p className="text-[9px] font-bold text-slate-500 uppercase">{t('waiter.detail_table')}</p>
                                    <p className="text-xl font-black text-white italic truncate">
                                        {readyOrderDetail.table_name || '—'}
                                    </p>
                                    <p className="text-[11px] font-mono text-[#e91e63] mt-0.5">
                                        {tpl(t, 'waiter.detail_ticket', { id: readyOrderDetail.id })}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setReadyOrderDetail(null)}
                                    className="shrink-0 w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 touch-manipulation"
                                    aria-label={t('waiter.close')}
                                >
                                    <FiX size={22} />
                                </button>
                            </div>
                            <div className="px-4 py-2 flex items-center justify-between text-[11px] border-b border-white/5 bg-white/[0.02]">
                                <span className="text-slate-500">{t('waiter.detail_bench_time')}</span>
                                <span
                                    className={`font-black tabular-nums ${
                                        formatElapsedTime(readyOrderDetail.updated_at) > 10
                                            ? 'text-red-400'
                                            : 'text-emerald-400'
                                    }`}
                                >
                                    {formatElapsedTime(readyOrderDetail.updated_at)} {t('waiter.timer_min_short')}
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2 min-h-0">
                                {(readyOrderDetail.items || []).map((item: any, i: number) => {
                                    const extras = formatReadyOrderItemExtras(item, t);
                                    return (
                                        <div
                                            key={item.id ?? i}
                                            className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0"
                                        >
                                            <span className="w-8 h-8 shrink-0 bg-[#e91e63]/20 text-[#e91e63] rounded-lg flex items-center justify-center text-sm font-black">
                                                {item.quantity}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-100 uppercase tracking-tight leading-snug">
                                                    {item.product_name}
                                                </p>
                                                {extras.length > 0 && (
                                                    <ul className="mt-1 space-y-0.5 text-[11px] font-semibold text-slate-400 leading-relaxed">
                                                        {extras.map((line, li) => (
                                                            <li key={li} className="pl-0 border-l-2 border-[#e91e63]/30 pl-2">
                                                                {line}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="shrink-0 p-4 pt-2 border-t border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 text-center leading-relaxed px-1">
                                    {t('waiter.detail_hint')}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => void handlePickup(readyOrderDetail.id)}
                                    className="w-full min-h-[52px] rounded-2xl bg-[#e91e63] hover:bg-[#ff1b7e] text-white font-black text-[13px] uppercase tracking-wide shadow-lg shadow-pink-600/20 active:scale-[0.99] touch-manipulation flex flex-col items-center justify-center gap-0.5 py-2"
                                >
                                    <span>{t('waiter.detail_pickup')}</span>
                                    <span className="text-[9px] font-bold opacity-90 normal-case tracking-normal">
                                        {t('waiter.detail_pickup_sub')}
                                    </span>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sepet çekmecesi — kök seviyede z-index (alt menünün üzerinde) */}
            <AnimatePresence>
                {view === 'order' && orderCartOpen && (
                    <>
                        <motion.button
                            type="button"
                            key="order-cart-backdrop"
                            aria-label={t('common.close')}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setOrderCartOpen(false)}
                            className="fixed inset-0 z-[115] cursor-default border-0 bg-black/75 p-0 backdrop-blur-[2px]"
                        />
                        <motion.div
                            key="order-cart-sheet"
                            role="dialog"
                            aria-modal="true"
                            aria-label={t('waiter.cart_sheet')}
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
                            className="fixed bottom-0 left-0 right-0 z-[125] flex max-h-[min(92dvh,880px)] flex-col overflow-hidden rounded-t-[28px] border border-white/10 border-b-0 bg-slate-900 shadow-2xl sm:left-auto sm:right-[max(0.75rem,env(safe-area-inset-right))] sm:top-[max(0.75rem,env(safe-area-inset-top))] sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-h-none sm:w-[min(420px,calc(100vw-1.5rem))] sm:rounded-[40px] sm:border-b"
                        >
                            <div className="flex justify-center pt-3 pb-1 shrink-0">
                                <div className="h-1.5 w-12 rounded-full bg-white/20" aria-hidden />
                            </div>
                            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-1 border-b border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent shrink-0 sm:px-8 sm:pb-5">
                                <div className="min-w-0">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#e91e63]">{t('waiter.cart_header')}</h3>
                                    <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                                        <span className="text-3xl sm:text-4xl font-black text-white italic tracking-tighter tabular-nums">{cart.length}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('waiter.cart_line')}</span>
                                        <span className="text-slate-600">·</span>
                                        <span className="text-lg font-black text-white tabular-nums">{cartQtyTotal}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('waiter.cart_qty_label')}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOrderCartOpen(false)}
                                    className="shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 touch-manipulation"
                                    aria-label={t('waiter.close')}
                                >
                                    <FiX size={22} />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-5 no-scrollbar custom-scrollbar overscroll-contain">
                                <AnimatePresence mode="popLayout">
                                    {cart.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-center opacity-25 px-6">
                                            <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-white/20 bg-white/5">
                                                <FiShoppingBag size={40} />
                                            </div>
                                            <p className="text-sm font-black uppercase tracking-[0.3em] leading-relaxed italic text-white/70">
                                                {t('waiter.cart_empty_state')}
                                            </p>
                                        </div>
                                    ) : (
                                        cart.map(item => (
                                            <motion.div
                                                key={item.cartId}
                                                layout
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="bg-white/[0.03] border border-white/5 p-5 sm:p-6 rounded-[28px] relative overflow-hidden group shadow-lg"
                                            >
                                                <div className="flex justify-between items-start mb-4 sm:mb-6">
                                                    <div className="min-w-0 pr-4">
                                                        <span className="text-sm font-black text-white leading-tight uppercase italic group-hover:text-[#e91e63] transition-colors">
                                                            {item.product.displayName}
                                                        </span>
                                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md">
                                                                ₺{Math.round(item.price)}
                                                            </span>
                                                            {item.notes && (
                                                                <span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1">
                                                                    ⚡ {item.notes}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFromCart(item.cartId)}
                                                        className="shrink-0 w-10 h-10 rounded-2xl glass text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white hover:shadow-lg hover:shadow-rose-600/30 transition-all border-white/5 touch-manipulation"
                                                    >
                                                        <FiTrash2 size={18} />
                                                    </button>
                                                </div>
                                                <div className="flex justify-between items-center bg-black/30 rounded-3xl p-2 pr-4 sm:pr-6">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateQty(item.cartId, item.qty - 1)}
                                                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-90 touch-manipulation"
                                                        >
                                                            <FiMinus size={14} />
                                                        </button>
                                                        <span className="text-lg font-black text-white w-9 sm:w-10 text-center font-display tabular-nums">
                                                            {item.qty}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateQty(item.cartId, item.qty + 1)}
                                                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#e91e63]/10 text-[#e91e63] flex items-center justify-center hover:bg-[#e91e63] hover:text-white transition-all active:scale-90 touch-manipulation"
                                                        >
                                                            <FiPlus size={14} />
                                                        </button>
                                                    </div>
                                                    <span className="text-lg sm:text-xl font-black text-emerald-400 italic tracking-tighter tabular-nums">
                                                        ₺{Math.round(item.price * item.qty)}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="space-y-4 sm:space-y-6 shrink-0 border-t border-white/10 bg-black/40 p-4 sm:p-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
                                <div className="flex justify-between items-end gap-2">
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">{t('waiter.cart_net')}</span>
                                        <span className="text-lg font-black text-slate-400 tabular-nums">₺{Math.round(getCartTotal().subtotal)}</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className="text-[10px] font-black text-[#e91e63] uppercase tracking-[0.6em]">{t('waiter.cart_grand_total')}</span>
                                        <span className="text-4xl sm:text-5xl font-black text-white tracking-tighter italic tabular-nums">
                                            ₺{Math.round(getCartTotal().final_total)}
                                        </span>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5 w-full" />

                                <button
                                    type="button"
                                    disabled={cart.length === 0 || isSubmittingOrder}
                                    onClick={handleSendOrder}
                                    className="group w-full min-h-[56px] sm:min-h-[72px] py-4 bg-[#e91e63] hover:bg-[#c2185b] disabled:opacity-20 disabled:grayscale rounded-[24px] sm:rounded-[32px] text-white font-black text-sm sm:text-base uppercase tracking-[0.2em] sm:tracking-[0.3em] shadow-[0_20px_60px_-15px_rgba(233,30,99,0.6)] flex items-center justify-center gap-3 sm:gap-4 transition-all active:scale-[0.98] touch-manipulation"
                                >
                                    {isSubmittingOrder ? (
                                        <FiRefreshCw className="animate-spin text-3xl" />
                                    ) : (
                                        <>
                                            <span className="group-hover:translate-x-2 transition-transform duration-500">{t('cart.sendToKitchen')}</span>
                                            <FiArrowRight size={26} className="group-hover:translate-x-3 transition-transform duration-500 opacity-50" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Sidebar Drawer */}
            <AnimatePresence>
                {isMenuOpen && (
                    <div className="fixed inset-0 z-[100] flex">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/90 backdrop-blur-sm" 
                            onClick={() => setIsMenuOpen(false)} 
                        />
                        <motion.div 
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="relative w-full max-w-[min(100vw,400px)] h-full bg-[#0b0f19] border-r border-white/10 flex flex-col overflow-hidden"
                        >
                            {/* Decorative blob in menu */}
                            <div className="absolute top-[-10%] right-[-10%] w-[100%] h-[100%] rounded-full bg-[#e91e63]/5 blur-[60px] pointer-events-none" />

                            <div className="p-12 pb-10 flex justify-between items-center relative z-10">
                                <div className="flex flex-col">
                                    <h2 className="text-3xl font-black italic text-white tracking-widest">{t('waiter.menu_title')}</h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2">{t('waiter.menu_version')}</p>
                                </div>
                                <button onClick={() => setIsMenuOpen(false)} className="w-14 h-14 glass rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all"><FiX size={28} /></button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-8 py-4 space-y-10 no-scrollbar relative z-10">
                                <section>
                                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.6em] mb-6 px-4">{t('waiter.quick_status')}</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 p-8 rounded-[40px] border border-white/5 group hover:border-[#e91e63]/20 transition-all">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">{t('waiter.active_tables_label')}</span>
                                            <span className="text-4xl font-black text-white italic tracking-tighter">{tables.length}</span>
                                        </div>
                                        <div className="bg-[#e91e63]/5 p-8 rounded-[40px] border border-[#e91e63]/10">
                                            <span className="text-[10px] font-black text-[#e91e63] uppercase tracking-widest block mb-4">{t('waiter.occupancy_short')}</span>
                                            <span className="text-4xl font-black text-white italic tracking-tighter">{tables.filter(t => t.active_session_id).length}</span>
                                        </div>
                                    </div>
                                </section>

                                <nav className="space-y-4">
                                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.6em] mb-6 px-4">{t('waiter.navigation')}</p>
                                    {[
                                        { id: 'floor', label: t('waiter.more_floor'), icon: <FiLayout className="text-[#e91e63]" />, desc: t('waiter.more_floor_desc') },
                                        { id: 'kitchen', label: t('waiter.nav_kitchen_menu'), icon: <FiGrid />, desc: t('waiter.nav_kitchen_desc') },
                                        { id: 'stats', label: t('waiter.more_report'), icon: <FiPieChart />, desc: t('waiter.more_report_desc') },
                                    ].map(item => (
                                        <button 
                                            key={item.id}
                                            onClick={() => { setView(item.id as any); setIsMenuOpen(false); }}
                                            className={`w-full flex items-center gap-6 p-6 rounded-[32px] font-black transition-all ${view === (item.id as any) ? 'bg-[#e91e63] text-white shadow-2xl shadow-pink-600/30' : 'text-slate-500 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/5'}`}
                                        >
                                            <span className="text-2xl">{item.icon}</span>
                                            <div className="flex flex-col items-start translate-y-[-2px]">
                                                <span className="text-[10px] uppercase tracking-[0.3em] leading-none mb-1">{item.label}</span>
                                                <span className={`text-[8px] font-bold uppercase tracking-widest opacity-40 ${view === item.id ? 'text-white' : 'text-slate-500'}`}>{item.desc}</span>
                                            </div>
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            <div className="p-10 border-t border-white/5 bg-black/20 relative z-10">
                                <button 
                                    onClick={logout}
                                    className="w-full h-20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 rounded-[32px] font-black text-xs uppercase tracking-[0.5em] border border-rose-500/10 transition-all flex items-center justify-center gap-4 group"
                                >
                                    <FiLogOut className="text-xl group-hover:-translate-x-2 transition-transform duration-500" /> {t('waiter.logout')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {customizeProduct && (
                <OrderProductModal
                    product={customizeProduct}
                    allModifiers={modifiers}
                    currency={currency}
                    onClose={() => setCustomizeProduct(null)}
                    onConfirm={(variant, mods) => {
                        addToCart(customizeProduct, variant, mods);
                    }}
                />
            )}

            {/* Modal Components */}
            <AnimatePresence>
                {openModalTable && (
                    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/95 p-3 sm:p-6 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            className="w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-[#0b0f19] rounded-[28px] sm:rounded-[64px] p-6 sm:p-12 border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,1)] relative"
                        >
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-[#e91e63] to-blue-600" />
                            
                            <div className="flex items-center gap-4 sm:gap-8 mb-6 sm:mb-10">
                                <div className="w-16 h-16 sm:w-24 sm:h-24 shrink-0 rounded-[24px] sm:rounded-[36px] bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                    <FiLayout size={32} className="sm:w-10 sm:h-10" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-2xl sm:text-4xl font-black text-white italic tracking-tighter mb-1 uppercase leading-none">{t('waiter.open_table_title')}</h2>
                                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.35em] sm:tracking-[0.6em] flex items-center gap-2 sm:gap-3 mt-2 sm:mt-4 truncate">
                                        <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" /> {openModalTable.name}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="space-y-8 sm:space-y-10">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.35em] sm:tracking-[0.4em] block mb-3 px-1 font-display">
                                        {t('waiter.customer_search_label')} <span className="text-slate-600 normal-case tracking-normal text-[11px] font-bold">{t('waiter.customer_search_hint')}</span>
                                    </label>
                                    <CustomerIdentify 
                                        variant="dark"
                                        onSelect={(c) => setIdentifiedCustomer(c)}
                                        placeholder={t('waiter.customer_ph')}
                                    />
                                    {identifiedCustomer && (
                                        <div className="mt-3 px-4 py-3 bg-emerald-500/10 text-emerald-400 rounded-xl text-[11px] font-black flex items-center justify-between gap-2 border border-emerald-500/25">
                                            <span className="truncate">✓ {identifiedCustomer.name}</span>
                                            <button type="button" onClick={() => setIdentifiedCustomer(null)} className="shrink-0 min-h-[44px] px-3 text-rose-400 hover:text-white touch-manipulation">
                                                {t('waiter.remove')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-4 px-4 font-display">
                                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] block">{t('waiter.guest_count_label')}</label>
                                        <span className="text-[9px] font-black text-[#e91e63] bg-[#e91e63]/10 px-3 py-1 rounded-full uppercase tracking-widest">{tpl(t, 'waiter.max_seats', { n: openModalTable.capacity || 4 })}</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-4">
                                        {[1,2,4,6].map(n => (
                                            <button 
                                                key={n}
                                                onClick={() => setOpenForm({ ...openForm, guestCount: String(n) })}
                                                className={`h-20 rounded-[28px] font-black transition-all border text-lg ${openForm.guestCount === String(n) ? 'bg-[#e91e63] border-[#e91e63] text-white shadow-[0_15px_40px_-5px_rgba(233,30,99,0.4)]' : 'bg-white/[0.02] border-white/5 text-slate-700 hover:text-slate-400 hover:bg-white/5'}`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-6 mt-16 px-2">
                                <button 
                                    onClick={() => setOpenModalTable(null)}
                                    className="flex-1 py-6 glass rounded-[32px] font-black text-[11px] uppercase tracking-[0.4em] text-white/30 hover:text-white transition-all outline-none"
                                >
                                    {t('waiter.cancel_btn')}
                                </button>
                                <button 
                                    onClick={() => void submitOpenTable()}
                                    className="flex-[2] py-6 bg-emerald-600 hover:bg-emerald-500 rounded-[32px] font-black text-[11px] uppercase tracking-[0.4em] text-white shadow-2xl shadow-emerald-900/30 active:scale-95 transition-all outline-none"
                                >
                                    {t('waiter.activate_table')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {qrAdisyonModal && (
                    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0b0f19] p-6 shadow-2xl"
                        >
                            <h3 className="text-lg font-black uppercase tracking-tight text-white">
                                {t('waiter.qr_add_to_tab_title')}
                            </h3>
                            <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                                {qrAdisyonModal.tableName} · {currency}{Number(qrAdisyonModal.totalAmount ?? 0).toFixed(0)}
                            </p>
                            <p className="mt-3 text-xs text-slate-400">{t('waiter.qr_add_to_tab_hint')}</p>
                            <label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('waiter.qr_guest_name_optional')}
                            </label>
                            <input
                                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"
                                value={qrAdisyonGuestName}
                                onChange={(e) => setQrAdisyonGuestName(e.target.value)}
                                placeholder={t('waiter.qr_guest_name_ph')}
                                autoComplete="off"
                            />
                            <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('waiter.qr_allergy_optional')}
                            </label>
                            <textarea
                                className="mt-2 min-h-[72px] w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/50"
                                value={qrAdisyonAllergy}
                                onChange={(e) => setQrAdisyonAllergy(e.target.value)}
                                placeholder={t('waiter.qr_allergy_ph')}
                            />
                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    disabled={qrAdisyonBusy}
                                    onClick={() => setQrAdisyonModal(null)}
                                    className="flex-1 rounded-2xl border border-white/10 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/5"
                                >
                                    {t('waiter.cancel_btn')}
                                </button>
                                <button
                                    type="button"
                                    disabled={qrAdisyonBusy}
                                    onClick={() => void submitQrAdisyon()}
                                    className="flex-[2] rounded-2xl bg-emerald-600 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 disabled:opacity-50"
                                >
                                    {qrAdisyonBusy ? '…' : t('waiter.qr_add_to_tab_confirm')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {pinModal?.open && (
                    <HandoverPINModal 
                        onClose={() => setPinModal(null)}
                        onConfirm={(pin) => {
                            if (pinModal.orderId) {
                                void handlePickup(pinModal.orderId, pin);
                            } else if (pinModal.tableId) {
                                void handleServe(pinModal.tableId, pin);
                            }
                        }}
                    />
                )}
            </AnimatePresence>
            <ModernConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm?.title || ''}
                description={confirm?.description || ''}
                confirmText={confirm?.confirmText || t('waiter.confirm_yes')}
                cancelText={t('waiter.confirm_cancel')}
                type={confirm?.type || 'warning'}
                onConfirm={() => confirm?.onConfirm()}
            />
        </div>
    );
};
