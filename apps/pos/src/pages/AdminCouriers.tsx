import React, { useEffect, useState, useMemo } from 'react';
import { 
    FiUser, FiPackage, FiActivity, FiMapPin, FiClock, 
    FiCheckCircle, FiDollarSign, FiSearch,
    FiMap, FiList, FiAlertCircle, FiRefreshCw 
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useNavigate } from 'react-router-dom';

interface CourierTodayStats {
    total_deliveries: number;
    cash_collected: number;
    outstanding_cash: number;
    card_collected: number;
    avg_delivery_time: number;
}

interface CourierStats {
    id: number;
    name: string;
    username: string;
    isOnline: boolean;
    location: { lat: number; lng: number } | null;
    lastSeen: number | null;
    today: CourierTodayStats;
}

interface CourierDetail {
    courier: { id: number; name: string; username: string };
    recentOrders: any[];
    totalCashToDeliver: number;
}

export const AdminCouriers: React.FC = () => {
    const navigate = useNavigate();
    const { tenantId, token, getAuthHeaders } = useAuthStore();
    const { settings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '₺';
    const [couriers, setCouriers] = useState<CourierStats[]>([]);
    const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
    const [courierDetail, setCourierDetail] = useState<CourierDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [searchTerm, setSearchTerm] = useState('');
    const socketRef = React.useRef<Socket | null>(null);

    const fetchStats = async () => {
        if (!tenantId) return;
        try {
            const resp = await fetch('/api/v1/admin/couriers/stats', {
                headers: getAuthHeaders()
            });
            if (resp.status === 403) {
                setLocked(true);
                setCouriers([]);
                return;
            }
            setLocked(false);
            if (resp.ok) {
                const data = await resp.json();
                setCouriers(data);
            }
        } catch (err) {
            console.error('fetchStats error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestLocation = (_id: number) => {
        if (!socketRef.current) return;
        socketRef.current.emit('admin:request_courier_location', { tenantId });
        toast.success('Konum isteği gönderildi');
    };

    useEffect(() => {
        if (!token || !tenantId) return;

        const socket = io({
            path: '/socket.io',
            transports: ['websocket'],
            auth: { token }
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join:tenant', tenantId);
        });

        socket.on('presence:staff_update', (data: any) => {
            if (data.tenantId === tenantId) {
                setCouriers(prev => prev.map(c => {
                    const match = data.staff.find((s: any) => String(s.userId) === String(c.id));
                    if (match && match.location) {
                        return { ...c, location: match.location, isOnline: true };
                    }
                    return c;
                }));
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [token, tenantId]);

    const fetchDetail = async (id: number) => {
        try {
            const resp = await fetch(`/api/v1/admin/couriers/${id}/details`, {
                headers: getAuthHeaders()
            });
            if (resp.status === 403) {
                setLocked(true);
                setCourierDetail(null);
                return;
            }
            setLocked(false);
            if (resp.ok) {
                const data = await resp.json();
                setCourierDetail(data);
            }
        } catch (err) {
            toast.error('Kurye detayları yüklenemedi');
        }
    };

    const handleReconcile = async () => {
        if (!selectedCourierId) return;
        try {
            const resp = await fetch(`/api/v1/admin/couriers/${selectedCourierId}/reconcile`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (resp.status === 403) {
                setLocked(true);
                return;
            }
            setLocked(false);
            if (resp.ok) {
                toast.success('Tahsilat onaylandı');
                fetchStats();
                fetchDetail(selectedCourierId);
            } else {
                toast.error('Tahsilat işlemi başarısız');
            }
        } catch (err) {
            toast.error('Bağlantı hatası');
        }
    };

    useEffect(() => {
        fetchStats();
        const iv = setInterval(fetchStats, 10000); // 10s live update
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (selectedCourierId) {
            fetchDetail(selectedCourierId);
        } else {
            setCourierDetail(null);
        }
    }, [selectedCourierId]);

    const filteredCouriers = useMemo(() => {
        return couriers.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [couriers, searchTerm]);

    const totalOutstandingToday = useMemo(() => 
        couriers.reduce((sum, c) => sum + (c.today?.outstanding_cash || 0), 0)
    , [couriers]);

    const totalDeliveriesToday = useMemo(() => 
        couriers.reduce((sum, c) => sum + (c.today?.total_deliveries || 0), 0)
    , [couriers]);

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.courier.desc')}</div>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/settings', { replace: true })}
                        className="rounded-xl border border-violet-500/40 bg-violet-600/30 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                    >
                        {t('modules.locked.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="flex-1 overflow-auto bg-[#0a0f18] text-white p-4 md:p-8">
            <header className="mb-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <motion.h2 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-4xl font-black italic tracking-tighter uppercase mb-2"
                        >
                            Logistics <span className="text-blue-500">Control Center</span>
                        </motion.h2>
                        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">
                            Live Courier Performance & Financial Reconciliation
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                type="text"
                                placeholder="Kurye Ara..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-sm font-bold focus:outline-none focus:border-blue-500/50 transition-all w-64"
                            />
                        </div>
                        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/5">
                            <button 
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-blue-600 shadow-lg text-white' : 'text-slate-500 hover:text-white'}`}
                            >
                                <FiMap size={18} />
                            </button>
                            <button 
                                onClick={() => setViewMode('table')}
                                className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-blue-600 shadow-lg text-white' : 'text-slate-500 hover:text-white'}`}
                            >
                                <FiList size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Global Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-12">
                    {[
                        { label: 'Bugün Toplam Teslimat', value: totalDeliveriesToday, icon: <FiPackage />, color: 'blue' },
                        { label: 'Tahsil Edilecek Nakit', value: `${currency}${totalOutstandingToday.toLocaleString()}`, icon: <FiDollarSign />, color: 'emerald' },
                        { label: 'Aktif Kurye', value: couriers.filter(c => c.isOnline).length, icon: <FiActivity />, color: 'rose' },
                        { label: 'Ort. Teslimat Süresi', value: '18 dk', icon: <FiClock />, color: 'amber' },
                    ].map((stat, i) => (
                        <motion.div 
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-white/[0.03] border border-white/10 rounded-[32px] p-6 relative overflow-hidden group hover:border-white/20 transition-all"
                        >
                            <div className={`absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity text-4xl text-${stat.color}-500`}>
                                {stat.icon}
                            </div>
                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{stat.label}</p>
                            <h4 className="text-3xl font-black tracking-tighter tabular-nums">{stat.value}</h4>
                        </motion.div>
                    ))}
                </div>
            </header>

            {loading && couriers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 gap-6">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-2xl shadow-blue-500/20" />
                    <p className="text-slate-500 font-black uppercase tracking-widest text-xs animate-pulse">Lojistik verileri senkronize ediliyor...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Courier List */}
                    <div className={`${selectedCourierId ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            <AnimatePresence mode="popLayout">
                                {filteredCouriers.map((courier) => (
                                    <motion.div
                                        layout
                                        key={courier.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        onClick={() => setSelectedCourierId(courier.id === selectedCourierId ? null : courier.id)}
                                        className={`glass-dark rounded-[32px] p-6 cursor-pointer border-2 transition-all relative overflow-hidden ${selectedCourierId === courier.id ? 'border-blue-500 bg-blue-500/[0.05] shadow-2xl shadow-blue-500/10' : 'border-white/5 hover:border-white/20'}`}
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center relative ${courier.isOnline ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-600'}`}>
                                                    <FiUser size={24} />
                                                    {courier.isOnline && (
                                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-4 border-[#0a0f18] animate-pulse" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-lg tracking-tight uppercase italic">{courier.name}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${courier.isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                                            {courier.isOnline ? 'Active' : 'Offline'}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500 font-bold">@{courier.username}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-emerald-400 font-black text-xl italic tabular-nums">
                                                {currency}{courier.today?.outstanding_cash.toLocaleString()}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <FiPackage size={12} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Teslimat</span>
                                                </div>
                                                <p className="text-xl font-black tabular-nums">{courier.today?.total_deliveries} <span className="text-slate-600 text-xs font-bold uppercase italic ml-1">adet</span></p>
                                            </div>
                                            <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <FiClock size={12} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Hız</span>
                                                </div>
                                                <p className="text-xl font-black tabular-nums">
                                                    {courier.today?.avg_delivery_time > 0 ? Math.round(courier.today.avg_delivery_time) : '--'} 
                                                    <span className="text-slate-600 text-xs font-bold uppercase italic ml-1">dk</span>
                                                </p>
                                            </div>
                                        </div>

                                        {courier.location && (
                                            <div className="mt-4 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                                                        <FiMapPin className="text-blue-500 animate-bounce" size={14} />
                                                        {courier.location.lat.toFixed(4)}, {courier.location.lng.toFixed(4)}
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleRequestLocation(courier.id); }}
                                                        className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all"
                                                        title="Konum İste"
                                                    >
                                                        <FiRefreshCw size={14} />
                                                    </button>
                                                </div>
                                                <a 
                                                    href={`https://www.google.com/maps?q=${courier.location.lat},${courier.location.lng}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                >
                                                    <FiMap size={14} /> HARİTADA GÖR
                                                </a>
                                            </div>
                                        )}
                                        {!courier.location && courier.isOnline && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleRequestLocation(courier.id); }}
                                                className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-blue-500/20 transition-all"
                                            >
                                                <FiMapPin size={14} /> KONUM İSTE
                                            </button>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Detail panel */}
                    <AnimatePresence mode="wait">
                        {selectedCourierId && (
                            <motion.div 
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 50 }}
                                className="lg:col-span-4 sticky top-8 h-[calc(100vh-120px)] bg-white/[0.02] border border-white/10 rounded-[40px] p-8 flex flex-col overflow-hidden backdrop-blur-xl shadow-3xl"
                            >
                                {courierDetail ? (
                                    <>
                                        <div className="flex items-center justify-between mb-8">
                                            <h3 className="text-xl font-black italic tracking-tighter uppercase">Courier <span className="text-blue-500">Details</span></h3>
                                            <button onClick={() => setSelectedCourierId(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><FiAlertCircle /></button>
                                        </div>

                                        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 mb-8 shadow-xl shadow-blue-500/20">
                                            <p className="text-blue-100/60 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Teslim Edilecek Nakit</p>
                                            <h4 className="text-4xl font-black italic tabular-nums">{currency}{courierDetail.totalCashToDeliver.toLocaleString()}</h4>
                                            <button 
                                                onClick={handleReconcile}
                                                disabled={courierDetail.totalCashToDeliver <= 0}
                                                className="mt-6 w-full py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 transition-all shadow-lg"
                                            >
                                                Tahsilatı Onayla (Gün Sonu)
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
                                            <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest mb-4">Son Teslimatlar</p>
                                            <div className="space-y-4">
                                                {courierDetail.recentOrders.map((order, i) => (
                                                    <div key={i} className="bg-black/20 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-all group">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="max-w-[150px]">
                                                                <h5 className="font-black text-sm uppercase truncate mb-1">{order.customer_name || 'Bilinmiyor'}</h5>
                                                                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold">
                                                                    <FiMapPin size={10} />
                                                                    <span className="truncate">{order.delivery_address}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black italic">{currency}{order.total_amount}</p>
                                                                <p className={`text-[9px] font-bold uppercase ${order.payment_method_arrival === 'cash' ? (order.courier_settled ? 'text-emerald-500/40' : 'text-emerald-500') : 'text-blue-500'}`}>
                                                                    {order.payment_method_arrival} {order.courier_settled && '✓'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
                                                            <div className="flex items-center gap-2 text-slate-500 text-[9px] font-bold uppercase">
                                                                <FiClock /> {Math.round(order.duration_mins || 0)} dk sürdü
                                                            </div>
                                                            <FiCheckCircle className={order.courier_settled ? 'text-emerald-500' : 'text-slate-700'} size={12} />
                                                        </div>
                                                    </div>
                                                ))}
                                                {courierDetail.recentOrders.length === 0 && (
                                                    <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-600 italic">
                                                        <FiPackage size={40} opacity={0.2} />
                                                        <p className="text-xs font-bold uppercase tracking-widest">Kayıt Başlamadı</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                                        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                        <p className="text-[10px] font-black uppercase tracking-widest italic animate-pulse">Veriler Okunuyor...</p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </main>
    );
};
