import React, { useEffect, useMemo } from 'react';
import {
    FiActivity, FiUsers, FiDollarSign, FiTrendingUp,
    FiAlertTriangle, FiMessageSquare, FiClock,
    FiShield, FiBox, FiCreditCard, FiInbox, FiCheckCircle, FiLayers,
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { motion, AnimatePresence } from 'framer-motion';

type SaaSTab = 'dashboard' | 'tenants' | 'resellers' | 'finance' | 'accounting' | 'security' | 'reports' | 'plans' | 'backups' | 'crm' | 'monitoring' | 'support' | 'shop' | 'settings';

interface DashboardTabProps {
    isSuperAdmin?: boolean;
    onNavigate?: (tab: SaaSTab) => void;
}

function StatCard({
    icon,
    label,
    value,
    sub,
    tone = 'slate',
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'violet' | 'slate';
    onClick?: () => void;
}) {
    const tones: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
        rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
        indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
        violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400',
        slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    };
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all w-full ${onClick ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/40' : ''}`}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone]}`}>{icon}</div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide leading-tight">{label}</span>
            </div>
            <div className="text-2xl font-black text-slate-800 dark:text-white">{value}</div>
            {sub ? <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{sub}</div> : null}
        </Tag>
    );
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ isSuperAdmin, onNavigate }) => {
    const { t } = useSaaSLocale();
    const {
        stats, supportStats, systemHealth,
        growthReport, presence, settings,
        fetchSystemHealth, fetchGrowthReport, fetchFinancialSummary, fetchPresence,
        fetchSettings, admin, liveFeed,
        accountingUpcoming, fetchAccountingUpcoming,
        resellerTopupPendingCount, fetchResellerTopupPendingCount,
        dashboardOverview, fetchDashboardOverview,
        financialSummary, fetchSupportStats,
    } = useSaaSStore();

    useEffect(() => {
        if (isSuperAdmin) {
            fetchSystemHealth();
            fetchGrowthReport();
            fetchFinancialSummary();
            fetchAccountingUpcoming();
            fetchSettings();
            void fetchResellerTopupPendingCount();
            void fetchDashboardOverview();
            void fetchSupportStats();
        }
        fetchPresence();
        const timer = setInterval(() => fetchPresence(), 30000);
        return () => clearInterval(timer);
    }, [
        isSuperAdmin,
        fetchSystemHealth,
        fetchGrowthReport,
        fetchFinancialSummary,
        fetchAccountingUpcoming,
        fetchPresence,
        fetchSettings,
        fetchResellerTopupPendingCount,
        fetchDashboardOverview,
        fetchSupportStats,
    ]);

    const currency = settings?.currency || '€';
    const isReseller = admin?.role === 'reseller';
    const healthOk = systemHealth?.status === 'ok' || systemHealth?.status === 'healthy';
    const ov = dashboardOverview;

    const upcomingSummary = useMemo(() => {
        const rows = (accountingUpcoming || []) as Array<Record<string, unknown>>;
        const revenueTypes = new Set([
            'subscription', 'license', 'setup', 'addon',
            'reseller_package_onboarding', 'license_upgrade',
        ]);
        const receivables = rows.filter((r) => revenueTypes.has(String(r?.payment_type || '')));
        const sum = (xs: Array<Record<string, unknown>>) =>
            xs.reduce((acc, r) => acc + Number(r?.amount || 0), 0);
        return {
            receivableCount: receivables.length,
            receivableTotal: sum(receivables),
            rows,
        };
    }, [accountingUpcoming]);

    const paymentRowLabel = (p: {
        tenant_name?: string | null;
        reseller_name?: string | null;
        description?: string | null;
        tenant_id?: string | null;
        payment_type?: string | null;
    }): string => {
        if (p?.tenant_name) return String(p.tenant_name);
        if (p?.reseller_name) return String(p.reseller_name);
        if (p?.description) return String(p.description);
        if (p?.tenant_id) return String(p.tenant_id);
        return String(p?.payment_type || '—');
    };

    const statusChip = (status?: string) => {
        const s = String(status || '').toLowerCase();
        const cls =
            s === 'paid'
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : s === 'overdue'
                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    : s === 'pending'
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        : 'bg-slate-500/10 text-slate-500 border-slate-500/20';
        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${cls}`}>{s || '—'}</span>;
    };

    const totalOperators = useMemo(
        () => Object.values(presence).reduce((acc, count) => acc + (count || 0), 0),
        [presence]
    );

    const growthStats = useMemo(() => {
        const monthly = growthReport?.monthlyGrowth || [];
        const last = monthly[monthly.length - 1]?.new_tenants || 0;
        const prev = monthly[monthly.length - 2]?.new_tenants || 0;
        return { last, delta: last - prev };
    }, [growthReport]);

    const pendingTotal = ov?.pendingPayments?.total ?? financialSummary?.pendingPayments?.total ?? 0;
    const pendingCount = ov?.pendingPayments?.count ?? financialSummary?.pendingPayments?.count ?? 0;
    const overdueCount = financialSummary?.overduePayments?.count ?? 0;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={<FiUsers size={18} />}
                    label={isReseller ? t('dashboard.stat.portfolio') : t('dashboard.stat.totalRest')}
                    value={stats?.totalTenants ?? 0}
                    sub={`${stats?.activeTenants ?? 0} ${t('dashboard.stat.activeSub')}`}
                    tone="blue"
                    onClick={isSuperAdmin ? () => onNavigate?.('tenants') : undefined}
                />
                <StatCard
                    icon={<FiDollarSign size={18} />}
                    label={isReseller ? t('dashboard.stat.mrrReseller') : t('dashboard.stat.mrr')}
                    value={`${currency}${Number(stats?.monthlyRevenue ?? 0).toLocaleString('de-DE')}`}
                    sub={
                        isSuperAdmin && ov?.paidThisMonth
                            ? `${t('dashboard.card.paidMonth')}: ${currency}${Number(ov.paidThisMonth.total).toLocaleString('de-DE')}`
                            : undefined
                    }
                    tone="emerald"
                    onClick={isSuperAdmin ? () => onNavigate?.('finance') : undefined}
                />
                <StatCard
                    icon={isReseller ? <FiBox size={18} /> : <FiShield size={18} />}
                    label={isReseller ? t('dashboard.stat.licenses') : t('dashboard.stat.compliance')}
                    value={
                        isReseller
                            ? (stats?.available_licenses ?? 0)
                            : settings?.tse_enabled
                                ? t('dashboard.stat.complianceOk')
                                : t('dashboard.stat.complianceRisk')
                    }
                    tone="amber"
                />
                <StatCard
                    icon={<FiActivity size={18} />}
                    label={t('dashboard.stat.health')}
                    value={healthOk ? t('dashboard.stat.healthOk') : t('dashboard.stat.healthWarn')}
                    sub={`${totalOperators} ${t('dashboard.stat.onlineNow')}`}
                    tone="indigo"
                    onClick={isSuperAdmin ? () => onNavigate?.('monitoring') : undefined}
                />
            </div>

            {isSuperAdmin && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                    <StatCard
                        icon={<FiClock size={18} />}
                        label={t('dashboard.card.pendingPayments')}
                        value={pendingCount}
                        sub={`${currency}${Number(pendingTotal).toLocaleString('de-DE')}`}
                        tone="amber"
                        onClick={() => onNavigate?.('finance')}
                    />
                    <StatCard
                        icon={<FiInbox size={18} />}
                        label={t('dashboard.card.walletDeposits')}
                        value={ov?.walletDepositsPending?.count ?? 0}
                        sub={`${currency}${Number(ov?.walletDepositsPending?.total ?? 0).toLocaleString('de-DE')}`}
                        tone="violet"
                        onClick={() => onNavigate?.('finance')}
                    />
                    <StatCard
                        icon={<FiCreditCard size={18} />}
                        label={t('dashboard.card.resellerTopups')}
                        value={ov?.resellerTopupsPending?.count ?? resellerTopupPendingCount ?? 0}
                        sub={`${currency}${Number(ov?.resellerTopupsPending?.total ?? 0).toLocaleString('de-DE')}`}
                        tone="rose"
                        onClick={() => onNavigate?.('resellers')}
                    />
                    <StatCard
                        icon={<FiMessageSquare size={18} />}
                        label={t('dashboard.supportOpen')}
                        value={supportStats?.open ?? 0}
                        sub={`${t('dashboard.card.inProgress')}: ${supportStats?.inProgress ?? 0}`}
                        tone="blue"
                        onClick={() => onNavigate?.('support')}
                    />
                    <StatCard
                        icon={<FiTrendingUp size={18} />}
                        label={t('dashboard.card.newTenants')}
                        value={growthStats.last}
                        sub={`${growthStats.delta >= 0 ? '+' : ''}${growthStats.delta} ${t('dashboard.card.vsLastMonth')}`}
                        tone="emerald"
                        onClick={() => onNavigate?.('reports')}
                    />
                    <StatCard
                        icon={<FiLayers size={18} />}
                        label={t('dashboard.card.tenantWallets')}
                        value={ov?.tenantWallets?.count ?? 0}
                        sub={`${currency}${Number(ov?.tenantWallets?.total ?? 0).toLocaleString('de-DE')}`}
                        tone="slate"
                        onClick={() => onNavigate?.('tenants')}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {isSuperAdmin && (resellerTopupPendingCount ?? 0) > 0 && (
                        <button
                            type="button"
                            onClick={() => onNavigate?.('resellers')}
                            className="w-full text-left bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4 rounded-2xl flex items-center justify-between hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600">
                                    <FiAlertTriangle size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-amber-900 dark:text-amber-100">{t('dashboard.pendingWalletTopups')}</div>
                                    <div className="text-xs text-amber-700 dark:text-amber-300/80">{t('dashboard.pendingWalletTopupsHint')}</div>
                                </div>
                            </div>
                            <div className="px-3 py-1 bg-amber-500 text-slate-900 text-xs font-black rounded-lg">
                                {resellerTopupPendingCount} {t('dashboard.card.pending')}
                            </div>
                        </button>
                    )}

                    {isSuperAdmin && (ov?.walletDepositsPending?.count ?? 0) > 0 && (
                        <button
                            type="button"
                            onClick={() => onNavigate?.('finance')}
                            className="w-full text-left bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 p-4 rounded-2xl flex items-center justify-between hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center text-violet-600">
                                    <FiInbox size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-violet-900 dark:text-violet-100">{t('dashboard.card.walletDepositsAlert')}</div>
                                    <div className="text-xs text-violet-700 dark:text-violet-300/80">{t('dashboard.card.walletDepositsHint')}</div>
                                </div>
                            </div>
                            <div className="px-3 py-1 bg-violet-500 text-white text-xs font-black rounded-lg">
                                {ov?.walletDepositsPending?.count}
                            </div>
                        </button>
                    )}

                    {isSuperAdmin && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FiCheckCircle className="text-emerald-500" /> {t('dashboard.recentPayments')}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('finance')}
                                    className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                                >
                                    {t('dashboard.viewAll')}
                                </button>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {(ov?.recentPayments?.length ?? 0) === 0 ? (
                                    <div className="p-8 text-center text-slate-500 text-sm">{t('dashboard.noPayments')}</div>
                                ) : (
                                    ov?.recentPayments?.map((p) => (
                                        <div
                                            key={p.id}
                                            className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <div className="font-semibold text-sm text-slate-800 dark:text-white truncate">
                                                    {paymentRowLabel(p)}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
                                                    <span>{String(p.payment_type || '—')}</span>
                                                    <span>•</span>
                                                    <span>{p.created_at ? new Date(p.created_at).toLocaleString('tr-TR') : '—'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end gap-1 shrink-0 ml-3">
                                                <div className="font-bold text-slate-800 dark:text-white">
                                                    {currency}{Number(p.amount || 0).toLocaleString('de-DE')}
                                                </div>
                                                {statusChip(p.status)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {isSuperAdmin && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FiClock className="text-slate-500" /> {t('dashboard.card.upcomingDue')}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'accounting', sub: 'upcoming' } }))}
                                    className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                                >
                                    {t('dashboard.viewAll')}
                                </button>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {upcomingSummary.rows.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 text-sm">{t('dashboard.noUpcoming')}</div>
                                ) : (
                                    upcomingSummary.rows.slice(0, 5).map((p) => (
                                        <div key={String(p?.id)} className="p-4 flex items-center justify-between">
                                            <div>
                                                <div className="font-semibold text-sm text-slate-800 dark:text-white truncate max-w-xs">
                                                    {paymentRowLabel(p as Parameters<typeof paymentRowLabel>[0])}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    {t('dashboard.card.due')}: {p?.due_date ? new Date(String(p.due_date)).toLocaleDateString('tr-TR') : '—'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold">{currency}{Number(p?.amount || 0).toLocaleString('de-DE')}</div>
                                                {statusChip(String(p?.status || ''))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {isSuperAdmin && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {(['iyzico', 'paytr', 'stripe'] as const).map((gw) => {
                                const isActive = settings?.active_gateway === gw;
                                const isConfigured =
                                    gw === 'iyzico'
                                        ? settings?.iyzico_api_key && settings?.iyzico_secret_key
                                        : gw === 'paytr'
                                            ? settings?.paytr_merchant_id && settings?.paytr_merchant_key
                                            : settings?.stripe_public_key && settings?.stripe_secret_key;
                                return (
                                    <div
                                        key={gw}
                                        className={`p-4 rounded-xl border ${isActive ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-70'}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <FiCreditCard className={isActive ? 'text-indigo-600' : 'text-slate-500'} />
                                                <span className="text-sm font-bold uppercase">{gw}</span>
                                            </div>
                                            {isActive ? <div className="w-2 h-2 rounded-full bg-emerald-500" /> : null}
                                        </div>
                                        <div className="text-xs text-slate-500 flex justify-between">
                                            <span>{t('dashboard.card.gatewayStatus')}</span>
                                            <span className={isConfigured ? 'text-emerald-600' : 'text-rose-500'}>
                                                {isConfigured ? t('dashboard.card.gatewayReady') : t('dashboard.card.gatewayMissing')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {isSuperAdmin && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">{t('dashboard.card.overdue')}</p>
                                <p className="text-2xl font-black text-rose-500 mt-1">{overdueCount}</p>
                            </div>
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">{t('dashboard.card.upcoming7d')}</p>
                                <p className="text-xl font-black text-slate-800 dark:text-white mt-1 truncate">
                                    {currency}{Number(upcomingSummary.receivableTotal).toLocaleString('de-DE')}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[420px]">
                        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {t('dashboard.liveFeed')}
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {liveFeed.length === 0 ? (
                                    <div className="text-center text-sm text-slate-500 py-10">{t('dashboard.liveWait')}</div>
                                ) : (
                                    liveFeed.map((item: { id: string; tenantName?: string; timestamp: string; type?: string; number?: string; amount?: number; message?: string }) => (
                                        <motion.div
                                            key={item.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 p-3 rounded-xl text-sm"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold text-slate-800 dark:text-white truncate max-w-[120px]">{item.tenantName}</span>
                                                <span className="text-xs text-slate-500">
                                                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="text-slate-600 dark:text-slate-400 text-xs">
                                                {item.type === 'call'
                                                    ? `Çağrı: ${item.number}`
                                                    : item.type === 'sale'
                                                        ? `Satış: ${currency}${item.amount}`
                                                        : item.message}
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onNavigate?.('support')}
                        className="w-full text-left bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl text-white shadow-md hover:shadow-lg transition-shadow"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <FiMessageSquare size={24} className="text-blue-200" />
                            <h3 className="font-bold text-lg">{t('dashboard.card.supportTeam')}</h3>
                        </div>
                        <p className="text-blue-100 text-sm mb-3">
                            {t('dashboard.supportOpen')}: {supportStats?.open ?? 0} · {t('dashboard.card.closed')}: {supportStats?.closed ?? 0}
                        </p>
                        <span className="inline-block bg-white/20 px-4 py-2 rounded-lg text-sm font-semibold">
                            {t('dashboard.review')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};
