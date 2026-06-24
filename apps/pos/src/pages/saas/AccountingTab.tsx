import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import {
    FiFileText, FiClock, FiBell, FiAlertTriangle,
    FiCalendar, FiMail, FiCheckCircle,
    FiPrinter, FiDollarSign, FiSearch, FiDownload, FiZap, FiUsers, FiLayers,
    FiRefreshCw, FiPlusCircle, FiSlash, FiTrendingUp, FiSliders, FiFilter, FiX,
} from 'react-icons/fi';
import { StatCard, SectionCard, EmptyState, Modal, SubTab, Badge, SelectGroup } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

type AccountingSubTab = 'orders' | 'installments' | 'notifications' | 'upcoming' | 'invoices' | 'expenses';

function paymentTypeLabel(t: (k: string) => string, pt: string): string {
    const key = `finance.pt.${pt}`;
    const v = t(key);
    return v === key ? pt : v;
}

function tenantLabel(p: { tenant_name?: string; tenant_id?: string; description?: string }): string {
    if (p.tenant_name) return p.tenant_name;
    if (p.description) return p.description;
    if (p.tenant_id) return String(p.tenant_id);
    return '—';
}

const statusColor: Record<string, string> = {
    paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/5',
    overdue: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/5',
    cancelled: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
};

