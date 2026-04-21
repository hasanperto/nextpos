import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
    FiPackage, FiMapPin, FiPhone, FiX, 
    FiNavigation, FiClock, FiCheckCircle, 
    FiRefreshCw, FiLogOut,
    FiUser, FiBell,
    FiList, FiPieChart, FiMessageSquare,
    FiInbox, FiChevronRight, FiDollarSign, FiCreditCard, FiCpu
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { useCourierRealtimeSync } from '../hooks/useCourierRealtimeSync';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { posMessages, type PosLang } from '../i18n/posMessages';
import toast from 'react-hot-toast';

interface CourierOrder {
    id: number;
    customer_name: string;
    delivery_address: string;
    delivery_phone: string;
    total_amount: number;
    status: 'ready' | 'shipped' | 'completed' | 'cancelled';
    payment_status: 'pending' | 'paid';
    created_at: string;
    updated_at: string;
    order_type: string;
    courier_id?: number | string | null;
    payment_method_arrival?: 'cash' | 'card' | 'online';
    source?: string;
    notes?: string;
    items?: any[];
}

const COMPANY_CONFIG: Record<string, { logo: string; color: string; label: string }> = {
    web: { logo: 'W', color: '#10b981', label: 'Web' },
    customer_qr: { logo: 'QR', color: '#6366f1', label: 'QR' },
    panel: { logo: 'P', color: '#f59e0b', label: 'Dahili' },
    getir: { logo: 'getir', color: '#5d3ebc', label: 'Getir' },
    yemeksepeti: { logo: 'Y', color: '#ea004b', label: 'Yemeksepeti' },
    trendyol: { logo: 'trendyol', color: '#f27a1a', label: 'Trendyol' },
    default: { logo: 'NP', color: '#e91e63', label: 'NextPOS' }
};

// Yerel test: Vite dev iken sabit başlangıç (isteğe bağlı)
const MOCK_LOCATION = { lat: 48.4735, lng: 8.9412 };

/** Aynı bölge/rota gruplaması için adres imzası (posta kodu veya son iki adres parçası). */
function tpl(t: (k: string) => string, key: string, vars: Record<string, string | number>): string {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{{${k}}}`).join(String(v));
    }
    return s;
}

function tForLang(lang: PosLang): (k: string) => string {
    const m = posMessages[lang] || posMessages.tr;
    return (k: string) => m[k] || k;
}

function routeGroupKey(address: string): string {
    const raw = (address || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw) return '__adres_yok__';
    const zipTr = raw.match(/\b\d{5}\b/);
    if (zipTr) return `pk:${zipTr[0]}`;
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join(' · ');
    return raw.slice(0, 120);
}

function routeGroupLabel(key: string, t: (k: string) => string): string {
    if (key === '__adres_yok__') return t('courier.route_no_address');
    if (key.startsWith('pk:')) return tpl(t, 'courier.route_zip', { zip: key.slice(3) });
    return key;
}

function groupCourierOrdersByRoute(orders: CourierOrder[], lang: PosLang): { key: string; display: string; orders: CourierOrder[] }[] {
    const t = tForLang(lang);
    const map = new Map<string, CourierOrder[]>();
    for (const o of orders) {
        const k = routeGroupKey(o.delivery_address || '');
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(o);
    }
    const groups = [...map.entries()].map(([key, ord]) => ({
        key,
        display: routeGroupLabel(key, t),
        orders: ord.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    }));
    groups.sort((a, b) => new Date(a.orders[0]?.created_at).getTime() - new Date(b.orders[0]?.created_at).getTime());
    return groups;
}

function buildCourierNavLinks(order: CourierOrder, origin: { lat: number; lng: number } | null, t: (k: string) => string) {
    const dest = (order.delivery_address || '').trim() || t('courier.nav_dest_fallback');
    const destEnc = encodeURIComponent(dest);
    const originEnc = origin ? encodeURIComponent(`${origin.lat},${origin.lng}`) : '';
    const googleWeb = origin
        ? `https://www.google.com/maps/dir/?api=1&origin=${originEnc}&destination=${destEnc}&travelmode=driving`
        : `https://www.google.com/maps/search/?api=1&query=${destEnc}`;
    const waze = `https://waze.com/ul?q=${destEnc}&navigate=yes`;
    const apple = `maps://maps.apple.com/?daddr=${destEnc}${origin ? `&saddr=${originEnc}` : ''}`;
    const embed = origin
        ? `https://www.google.com/maps?saddr=${originEnc}&daddr=${destEnc}&output=embed`
        : `https://maps.google.com/maps?q=${destEnc}&output=embed`;
    return { googleWeb, waze, apple, embed };
}

function formatCourierElapsed(createdAt: string, t: (k: string) => string): string {
    const created = new Date(createdAt).getTime();
    const diff = Math.floor((Date.now() - created) / 60000);
    if (diff < 1) return t('courier.time_now');
    if (diff < 60) return tpl(t, 'courier.time_min', { n: diff });
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return mins > 0 ? tpl(t, 'courier.time_hm', { h: hours, m: mins }) : tpl(t, 'courier.time_h', { h: hours });
}

