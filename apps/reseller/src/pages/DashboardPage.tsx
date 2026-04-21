import { useEffect, useState } from 'react';
import { FiUsers, FiDollarSign, FiClock, FiMessageSquare, FiLayers } from 'react-icons/fi';
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
    totalTenants?: number;
};

export function DashboardPage() {
    const { lang, tenants, fetchTenants, dashStats, fetchDashStats, trialExpiring, fetchTrialExpiring, token } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;
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

    return (
        <div className="space-y-8 animate-in">
            {growth && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('dash.growthTitle')}</p>
                        <p className="text-xl font-black text-white mt-1">{growth.totalTenants ?? '—'}</p>
                        <p className="text-[10px] text-slate-500">{t('dash.growthTenants')}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('dash.growthChurn')}</p>
                        <p className="text-xl font-black text-amber-300 mt-1">%{growth.churnRate ?? '0'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('dash.growthForecast')}</p>
                        <p className="text-xl font-black text-emerald-300 mt-1">€{Number(growth.revenueForecast ?? 0).toFixed(2)}</p>
                    </div>
                </div>
            )}

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
                    icon={<FiDollarSign size={32} />}
                    color="emerald"
                />
                <StatCard label={t('dash.trialExpiring')} value={dashStats?.trialExpiring ?? 0} icon={<FiClock size={32} />} color="orange" />
                <StatCard label={t('dash.pendingSupport')} value={dashStats?.pendingSupport ?? 0} icon={<FiMessageSquare size={32} />} color="red" />
            </div>

            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">{t('dash.recentRestaurants')}</h3>
                {tenants.length === 0 ? (
                    <EmptyState text={t('dash.noRestaurants')} />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {tenants.slice(0, 6).map((r) => (
                            <div
                                key={r.id}
                                className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.05] transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-white truncate">{r.name}</span>
                                    <span
                                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${
                                            r.status === 'active'
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : r.status === 'suspended'
                                                  ? 'bg-red-500/10 text-red-400'
                                                  : 'bg-orange-500/10 text-orange-400'
                                        }`}
                                    >
                                        {r.status}
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    {r.subscription_plan?.toUpperCase()} · {r.contact_email || '—'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {trialExpiring.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">{t('dash.trialExpiringList')}</h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-4 py-3 text-left">{t('rest.name')}</th>
                                    <th className="px-4 py-3 text-center">{t('rest.plan')}</th>
                                    <th className="px-4 py-3 text-center">{t('rest.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trialExpiring.map((r) => (
                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 text-white font-bold">{r.name}</td>
                                        <td className="px-4 py-3 text-center text-slate-400">{r.subscription_plan}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-[10px] font-black text-blue-400 uppercase">{t('dash.convertToPaid')}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">{t('dash.alertCenter')}</h3>
                {upcoming.length === 0 ? (
                    <EmptyState text={t('dash.noUpcomingPayments')} />
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-4 py-3 text-left">{t('dash.colRestaurant')}</th>
                                    <th className="px-4 py-3 text-right">{t('dash.colAmount')}</th>
                                    <th className="px-4 py-3 text-center">{t('dash.colDue')}</th>
                                    <th className="px-4 py-3 text-center">{t('dash.colStatus')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upcoming.map((p) => (
                                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 text-white font-bold">{p.tenant_name || '—'}</td>
                                        <td className="px-4 py-3 text-right text-slate-200 font-mono">€{Number(p.amount || 0).toFixed(2)}</td>
                                        <td className="px-4 py-3 text-center text-slate-400">{p.due_date ? String(p.due_date).slice(0, 10) : '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                p.status === 'overdue' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-300'
                                            }`}>
                                                {p.status || 'pending'}
                                            </span>
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
