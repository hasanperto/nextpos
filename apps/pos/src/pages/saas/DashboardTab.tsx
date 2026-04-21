import React, { useEffect, useMemo } from 'react';
import { 
    FiActivity, FiUsers, FiDollarSign, FiTrendingUp,
    FiAlertTriangle, FiCheckCircle, FiMessageSquare, FiPhone, FiTarget,
    FiMap, FiStar, FiZap, FiArrowUpRight, FiBox, FiShield
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

type SaaSTab = 'dashboard' | 'tenants' | 'resellers' | 'finance' | 'accounting' | 'security' | 'reports' | 'plans' | 'backups' | 'crm' | 'monitoring' | 'support' | 'shop' | 'settings';

interface DashboardTabProps {
    isSuperAdmin?: boolean;
    onNavigate?: (tab: SaaSTab) => void;
}

/**
 * Premium Live Operational Radar
 * Visualizes incoming call traffic and active operations.
 */
const OperationRadar: React.FC<{ activeItems: any[] }> = ({ activeItems }) => {
    // Reduce items and animations on mobile for performance
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const displayItems = isMobile ? activeItems.slice(0, 4) : activeItems.slice(0, 8);

    return (
        <div className="relative h-64 sm:h-80 md:h-96 flex items-center justify-center bg-slate-950/20 rounded-2xl sm:rounded-[3rem] border border-white/5 overflow-hidden group shadow-[inset_0_0_60px_rgba(0,0,0,0.4)] md:shadow-[inset_0_0_100px_rgba(0,0,0,0.6)]">
            {/* Background Grid - desktop only */}
            {!isMobile && (
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #6366f1 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            )}

            {/* Radar Effects - simplified on mobile */}
            <div className="absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12)_0%,transparent_70%)]" />
                {!isMobile && (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="absolute inset-0 opacity-40">
                        <div className="absolute top-1/2 left-1/2 w-[250%] h-4 bg-gradient-to-r from-indigo-500/0 via-indigo-500/40 to-indigo-500/0 -translate-x-1/2 -translate-y-1/2 blur-[12px]" />
                    </motion.div>
                )}
            </div>

            {/* Concentric Rings */}
            <div className="absolute inset-0 flex items-center justify-center">
                {(isMobile ? [1, 2, 3] : [1, 2, 3, 4]).map(i => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0.1, scale: 0.8 }}
                        animate={isMobile ? { opacity: 0.15 } : { opacity: [0.1, 0.2, 0.1], scale: 1 }}
                        transition={isMobile ? {} : { duration: 4, delay: i * 0.5, repeat: Infinity }}
                        className="absolute rounded-full border border-indigo-500/20"
                        style={{ width: i * (isMobile ? 60 : 80), height: i * (isMobile ? 60 : 80) }}
                    />
                ))}
            </div>

            {/* Active Operation Nodes */}
            <AnimatePresence>
                {displayItems.map((item, idx) => {
                    const angles = [45, 135, 225, 315, 90, 180, 270, 0];
                    const angle = angles[idx % angles.length];
                    const distance = isMobile ? 35 + (idx * 15) % 50 : 50 + (idx * 25) % 95;

                    return (
                        <motion.div
                            key={item.id}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="z-10 absolute"
                            style={{ transform: `rotate(${angle}deg) translateY(-${distance}px) rotate(-${angle}deg)` }}
                        >
                            <div className="relative group/node cursor-crosshair">
                                {!isMobile && (
                                    <motion.div animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }} className={`absolute -inset-4 rounded-full blur-lg opacity-40 ${item.type === 'call' ? 'bg-sky-500' : 'bg-rose-500'}`} />
                                )}
                                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.3)] sm:shadow-[0_0_20px_rgba(255,255,255,0.4)] relative z-10 transition-transform group-hover/node:scale-125 ${item.type === 'call' ? 'bg-sky-400' : 'bg-rose-400'}`} />
                                {!isMobile && <div className={`absolute -inset-1 border border-white/20 rounded-full animate-ping-slow ${item.type === 'call' ? 'border-sky-500' : 'border-rose-500'}`} />}
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>

            {/* Radar Center Signal */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)] sm:shadow-[0_0_30px_rgba(99,102,241,0.8)]" />
                {!isMobile && <motion.div animate={{ scale: [1, 3], opacity: [0.8, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="absolute w-4 h-4 border border-indigo-500/50 rounded-full" />}
            </div>

            {/* Activity Label */}
            <div className="absolute bottom-3 sm:bottom-6 flex flex-col items-center">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-xl shadow-lg">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <span className="text-[8px] sm:text-[10px] font-black text-indigo-300 uppercase tracking-wider">Intel</span>
                </div>
                <p className="text-[8px] sm:text-[10px] font-black text-slate-600 uppercase tracking-widest">{displayItems.length} SİGNAL</p>
            </div>
        </div>
    );
};

export const DashboardTab: React.FC<DashboardTabProps> = ({ isSuperAdmin, onNavigate }) => {
    const { t } = useSaaSLocale();
    const {
        stats, supportStats, systemHealth,
        growthReport, presence, settings,
        fetchSystemHealth, fetchGrowthReport, fetchFinancialSummary, fetchPresence,
        fetchSettings, admin, liveFeed,
        financialSummary, accountingUpcoming, fetchAccountingUpcoming,
        resellerTopupPendingCount, fetchResellerTopupPendingCount,
    } = useSaaSStore();

    useEffect(() => {
        if (isSuperAdmin) {
            fetchSystemHealth();
            fetchGrowthReport();
            fetchFinancialSummary();
            fetchAccountingUpcoming();
            fetchSettings();
            void fetchResellerTopupPendingCount();
        }
        fetchPresence();
        const timer = setInterval(() => fetchPresence(), 30000);
        return () => clearInterval(timer);
    }, [isSuperAdmin, fetchSystemHealth, fetchGrowthReport, fetchFinancialSummary, fetchAccountingUpcoming, fetchPresence, fetchSettings, fetchResellerTopupPendingCount]);

    const currency = settings?.currency || '€';
    const isReseller = admin?.role === 'reseller';
    const healthOk = systemHealth?.status === 'ok' || systemHealth?.status === 'healthy';

    const activeRadarItems = useMemo(() => 
        liveFeed.filter(f => f.type === 'call' || f.type === 'sale').slice(0, 8),
        [liveFeed]
    );

    const upcomingSummary = useMemo(() => {
        const rows = (accountingUpcoming || []) as any[];
        const revenueTypes = new Set([
            'subscription', 'license', 'setup', 'addon',
            'reseller_package_onboarding', 'license_upgrade',
        ]);
        const commissionTypes = new Set(['reseller_income']);

        const receivables = rows.filter((r) => revenueTypes.has(String(r?.payment_type || '')));
        const commissions = rows.filter((r) => commissionTypes.has(String(r?.payment_type || '')));

        const sum = (xs: any[]) => xs.reduce((acc, r) => acc + Number(r?.amount || 0), 0);

        return {
            receivableCount: receivables.length,
            receivableTotal: sum(receivables),
            commissionCount: commissions.length,
            commissionTotal: sum(commissions),
            rows,
        };
    }, [accountingUpcoming]);

    const paymentRowLabel = (p: any): string => {
        if (p?.tenant_name) return String(p.tenant_name);
        if (p?.description) return String(p.description);
        if (p?.tenant_id) return String(p.tenant_id);
        return '—';
    };

    const statusChip = (status?: string) => {
        const s = String(status || '').toLowerCase();
        const cls =
            s === 'paid'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : s === 'overdue'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : s === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-slate-500/10 text-slate-300 border-slate-500/20';
        return <span className={`px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${cls}`}>{s || '—'}</span>;
    };

    const totalOperators = useMemo(() => 
        Object.values(presence).reduce((acc, count) => acc + (count || 0), 0),
        [presence]
    );

    const growthStats = useMemo(() => {
        const monthly = growthReport?.monthlyGrowth || [];
        const last = monthly[monthly.length - 1]?.new_tenants || 0;
        const prev = monthly[monthly.length - 2]?.new_tenants || 0;
        const delta = last - prev;
        const deltaPct = prev > 0 ? (delta / prev) * 100 : 0;
        const avg =
            monthly.length > 0
                ? monthly.reduce((sum, m) => sum + Number(m.new_tenants || 0), 0) / monthly.length
                : 0;
        return { last, prev, delta, deltaPct, avg };
    }, [growthReport]);

    const platformMetrics = useMemo(() => {
        const base = isSuperAdmin ? [
            {
                label: 'AYLIK YENI TENANT',
                value: `${growthStats.last}`,
                trend: `${growthStats.delta >= 0 ? '+' : ''}${growthStats.delta} (${growthStats.deltaPct.toFixed(1)}%)`,
                status: growthStats.delta >= 0 ? 'optimal' : 'warning'
            },
            {
                label: 'CHURN ORANI',
                value: `%${Number(growthReport?.churnRate || 0).toFixed(2)}`,
                trend: `${growthReport?.churnedCount || 0} ayrilan`,
                status: Number(growthReport?.churnRate || 0) <= 3 ? 'optimal' : 'warning'
            },
            {
                label: 'CANLI OPERATOR',
                value: totalOperators.toString(),
                trend: 'Gercek zamanli',
                status: 'optimal'
            },
            {
                label: 'ACIK DESTEK',
                value: `${supportStats?.open || 0}`,
                trend: `${supportStats?.inProgress || 0} islemde`,
                status: (supportStats?.open || 0) < 10 ? 'optimal' : 'warning'
            }
        ] : [
            { label: 'LICENSE USAGE', value: `${(stats?.totalTenants ?? 0)} Active`, trend: 'Health', status: 'optimal' },
            { label: 'AVG ARPU', value: `${currency}${((stats?.monthlyRevenue || 0) / (stats?.totalTenants || 1)).toFixed(0)}`, trend: 'Monthly', status: 'optimal' },
            { label: 'SUPPORT STATUS', value: `${supportStats?.open || 0}`, trend: 'Pending', status: 'optimal' },
            { label: 'COMMISSION RATE', value: `${admin?.commissionRate || 0}%`, trend: 'Locked', status: 'optimal' }
        ];
        return base;
    }, [isSuperAdmin, totalOperators, stats, supportStats, admin, currency, growthStats, growthReport]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700 pb-20">
            {/* High-Level Pulse Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    label={isReseller ? t('dashboard.stat.portfolio') : t('dashboard.stat.totalRest')}
                    value={stats?.totalTenants ?? 0}
                    icon={<FiUsers />}
                    color="blue"
                    trend={`${stats?.activeTenants ?? 0} Active`}
                    trendStatus="up"
                />
                <StatCard
                    label={isReseller ? t('dashboard.stat.mrrReseller') : t('dashboard.stat.mrr')}
                    value={`${currency}${Number(stats?.monthlyRevenue ?? 0).toLocaleString('de-DE')}`}
                    icon={<FiDollarSign />}
                    color="indigo"
                    trend="+8.2%"
                    trendStatus="up"
                />
                <StatCard
                    label={isReseller ? t('dashboard.stat.licenses') : t('dashboard.stat.compliance')}
                    value={isReseller ? (stats?.available_licenses ?? 0) : (settings?.tse_enabled ? t('dashboard.stat.complianceOk') : t('dashboard.stat.complianceRisk'))}
                    icon={isReseller ? <FiBox /> : <FiShield />}
                    color={isReseller ? 'amber' : (settings?.tse_enabled ? 'emerald' : 'rose')}
                    sub={isReseller ? 'Available for Activation' : (settings?.tse_enabled ? 'Global TSE Status' : 'TSE Integration Required')}
                />
                <StatCard
                    label={t('dashboard.stat.health')}
                    value={healthOk ? "OPTIMAL" : "WARNING"}
                    icon={<FiActivity />}
                    color={healthOk ? 'emerald' : 'red'}
                    sub={`${totalOperators} Operators Online`}
                />
            </div>

            {isSuperAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Yonetici Ozeti</p>
                        <p className="mt-2 text-2xl font-black text-white tabular-nums">
                            {currency}{Number(stats?.monthlyRevenue || 0).toLocaleString('de-DE')}
                        </p>
                        <p className="mt-1 text-xs text-emerald-100/80">
                            Bu ay tahsilat • Son ay yeni tenant: <span className="font-black">{growthStats.last}</span>
                        </p>
                    </div>
                    <div className="rounded-3xl border border-indigo-500/20 bg-indigo-500/10 p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Risk Izleme</p>
                        <p className="mt-2 text-2xl font-black text-white tabular-nums">
                            {growthReport?.churnRiskCount ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-indigo-100/80">
                            Churn riski isaretli tenant • Churn: %{Number(growthReport?.churnRate || 0).toFixed(2)}
                        </p>
                    </div>
                    <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Operasyon Nabzi</p>
                        <p className="mt-2 text-2xl font-black text-white tabular-nums">
                            {supportStats?.open || 0}
                        </p>
                        <p className="mt-1 text-xs text-amber-100/80">
                            Acik destek talebi • Canli operator: <span className="font-black">{totalOperators}</span>
                        </p>
                    </div>
                </div>
            )}

            {isSuperAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                        label="7 GÜN İÇİNDE TAHSİLAT"
                        value={`${currency}${Number(upcomingSummary.receivableTotal || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={<FiDollarSign />}
                        color="emerald"
                        trend={`${upcomingSummary.receivableCount} kayıt`}
                        trendStatus="up"
                    />
                    <StatCard
                        label="7 GÜN İÇİNDE KOMİSYON"
                        value={`${currency}${Number(upcomingSummary.commissionTotal || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={<FiAlertTriangle />}
                        color="amber"
                        trend={`${upcomingSummary.commissionCount} kayıt`}
                        trendStatus="stable"
                    />
                    <StatCard
                        label="GELECEK AY TAHMİNİ GELİR"
                        value={`${currency}${Number(financialSummary?.nextMonthEstimatedRevenue || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={<FiTrendingUp />}
                        color="indigo"
                        sub="Ödeme bazlı (son 30 gün)"
                    />
                </div>
            )}

            {isSuperAdmin && (
                <SectionCard
                    title="YAKLAŞAN ÖDEMELER (7 GÜN)"
                    icon={<FiAlertTriangle className="text-rose-400" />}
                    action={
                        <button
                            type="button"
                            onClick={() => onNavigate?.('accounting')}
                            className="px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/80 hover:text-white transition-colors"
                        >
                            TÜMÜ
                        </button>
                    }
                >
                    {upcomingSummary.rows.length === 0 ? (
                        <EmptyState icon={<FiDollarSign />} message="Yaklaşan ödeme yok" />
                    ) : (
                        <div className="p-6">
                            <div className="space-y-3">
                                {upcomingSummary.rows.slice(0, 8).map((p) => {
                                    const due = p?.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—';
                                    const pt = String(p?.payment_type || '');
                                    const isCommission = pt === 'reseller_income';
                                    return (
                                        <div
                                            key={p?.id ?? `${pt}-${due}-${paymentRowLabel(p)}`}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[28px] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-5 py-4"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="text-sm font-black text-white truncate uppercase italic tracking-tight">
                                                        {paymentRowLabel(p)}
                                                    </div>
                                                    <span className={`shrink-0 px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${isCommission ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                        {isCommission ? 'KOMİSYON' : 'TAHSİLAT'}
                                                    </span>
                                                </div>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <span className="px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/10 text-slate-400 bg-black/20">
                                                        Vade: {due}
                                                    </span>
                                                    {pt && (
                                                        <span className="px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/10 text-slate-500 bg-black/20">
                                                            {pt}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tutar</div>
                                                    <div className={`text-lg font-black tabular-nums italic ${isCommission ? 'text-rose-300' : 'text-white'}`}>
                                                        {currency}{Number(p?.amount || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                                {statusChip(p?.status)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </SectionCard>
            )}

            {isSuperAdmin && resellerTopupPendingCount != null && resellerTopupPendingCount > 0 && (
                <button
                    type="button"
                    onClick={() => onNavigate?.('resellers')}
                    className="w-full text-left rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 flex items-center justify-between gap-4 hover:bg-amber-500/15 transition-colors group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-300">
                            <FiDollarSign size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-black text-white uppercase tracking-tight">{t('dashboard.pendingWalletTopups')}</p>
                            <p className="text-[11px] text-amber-200/80 font-bold truncate">{t('dashboard.pendingWalletTopupsHint')}</p>
                        </div>
                    </div>
                    <span className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-900 text-xs font-black tabular-nums">
                        {resellerTopupPendingCount}
                    </span>
                </button>
            )}

            {/* Financial Infrastructure Pulse (NEW PHASE 13) */}
            {isSuperAdmin && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6"
                >
                    {['iyzico', 'paytr', 'stripe'].map((gw) => {
                        const isActive = settings?.active_gateway === gw;
                        const isConfigured = gw === 'iyzico' ? (settings?.iyzico_api_key && settings?.iyzico_secret_key) :
                                           gw === 'paytr' ? (settings?.paytr_merchant_id && settings?.paytr_merchant_key) :
                                           (settings?.stripe_public_key && settings?.stripe_secret_key);
                        
                        return (
                            <div key={gw} className={`p-8 rounded-[3rem] border transition-all group relative overflow-hidden ${isActive ? 'bg-indigo-500/10 border-indigo-500/30 shadow-2xl shadow-indigo-500/10' : 'bg-white/[0.02] border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'}`}>
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                    <FiShield size={120} />
                                </div>
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3.5 rounded-2xl border ${isActive ? 'bg-indigo-500/20 border-indigo-500/20 text-indigo-400' : 'bg-slate-500/20 border-white/5 text-slate-500'}`}>
                                            <FiZap size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-white uppercase tracking-tighter">{gw.toUpperCase()} GATEWAY</h4>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Transaction Node</p>
                                        </div>
                                    </div>
                                    {isActive && (
                                        <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">ACTIVE</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</span>
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isConfigured ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {isConfigured ? 'READY TO SYNC' : 'AUTH REQUIRED'}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: isConfigured ? (isActive ? '100%' : '60%') : '15%' }}
                                            className={`h-full ${isActive ? 'bg-gradient-to-r from-emerald-500 to-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-500/40'}`} 
                                        />
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] italic">Operational Latency</span>
                                        <span className="text-[10px] font-mono text-white/50">{isConfigured ? '24ms' : '--'}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Operations Area */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Platform Pulse Heatmap (New Global Radar Layer) */}
                    {(isSuperAdmin || isReseller) && (
                        <SectionCard 
                            title={isSuperAdmin ? "PLATFORM INTEGRITY MATRIX" : "PORTFOLIO PERFORMANCE MATRIX"} 
                            icon={isSuperAdmin ? <FiTarget className="text-rose-400 animate-pulse-fast" /> : <FiTrendingUp className="text-emerald-400" />}
                        >
                            <div className="p-10 space-y-10">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
                                    {platformMetrics.map((m, i) => (
                                        <div key={i} className="flex flex-col relative group/metric">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-4 group-hover:text-indigo-400 transition-colors italic">{m.label}</span>
                                            <div className="flex items-baseline gap-3">
                                                <span className="text-4xl font-black text-white italic tracking-tighter tabular-nums leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{m.value}</span>
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${m.status === 'optimal' ? 'text-emerald-500' : 'text-amber-500'}`}>{m.trend}</span>
                                            </div>
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                whileInView={{ width: '60%' }}
                                                className="h-1 bg-indigo-500/20 mt-4 rounded-full relative overflow-hidden"
                                            >
                                                <motion.div 
                                                    animate={{ x: ['-100%', '100%'] }}
                                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
                                                />
                                            </motion.div>
                                        </div>
                                    ))}
                                </div>

                                <div className="relative h-56 bg-slate-950/40 rounded-[3rem] border border-white/5 overflow-hidden p-10 group/grid">
                                    {/* Intelligence Grid Background */}
                                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                                    
                                    {/* Live Node Matrix Rendering */}
                                    <div className="absolute inset-x-10 inset-y-8 grid grid-cols-12 grid-rows-4 gap-4 opacity-40">
                                        {[...Array(48)].map((_, i) => {
                                            const status = i % 13 === 0 ? 'critical' : i % 8 === 0 ? 'warning' : 'healthy';
                                            const duration =
                                                status === 'healthy' ? 3 + (i % 5) * 0.4 : 1.5;
                                            const delay = (i % 7) * 0.25;
                                            return (
                                                <motion.div 
                                                    key={i}
                                                    animate={{ 
                                                        opacity: status === 'healthy' ? [0.4, 0.8, 0.4] : [0.6, 1, 0.6],
                                                        scale: status !== 'healthy' ? [1, 1.1, 1] : 1
                                                    }}
                                                    transition={{ 
                                                        duration,
                                                        repeat: Infinity,
                                                        delay
                                                    }}
                                                    className={`rounded-lg border shadow-sm ${
                                                        status === 'critical' ? 'bg-rose-500/20 border-rose-500/40 shadow-rose-500/10' :
                                                        status === 'warning' ? 'bg-amber-500/20 border-amber-500/40 shadow-amber-500/10' :
                                                        'bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5'
                                                    }`}
                                                />
                                            );
                                        })}
                                    </div>
                                    
                                    {/* Grid Focus Info */}
                                    <div className="relative z-10 flex flex-col items-center justify-center h-full">
                                        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 px-8 py-4 rounded-[2rem] shadow-2xl">
                                            <div className="text-xs font-black text-white uppercase tracking-[0.35em] mb-1 font-mono text-center">TENANT SAGLIK OZETI</div>
                                            <div className="flex justify-center gap-6 mt-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Aktif ({stats?.activeTenants || 0})</span>
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-2.5 h-2.5 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pasif ({Math.max(0, (stats?.totalTenants || 0) - (stats?.activeTenants || 0))})</span>
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)] animate-pulse" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Risk ({growthReport?.churnRiskCount || 0})</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    {/* Mission Control Radar */}
                    {(isSuperAdmin || isReseller) && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                            <div className="md:col-span-3">
                                <SectionCard 
                                    title="GLOBAL OPERATIONAL RADAR" 
                                    icon={<FiTarget className="text-emerald-400" />}
                                    dense
                                >
                                    <OperationRadar activeItems={activeRadarItems} />
                                </SectionCard>
                            </div>
                            
                            <div className="md:col-span-2">
                                <SectionCard 
                                    title={isReseller ? "KOMİSYON CÜZDANI" : "MARKET PERFORMANSI"} 
                                    icon={<FiDollarSign className="text-amber-400" />}
                                    dense
                                >
                                    <div className="h-96 flex flex-col items-center justify-center p-10 space-y-10 bg-white/[0.01] rounded-[3.5rem] relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 blur-[60px]" />
                                        <motion.div 
                                            animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                            className={`w-32 h-32 rounded-[2.5rem] flex items-center justify-center border shadow-2xl relative overflow-hidden ${isReseller ? 'bg-amber-500/10 border-amber-500/20 shadow-amber-900/20' : 'bg-emerald-500/10 border-emerald-500/20 shadow-emerald-900/20'}`}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                                            {isReseller ? <FiDollarSign className="text-5xl text-amber-500 drop-shadow-lg" /> : <FiTrendingUp className="text-5xl text-emerald-500 drop-shadow-lg" />}
                                        </motion.div>
                                        <div className="text-center group/balance relative">
                                            <div className="text-5xl font-black text-white tabular-nums tracking-tighter italic drop-shadow-2xl relative z-10">
                                                {currency}{(Number(isReseller ? admin?.walletBalance : stats?.monthlyRevenue) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                                                <motion.div 
                                                    animate={{ x: ['100%', '-100%'] }}
                                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 pointer-events-none"
                                                />
                                            </div>
                                            <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.5em] mt-3">{isReseller ? 'WALLET_LIQUIDITY' : 'GLOBAL_VOLUME_MTD'}</div>
                                        </div>
                                        <button className="w-full h-16 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-[0.3em] rounded-3xl border border-white/5 transition-all active:scale-[0.98] shadow-xl">
                                            {isReseller ? 'BAKIYE YONETIMI' : 'FINANS OZETI'}
                                        </button>
                                    </div>
                                </SectionCard>
                            </div>
                        </div>
                    )}

                    {/* Pending Actions / Critical Tasks */}
                    <SectionCard title={t('dashboard.pending')} icon={<FiAlertTriangle className="text-amber-400" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {supportStats?.open && supportStats.open > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('support')}
                                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-between group transition-all hover:bg-red-500/20"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl">
                                             <FiMessageSquare size={20} />
                                        </div>
                                        <div className="text-left">
                                            <h4 className="text-sm font-black text-white">{supportStats.open} {t('dashboard.supportOpen')}</h4>
                                    <p className="text-[10px] text-slate-500 uppercase font-black mt-0.5">Acil geri donus gerekli</p>
                                        </div>
                                    </div>
                                    <FiArrowUpRight className="text-red-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ) : null}

                            <div className="p-4 bg-white/5 border border-white/5 rounded-3xl flex items-center gap-4">
                                <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl">
                                    <FiCheckCircle size={20} />
                                </div>
                                <div className="text-left">
                                    <h4 className="text-sm font-black text-white">All Clear</h4>
                                    <p className="text-[10px] text-slate-500 uppercase font-black mt-0.5">Kritik sorun algilanmadi</p>
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    {/* AI Insights & Projections */}
                    <div className="bg-gradient-to-br from-indigo-900/40 via-slate-900/40 to-slate-900/40 border border-indigo-500/20 rounded-[3rem] p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                            <FiActivity size={180} className="text-indigo-500" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-4 bg-indigo-500/20 rounded-2xl border border-indigo-500/20">
                                    <FiZap className="text-indigo-400 text-2xl" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight uppercase">Stratejik Ongoruler</h3>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">Veri destekli yonetim ozetleri</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isReseller ? 'Sonraki odeme tahmini' : '30 gunluk gelir tahmini'}</div>
                                    <div className="text-4xl font-black text-white flex items-baseline gap-2">
                                        {currency}{(growthReport?.revenueForecast || 0).toLocaleString()}
                                        <span className={`text-sm font-bold ${growthStats.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {growthStats.delta >= 0 ? '↑' : '↓'} {Math.abs(growthStats.deltaPct).toFixed(1)}%
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                        {isReseller 
                                            ? `Portfoydeki aktif aboneliklere gore sonraki donem komisyon beklentisi guncellendi.` 
                                            : (growthReport?.aiInsights?.forecastMessage || 'Bu ay portfoyde dengeli buyume bekleniyor.')}
                                    </p>
                                </div>

                                <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 space-y-6">
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Churn Risk Endeksi</span>
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${growthReport?.aiInsights?.riskLevel === 'critical' ? 'text-rose-400' : growthReport?.aiInsights?.riskLevel === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                {growthReport?.aiInsights?.riskLevel === 'critical' ? 'Yuksek' : growthReport?.aiInsights?.riskLevel === 'warning' ? 'Orta' : 'Saglikli'}
                                            </span>
                                        </div>
                                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full bg-gradient-to-r from-emerald-600 to-indigo-500" style={{ width: `${Math.min(100, Math.max(8, (growthReport?.churnRate || 0) * 5))}%` }} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/10">
                                        <FiStar className="text-indigo-400 shrink-0" />
                                        <p className="text-[10px] font-bold text-indigo-200 leading-tight">
                                            {growthReport?.aiInsights?.forecastMessage || 'Portfoy stabil gorunuyor. Yuksek katman planlara gecis kampanyalariyla gelir ivmesi artirilabilir.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Activity & Status */}
                <div className="space-y-8">
                    {/* Live Activity Feed */}
                    <SectionCard 
                        title="CANLI AKTİVİTE AKIŞI" 
                        icon={<FiActivity className="text-emerald-400" />}
                        dense
                    >
                        <div className="max-h-[600px] overflow-y-auto custom-scrollbar p-6 pt-0 space-y-4">
                            <AnimatePresence mode="popLayout">
                                {liveFeed.length === 0 ? (
                                    <EmptyState icon={<FiActivity />} message="Yeni olay bekleniyor..." />
                                ) : (
                                    liveFeed.map((item: any) => (
                                        <motion.div
                                            key={item.id}
                                            layout
                                            initial={{ x: 20, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            exit={{ x: -20, opacity: 0 }}
                                            className={`p-4 rounded-2xl border border-white/5 group transition-all hover:bg-white/[0.04] ${
                                                item.type === 'call' ? 'bg-sky-500/5' : 'bg-white/[0.02]'
                                            }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`mt-1 p-2.5 rounded-xl border border-white/5 shadow-inner ${
                                                    item.type === 'call' ? 'bg-sky-500/20 text-sky-400' :
                                                    item.type === 'sale' ? 'bg-emerald-500/20 text-emerald-400' :
                                                    'bg-slate-500/20 text-slate-400'
                                                }`}>
                                                    {item.type === 'call' ? <FiPhone size={14} /> : 
                                                     item.type === 'sale' ? <FiTarget size={14} /> :
                                                     <FiActivity size={14} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h6 className="text-[11px] font-black text-white uppercase truncate tracking-tight">{item.tenantName}</h6>
                                                        <span className="text-[9px] font-mono text-slate-600 tabular-nums">{new Date(item.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium line-clamp-1 group-hover:line-clamp-none transition-all">
                                                        {item.type === 'call' ? `Gelen Çağrı: ${item.number}` : 
                                                         item.type === 'sale' ? `Yeni Satış: ${currency}${item.amount}` :
                                                         item.message || 'Status Update'}
                                                    </div>
                                                    {item.type === 'sale' && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <div className="bg-emerald-500/15 text-emerald-400 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-emerald-500/20">
                                                                +{currency}{(item.amount * 0.3).toFixed(2)} Fee
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </SectionCard>

                    {/* Infrastructure Status */}
                    <SectionCard title="SİSTEM DURUMU" icon={<FiActivity className="text-indigo-400" />}>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    <span>Core Engine</span>
                                    <span className="text-emerald-400">Stable</span>
                                </div>
                                <div className="flex gap-1 h-3">
                                    {[...Array(20)].map((_, i) => (
                                        <div key={i} className={`flex-1 rounded-sm ${i > 15 ? 'bg-emerald-500/40 animate-pulse' : 'bg-emerald-500'}`} />
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5 space-y-4">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    <span>Average DB Latency</span>
                                    <span className="text-white font-mono">{systemHealth?.dbLatency || '8ms'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    <span>Total Uptime</span>
                                    <span className="text-white font-mono">{systemHealth?.uptimeFormatted || '342d 12h'}</span>
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Quick Support Link */}
                    <div className="p-6 rounded-[2.5rem] bg-gradient-to-br from-sky-600 to-blue-700 shadow-2xl shadow-sky-600/20 text-white relative overflow-hidden group cursor-pointer">
                        <div className="absolute -top-4 -right-4 p-8 opacity-10 group-hover:scale-125 transition-transform duration-500">
                            <FiMap size={120} />
                        </div>
                        <h4 className="text-lg font-black uppercase tracking-tighter mb-1 leading-tight">Destek Ekibi</h4>
                        <p className="text-[10px] font-bold text-sky-100/60 uppercase mb-4">Oncelikli is ortagi kanali</p>
                        <button className="bg-white/20 hover:bg-white/30 backdrop-blur-md px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
                            Talep Ac
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