function daysUntil(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function buildAppliedOrderFilters(d: {
    ordStatus: string;
    ordType: string;
    ordMethod: string;
    ordFrom: string;
    ordTo: string;
    ordTenant: string;
}): Record<string, string> {
    const o: Record<string, string> = {};
    if (d.ordStatus) o.status = d.ordStatus;
    if (d.ordType) o.type = d.ordType;
    if (d.ordMethod) o.payment_method = d.ordMethod;
    if (d.ordFrom) o.from = d.ordFrom;
    if (d.ordTo) o.to = d.ordTo;
    if (d.ordTenant.trim()) o.tenant = d.ordTenant.trim();
    return o;
}

export const AccountingTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        admin,
        tenants,
        fetchTenants,
        fetchFinanceInbox,
        fetchPayments,
        fetchAccountingUpcoming,
        fetchAccountingInstallments,
        fetchAccountingNotifications,
        fetchAccountingAllPayments,
        accountingUpcoming,
        accountingInstallments,
        accountingNotifications,
        accountingAllPayments,
        recordSubscriptionPayment,
        sendPaymentDueMail,
        updatePaymentStatus,
        addPayment,
        fetchFinancialSummary,
        fetchInvoices,
        invoices,
        fetchInvoiceDetail,
        settings,
        financialSummary,
        expenses,
        totalExpense,
        fetchExpenses,
        createExpense,
        suspendTenantForOverdueInvoice,
    } = useSaaSStore();

    const isSuperAdmin = admin?.role === 'super_admin';
    const currency = settings?.currency || '€';

    const [sub, setSub] = useState<AccountingSubTab>(() => {
        const saved = localStorage.getItem('saas:accounting:sub');
        if (saved && ['orders', 'installments', 'notifications', 'upcoming', 'invoices', 'expenses'].includes(saved)) {
            localStorage.removeItem('saas:accounting:sub');
            return saved as AccountingSubTab;
        }
        return 'orders';
    });

    useEffect(() => {
        const handleSetSub = (ev: Event) => {
            const detail = (ev as CustomEvent<{ sub: AccountingSubTab }>).detail;
            if (detail?.sub) {
                setSub(detail.sub);
            }
        };
        window.addEventListener('saas:accounting:set-sub', handleSetSub as EventListener);
        return () => window.removeEventListener('saas:accounting:set-sub', handleSetSub as EventListener);
    }, []);

    const [instFilter, setInstFilter] = useState<string>('');
    const [busyId, setBusyId] = useState<number | null>(null);
    const [invoiceModal, setInvoiceModal] = useState<any | null>(null);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseCategory, setExpenseCategory] = useState('server');
    const [expenseDesc, setExpenseDesc] = useState('');

    const [invFilterStatus, setInvFilterStatus] = useState('');
    const [invFilterTenant, setInvFilterTenant] = useState('');
    const [invFilterFrom, setInvFilterFrom] = useState('');
    const [invFilterTo, setInvFilterTo] = useState('');

    const [ordStatus, setOrdStatus] = useState('');
    const [ordType, setOrdType] = useState('');
    const [ordMethod, setOrdMethod] = useState('');
    const [ordFrom, setOrdFrom] = useState('');
    const [ordTo, setOrdTo] = useState('');
    const [ordTenant, setOrdTenant] = useState('');
    const [appliedOrderFilters, setAppliedOrderFilters] = useState<Record<string, string>>({});

    const refreshAll = useCallback(async () => {
        await Promise.all([
            fetchFinanceInbox(),
            fetchPayments(),
            fetchFinancialSummary(),
            fetchAccountingUpcoming(),
            fetchAccountingInstallments(instFilter || undefined),
            fetchAccountingNotifications(),
            fetchAccountingAllPayments(appliedOrderFilters),
        ]);
    }, [instFilter, appliedOrderFilters, fetchAccountingAllPayments]);

    const [ordersPage, setOrdersPage] = useState(1);
    const itemsPerPage = 10;

    const [filtersOpen, setFiltersOpen] = useState(false);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (ordStatus) count++;
        if (ordType) count++;
        if (ordMethod) count++;
        if (ordFrom) count++;
        if (ordTo) count++;
        return count;
    }, [ordStatus, ordType, ordMethod, ordFrom, ordTo]);

    const hasActiveFilters = useMemo(() => {
        return ordTenant.trim() !== '' || activeFilterCount > 0;
    }, [ordTenant, activeFilterCount]);

    const overdueUpcoming = useMemo(() => {
        const list = accountingUpcoming || [];
        const overdue = list.filter((p: any) => {
            const days = daysUntil(p.due_date);
            return days === null || days < 0 || p.status === 'overdue';
        });
        const upcoming = list.filter((p: any) => {
            const days = daysUntil(p.due_date);
            return days !== null && days >= 0 && p.status !== 'overdue';
        });
        return { overdue, upcoming };
    }, [accountingUpcoming]);

    const paginatedPayments = useMemo(() => {
        const rows = accountingAllPayments?.rows || [];
        const startIndex = (ordersPage - 1) * itemsPerPage;
        return rows.slice(startIndex, startIndex + itemsPerPage);
    }, [accountingAllPayments?.rows, ordersPage]);

    const totalOrdersPages = useMemo(() => {
        const rows = accountingAllPayments?.rows || [];
        return Math.ceil(rows.length / itemsPerPage);
    }, [accountingAllPayments?.rows]);

    useEffect(() => {
        setOrdersPage(1);
    }, [appliedOrderFilters, sub]);

    const [manualOpen, setManualOpen] = useState(false);
    const [manualTenantId, setManualTenantId] = useState('');
    const [manualAmount, setManualAmount] = useState('');
    const [manualType, setManualType] = useState('subscription');
    const [manualMethod, setManualMethod] = useState('bank_transfer');
    const [manualDesc, setManualDesc] = useState('');
    const [manualDueDays, setManualDueDays] = useState('');
    const [manualInitialStatus, setManualInitialStatus] = useState<'pending' | 'paid'>('pending');
    const [manualBusy, setManualBusy] = useState(false);

    const [collectModal, setCollectModal] = useState<{
        isOpen: boolean;
        payment: any;
        source: 'upcoming' | 'orders' | 'installments';
        amount: string;
        paymentMethod: string;
        billingCycle?: 'monthly' | 'yearly';
        notes: string;
    }>({
        isOpen: false,
        payment: null,
        source: 'upcoming',
        amount: '',
        paymentMethod: 'bank_transfer',
        billingCycle: 'monthly',
        notes: '',
    });
    const [collectBusy, setCollectBusy] = useState(false);

    // Premium Card states
    const [cardNo, setCardNo] = useState('');
    const [cardName, setCardName] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvv, setCardCvv] = useState('');
    const [isCardFlipped, setIsCardFlipped] = useState(false);

    const handleCardNoChange = (val: string) => {
        const formatted = val.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
        setCardNo(formatted);
    };

    const handleExpiryChange = (val: string) => {
        let clean = val.replace(/\D/g, '');
        if (clean.length > 2) {
            clean = `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
        }
        setCardExpiry(clean.slice(0, 5));
    };

    const handleCvvChange = (val: string) => {
        setCardCvv(val.replace(/\D/g, '').slice(0, 3));
    };

    const getCardType = (number: string) => {
        const firstDigit = number.trim()[0];
        if (firstDigit === '4') return 'visa';
        if (firstDigit === '5') return 'mastercard';
        return 'generic';
    };

    const openCollectModal = useCallback((p: any, source: 'upcoming' | 'orders' | 'installments') => {
        setCollectModal({
            isOpen: true,
            payment: p,
            source,
            amount: String(p.amount || ''),
            paymentMethod: p.payment_method || 'bank_transfer',
            billingCycle: p.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
            notes: '',
        });
        setCardNo('');
        setCardName('');
        setCardExpiry('');
        setCardCvv('');
        setIsCardFlipped(false);
    }, []);

    const submitCollect = useCallback(async () => {
        const { payment, source, amount, paymentMethod, billingCycle, notes } = collectModal;
        if (!payment) return;
        setCollectBusy(true);

        let ok = false;
        if (source === 'upcoming') {
            const desc = `Abonelik Yenileme - ${
                paymentMethod === 'bank_transfer' ? 'Banka Havalesi' : 
                paymentMethod === 'card' ? 'Kredi Kartı' : 
                paymentMethod === 'stripe' ? 'Stripe' : 'Nakit'
            }${notes.trim() ? ' (' + notes.trim() + ')' : ''}`;
            ok = await recordSubscriptionPayment(
                String(payment.tenant_id),
                Number(amount || 0),
                billingCycle,
                desc
            );
        } else {
            const desc = `${payment.description || 'Tahsilat'} - ${
                paymentMethod === 'bank_transfer' ? 'Banka Havalesi' : 
                paymentMethod === 'card' ? 'Kredi Kartı' : 
                paymentMethod === 'stripe' ? 'Stripe' : 'Nakit'
            }${notes.trim() ? ' (' + notes.trim() + ')' : ''}`;
            ok = await updatePaymentStatus(payment.id, 'paid', Number(amount || 0), paymentMethod, desc);
        }

        setCollectBusy(false);
        if (ok) {
            toast.success(t('accounting.toast.paymentOk'));
            setCollectModal(prev => ({ ...prev, isOpen: false }));
            await refreshAll();
        } else {
            toast.error(t('accounting.toast.paymentFail'));
        }
    }, [collectModal, recordSubscriptionPayment, updatePaymentStatus, refreshAll, t]);

    const invoiceFilters = useMemo(
        () => ({
            status: invFilterStatus || undefined,
            tenant: invFilterTenant || undefined,
            from: invFilterFrom || undefined,
            to: invFilterTo || undefined,
        }),
        [invFilterStatus, invFilterTenant, invFilterFrom, invFilterTo],
    );

    useEffect(() => {
        fetchFinanceInbox();
        fetchPayments();
        fetchFinancialSummary();
        fetchAccountingUpcoming();
        fetchAccountingInstallments();
        fetchAccountingNotifications();
        fetchInvoices();
        fetchExpenses();
        fetchTenants();
    }, []);

    useEffect(() => {
        if (sub === 'orders') {
            fetchAccountingAllPayments(appliedOrderFilters);
        }
    }, [sub, appliedOrderFilters]);

    useEffect(() => {
        if (sub === 'installments') fetchAccountingInstallments(instFilter || undefined);
    }, [sub, instFilter]);

    useEffect(() => {
        if (sub === 'upcoming') fetchAccountingUpcoming();
    }, [sub]);

    useEffect(() => {
        if (sub === 'notifications') fetchAccountingNotifications();
    }, [sub]);

    useEffect(() => {
        if (sub === 'invoices') fetchInvoices(invoiceFilters);
    }, [sub, invoiceFilters]);

    useEffect(() => {
        if (sub === 'expenses') fetchExpenses();
    }, [sub]);

    const tabs: { key: AccountingSubTab; icon: React.ReactElement; label: string }[] = [
        { key: 'orders', icon: <FiDollarSign />, label: t('accounting.tabOrders') },
        { key: 'upcoming', icon: <FiAlertTriangle />, label: t('accounting.tabUpcoming') },
        { key: 'installments', icon: <FiClock />, label: t('accounting.tabInstallments') },
        { key: 'notifications', icon: <FiBell />, label: t('accounting.tabNotifications') },
        { key: 'invoices', icon: <FiFileText />, label: t('accounting.tabInvoices') },
        { key: 'expenses', icon: <FiLayers />, label: t('accounting.tabExpenses') || 'Gider & Maliyet' },
    ];


    const openInvoice = async (invoiceNumber: string) => {
        if (!invoiceNumber || invoiceNumber === '—') return;
        setInvoiceLoading(true);
        const detail = await fetchInvoiceDetail(invoiceNumber);
        setInvoiceModal(detail);
        setInvoiceLoading(false);
    };

    const applyOrderFiltersClick = () => {
        setAppliedOrderFilters(
            buildAppliedOrderFilters({ ordStatus, ordType, ordMethod, ordFrom, ordTo, ordTenant }),
        );
    };

    const clearOrderFilters = () => {
        setOrdStatus('');
        setOrdType('');
        setOrdMethod('');
        setOrdFrom('');
        setOrdTo('');
        setOrdTenant('');
        setAppliedOrderFilters({});
    };

    const runPaymentAction = async (id: number, fn: () => Promise<boolean>, okMsg?: string) => {
        setBusyId(id);
        const ok = await fn();
        setBusyId(null);
        if (ok) {
            toast.success(okMsg || t('accounting.toast.actionOk'));
            await refreshAll();
        } else toast.error(t('accounting.toast.actionFail'));
    };

    const submitManualPayment = async () => {
        if (!manualTenantId || !manualAmount) {
            toast.error(t('accounting.toast.paymentFail'));
            return;
        }
        setManualBusy(true);
        const dueDaysNum = manualDueDays.trim() ? Number(manualDueDays) : null;
        const ok = await addPayment({
            tenant_id: manualTenantId,
            amount: Number(manualAmount),
            currency: currency === '€' ? 'EUR' : currency,
            payment_type: manualType,
            payment_method: manualMethod,
            description: manualDesc || 'Manuel kayıt',
            status: manualInitialStatus,
            ...(dueDaysNum != null && Number.isFinite(dueDaysNum) && dueDaysNum > 0 ? { due_days: dueDaysNum } : {}),
        });
        setManualBusy(false);
        if (ok) {
            toast.success(t('accounting.toast.paymentOk'));
            setManualOpen(false);
            setManualAmount('');
            setManualDesc('');
            setManualDueDays('');
            await refreshAll();
        } else toast.error(t('accounting.toast.paymentFail'));
    };

    const sortedTenants = useMemo(
        () => [...(tenants || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr')),
        [tenants],
    );

    const paymentTypeOptions = useMemo(
        () =>
            ['subscription', 'setup', 'addon', 'license', 'license_upgrade', 'refund', 'reseller_package_onboarding'].map(
                (v) => ({ value: v, label: paymentTypeLabel(t, v) }),
            ),
        [t],
    );

    const paymentMethodOptions = [
        { value: '', label: t('accounting.filterAll') },
        { value: 'bank_transfer', label: 'Banka / Havale' },
        { value: 'card', label: 'Kart' },
        { value: 'stripe', label: 'Stripe' },
        { value: 'cash', label: 'Nakit' },
    ];

    const manualMethodOptions = paymentMethodOptions.filter((o) => o.value !== '');

    return (
        <motion.div className="space-y-8 pb-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header: Title and Global Action Buttons */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-0">
                <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-3 text-blue-500">
                        <FiZap className="shrink-0" size={14} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                            {t('tab.accountingSubtitle')}
                        </span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-white tracking-tighter uppercase italic">
                        {t('accounting.tabTitle')}
                    </h2>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => void refreshAll()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 hover:border-blue-500/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-[0.98]"
                    >
                        <FiRefreshCw size={14} /> {t('accounting.refreshAll')}
                    </button>
                    {isSuperAdmin && (
                        <button
                            type="button"
                            onClick={() => setManualOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                        >
                            <FiPlusCircle size={16} /> {t('accounting.manualPayment')}
                        </button>
                    )}
                </div>
            </div>

            {/* Premium Tab Navigation Menu */}
            <div className="w-full bg-slate-100/40 dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl p-1.5 border border-slate-200/60 dark:border-white/5 shadow-2xl overflow-x-auto no-scrollbar">
                <div className="flex md:grid md:grid-cols-6 gap-1.5 relative min-w-max md:min-w-0">
                    {tabs.map((tb) => {
                        const active = sub === tb.key;
                        const count = tb.key === 'upcoming'
                            ? accountingUpcoming.length
                            : tb.key === 'notifications'
                              ? accountingNotifications.length
                              : undefined;
                        return (
                            <button
                                key={tb.key}
                                onClick={() => setSub(tb.key)}
                                className={`px-4 py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all duration-300 relative whitespace-nowrap text-xs font-semibold tracking-wide flex-1 md:w-full shrink-0 outline-none ${
                                    active 
                                        ? 'text-blue-600 dark:text-white font-bold shadow-sm' 
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50/50 dark:hover:bg-white/5'
                                }`}
                            >
                                {active && (
                                    <motion.span 
                                        layoutId="accountingActiveTabPill" 
                                        className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
                                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                    />
                                )}
                                <span className={`relative z-10 transition-colors duration-300 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {React.cloneElement(tb.icon as React.ReactElement<any>, { size: 14 })}
                                </span>
                                <span className="relative z-10 transition-colors duration-300">{tb.label}</span>
                                {count !== undefined && count > 0 && (
                                    <span className={`relative z-10 text-[9px] font-black px-2 py-0.5 rounded-md border tracking-tighter transition-all duration-300 ${
                                        active 
                                            ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)]' 
                                            : 'bg-slate-200/60 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-300/40 dark:border-slate-700/50'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {(financialSummary && sub === 'orders') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-0">
                    <StatCard
                        label={t('accounting.statTotalRevenue')}
                        value={`${currency}${Number(financialSummary.totalRevenue ?? 0).toLocaleString('tr-TR')}`}
                        icon={<FiTrendingUp />}
                        color="emerald"
                        dense
                    />
                    <StatCard
                        label={t('accounting.statPending')}
                        value={`${currency}${Number(financialSummary.pendingPayments?.total ?? financialSummary.pendingRevenue ?? 0).toLocaleString('tr-TR')}`}
                        icon={<FiClock />}
                        color="amber"
                        sub={`${financialSummary.pendingPayments?.count ?? '—'} kayıt`}
                        dense
                    />
                    <StatCard
                        label={t('accounting.statOverdue')}
                        value={`${currency}${Number(financialSummary.overduePayments?.total ?? 0).toLocaleString('tr-TR')}`}
                        icon={<FiAlertTriangle />}
                        color="rose"
                        sub={`${financialSummary.overduePayments?.count ?? '—'} kayıt`}
                        dense
                    />
                    <StatCard
                        label={t('accounting.summaryPaid')}
                        value={`${currency}${Number(accountingAllPayments?.summary?.total_paid || 0).toLocaleString('tr-TR')}`}
                        icon={<FiCheckCircle />}
                        color="blue"
                        sub={t('accounting.tabOrders')}
                        dense
                    />
                </div>
            )}

            <AnimatePresence mode="wait">
                {sub === 'orders' && (
                    <motion.div
                        key="orders"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="space-y-6"
                    >
                        <SectionCard
                            title={t('accounting.subtitleOrders')}
                            icon={<FiFileText className="text-blue-400" />}
                        >
                            {/* Filter Toolbar */}
                            <div className="flex flex-col gap-4 mb-6 border-b border-slate-100 dark:border-slate-800/60 pb-5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="relative flex-1 max-w-md">
                                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
                                        <input
                                            value={ordTenant}
                                            onChange={(e) => setOrdTenant(e.target.value)}
                                            placeholder={t('accounting.filterTenantPlaceholder')}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-white placeholder:text-slate-450 focus:border-blue-500 transition-colors outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFiltersOpen(!filtersOpen)}
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                                filtersOpen 
                                                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' 
                                                    : 'bg-white border-slate-200 hover:border-slate-350 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                                            }`}
                                        >
                                            <FiFilter size={13} />
                                            <span>Filtreler</span>
                                            {activeFilterCount > 0 && (
                                                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                    {activeFilterCount}
                                                </span>
                                            )}
                                        </button>
                                        {hasActiveFilters && (
                                            <button
                                                type="button"
                                                onClick={clearOrderFilters}
                                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                            >
                                                <FiX size={13} />
                                                <span>Temizle</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {filtersOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden mt-2"
                                        >
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800/80">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Durum</label>
                                                    <select
                                                        value={ordStatus}
                                                        onChange={(e) => setOrdStatus(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none"
                                                    >
                                                        <option value="">Tümü</option>
                                                        <option value="pending">{t('accounting.filterPending')}</option>
                                                        <option value="overdue">{t('accounting.filterOverdue')}</option>
                                                        <option value="paid">{t('accounting.filterPaid')}</option>
                                                        <option value="cancelled">{t('accounting.actionCancel')}</option>
                                                    </select>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Ödeme Tipi</label>
                                                    <select
                                                        value={ordType}
                                                        onChange={(e) => setOrdType(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none"
                                                    >
                                                        <option value="">Tümü</option>
                                                        {paymentTypeOptions.map((o) => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Yöntem</label>
                                                    <select
                                                        value={ordMethod}
                                                        onChange={(e) => setOrdMethod(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none"
                                                    >
                                                        {paymentMethodOptions.map((o) => (
                                                            <option key={o.value || 'all'} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Başlangıç</label>
                                                    <input
                                                        type="date"
                                                        value={ordFrom}
                                                        onChange={(e) => setOrdFrom(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white outline-none"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Bitiş</label>
                                                    <input
                                                        type="date"
                                                        value={ordTo}
                                                        onChange={(e) => setOrdTo(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/40">
                                                <button
                                                    type="button"
                                                    onClick={applyOrderFiltersClick}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors"
                                                >
                                                    Filtreleri Uygula
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Desktop View */}
                            <div className="overflow-x-auto -mx-6 custom-scrollbar hidden md:block">
                                <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                                    <thead>
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                            <th className="px-6 py-3">Kayıt</th>
                                            <th className="px-6 py-3">{t('accounting.colTenant')}</th>
                                            <th className="px-6 py-3">Yöntem & Vade</th>
                                            <th className="px-6 py-3 text-center">{t('accounting.colInvoice')}</th>
                                            <th className="px-6 py-3 text-center">{t('accounting.colStatus')}</th>
                                            <th className="px-6 py-3 text-right">Tutar & İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedPayments.length > 0 ? (
                                            paginatedPayments.map((p: any) => {
                                                const isBusy = busyId === p.id;
                                                return (
                                                    <tr key={p.id} className="group hover:bg-white/[0.01] transition-colors">
                                                        <td className="px-6 py-3 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 first:border-l rounded-l-[16px] font-medium">
                                                            <span className="font-mono text-[10px] text-slate-400 block">#{p.id}</span>
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase block mt-0.5">
                                                                {paymentTypeLabel(t, p.payment_type)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-405 flex items-center justify-center font-bold text-xs shrink-0">
                                                                    {tenantLabel(p).charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="font-semibold text-slate-850 dark:text-white text-xs truncate max-w-[150px]">
                                                                    {tenantLabel(p)}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0">
                                                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-350 block">
                                                                {p.payment_method || '—'}
                                                            </span>
                                                            <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 block mt-0.5">
                                                                Vade: {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-center font-mono text-[10px]">
                                                            {p.invoice_number && p.invoice_number !== '—' ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void openInvoice(p.invoice_number)}
                                                                    className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-semibold"
                                                                >
                                                                    {p.invoice_number}
                                                                </button>
                                                            ) : (
                                                                <span className="text-slate-400 dark:text-slate-655">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-center">
                                                            <Badge color={p.status === 'paid' ? 'emerald' : p.status === 'overdue' ? 'rose' : p.status === 'cancelled' ? 'slate' : 'amber'}>
                                                                {String(p.status || '').toUpperCase()}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-3 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 rounded-r-[16px] border-r">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <span className="text-sm font-bold text-slate-850 dark:text-white tabular-nums">
                                                                    {currency}{Number(p.amount || 0).toLocaleString('tr-TR')}
                                                                </span>
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {p.invoice_number && p.invoice_number !== '—' && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void openInvoice(p.invoice_number)}
                                                                            className="p-1.5 text-slate-450 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                                            title={t('accounting.viewInvoice')}
                                                                        >
                                                                            <FiDownload size={13} />
                                                                        </button>
                                                                    )}
                                                                    {(p.status === 'pending' || p.status === 'overdue') && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openCollectModal(p, 'orders')}
                                                                            className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                                            title={t('finance.accountingMarkPaid')}
                                                                        >
                                                                            <FiCheckCircle size={13} />
                                                                        </button>
                                                                    )}
                                                                    {p.status === 'pending' && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isBusy}
                                                                            onClick={() =>
                                                                                void runPaymentAction(p.id, () => updatePaymentStatus(p.id, 'overdue'))
                                                                            }
                                                                            className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-40"
                                                                            title={t('accounting.actionMarkOverdue')}
                                                                        >
                                                                            <FiClock size={13} />
                                                                        </button>
                                                                    )}
                                                                    {(p.status === 'pending' || p.status === 'overdue') && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isBusy}
                                                                            onClick={() =>
                                                                                void runPaymentAction(p.id, () => updatePaymentStatus(p.id, 'cancelled'))
                                                                            }
                                                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40"
                                                                            title={t('accounting.actionCancel')}
                                                                        >
                                                                            <FiSlash size={13} />
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        disabled={isBusy}
                                                                        onClick={() =>
                                                                            void runPaymentAction(p.id, () => sendPaymentDueMail(p.id), t('finance.accountingSendMail'))
                                                                        }
                                                                        className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-40"
                                                                        title={t('finance.accountingSendMail')}
                                                                    >
                                                                        <FiMail size={13} />
                                                                    </button>
                                                                    {isSuperAdmin && p.status === 'overdue' && p.tenant_id && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isBusy}
                                                                            onClick={async () => {
                                                                                if (!confirm(t('accounting.suspendConfirm'))) return;
                                                                                await runPaymentAction(p.id, () => suspendTenantForOverdueInvoice(p.id));
                                                                            }}
                                                                            className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40"
                                                                            title="Suspend"
                                                                        >
                                                                            <FiAlertTriangle size={13} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <TableEmptyState colSpan={6} icon={<FiFileText />} message={t('accounting.noData')} />
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View */}
                            <div className="block md:hidden space-y-3 px-4">
                                {paginatedPayments.length > 0 ? (
                                    paginatedPayments.map((p: any) => {
                                        const isBusy = busyId === p.id;
                                        return (
                                            <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-[9px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">#{p.id}</span>
                                                        <span className="text-[10px] font-black text-slate-500 uppercase">{paymentTypeLabel(t, p.payment_type)}</span>
                                                    </div>
                                                    <Badge color={p.status === 'paid' ? 'emerald' : p.status === 'overdue' ? 'rose' : p.status === 'cancelled' ? 'slate' : 'amber'}>
                                                        {String(p.status || '').toUpperCase()}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="font-semibold text-slate-800 dark:text-white text-xs uppercase italic truncate max-w-[180px]">
                                                        {tenantLabel(p)}
                                                    </div>
                                                    <div className="font-bold text-slate-800 dark:text-white text-sm tabular-nums">
                                                        {currency}{Number(p.amount || 0).toLocaleString('tr-TR')}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                    <span>Vade: {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}</span>
                                                    <span>Metot: {p.payment_method || '—'}</span>
                                                </div>
                                                <div className="flex items-center justify-between pt-1">
                                                    <div>
                                                        {p.invoice_number && p.invoice_number !== '—' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => void openInvoice(p.invoice_number)}
                                                                className="text-blue-500 dark:text-blue-400 hover:underline font-semibold text-[10px]"
                                                            >
                                                                Fatura #{p.invoice_number}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {p.invoice_number && p.invoice_number !== '—' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void openInvoice(p.invoice_number)}
                                                                className="p-1.5 text-slate-500 hover:text-blue-500"
                                                            >
                                                                <FiDownload size={14} />
                                                            </button>
                                                        )}
                                                        {(p.status === 'pending' || p.status === 'overdue') && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openCollectModal(p, 'orders')}
                                                                className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg"
                                                            >
                                                                <FiCheckCircle size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <EmptyState icon={<FiFileText />} message={t('accounting.noData')} />
                                )}
                            </div>

                            {/* Pagination Controls */}
                            {totalOrdersPages > 1 && (
                                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 mt-4 rounded-b-2xl">
                                    <div className="text-xs text-slate-500 font-bold">
                                        Toplam {(accountingAllPayments?.rows || []).length} kayıttan {(ordersPage - 1) * itemsPerPage + 1} - {Math.min(ordersPage * itemsPerPage, (accountingAllPayments?.rows || []).length)} arası gösteriliyor
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={ordersPage === 1}
                                            onClick={() => setOrdersPage(prev => Math.max(prev - 1, 1))}
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 disabled:opacity-40 text-xs font-bold text-slate-700 dark:text-slate-300"
                                        >
                                            Önceki
                                        </button>
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 px-2">
                                            Sayfa {ordersPage} / {totalOrdersPages}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={ordersPage === totalOrdersPages}
                                            onClick={() => setOrdersPage(prev => Math.min(prev + 1, totalOrdersPages))}
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 disabled:opacity-40 text-xs font-bold text-slate-700 dark:text-slate-300"
                                        >
                                            Sonraki
                                        </button>
                                    </div>
                                </div>
                            )}
                        </SectionCard>
                    </motion.div>
                )}
                 {sub === 'upcoming' && (
                    <motion.div key="upcoming" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-8">
                        {accountingUpcoming.length === 0 ? (
                            <SectionCard title={t('accounting.subtitleUpcoming')} icon={<FiAlertTriangle className="text-rose-450" />}>
                                <EmptyState icon={<FiCalendar />} message={t('accounting.noData')} />
                            </SectionCard>
                        ) : (
                            <div className="space-y-8">
                                {/* Overdue Payments Section */}
                                {overdueUpcoming.overdue.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 px-1">
                                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                            <h3 className="text-xs font-black uppercase tracking-wider text-rose-500 dark:text-rose-400">
                                                Gecikmiş Abonelik Tahsilatları ({overdueUpcoming.overdue.length})
                                            </h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {overdueUpcoming.overdue.map((p: any) => {
                                                const days = daysUntil(p.due_date);
                                                const isBusy = busyId === p.id;
                                                const overdueDays = days !== null ? Math.abs(days) : 0;
                                                const badgeText = `Gecikti (${overdueDays} gün)`;

                                                return (
                                                    <motion.div
                                                        key={p.id}
                                                        whileHover={{ y: -2 }}
                                                        className="bg-white dark:bg-slate-900 shadow-sm border border-rose-100 dark:border-rose-950/40 rounded-2xl p-5 flex flex-col transition-all relative overflow-hidden"
                                                    >
                                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
                                                        <div className="flex items-start justify-between gap-4 pl-1">
                                                            <div className="min-w-0">
                                                                <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight truncate">
                                                                    {tenantLabel(p)}
                                                                </h4>
                                                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-450 dark:text-slate-500 font-semibold">
                                                                    <span className="font-mono">#{p.id}</span>
                                                                    <span>•</span>
                                                                    <span className="uppercase">{paymentTypeLabel(t, p.payment_type)}</span>
                                                                    <span>•</span>
                                                                    <span className="flex items-center gap-1">
                                                                        <FiCalendar size={10} />
                                                                        Vade: {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 dark:bg-rose-550/10 dark:text-rose-450 uppercase tracking-wide">
                                                                    {badgeText}
                                                                </span>
                                                                <span className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
                                                                    {currency}{Number(p.amount || 0).toLocaleString('tr-TR')}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="mt-5 pt-3.5 border-t border-slate-105 dark:border-slate-800/80 flex items-center justify-between gap-3 pl-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Tahsilat Bekliyor</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openCollectModal(p, 'upcoming')}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 shadow-sm"
                                                                >
                                                                    <FiCheckCircle size={12} />
                                                                    <span>Tahsilat Al</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={isBusy}
                                                                    onClick={async () => {
                                                                        setBusyId(p.id);
                                                                        await sendPaymentDueMail(p.id);
                                                                        await fetchAccountingNotifications();
                                                                        setBusyId(null);
                                                                    }}
                                                                    className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-500 hover:bg-blue-550 hover:text-white rounded-xl transition-all disabled:opacity-40"
                                                                    title="E-posta Gönder"
                                                                >
                                                                    <FiMail size={13} />
                                                                </button>
                                                                {isSuperAdmin && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={isBusy}
                                                                        onClick={async () => {
                                                                            if (!confirm(t('accounting.suspendConfirm'))) return;
                                                                            setBusyId(p.id);
                                                                            await suspendTenantForOverdueInvoice(p.id);
                                                                            await refreshAll();
                                                                            setBusyId(null);
                                                                        }}
                                                                        className="p-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-all disabled:opacity-40"
                                                                        title="Suspend"
                                                                    >
                                                                        <FiAlertTriangle size={13} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Upcoming Payments Section */}
                                {overdueUpcoming.upcoming.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 px-1">
                                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                                            <h3 className="text-xs font-black uppercase tracking-wider text-blue-500 dark:text-blue-455">
                                                Yaklaşan Abonelik Ödemeleri ({overdueUpcoming.upcoming.length})
                                            </h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {overdueUpcoming.upcoming.map((p: any) => {
                                                const days = daysUntil(p.due_date);
                                                const isBusy = busyId === p.id;
                                                let badgeColor = 'bg-emerald-50 text-emerald-750 dark:bg-emerald-500/10 dark:text-emerald-400';
                                                let badgeText = `${days} gün kaldı`;
                                                if (days === 0) {
                                                    badgeColor = 'bg-amber-50 text-amber-750 dark:bg-amber-500/10 dark:text-amber-400';
                                                    badgeText = 'Bugün';
                                                } else if (days !== null && days <= 2) {
                                                    badgeColor = 'bg-amber-50 text-amber-700 dark:bg-amber-550/10 dark:text-amber-400';
                                                }

                                                return (
                                                    <motion.div
                                                        key={p.id}
                                                        whileHover={{ y: -2 }}
                                                        className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800/80 hover:border-blue-500/20 rounded-2xl p-5 flex flex-col transition-all relative overflow-hidden"
                                                    >
                                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
                                                        <div className="flex items-start justify-between gap-4 pl-1">
                                                            <div className="min-w-0">
                                                                <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight truncate">
                                                                    {tenantLabel(p)}
                                                                </h4>
                                                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-450 dark:text-slate-550 font-semibold">
                                                                    <span className="font-mono">#{p.id}</span>
                                                                    <span>•</span>
                                                                    <span className="uppercase">{paymentTypeLabel(t, p.payment_type)}</span>
                                                                    <span>•</span>
                                                                    <span className="flex items-center gap-1">
                                                                        <FiCalendar size={10} />
                                                                        Vade: {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${badgeColor}`}>
                                                                    {badgeText}
                                                                </span>
                                                                <span className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
                                                                    {currency}{Number(p.amount || 0).toLocaleString('tr-TR')}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="mt-5 pt-3.5 border-t border-slate-105 dark:border-slate-800/80 flex items-center justify-between gap-3 pl-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                                <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Beklemede</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openCollectModal(p, 'upcoming')}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 shadow-sm"
                                                                >
                                                                    <FiCheckCircle size={12} />
                                                                    <span>Tahsilat Al</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={isBusy}
                                                                    onClick={async () => {
                                                                        setBusyId(p.id);
                                                                        await sendPaymentDueMail(p.id);
                                                                        await fetchAccountingNotifications();
                                                                        setBusyId(null);
                                                                    }}
                                                                    className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-500 hover:bg-blue-550 hover:text-white rounded-xl transition-all disabled:opacity-40"
                                                                    title="E-posta Gönder"
                                                                >
                                                                    <FiMail size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}

                {sub === 'installments' && (
                    <motion.div key="installments" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard
                            title={t('accounting.subtitleInstallments')}
                            icon={<FiClock className="text-amber-400" />}
                            action={
                                <div className="flex bg-white dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-slate-800">
                                    {['', 'pending', 'overdue', 'paid'].map((f) => (
                                        <button
                                            key={f || 'all'}
                                            type="button"
                                            onClick={() => setInstFilter(f)}
                                            className={`px-3.5 py-1.5 rounded-[14px] text-[9px] font-black uppercase transition-all ${
                                                instFilter === f ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                                            }`}
                                        >
                                            {f === '' ? t('accounting.filterAll') : f.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="overflow-x-auto -mx-6 custom-scrollbar hidden md:block">
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
                                        {accountingInstallments.length > 0 ? (
                                            accountingInstallments.map((p: any) => {
                                                const days = daysUntil(p.due_date);
                                                return (
                                                    <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 first:border-l rounded-l-[24px] font-black text-slate-800 dark:text-white text-[13px] uppercase italic truncate max-w-[200px]">
                                                            {tenantLabel(p)}
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-[10px] font-black text-slate-500 uppercase">
                                                            {paymentTypeLabel(t, p.payment_type)}
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-right font-black tabular-nums">
                                                            {currency}{Number(p.amount || 0).toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-center">
                                                            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase border ${statusColor[p.status] || statusColor.pending}`}>
                                                                {String(p.status || '').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-center text-[11px] font-bold text-slate-500">
                                                            {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}
                                                            {days !== null && p.status !== 'paid' && (
                                                                <div className={`text-[8px] font-black uppercase mt-1 ${days < 0 ? 'text-rose-400' : days <= 2 ? 'text-amber-400' : 'text-blue-400'}`}>
                                                                    {days < 0 ? 'OVERDUE' : `${days}d`}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 rounded-r-[24px] border-r text-right">
                                                            <div className="flex justify-end flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openCollectModal(p, 'installments')}
                                                                    className="p-2.5 text-emerald-400 hover:bg-emerald-500/10 rounded-2xl"
                                                                    title={t('finance.accountingMarkPaid')}
                                                                >
                                                                    <FiCheckCircle size={18} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void runPaymentAction(p.id, () => sendPaymentDueMail(p.id))}
                                                                    className="p-2.5 text-blue-400 hover:bg-blue-500/10 rounded-2xl"
                                                                >
                                                                    <FiMail size={18} />
                                                                </button>
                                                                {isSuperAdmin && p.status === 'overdue' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={async () => {
                                                                            if (!confirm(t('accounting.suspendConfirm'))) return;
                                                                            await runPaymentAction(p.id, () => suspendTenantForOverdueInvoice(p.id));
                                                                        }}
                                                                        className="p-2.5 text-rose-400 hover:bg-rose-500/10 rounded-2xl"
                                                                    >
                                                                        <FiAlertTriangle size={18} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <TableEmptyState colSpan={6} icon={<FiClock />} message={t('accounting.noData')} />
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Compact Cards */}
                            <div className="block md:hidden space-y-3 px-4">
                                {accountingInstallments.length > 0 ? (
                                    accountingInstallments.map((p: any) => {
                                        const days = daysUntil(p.due_date);
                                        return (
                                            <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase">{paymentTypeLabel(t, p.payment_type)}</span>
                                                    <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase border ${statusColor[p.status] || statusColor.pending}`}>
                                                        {String(p.status || '').toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="font-black text-slate-800 dark:text-white text-xs uppercase italic truncate max-w-[180px]">
                                                        {tenantLabel(p)}
                                                    </div>
                                                    <div className="font-black text-slate-800 dark:text-white text-sm tabular-nums">
                                                        {currency}{Number(p.amount || 0).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                    <div>
                                                        <span>Vade: {p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—'}</span>
                                                        {days !== null && p.status !== 'paid' && (
                                                            <span className={`ml-2 text-[8px] font-black uppercase inline-block px-1.5 py-0.5 rounded ${days < 0 ? 'bg-rose-500/10 text-rose-400' : days <= 2 ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                                                {days < 0 ? 'OVERDUE' : `${days}d`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => openCollectModal(p, 'installments')}
                                                            className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                                                        >
                                                            <FiCheckCircle size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void runPaymentAction(p.id, () => sendPaymentDueMail(p.id))}
                                                            className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"
                                                        >
                                                            <FiMail size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <EmptyState icon={<FiClock />} message={t('accounting.noData')} />
                                )}
                            </div>
                        </SectionCard>
                    </motion.div>
                )}

                {sub === 'notifications' && (
                    <motion.div key="notifications" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard title={t('accounting.subtitleNotifications')} icon={<FiBell className="text-violet-400" />}>
                            <div className="overflow-x-auto -mx-6 custom-scrollbar hidden md:block">
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
                                        {accountingNotifications.length > 0 ? (
                                            accountingNotifications.map((n: any, i: number) => {
                                                const kindColor = n.kind === 'mail_sent' ? 'blue' : n.kind === 'suspension' ? 'rose' : 'slate';
                                                return (
                                                    <tr key={n.id ?? i} className="group hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-5 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 first:border-l rounded-l-[24px] font-black text-slate-800 dark:text-white text-[12px] uppercase italic truncate max-w-[180px]">
                                                            {n.tenant_name || n.tenant_id}
                                                        </td>
                                                        <td className="px-6 py-5 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0">
                                                            <Badge color={kindColor as 'blue' | 'rose' | 'slate'}>{String(n.kind || '').toUpperCase()}</Badge>
                                                        </td>
                                                        <td className="px-6 py-5 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-slate-500 text-[11px] font-bold whitespace-pre-line">
                                                            {n.message}
                                                        </td>
                                                        <td className="px-6 py-5 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 rounded-r-[24px] border-r text-right text-[10px] font-black text-slate-600 tabular-nums">
                                                            {n.created_at ? new Date(n.created_at).toLocaleString('tr-TR') : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <TableEmptyState colSpan={4} icon={<FiBell />} message={t('accounting.noData')} />
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Compact Cards */}
                            <div className="block md:hidden space-y-3 px-4">
                                {accountingNotifications.length > 0 ? (
                                    accountingNotifications.map((n: any, i: number) => {
                                        const kindColor = n.kind === 'mail_sent' ? 'blue' : n.kind === 'suspension' ? 'rose' : 'slate';
                                        return (
                                            <div key={n.id ?? i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-black text-slate-800 dark:text-white text-xs uppercase italic truncate max-w-[180px]">
                                                        {n.tenant_name || n.tenant_id}
                                                    </div>
                                                    <Badge color={kindColor as 'blue' | 'rose' | 'slate'}>{String(n.kind || '').toUpperCase()}</Badge>
                                                </div>
                                                <div className="text-slate-500 text-[11px] font-bold whitespace-pre-line bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl">
                                                    {n.message}
                                                </div>
                                                <div className="text-right text-[9px] font-black text-slate-500">
                                                    {n.created_at ? new Date(n.created_at).toLocaleString('tr-TR') : '—'}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <EmptyState icon={<FiBell />} message={t('accounting.noData')} />
                                )}
                            </div>
                        </SectionCard>
                    </motion.div>
                )}

                {sub === 'invoices' && (
                    <motion.div key="invoices" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                        <SectionCard
                            title={t('accounting.subtitleInvoices')}
                            icon={<FiFileText className="text-cyan-400" />}
                            action={
                                <div className="flex flex-wrap gap-4 items-center">
                                    <select
                                        value={invFilterStatus}
                                        onChange={(e) => setInvFilterStatus(e.target.value)}
                                        className="bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white text-[10px] font-black uppercase rounded-2xl px-5 py-3 outline-none"
                                    >
                                        <option value="">{t('accounting.filterAll')}</option>
                                        <option value="paid">PAID</option>
                                        <option value="draft">DRAFT</option>
                                    </select>
                                    <div className="relative min-w-[200px]">
                                        <FiSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                                        <input
                                            value={invFilterTenant}
                                            onChange={(e) => setInvFilterTenant(e.target.value)}
                                            className="bg-white/5 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-[11px] font-black text-slate-800 dark:text-white outline-none w-full"
                                            placeholder={t('accounting.filterTenantPlaceholder')}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-900/60 rounded-2xl p-1 border border-slate-200 dark:border-slate-800">
                                        <input type="date" value={invFilterFrom} onChange={(e) => setInvFilterFrom(e.target.value)} className="bg-transparent text-[10px] font-black px-3 py-2 outline-none text-slate-800 dark:text-white" />
                                        <span className="text-slate-600">/</span>
                                        <input type="date" value={invFilterTo} onChange={(e) => setInvFilterTo(e.target.value)} className="bg-transparent text-[10px] font-black px-3 py-2 outline-none text-slate-800 dark:text-white" />
                                    </div>
                                </div>
                            }
                        >
                            <div className="overflow-x-auto -mx-6 custom-scrollbar hidden md:block">
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
                                        {invoices.length > 0 ? (
                                            invoices.map((inv: any) => (
                                                <tr key={inv.id} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 first:border-l rounded-l-[24px]">
                                                        <button type="button" onClick={() => void openInvoice(inv.invoice_number)} className="text-blue-400 hover:underline font-black uppercase italic text-left">
                                                            <FiFileText className="inline mr-2 opacity-40" /> #{inv.invoice_number}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 font-black text-slate-800 dark:text-white text-xs uppercase truncate max-w-[150px]">
                                                        {inv.tenant_name || inv.tenant_id}
                                                    </td>
                                                    <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-right font-black tabular-nums">
                                                        {currency}{Number(inv.total || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-5 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-center">
                                                        <Badge color={inv.status === 'paid' ? 'emerald' : inv.status === 'overdue' ? 'rose' : 'amber'}>{String(inv.status || '').toUpperCase()}</Badge>
                                                    </td>
                                                    <td className="px-6 py-5 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 rounded-r-[24px] border-r text-right text-[10px] font-black text-slate-600">
                                                        {inv.created_at ? new Date(inv.created_at).toLocaleDateString('tr-TR') : '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <TableEmptyState colSpan={5} icon={<FiFileText />} message={t('accounting.noData')} />
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Compact Cards */}
                            <div className="block md:hidden space-y-3 px-4">
                                {invoices.length > 0 ? (
                                    invoices.map((inv: any) => (
                                        <div key={inv.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <button type="button" onClick={() => void openInvoice(inv.invoice_number)} className="text-blue-400 hover:underline font-black uppercase italic text-xs">
                                                    <FiFileText className="inline mr-1 opacity-50" /> #{inv.invoice_number}
                                                </button>
                                                <Badge color={inv.status === 'paid' ? 'emerald' : inv.status === 'overdue' ? 'rose' : 'amber'}>{String(inv.status || '').toUpperCase()}</Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="font-black text-slate-800 dark:text-white text-xs uppercase italic truncate max-w-[180px]">
                                                    {inv.tenant_name || inv.tenant_id}
                                                </div>
                                                <div className="font-black text-slate-800 dark:text-white text-sm tabular-nums">
                                                    {currency}{Number(inv.total || 0).toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="text-right text-[9px] font-black text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                Tarih: {inv.created_at ? new Date(inv.created_at).toLocaleDateString('tr-TR') : '—'}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <EmptyState icon={<FiFileText />} message={t('accounting.noData')} />
                                )}
                            </div>
                        </SectionCard>
                    </motion.div>
                )}

                {sub === 'expenses' && (
                    <motion.div key="expenses" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4 sm:px-0">
                            <StatCard
                                label={t('accounting.expensesTotal') || 'Toplam Gider'}
                                value={`${currency}${Number(totalExpense || 0).toLocaleString()}`}
                                icon={<FiLayers />}
                                color="rose"
                                sub="Sistem"
                            />
                            <StatCard
                                label={t('accounting.netProfit') || 'Net Kâr'}
                                value={`${currency}${Number((financialSummary?.totalRevenue || 0) - (totalExpense || 0)).toLocaleString()}`}
                                icon={<FiZap />}
                                color="emerald"
                                sub="Gelir − Gider"
                            />
                        </div>
                        <SectionCard title={t('accounting.expensesList') || 'Sistem Giderleri'} icon={<FiDollarSign className="text-blue-400" />}>
                            <div className="flex flex-col md:flex-row gap-6 p-2">
                                <div className="w-full md:w-1/3 space-y-4 bg-white/[0.02] p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
                                    <h3 className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-widest mb-4">Yeni Gider</h3>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Tutar ({currency})</label>
                                        <input
                                            type="number"
                                            value={expenseAmount}
                                            onChange={(e) => setExpenseAmount(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white outline-none font-bold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Kategori</label>
                                        <select
                                            value={expenseCategory}
                                            onChange={(e) => setExpenseCategory(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-white"
                                        >
                                            <option value="server">Sunucu / Altyapı</option>
                                            <option value="sms">SMS</option>
                                            <option value="mail">E-Posta</option>
                                            <option value="marketing">Pazarlama</option>
                                            <option value="other">Diğer</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Açıklama</label>
                                        <input
                                            type="text"
                                            value={expenseDesc}
                                            onChange={(e) => setExpenseDesc(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-bold"
                                            placeholder="…"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!expenseAmount) return;
                                            setBusyId(-1);
                                            await createExpense({ amount: expenseAmount, category: expenseCategory, description: expenseDesc });
                                            setExpenseAmount('');
                                            setExpenseDesc('');
                                            setBusyId(null);
                                        }}
                                        disabled={busyId === -1 || !expenseAmount}
                                        className="w-full py-4 mt-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50"
                                    >
                                        Kaydet
                                    </button>
                                </div>
                                <div className="w-full md:w-2/3 overflow-x-auto custom-scrollbar hidden md:block">
                                    <table className="w-full text-left border-separate border-spacing-y-2">
                                        <thead>
                                            <tr className="text-slate-500 text-[9px] font-black uppercase opacity-60">
                                                <th className="px-6 py-4">Tarih</th>
                                                <th className="px-6 py-4">Kategori</th>
                                                <th className="px-6 py-4">Açıklama</th>
                                                <th className="px-6 py-4 text-right">Tutar</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expenses && expenses.length > 0 ? (
                                                expenses.map((e: any) => (
                                                    <tr key={e.id} className="group hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 first:border-l rounded-l-[24px] text-xs font-bold text-slate-500">
                                                            {e.createdAt ? new Date(e.createdAt).toLocaleDateString('tr-TR') : '—'}
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0">
                                                            <Badge color="slate">{String(e.category || '').toUpperCase()}</Badge>
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 text-sm font-bold text-slate-800 dark:text-white">
                                                            {e.description}
                                                        </td>
                                                        <td className="px-6 py-4 bg-white/[0.02] border-y border-slate-200 dark:border-slate-800 border-l-0 rounded-r-[24px] border-r text-right font-black text-rose-400 tabular-nums">
                                                            -{currency}{Number(e.amount).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <TableEmptyState colSpan={4} icon={<FiLayers />} message="Henüz gider yok." />
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Compact Cards */}
                                <div className="w-full md:hidden space-y-3 px-2">
                                    {expenses && expenses.length > 0 ? (
                                        expenses.map((e: any) => (
                                            <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <Badge color="slate">{String(e.category || '').toUpperCase()}</Badge>
                                                    <span className="font-black text-rose-400 text-sm tabular-nums">
                                                        -{currency}{Number(e.amount).toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="text-sm font-bold text-slate-850 dark:text-white">
                                                    {e.description}
                                                </div>
                                                <div className="text-right text-[9px] font-black text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                    Tarih: {e.createdAt ? new Date(e.createdAt).toLocaleDateString('tr-TR') : '—'}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <EmptyState icon={<FiLayers />} message="Henüz gider yok." />
                                    )}
                                </div>
                            </div>
                        </SectionCard>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {manualOpen && (
                    <Modal show={manualOpen} onClose={() => !manualBusy && setManualOpen(false)} title={t('accounting.manualTitle')} maxWidth="max-w-lg">
                        <div className="space-y-4">
                            <SelectGroup
                                label={t('accounting.manualTenant')}
                                value={manualTenantId}
                                onChange={setManualTenantId}
                                options={[
                                    { label: '—', value: '' },
                                    ...sortedTenants.map((tn) => ({ label: `${tn.name} (${tn.id})`, value: String(tn.id) })),
                                ]}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">{t('accounting.manualAmount')}</label>
                                    <input
                                        type="number"
                                        value={manualAmount}
                                        onChange={(e) => setManualAmount(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">{t('accounting.manualDueDays')}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={manualDueDays}
                                        onChange={(e) => setManualDueDays(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                                    />
                                </div>
                            </div>
                            <SelectGroup
                                label={t('accounting.filterPaymentType')}
                                value={manualType}
                                onChange={setManualType}
                                options={paymentTypeOptions.map((o) => ({ label: o.label, value: o.value }))}
                            />
                            <SelectGroup
                                label={t('accounting.filterPaymentMethod')}
                                value={manualMethod}
                                onChange={setManualMethod}
                                options={manualMethodOptions.map((o) => ({ label: o.label, value: o.value }))}
                            />
                            <SelectGroup
                                label={t('accounting.manualStatus')}
                                value={manualInitialStatus}
                                onChange={(v) => setManualInitialStatus(v as 'pending' | 'paid')}
                                options={[
                                    { label: t('accounting.filterPending'), value: 'pending' },
                                    { label: t('accounting.filterPaid'), value: 'paid' },
                                ]}
                            />
                            <div>
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">{t('accounting.manualDesc')}</label>
                                <input
                                    value={manualDesc}
                                    onChange={(e) => setManualDesc(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={manualBusy}
                                onClick={() => void submitManualPayment()}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50"
                            >
                                {t('accounting.manualCreate')}
                            </button>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>

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
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">…</span>
                            </div>
                        ) : invoiceModal ? (
                            <div className="space-y-10">
                                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 w-fit rounded-3xl shadow-sm">
                                            <FiZap size={32} className="text-white drop-shadow-lg" />
                                        </div>
                                        <div>
                                            <h4 className="text-3xl font-black text-slate-800 dark:text-white italic tracking-tighter">
                                                NEXTPOS <span className="text-blue-500">PRO</span>
                                            </h4>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Invoice</p>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-4">
                                        <div className="p-6 bg-white/[0.03] border border-slate-200 dark:border-slate-800 rounded-2xl inline-block">
                                            <div className="text-[10px] font-black text-slate-500 uppercase mb-1">{t('accounting.colInvoice')}</div>
                                            <div className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">#{invoiceModal.invoice_number}</div>
                                            <div className={`mt-2 px-3 py-1 rounded-xl text-[9px] font-black uppercase inline-block ${statusColor[invoiceModal.status] || statusColor.pending}`}>
                                                {String(invoiceModal.status || '').toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-black text-slate-600 uppercase">Issued</div>
                                        <div className="text-sm font-bold text-slate-600 dark:text-slate-400">
                                            {invoiceModal.created_at ? new Date(invoiceModal.created_at).toLocaleString('tr-TR') : ''}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                                                <FiUsers size={14} />
                                            </div>
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">{t('accounting.invoiceTo')}</span>
                                        </div>
                                        <div className="text-xl font-black text-slate-800 dark:text-white uppercase italic">{invoiceModal.company_title || invoiceModal.tenant_name || '—'}</div>
                                        <div className="space-y-1 text-slate-500 text-[11px] font-bold">
                                            {invoiceModal.tenant_address && <p>{invoiceModal.tenant_address}</p>}
                                            {invoiceModal.authorized_person && (
                                                <p className="uppercase tracking-widest mt-2">
                                                    {t('accounting.fieldAuthorized')}: {invoiceModal.authorized_person}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl">
                                                <FiLayers size={14} />
                                            </div>
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t('accounting.fieldContact')}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                            <div>
                                                <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">Email</span>
                                                {invoiceModal.contact_email || '—'}
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">{t('accounting.fieldTaxNumber')}</span>
                                                {invoiceModal.tax_number || '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-[9px] font-black text-slate-500 uppercase">
                                                <th className="px-8 py-5">{t('accounting.invoiceItem')}</th>
                                                <th className="px-8 py-5 text-center">{t('accounting.invoiceQty')}</th>
                                                <th className="px-8 py-5 text-right">{t('accounting.invoiceUnitPrice')}</th>
                                                <th className="px-8 py-5 text-right">{t('accounting.colAmount')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {(Array.isArray(invoiceModal.items) ? invoiceModal.items : []).map((item: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td className="px-8 py-5 text-sm font-black text-slate-800 dark:text-white">{item.description}</td>
                                                    <td className="px-8 py-5 text-center text-xs font-bold text-slate-500">{item.quantity}</td>
                                                    <td className="px-8 py-5 text-right text-xs font-bold tabular-nums text-slate-500">
                                                        {currency}
                                                        {Number(item.unit_price || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-8 py-5 text-right text-base font-black tabular-nums text-slate-800 dark:text-white">
                                                        {currency}
                                                        {Number(item.total || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex flex-col md:flex-row justify-between items-end gap-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const w = window.open('', '_blank');
                                            if (w) {
                                                w.document.write(buildInvoiceHtml(invoiceModal, currency));
                                                w.document.close();
                                            }
                                        }}
                                        className="px-8 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase text-slate-800 dark:text-white"
                                    >
                                        <FiPrinter size={16} /> {t('accounting.print')}
                                    </button>
                                    <div className="w-full md:w-80 space-y-3 p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
                                        <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                                            <span>Subtotal</span>
                                            <span className="tabular-nums">
                                                {currency}
                                                {Number(invoiceModal.subtotal || 0).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                                            <span>Tax ({invoiceModal.tax_rate || 19}%)</span>
                                            <span className="tabular-nums">
                                                {currency}
                                                {Number(invoiceModal.tax_amount || 0).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                                            <span className="text-sm font-black uppercase">{t('accounting.invoiceTotal')}</span>
                                            <span className="text-3xl font-black tabular-nums text-slate-800 dark:text-white">
                                                {currency}
                                                {Number(invoiceModal.total || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </Modal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {collectModal.isOpen && (
                    <Modal
                        show={collectModal.isOpen}
                        onClose={() => !collectBusy && setCollectModal(prev => ({ ...prev, isOpen: false }))}
                        title="Tahsilat Al"
                        maxWidth="max-w-md"
                    >
                        <div className="space-y-5">
                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Ödeme Yapacak Bayi / Müşteri
                                </span>
                                <div className="text-base font-black text-slate-800 dark:text-white uppercase italic truncate">
                                    {tenantLabel(collectModal.payment || {})}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 mt-1">
                                    Kayıt Türü: <span className="text-blue-500 font-bold uppercase">{collectModal.payment?.payment_type ? paymentTypeLabel(t, collectModal.payment.payment_type) : 'Abonelik'}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                        Tutar ({currency})
                                    </label>
                                    <input
                                        type="number"
                                        value={collectModal.amount}
                                        onChange={(e) => setCollectModal(prev => ({ ...prev, amount: e.target.value }))}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                        Ödeme Yöntemi
                                    </label>
                                    <select
                                        value={collectModal.paymentMethod}
                                        onChange={(e) => setCollectModal(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-white appearance-none"
                                    >
                                        <option value="bank_transfer">Banka / Havale</option>
                                        <option value="card">Kredi Kartı</option>
                                        <option value="stripe">Stripe</option>
                                        <option value="cash">Nakit</option>
                                    </select>
                                </div>
                            </div>

                            <AnimatePresence>
                                {(collectModal.paymentMethod === 'card' || collectModal.paymentMethod === 'stripe') && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }} 
                                        animate={{ opacity: 1, height: 'auto' }} 
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="overflow-hidden space-y-4"
                                    >
                                        {/* 3D Virtual Card Container */}
                                        <div className="flex justify-center py-2" style={{ perspective: '1000px' }}>
                                            <motion.div
                                                animate={{ rotateY: isCardFlipped ? 180 : 0 }}
                                                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                                style={{ transformStyle: 'preserve-3d' }}
                                                className="w-full max-w-[320px] aspect-[1.586/1] rounded-2xl relative shadow-2xl text-white cursor-pointer select-none"
                                            >
                                                {/* CARD FRONT */}
                                                <div 
                                                    style={{ backfaceVisibility: 'hidden' }}
                                                    className="absolute inset-0 w-full h-full p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-white/10 flex flex-col justify-between shadow-xl"
                                                >
                                                    <div className="flex justify-between items-start">
                                                        {/* Card Chip */}
                                                        <div className="w-10 h-7 rounded bg-gradient-to-r from-amber-400 to-yellow-300 relative overflow-hidden flex items-center justify-center border border-amber-500/20 shadow-sm">
                                                            <div className="absolute inset-0 grid grid-cols-3 gap-0.5 opacity-30">
                                                                <div className="border-r border-b border-black"></div>
                                                                <div className="border-r border-b border-black"></div>
                                                                <div className="border-b border-black"></div>
                                                                <div className="border-r border-black"></div>
                                                                <div className="border-r border-black"></div>
                                                                <div></div>
                                                            </div>
                                                            <div className="w-3 h-3 rounded-sm bg-yellow-600/30 border border-yellow-700/20"></div>
                                                        </div>

                                                        {/* Card Brand Logo */}
                                                        <div className="h-6 flex items-center">
                                                            {getCardType(cardNo) === 'visa' ? (
                                                                <span className="text-xl font-black italic tracking-tighter text-blue-400 select-none">
                                                                    VISA
                                                                </span>
                                                            ) : getCardType(cardNo) === 'mastercard' ? (
                                                                <div className="flex -space-x-2.5">
                                                                    <div className="w-6 h-6 rounded-full bg-rose-500"></div>
                                                                    <div className="w-6 h-6 rounded-full bg-amber-500 opacity-85"></div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] font-black tracking-widest text-slate-400 select-none uppercase">
                                                                    NEXTPAY
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Card Number */}
                                                    <div className="text-lg font-mono tracking-widest text-center py-2 select-all font-bold">
                                                        {cardNo || '•••• •••• •••• ••••'}
                                                    </div>

                                                    <div className="flex justify-between items-end">
                                                        <div className="min-w-0 flex-1 pr-2">
                                                            <span className="text-[7px] text-slate-400 uppercase tracking-wider block font-medium">
                                                                KART SAHİBİ
                                                            </span>
                                                            <span className="text-xs font-bold tracking-wide uppercase truncate block leading-tight">
                                                                {cardName || 'AD SOYAD'}
                                                            </span>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <span className="text-[7px] text-slate-400 uppercase tracking-wider block font-medium">
                                                                GEÇERLİLİK
                                                            </span>
                                                            <span className="text-xs font-mono font-bold tracking-wide block">
                                                                {cardExpiry || 'AA/YY'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* CARD BACK */}
                                                <div 
                                                    style={{ 
                                                        backfaceVisibility: 'hidden',
                                                        transform: 'rotateY(180deg)'
                                                    }}
                                                    className="absolute inset-0 w-full h-full rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 flex flex-col justify-between py-5 shadow-xl"
                                                >
                                                    <div className="w-full h-10 bg-slate-950 border-y border-black"></div>

                                                    <div className="px-5">
                                                        <div className="flex items-center justify-end">
                                                            <span className="text-[6px] text-slate-400 uppercase tracking-wider mr-2 font-medium">
                                                                CVV KODU
                                                            </span>
                                                            <div className="w-14 h-8 bg-white text-slate-900 font-mono font-bold italic flex items-center justify-center rounded px-2 text-sm select-all">
                                                                {cardCvv || '•••'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="px-5 text-[6px] text-slate-500 font-medium leading-normal tracking-wide">
                                                        Bu kart NextPOS SaaS Admin paneli üzerinden tahsilat işlemini doğrulamak amacıyla kullanılan sanal tahsilat arayüzüdür.
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </div>

                                        {/* Form Fields */}
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                                    Kart Numarası
                                                </label>
                                                <input
                                                    type="text"
                                                    value={cardNo}
                                                    onChange={(e) => handleCardNoChange(e.target.value)}
                                                    onFocus={() => setIsCardFlipped(false)}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide"
                                                    placeholder="•••• •••• •••• ••••"
                                                    maxLength={19}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                                    Kart Sahibi
                                                </label>
                                                <input
                                                    type="text"
                                                    value={cardName}
                                                    onChange={(e) => setCardName(e.target.value)}
                                                    onFocus={() => setIsCardFlipped(false)}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold uppercase"
                                                    placeholder="AD SOYAD"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                                        Son Kullanma Tarihi
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={cardExpiry}
                                                        onChange={(e) => handleExpiryChange(e.target.value)}
                                                        onFocus={() => setIsCardFlipped(false)}
                                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                                                        placeholder="AA/YY"
                                                        maxLength={5}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                                        Güvenlik Kodu (CVV)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={cardCvv}
                                                        onChange={(e) => handleCvvChange(e.target.value)}
                                                        onFocus={() => setIsCardFlipped(true)}
                                                        onBlur={() => setIsCardFlipped(false)}
                                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                                                        placeholder="•••"
                                                        maxLength={3}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {collectModal.source === 'upcoming' && (
                                <SelectGroup
                                    label="Faturalandırma Periyodu"
                                    value={collectModal.billingCycle || 'monthly'}
                                    onChange={(val) => setCollectModal(prev => ({ ...prev, billingCycle: val as 'monthly' | 'yearly' }))}
                                    options={[
                                        { label: 'Aylık', value: 'monthly' },
                                        { label: 'Yıllık', value: 'yearly' },
                                    ]}
                                />
                            )}

                            <div>
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                                    Açıklama / Notlar
                                </label>
                                <textarea
                                    value={collectModal.notes}
                                    onChange={(e) => setCollectModal(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-white h-24 resize-none focus:outline-none focus:border-blue-500/50"
                                    placeholder="Tahsilata dair not veya açıklama ekleyin..."
                                />
                            </div>

                            <div className="flex gap-3 pt-3">
                                <button
                                    type="button"
                                    disabled={collectBusy}
                                    onClick={() => setCollectModal(prev => ({ ...prev, isOpen: false }))}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-40"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="button"
                                    disabled={collectBusy}
                                    onClick={submitCollect}
                                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
                                >
                                    {collectBusy ? (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <FiCheckCircle size={14} />
                                    )}
                                    <span>Tahsilatı Kaydet</span>
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

function TableEmptyState({ colSpan, icon, message }: { colSpan: number; icon: React.ReactElement; message: string }) {
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
    const rows = items
        .map(
            (it: any) => `
        <tr>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;font-weight:bold">${it.description || ''}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:center">${it.quantity}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:right">${currency}${Number(it.unit_price || 0).toLocaleString()}</td>
            <td style="padding:15px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${currency}${Number(it.total || 0).toLocaleString()}</td>
        </tr>
    `,
        )
        .join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
    <style>
        body{font-family:'Inter',system-ui,sans-serif;max-width:850px;margin:50px auto;color:#1e293b;padding:40px;border:1px solid #f1f5f9;border-radius:16px}
        .header{display:flex;justify-content:space-between;margin-bottom:50px}
        .logo{font-size:28px;font-weight:900;font-style:italic;color:#0f172a}
        .logo span{color:#2563eb}
        .inv-details{text-align:right}
        .inv-details h1{font-size:40px;font-weight:900;margin:0;color:#0f172a}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:50px}
        .box{background:#f8fafc;padding:25px;border-radius:20px}
        .box-label{font-size:10px;font-weight:900;text-transform:uppercase;color:#94a3b8;letter-spacing:2px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;margin:40px 0}
        th{background:#f8fafc;padding:15px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:900;color:#64748b}
        .totals{margin-left:auto;width:300px;background:#0f172a;color:#fff;padding:30px;border-radius:24px}
        .total-row{display:flex;justify-content:space-between;margin-bottom:10px;font-size:12px;opacity:0.8}
        .grand-total{display:flex;justify-content:space-between;margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;font-size:24px;font-weight:900}
        @media print{body{margin:0;border:none}}
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
            <div class="box-label">Account</div>
            <div style="font-size:14px;font-weight:bold;display:grid;gap:5px">
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
