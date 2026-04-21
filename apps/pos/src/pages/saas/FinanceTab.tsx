import React, { useEffect, useMemo } from 'react';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { AccountingInboxPanel } from './AccountingInboxPanel';
import {
    FiDollarSign, FiTrendingUp, FiCalendar, FiAlertCircle, FiCreditCard, FiPieChart, FiShoppingBag,
    FiUsers, FiBriefcase, FiLayers, FiPercent, FiArrowUpRight, FiArrowDownLeft, FiDownload, FiCheckCircle, FiShield,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { StatCard, SectionCard } from './SaaSShared';

function paymentTypeLabel(t: (k: string) => string, pt: string): string {
    const key = `finance.pt.${pt}`;
    const v = t(key);
    return v === key ? pt : v;
}

export const FinanceTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        admin,
        payments,
        fetchPayments,
        financialSummary,
        fetchFinancialSummary,
        fetchFinanceInbox,
        settings,
    } = useSaaSStore();

    const currency = settings?.currency || '€';
    const isSuper = admin?.role === 'super_admin';

    useEffect(() => {
        fetchPayments();
        fetchFinancialSummary();
        fetchFinanceInbox();
    }, [fetchPayments, fetchFinancialSummary, fetchFinanceInbox]);

    const pendingPayments = payments.filter((p) => p.status === 'pending');

    const netAfterCommission = useMemo(() => {
        const tr = Number(financialSummary?.totalRevenue || 0);
        const comm = Number(financialSummary?.breakdown?.commissionPaidToResellers || 0);
        return Math.round((tr - comm) * 100) / 100;
    }, [financialSummary?.totalRevenue, financialSummary?.breakdown?.commissionPaidToResellers]);

    const bd = financialSummary?.breakdown;
    const pb = financialSummary?.pendingBreakdown;

    // Common container animation
    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.5, staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    if (isSuper) {
        return (
            <motion.div 
                className="space-y-8 pb-10"
                initial="hidden"
                animate="visible"
                variants={containerVariants}
            >
                {/* ═══════════════════ TOP METRICS ═══════════════════ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard 
                        label={t('finance.superTotalRevenue')}
                        value={`${currency}${Number(financialSummary?.totalRevenue ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                        icon={<FiDollarSign />}
                        trend={t('finance.trendMonth')}
                        trendStatus="up"
                        color="emerald"
                    />
                    <StatCard 
                        label={t('finance.restaurantSales')}
                        value={`${currency}${Number(bd?.restaurantTenantPaid ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                        icon={<FiUsers />}
                        color="blue"
                    />
                    <StatCard 
                        label={t('finance.resellerChannel')}
                        value={`${currency}${Number(bd?.resellerChannelPaid ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                        icon={<FiBriefcase />}
                        color="amber"
                    />
                    <StatCard 
                        label={t('finance.addonModules')}
                        value={`${currency}${Number(bd?.addonModulesPaid ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                        icon={<FiLayers />}
                        color="indigo"
                    />
                </div>

                {/* ═══════════════════ SECONDARY ANALYTICS ═══════════════════ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard 
                        label={t('finance.commissionsOut')}
                        value={`${currency}${Number(bd?.commissionPaidToResellers ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                        icon={<FiPercent />}
                        color="rose"
                    />
                    <StatCard 
                        label={t('finance.netAfterCommission')}
                        value={`${currency}${netAfterCommission.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                        icon={<FiPieChart />}
                        color="cyan"
                    />
                    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[32px] relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/5 rounded-full blur-3xl group-hover:bg-orange-500/10 transition-all duration-500" />
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400 mb-4">
                            <FiCalendar size={24} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('finance.pendingCollections')}</span>
                        <span className="text-2xl font-black text-white">
                            {currency}{Number(financialSummary?.pendingRevenue ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                        <div className="mt-3 flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-500">{t('finance.pendingTenant')}</span>
                                <span className="text-orange-400/80">{currency}{Number(pb?.tenant ?? 0).toLocaleString('tr-TR')}</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-500">{t('finance.pendingReseller')}</span>
                                <span className="text-orange-400/80">{currency}{Number(pb?.resellerChannel ?? 0).toLocaleString('tr-TR')}</span>
                            </div>
                        </div>
                    </div>
                    <StatCard 
                        label={t('finance.activeLicenses')}
                        value={`${admin?.available_licenses || '0'} ${t('finance.units')}`}
                        icon={<FiPieChart />}
                        color="purple"
                    />
                </div>

                {/* Gateway Performance Analytics (NEW PHASE 13) */}
                <motion.div variants={itemVariants}>
                    <SectionCard title="GATEWAY PERFORMANCE ANALYTICS" icon={<FiShield className="text-blue-400" />}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6">
                            {['iyzico', 'paytr', 'stripe'].map((gw) => {
                                const isActive = useSaaSStore.getState().settings?.active_gateway === gw;
                                return (
                                    <div key={gw} className={`p-8 rounded-[40px] border transition-all relative overflow-hidden group ${isActive ? 'bg-indigo-600/10 border-indigo-500/20 shadow-2xl shadow-indigo-500/10' : 'bg-white/[0.02] border-white/5 opacity-40'}`}>
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="p-4 rounded-[20px] bg-white/5 text-white group-hover:scale-110 transition-transform"><FiCreditCard size={24} /></div>
                                            {isActive && (
                                                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">ACTIVE_NODE</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mb-6">
                                            <h4 className="text-xl font-black text-white italic tracking-tighter uppercase">{gw} CORE</h4>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-2 italic">Infrastructure Layer v4.2</p>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                <span>Uptime Pulse</span>
                                                <span className={isActive ? 'text-emerald-400' : 'text-slate-600'}>{isActive ? '99.99%' : 'OFFLINE'}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: isActive ? '95%' : '0%' }}
                                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 italic">Monthly Volume</span>
                                                    <span className="text-sm font-black text-white italic">{currency}{isActive ? Number(financialSummary?.totalRevenue || 0).toLocaleString() : '0.00'}</span>
                                                </div>
                                                <FiArrowUpRight className={isActive ? 'text-emerald-500' : 'text-slate-700'} size={20} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>
                </motion.div>

                {/* ═══════════════════ CHARTS & TABLES ═══════════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        {/* Monthly Revenue Chart */}
                        {financialSummary?.monthlyRevenue && financialSummary.monthlyRevenue.length > 0 && (
                            <SectionCard title={t('finance.monthlyRevenueTitle')} icon={<FiTrendingUp className="text-emerald-400" />}>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {financialSummary.monthlyRevenue.slice(-12).map((row) => (
                                        <motion.div 
                                            key={row.month} 
                                            variants={itemVariants}
                                            className="bg-white/5 rounded-2xl p-4 border border-white/5 hover:bg-white/10 transition-colors cursor-default"
                                        >
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{row.month}</div>
                                            <div className="text-sm font-black text-white mt-1">{currency}{Number(row.total).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</div>
                                            <div className="mt-2 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(100, (Number(row.total) / (financialSummary.totalRevenue || 1)) * 500)}%` }}
                                                    className="h-full bg-emerald-500/50"
                                                />
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Recent Movements */}
                        <SectionCard 
                            title={t('finance.movements')} 
                            icon={<FiCreditCard className="text-blue-500" />}
                            action={
                                <button className="flex items-center gap-2 text-[10px] font-black text-blue-400 bg-blue-400/5 px-4 py-2 rounded-xl border border-blue-400/10 hover:bg-blue-400/10 transition-all uppercase tracking-widest">
                                    <FiDownload size={12} /> {t('finance.excel')}
                                </button>
                            }
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[600px]">
                                    <thead className="border-b border-white/5">
                                        <tr>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('finance.colDesc')}</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">{t('finance.colType')}</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">{t('finance.colStatus')}</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">{t('finance.colAmount')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {payments.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-bold italic text-sm">{t('finance.emptyMovements')}</td>
                                            </tr>
                                        ) : (
                                            payments.map((p) => (
                                                <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-6 py-5">
                                                        <div className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">{p.description}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">{p.tenant_name || t('finance.systemDef')}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex justify-center">
                                                            <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-400 border border-white/5 group-hover:border-blue-500/20 transition-all">
                                                                {paymentTypeLabel(t, p.payment_type)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex justify-center">
                                                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 ${
                                                                p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                                                                    : p.status === 'pending'
                                                                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/10 animate-pulse'
                                                                      : 'bg-red-500/10 text-red-400 border border-red-500/10'
                                                            }`}
                                                            >
                                                                {p.status === 'paid' && <FiCheckCircle size={10} />}
                                                                {p.status === 'paid' ? t('finance.statusPaid') : p.status === 'pending' ? t('finance.statusPending') : t('finance.statusCancelled')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <div className={`text-sm font-black flex items-center justify-end gap-1 ${p.payment_type === 'reseller_income' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                            {p.payment_type === 'reseller_income' ? <FiArrowDownLeft size={14} /> : <FiArrowUpRight size={14} />}
                                                            {currency}{p.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                        </div>
                                                        <div className="text-[10px] text-slate-600 font-bold italic mt-1">
                                                            {new Date(p.created_at).toLocaleDateString('tr-TR')}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </div>

                    <div className="space-y-8">
                        {/* Accounting Inbox */}
                        <AccountingInboxPanel pendingMax={6} paidMax={4} />

                        {/* Commission Breakdown Card */}
                        <motion.div 
                            variants={itemVariants}
                            className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[40px] text-white shadow-2xl shadow-blue-900/30 relative overflow-hidden group"
                        >
                            <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-500">
                                <FiPieChart size={240} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                                        <FiPercent className="text-white" size={14} />
                                    </div>
                                    <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest">{t('finance.commissionTitle')}</span>
                                </div>
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-blue-100/70">{t('finance.restaurantSales')}</span>
                                        <span className="text-sm font-black text-white">{currency}{Number(bd?.restaurantTenantPaid ?? 0).toLocaleString('tr-TR')}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-blue-100/70">{t('finance.resellerChannel')}</span>
                                        <span className="text-sm font-black text-amber-300">{currency}{Number(bd?.resellerChannelPaid ?? 0).toLocaleString('tr-TR')}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-blue-100/70">{t('finance.resellerWalletTopups')}</span>
                                        <span className="text-sm font-black text-cyan-300">{currency}{Number(bd?.resellerWalletTopupsPaid ?? 0).toLocaleString('tr-TR')}</span>
                                    </div>
                                    <div className="h-px bg-white/10 w-full" />
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-blue-100/70">{t('finance.commissionsOut')}</span>
                                        <span className="text-sm font-black text-rose-300">{currency}{Number(bd?.commissionPaidToResellers ?? 0).toLocaleString('tr-TR')}</span>
                                    </div>
                                </div>
                                <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-blue-100/80 font-medium italic leading-relaxed">
                                        {t('finance.commissionNote')}
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        {/* Financial Alerts */}
                        <SectionCard title={t('finance.alertsTitle')} icon={<FiAlertCircle className="text-orange-500" />}>
                            <div className="space-y-4">
                                {pendingPayments.length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                                            <FiCheckCircle size={20} />
                                        </div>
                                        <span className="text-xs text-slate-500 font-bold">{t('finance.allPaid')}</span>
                                    </div>
                                ) : (
                                    pendingPayments.map((p) => (
                                        <motion.div 
                                            key={p.id} 
                                            whileHover={{ x: 5 }}
                                            className="p-4 bg-white/5 rounded-[24px] border border-white/5 hover:border-orange-500/30 transition-all cursor-pointer group"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs font-black text-white group-hover:text-orange-400 transition-colors">{p.tenant_name || paymentTypeLabel(t, p.payment_type)}</span>
                                                <span className="text-[10px] font-black text-orange-400 uppercase tracking-tighter">{t('finance.due')}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mb-4">
                                                <FiCalendar size={12} /> {new Date(p.created_at).toLocaleDateString('tr-TR')}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-white">{currency}{p.amount.toLocaleString()}</span>
                                                <button className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-all uppercase tracking-widest">{t('finance.remind')}</button>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </motion.div>
        );
    }

    // RESELLER VIEW
    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard 
                    label={t('finance.totalEarnings')}
                    value={`${currency}${Number(financialSummary?.totalEarnings ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                    icon={<FiDollarSign />}
                    trend="+12%"
                    trendStatus="up"
                    color="emerald"
                />
                
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[32px] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-500" />
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                        <FiShoppingBag size={24} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('finance.walletBalance')}</span>
                    <span className="text-2xl font-black text-white">{currency}{Number(admin?.wallet_balance ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    <button className="mt-3 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-400/5 px-3 py-1.5 rounded-lg border border-blue-400/10 hover:bg-blue-400/10 transition-all">
                        {t('finance.withdrawReq')}
                    </button>
                </div>

                <StatCard 
                    label={t('finance.pendingCollections')}
                    value={`${currency}${Number(financialSummary?.pendingRevenue ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
                    icon={<FiCalendar />}
                    trend={t('finance.pendingInvoices').replace('{n}', String(pendingPayments.length))}
                    trendStatus="down"
                    color="orange"
                />

                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[32px] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/5 rounded-full blur-3xl group-hover:bg-purple-500/10 transition-all duration-500" />
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                        <FiPieChart size={24} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('finance.activeLicenses')}</span>
                    <span className="text-2xl font-black text-white">{admin?.available_licenses || '0'} {t('finance.units')}</span>
                    <button className="mt-3 text-[10px] font-black text-purple-400 uppercase tracking-widest bg-purple-400/5 px-3 py-1.5 rounded-lg border border-purple-400/10 hover:bg-purple-400/10 transition-all">
                        {t('finance.licenseMarket')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <SectionCard 
                        title={t('finance.movements')} 
                        icon={<FiCreditCard className="text-blue-500" />}
                        action={
                            <button className="flex items-center gap-2 text-[10px] font-black text-blue-400 bg-blue-400/5 px-4 py-2 rounded-xl border border-blue-400/10 hover:bg-blue-400/10 transition-all uppercase tracking-widest">
                                <FiDownload size={12} /> {t('finance.excel')}
                            </button>
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[600px]">
                                <thead className="border-b border-white/5">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('finance.colDesc')}</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">{t('finance.colType')}</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">{t('finance.colStatus')}</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">{t('finance.colAmount')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {payments.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-bold italic text-sm">{t('finance.emptyMovements')}</td>
                                        </tr>
                                    ) : (
                                        payments.map((p) => (
                                            <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-5">
                                                    <div className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">{p.description}</div>
                                                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">{p.tenant_name || t('finance.systemDef')}</div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex justify-center">
                                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                            p.payment_type === 'reseller_income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                                                        }`}
                                                        >
                                                            {p.payment_type === 'reseller_income' ? t('finance.typeIncome') : t('finance.typeExpense')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex justify-center">
                                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                            p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                                                                : p.status === 'pending'
                                                                  ? 'bg-orange-500/10 text-orange-400 animate-pulse border border-orange-500/10'
                                                                  : 'bg-red-500/10 text-red-400 border border-red-500/10'
                                                        }`}
                                                        >
                                                            {p.status === 'paid' ? t('finance.statusPaid') : p.status === 'pending' ? t('finance.statusPending') : t('finance.statusCancelled')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className={`text-sm font-black flex items-center justify-end gap-1 ${p.payment_type === 'reseller_income' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                        {p.payment_type === 'reseller_income' ? <FiArrowUpRight size={14} /> : <FiArrowDownLeft size={14} />}
                                                        {currency}{p.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[10px] text-slate-600 font-bold italic mt-1">
                                                        {new Date(p.created_at).toLocaleDateString('tr-TR')}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>

                <div className="space-y-8">
                    {/* Reseller Commission breakdown visualization */}
                    <motion.div 
                        variants={itemVariants}
                        className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[40px] text-white shadow-2xl relative overflow-hidden group"
                    >
                        <div className="absolute -right-8 -bottom-8 opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-700">
                            <FiPieChart size={180} />
                        </div>
                        <div className="relative z-10">
                            <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest block mb-6">{t('finance.commissionRules')}</span>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <span className="text-xs font-bold text-blue-100/70">{t('finance.prepaidDiscount')}</span>
                                    <span className="text-sm font-black text-white">%15</span>
                                </div>
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <span className="text-xs font-bold text-blue-100/70">{t('finance.resellerShare')}</span>
                                    <span className="text-sm font-black text-emerald-400">%35</span>
                                </div>
                                <div className="flex items-center justify-between pb-1">
                                    <span className="text-xs font-bold text-blue-100/70">{t('finance.systemShare')}</span>
                                    <span className="text-sm font-black text-white">%50</span>
                                </div>
                            </div>
                            <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                                <p className="text-[10px] text-blue-100/80 font-medium italic leading-relaxed">
                                    {t('finance.commissionNote')}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <SectionCard title={t('finance.alertsTitle')} icon={<FiAlertCircle className="text-orange-500" />}>
                        <div className="space-y-4">
                            {pendingPayments.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                                        <FiCheckCircle size={20} />
                                    </div>
                                    <span className="text-xs text-slate-500 font-bold">{t('finance.allPaid')}</span>
                                </div>
                            ) : (
                                pendingPayments.map((p) => (
                                    <motion.div 
                                        key={p.id} 
                                        whileHover={{ x: 5 }}
                                        className="p-4 bg-white/5 rounded-[24px] border border-white/5 hover:border-orange-500/30 transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-black text-white group-hover:text-orange-400 transition-colors">{p.tenant_name}</span>
                                            <span className="text-[10px] font-black text-orange-400 uppercase tracking-tighter">{t('finance.due')}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mb-4">
                                            <FiCalendar size={12} /> {new Date(p.created_at).toLocaleDateString('tr-TR')}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-black text-white">{currency}{p.amount.toLocaleString()}</span>
                                            <button className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-all uppercase tracking-widest">{t('finance.remind')}</button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </SectionCard>
                </div>
            </div>
        </motion.div>
    );
};
