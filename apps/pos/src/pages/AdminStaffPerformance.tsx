
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

export const AdminStaffPerformance: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders } = useAuthStore();
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<PersonnelStat[]>([]);
    const [shifts, setShifts] = useState<ShiftRow[]>([]);
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
                return;
            }
            setLocked(false);
            if (res.ok) {
                const data = await res.json();
                setStats(data.personnel || []);
                setShifts(data.recentShifts || []);
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
        if (!mins) return '0 dk';
        const m = Number(mins);
        const h = Math.floor(m / 60);
        const rm = Math.round(m % 60);
        return h > 0 ? `${h} sa ${rm} dk` : `${rm} dk`;
    };

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.reports.desc')}</div>
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
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-200">
                        <FiTarget size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Personel Performans Dashboard</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Verimlilik, Satış ve Mesai Takibi</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 gap-2">
                        <FiCalendar className="text-slate-400" size={14}/>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none"
                            value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        />
                        <FiArrowRight className="text-slate-300" size={12}/>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none"
                            value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        />
                    </div>
                    <button 
                        onClick={() => void load()}
                        className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                    >
                        <FiActivity className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8 space-y-8">
                {/* LİDERLİK TABLOSU / TOP PERFORMERS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 p-6 flex flex-col min-h-[400px]">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <FiActivity className="text-indigo-600" /> Personel Verimlilik Matrisi
                            </h3>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase">Canlı Veri</span>
                        </div>
                        
                        <div className="flex-1 space-y-5">
                            {stats.length === 0 && <p className="text-center text-slate-400 py-10 font-bold uppercase tracking-widest">Veri bulunamadı</p>}
                            {stats.map((s) => (
                                <div key={s.id} className="group relative p-4 rounded-2xl border border-slate-50 hover:border-indigo-100 hover:bg-indigo-50/10 transition-all">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 overflow-hidden relative">
                                                {s.name[0]}
                                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent"></div>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-700">{s.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                                                        {s.role}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 italic">
                                                        <FiClock className="inline mr-1"/> {formatMins(s.total_work_mins)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-10 text-right">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Ciro Katkısı</p>
                                                <p className="text-lg font-black text-emerald-600">₺{Number(s.total_revenue_generated).toLocaleString('tr-TR')}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">İşlem</p>
                                                <p className="text-lg font-black text-slate-800">{Number(s.served_as_waiter) + Number(s.handled_as_cashier) + Number(s.picked_ups)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* PROGRESS BAR (Görsel İçin) */}
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-50 overflow-hidden rounded-b-2xl">
                                        <div 
                                            className="h-full bg-indigo-500 transition-all duration-1000" 
                                            style={{ width: `${Math.min(100, (Number(s.served_as_waiter) + Number(s.handled_as_cashier)) * 5)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6 flex flex-col">
                        <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden flex-1 flex flex-col justify-center">
                            <FiAward className="absolute -right-6 -top-6 text-white/5" size={200}/>
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Günün Yıldızı</h3>
                            {stats.length > 0 ? (
                                <>
                                    <div className="text-3xl font-black mb-2">{stats[0].name}</div>
                                    <p className="text-indigo-200 text-xs font-bold leading-relaxed opacity-80 uppercase tracking-wider">
                                        {stats[0].role} rolünde bugün en yüksek işlem hacmine ulaştı.
                                    </p>
                                    <div className="mt-8 flex gap-4">
                                        <div className="bg-white/10 rounded-2xl p-4 flex-1">
                                            <p className="text-[9px] font-black text-indigo-300 mb-1">CİRO</p>
                                            <p className="text-xl font-black">₺{Number(stats[0].total_revenue_generated).toLocaleString('tr-TR')}</p>
                                        </div>
                                        <div className="bg-white/10 rounded-2xl p-4 flex-1">
                                            <p className="text-[9px] font-black text-indigo-300 mb-1">MESAİ</p>
                                            <p className="text-xl font-black">{formatMins(stats[0].total_work_mins)}</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="text-white/40 font-bold uppercase py-10">Büyük başarılar bekleniyor...</p>
                            )}
                        </div>

                        <div className="bg-white rounded-[32px] border border-slate-100 p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-orange-50 text-orange-600">
                                    <FiTrendingUp size={24}/>
                                </div>
                                <div className="text-sm font-black text-slate-800 uppercase tracking-tight">SLA Hızı / Ortalama</div>
                            </div>
                            <div className="text-2xl font-black text-slate-800">14.2m</div>
                        </div>
                    </div>
                </div>

                {/* MESAI / SHIFT KAYITLARI */}
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Mesai ve Vardiya Kayıtları</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Son 100 işlem kaydı</p>
                        </div>
                        <FiClock className="text-slate-300" size={24}/>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/50 text-slate-400">
                                <tr>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Personel</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Giriş</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Çıkış</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Süre</th>
                                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Satış / Sipariş</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {shifts.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">
                                                    {s.staff_name[0]}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-700">{s.staff_name}</span>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{s.staff_role}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="text-xs font-bold text-slate-600">
                                                {new Date(s.clock_in).toLocaleDateString('tr-TR')}
                                            </div>
                                            <div className="text-[10px] font-black text-indigo-500">
                                                {new Date(s.clock_in).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            {s.clock_out ? (
                                                <>
                                                    <div className="text-xs font-bold text-slate-600">{new Date(s.clock_out).toLocaleDateString('tr-TR')}</div>
                                                    <div className="text-[10px] font-black text-rose-500">
                                                        {new Date(s.clock_out).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase animate-pulse">
                                                    <FiZap size={10}/> AKTİF
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 font-bold text-slate-500">{formatMins(s.duration_mins)}</td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="font-black text-slate-700">₺{Number(s.total_sales).toLocaleString('tr-TR')}</div>
                                            <div className="text-[10px] font-bold text-slate-400">{s.total_orders} Sipariş</div>
                                        </td>
                                    </tr>
                                ))}
                                {shifts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-10 text-center text-slate-300 font-black uppercase tracking-widest">Henüz kayıt yok</td>
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
