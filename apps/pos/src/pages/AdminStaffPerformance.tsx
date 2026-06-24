
import React, { useEffect, useState, useCallback } from 'react';
import { 
    FiActivity, FiClock, FiTrendingUp, 
    FiCalendar, FiArrowRight,
    FiAward, FiTarget, FiZap
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useNavigate } from 'react-router-dom';

type PersonnelStat = {
    id: number;
    name: string;
    role: string;
    status: string;
    served_as_waiter: number;
    handled_as_cashier: number;
    picked_ups: number;
    total_revenue_generated: string;
    total_work_mins: string;
    total_tips?: string | number;
    /** saniye: garson çağrısı yanıt süresi ort. */
    avg_table_call_response_sec?: number | string | null;
};

type ShiftRow = {
    id: number;
    staff_name: string;
    staff_role: string;
    clock_in: string;
    clock_out: string | null;
    duration_mins: number | null;
    total_sales: string;
    total_orders: number;
};

function roleLabel(role: string, t: (key: string) => string): string {
    const key = `admin.staff.role.${role}` as const;
    const translated = t(key);
    return translated !== key ? translated : role.toUpperCase();
}

export const AdminStaffPerformance: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders } = useAuthStore();
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<PersonnelStat[]>([]);
    const [shifts, setShifts] = useState<ShiftRow[]>([]);
    const [avgTableCallResponseSec, setAvgTableCallResponseSec] = useState<number | null>(null);
    const [locked, setLocked] = useState(false);
    const [dateRange, setDateRange] = useState({
        from: new Date().toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10)
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/reports/personnel-detailed?from=${dateRange.from}&to=${dateRange.to}`, {
                headers: getAuthHeaders()
            });
            if (res.status === 403) {
                setLocked(true);
                setStats([]);
                setShifts([]);
                setAvgTableCallResponseSec(null);
                return;
            }
            setLocked(false);
            if (res.ok) {
                const data = await res.json();
                setStats(data.personnel || []);
                setShifts(data.recentShifts || []);
                const g = data.avgTableCallResponseSec;
                setAvgTableCallResponseSec(g != null && Number.isFinite(Number(g)) ? Number(g) : null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, dateRange]);

    useEffect(() => {
        void load();
    }, [load]);

    const formatMins = (mins: number | string | null) => {
        if (!mins) return t('admin.staffPerf.mins.zero');
        const m = Number(mins);
        const h = Math.floor(m / 60);
        const rm = Math.round(m % 60);
        return h > 0
            ? t('admin.staffPerf.mins.hours').replace('{{h}}', String(h)).replace('{{m}}', String(rm))
            : t('admin.staffPerf.mins.only').replace('{{m}}', String(rm));
    };

    const formatResponseSec = (sec: number | string | null | undefined) => {
        const n = Number(sec);
        if (!Number.isFinite(n)) return '—';
        if (n < 60) return t('admin.staffPerf.sec.only').replace('{{s}}', String(Math.round(n)));
        const mm = Math.floor(n / 60);
        const ss = Math.round(n % 60);
        return t('admin.staffPerf.sec.mixed').replace('{{m}}', String(mm)).replace('{{s}}', String(ss));
    };

    if (locked) {
        return (
            <div className="min-h-screen bg-[#F1F5F9] dark:bg-[#090e1a] p-8 flex items-center justify-center">
                <div className="w-full max-w-md rounded-[32px] border border-slate-100 dark:border-white/10 bg-white dark:bg-[#0c1526] p-10 shadow-2xl dark:shadow-none text-center">
                    <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto mb-6">
                        <FiTarget size={32} />
                    </div>
                    <div className="mb-3 text-lg font-black text-slate-800 dark:text-white">{t('modules.locked.title')}</div>
                    <div className="mb-8 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">{t('modules.locked.reports.desc')}</div>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/settings', { replace: true })}
                        className="w-full rounded-2xl border border-violet-500 bg-violet-600 dark:bg-violet-500 py-4 text-xs font-black uppercase tracking-wider text-white hover:bg-violet-700 dark:hover:bg-violet-600 shadow-lg shadow-violet-100 dark:shadow-none active:scale-95 transition-all"
                    >
                        {t('modules.locked.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            <header className="flex flex-col md:flex-row gap-4 md:h-24 shrink-0 md:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 md:px-8 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-orange-600/10 border border-orange-500/35 flex items-center justify-center text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                        <FiTarget size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.staffPerf.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.staffPerf.subtitle')}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 gap-2">
                        <FiCalendar className="text-slate-400" size={14}/>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-white outline-none color-scheme-dark cursor-pointer"
                            style={{ colorScheme: 'dark' }}
                            value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        />
                        <FiArrowRight className="text-slate-600" size={12}/>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-white outline-none color-scheme-dark cursor-pointer"
                            style={{ colorScheme: 'dark' }}
                            value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        />
                    </div>
                    <button 
                        onClick={() => void load()}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 transition-all cursor-pointer"
                        title={t('admin.staffPerf.refresh')}
                        aria-label={t('admin.staffPerf.refresh')}
                    >
                        <FiActivity className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 md:p-8 space-y-8 z-10">
                {/* LİDERLİK TABLOSU / TOP PERFORMERS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-[2rem] shadow-2xl p-6 flex flex-col min-h-[400px]">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <FiActivity className="text-indigo-400" /> {t('admin.staffPerf.matrixTitle')}
                            </h3>
                            <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full uppercase tracking-wider">{t('admin.staffPerf.liveData')}</span>
                        </div>
                        
                        <div className="flex-1 space-y-5">
                            {stats.length === 0 && <p className="text-center text-slate-500 py-10 font-bold uppercase tracking-widest text-xs">{t('admin.staffPerf.noData')}</p>}
                            {stats.map((row) => (
                                <div key={row.id} className="group relative p-4 rounded-2xl border border-white/5 hover:border-indigo-500/25 hover:bg-indigo-500/[0.03] transition-all bg-white/[0.01]">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-slate-355 overflow-hidden relative">
                                                {row.name[0]}
                                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent"></div>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-white text-xs uppercase tracking-wide">{row.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-black uppercase bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded">
                                                        {roleLabel(row.role, t)}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500 font-bold italic">
                                                        <FiClock className="inline mr-1"/> {formatMins(row.total_work_mins)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-10 text-right font-bold text-xs">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">{t('admin.staffPerf.revenue')}</p>
                                                <p className="text-sm font-black text-emerald-400">₺{Number(row.total_revenue_generated).toLocaleString('tr-TR')}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">{t('admin.staffPerf.tips')}</p>
                                                <p className="text-sm font-black text-amber-400">₺{Number(row.total_tips || 0).toLocaleString('tr-TR')}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">{t('admin.staffPerf.transactions')}</p>
                                                <p className="text-sm font-black text-white">{Number(row.served_as_waiter) + Number(row.handled_as_cashier) + Number(row.picked_ups)}</p>
                                            </div>
                                            {String(row.role).toLowerCase() === 'waiter' && (
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                                                        {t('staff.avg_per_waiter')}
                                                    </p>
                                                    <p className="text-sm font-black text-indigo-400">
                                                        {formatResponseSec(row.avg_table_call_response_sec)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* PROGRESS BAR */}
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden rounded-b-2xl">
                                        <div 
                                            className="h-full bg-indigo-600 transition-all duration-1000" 
                                            style={{ width: `${Math.min(100, (Number(row.served_as_waiter) + Number(row.handled_as_cashier)) * 5)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6 flex flex-col">
                        <div className="bg-indigo-950/20 rounded-[2rem] border border-indigo-500/15 p-8 text-white shadow-2xl relative overflow-hidden flex-1 flex flex-col justify-center min-h-[220px] backdrop-blur-md">
                            <FiAward className="absolute -right-6 -top-6 text-indigo-500/5" size={200}/>
                            <h3 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">{t('admin.staffPerf.starTitle')}</h3>
                            {stats.length > 0 ? (
                                <>
                                    <div className="text-2xl font-black mb-2">{stats[0].name}</div>
                                    <p className="text-indigo-200 text-[10px] font-bold leading-relaxed opacity-85 uppercase tracking-wider">
                                        {t('admin.staffPerf.starDesc').replace('{{role}}', roleLabel(stats[0].role, t))}
                                    </p>
                                    <div className="mt-8 flex gap-4">
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex-1">
                                            <p className="text-[9px] font-black text-indigo-400 mb-1">{t('admin.staffPerf.revenueShort')}</p>
                                            <p className="text-base font-black text-emerald-400">₺{Number(stats[0].total_revenue_generated).toLocaleString('tr-TR')}</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex-1">
                                            <p className="text-[9px] font-black text-indigo-400 mb-1">{t('admin.staffPerf.tipsShort')}</p>
                                            <p className="text-base font-black text-amber-400">₺{Number(stats[0].total_tips || 0).toLocaleString('tr-TR')}</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex-1">
                                            <p className="text-[9px] font-black text-indigo-400 mb-1">{t('admin.staffPerf.shiftShort')}</p>
                                            <p className="text-base font-black">{formatMins(stats[0].total_work_mins)}</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="text-white/45 font-bold uppercase py-10">{t('admin.staffPerf.waitingSuccess')}</p>
                            )}
                        </div>

                        <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] backdrop-blur-md p-6 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="p-3.5 rounded-2xl bg-orange-600/10 border border-orange-500/20 text-orange-400 shrink-0">
                                    <FiTrendingUp size={24}/>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs font-black text-white uppercase tracking-tight">
                                        {t('staff.avg_table_call_response')}
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-500 mt-1 leading-snug">
                                        {t('staff.avg_table_call_hint')}
                                    </p>
                                </div>
                            </div>
                            <div className="text-xl font-black text-white shrink-0 font-mono">
                                {avgTableCallResponseSec != null ? formatResponseSec(avgTableCallResponseSec) : '—'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MESAI / SHIFT KAYITLARI */}
                <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] backdrop-blur-md shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                        <div>
                            <h3 className="text-xs font-black text-white uppercase tracking-wider">{t('admin.staffPerf.shiftsTitle')}</h3>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t('admin.staffPerf.shiftsSubtitle')}</p>
                        </div>
                        <FiClock className="text-slate-600" size={24}/>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                    <th className="px-8 py-5">{t('admin.staffPerf.col.staff')}</th>
                                    <th className="px-8 py-5">{t('admin.staffPerf.col.clockIn')}</th>
                                    <th className="px-8 py-5">{t('admin.staffPerf.col.clockOut')}</th>
                                    <th className="px-8 py-5">{t('admin.staffPerf.col.duration')}</th>
                                    <th className="px-8 py-5 text-right">{t('admin.staffPerf.col.sales')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-bold">
                                {shifts.map((shift) => (
                                    <tr key={shift.id} className="hover:bg-white/[0.01] transition-colors border-b border-white/[0.04] text-slate-350">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-bold text-slate-300 text-xs">
                                                    {shift.staff_name[0]}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-white uppercase text-xs tracking-wide">{shift.staff_name}</span>
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-0.5">{roleLabel(shift.staff_role, t)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="text-xs text-slate-200">
                                                {new Date(shift.clock_in).toLocaleDateString('tr-TR')}
                                            </div>
                                            <div className="text-[10px] font-black text-indigo-400">
                                                {new Date(shift.clock_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            {shift.clock_out ? (
                                                <>
                                                    <div className="text-xs text-slate-200">{new Date(shift.clock_out).toLocaleDateString('tr-TR')}</div>
                                                    <div className="text-[10px] font-black text-rose-450">
                                                        {new Date(shift.clock_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-wider animate-pulse">
                                                    <FiZap size={10}/> {t('admin.staffPerf.active')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-slate-400">{formatMins(shift.duration_mins)}</td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="font-black text-white text-xs">₺{Number(shift.total_sales).toLocaleString('tr-TR')}</div>
                                            <div className="text-[9px] font-bold text-slate-500">{t('admin.staffPerf.ordersCount').replace('{{count}}', String(shift.total_orders))}</div>
                                        </td>
                                    </tr>
                                ))}
                                {shifts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-10 text-center text-slate-500 font-black uppercase tracking-widest text-xs">{t('admin.staffPerf.noShifts')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
};
