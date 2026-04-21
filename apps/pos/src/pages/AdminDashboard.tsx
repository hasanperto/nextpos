import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FiRefreshCcw, FiShoppingBag, FiGrid, FiAlertCircle, 
    FiTruck, FiCoffee, FiActivity, FiMonitor, FiSmartphone, 
    FiShield, FiTrendingUp, FiClock, FiCheckCircle, FiFastForward, FiSettings,
    FiGlobe, FiX
} from 'react-icons/fi';

import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import toast from 'react-hot-toast';


type DashboardPayload = {
    hourly: { hour: number; order_count: number; revenue: number }[];
    heatmap: { hour: number; order_count: number; revenue: number }[];
    pendingPayments: { count: number; totalAmount: number };
    kitchen: Record<string, number>;
    deliveries: Record<string, number>;
    activeCouriers: number;
    topProducts: { id: number; name: string; qty: string | number; revenue: string | number }[];
    branches: { id: number; name: string; is_online: boolean; last_sync: string | null }[];
    tables: { total: number; occupied: number };
    ordersToday: number;
    revenueToday: number;
};

type WebSimItem = {
    id: number;
    product_name: string;
    quantity: number;
    total_price: number;
    modifiers?: string;
};

type WebSimData = {
    customerName: string;
    phone: string;
    address: string;
    orderType: 'delivery' | 'takeaway';
    paymentMethod: 'cash' | 'card';
    isPaid: boolean;
    items: WebSimItem[];
};

type WaChatMsg = { role: 'user' | 'bot'; text: string; ts: number };

const maxHourly = (rows: { order_count: number }[]) =>
    Math.max(1, ...rows.map((r) => Number(r.order_count)));

