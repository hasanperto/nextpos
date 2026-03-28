import React, { useEffect } from 'react';
import { FiTrendingUp, FiTrendingDown, FiAward, FiUsers, FiBarChart2 } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';

export const ReportsTab: React.FC = () => {
    const { growthReport, fetchGrowthReport } = useSaaSStore();
    useEffect(() => { fetchGrowthReport(); }, []);
    const gr = growthReport;

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Toplam Restoran" value={gr?.totalTenants || 0} icon={<FiUsers />} color="blue" />
                <StatCard label="Churn Rate" value={`%${gr?.churnRate || 0}`} icon={<FiTrendingDown />} color="red" />
                <StatCard label="Ayrılan/Askıya" value={gr?.churnedCount || 0} icon={<FiTrendingDown />} color="amber" />
                <StatCard label="Aktif Planlar" value={gr?.planDistribution?.length || 0} icon={<FiBarChart2 />} color="emerald" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Monthly Growth */}
                <SectionCard title="Aylık Büyüme" icon={<FiTrendingUp className="text-emerald-400" />}>
                    {gr?.monthlyGrowth && gr.monthlyGrowth.length > 0 ? (
                        <div className="space-y-2">
                            {gr.monthlyGrowth.map((m, i) => {
                                const max = Math.max(...gr.monthlyGrowth.map(x => x.new_tenants || 1));
                                const pct = ((m.new_tenants || 0) / max) * 100;
                                return (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-[10px] font-mono text-slate-500 w-16">{m.month}</span>
                                        <div className="flex-1 bg-white/5 rounded-full h-7 overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full flex items-center px-3 transition-all" style={{ width: `${Math.max(pct, 8)}%` }}>
                                                <span className="text-[10px] font-black text-white">{m.new_tenants}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : <EmptyState icon={<FiTrendingUp />} message="Büyüme verisi yok" />}
                </SectionCard>

                {/* Top Tenants */}
                <SectionCard title="En İyi 10 Restoran" icon={<FiAward className="text-amber-400" />}>
                    {gr?.topTenants && gr.topTenants.length > 0 ? (
                        <div className="space-y-2">
                            {gr.topTenants.map((t: any, i: number) => (
                                <div key={t.id} className="flex items-center gap-3 p-3 bg-black/20 rounded-xl hover:bg-black/30 transition-all">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                        i < 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                                    }`}>{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">{t.name}</div>
                                        <div className="text-[9px] text-slate-500 uppercase">{t.subscription_plan}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-emerald-400">€{Number(t.total_paid || 0).toLocaleString()}</div>
                                        <div className="text-[9px] text-slate-500">toplam ödeme</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState icon={<FiAward />} message="Henüz restoran verisi yok" />}
                </SectionCard>
            </div>

            {/* Plan Distribution */}
            {gr?.planDistribution && gr.planDistribution.length > 0 && (
                <SectionCard title="Plan Dağılımı" icon={<FiBarChart2 className="text-blue-400" />}>
                    <div className="grid grid-cols-3 gap-4">
                        {gr.planDistribution.map((p, i) => {
                            const colors = ['from-slate-600 to-slate-500', 'from-blue-600 to-indigo-500', 'from-amber-600 to-orange-500'];
                            return (
                                <div key={i} className={`bg-gradient-to-br ${colors[i] || colors[0]} p-6 rounded-2xl text-center`}>
                                    <div className="text-3xl font-black text-white">{p.count}</div>
                                    <div className="text-xs font-bold text-white/70 uppercase mt-1">{p.plan}</div>
                                </div>
                            );
                        })}
                    </div>
                </SectionCard>
            )}
        </div>
    );
};
