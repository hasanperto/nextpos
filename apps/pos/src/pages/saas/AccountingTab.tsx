import React, { useEffect, useState } from 'react';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import {
    FiFileText, FiClock, FiBell, FiAlertTriangle,
    FiCalendar, FiMail, FiCheckCircle,
    FiPrinter, FiDollarSign, FiSearch, FiDownload, FiZap, FiUsers, FiLayers
} from 'react-icons/fi';
import { StatCard, SectionCard, EmptyState, Modal, SubTab, Badge } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

type AccountingSubTab = 'orders' | 'installments' | 'notifications' | 'upcoming' | 'invoices';

function paymentTypeLabel(t: (k: string) => string, pt: string): string {
    const key = `finance.pt.${pt}`;
    const v = t(key);
    return v === key ? pt : v;
}

function tenantLabel(p: { tenant_name?: string; tenant_id?: string; description?: string }): string {
    if (p.tenant_name) return p.tenant_name;
    if (p.description) return p.description;
    if (p.tenant_id) return p.tenant_id;
    return '—';
}

const statusColor: Record<string, string> = {
    paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/5',
    overdue: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/5',
    cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

function daysUntil(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
    return diff;
}

export const AccountingTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        fetchFinanceInbox, fetchPayments, fetchAccountingUpcoming,
        fetchAccountingInstallments, fetchAccountingNotifications,
        fetchAccountingAllPayments, accountingUpcoming,
        accountingInstallments, accountingNotifications,
        accountingAllPayments, recordSubscriptionPayment,
        sendPaymentDueMail, updatePaymentStatus,
        fetchFinancialSummary, fetchInvoices, invoices,
        fetchInvoiceDetail, settings,
    } = useSaaSStore();

    const currency = settings?.currency || '€';

    const [sub, setSub] = useState<AccountingSubTab>('upcoming');
    const [instFilter, setInstFilter] = useState<string>('');
    const [busyId, setBusyId] = useState<number | null>(null);
    const [invoiceModal, setInvoiceModal] = useState<any | null>(null);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    
    // Invoice Filters
    const [invFilterStatus, setInvFilterStatus] = useState('');
    const [invFilterTenant, setInvFilterTenant] = useState('');
    const [invFilterFrom, setInvFilterFrom] = useState('');
    const [invFilterTo, setInvFilterTo] = useState('');

    useEffect(() => {
        fetchFinanceInbox();
        fetchPayments();
        fetchAccountingUpcoming();
        fetchAccountingInstallments();
        fetchAccountingNotifications();
        fetchAccountingAllPayments();
        fetchInvoices();
    }, []);

    const invoiceFilters = { 
        status: invFilterStatus || undefined, 
        tenant: invFilterTenant || undefined, 
        from: invFilterFrom || undefined, 
        to: invFilterTo || undefined 
    };

    useEffect(() => {
        if (sub === 'installments') fetchAccountingInstallments(instFilter || undefined);
        if (sub === 'upcoming') fetchAccountingUpcoming();
        if (sub === 'notifications') fetchAccountingNotifications();
        if (sub === 'orders') fetchAccountingAllPayments();
        if (sub === 'invoices') fetchInvoices(invoiceFilters);
    }, [sub, instFilter, invFilterStatus, invFilterTenant, invFilterFrom, invFilterTo]);

    const tabs: { key: AccountingSubTab; icon: any; label: string }[] = [
        { key: 'upcoming', icon: <FiAlertTriangle />, label: t('accounting.tabUpcoming') },
        { key: 'orders', icon: <FiDollarSign />, label: t('accounting.tabOrders') },
        { key: 'installments', icon: <FiClock />, label: t('accounting.tabInstallments') },
        { key: 'notifications', icon: <FiBell />, label: t('accounting.tabNotifications') },
        { key: 'invoices', icon: <FiFileText />, label: t('accounting.tabInvoices') },
    ];

    const refreshAll = async () => {
        await Promise.all([
            fetchFinanceInbox(), fetchPayments(), fetchFinancialSummary(), 
            fetchAccountingUpcoming(), fetchAccountingInstallments(instFilter || undefined)
        ]);
    };

    const openInvoice = async (invoiceNumber: string) => {
        if (!invoiceNumber || invoiceNumber === '—') return;
        setInvoiceLoading(true);
        const detail = await fetchInvoiceDetail(invoiceNumber);
        setInvoiceModal(detail);
        setInvoiceLoading(false);
    };


    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 px-4 sm:px-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 text-blue-500 mb-1">
                        <FiZap className="animate-pulse" size={14} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Tactical Revenue Terminal</span>
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic drop-shadow-2xl">
                        {t('accounting.tabTitle') || 'Accounting IQ'}
                    </h2>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em] max-w-md opacity-60">
                        {t('tab.accountingSubtitle') || 'Advanced financial orchestration and automated settlement matrix.'}
                    </p>
                </div>
                
                {/* Tactical Sub-navigation */}
                <div className="flex bg-slate-900/60 backdrop-blur-3xl rounded-[32px] p-2 border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-x-auto no-scrollbar max-w-full">
                    <div className="flex items-center gap-1">
                        {tabs.map((tb) => (
                            <SubTab
                                key={tb.key}
                                active={sub === tb.key}
                                onClick={() => setSub(tb.key)}
                                icon={tb.icon}
                                label={tb.label}
                                count={
                                    tb.key === 'upcoming' ? accountingUpcoming.length :
                                    tb.key === 'notifications' ? accountingNotifications.length :
                                    0
                                }
                            />
                        ))}
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {/* ─── YAKLASAN (UPCOMING) ─── */}
                {sub === 'upcoming' && (
                    <motion.div key="upcoming" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard title={t('accounting.subtitleUpcoming')} icon={<FiAlertTriangle className="text-rose-400" />}>
                            {accountingUpcoming.length === 0 ? (
                                <EmptyState icon={<FiCalendar />} message={t('accounting.noData')} />
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-2">
                                    {accountingUpcoming.map((p: any) => {
                                        const days = daysUntil(p.due_date);
                                        const isBusy = busyId === p.id;
                                        let badge = '';
                                        if (days === null || days < 0) { badge = t('accounting.upcomingOverdue'); }
                                        else if (days === 0) { badge = t('accounting.upcomingToday'); }
                                        else { badge = `${days} ${t('accounting.upcomingDaysLeft')}`; }

                                        return (
                                            <motion.div 
                                                key={p.id} 
                                                whileHover={{ y: -4 }}
                                                className="bg-slate-900/40 backdrop-blur-xl border border-white/5 hover:border-blue-500/30 rounded-[32px] p-6 transition-all group relative overflow-hidden flex flex-col"
                                            >
                                                <div className="absolute -right-4 -top-4 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity rotate-12">
                                                    <FiDollarSign size={100} />
                                                </div>
                                                <div className="flex items-start justify-between gap-4 mb-4">
                                                    <div className="min-w-0">
                                                        <div className="text-base font-black text-white truncate group-hover:text-blue-400 transition-colors uppercase italic tracking-tight">{tenantLabel(p)}</div>
                                                        <div className="flex items-center gap-3 mt-2">
                                                            <span className="flex items-center gap-2 px-2.5 py-1 bg-white/5 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest border border-white/5">
                                                                <FiCalendar className="text-blue-500" size={10} /> {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}
                                                            </span>
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">
                                                                #{p.payment_type.toUpperCase()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                                        <Badge color={days === null || days < 0 ? 'rose' : days <= 2 ? 'amber' : 'emerald'}>{badge}</Badge>
                                                        <Badge color={p.status === 'paid' ? 'emerald' : p.status === 'overdue' ? 'rose' : 'amber'}>{p.status.toUpperCase()}</Badge>
                                                    </div>
                                                </div>
                                                <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none mb-1">Settlement Amount</span>
                                                        <span className="text-xl font-black text-white tabular-nums group-hover:text-blue-400 transition-colors italic">{currency}{Number(p.amount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            disabled={isBusy}
                                                            onClick={async () => {
                                                                setBusyId(p.id);
                                                                await recordSubscriptionPayment(String(p.tenant_id), Number(p.amount || 0));
                                                                await refreshAll();
                                                                setBusyId(null);
                                                            }}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-widest border border-emerald-500/20 transition-all active:scale-95 disabled:opacity-40"
                                                        >
                                                            <FiCheckCircle size={14} /> {t('finance.accountingMarkPaid')}
                                                        </button>
                                                        <button
                                                            disabled={isBusy}
                                                            onClick={async () => {
                                                                setBusyId(p.id);
                                                                await sendPaymentDueMail(p.id);
                                                                await fetchAccountingNotifications();
                                                                setBusyId(null);
                                                            }}
                                                            className="p-2.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:text-white hover:bg-blue-600 rounded-2xl transition-all active:scale-95 disabled:opacity-40"
                                                            title={t('finance.accountingSendMail')}
                                                        >
                                                            <FiMail size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    </motion.div>
                )}

                {/* ─── ÖDEME EMİRLERİ (ORDERS) ─── */}
                {sub === 'orders' && (
                    <motion.div key="orders" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <StatCard 
                                label={t('accounting.summaryPaid')} 
                                value={`${currency}${Number(accountingAllPayments?.summary?.total_paid || 0).toLocaleString()}`} 
                                icon={<FiCheckCircle />} 
                                color="emerald" 
                                sub={`${accountingAllPayments?.summary?.paid_count || 0} Transactions`}
                            />
                            <StatCard 
                                label={t('accounting.summaryPending')} 
                                value={`${currency}${Number(accountingAllPayments?.summary?.total_pending || 0).toLocaleString()}`} 
                                icon={<FiClock />} 
                                color="amber" 
                                sub={`${accountingAllPayments?.summary?.pending_count || 0} Records`}
                            />
                            <StatCard 
                                label={t('accounting.summaryOverdue')} 
                                value={`${currency}${Number(accountingAllPayments?.summary?.total_overdue || 0).toLocaleString()}`} 
                                icon={<FiAlertTriangle />} 
                                color="rose" 
                                sub={`${accountingAllPayments?.summary?.overdue_count || 0} Blockers`}
                            />
                        </div>

                        <SectionCard 
                            title={t('accounting.subtitleOrders')} 
                            icon={<FiFileText className="text-blue-400" />}
                            action={
                                <div className="relative group min-w-[280px]">
                                    <FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/card:text-blue-500 transition-colors" size={14} />
                                    <input 
                                        type="text" 
                                        className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-3 text-[11px] text-white outline-none focus:border-blue-500/50 focus:bg-blue-500/10 transition-all w-full font-bold placeholder:text-slate-600 shadow-inner" 
                                        placeholder="Order ID / Tenant Terminal..."
                                    />
                                </div>
                            }
                        >
                            <div className="overflow-x-auto -mx-6 custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                                    <thead>
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                            <th className="px-6 py-4">{t('accounting.colTenant')}</th>
                                            <th className="px-6 py-4">{t('accounting.colType')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.colAmount')}</th>
                                            <th className="px-6 py-4 text-center">{t('accounting.colStatus')}</th>
                                            <th className="px-6 py-4 text-center">{t('accounting.colDue')}</th>
                                            <th className="px-6 py-4 text-center">{t('accounting.colInvoice')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y-0">
                                        {accountingAllPayments?.rows && accountingAllPayments.rows.length > 0 ? (
                                            accountingAllPayments.rows.map((p: any) => (
                                                <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-white/5 first:border-l last:border-r">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center font-black text-blue-400 shadow-xl border border-white/5 group-hover:scale-110 transition-transform">{tenantLabel(p)[0]}</div>
                                                            <div className="font-black text-white text-[13px] uppercase tracking-tight italic truncate max-w-[150px]">{tenantLabel(p)}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-[10px] font-black text-slate-500 uppercase tracking-widest">{paymentTypeLabel(t, p.payment_type)}</td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-right font-black text-white tabular-nums italic">{currency}{Number(p.amount || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-5 border-y border-white/5 text-center">
                                                        <Badge color={p.status === 'paid' ? 'emerald' : p.status === 'overdue' ? 'rose' : 'amber'}>
                                                            {p.status.toUpperCase()}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-5 border-y border-white/5 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[10px] font-black text-white tabular-nums italic leading-none mb-1">
                                                                {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}
                                                            </span>
                                                            <span className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Settlement Date</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 border-y border-white/5 text-center font-mono text-[10px]">
                                                        {p.invoice_number && p.invoice_number !== '—' ? (
                                                            <button onClick={() => openInvoice(p.invoice_number)} className="text-blue-400 hover:text-white underline underline-offset-4 decoration-blue-500/30 transition-all font-black uppercase tracking-tighter italic">
                                                                {p.invoice_number}
                                                            </button>
                                                        ) : <Badge color="slate">—</Badge>}
                                                    </td>
                                                    <td className="px-6 py-5 border-y border-white/5 rounded-r-[24px] text-right border-r">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                                                            {p.invoice_number && p.invoice_number !== '—' && (
                                                                <button onClick={() => openInvoice(p.invoice_number)} className="p-2.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all active:scale-90 border border-transparent hover:border-blue-500/20 shadow-2xl"><FiDownload size={14} /></button>
                                                            )}
                                                            {(p.status === 'pending' || p.status === 'overdue') && (
                                                                <button onClick={() => updatePaymentStatus(p.id, 'paid')} className="p-2.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all active:scale-90 border border-transparent hover:border-emerald-500/20 shadow-2xl"><FiCheckCircle size={14} /></button>
                                                            )}
                                                            <button onClick={() => sendPaymentDueMail(p.id)} className="p-2.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-all active:scale-90 border border-transparent hover:border-amber-500/20 shadow-2xl"><FiMail size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : <TableEmptyState colSpan={7} icon={<FiFileText />} message={t('accounting.noData')} />}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </motion.div>
                )}

                {/* ─── VADELİ (INSTALLMENTS) ─── */}
                {sub === 'installments' && (
                    <motion.div key="installments" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard 
                            title={t('accounting.subtitleInstallments')} 
                            icon={<FiClock className="text-amber-400" />}
                            action={
                                <div className="flex bg-slate-900/40 rounded-[18px] p-1 border border-white/5 shadow-2xl">
                                    {['', 'pending', 'overdue', 'paid'].map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => setInstFilter(f)}
                                            className={`px-3.5 py-1.5 rounded-[14px] text-[9px] font-black uppercase tracking-widest transition-all ${
                                                instFilter === f ? 'bg-blue-600 shadow-lg' : 'text-slate-500 hover:text-white'
                                            }`}
                                        >
                                            {f === '' ? 'ALL' : f.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="overflow-x-auto -mx-6 custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                                    <thead>
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                            <th className="px-6 py-4">{t('accounting.colTenant')}</th>
                                            <th className="px-6 py-4">{t('accounting.colType')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.colAmount')}</th>
                                            <th className="px-6 py-4 text-center">{t('accounting.colStatus')}</th>
                                            <th className="px-6 py-4 text-center">{t('accounting.colDue')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {accountingInstallments.length > 0 ? accountingInstallments.map((p: any) => {
                                            const days = daysUntil(p.due_date);
                                            return (
                                                <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-white/5 first:border-l last:border-r">
                                                        <div className="font-black text-white text-[13px] uppercase tracking-tight italic truncate max-w-[200px]">{tenantLabel(p)}</div>
                                                    </td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-[10px] font-black text-slate-500 uppercase tracking-widest">{paymentTypeLabel(t, p.payment_type)}</td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-right font-black text-white tabular-nums italic">{currency}{Number(p.amount || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-center">
                                                        <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${statusColor[p.status] || statusColor.pending}`}>
                                                            {p.status.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-center">
                                                        <div className="text-[11px] font-black text-slate-400">{p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}</div>
                                                        {days !== null && p.status !== 'paid' && (
                                                            <div className={`text-[8px] font-black uppercase mt-1 tracking-widest ${days < 0 ? 'text-rose-400 animate-pulse' : days <= 2 ? 'text-amber-400' : 'text-blue-400'}`}>
                                                                {days < 0 ? 'OVERDUE' : `${days} DAYS LEFT`}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 rounded-r-[24px] text-right border-r">
                                                        <button onClick={() => updatePaymentStatus(p.id, 'paid')} className="p-2.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-2xl opacity-40 group-hover:opacity-100 transition-all"><FiCheckCircle size={18} /></button>
                                                    </td>
                                                </tr>
                                            );
                                        }) : <TableEmptyState colSpan={6} icon={<FiClock />} message={t('accounting.noData')} />}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </motion.div>
                )}

                {/* ─── BİLDİRİMLER (NOTIFICATIONS) ─── */}
                {sub === 'notifications' && (
                    <motion.div key="notifications" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard title={t('accounting.subtitleNotifications')} icon={<FiBell className="text-violet-400" />}>
                            <div className="overflow-x-auto -mx-6 custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                                    <thead>
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                            <th className="px-6 py-4">{t('accounting.colTenant')}</th>
                                            <th className="px-6 py-4">{t('accounting.notifKind')}</th>
                                            <th className="px-6 py-4">{t('accounting.notifMessage')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.notifDate')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {accountingNotifications.length > 0 ? accountingNotifications.map((n: any, i) => {
                                            const kindColor = n.kind === 'mail_sent' ? 'blue' : n.kind === 'suspension' ? 'rose' : 'slate';
                                            return (
                                                <tr key={n.id ?? i} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-white/5 first:border-l last:border-r">
                                                        <div className="font-black text-white text-[12px] uppercase tracking-tight italic truncate max-w-[180px] group-hover:text-blue-400 transition-colors">{n.tenant_name || n.tenant_id}</div>
                                                    </td>
                                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                        <Badge color={kindColor as any}>{n.kind.toUpperCase()}</Badge>
                                                    </td>
                                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-slate-400 text-[11px] font-bold italic opacity-80 group-hover:opacity-100 transition-opacity whitespace-pre-line">{n.message}</td>
                                                    <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 rounded-r-[24px] text-right border-r">
                                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest tabular-nums">{new Date(n.created_at).toLocaleString('tr-TR')}</span>
                                                    </td>
                                                </tr>
                                            );
                                        }) : <TableEmptyState colSpan={4} icon={<FiBell />} message={t('accounting.noData')} />}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </motion.div>
                )}

                {/* ─── FATURALAR (INVOICES) ─── */}
                {sub === 'invoices' && (
                    <motion.div key="invoices" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard 
                            title={t('accounting.subtitleInvoices')} 
                            icon={<FiFileText className="text-cyan-400" />}
                            action={
                                <div className="flex flex-wrap gap-4 items-center">
                                    <select 
                                        value={invFilterStatus} 
                                        onChange={e => setInvFilterStatus(e.target.value)} 
                                        className="bg-slate-900/60 border border-white/10 text-white text-[10px] font-black uppercase rounded-2xl px-5 py-3 outline-none hover:border-blue-500/40 transition-all cursor-pointer shadow-xl appearance-none"
                                    >
                                        <option value="">STATUS: ALL</option>
                                        <option value="paid">PAID</option>
                                        <option value="draft">DRAFT</option>
                                    </select>
                                    <div className="relative group min-w-[200px]">
                                        <FiSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={14} />
                                        <input 
                                            type="text" 
                                            value={invFilterTenant} 
                                            onChange={e => setInvFilterTenant(e.target.value)} 
                                            className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-3 text-[11px] font-black text-white outline-none focus:border-blue-500/50 focus:bg-blue-500/10 transition-all w-full placeholder:text-slate-700" 
                                            placeholder="TENANT TERMINAL..." 
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-900/60 rounded-2xl p-1 border border-white/5">
                                        <input type="date" value={invFilterFrom} onChange={e => setInvFilterFrom(e.target.value)} className="bg-transparent border-none text-white text-[10px] font-black px-3 py-2 outline-none cursor-pointer" />
                                        <span className="text-slate-700 font-bold px-1">/</span>
                                        <input type="date" value={invFilterTo} onChange={e => setInvFilterTo(e.target.value)} className="bg-transparent border-none text-white text-[10px] font-black px-3 py-2 outline-none cursor-pointer" />
                                    </div>
                                </div>
                            }
                        >
                            <div className="overflow-x-auto -mx-6 custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                                    <thead>
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                            <th className="px-6 py-4">{t('accounting.colInvoice')}</th>
                                            <th className="px-6 py-4">{t('accounting.colTenant')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.colAmount')}</th>
                                            <th className="px-6 py-4 text-center">{t('accounting.colStatus')}</th>
                                            <th className="px-6 py-4 text-right">{t('accounting.colCreated')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.length > 0 ? invoices.map((inv: any) => (
                                            <tr key={inv.id} className="group hover:bg-white/[0.02] transition-colors">
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-white/5 first:border-l last:border-r">
                                                    <button onClick={() => openInvoice(inv.invoice_number)} className="text-blue-400 hover:text-white transition-all font-black uppercase tracking-tighter italic">
                                                        <FiFileText className="inline mr-2 opacity-40" /> #{inv.invoice_number}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 font-black text-white text-xs uppercase tracking-tight truncate max-w-[150px]">{inv.tenant_name || inv.tenant_id}</td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-right font-black text-white tabular-nums italic">{currency}{Number(inv.total || 0).toLocaleString()}</td>
                                                <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-center">
                                                    <Badge color={inv.status === 'paid' ? 'emerald' : inv.status === 'overdue' ? 'rose' : 'amber'}>
                                                        {inv.status.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-5 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 rounded-r-[24px] text-right border-r">
                                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest tabular-nums">{new Date(inv.created_at).toLocaleDateString('tr-TR')}</span>
                                                </td>
                                            </tr>
                                        )) : <TableEmptyState colSpan={5} icon={<FiFileText />} message={t('accounting.noData')} />}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ FATURA DETAY MODAL (Document View) ═══ */}
            <AnimatePresence>
                {(invoiceModal || invoiceLoading) && (
                    <Modal 
                        show={!!(invoiceModal || invoiceLoading)} 
                        onClose={() => setInvoiceModal(null)} 
                        title={t('accounting.invoiceDetailTitle')}
                        maxWidth="max-w-4xl"
                    >
                        {invoiceLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Retrieving Document...</span>
                            </div>
                        ) : invoiceModal ? (
                            <div className="space-y-10">
                                {/* Header Section */}
                                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 w-fit rounded-3xl shadow-2xl relative overflow-hidden">
                                            <FiZap size={32} className="text-white drop-shadow-lg" />
                                        </div>
                                        <div>
                                            <h4 className="text-3xl font-black text-white italic tracking-tighter">NEXTPOS <span className="text-blue-500">PRO</span></h4>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Financial Services Ltd.</p>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-4">
                                        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-[32px] inline-block">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{t('accounting.colInvoice')}</div>
                                            <div className="text-2xl font-black text-white tabular-nums tracking-tighter">#{invoiceModal.invoice_number}</div>
                                            <div className={`mt-2 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] inline-block ${statusColor[invoiceModal.status] || statusColor.pending}`}>
                                                {invoiceModal.status.toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Issued On</span>
                                            <span className="text-sm font-black text-slate-300 italic">{invoiceModal.created_at ? new Date(invoiceModal.created_at).toLocaleString('tr-TR') : ''}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Billing info grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-slate-900/40 border border-white/10 rounded-[40px] p-8 space-y-4 group hover:border-blue-500/20 transition-all">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl"><FiUsers size={14}/></div>
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">{t('accounting.invoiceTo')}</span>
                                        </div>
                                        <div className="text-xl font-black text-white uppercase italic tracking-tight leading-tighter">{invoiceModal.company_title || invoiceModal.tenant_name || '—'}</div>
                                        <div className="space-y-1 text-slate-400 font-bold text-[11px] leading-relaxed">
                                            {invoiceModal.tenant_address && <p>{invoiceModal.tenant_address}</p>}
                                            {invoiceModal.authorized_person && <p className="text-slate-500 uppercase tracking-widest mt-2">{t('accounting.fieldAuthorized')}: {invoiceModal.authorized_person}</p>}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/40 border border-white/10 rounded-[40px] p-8 space-y-4 group hover:border-white/20 transition-all">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-slate-800 text-slate-500 rounded-xl"><FiLayers size={14}/></div>
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t('accounting.fieldContact')}</span>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Email</span>
                                                    <span className="text-[11px] font-black text-slate-300 truncate block underline decoration-white/10">{invoiceModal.contact_email || '—'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Tax No</span>
                                                    <span className="text-[11px] font-black text-slate-300 block italic">{invoiceModal.tax_number || '—'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1">Address Detail</span>
                                                <span className="text-[11px] text-slate-500 font-bold">{invoiceModal.tax_office || ''} Internal Node</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="overflow-hidden border border-white/5 rounded-[32px] bg-white/[0.01]">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-white/5 text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                                <th className="px-8 py-5">{t('accounting.invoiceItem')}</th>
                                                <th className="px-8 py-5 text-center">{t('accounting.invoiceQty')}</th>
                                                <th className="px-8 py-5 text-right">{t('accounting.invoiceUnitPrice')}</th>
                                                <th className="px-8 py-5 text-right">{t('accounting.colAmount')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.03]">
                                            {(Array.isArray(invoiceModal.items) ? invoiceModal.items : []).map((item: any, idx: number) => (
                                                <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-8 py-5 text-sm font-black text-white italic">{item.description}</td>
                                                    <td className="px-8 py-5 text-center text-xs font-bold text-slate-500">{item.quantity}</td>
                                                    <td className="px-8 py-5 text-right text-xs font-bold text-slate-400 tabular-nums">{currency}{Number(item.unit_price || 0).toLocaleString()}</td>
                                                    <td className="px-8 py-5 text-right text-base font-black text-white tabular-nums group-hover:text-blue-400 transition-colors">{currency}{Number(item.total || 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totals & Action */}
                                <div className="flex flex-col md:flex-row justify-between items-end gap-8 pt-6 border-t border-white/5">
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => {
                                                const w = window.open('', '_blank');
                                                if (w) { w.document.write(buildInvoiceHtml(invoiceModal, currency)); w.document.close(); }
                                            }}
                                            className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center gap-3 transition-all active:scale-95 text-[10px] font-black uppercase tracking-[0.2em] text-white border border-white/5 shadow-2xl"
                                        >
                                            <FiPrinter size={16} /> {t('accounting.print') || 'Print / PDF'}
                                        </button>
                                    </div>
                                    <div className="w-full md:w-80 space-y-3 bg-gradient-to-br from-white/[0.02] to-transparent p-8 rounded-[40px] border border-white/10 shadow-2xl">
                                        <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                            <span>Subtotal</span>
                                            <span className="tabular-nums">{currency}{Number(invoiceModal.subtotal || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                            <span>Tax Support ({invoiceModal.tax_rate || 19}%)</span>
                                            <span className="tabular-nums">{currency}{Number(invoiceModal.tax_amount || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="pt-4 mt-2 border-t border-white/10 flex justify-between items-center">
                                            <span className="text-sm font-black text-white uppercase tracking-[0.2em]">Total</span>
                                            <span className="text-3xl font-black text-white tabular-nums italic tracking-tighter drop-shadow-2xl">{currency}{Number(invoiceModal.total || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </Modal>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ─── Yardımcı Fonksiyonlar ───

function TableEmptyState({ colSpan, icon, message }: { colSpan: number, icon: any, message: string }) {
    return (
        <tr>
            <td colSpan={colSpan}>
                <EmptyState icon={icon} message={message} />
            </td>
        </tr>
    );
}

function buildInvoiceHtml(inv: any, currency: string): string {
    const items = Array.isArray(inv.items) ? inv.items : [];
    const rows = items.map((it: any) => `
        <tr>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;font-weight:bold">${it.description || ''}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:center">${it.quantity}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:right">${currency}${Number(it.unit_price || 0).toLocaleString()}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${currency}${Number(it.total || 0).toLocaleString()}</td>
        </tr>
    `).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
    <style>
        body{font-family:'Inter',system-ui,sans-serif;max-width:850px;margin:50px auto;color:#1e293b;padding:40px;border:1px solid #f1f5f9;border-radius:16px;box-shadow:0 10px 50px rgba(0,0,0,0.05)}
        .header{display:flex;justify-content:space-between;margin-bottom:50px}
        .logo{font-size:28px;font-weight:900;letter-spacing:-1px;color:#0f172a;font-style:italic}
        .logo span{color:#2563eb}
        .inv-details{text-align:right}
        .inv-details h1{font-size:40px;font-weight:900;margin:0;color:#0f172a;letter-spacing:-2px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:50px}
        .box{background:#f8fafc;padding:25px;border-radius:20px}
        .box-label{font-size:10px;font-weight:900;text-transform:uppercase;color:#94a3b8;letter-spacing:2px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;margin:40px 0}
        th{background:#f8fafc;padding:15px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:900;color:#64748b}
        .totals{margin-left:auto;width:300px;background:#0f172a;color:#fff;padding:30px;border-radius:24px}
        .total-row{display:flex;justify-content:space-between;margin-bottom:10px;font-size:12px;opacity:0.8}
        .grand-total{display:flex;justify-content:space-between;margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;font-size:24px;font-weight:900}
        @media print{body{margin:0;border:none;box-shadow:none}}
    </style></head><body>
    <div class="header">
        <div class="logo">NEXTPOS <span>PRO</span></div>
        <div class="inv-details">
            <h1>INVOICE</h1>
            <div style="font-weight:bold;font-size:16px">#${inv.invoice_number}</div>
            <div style="color:#64748b;font-size:12px;margin-top:5px">${inv.created_at ? new Date(inv.created_at).toLocaleDateString('tr-TR') : ''}</div>
        </div>
    </div>
    <div class="grid">
        <div class="box">
            <div class="box-label">Billed To</div>
            <div style="font-size:18px;font-weight:900">${inv.company_title || inv.tenant_name || '—'}</div>
            <div style="font-size:13px;color:#64748b;margin-top:8px">${inv.tenant_address || ''}</div>
        </div>
        <div class="box">
            <div class="box-label">Account Details</div>
            <div style="font-size:14px;font-weight:bold;display:grid;gap:5px">
                <div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">Authorized</span> <span>${inv.authorized_person || '—'}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">Tax ID</span> <span>${inv.tax_number || '—'}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#94a3b8">Contact</span> <span>${inv.contact_email || '—'}</span></div>
            </div>
        </div>
    </div>
    <table><thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
        <div class="total-row"><span>Subtotal</span> <span>${currency}${Number(inv.subtotal || 0).toLocaleString()}</span></div>
        <div class="total-row"><span>Tax (${inv.tax_rate || 19}%)</span> <span>${currency}${Number(inv.tax_amount || 0).toLocaleString()}</span></div>
        <div class="grand-total"><span>TOTAL</span> <span>${currency}${Number(inv.total || 0).toLocaleString()}</span></div>
    </div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;
}
