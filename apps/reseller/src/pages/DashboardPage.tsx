import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { 
    FiUsers, 
    FiDollarSign, 
    FiClock, 
    FiMessageSquare, 
    FiLayers, 
    FiTrendingUp, 
    FiCreditCard, 
    FiActivity, 
    FiArrowRight, 
    FiLogIn, 
    FiUserPlus,
    FiSettings
} from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { StatCard, EmptyState } from '../components/Shared.tsx';

type UpcomingPayment = {
    id: number;
    tenant_name?: string;
    amount?: number | string;
    due_date?: string;
    status?: string;
};

type GrowthPayload = {
    churnRate?: string;
    revenueForecast?: number;
    estimatedMonthlyResellerCommission?: number;
    totalTenants?: number;
};

export function DashboardPage() {
    const lang = useResellerStore(s => s.lang);
    const tenants = useResellerStore(s => s.tenants);
    const fetchTenants = useResellerStore(s => s.fetchTenants);
    const dashStats = useResellerStore(s => s.dashStats);
    const fetchDashStats = useResellerStore(s => s.fetchDashStats);
    const trialExpiring = useResellerStore(s => s.trialExpiring);
    const fetchTrialExpiring = useResellerStore(s => s.fetchTrialExpiring);
    const admin = useResellerStore(s => s.admin);
    const token = useResellerStore(s => s.token);

    const t = (k: string) => messages[lang]?.[k] || messages['de']?.[k] || messages['en']?.[k] || messages['tr']?.[k] || k;
    const [upcoming, setUpcoming] = useState<UpcomingPayment[]>([]);
    const [growth, setGrowth] = useState<GrowthPayload | null>(null);

    useEffect(() => {
        void fetchTenants();
    }, [fetchTenants]);

    useEffect(() => {
        void fetchDashStats();
        fetchTrialExpiring();
    }, [tenants.length, fetchDashStats, fetchTrialExpiring]);

    useEffect(() => {
        const loadUpcoming = async () => {
            if (!token) return;
            try {
                const res = await fetch('/api/v1/tenants/finance/accounting/upcoming', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const rows = await res.json();
                setUpcoming(Array.isArray(rows) ? rows.slice(0, 6) : []);
            } catch {
                setUpcoming([]);
            }
        };
        void loadUpcoming();
    }, [token]);

    useEffect(() => {
        const loadGrowth = async () => {
            if (!token) return;
            try {
                const res = await fetch('/api/v1/tenants/reports/growth', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const g = (await res.json()) as GrowthPayload;
                setGrowth(g);
            } catch {
                setGrowth(null);
            }
        };
        void loadGrowth();
    }, [token]);

    const impersonateTenant = async (tenantId: string, tenantName: string) => {
        if (!token) {
            toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.');
            return;
        }
        const toastId = toast.loading('Gölge giriş bağlantısı kuruluyor...');
        try {
            const res = await fetch('/api/v1/auth/impersonate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ tenantId }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Gölge giriş kodu oluşturulamadı.', { id: toastId });
                return;
            }
            toast.success(`${tenantName} paneline yönlendiriliyorsunuz...`, { id: toastId });
            const q = new URLSearchParams({ impersonate_code: data.code });
            const posUrl = import.meta.env.VITE_POS_URL || 
                (window.location.origin.includes('localhost:4001') ? 'http://localhost:5173' : 
                 window.location.origin.includes('127.0.0.1:4001') ? 'http://127.0.0.1:5173' : 
                 window.location.origin.includes('reseller.') ? window.location.origin.replace('reseller.', 'pos.') : 
                 window.location.origin);
            window.open(`${posUrl}/login?${q.toString()}`, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Impersonation error:', err);
            toast.error('Bağlantı kurulurken teknik bir hata oluştu.', { id: toastId });
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* === 1. PRESTİJLİ MASTER ANALİTİK & CÜZDAN KARTLARI (PREMIUM HEADER GRIDS) === */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 💳 A. Glossy Bayi Kartı (Reseller Gold Visa Card Style) */}
                <div className="bg-gradient-to-tr from-slate-900 via-indigo-950/60 to-slate-950 border border-white/10 rounded-[32px] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between h-52 group">
                    {/* Glowing Aura Effect */}
                    <div className="absolute -right-16 -top-16 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                    <div className="absolute -left-16 -bottom-16 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />

                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black text-slate-500 tracking-[0.25em] uppercase block">{t('dash.walletTitle')}</span>
                            <span className="text-[11px] font-mono text-slate-300 mt-1 block">ID: #RES-00{admin?.id || '—'}</span>
                        </div>
                        <div className="p-2.5 bg-white/5 border border-white/10 rounded-2xl text-amber-400">
                            <FiCreditCard size={18} />
                        </div>
                    </div>

                    <div>
                        <span className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase block">{t('dash.currentBalance')}</span>
                        <span className="text-3xl font-black text-white tracking-tight mt-1.5 tabular-nums">
                            €{Number(admin?.wallet_balance || 0).toFixed(2)}
                        </span>
                    </div>

                    <div className="flex justify-between items-center border-t border-white/5 pt-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{admin?.name || 'NextPOS Reseller'}</span>
                        <button
                            type="button"
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'finance' } }));
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-[10px] font-black uppercase rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.96]"
                        >
                            {t('dash.topUpBalance')}
                        </button>
                    </div>
                </div>

                {/* 📈 B. Tahmini Büyüme & MRR Forecast */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col justify-between h-52 relative overflow-hidden group">
                    <div className="absolute right-0 bottom-0 opacity-[0.03] text-emerald-400 scale-150 transform translate-x-4 translate-y-4">
                        <FiTrendingUp size={160} />
                    </div>
                    
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black text-slate-500 tracking-[0.25em] uppercase block">{t('dash.growthTitle')}</span>
                            <span className="text-[10px] text-slate-400 block mt-1">{lang === 'tr' ? 'Tahmini Aylık Yinelenen Ciro (MRR)' : 'Monthly Running Revenue (MRR)'}</span>
                        </div>
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
                            <FiTrendingUp size={18} />
                        </div>
                    </div>

                    <div>
                        <span className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase block">{lang === 'tr' ? 'AYLIK CİRO TAHMİNİ' : 'REVENUE FORECAST'}</span>
                        <span className="text-3xl font-black text-emerald-400 tracking-tight mt-1.5 tabular-nums">
                            €
                            {Number(
                                growth?.revenueForecast ?? 
                                growth?.estimatedMonthlyResellerCommission ?? 
                                dashStats?.estimatedMonthlyCommission ?? 0
                            ).toFixed(2)}
                        </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-white/5 pt-3">
                        <span className="font-semibold">{lang === 'tr' ? 'Öngörülen Büyüme' : 'Projected Growth'}</span>
                        <span className="text-emerald-400 font-black inline-flex items-center gap-1">
                            <FiActivity size={12} /> +12.4% {lang === 'tr' ? 'Artış' : 'Up'}
                        </span>
                    </div>
                </div>

                {/* 🧬 C. Kayıp Oranı (Churn Rate) & Müşteri Sağlık Endeksi */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 rounded-[32px] p-6 shadow-2xl flex flex-col justify-between h-52 relative overflow-hidden group">
                    <div className="absolute right-0 bottom-0 opacity-[0.03] text-blue-400 scale-150 transform translate-x-4 translate-y-4">
                        <FiActivity size={160} />
                    </div>

                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black text-slate-500 tracking-[0.25em] uppercase block">{lang === 'tr' ? 'KAYIP ORANI & SAĞLIK' : 'CHURN & RETENTION'}</span>
                            <span className="text-[10px] text-slate-400 block mt-1">{lang === 'tr' ? 'Müşteri Kayıp ve Memnuniyet Analitiği' : 'User Retention and Health Index'}</span>
                        </div>
                        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
                            <FiActivity size={18} />
                        </div>
                    </div>

                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <span className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase block">{t('dash.growthChurn')}</span>
                            <span className="text-3xl font-black text-amber-300 tracking-tight mt-1.5 tabular-nums">
                                %{growth?.churnRate ?? '0.00'}
                            </span>
                        </div>
                        {/* Circular Progress Gauge */}
                        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="28" cy="28" r="24" className="stroke-white/5" strokeWidth="4" fill="transparent" />
                                <circle cx="28" cy="28" r="24" className="stroke-blue-500" strokeWidth="4" fill="transparent" strokeDasharray="150" strokeDashoffset="15" />
                            </svg>
                            <span className="absolute text-[10px] font-black text-white">90%</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-white/5 pt-3">
                        <span className="font-semibold">{lang === 'tr' ? 'Kullanıcı Sağlık Endeksi' : 'Customer Health Index'}</span>
                        <span className="text-blue-400 font-black uppercase tracking-wider text-[9px]">{lang === 'tr' ? 'MÜKEMMEL' : 'EXCELLENT'}</span>
                    </div>
                </div>

            </div>

            {/* === 2. HIZLI İŞLEM PANELİ (QUICK LAUNCHER LAUNCHPAD) === */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-5">
                <span className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase block mb-3">{lang === 'tr' ? 'HIZLI İŞLEM BAŞLATICI' : 'QUICK ACTION LAUNCHPAD'}</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'restaurants', action: 'add' } }));
                        }}
                        className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg transition-all group text-left active:scale-[0.97]"
                    >
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
                            <FiUserPlus size={16} />
                        </div>
                        <div>
                            <span className="text-xs font-black text-white uppercase block">{lang === 'tr' ? 'Restoran Ekle' : 'Add Restaurant'}</span>
                            <span className="text-[9px] text-slate-500 block mt-0.5">{lang === 'tr' ? 'Yeni lisans oluştur' : 'Provision new tenant'}</span>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'finance' } }));
                        }}
                        className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg transition-all group text-left active:scale-[0.97]"
                    >
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
                            <FiCreditCard size={16} />
                        </div>
                        <div>
                            <span className="text-xs font-black text-white uppercase block">{lang === 'tr' ? 'Fatura & Cari' : 'Finance & Ledger'}</span>
                            <span className="text-[9px] text-slate-500 block mt-0.5">{lang === 'tr' ? 'Ödemeleri kontrol et' : 'Control billing history'}</span>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'settings' } }));
                        }}
                        className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg transition-all group text-left active:scale-[0.97]"
                    >
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl group-hover:scale-105 transition-transform">
                            <FiSettings size={16} />
                        </div>
                        <div>
                            <span className="text-xs font-black text-white uppercase block">{lang === 'tr' ? 'Sistem Araçları' : 'System Tools'}</span>
                            <span className="text-[9px] text-slate-500 block mt-0.5">{lang === 'tr' ? 'Komisyonları hesapla' : 'Adjust commissions'}</span>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'support' } }));
                        }}
                        className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg transition-all group text-left active:scale-[0.97]"
                    >
                        <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl group-hover:scale-105 transition-transform">
                            <FiMessageSquare size={16} />
                        </div>
                        <div>
                            <span className="text-xs font-black text-white uppercase block">{lang === 'tr' ? 'Destek Talebi Aç' : 'Open Ticket'}</span>
                            <span className="text-[9px] text-slate-500 block mt-0.5">{lang === 'tr' ? 'Yönetime bilet gönder' : 'Request support'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* === 3. STANDART STAT KARTLARI (METRICS CARDS) === */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <StatCard label={t('dash.activeRestaurants')} value={dashStats?.active ?? tenants.filter((x) => x.status === 'active').length} icon={<FiUsers size={32} />} color="blue" />
                <StatCard
                    label={t('nav.restaurants')}
                    value={dashStats?.totalTenants ?? tenants.length}
                    icon={<FiLayers size={32} />}
                    color="indigo"
                />
                <StatCard
                    label={t('dash.monthlyCommission')}
                    value={`€${(dashStats?.monthlyCommission ?? 0).toFixed(2)}`}
                    hint={
                        (dashStats?.estimatedMonthlyCommission ?? 0) > 0
                            ? `${t('dash.estimatedRecurringCommission')}: €${dashStats?.estimatedMonthlyCommission?.toFixed(2)}`
                            : undefined
                    }
                    icon={<FiDollarSign size={32} />}
                    color="emerald"
                />
                <StatCard label={t('dash.trialExpiring')} value={dashStats?.trialExpiring ?? 0} icon={<FiClock size={32} />} color="orange" />
                <StatCard label={t('dash.pendingSupport')} value={dashStats?.pendingSupport ?? 0} icon={<FiMessageSquare size={32} />} color="red" />
            </div>

            {/* === 4. CANLI RESTORAN TAKİPÇİSİ & ANINDA GÖLGE GİRİŞLERİ === */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('dash.recentRestaurants')}</h3>
                    <button
                        type="button"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'restaurants' } }));
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-blue-400 hover:text-blue-300 hover:underline"
                    >
                        {t('dash.manageAll')} <FiArrowRight size={14} />
                    </button>
                </div>
                {tenants.length === 0 ? (
                    <EmptyState text={t('dash.noRestaurants')} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {tenants.slice(0, 6).map((r) => {
                            const isOnline = String(r.status || '').toLowerCase() === 'active';
                            const planColor =
                                r.subscription_plan === 'enterprise'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : r.subscription_plan === 'pro'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                            return (
                                <div
                                    key={r.id}
                                    className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-xl transition-all flex flex-col justify-between gap-4 group relative overflow-hidden"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-blue-400 group-hover:scale-105 transition-transform duration-300">
                                                {r.name[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-bold text-sm text-white truncate">{r.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{r.schema_name || '—'}</span>
                                            </div>
                                        </div>
                                        <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                                            r.status === 'active'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : r.status === 'suspended'
                                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                  : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                        }`}>
                                            <span className={`w-1 h-1 rounded-full ${r.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-orange-400'}`} />
                                            {r.status}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-white/[0.03] pt-3 text-[10px] text-slate-400">
                                        <div className="space-y-1">
                                            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">{lang === 'tr' ? 'Hizmet Planı' : 'Subscription'}</span>
                                            <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-md border uppercase ${planColor}`}>
                                                {r.subscription_plan}
                                            </span>
                                        </div>
                                        
                                        {/* Direct Shadow Login Impersonation Shortcut */}
                                        {isOnline ? (
                                            <button
                                                type="button"
                                                onClick={() => impersonateTenant(r.id, r.name)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-600/10 to-teal-600/10 border border-cyan-500/20 text-cyan-400 hover:from-cyan-600 hover:to-teal-600 hover:text-white rounded-xl transition-all text-[9px] font-black uppercase active:scale-[0.96] hover:shadow-lg hover:shadow-cyan-600/20 shrink-0"
                                                title={t('dash.shadowLoginHint')}
                                            >
                                                <FiLogIn size={12} />
                                                {t('rest.mobile.shadowLogin')}
                                            </button>
                                        ) : (
                                            <span className="text-[9px] font-bold text-slate-500 italic shrink-0">
                                                {lang === 'tr' ? 'Bağlantı pasif' : 'Inactive'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* === 5. KRİTİK ALARMLAR: DENEME SÜRESİ DOLANLAR === */}
            {trialExpiring.length > 0 && (
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-5">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                        <FiClock className="text-orange-400" /> {t('dash.trialExpiringList')}
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black bg-white/[0.02]">
                                    <th className="px-5 py-4">{t('rest.name')}</th>
                                    <th className="px-5 py-4 text-center">{t('rest.plan')}</th>
                                    <th className="px-5 py-4 text-right">{t('rest.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {trialExpiring.map((r) => (
                                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-4 text-white font-bold">{r.name}</td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                                                {r.subscription_plan}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'restaurants', search: r.name } }));
                                                }}
                                                className="inline-flex items-center gap-1 text-[10px] font-black text-blue-400 hover:text-blue-300 uppercase bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl transition-all"
                                            >
                                                {t('dash.convertToPaid')} <FiArrowRight size={11} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* === 6. ALARM MERKEZİ: YAKLAŞAN & KRİTİK ÖDEMELER === */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-5">
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <FiDollarSign className="text-emerald-400" /> {t('dash.alertCenter')}
                </h3>
                {upcoming.length === 0 ? (
                    <EmptyState text={t('dash.noUpcomingPayments')} />
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black bg-white/[0.02]">
                                    <th className="px-5 py-4">{t('dash.colRestaurant')}</th>
                                    <th className="px-5 py-4 text-right">{t('dash.colAmount')}</th>
                                    <th className="px-5 py-4 text-center">{t('dash.colDue')}</th>
                                    <th className="px-5 py-4 text-center">{t('dash.colStatus')}</th>
                                    <th className="px-5 py-4 text-right">{lang === 'tr' ? 'İŞLEMLER' : 'ACTIONS'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {upcoming.map((p) => (
                                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-4 text-white font-bold">{p.tenant_name || '—'}</td>
                                        <td className="px-5 py-4 text-right text-emerald-400 font-mono font-bold">€{Number(p.amount || 0).toFixed(2)}</td>
                                        <td className="px-5 py-4 text-center text-slate-400">{p.due_date ? String(p.due_date).slice(0, 10) : '—'}</td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${
                                                p.status === 'overdue' 
                                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                            }`}>
                                                {p.status || 'pending'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    window.dispatchEvent(new CustomEvent('reseller:navigate', { detail: { page: 'finance', search: p.tenant_name } }));
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-md active:scale-[0.96]"
                                            >
                                                {lang === 'tr' ? 'Detay' : 'Details'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
