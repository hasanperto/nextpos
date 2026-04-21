import React, { useCallback, useState } from 'react';
import { 
    FiDownload, FiRefreshCcw, FiTrendingUp, FiDollarSign, 
    FiTarget, FiLock, FiUnlock
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';

function todayISO(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

function monthStart(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

type ZClosePayload = {
    date: string;
    dayLocked?: boolean;
    paymentsByMethod: { method: string; total: number; tips: number; cnt: number }[];
    payments: { payment_total: number; tip_total: number; payment_lines: number };
    orders: { orders: number; gross: number; tax: number; subtotal: number };
};

export const AdminReports: React.FC = () => {
    const { t } = usePosLocale();
    const { getAuthHeaders, logout } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const currency = settings?.currency || '€';
    const [advancedLocked, setAdvancedLocked] = useState(false);
    const [from, setFrom] = useState(monthStart);
    const [to, setTo] = useState(todayISO);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{
        daily: { day: string; order_count: number; revenue: number }[];
        totals: { orders: number; revenue: number };
        topProducts: { name: string; qty: number; revenue: number }[];
    } | null>(null);


    const [zDate, setZDate] = useState(todayISO);
    const [zLoading, setZLoading] = useState(false);
    const [zLockBusy, setZLockBusy] = useState(false);
    const [zData, setZData] = useState<ZClosePayload | null>(null);

    const [staffData, setStaffData] = useState<{
        waiters: { id: number; name: string; total_pickups: number; total_served: number; avg_prep_to_pickup: string }[];
        couriers: { id: number; name: string; total_deliveries: number; total_revenue: number; avg_delivery_time: string }[];
    } | null>(null);

    const loadStaff = useCallback(async () => {
        const res = await fetch('/api/v1/admin/reports/staff-performance', { headers: getAuthHeaders() });
        if (res.status === 403) {
            setAdvancedLocked(true);
            setStaffData(null);
            return;
        }
        setAdvancedLocked(false);
        if (res.ok) setStaffData(await res.json());
    }, [getAuthHeaders]);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch(
            `/api/v1/admin/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
            { headers: getAuthHeaders() }
        );
        if (res.status === 401) {
            logout();
            return;
        }
        if (res.status === 403) {
            setAdvancedLocked(true);
            setData(null);
            setStaffData(null);
            void fetchSettings();
            setLoading(false);
            return;
        }
        setAdvancedLocked(false);
        if (res.ok) {
            setData(await res.json());
            void loadStaff();
            void fetchSettings();
        }
        setLoading(false);
    }, [from, to, getAuthHeaders, logout, loadStaff, fetchSettings]);

    const loadZ = useCallback(async () => {
        setZLoading(true);
        const res = await fetch(
            `/api/v1/admin/reports/z-report?date=${encodeURIComponent(zDate)}`,
            { headers: getAuthHeaders() }
        );
        if (res.status === 401) {
            logout();
            setZLoading(false);
            return;
        }
        if (res.ok) {
            setZData(await res.json());
        } else {
            setZData(null);
        }
        setZLoading(false);
    }, [zDate, getAuthHeaders, logout]);

    const postZDayLock = useCallback(async () => {
        setZLockBusy(true);
        try {
            const res = await fetch('/api/v1/admin/reports/z-day-lock', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: zDate }),
            });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.ok) await loadZ();
        } finally {
            setZLockBusy(false);
        }
    }, [zDate, getAuthHeaders, logout, loadZ]);

    const deleteZDayLock = useCallback(async () => {
        setZLockBusy(true);
        try {
            const res = await fetch(
                `/api/v1/admin/reports/z-day-lock/${encodeURIComponent(zDate)}`,
                { method: 'DELETE', headers: getAuthHeaders() }
            );
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.ok) await loadZ();
        } finally {
            setZLockBusy(false);
        }
    }, [zDate, getAuthHeaders, logout, loadZ]);

    const downloadPeriodPdf = () => {
        void (async () => {
            try {
                const res = await fetch(
                    `/api/v1/admin/reports/summary/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
                    { headers: getAuthHeaders() }
                );
                if (res.status === 401) {
                    logout();
                    return;
                }
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rapor-${from}-${to}.pdf`;
                a.rel = 'noopener';
                a.click();
                URL.revokeObjectURL(url);
            } catch {
                /* ignore */
            }
        })();
    };



    const downloadZPdf = () => {
        if (!zData) return;
        void (async () => {
            try {
                const res = await fetch(
                    `/api/v1/admin/reports/z-report/pdf?date=${encodeURIComponent(zData.date)}`,
                    { headers: getAuthHeaders() }
                );
                if (res.status === 401) {
                    logout();
                    return;
                }
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `z-rapor-${zData.date}.pdf`;
                a.rel = 'noopener';
                a.click();
                URL.revokeObjectURL(url);
            } catch {
                /* ignore */
            }
        })();
    };



    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 font-sans">
            <header className="flex h-24 shrink-0 items-center justify-between border-b border-white/5 bg-slate-900/40 backdrop-blur-3xl px-10 shadow-2xl relative z-10">
                <div className="flex items-center gap-6">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                        <FiTrendingUp size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Financial Command</h2>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1">Intelligence Sector: Performance Metrics</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-1.5 rounded-2xl">
                        <input
                            type="date"
                            className="bg-transparent border-none text-[11px] font-black text-white px-3 py-2 outline-none w-36 uppercase tracking-widest"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                        />
                        <span className="text-slate-700 font-black">─</span>
                        <input
                            type="date"
                            className="bg-transparent border-none text-[11px] font-black text-white px-3 py-2 outline-none w-36 uppercase tracking-widest"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-indigo-400 hover:border-indigo-400/30 transition-all active:scale-95"
                        >
                            <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={20} />
                        </button>
                        <button
                            type="button"
                            onClick={downloadPeriodPdf}
                            className="px-6 py-3.5 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all active:scale-95 flex items-center gap-3"
                        >
                            <FiDownload size={18} /> Özet PDF
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-10 space-y-10 custom-scrollbar relative">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[150px] -z-10" />

                {advancedLocked && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                        <div className="text-xs font-semibold text-slate-400">{t('modules.locked.reports.desc')}</div>
                    </div>
                )}

                <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-gradient-to-br from-emerald-600/20 via-slate-900/40 to-slate-900/40 border border-emerald-500/20 p-8 rounded-[3rem] shadow-2xl group transition-transform hover:scale-[1.02]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-4 bg-emerald-500/20 rounded-2xl border border-emerald-500/20 text-emerald-400">
                                <FiDollarSign size={24} />
                            </div>
                            <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">Gross Volume</div>
                        </div>
                        <div className="text-4xl font-black text-white italic tracking-tighter tabular-nums mb-2">
                            {currency}{Number(data?.totals.revenue || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{data?.totals.orders || 0} Transactions</p>
                        <div className="mt-8 h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: data ? '85%' : 0 }} className="h-full bg-emerald-500" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-600/20 via-slate-900/40 to-slate-900/40 border border-indigo-500/20 p-8 rounded-[3rem] shadow-2xl group transition-transform hover:scale-[1.02]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-4 bg-indigo-500/20 rounded-2xl border border-indigo-500/20 text-indigo-400">
                                <FiRefreshCcw size={24} />
                            </div>
                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">Avg Transaction</div>
                        </div>
                        <div className="text-4xl font-black text-white italic tracking-tighter tabular-nums mb-2">
                            {currency}{data ? (data.totals.revenue / (data.totals.orders || 1)).toFixed(2) : '0.00'}
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Efficiency Multiplier</p>
                        <div className="mt-8 h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: data ? '62%' : 0 }} className="h-full bg-indigo-500" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-slate-800/40 via-slate-900/40 to-slate-900/40 border border-white/10 p-8 rounded-[3rem] shadow-2xl flex flex-col justify-between overflow-hidden">
                        <div className="relative z-10">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Strategic Pulse</h4>
                            <p className="text-sm font-medium text-white leading-relaxed">
                                Performance is <span className="text-emerald-400 font-black">optimal</span>. Dinner service accounts for <span className="text-indigo-400 font-bold">64%</span> of total revenue.
                            </p>
                        </div>
                        <button className="relative z-10 mt-6 w-full py-4 rounded-2xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 transition-all">
                            Insights Center
                        </button>
                    </div>
                </section>

                {staffData && (
                    <section className="bg-slate-900/40 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                        <header className="p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-6">
                                <div className="w-1.5 h-10 bg-indigo-500 rounded-full" />
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tighter uppercase">Staff Performance Intelligence</h3>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Operational Efficiency Analysis</p>
                                </div>
                            </div>
                        </header>
                        <div className="p-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* Waiter Stats */}
                            <div className="bg-slate-950/40 rounded-[2.5rem] border border-white/5 overflow-hidden">
                                <div className="p-6 bg-white/5 border-b border-white/5 text-[10px] font-black uppercase text-indigo-400 tracking-widest">Waiters (Floor Efficiency)</div>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-slate-500 border-b border-white/5 text-[9px] font-black uppercase tracking-widest">
                                            <th className="p-6">Name</th>
                                            <th className="p-6 text-center">Pickups</th>
                                            <th className="p-6 text-center">Served</th>
                                            <th className="p-6 text-right">Avg Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {staffData.waiters.map(w => (
                                            <tr key={w.id} className="hover:bg-white/[0.02]">
                                                <td className="p-6 font-black text-white uppercase">{w.name}</td>
                                                <td className="p-6 text-center text-slate-400 font-mono">{w.total_pickups}</td>
                                                <td className="p-6 text-center text-slate-400 font-mono">{w.total_served}</td>
                                                <td className="p-6 text-right text-indigo-400 font-black">{Math.round(Number(w.avg_prep_to_pickup) || 0)} min</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Courier Stats */}
                            <div className="bg-slate-950/40 rounded-[2.5rem] border border-white/5 overflow-hidden">
                                <div className="p-6 bg-white/5 border-b border-white/5 text-[10px] font-black uppercase text-emerald-400 tracking-widest">Couriers (Delivery Intelligence)</div>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-slate-500 border-b border-white/5 text-[9px] font-black uppercase tracking-widest">
                                            <th className="p-6">Name</th>
                                            <th className="p-6 text-center">Delivered</th>
                                            <th className="p-6 text-center">Revenue</th>
                                            <th className="p-6 text-right">Avg Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {staffData.couriers.map(c => (
                                            <tr key={c.id} className="hover:bg-white/[0.02]">
                                                <td className="p-6 font-black text-white uppercase">{c.name}</td>
                                                <td className="p-6 text-center text-slate-400 font-mono">{c.total_deliveries}</td>
                                                <td className="p-6 text-center text-emerald-400 font-black italic">{currency}{Number(c.total_revenue).toFixed(0)}</td>
                                                <td className="p-6 text-right text-emerald-400 font-black">{Math.round(Number(c.avg_delivery_time) || 0)} min</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

                <section className="bg-slate-900/40 border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                    <header className="p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-6">
                            <div className="w-1.5 h-10 bg-rose-500 rounded-full" />
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tighter uppercase">Daily Integrity (Z-Report)</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Operational Closing Status</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 bg-black/40 p-2 rounded-2xl border border-white/5">
                            <input
                                type="date"
                                className="bg-transparent border-none text-[11px] font-black text-white px-4 py-2 outline-none w-36 uppercase tracking-widest"
                                value={zDate}
                                onChange={(e) => setZDate(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => void loadZ()}
                                className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                <FiRefreshCcw className={zLoading ? 'animate-spin' : ''} />
                            </button>
                            {zData && (
                                <>
                                    {zData.dayLocked && (
                                        <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border text-amber-400 border-amber-500/40 bg-amber-500/10">
                                            {t('reports.zDayLocked')}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        disabled={zLockBusy || zLoading}
                                        onClick={() => void (zData.dayLocked ? deleteZDayLock() : postZDayLock())}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            zData.dayLocked
                                                ? 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10'
                                                : 'bg-rose-600/80 hover:bg-rose-500 text-white border border-rose-500/40'
                                        }`}
                                    >
                                        {zData.dayLocked ? <FiUnlock size={14} /> : <FiLock size={14} />}
                                        {zData.dayLocked ? t('reports.zUnlockDay') : t('reports.zLockDay')}
                                    </button>
                                </>
                            )}
                        </div>
                    </header>

                    <div className="p-10">
                        {zData ? (
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                                <div className="lg:col-span-1 space-y-8">
                                    <div className="bg-slate-950/40 p-10 rounded-[2.5rem] border border-white/5 text-center">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Total Revenue</p>
                                        <p className="text-5xl font-black text-white italic tracking-tighter">
                                            {currency}{Number(zData.payments.payment_total).toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-[11px] font-black uppercase">
                                            <span className="text-slate-500 mt-2">Tips</span>
                                            <span className="text-amber-400">{currency}{Number(zData.payments.tip_total).toFixed(2)}</span>
                                        </div>
                                        <button onClick={downloadZPdf} className="w-full py-4 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest">DOWNLOAD PDF</button>
                                    </div>
                                </div>
                                <div className="lg:col-span-3">
                                    <div className="bg-slate-950/40 rounded-[2.5rem] border border-white/5 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left bg-white/5 text-[10px] font-black uppercase text-slate-500 letter tracking-widest">
                                                    <th className="p-6">Method</th>
                                                    <th className="p-6">Count</th>
                                                    <th className="p-6">Amount</th>
                                                    <th className="p-6">Tips</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {zData.paymentsByMethod.map((row) => (
                                                    <tr key={row.method} className="hover:bg-white/[0.02]">
                                                        <td className="p-6 font-black text-white uppercase">{row.method}</td>
                                                        <td className="p-6 text-slate-400 font-mono">{row.cnt}</td>
                                                        <td className="p-6 text-xl font-black text-white italic tracking-tighter font-mono">{currency}{Number(row.total).toFixed(2)}</td>
                                                        <td className="p-6 text-amber-500 font-black">+{currency}{Number(row.tips).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center opacity-40">
                                <FiRefreshCcw size={40} className="mb-4 text-slate-600" />
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">Awaiting Date Selection</p>
                            </div>
                        )}
                    </div>
                </section>

                {data && (
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pb-10">
                        <div className="lg:col-span-1 bg-slate-900/60 border border-white/5 rounded-[3rem] p-10">
                             <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400"><FiTarget/></div>
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Top Products</h4>
                             </div>
                             <div className="space-y-6">
                                {data.topProducts.map((p, i) => (
                                    <div key={i} className="flex justify-between items-center group">
                                        <span className="text-[11px] font-black text-slate-400 uppercase group-hover:text-white transition-colors">{p.name}</span>
                                        <span className="text-xs font-black text-indigo-400 font-mono">{currency}{Number(p.revenue).toFixed(2)}</span>
                                    </div>
                                ))}
                             </div>
                        </div>

                        <div className="lg:col-span-2 bg-slate-900/60 border border-white/5 rounded-[3rem] p-10">
                            <h4 className="text-sm font-black text-white uppercase tracking-widest mb-8">Daily Revenue Stream</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-slate-500 border-b border-white/5 text-[10px] font-black uppercase tracking-widest">
                                            <th className="pb-6">Date</th>
                                            <th className="pb-6 text-center">Orders</th>
                                            <th className="pb-6 text-right">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {data.daily.map((d) => (
                                            <tr key={d.day} className="hover:bg-white/[0.02]">
                                                <td className="py-6 text-[11px] font-black text-slate-300">{d.day}</td>
                                                <td className="py-6 text-center text-white font-mono">{d.order_count}</td>
                                                <td className="py-6 text-right text-xl font-black text-white italic tracking-tighter">{currency}{Number(d.revenue).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                   </div>
                )}
            </div>
        </main>
    );
};