const OrderCard = ({
    order,
    currency,
    onClick,
    routeGroupSize,
}: {
    order: CourierOrder;
    currency: string;
    onClick: () => void;
    routeGroupSize?: number;
}) => {
    const { t } = usePosLocale();
    const [, setTick] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => setTick((x) => x + 1), 30000);
        return () => clearInterval(iv);
    }, []);
    const config = COMPANY_CONFIG[order.source || 'default'] || COMPANY_CONFIG.default;
    const timeAgo = formatCourierElapsed(order.created_at, t);
    const displayName = order.customer_name || order.delivery_phone || t('courier.customer');
    const isReady = order.status === 'ready';

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`group block glass-dark p-6 rounded-[32px] transition-all cursor-pointer relative overflow-hidden shadow-2xl border-white/[0.03] hover:border-white/10 ${isReady ? 'shadow-rose-900/10 border-rose-500/10 bg-rose-500/[0.02]' : ''}`}
        >
            {/* Rhythmic Setup Pulse for Ready Orders */}
            {isReady && (
                <div className="absolute inset-0 bg-rose-500/[0.03] animate-pulse-fast pointer-events-none" />
            )}

            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <FiPackage size={80} className="text-white" />
            </div>
            
            <div className="flex gap-6 items-center relative z-10">
                <div 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xs uppercase shadow-2xl shrink-0 border border-white/10 relative overflow-hidden"
                    style={{ 
                        background: `linear-gradient(135deg, ${config.color}, ${config.color}dd)`,
                    }}
                >
                    <div className="absolute inset-0 bg-white/20 animate-pulse-fast opacity-50" />
                    <span className="relative z-10">{config.logo}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                                    {order.status === 'ready' ? t('courier.pickup_required') : t('courier.in_transit')}
                                </span>
                                {routeGroupSize != null && routeGroupSize > 1 && (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                        {tpl(t, 'courier.same_route_n', { n: routeGroupSize })}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-lg font-black truncate text-white uppercase italic tracking-tight leading-none">
                                {displayName}
                            </h3>
                        </div>
                        <div className="text-emerald-400 font-black text-xl italic tracking-tighter tabular-nums leading-none">
                            {currency}{Number(order.total_amount || 0).toLocaleString()}
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold truncate flex-1 tracking-tight">
                            <FiMapPin size={12} className="text-blue-500 shrink-0" />
                            <span className="truncate">{order.delivery_address || t('courier.address_missing')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-300 font-black text-[9px] bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 shrink-0 tracking-widest uppercase">
                            <FiClock size={10} className="text-amber-500" /> {timeAgo}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const PaymentModal = ({ order, settings, currency, onClose, onComplete }: { 
    order: CourierOrder, 
    settings: any,
    currency: string,
    onClose: () => void, 
    onComplete: (paymentMethod: string, tip: number) => void 
}) => {
    const { t } = usePosLocale();
    const [method, setMethod] = useState<'cash' | 'card' | 'qr'>(order.payment_method_arrival === 'card' ? 'card' : 'cash');
    const [tip, setTip] = useState(0);
    const total = Number(order.total_amount || 0);

    const tipOptions = settings?.courier?.tipOptions || { cardPercent: 5, cashFixed: [10, 20, 50] };

    const handleMethodChange = (newMethod: 'cash' | 'card' | 'qr') => {
        setMethod(newMethod);
        if (newMethod === 'card') {
            setTip(Math.round(total * (tipOptions.cardPercent / 100)));
        } else {
            setTip(0);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-full max-w-sm bg-[#0c121d] rounded-[40px] border border-white/10 p-8 relative overflow-hidden shadow-2xl"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full -mr-16 -mt-16" />
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-6">{t('courier.payment_title')}</h3>
                
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'cash', label: t('courier.pay_cash'), icon: <FiDollarSign /> },
                            { id: 'card', label: t('courier.pay_card'), icon: <FiCreditCard /> },
                            { id: 'qr', label: t('courier.pay_qr'), icon: <FiCpu /> }
                        ].map((m) => (
                            <button 
                                key={m.id}
                                onClick={() => handleMethodChange(m.id as any)}
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${method === m.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500'}`}
                            >
                                {m.icon}
                                <span className="text-[10px] font-black tracking-widest">{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* QR Code Display */}
                    <AnimatePresence mode="wait">
                        {method === 'qr' && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex flex-col items-center gap-4 py-4 bg-white/5 rounded-3xl border border-white/10"
                            >
                                <div className="p-4 bg-white rounded-2xl shadow-xl">
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`https://nextpos.com/pay/${order.id}?amount=${total + tip}`)}`} 
                                        alt="QR Payment" 
                                        className="w-40 h-40"
                                    />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest animate-pulse">{t('courier.payment_waiting')}</p>
                                    <p className="text-[8px] font-bold text-slate-500 mt-1 uppercase">{t('courier.scan_customer')}</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('courier.tip_add')}</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setTip(0)} className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${tip === 0 ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/5 border-white/5 text-slate-500'}`}>{t('courier.tip_none')}</button>
                            {method === 'card' ? (
                                <button onClick={() => setTip(Math.round(total * (tipOptions.cardPercent / 100)))} className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${tip > 0 ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/5 border-white/5 text-slate-500'}`}>%{tipOptions.cardPercent}</button>
                            ) : (
                                tipOptions.cashFixed.map((val: number) => (
                                    <button 
                                        key={val}
                                        onClick={() => setTip(val)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${tip === val ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/5 border-white/5 text-slate-500'}`}
                                    >
                                        +{val} {currency}
                                    </button>
                                ))
                            )}
                            <input 
                                type="number" 
                                placeholder={t('courier.tip_custom_ph')} 
                                value={tip || ''} 
                                onChange={(e) => setTip(Number(e.target.value))}
                                className="w-20 bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-[10px] font-black text-white focus:outline-none focus:border-emerald-500/50" 
                            />
                        </div>
                    </div>

                    <div className="bg-white/[0.03] p-6 rounded-3xl border border-white/5 space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <span>{t('courier.order_amount')}</span>
                            <span>{currency}{total}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-emerald-500 uppercase tracking-wider">
                            <span>{t('courier.tip')}</span>
                            <span>+ {currency}{tip}</span>
                        </div>
                        <div className="pt-3 border-t border-white/5 flex justify-between items-end">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">{t('courier.total_payment')}</span>
                            <span className="text-2xl font-black text-white italic tracking-tighter">{currency}{total + tip}</span>
                        </div>
                    </div>

                    <button 
                        onClick={() => onComplete(method, tip)}
                        className="w-full h-16 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        {method === 'qr' && <FiRefreshCw className="animate-spin" />}
                        {method === 'qr' ? t('courier.pay_confirm_manual') : t('courier.pay_confirm')}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const OrderDetailSheet = ({ order, currency, onClose, onAction, onNavigate, currentPos }: { 
    order: CourierOrder, 
    currency: string,
    onClose: () => void, 
    onAction: (action: 'pickup' | 'deliver' | 'cancel') => void,
    onNavigate: () => void,
    currentPos: { lat: number, lng: number } | null
}) => {
    const { t } = usePosLocale();
    const config = COMPANY_CONFIG[order.source || 'default'] || COMPANY_CONFIG.default;
    const displayName = order.customer_name || order.delivery_phone || t('courier.customer');

    const navLinks = buildCourierNavLinks(order, currentPos, t);
    const mapsDirectionsUrl = navLinks.googleWeb;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-0">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose} 
                className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer" 
            />
            <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-full max-w-lg bg-[#0c121d] rounded-t-[40px] shadow-2xl relative border-t border-white/10 max-h-[92vh] flex flex-col"
            >
                <div className="w-12 h-1 bg-white/20 mx-auto mt-4 rounded-full shrink-0" />
                
                {/* Minimal Header */}
                <div className="px-6 pt-6 pb-4">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                            <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-xs uppercase"
                                style={{ background: `linear-gradient(135deg, ${config.color}, ${config.color}dd)` }}
                            >
                                {config.logo}
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white leading-tight uppercase italic">{displayName}</h2>
                                <p className="text-[10px] font-bold text-slate-500 tracking-wider">{tpl(t, 'courier.package_label', { id: order.id })} • {order.status.toUpperCase()}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 bg-white/5 text-slate-400 flex items-center justify-center rounded-full active:bg-white/10 transition-all">
                            <FiX size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <motion.a 
                            whileTap={{ scale: 0.97 }}
                            href={`tel:${order.delivery_phone}`} 
                            className="flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-emerald-500/20"
                        >
                            <FiPhone size={14} /> {t('courier.call')}
                        </motion.a>
                        <motion.button 
                            whileTap={{ scale: 0.97 }}
                            onClick={onNavigate}
                            className="flex items-center justify-center gap-2 bg-blue-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20"
                        >
                            <FiNavigation size={14} /> {t('courier.navigate')}
                        </motion.button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
                    {/* Compact Address Section */}
                    <div className="bg-white/[0.03] p-5 rounded-3xl border border-white/5">
                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <FiMapPin className="text-blue-500" /> {t('courier.address')}
                        </h4>
                        <p className="text-base font-bold text-white leading-snug">{order.delivery_address || t('courier.address_missing')}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <a
                                href={mapsDirectionsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter"
                            >
                                {t('courier.google_directions')}
                            </a>
                            <a
                                href={navLinks.waze}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-cyan-400 uppercase tracking-tighter"
                            >
                                {t('courier.waze')}
                            </a>
                        </div>
                    </div>

                    {/* Compact Items List */}
                    <div>
                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <FiPackage className="text-rose-500" /> {t('courier.order_contents')}
                        </h4>
                        <div className="space-y-4">
                            {order.items?.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <div className="flex gap-3 items-center">
                                        <span className="w-7 h-7 bg-white/5 text-white rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 border border-white/5">
                                            {item.quantity}
                                        </span>
                                        <span className="font-bold text-slate-200 uppercase tracking-tight">{item.product_name}</span>
                                    </div>
                                    <span className="font-bold text-slate-500 tabular-nums">{currency}{Number(item.total_price || 0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Optimized Payment Section */}
                    <div className="pt-4 border-t border-white/5 flex justify-between items-end">
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('courier.collection')}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${order.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-orange-400'}`}>
                                {order.payment_status === 'paid' ? t('courier.paid') : tpl(t, 'courier.collect_arrival', { method: (order.payment_method_arrival || '').toUpperCase() })}
                            </span>
                        </div>
                        <span className="text-3xl font-black text-white italic tracking-tighter tabular-nums">{currency}{Number(order.total_amount || 0).toLocaleString()}</span>
                    </div>

                    {/* Field Notes Area */}
                    {order.notes && (
                        <div className="bg-amber-500/5 border border-amber-500/10 p-5 rounded-3xl">
                            <h4 className="text-[9px] font-black text-amber-500/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <FiMessageSquare size={12} /> {t('courier.notes')}
                            </h4>
                            <p className="text-sm font-bold text-amber-100/80 leading-snug uppercase italic tracking-tight">{order.notes}</p>
                        </div>
                    )}
                </div>

                    {/* Primary Actions Footer */}
                    {(order.status === 'ready' || order.status === 'shipped') && (
                        <div className="px-6 pb-10 pt-4 bg-[#0c121d] border-t border-white/5">
                            {order.status === 'ready' ? (
                                <motion.button 
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => onAction('pickup')}
                                    className="w-full h-16 bg-rose-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-rose-500/20 flex items-center justify-center gap-3 transition-all"
                                >
                                    <FiPackage size={20} /> {t('courier.pickup_btn')}
                                </motion.button>
                            ) : (
                                <div className="flex gap-3">
                                    <motion.button 
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => onAction('deliver')}
                                        className="flex-[2] h-16 bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
                                    >
                                        <FiCheckCircle size={20} /> {t('courier.complete_btn')}
                                    </motion.button>
                                    <motion.button 
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => onAction('cancel')}
                                        className="flex-1 h-16 bg-white/5 text-rose-500 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 flex items-center justify-center"
                                    >
                                        {t('courier.cancel_btn')}
                                    </motion.button>
                                </div>
                            )}
                        </div>
                    )}
                    {order.status === 'completed' && (
                        <div className="px-6 pb-10 pt-6 bg-emerald-500/5 border-t border-emerald-500/10 text-center">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                                <FiCheckCircle /> {t('courier.done_delivered')}
                            </p>
                        </div>
                    )}
                    {order.status === 'cancelled' && (
                        <div className="px-6 pb-10 pt-6 bg-rose-500/5 border-t border-rose-500/10 text-center">
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                                <FiX /> {t('courier.done_cancelled')}
                            </p>
                        </div>
                    )}
            </motion.div>
        </div>
    );
};

const CancelOrderModal = ({
    title,
    description,
    reason,
    setReason,
    onClose,
    onConfirm,
}: {
    title: string;
    description: string;
    reason: string;
    setReason: (v: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}) => {
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="w-full max-w-md rounded-[40px] bg-[#0c121d] border border-white/10 p-8 relative shadow-2xl"
            >
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">{title}</h3>
                        <p className="mt-2 text-sm font-bold text-slate-400 leading-relaxed">{description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Kapat"
                        className="w-10 h-10 bg-white/5 text-slate-400 flex items-center justify-center rounded-full active:bg-white/10 transition-all shrink-0"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">İptal nedeni</div>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={4}
                        placeholder="Örn: müşteri iptal etti / adres hatalı / ulaşılamadı"
                        className="w-full rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white outline-none focus:border-rose-500/40 placeholder:text-slate-600"
                    />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-14 rounded-2xl bg-white/5 text-slate-300 font-black text-xs uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all"
                    >
                        Vazgeç
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-900/30 transition-all"
                    >
                        İptal et
                    </button>
                </div>
            </motion.div>
        </div>
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
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2 text-center">{t('courier.pin_title')}</h3>
                <p className="text-[9px] font-bold text-slate-500 text-center uppercase tracking-widest mb-8">{t('courier.pin_sub')}</p>
                
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

export const CourierPanel: React.FC = () => {
    const { user, getAuthHeaders, logout } = useAuthStore();
    const fetchSettings = usePosStore((s) => s.fetchSettings);
    const { t, lang } = usePosLocale();

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);
    const [orders, setOrders] = useState<CourierOrder[]>([]);
    const [history, setHistory] = useState<CourierOrder[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'active'>('pending');
    const [view, setView] = useState<'orders' | 'history' | 'profile' | 'messages'>('orders');
    const [selectedOrder, setSelectedOrder] = useState<CourierOrder | null>(null);
    /** Navigasyon tam ekranı: sheet kapanınca sipariş null olmasın diye ayrı tutulur */
    const [navigationOrder, setNavigationOrder] = useState<CourierOrder | null>(null);
    const [paymentOrder, setPaymentOrder] = useState<CourierOrder | null>(null);
    const [settings, setSettings] = useState<any>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [isDriveStarted, setIsDriveStarted] = useState(false);
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        if (typeof navigator === 'undefined') return true;
        return navigator.onLine;
    });
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const [pinModal, setPinModal] = useState<{ open: boolean; orderId: number | null; nextStatus: string; deliveryData?: any } | null>(null);
    const [cancelOrder, setCancelOrder] = useState<CourierOrder | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const currency = settings?.currency || '₺';

    useEffect(() => {
        const handlePrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            // Show banner after 5 seconds if not installed
            setTimeout(() => setShowInstallBanner(true), 5000);
        };

        window.addEventListener('beforeinstallprompt', handlePrompt);
        return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowInstallBanner(false);
        }
        setDeferredPrompt(null);
    };

    // Reset navigation states when view changes
    useEffect(() => {
        setIsNavigating(false);
        setIsDriveStarted(false);
    }, [view]);

    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    // Dynamic Geolocation Effect (Top Level)
    useEffect(() => {
        if (!("geolocation" in navigator)) return;
        
        const watcher = navigator.geolocation.watchPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => console.log("GPS Error:", err),
            { enableHighAccuracy: true }
        );
        return () => navigator.geolocation.clearWatch(watcher);
    }, []);

    const fetchData = useCallback(async (isSilent = false) => {
        const headers = getAuthHeaders();
        if (!headers['Authorization']) return;

        if (!isSilent) setRefreshing(true);
        try {
            const [ordersResp, histResp, settingsResp] = await Promise.all([
                fetch('/api/v1/orders?deliveryQueue=true', { headers }),
                fetch('/api/v1/orders?limit=10&status=completed', { headers }),
                /** Kurye rolü admin/settings’e erişemez; tüm oturum açık roller için sync/settings */
                fetch('/api/v1/sync/settings', { headers }),
            ]);
            
            if (ordersResp.status === 401) {
                logout();
                return;
            }

            if (ordersResp.ok) setOrders(await ordersResp.json());
            if (histResp.ok) setHistory(await histResp.json());
            if (settingsResp.ok) setSettings(await settingsResp.json());
        } catch (err) {
            if (!isSilent) toast.error(t('courier.toast_conn'));
        } finally {
            setRefreshing(false);
        }
    }, [getAuthHeaders, logout, t]);

    useCourierRealtimeSync(useCallback(() => fetchData(true), [fetchData]), userLocation);

    useEffect(() => {
        fetchData();
        const iv = setInterval(() => fetchData(true), 15000); 
        return () => clearInterval(iv);
    }, [fetchData]);

    const handleAction = async (orderId: number, action: 'pickup' | 'deliver' | 'cancel', extraData?: any) => {
        const order = orders.find(o => o.id === orderId);
        
        // 🛡️ Security Check: Require PIN if enabled for pickups or sensitive deliveries
        if (settings?.pickupSecurity?.requirePIN && !extraData?.pinCode && (action === 'pickup' || action === 'deliver')) {
            setPinModal({ open: true, orderId, nextStatus: action, deliveryData: extraData });
            return;
        }

        if (action === 'deliver' && order?.payment_status !== 'paid' && !extraData) {
            setPaymentOrder(order || null);
            return;
        }

        const endpoint = action === 'pickup' ? 'pickup' : 'status';
        let body: any = {};
        let method = 'PATCH';
        
        if (action === 'deliver') {
            body = { 
                status: 'completed', 
                payment_status: 'paid',
                payment_method_arrival: extraData?.method || order?.payment_method_arrival,
                tip_amount: extraData?.tip || 0,
                pinCode: extraData?.pinCode
            };
        } else if (action === 'pickup') {
            method = 'POST';
            body = { pinCode: extraData?.pinCode };
        } else if (action === 'cancel') {
            if (!extraData?.reason) {
                setCancelOrder(order || null);
                setCancelReason('');
                return;
            }
            body = { status: 'cancelled', notes: String(extraData.reason) };
        }

        try {
            const resp = await fetch(`/api/v1/orders/${orderId}/${endpoint}`, {
                method,
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (resp.ok) {
                toast.success(
                    action === 'pickup' ? t('courier.toast_pickup_ok') : 
                    action === 'deliver' ? t('courier.toast_deliver_ok') : t('courier.toast_cancel_ok')
                );
                
                if (action === 'pickup') {
                    setActiveTab('active');
                } else {
                    setIsNavigating(false);
                    setIsDriveStarted(false);
                    setNavigationOrder(null);
                }

                setSelectedOrder(null);
                setPaymentOrder(null);
                setPinModal(null);
                setCancelOrder(null);
                fetchData(true);
            } else {
                const err = await resp.json();
                if (err.error === 'INVALID_PIN') {
                    toast.error(t('courier.toast_pin_bad'), { id: 'pin-err' });
                } else {
                    toast.error(err.error || t('courier.toast_action_fail'));
                }
                fetchData(true);
            }
        } catch (err) {
            toast.error(t('courier.toast_server'));
        }
    };

    const myCourierId = Number(user?.id);

    /** Sadece paket servisi; hazır havuz veya bu kuryeye atanmış. Başka kuryenin yükü listelenmez. */
    const readyOrders = useMemo(() => {
        return orders.filter(
            (o) =>
                o.order_type === 'delivery' &&
                o.status === 'ready' &&
                (o.courier_id == null || o.courier_id === '' || Number(o.courier_id) === myCourierId),
        );
    }, [orders, myCourierId]);

    const shippedOrders = useMemo(() => {
        return orders.filter(
            (o) =>
                o.order_type === 'delivery' &&
                o.status === 'shipped' &&
                Number(o.courier_id) === myCourierId,
        );
    }, [orders, myCourierId]);

    const readyGroups = useMemo(() => groupCourierOrdersByRoute(readyOrders, lang as PosLang), [readyOrders, lang]);
    const shippedGroups = useMemo(() => groupCourierOrdersByRoute(shippedOrders, lang as PosLang), [shippedOrders, lang]);
    const listGroups = activeTab === 'pending' ? readyGroups : shippedGroups;

    const myDeliveryHistory = useMemo(
        () =>
            history.filter(
                (h) => h.order_type === 'delivery' && Number(h.courier_id) === myCourierId,
            ),
        [history, myCourierId],
    );

    const stats = useMemo(() => {
        const completed = myDeliveryHistory.filter((o) => o.status === 'completed');
        const count = completed.length;
        const earnings = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);

        let totalMinutes = 0;
        let countedOrders = 0;
        completed.forEach((o) => {
            if (o.created_at && o.updated_at) {
                const start = new Date(o.created_at).getTime();
                const end = new Date(o.updated_at).getTime();
                const diff = (end - start) / 60000;
                if (diff > 0 && diff < 120) {
                    totalMinutes += diff;
                    countedOrders++;
                }
            }
        });
        const avgTime = countedOrders > 0 ? Math.round(totalMinutes / countedOrders) : 0;
        const performance = count > 0 ? Math.min(100, 85 + count * 0.5) : 0;

        return { count, earnings, avgTime, performance };
    }, [myDeliveryHistory]);

    const renderOrdersView = () => (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pb-10"
        >
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 mb-8 mx-5 glass">
                <button 
                    onClick={() => setActiveTab('pending')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                        activeTab === 'pending' ? 'bg-[#e91e63] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    {t('courier.tab_ready')}
                    <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[9px] font-black ${activeTab === 'pending' ? 'bg-white/20' : 'bg-white/10'}`}>
                        {readyOrders.length}
                    </span>
                </button>
                <button 
                    onClick={() => setActiveTab('active')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                        activeTab === 'active' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    {t('courier.tab_active')}
                    <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[9px] font-black ${activeTab === 'active' ? 'bg-white/20' : 'bg-white/10'}`}>
                        {shippedOrders.length}
                    </span>
                </button>
            </div>

            <div className="px-5 space-y-6">
                <AnimatePresence mode="popLayout">
                    {listGroups.length > 0 ? (
                        listGroups.map((group) => (
                            <div key={`grp-${group.key}`} className="space-y-3">
                                {group.orders.length > 1 && (
                                    <div className="flex items-center justify-between gap-3 px-1 pt-1">
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.25em]">
                                                {t('courier.route_region_title')}
                                            </p>
                                            <p className="text-[11px] font-bold text-slate-300 truncate">{group.display}</p>
                                        </div>
                                        <span className="shrink-0 text-[10px] font-black tabular-nums text-white bg-blue-500/20 px-3 py-1.5 rounded-xl border border-blue-500/30">
                                            {tpl(t, 'courier.route_orders_sum', {
                                                n: group.orders.length,
                                                amount: `${currency}${group.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0).toLocaleString()}`,
                                            })}
                                        </span>
                                    </div>
                                )}
                                <div className="space-y-4">
                                    {group.orders.map((order) => (
                                        <OrderCard
                                            key={`order-${order.id}`}
                                            order={order}
                                            currency={currency}
                                            routeGroupSize={group.orders.length > 1 ? group.orders.length : undefined}
                                            onClick={() => setSelectedOrder(order)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="py-32 text-center"
                        >
                            <div className="w-20 h-20 bg-white/[0.02] rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-white/5 shadow-inner">
                                <FiPackage className="text-slate-800" size={36} />
                            </div>
                            <p className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-700">{t('courier.empty_title')}</p>
                            <p className="text-[10px] font-bold text-slate-800/50 mt-2 uppercase">{t('courier.empty_sub')}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );

    const renderHistoryView = () => (
        <div className="px-5 pb-10">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 px-1 flex items-center gap-3">
                <FiList className="text-[#e91e63]" /> {t('courier.history_title')}
            </h2>
            <div className="space-y-3">
                {myDeliveryHistory.length > 0 ? (
                    myDeliveryHistory.map((h) => (
                        <motion.div 
                            whileTap={{ scale: 0.98 }}
                            key={h.id} 
                            onClick={() => setSelectedOrder(h)}
                            className="bg-white/[0.02] border border-white/5 p-5 rounded-3xl flex justify-between items-center transition-all hover:bg-white/[0.05] active:border-white/20 cursor-pointer"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-black text-slate-500">#{h.id}</span>
                                    <h4 className="text-sm font-bold text-white uppercase truncate">{h.customer_name || t('courier.customer')}</h4>
                                </div>
                                <p className="text-[10px] font-medium text-slate-500 truncate italic">{h.delivery_address || t('courier.address_info_missing')}</p>
                            </div>
                            <div className="text-right ml-4 shrink-0">
                                <p className="text-sm font-black text-white italic">{currency}{Number(h.total_amount).toFixed(0)}</p>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${h.status === 'completed' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {h.status === 'completed' ? t('courier.badge_delivered') : t('courier.badge_cancelled')}
                                </span>
                            </div>
                        </motion.div>
                    ))
                ) : (
                     <div className="py-24 text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{t('courier.history_empty')}</p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderProfileView = () => (
        <div className="px-5 pb-10 space-y-6">
            <div className="bg-gradient-to-br from-[#1e293b] to-[#020617] border border-white/5 p-8 rounded-[40px] text-center relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-full bg-[#e91e63]/5 blur-3xl -z-10" />
                <div className="relative inline-block mb-4">
                    <div className="w-24 h-24 bg-gradient-to-tr from-[#e91e63] to-rose-400 rounded-[36px] mx-auto flex items-center justify-center text-white shadow-2xl shadow-rose-500/40 rotate-3 transition-transform hover:rotate-0">
                        <FiUser size={48} />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 border-4 border-[#1e293b] rounded-full flex items-center justify-center animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                </div>
                <h3 className="text-2xl font-black text-white tracking-tight">{user?.name}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2 flex justify-center items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> {t('courier.profile_partner')}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 flex flex-col justify-between">
                    <div>
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mb-4">
                            <FiCheckCircle size={20} />
                        </div>
                        <p className="text-3xl font-black text-white">{stats.count}</p>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{t('courier.stat_orders')}</p>
                    </div>
                </div>
                <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 flex flex-col justify-between">
                    <div>
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-4">
                            <FiClock size={20} />
                        </div>
                        <p className="text-3xl font-black text-white">{stats.avgTime}<span className="text-xs text-slate-500 ml-1">{t('courier.stat_avg_suffix')}</span></p>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{t('courier.stat_avg_delivery')}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white/5 p-6 rounded-[32px] border border-white/5">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">{t('courier.rating_title')}</h4>
                        <p className="text-[10px] font-bold text-slate-500 italic">{t('courier.rating_sub')}</p>
                    </div>
                    <span className="text-2xl font-black text-emerald-400">%{stats.performance.toFixed(0)}</span>
                </div>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div 
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                        style={{ width: `${stats.performance}%` }}
                    />
                </div>
            </div>

            <div className="bg-white/5 p-6 rounded-[32px] border border-white/5">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-black text-white uppercase tracking-widest">{t('courier.system_title')}</h4>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${userLocation ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500 animate-pulse'}`}>
                        {userLocation ? t('courier.gps_on') : t('courier.gps_off')}
                    </span>
                </div>
                {!userLocation && (
                    <div className="mt-4 space-y-3">
                        <p className="text-[9px] font-bold text-rose-500/60 uppercase leading-relaxed italic">
                            {t('courier.gps_hint')}
                        </p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-rose-500/20 transition-all"
                        >
                            <FiRefreshCw size={14} /> {t('courier.gps_retry')}
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white/5 p-6 rounded-[32px] border border-white/5">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-[#e91e63]/10 text-[#e91e63] rounded-2xl flex items-center justify-center">
                        <FiPieChart size={20} />
                    </div>
                    <h4 className="text-xs font-black text-white uppercase tracking-widest">{t('courier.earnings_title')}</h4>
                </div>
                
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-slate-500 italic">{t('courier.earnings_total')}</span>
                        <span className="font-black text-white">{currency}{Number(stats.earnings).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-slate-500 italic">{t('courier.earnings_tip_est')}</span>
                        <span className="font-black text-emerald-400">{currency}{(Number(stats.earnings) * 0.08).toFixed(2)}</span>
                    </div>
                    <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">{t('courier.earnings_net')}</span>
                        <span className="text-2xl font-black text-emerald-500">{currency}{(Number(stats.earnings) * 1.08).toFixed(0)}</span>
                    </div>
                </div>
            </div>

            <div className="pt-2">
                <button 
                    onClick={logout}
                    className="w-full flex items-center justify-between bg-rose-500/5 hover:bg-rose-500/10 text-rose-500/50 hover:text-rose-500 p-6 rounded-[28px] border border-rose-500/10 transition-all font-black text-[10px] uppercase tracking-widest group"
                >
                    {t('courier.logout_safe')} <FiLogOut size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );

    const closeNavigation = () => {
        setIsNavigating(false);
        setIsDriveStarted(false);
        setNavigationOrder(null);
    };

    const renderNavigationView = () => {
        const navOrder = navigationOrder;
        if (!navOrder) return null;
        const config = COMPANY_CONFIG[navOrder.source || 'default'] || COMPANY_CONFIG.default;
        const effectiveLoc = import.meta.env.DEV ? MOCK_LOCATION : userLocation;
        const links = buildCourierNavLinks(navOrder, effectiveLoc, t);
        const mapsEmbedUrl = `${links.embed}${isDriveStarted ? '&z=17' : ''}`;

        return (
            <div className="fixed inset-0 z-[100] bg-[#0b0f19] flex flex-col animate-in fade-in duration-300 overflow-hidden font-sans">
                <div className="absolute top-0 left-0 right-0 z-[110] p-4 pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto shadow-2xl">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[8px] font-black shrink-0" style={{ backgroundColor: config.color }}>
                            {config.logo}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[11px] font-black text-white/90 leading-tight truncate uppercase tracking-widest">{navOrder.customer_name}</h2>
                            <p className="text-[9px] text-white/40 font-bold leading-tight truncate">{navOrder.delivery_address}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <a href={`tel:${navOrder.delivery_phone}`} className="w-8 h-8 bg-emerald-500/20 text-emerald-500 rounded-lg flex items-center justify-center">
                                <FiPhone size={14} />
                            </a>
                            <button type="button" onClick={closeNavigation} className="w-8 h-8 bg-white/5 text-white/40 rounded-lg flex items-center justify-center">
                                <FiX size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative flex flex-col pt-[4.5rem] pb-[7.5rem]">
                    <div className="px-4 pb-3 flex flex-wrap gap-2 z-[105]">
                        <a
                            href={links.googleWeb}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest shadow-lg border border-blue-500/40"
                        >
                            <FiNavigation size={14} /> {t('courier.nav_google')}
                        </a>
                        <a
                            href={links.waze}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#33ccff]/20 text-[#7ddbff] font-black text-[9px] uppercase tracking-widest border border-[#33ccff]/40"
                        >
                            Waze
                        </a>
                        <a
                            href={links.apple}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 text-white/90 font-black text-[9px] uppercase tracking-widest border border-white/15"
                        >
                            {t('courier.nav_apple')}
                        </a>
                    </div>

                    <div className="flex-1 min-h-0 relative">
                        {isOnline ? (
                            <iframe
                                key={`map-view-${isDriveStarted}-${navOrder.id}`}
                                src={mapsEmbedUrl}
                                className={`absolute inset-0 w-full h-full border-0 transition-all duration-700 ${isDriveStarted ? 'brightness-100 contrast-[1.05]' : 'brightness-[0.55] grayscale-[0.35]'}`}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title={t('courier.map_preview_title')}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
                                <div className="mx-4 max-w-xl rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5 text-center">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-300">
                                        Offline Harita Fallback
                                    </p>
                                    <p className="mt-2 text-sm font-bold text-white">
                                        Internet yok. Harita tile onizleme yerine adres ve hizli aksiyon gosteriliyor.
                                    </p>
                                    <p className="mt-3 rounded-xl bg-black/20 px-3 py-2 text-xs text-white/90">
                                        {navOrder.delivery_address || t('courier.address_missing')}
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-white/80 md:grid-cols-2">
                                        <p>
                                            <span className="font-black text-white">Musteri:</span> {navOrder.customer_name || '-'}
                                        </p>
                                        <p>
                                            <span className="font-black text-white">Tel:</span> {navOrder.delivery_phone || '-'}
                                        </p>
                                    </div>
                                    <p className="mt-3 text-[11px] text-amber-200">
                                        Baglanti gelince harita otomatik geri yuklenir.
                                    </p>
                                </div>
                            </div>
                        )}

                        {!isDriveStarted && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[108]">
                                <div className="pointer-events-auto text-center px-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsDriveStarted(true);
                                            const opened = window.open(links.googleWeb, '_blank', 'noopener,noreferrer');
                                            if (!opened) {
                                                toast.error(t('courier.map_popup_blocked'), { icon: '🔒', duration: 6000 });
                                            } else {
                                                toast.success(t('courier.nav_toast_opened'), { icon: '🗺️' });
                                            }
                                        }}
                                        className="group relative"
                                    >
                                        <div className="absolute inset-0 bg-blue-600 rounded-full blur-2xl opacity-40 group-hover:opacity-60 transition-opacity animate-pulse" />
                                        <div className="relative bg-white text-blue-600 w-24 h-24 rounded-full flex flex-col items-center justify-center font-black text-[10px] tracking-[0.2em] shadow-2xl transition-transform active:scale-90">
                                            <FiNavigation size={24} className="mb-1 transform rotate-45" />
                                            {t('courier.nav_start')}
                                        </div>
                                    </button>
                                    <p className="mt-4 text-[9px] font-bold text-white/50 uppercase tracking-widest max-w-[240px] mx-auto leading-relaxed">
                                        {t('courier.nav_hint')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-6 left-4 right-4 z-[120] pointer-events-none">
                        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-[28px] p-4 pointer-events-auto shadow-2xl flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                                    <FiMapPin size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">{t('courier.nav_delivery_label')}</p>
                                    <p className="text-xs font-bold text-white truncate">#{navOrder.id} · {navOrder.delivery_address?.split(',')[0]}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleAction(navOrder.id, 'deliver')}
                                className="shrink-0 bg-[#10b981] hover:bg-[#059669] text-white px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-2"
                            >
                                <FiCheckCircle size={14} /> {t('courier.nav_done')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMessagesView = () => (
        <div className="px-5 pb-10">
            <h2 className="text-sm font-black text-white uppercase tracking-widest mb-6 px-1 flex items-center gap-3">
                <FiMessageSquare className="text-[#e91e63]" /> {t('courier.messages_title')}
            </h2>
            <div className="space-y-4 font-sans">
                <div className="bg-[#e91e63]/10 border border-[#e91e63]/20 p-5 rounded-[24px] relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black text-[#e91e63] uppercase tracking-widest bg-[#e91e63]/20 px-2 py-0.5 rounded-full">{t('courier.msg_system')}</span>
                        <span className="text-[8px] font-bold text-slate-500">{t('courier.msg_just_now')}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-200 leading-relaxed">{t('courier.msg_web_order')}</p>
                </div>

                <div className="bg-white/5 border border-white/10 p-5 rounded-[24px] opacity-70">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full">{t('courier.msg_admin')}</span>
                        <span className="text-[8px] font-bold text-slate-500">{t('courier.msg_hours_ago')}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-400 leading-relaxed">{t('courier.msg_busy')}</p>
                </div>

                <div className="py-20 text-center opacity-30">
                    <FiInbox className="mx-auto mb-4" size={40} />
                    <p className="text-[9px] font-black uppercase tracking-[0.3em]">{t('courier.msg_footer')}</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans pb-24 overflow-x-hidden relative">
            {/* Rhythmic Field Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <motion.div 
                    animate={{ 
                        scale: [1, 1.2, 1],
                        opacity: [0.03, 0.08, 0.03],
                    }}
                    transition={{ duration: 15, repeat: Infinity }}
                    className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-rose-500 blur-[120px]"
                />
                <motion.div 
                    animate={{ 
                        scale: [1, 1.3, 1],
                        opacity: [0.03, 0.08, 0.03],
                    }}
                    transition={{ duration: 20, repeat: Infinity, delay: 2 }}
                    className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600 blur-[150px]"
                />
            </div>

            <div className="relative z-10 flex flex-col min-h-screen">
                {/* Pulse Side Menu */}
                <AnimatePresence>
                    {isMenuOpen && (
                        <div className="fixed inset-0 z-[100]">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/95 backdrop-blur-2xl" 
                                onClick={() => setIsMenuOpen(false)} 
                            />
                            <motion.div 
                                initial={{ x: '100%', opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: '100%', opacity: 0 }}
                                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                                className="absolute top-0 right-0 w-[85%] max-w-[320px] h-full bg-[#080c16]/80 backdrop-blur-3xl border-l border-white/5 shadow-2xl"
                            >
                                <div className="p-10 pt-16 flex flex-col h-full">
                                    <div className="mb-16">
                                        <h2 className="text-3xl font-black italic tracking-tighter text-white uppercase leading-none">NEXT<span className="text-rose-500">POS</span></h2>
                                        <div className="flex items-center gap-2 mt-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">{t('courier.menu_logistics')}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 flex-1">
                                        {[
                                            { id: 'orders', label: t('courier.menu_orders'), icon: <FiPackage /> },
                                            { id: 'history', label: t('courier.menu_history'), icon: <FiList /> },
                                            { id: 'profile', label: t('courier.menu_profile'), icon: <FiPieChart /> },
                                            { id: 'messages', label: t('courier.menu_messages'), icon: <FiMessageSquare /> },
                                        ].map((item) => (
                                            <button 
                                                key={item.id}
                                                onClick={() => { setView(item.id as any); setIsMenuOpen(false); }}
                                                className={`w-full flex items-center justify-between p-5 rounded-[24px] font-black text-[10px] uppercase tracking-widest transition-all border ${
                                                    view === item.id ? 'bg-white/5 text-white border-white/10 shadow-xl' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <span className={`text-xl ${view === item.id ? 'text-rose-500' : ''}`}>{item.icon}</span>
                                                    {item.label}
                                                </div>
                                                <FiChevronRight className={`transition-transform ${view === item.id ? 'rotate-90 text-rose-500' : 'opacity-20'}`} />
                                            </button>
                                        ))}
                                    </div>

                                    <div className="pt-10 border-t border-white/5">
                                        <div className="flex items-center gap-5 mb-10 bg-white/5 p-4 rounded-3xl border border-white/5">
                                            <div className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-rose-500 shadow-xl"><FiUser size={24} /></div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black text-white uppercase italic tracking-tighter truncate">{user?.name}</p>
                                                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">{t('courier.ready_duty')}</p>
                                            </div>
                                        </div>
                                        <button onClick={logout} className="w-full h-14 glass rounded-2xl text-rose-500 font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 active:scale-95 transition-all">
                                            <FiLogOut /> {t('courier.session_close')}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Mission Header */}
                <div className="sticky top-0 z-[80] bg-[#020617]/40 backdrop-blur-3xl px-8 pt-10 pb-6 border-b border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-3xl opacity-50" />
                    <div className="flex justify-between items-end mb-4 font-sans relative z-10">
                        <motion.div 
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="flex flex-col"
                        >
                            <h1 className="text-4xl font-black italic tracking-tighter text-white leading-none uppercase">NEXT<span className="text-rose-500">POS</span></h1>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.5em] italic">
                                    {view === 'orders' ? t('courier.header_tasks') : view === 'history' ? t('courier.header_logs') : view === 'profile' ? t('courier.header_metrics') : t('courier.header_comms')}
                                </span>
                            </div>
                        </motion.div>
                        <div className="flex items-center gap-3">
                            <motion.button 
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setView('messages')}
                                className="w-14 h-14 glass rounded-2xl flex items-center justify-center text-slate-400 relative border-white/5 hover:border-white/20 transition-all shadow-xl"
                            >
                                <FiBell size={24} />
                                <span className="absolute top-4 right-4 w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_15px_#f43f5e] animate-pulse" />
                            </motion.button>
                            <motion.button 
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setIsMenuOpen(true)}
                                className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white shadow-xl hover:bg-white/10 transition-all"
                            >
                                <div className="w-6 flex flex-col items-end gap-1.5">
                                    <div className="w-full h-0.5 bg-white rounded-full" />
                                    <div className="w-4 h-0.5 bg-white rounded-full opacity-60" />
                                </div>
                            </motion.button>
                        </div>
                    </div>
                </div>

                <main className="flex-1 pt-8 px-6 overflow-x-hidden">
                    <AnimatePresence mode="wait">
                        {refreshing && !orders.length ? (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center justify-center py-32 opacity-20"
                            >
                                <FiRefreshCw className="animate-spin text-rose-500" size={48} />
                                <p className="text-[10px] font-black text-white uppercase tracking-[0.5em] mt-8">{t('courier.loading')}</p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={view}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                {view === 'orders' && renderOrdersView()}
                                {view === 'history' && renderHistoryView()}
                                {view === 'profile' && renderProfileView()}
                                {view === 'messages' && renderMessagesView()}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                {/* Pulse Mobile Dock */}
                <div className="fixed bottom-8 left-8 right-8 z-[90] md:hidden">
                    <div className="glass-dark border border-white/10 rounded-[35px] p-2.5 flex items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-3xl">
                        {[
                            { id: 'orders', icon: <FiPackage />, label: t('courier.dock_jobs') },
                            { id: 'history', icon: <FiList />, label: t('courier.dock_logs') },
                            { id: 'profile', icon: <FiPieChart />, label: t('courier.dock_meta') },
                            { id: 'messages', icon: <FiMessageSquare />, label: t('courier.dock_chat') },
                        ].map((btn) => (
                            <button
                                key={btn.id}
                                onClick={() => setView(btn.id as any)}
                                className={`flex-1 flex flex-col items-center gap-1.5 py-4 px-2 rounded-[28px] transition-all relative ${
                                    view === btn.id ? 'bg-rose-600 text-white shadow-xl shadow-rose-900/40' : 'text-slate-500'
                                }`}
                            >
                                <span className={`${view === btn.id ? 'scale-125' : 'scale-100'} transition-transform duration-300`}>
                                    {React.cloneElement(btn.icon as any, { size: 20 })}
                                </span>
                                <span className="text-[8px] font-black uppercase tracking-[0.2em]">{btn.label}</span>
                                {view === btn.id && (
                                    <motion.div 
                                        layoutId="nav_glow"
                                        className="absolute -bottom-1 w-1 h-1 bg-white rounded-full shadow-[0_0_10px_white]"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {selectedOrder && (
                    <OrderDetailSheet 
                        order={selectedOrder} 
                        currency={currency}
                        onClose={() => setSelectedOrder(null)}
                        onAction={(act: 'pickup' | 'deliver' | 'cancel') => handleAction(selectedOrder.id, act)}
                        onNavigate={() => {
                            setNavigationOrder(selectedOrder);
                            setSelectedOrder(null);
                            setIsNavigating(true);
                        }}
                        currentPos={userLocation}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {paymentOrder && (
                    <PaymentModal 
                        order={paymentOrder}
                        settings={settings}
                        currency={currency}
                        onClose={() => setPaymentOrder(null)}
                        onComplete={(method, tip) => handleAction(paymentOrder.id, 'deliver', { method, tip })}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isNavigating && navigationOrder && renderNavigationView()}
            </AnimatePresence>

            <AnimatePresence>
                {pinModal?.open && (
                    <HandoverPINModal 
                        onClose={() => setPinModal(null)}
                        onConfirm={(pin) => handleAction(pinModal.orderId!, pinModal.nextStatus as any, { pinCode: pin, ...pinModal.deliveryData })}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {cancelOrder && (
                    <CancelOrderModal
                        title={t('courier.cancel_btn')}
                        description={t('courier.cancel_confirm')}
                        reason={cancelReason}
                        setReason={setCancelReason}
                        onClose={() => {
                            setCancelOrder(null);
                            setCancelReason('');
                        }}
                        onConfirm={() => {
                            const r = cancelReason.trim();
                            if (!r) {
                                toast.error(t('courier.cancel_reason_required'));
                                return;
                            }
                            if (!window.confirm(t('courier.cancel_confirm'))) return;
                            void handleAction(cancelOrder.id, 'cancel', { reason: r });
                        }}
                    />
                )}
            </AnimatePresence>

            {/* PWA Install Banner */}
            <AnimatePresence>
                {showInstallBanner && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-24 left-4 right-4 z-[200] bg-[#e91e63] rounded-3xl p-5 shadow-2xl flex items-center justify-between gap-4 border border-rose-400/20"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white">
                                <FiPackage size={24} />
                            </div>
                            <div className="min-w-0">
                                <h4 className="text-[11px] font-black text-white uppercase tracking-widest leading-none mb-1">{t('courier.install_title')}</h4>
                                <p className="text-[9px] font-bold text-white/70 leading-tight">{t('courier.install_sub')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setShowInstallBanner(false)}
                                className="px-4 py-3 bg-black/10 text-white text-[10px] font-black uppercase rounded-xl hover:bg-black/20 transition-all font-sans"
                            >
                                {t('courier.install_no')}
                            </button>
                            <button 
                                onClick={handleInstallClick}
                                className="px-6 py-3 bg-white text-[#e91e63] text-[10px] font-black uppercase rounded-xl shadow-lg active:scale-95 transition-all font-sans"
                            >
                                {t('courier.install_yes')}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