export const AdminDashboard: React.FC = () => {
    const { getAuthHeaders, logout, tenantName } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const currency = settings?.currency || '€';
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<DashboardPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [showWebSimForm, setShowWebSimForm] = useState(false);
    const [showWaBot, setShowWaBot] = useState(false);
    const [waPhone, setWaPhone] = useState('+491620001122');
    const [waText, setWaText] = useState('Merhaba');
    const [waChat, setWaChat] = useState<WaChatMsg[]>([]);
    const [webSimData, setWebSimData] = useState<WebSimData>({
        customerName: 'Web Sipariş Testi',
        phone: '+49 176 0000 0000',
        address: 'Tübingen Merkez',
        orderType: 'delivery',
        paymentMethod: 'cash',
        isPaid: false,
        items: [
            { id: 101, product_name: 'Margherita Pizza', quantity: 1, total_price: 12.5 },
            { id: 202, product_name: 'Coca-Cola', quantity: 2, total_price: 5.0 },
            { id: 303, product_name: 'Patates Kızartması', quantity: 1, total_price: 4.5, modifiers: JSON.stringify([{ name: 'Ketçap' }, { name: 'Mayonez' }]) },
        ]
    });


    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        const headers = getAuthHeaders();
        try {
            const res = await fetch('/api/v1/admin/dashboard', { headers });
            if (res.status === 401) {
                logout();
                return;
            }
            if (!res.ok) {
                setErr('Özet yüklenemedi. Lütfen tekrar deneyin.');
                return;
            }
            const j = (await res.json()) as DashboardPayload;
            setData(j);
        } catch (e) {
            console.error(e);
            setErr('Bağlantı hatası. Sunucuya ulaşılamıyor.');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout]);

    useEffect(() => {
        void load();
        void fetchSettings();
        // Option to add auto-refresh here
        const interval = setInterval(() => { void load(); }, 60000); // 1 min auto refresh
        return () => clearInterval(interval);
    }, [load]);

    const hm = useMemo(() => maxHourly(data?.hourly || []), [data]);

    // Mock Live Feed Data
    const liveFeed = [
        { id: 1, type: 'order', msg: 'Masa 4 için yeni sipariş alındı.', time: 'az önce', icon: <FiShoppingBag className="text-emerald-500" /> },
        { id: 2, type: 'alert', msg: 'Kasiyer Ali 1 ürünü iptal etti (Yetki: Şef).', time: '2 dk önce', icon: <FiShield className="text-rose-500" /> },
        { id: 3, type: 'kitchen', msg: 'Masa 12 siparişleri hazırlandı.', time: '5 dk önce', icon: <FiCoffee className="text-amber-500" /> },
        { id: 4, type: 'payment', msg: 'Paket Servis #1024 ödendi.', time: '8 dk önce', icon: <FiCheckCircle className="text-blue-500" /> },
    ];

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#020617] text-black font-sans">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-md px-8 shadow-sm z-10 sticky top-0">
                <div>
                    <h2 className="text-2xl font-black bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
                        <FiActivity className="text-emerald-500" /> 
                        Komuta Merkezi
                    </h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                        {tenantName || 'Restoran'} • Canlı Operasyon Ağı
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-800/50 rounded-lg p-1 border border-white/5">
                        <div className="px-3 py-1.5 text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> SİSTEM AKTİF
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10 hover:border-emerald-500/30 transition-all shadow-sm active:scale-95"
                    >
                        <FiRefreshCcw size={16} className={`${loading ? 'animate-spin text-blue-500' : ''}`} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 md:p-8">
                {err && (
                    <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-600 shadow-sm backdrop-blur-sm">
                        <FiAlertCircle size={20} className="animate-pulse" /> {err}
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    {/* LEFT COLUMN: MAIN STATS & ACTIONS (Spans 8 cols) */}
                    <div className="xl:col-span-8 space-y-6">
                        {/* QUICK TERMINAL LINKS */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <button onClick={() => navigate('/pos')} className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all border border-slate-700/50">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                    <FiMonitor size={80} className="text-white" />
                                </div>
                                <FiMonitor size={24} className="text-sky-400 mb-3" />
                                <h3 className="text-lg font-black text-white">POS Terminali</h3>
                                <p className="text-xs text-slate-400 font-medium">Kasa ekranına geçiş yap</p>
                            </button>
                            
                            <button onClick={() => navigate('/kitchen')} className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 p-5 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all border border-amber-500/50">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                    <FiCoffee size={80} className="text-white" />
                                </div>
                                <FiCoffee size={24} className="text-amber-200 mb-3" />
                                <h3 className="text-lg font-black text-white">KDS Mutfak</h3>
                                <p className="text-xs text-amber-200/70 font-medium">Sipariş akışını yönet</p>
                            </button>

                            <button onClick={() => navigate('/handover')} className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all border border-indigo-500/50">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                    <FiGrid size={80} className="text-white" />
                                </div>
                                <FiGrid size={24} className="text-indigo-200 mb-3" />
                                <h3 className="text-lg font-black text-white">Teslim Merkezi</h3>
                                <p className="text-xs text-indigo-200/70 font-medium">Paket & Servis monitörü</p>
                            </button>
                            
                            <button onClick={() => navigate('/waiter')} className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all border border-emerald-500/50">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                    <FiSmartphone size={80} className="text-white" />
                                </div>
                                <FiSmartphone size={24} className="text-emerald-200 mb-3" />
                                <h3 className="text-lg font-black text-white">Garson Paneli</h3>
                                <p className="text-xs text-emerald-200/70 font-medium">Saha operasyonlarını yönet</p>
                            </button>

                            <button onClick={() => navigate('/admin/couriers')} className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all border border-blue-500/50">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                    <FiTruck size={80} className="text-white" />
                                </div>
                                <FiTruck size={24} className="text-blue-200 mb-3" />
                                <h3 className="text-lg font-black text-white">Kurye Takibi</h3>
                                <p className="text-xs text-blue-200/70 font-medium">Canlı kurye koordinasyonu</p>
                            </button>

                            <button onClick={() => navigate('/admin/settings')} className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 p-5 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all border border-slate-600/50">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                    <FiSettings size={80} className="text-white" />
                                </div>
                                <FiSettings size={24} className="text-slate-300 mb-3" />
                                <h3 className="text-lg font-black text-white">Sistem Ayarları</h3>
                                <p className="text-xs text-slate-300/70 font-medium">Fiş ve POS yapılandırması</p>
                            </button>
                        </div>

                        {/* KPIS CİRO VE MASALAR */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 bg-emerald-500/5 w-24 h-24 rounded-full blur-2xl opacity-60"></div>
                                <div className="mb-3 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                                    Bugünkü Ciro <FiTrendingUp className="text-emerald-500" size={18} />
                                </div>
                                <p className="text-3xl font-black text-slate-100 tracking-tight">
                                    {loading ? '...' : `${currency}${Number(data?.revenueToday ?? 0).toFixed(2)}`}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 bg-sky-500/5 w-24 h-24 rounded-full blur-2xl opacity-60"></div>
                                <div className="mb-3 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                                    Siparişler <FiShoppingBag className="text-sky-500" size={18} />
                                </div>
                                <p className="text-3xl font-black text-slate-100 tracking-tight">
                                    {loading ? '...' : data?.ordersToday ?? 0}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 bg-amber-500/5 w-24 h-24 rounded-full blur-2xl opacity-60"></div>
                                <div className="mb-3 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                                    Dolu Masalar <FiGrid className="text-amber-500" size={18} />
                                </div>
                                <p className="text-3xl font-black text-slate-100 tracking-tight">
                                    {loading ? '...' : `${data?.tables?.occupied ?? 0} `}
                                    <span className="text-base text-slate-500">/ {data?.tables?.total ?? 0}</span>
                                </p>
                                <div className="mt-2 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                    <div 
                                        className="bg-amber-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
                                        style={{ width: `${data?.tables?.total ? ((data.tables.occupied / data.tables.total) * 100) : 0}%` }}
                                    />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 bg-rose-500/10 w-24 h-24 rounded-full blur-2xl opacity-60"></div>
                                <div className="mb-3 flex items-center justify-between text-xs font-black uppercase text-rose-500">
                                    Bekleyen Ödeme <FiAlertCircle className="text-rose-500" size={18} />
                                </div>
                                <p className="text-3xl font-black text-rose-500 tracking-tight">
                                    {loading ? '...' : data?.pendingPayments?.count ?? 0}
                                </p>
                                <p className="text-xs font-bold text-rose-400/70 mt-1">
                                    {currency}{Number(data?.pendingPayments?.totalAmount ?? 0).toFixed(2)} İçeride
                                </p>
                            </div>
                        </div>

                        {/* MUTFAK & TESLİMAT GÖSTERGELERİ */}
                        <div className="mt-2 grid gap-4 grid-cols-2">
                            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 shadow-sm relative">
                                <h3 className="mb-5 flex items-center gap-2 font-black text-slate-100 uppercase tracking-wide text-sm">
                                    <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center"><FiCoffee size={16}/></span> 
                                    Mutfak Durumu
                                </h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center group">
                                        <div className="w-16 h-16 mx-auto rounded-full border-4 border-white/5 flex items-center justify-center mb-2 group-hover:border-white/10 transition-colors">
                                            <span className="text-xl font-black text-slate-400">{loading ? '-' : data?.kitchen?.['waiting'] ?? 0}</span>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Bekliyor</p>
                                    </div>
                                    <div className="text-center group">
                                        <div className="w-16 h-16 mx-auto rounded-full border-4 border-amber-500/20 flex items-center justify-center mb-2 group-hover:border-amber-500/40 transition-colors relative">
                                            {(data?.kitchen?.['preparing'] ?? 0) > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-[#020617] rounded-full animate-ping"></span>}
                                            <span className="text-xl font-black text-amber-600">{loading ? '-' : data?.kitchen?.['preparing'] ?? 0}</span>
                                        </div>
                                        <p className="text-[10px] font-bold text-amber-500 uppercase">Hazırlanıyor</p>
                                    </div>
                                    <div className="text-center group">
                                        <div className="w-16 h-16 mx-auto rounded-full border-4 border-emerald-500/20 flex items-center justify-center mb-2 group-hover:border-emerald-500/40 transition-colors">
                                            <span className="text-xl font-black text-emerald-400">{loading ? '-' : data?.kitchen?.['ready'] ?? 0}</span>
                                        </div>
                                        <p className="text-[10px] font-bold text-emerald-500 uppercase">Hazır</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 shadow-sm relative">
                                <h3 className="mb-5 flex items-center gap-2 font-black text-slate-100 uppercase tracking-wide text-sm">
                                    <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center"><FiTruck size={16}/></span> 
                                    Paket & Teslimat
                                </h3>
                                <div className="flex items-center justify-around h-[88px]">
                                    <div className="text-center">
                                        <p className="text-4xl font-black text-blue-400">{loading ? '-' : data?.activeCouriers ?? 0}</p>
                                        <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-wide">Sahada Kurye</p>
                                    </div>
                                    <div className="h-12 w-px bg-white/5"></div>
                                    <div className="text-center">
                                        <p className="text-4xl font-black text-slate-300">
                                            {loading ? '-' : Object.values(data?.deliveries || {}).reduce((a, b) => a + b, 0)}
                                        </p>
                                        <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-wide">Yoldaki Sipariş</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* HOURLY CHART & TOP PRODUCTS */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 shadow-sm flex flex-col justify-between">
                                <h3 className="mb-4 font-black text-slate-100 flex items-center gap-2 text-sm uppercase tracking-wide">
                                    <FiActivity className="text-sky-500" /> Saatlik Hacim
                                </h3>
                                <div>
                                    <div className="flex h-32 items-end gap-1.5 w-full">
                                        {(data?.hourly || []).map((h) => (
                                            <div
                                                key={h.hour}
                                                title={`${h.hour}:00 — ${h.order_count} sip.`}
                                                className="flex-1 rounded-t-md bg-gradient-to-t from-sky-500 to-sky-400 transition-all hover:brightness-125 relative group shadow-[0_0_8px_rgba(14,165,233,0.3)]"
                                                style={{
                                                    height: `${(Number(h.order_count) / hm) * 100}%`,
                                                    minHeight: Number(h.order_count) > 0 ? 12 : 4,
                                                }}
                                            >
                                                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded font-bold pointer-events-none transition-opacity border border-white/10 shadow-xl">
                                                    {h.order_count}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex justify-between text-[10px] font-bold text-slate-500 border-t border-white/5 pt-2">
                                        <span>00:00</span>
                                        <span>12:00</span>
                                        <span>23:59</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 shadow-sm">
                                <h3 className="mb-4 font-black text-slate-100 flex items-center gap-2 text-sm uppercase tracking-wide">
                                    <FiFastForward className="text-emerald-500" /> Popüler İçerik
                                </h3>
                                <ul className="space-y-3">
                                    {(data?.topProducts || []).length === 0 && !loading && (
                                        <li className="text-xs font-bold text-slate-500 text-center py-4">Veri yok</li>
                                    )}
                                    {(data?.topProducts || []).slice(0, 4).map((p, i) => (
                                        <li
                                            key={p.id}
                                            className="flex items-center justify-between text-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                                                    {i + 1}
                                                </span>
                                                <span className="font-bold text-slate-300">{p.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block font-black text-emerald-400">
                                                    {currency}{Number(p.revenue).toFixed(2)}
                                                </span>
                                                <span className="block text-[10px] font-bold text-slate-500">
                                                    {Number(p.qty).toFixed(0)} Adet
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* NEW TEST ACTIONS PANEL */}
                        <div className="rounded-2xl border-2 border-indigo-500/20 bg-indigo-50/10 p-6 shadow-sm mt-6">
                            <h3 className="mb-4 font-black text-indigo-800 dark:text-indigo-300 flex items-center gap-2 text-sm uppercase tracking-wide">
                                <FiActivity className="text-indigo-500 animate-pulse" /> Test Araçları (Tübingen Simülasyonu)
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <button
                                    onClick={async () => {
                                        const headers = getAuthHeaders();
                                        try {
                                            const res = await fetch('/api/v1/admin/simulate', {
                                                method: 'POST',
                                                headers: { ...headers, 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ type: 'whatsapp' })
                                            });
                                            if (res.ok) toast.success('WhatsApp Simülasyonu Gönderildi');
                                        } catch (e) { toast.error('Hata oluştu'); }
                                    }}
                                    className="bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white border border-[#25D366]/20 py-4 rounded-xl font-bold uppercase transition-all shadow-sm flex flex-col items-center gap-2"
                                >
                                    <FiActivity size={20} />
                                    <span className="text-[10px]">WA Siparişi</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        const headers = getAuthHeaders();
                                        try {
                                            const res = await fetch('/api/v1/admin/simulate', {
                                                method: 'POST',
                                                headers: { ...headers, 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ type: 'call' })
                                            });
                                            if (res.ok) toast.success('Çağrı Simülasyonu Gönderildi');
                                        } catch (e) { toast.error('Hata oluştu'); }
                                    }}
                                    className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 py-4 rounded-xl font-bold uppercase transition-all shadow-sm flex flex-col items-center gap-2"
                                >
                                    <FiActivity size={20} />
                                    <span className="text-[10px]">Gelen Çağrı</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        const headers = getAuthHeaders();
                                        try {
                                            const res = await fetch('/api/v1/admin/simulate', {
                                                method: 'POST',
                                                headers: { ...headers, 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ type: 'kitchen' })
                                            });
                                            if (res.ok) toast.success('Mutfak Hazır Bildirimi Gönderildi');
                                        } catch (e) { toast.error('Hata oluştu'); }
                                    }}
                                    className="bg-orange-500/10 text-orange-600 hover:bg-orange-500 hover:text-white border border-orange-500/20 py-4 rounded-xl font-bold uppercase transition-all shadow-sm flex flex-col items-center gap-2"
                                >
                                    <FiActivity size={20} />
                                    <span className="text-[10px]">Mutfak Hazır</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setShowWaBot((v) => !v);
                                        if (waChat.length === 0) {
                                            setWaChat([{ role: 'bot', text: 'Merhaba 👋\n\nNe yapmak istersiniz?\n1) Sipariş Ver\n2) Sipariş Sorgula\n3) Canlı Destek\n\nLütfen 1, 2 veya 3 yazın.', ts: Date.now() }]);
                                        }
                                    }}
                                    className="bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500 hover:text-white border border-fuchsia-500/20 py-4 rounded-xl font-bold uppercase transition-all shadow-sm flex flex-col items-center gap-2"
                                >
                                    <FiActivity size={20} />
                                    <span className="text-[10px]">WA Bot</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setShowWebSimForm(true);
                                        setWebSimData((s) => ({
                                            ...s,
                                            customerName: s.customerName || 'Web Sipariş Testi',
                                            phone: s.phone || '+49 176 0000 0000',
                                            address: s.address || 'Tübingen Merkez',
                                            items: s.items.length > 0 ? s.items : [
                                                { id: 101, product_name: 'Margherita Pizza', quantity: 1, total_price: 12.5 },
                                                { id: 202, product_name: 'Coca-Cola', quantity: 2, total_price: 5.0 },
                                                { id: 303, product_name: 'Patates Kızartması', quantity: 1, total_price: 4.5, modifiers: JSON.stringify([{ name: 'Ketçap' }, { name: 'Mayonez' }]) },
                                            ]
                                        }));
                                    }}
                                    className="bg-sky-500/10 text-sky-600 hover:bg-sky-500 hover:text-white border border-sky-500/20 py-4 rounded-xl font-bold uppercase transition-all shadow-sm flex flex-col items-center gap-2"
                                >
                                    <FiGlobe size={20} />
                                    <span className="text-[10px]">Web Siparişi</span>
                                </button>
                            </div>

                            {showWaBot && (
                                <div className="mt-6 p-6 bg-white/5 rounded-2xl border border-white/10 animate-in slide-in-from-top-4 duration-300">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-white font-bold flex items-center gap-2"><FiActivity className="text-fuchsia-300" /> WhatsApp Bot Sandbox</h4>
                                        <button type="button" onClick={() => setShowWaBot(false)} className="text-slate-500 hover:text-white" aria-label="Kapat" title="Kapat"><FiX /></button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Müşteri Telefon</label>
                                            <input
                                                type="text"
                                                value={waPhone}
                                                onChange={(e) => setWaPhone(e.target.value)}
                                                className="w-full bg-[#020617] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-fuchsia-500 outline-none transition-colors"
                                                placeholder="+49..."
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Mesaj</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={waText}
                                                    onChange={(e) => setWaText(e.target.value)}
                                                    className="flex-1 bg-[#020617] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-fuchsia-500 outline-none transition-colors"
                                                    placeholder="Örn: 2 (Menü)"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            (e.currentTarget as HTMLInputElement).blur();
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={async () => {
                                                        const msg = waText.trim();
                                                        if (!msg) return;
                                                        const headers = getAuthHeaders();
                                                        setWaChat((c) => [...c, { role: 'user', text: msg, ts: Date.now() }]);
                                                        setWaText('');
                                                        try {
                                                            const res = await fetch('/api/v1/integrations/whatsapp/simulate', {
                                                                method: 'POST',
                                                                headers: { ...headers, 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ phone: waPhone, text: msg }),
                                                            });
                                                            const j = await res.json().catch(() => ({}));
                                                            if (!res.ok) {
                                                                toast.error((j as any)?.error || 'Simülasyon başarısız');
                                                                return;
                                                            }
                                                            setWaChat((c) => [...c, { role: 'bot', text: String((j as any)?.reply || ''), ts: Date.now() }]);
                                                        } catch {
                                                            toast.error('Bağlantı hatası');
                                                        }
                                                    }}
                                                    className="px-4 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black uppercase text-xs"
                                                >
                                                    Gönder
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-[#020617] border border-white/10 rounded-xl p-4 max-h-[320px] overflow-auto space-y-3">
                                        {waChat.length === 0 && (
                                            <div className="text-xs font-bold text-slate-500">Mesaj yok.</div>
                                        )}
                                        {waChat.map((m) => (
                                            <div key={m.ts} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm border ${
                                                    m.role === 'user'
                                                        ? 'bg-fuchsia-500/20 border-fuchsia-500/20 text-white'
                                                        : 'bg-white/5 border-white/10 text-slate-200'
                                                }`}>
                                                    {m.text}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        <button
                                            onClick={() => setWaChat([])}
                                            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-black uppercase hover:bg-white/10"
                                        >
                                            Temizle
                                        </button>
                                        <button
                                            onClick={() => {
                                                setWaText('2');
                                            }}
                                            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-black uppercase hover:bg-white/10"
                                        >
                                            Menü (2)
                                        </button>
                                        <button
                                            onClick={() => {
                                                setWaText('1');
                                            }}
                                            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-black uppercase hover:bg-white/10"
                                        >
                                            Öneri (1)
                                        </button>
                                    </div>
                                </div>
                            )}

                            {showWebSimForm && (
                                <div className="mt-6 p-6 bg-white/5 rounded-2xl border border-white/10 animate-in slide-in-from-top-4 duration-300">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-white font-bold flex items-center gap-2"><FiGlobe className="text-sky-400" /> Web Sipariş Konfigürasyonu</h4>
                                        <button type="button" onClick={() => setShowWebSimForm(false)} className="text-slate-500 hover:text-white" aria-label="Kapat" title="Kapat"><FiX /></button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Müşteri Adı</label>
                                                <input 
                                                    type="text" 
                                                    value={webSimData.customerName}
                                                    onChange={e => setWebSimData({...webSimData, customerName: e.target.value})}
                                                    className="w-full bg-[#020617] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-sky-500 outline-none transition-colors"
                                                    placeholder="Örn: Ahmet Yılmaz"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Telefon</label>
                                                <input 
                                                    type="text" 
                                                    value={webSimData.phone}
                                                    onChange={e => setWebSimData({...webSimData, phone: e.target.value})}
                                                    className="w-full bg-[#020617] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-sky-500 outline-none transition-colors"
                                                    placeholder="+90 5XX XXX XX XX"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Adres (Paket ise)</label>
                                                <textarea 
                                                    value={webSimData.address}
                                                    onChange={e => setWebSimData({...webSimData, address: e.target.value})}
                                                    className="w-full bg-[#020617] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-sky-500 outline-none transition-colors h-20"
                                                    placeholder="Teslimat adresi..."
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Sipariş Tipi</label>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => setWebSimData({...webSimData, orderType: 'takeaway'})}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${webSimData.orderType === 'takeaway' ? 'bg-amber-500 border-amber-500 text-black' : 'bg-white/5 border-white/10 text-slate-400'}`}
                                                    >Gel-Al</button>
                                                    <button 
                                                        onClick={() => setWebSimData({...webSimData, orderType: 'delivery'})}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${webSimData.orderType === 'delivery' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}
                                                    >Paket Servis</button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Ödeme Yöntemi</label>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => setWebSimData({...webSimData, paymentMethod: 'cash'})}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${webSimData.paymentMethod === 'cash' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}
                                                    >Nakit</button>
                                                    <button 
                                                        onClick={() => setWebSimData({...webSimData, paymentMethod: 'card'})}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${webSimData.paymentMethod === 'card' ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}
                                                    >Kart</button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                                <span className="text-xs font-bold text-slate-300">Ödeme yapıldı mı? (Online)</span>
                                                <button 
                                                    onClick={() => setWebSimData({...webSimData, isPaid: !webSimData.isPaid})}
                                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${webSimData.isPaid ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                                >
                                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${webSimData.isPaid ? 'translate-x-6' : 'translate-x-0'}`} />
                                                </button>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if(!webSimData.customerName || !webSimData.phone) {
                                                        toast.error('İsim ve telefon zorunludur');
                                                        return;
                                                    }
                                                    const headers = getAuthHeaders();
                                                    try {
                                                        const res = await fetch('/api/v1/admin/simulate', {
                                                            method: 'POST',
                                                            headers: { ...headers, 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ type: 'web_order', ...webSimData })
                                                        });
                                                        if (res.ok) {
                                                            toast.success('Detaylı Web Siparişi Gönderildi');
                                                            setShowWebSimForm(false);
                                                        }
                                                    } catch (e) { toast.error('Hata oluştu'); }
                                                }}
                                                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-black uppercase rounded-xl shadow-lg shadow-sky-500/20 transition-all mt-2"
                                            >
                                                Simülasyonu Başlat
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>



                    </div>

                    {/* RIGHT COLUMN: AUDIT & LIVE STREAM (Spans 4 cols) */}
                    <div className="xl:col-span-4 flex flex-col gap-6">
                        {/* AUDIT ALERTS */}
                        <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-sm overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="font-black text-rose-500 uppercase tracking-widest text-xs flex items-center gap-2">
                                    <FiShield size={16} /> Kritik Denetim Logları
                                </h3>
                                <span className="bg-rose-500/20 text-rose-500 text-[10px] font-black px-2 py-1 rounded w-6 text-center">3</span>
                            </div>
                            <div className="space-y-3">
                                <div className="bg-[#020617] border border-white/5 p-3 rounded-xl flex gap-3 shadow-sm hover:border-rose-500/30 transition-colors cursor-pointer">
                                    <FiAlertCircle className="text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-200">Şüpheli İptal (Z-Raporu Öncesi)</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Kasiyer Ali 3 adet "Karışık Izgara" iptal etti.</p>
                                    </div>
                                    <span className="text-[9px] text-slate-500 ml-auto whitespace-nowrap">14:02</span>
                                </div>
                                <div className="bg-[#020617] border border-white/5 p-3 rounded-xl flex gap-3 shadow-sm hover:border-rose-500/30 transition-colors cursor-pointer">
                                    <FiAlertCircle className="text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-200">Geçersiz Şifre Denemesi</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Admin hesabına 5 başarısız giriş.</p>
                                    </div>
                                    <span className="text-[9px] text-slate-500 ml-auto whitespace-nowrap">09:15</span>
                                </div>
                            </div>
                            <button className="w-full mt-4 text-[10px] font-black uppercase text-rose-500 hover:text-rose-400 tracking-wider">
                                Tüm Logları İncele →
                            </button>
                        </div>

                        {/* LIVE ACTIVITY FEED */}
                        <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-sm flex-1 flex flex-col overflow-hidden">
                            <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
                                <h3 className="font-black text-slate-100 uppercase tracking-widest text-xs flex items-center gap-2">
                                    <FiClock size={16} className="text-blue-500" /> Canlı Akış
                                </h3>
                                <div className="flex flex-col items-center">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4 relative no-scrollbar">
                                {/* Vertical line for timeline */}
                                <div className="absolute left-2.5 top-2 bottom-0 w-px bg-white/5 z-0" />
                                
                                {liveFeed.map((item) => (
                                    <div key={item.id} className="relative z-10 flex gap-4 items-start group">
                                        <div className="w-6 h-6 rounded-full bg-[#020617] border border-white/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 group-hover:border-blue-500/50 transition-all">
                                            {item.icon}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-slate-300 leading-tight group-hover:text-white transition-colors">{item.msg}</p>
                                            <p className="text-[10px] font-medium text-slate-500 mt-1">{item.time}</p>
                                        </div>
                                    </div>
                                ))}
                                <div className="relative z-10 flex gap-4 items-start pt-4 opacity-30">
                                    <div className="w-6 h-6 shrink-0 mt-0.5" />
                                    <p className="text-[10px] font-bold text-slate-500">Daha eski kayıtlar...</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
};
