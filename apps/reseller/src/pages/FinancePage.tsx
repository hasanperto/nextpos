import { useEffect, useMemo, useState } from 'react';
import { FiDollarSign, FiClock, FiCreditCard, FiPackage, FiTrendingUp, FiPieChart, FiMail, FiCheckCircle, FiDownload, FiInfo, FiList, FiBriefcase, FiGlobe, FiCopy, FiXCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { StatCard, Modal } from '../components/Shared.tsx';

type PaymentRow = {
    id: number;
    tenant_name?: string;
    payment_type?: string;
    payment_method?: string;
    amount: number | string;
    currency?: string;
    status: 'pending' | 'paid' | 'overdue' | 'cancelled' | string;
    due_date?: string | null;
    paid_at?: string | null;
    created_at?: string;
    description?: string;
    invoice_number?: string | null;
    cadence_key?: string;
};

type InvoiceRow = {
    invoice_number?: string;
    tenant_name?: string;
    total?: number | string;
    status?: string;
    created_at?: string;
};

type PaymentSummary = {
    total_count?: number;
    total_paid?: number;
    total_pending?: number;
    total_overdue?: number;
    paid_count?: number;
    pending_count?: number;
    overdue_count?: number;
};

type PaymentDetailPayload = {
    payment: {
        id: number;
        tenant_id?: string | null;
        tenant_name?: string | null;
        amount?: number | null;
        currency?: string | null;
        payment_type?: string | null;
        payment_method?: string | null;
        status?: string | null;
        description?: string | null;
        due_date?: string | null;
        paid_at?: string | null;
        created_at?: string | null;
        invoice_number?: string | null;
        cadence_key?: string;
    };
    tenant_billing: {
        plan_code?: string | null;
        billing_cycle?: string | null;
        setup_fee_total?: number | null;
        monthly_recurring_total?: number | null;
        yearly_prepay_total?: number | null;
        next_payment_due?: string | null;
        payment_current?: boolean | null;
    } | null;
    tenant_contact: Record<string, unknown>;
    module_lines: Array<Record<string, unknown>>;
    invoice: Record<string, unknown> | null;
};

function cadenceLabel(t: (k: string) => string, key?: string) {
    if (!key) return '—';
    const k = `finance.cadence.${key}`;
    const lbl = t(k);
    return lbl === k ? key : lbl;
}

function cadenceExplain(t: (k: string) => string, key?: string) {
    if (!key) return '';
    const k = `finance.cadenceExplain.${key}`;
    const lbl = t(k);
    return lbl === k ? '' : lbl;
}

function paymentStatusLabel(t: (k: string) => string, status?: string | null) {
    if (!status) return '—';
    const key = String(status).trim().toLowerCase();
    const k = `finance.status.${key}`;
    const lbl = t(k);
    return lbl === k ? status : lbl;
}

function paymentStatusClass(status?: string | null) {
    const key = String(status || '').toLowerCase();
    if (key === 'paid') return 'bg-emerald-500/10 text-emerald-400';
    if (key === 'overdue') return 'bg-rose-500/10 text-rose-400';
    if (key === 'pending' || key === 'awaiting_card') return 'bg-amber-500/10 text-amber-300';
    if (key === 'cancelled' || key === 'checkout_failed') return 'bg-slate-500/10 text-slate-400';
    return 'bg-slate-500/10 text-slate-400';
}

function cleanPaymentDescription(desc?: string | null) {
    const raw = String(desc ?? '');
    const idx = raw.indexOf('@@ROLLBACK@@');
    return idx >= 0 ? raw.slice(0, idx).trim() : raw;
}

function isLicenseUpgradePayment(paymentType?: string | null) {
    return String(paymentType || '').toLowerCase() === 'license_upgrade';
}

function canCancelLicenseUpgrade(status?: string | null) {
    const key = String(status || '').toLowerCase();
    return key === 'pending' || key === 'awaiting_card' || key === 'checkout_failed' || key === 'cancelled';
}

export function FinancePage() {
    const lang = useResellerStore(s => s.lang);
    const financeSummary = useResellerStore(s => s.financeSummary);
    const fetchFinanceSummary = useResellerStore(s => s.fetchFinanceSummary);
    const fetchStats = useResellerStore(s => s.fetchStats);
    const admin = useResellerStore(s => s.admin);
    const token = useResellerStore(s => s.token);
    const payTenantInvoiceWithWallet = useResellerStore(s => s.payTenantInvoiceWithWallet);
    const fetchCheckoutLinkForTenant = useResellerStore(s => s.fetchCheckoutLinkForTenant);
    const cancelPlanPurchase = useResellerStore(s => s.cancelPlanPurchase);
    const t = (k: string) => messages[lang]?.[k] || messages['de']?.[k] || messages['en']?.[k] || messages['tr']?.[k] || k;
    const tf = (k: string, vars: Record<string, string | number>) => {
        let s = t(k);
        for (const [key, val] of Object.entries(vars)) {
            s = s.replaceAll(`{${key}}`, String(val));
        }
        return s;
    };
    const [status, setStatus] = useState<string>('all');
    const [type, setType] = useState<string>('all');
    const [method, setMethod] = useState<string>('all');
    const [tenant, setTenant] = useState<string>('');
    const [from, setFrom] = useState<string>('');
    const [to, setTo] = useState<string>('');
    const [rows, setRows] = useState<PaymentRow[]>([]);
    const [summary, setSummary] = useState<PaymentSummary>({});
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    
    // Payment action modal states
    const [selectedInvoice, setSelectedInvoice] = useState<PaymentRow | null>(null);
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payLoading, setPayLoading] = useState(false);
    const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
    const [generatedUrlForId, setGeneratedUrlForId] = useState<number | null>(null);
    
    // Withdrawal states
    const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer');

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState<PaymentDetailPayload | null>(null);

    const recalculateCommissions = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/resellers/finance/recalculate', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(tf('finance.recalculateOk', { amount: data.addedTotal || 0 }));
            await Promise.all([loadPayments(), fetchFinanceSummary(), fetchStats()]);
        } catch (e: any) {
            toast.error(e.message || t('finance.recalculateError'));
        } finally {
            setLoading(false);
        }
    };

    const submitWithdraw = async () => {
        if (!token || !withdrawAmount) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/resellers/finance/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ amount: withdrawAmount, payoutMethod: withdrawMethod })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(t('finance.withdrawOk'));
            setWithdrawModalOpen(false);
            setWithdrawAmount('');
            await Promise.all([loadPayments(), fetchFinanceSummary(), fetchStats()]);
        } catch (e: any) {
            toast.error(e.message || t('finance.withdrawError'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFinanceSummary();
        fetchStats();
    }, [fetchFinanceSummary, fetchStats]);

    useEffect(() => {
        const loadInv = async () => {
            if (!token) return;
            try {
                const res = await fetch('/api/v1/tenants/finance/invoices', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const raw = await res.json();
                setInvoices(Array.isArray(raw) ? raw.slice(0, 30) : []);
            } catch {
                setInvoices([]);
            }
        };
        void loadInv();
    }, [token]);

    const loadPayments = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (status !== 'all') qs.set('status', status);
            if (type !== 'all') qs.set('type', type);
            if (method !== 'all') qs.set('payment_method', method);
            if (tenant.trim()) qs.set('tenant', tenant.trim());
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            const res = await fetch(`/api/v1/tenants/finance/accounting/all-payments?${qs.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(json.error || t('finance.fetchError'));
                return;
            }
            const data = (await res.json()) as { rows?: PaymentRow[]; summary?: PaymentSummary };
            setRows(Array.isArray(data.rows) ? data.rows : []);
            setSummary(data.summary || {});
        } catch {
            toast.error(t('finance.fetchError'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPayments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, status, type, method, tenant, from, to]);

    const setPaymentStatus = async (id: number, nextStatus: 'paid' | 'pending' | 'overdue' | 'cancelled') => {
        if (!token) return;
        setBusyId(id);
        try {
            const res = await fetch(`/api/v1/tenants/finance/payments/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: nextStatus }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(json.error || t('finance.statusUpdateError'));
                return;
            }
            toast.success(t('finance.statusUpdateOk'));
            await Promise.all([loadPayments(), fetchFinanceSummary(), fetchStats()]);
        } catch {
            toast.error(t('finance.statusUpdateError'));
        } finally {
            setBusyId(null);
        }
    };

    const cancelLicenseUpgrade = async (paymentHistoryId: number) => {
        setBusyId(paymentHistoryId);
        try {
            const result = await cancelPlanPurchase(paymentHistoryId);
            if (result.ok) {
                toast.success(result.message || t('finance.cancelUpgradeOk'));
                await Promise.all([loadPayments(), fetchFinanceSummary(), fetchStats()]);
                if (detailData?.payment.id === paymentHistoryId) {
                    setDetailOpen(false);
                    setDetailData(null);
                }
            } else {
                toast.error(result.error || t('finance.cancelUpgradeError'));
            }
        } catch {
            toast.error(t('finance.cancelUpgradeError'));
        } finally {
            setBusyId(null);
        }
    };

    const sendReminder = async (id: number) => {
        if (!token) return;
        setBusyId(id);
        try {
            const res = await fetch(`/api/v1/tenants/finance/payments/${id}/send-mail`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; mailSent?: boolean };
            if (!res.ok) {
                toast.error(json.error || t('finance.reminderError'));
                return;
            }
            toast.success(json.mailSent ? t('finance.reminderOk') : t('finance.reminderLogged'));
        } catch {
            toast.error(t('finance.reminderError'));
        } finally {
            setBusyId(null);
        }
    };

    const openPaymentDetail = async (paymentId: number) => {
        if (!token) return;
        setDetailOpen(true);
        setDetailLoading(true);
        setDetailData(null);
        try {
            const res = await fetch(`/api/v1/tenants/finance/payments/${paymentId}/detail`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = (await res.json().catch(() => ({}))) as PaymentDetailPayload & { error?: string };
            if (!res.ok) throw new Error(data.error || t('finance.detailLoadErr'));
            setDetailData(data);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('finance.detailLoadErr'));
            setDetailOpen(false);
        } finally {
            setDetailLoading(false);
        }
    };

    const downloadInvoiceJson = async (invoiceNumber: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/v1/tenants/finance/invoices/${encodeURIComponent(invoiceNumber)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error(t('finance.fetchError'));
                return;
            }
            const text = await res.text();
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${invoiceNumber}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error(t('finance.fetchError'));
        }
    };

    const downloadCsv = () => {
        const header = ['id', 'tenant', 'cadence', 'type', 'method', 'amount', 'currency', 'status', 'due_date', 'paid_at', 'created_at', 'description'];
        const body = rows.map((r) =>
            [
                r.id,
                r.tenant_name || '',
                r.cadence_key || '',
                r.payment_type || '',
                r.payment_method || '',
                Number(r.amount || 0).toFixed(2),
                r.currency || 'EUR',
                r.status || '',
                r.due_date || '',
                r.paid_at || '',
                r.created_at || '',
                (r.description || '').replaceAll('"', '""'),
            ]
                .map((v) => `"${String(v)}"`)
                .join(','),
        );
        const csv = [header.join(','), ...body].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reseller-finance-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const fs = financeSummary || {
        total_earnings: 0,
        total_pending: 0,
        wallet_balance: admin?.wallet_balance ?? 0,
        monthly_earnings: [],
        plan_distribution: [],
        commission_breakdown: null,
    };

    const paidAmount = Math.max(0, Number(fs.total_earnings || 0) - Number(fs.total_pending || 0));
    const payoutRate = Number(fs.total_earnings || 0) > 0
        ? Math.min(100, Math.round((paidAmount / Number(fs.total_earnings)) * 100))
        : 0;

    const monthlySeries = useMemo(
        () =>
            (fs.monthly_earnings || []).map((x) => ({
                month: String(x.month),
                total: Number(x.total || 0),
            })),
        [fs.monthly_earnings]
    );
    const maxMonthly = monthlySeries.reduce((m, x) => Math.max(m, x.total), 0);

    const planDist = useMemo(
        () =>
            (fs.plan_distribution || []).map((x) => ({
                plan: String(x.plan || 'unknown'),
                count: Number(x.count || 0),
            })),
        [fs.plan_distribution]
    );
    const totalPlanCount = planDist.reduce((s, x) => s + x.count, 0);

    const monthlyTotal = Number((fs.commission_breakdown as any)?.monthly_billing_cycle || 0);
    const yearlyTotal = Number((fs.commission_breakdown as any)?.yearly_billing_cycle || 0);
    const addonTotal = Number((fs.commission_breakdown as any)?.sales_with_addon_modules || 0);
    const setupTotal = Number((fs.commission_breakdown as any)?.setup_and_corporate || 0);
    const totalCommissions = monthlyTotal + yearlyTotal + addonTotal + setupTotal;

    return (
        <div className="space-y-6 animate-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <p className="text-slate-500 text-sm">{t('finance.subtitle')}</p>
                <div className="flex items-center gap-2">
                    <button
                        onClick={recalculateCommissions}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/20 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        <FiClock size={14} /> {t('finance.recalculateCommissions')}
                    </button>
                    <button
                        onClick={() => setWithdrawModalOpen(true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/20 text-xs font-bold transition-all flex items-center gap-2"
                    >
                        <FiDollarSign size={14} /> {t('finance.withdrawBalance')}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 to-slate-900/80 p-4 flex gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                    <FiInfo size={20} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-black text-white uppercase tracking-wider mb-1">{t('finance.introTitle')}</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{t('finance.introBody')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label={t('finance.totalEarnings')} value={`€${fs.total_earnings.toFixed(2)}`} icon={<FiDollarSign size={28} />} color="blue" />
                <StatCard label={t('finance.totalPending')} value={`€${fs.total_pending.toFixed(2)}`} icon={<FiClock size={28} />} color="orange" />
                <StatCard label={t('finance.walletBalance')} value={`€${(admin?.wallet_balance ?? fs.wallet_balance).toFixed(2)}`} icon={<FiCreditCard size={28} />} color="emerald" />
                <StatCard label={t('sidebar.licenses')} value={admin?.available_licenses ?? 0} icon={<FiPackage size={28} />} color="indigo" />
            </div>

            {withdrawModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-lg font-black text-white">{t('finance.withdrawTitle')}</h3>
                            <button onClick={() => setWithdrawModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    {tf('finance.withdrawAmountLabel', { balance: (admin?.wallet_balance ?? fs.wallet_balance).toFixed(2) })}
                                </p>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                                    <input 
                                        type="number" 
                                        value={withdrawAmount} 
                                        onChange={(e) => setWithdrawAmount(e.target.value)} 
                                        placeholder="0.00" 
                                        min="0" 
                                        max={admin?.wallet_balance ?? 0}
                                        className="w-full pl-8 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white outline-none focus:border-emerald-500/50" 
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('finance.withdrawMethodLabel')}</p>
                                <select 
                                    value={withdrawMethod} 
                                    onChange={(e) => setWithdrawMethod(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white outline-none focus:border-emerald-500/50"
                                >
                                    <option value="bank_transfer">{t('finance.withdrawMethodBank')}</option>
                                </select>
                            </div>
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                                <p className="text-[11px] text-amber-400/90 leading-relaxed">
                                    {t('finance.withdrawHint')}
                                </p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end gap-2">
                            <button onClick={() => setWithdrawModalOpen(false)} className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">{t('rest.modal.cancel')}</button>
                            <button 
                                onClick={submitWithdraw} 
                                disabled={loading || !withdrawAmount || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > (admin?.wallet_balance ?? 0)}
                                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black transition-colors disabled:opacity-50"
                            >
                                {t('finance.withdrawSubmit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Komisyon kırılımı */}
            {totalCommissions > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mb-1">{t('finance.card.monthly')}</p>
                        <p className="text-lg font-black text-white">€{monthlyTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{t('finance.card.monthlyHint')}</p>
                    </div>
                    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-purple-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-1">{t('finance.card.yearly')}</p>
                        <p className="text-lg font-black text-white">€{yearlyTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{t('finance.card.yearlyHint')}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider mb-1">{t('finance.card.addon')}</p>
                        <p className="text-lg font-black text-white">€{addonTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{t('finance.card.addonHint')}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-green-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wider mb-1">{t('finance.card.setup')}</p>
                        <p className="text-lg font-black text-white">€{setupTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{t('finance.card.setupHint')}</p>
                    </div>
                </div>
            )}

            {/* Plan dağılımı */}
            {planDist.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3">{t('finance.planDistribution')}</h3>
                    <div className="flex flex-wrap gap-3">
                        {planDist.map((p) => (
                            <div key={p.plan} className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2 border border-white/5">
                                <span className="text-[10px] font-black text-slate-400 uppercase">{p.plan}</span>
                                <span className="text-sm font-black text-white">{p.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <FiCreditCard className="text-indigo-400" />
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('finance.invoicesTitle')}</h3>
                </div>
                {invoices.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('finance.noData')}</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase font-black">
                                    <th className="px-3 py-2 text-left">{t('finance.invoiceNo')}</th>
                                    <th className="px-3 py-2 text-left">{t('dash.colRestaurant')}</th>
                                    <th className="px-3 py-2 text-right">{t('finance.invoiceTotal')}</th>
                                    <th className="px-3 py-2 text-center">{t('rest.status')}</th>
                                    <th className="px-3 py-2 text-right">{t('finance.col.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={String(inv.invoice_number)} className="border-b border-white/5">
                                        <td className="px-3 py-2 font-mono text-slate-200">{inv.invoice_number || '—'}</td>
                                        <td className="px-3 py-2 text-slate-300">{inv.tenant_name || '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono">€{Number(inv.total ?? 0).toFixed(2)}</td>
                                        <td className="px-3 py-2 text-center text-slate-400">{paymentStatusLabel(t, inv.status)}</td>
                                        <td className="px-3 py-2 text-right">
                                            {inv.invoice_number ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void downloadInvoiceJson(String(inv.invoice_number))}
                                                    className="text-blue-400 hover:underline text-xs font-bold"
                                                >
                                                    {t('finance.invoiceOpen')}
                                                </button>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white">
                            <option value="all">{t('finance.filter.allStatuses')}</option>
                            <option value="pending">{t('finance.filter.status.pending')}</option>
                            <option value="paid">{t('finance.filter.status.paid')}</option>
                            <option value="overdue">{t('finance.filter.status.overdue')}</option>
                            <option value="cancelled">{t('finance.filter.status.cancelled')}</option>
                        </select>
                        <select value={type} onChange={(e) => setType(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white">
                            <option value="all">{t('finance.filter.allTypes')}</option>
                            <option value="subscription">{t('finance.filter.type.subscription')}</option>
                            <option value="setup">{t('finance.filter.type.setup')}</option>
                            <option value="addon">{t('finance.filter.type.addon')}</option>
                            <option value="license">{t('finance.filter.type.license')}</option>
                            <option value="reseller_income">{t('finance.filter.type.reseller_income')}</option>
                            <option value="reseller_wallet_topup">{t('finance.filter.type.reseller_wallet_topup')}</option>
                        </select>
                        <select value={method} onChange={(e) => setMethod(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white">
                            <option value="all">{t('finance.filter.allMethods')}</option>
                            <option value="bank_transfer">{t('finance.filter.method.bank_transfer')}</option>
                            <option value="cash">{t('finance.filter.method.cash')}</option>
                            <option value="admin_card">{t('finance.filter.method.admin_card')}</option>
                            <option value="wallet_balance">{t('finance.filter.method.wallet_balance')}</option>
                        </select>
                        <input
                            type="text"
                            value={tenant}
                            onChange={(e) => setTenant(e.target.value)}
                            placeholder={t('finance.filter.searchTenant')}
                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                        />
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
                        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
                    </div>
                    <button
                        type="button"
                        onClick={downloadCsv}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 text-xs font-bold"
                    >
                        <FiDownload size={14} /> {t('finance.exportCsv')}
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500">{t('finance.summary.totalCount')}</p>
                        <p className="text-white font-black">{summary.total_count ?? rows.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500">{t('finance.summary.paid')}</p>
                        <p className="text-emerald-300 font-black">€{Number(summary.total_paid ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500">{t('finance.summary.pending')}</p>
                        <p className="text-amber-300 font-black">€{Number(summary.total_pending ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500">{t('finance.summary.overdue')}</p>
                        <p className="text-rose-300 font-black">€{Number(summary.total_overdue ?? 0).toFixed(2)}</p>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black">
                                <th className="px-3 py-3 text-left">{t('dash.colRestaurant')}</th>
                                <th className="px-3 py-3 text-left">{t('finance.col.cadence')}</th>
                                <th className="px-3 py-3 text-left">{t('finance.col.type')}</th>
                                <th className="px-3 py-3 text-right">{t('finance.col.amount')}</th>
                                <th className="px-3 py-3 text-center">{t('finance.col.status')}</th>
                                <th className="px-3 py-3 text-center">{t('finance.col.due')}</th>
                                <th className="px-3 py-3 text-right">{t('finance.col.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">{t('finance.loading')}</td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">{t('finance.empty')}</td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-3 py-3 text-white font-semibold">{r.tenant_name || '-'}</td>
                                        <td className="px-3 py-3">
                                            <span className="inline-block max-w-[140px] text-[10px] font-bold text-violet-200/95 leading-tight">
                                                {cadenceLabel(t, r.cadence_key)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-slate-300">{r.payment_type || '-'}</td>
                                        <td className="px-3 py-3 text-right text-slate-200 font-mono">
                                            {r.currency || 'EUR'} {Number(r.amount || 0).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${paymentStatusClass(r.status)}`}>
                                                {paymentStatusLabel(t, r.status)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center text-slate-400">{r.due_date ? String(r.due_date).slice(0, 10) : '-'}</td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap justify-end gap-1.5 max-w-[340px] ml-auto">
                                                {(r.status === 'pending' || r.status === 'overdue') && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedInvoice(r);
                                                            setPayModalOpen(true);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase shadow-lg shadow-emerald-600/10"
                                                    >
                                                        <FiCreditCard size={12} /> {t('finance.payInvoice')}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void openPaymentDetail(r.id)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-500/35 text-violet-200 hover:bg-violet-500/10 text-[10px] font-black uppercase"
                                                >
                                                    <FiList size={12} /> {t('finance.detailBtn')}
                                                </button>
                                                {isLicenseUpgradePayment(r.payment_type) && canCancelLicenseUpgrade(r.status) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void cancelLicenseUpgrade(r.id)}
                                                        disabled={busyId === r.id}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-500/35 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 text-[10px] font-black uppercase"
                                                    >
                                                        <FiXCircle size={12} />{' '}
                                                        {String(r.status).toLowerCase() === 'cancelled'
                                                            ? t('finance.action.repairPlan')
                                                            : t('finance.action.cancelUpgrade')}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void setPaymentStatus(r.id, 'paid')}
                                                    disabled={busyId === r.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 text-[10px] font-bold"
                                                >
                                                    <FiCheckCircle size={12} /> {t('finance.action.markPaid')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void setPaymentStatus(r.id, 'overdue')}
                                                    disabled={busyId === r.id}
                                                    className="px-2 py-1 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 text-[10px] font-bold"
                                                >
                                                    {t('finance.action.markOverdue')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void sendReminder(r.id)}
                                                    disabled={busyId === r.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50 text-[10px] font-bold"
                                                >
                                                    <FiMail size={12} /> {t('finance.action.sendMail')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <section className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FiTrendingUp className="text-blue-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('finance.monthlyTrend')}</h3>
                    </div>
                    {monthlySeries.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('finance.noData')}</p>
                    ) : (
                        <div className="space-y-3">
                            {monthlySeries.map((row) => {
                                const width = maxMonthly > 0 ? Math.max(6, Math.round((row.total / maxMonthly) * 100)) : 0;
                                return (
                                    <div key={row.month} className="grid grid-cols-[90px_1fr_100px] items-center gap-3">
                                        <span className="text-xs text-slate-400 font-bold">{row.month}</span>
                                        <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${width}%` }} />
                                        </div>
                                        <span className="text-xs text-slate-200 text-right font-mono">€{row.total.toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FiDollarSign className="text-emerald-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('finance.collectionStatus')}</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">{t('finance.completionRate')}</span>
                            <span className="text-emerald-300 font-black">%{payoutRate}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${payoutRate}%` }} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                            <div className="rounded-xl bg-slate-950/60 border border-white/5 p-3">
                                <p className="text-slate-500">{t('finance.paidAmount')}</p>
                                <p className="text-emerald-300 font-black font-mono">€{paidAmount.toFixed(2)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-950/60 border border-white/5 p-3">
                                <p className="text-slate-500">{t('finance.summary.pending')}</p>
                                <p className="text-amber-300 font-black font-mono">€{Number(fs.total_pending).toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FiPieChart className="text-indigo-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('finance.planDistribution')}</h3>
                    </div>
                    {planDist.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('finance.noData')}</p>
                    ) : (
                        <div className="space-y-2">
                            {planDist.map((row) => {
                                const rate = totalPlanCount > 0 ? Math.round((row.count / totalPlanCount) * 100) : 0;
                                return (
                                    <div key={row.plan} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
                                        <span className="text-xs text-slate-300 uppercase font-bold">{row.plan}</span>
                                        <span className="text-xs text-indigo-300 font-mono">{row.count} (%{rate})</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <FiClock className="text-amber-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('finance.commissionBreakdown')}</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-4">{t('comm.breakdownHint')}</p>
                    {!fs.commission_breakdown ? (
                        <p className="text-xs text-slate-500">{t('finance.noData')}</p>
                    ) : (
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
                                <span className="text-slate-400">{t('finance.breakdown.monthly')}</span>
                                <span className="font-mono text-slate-200">{Number(fs.commission_breakdown.monthly_billing_cycle || 0)}</span>
                            </div>
                            <div className="flex justify-between rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
                                <span className="text-slate-400">{t('finance.breakdown.yearly')}</span>
                                <span className="font-mono text-slate-200">{Number(fs.commission_breakdown.yearly_billing_cycle || 0)}</span>
                            </div>
                            <div className="flex justify-between rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
                                <span className="text-slate-400">{t('finance.breakdown.addon')}</span>
                                <span className="font-mono text-slate-200">{Number(fs.commission_breakdown.sales_with_addon_modules || 0)}</span>
                            </div>
                            <div className="flex justify-between rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
                                <span className="text-slate-400">{t('finance.breakdown.setup')}</span>
                                <span className="font-mono text-slate-200">{Number(fs.commission_breakdown.setup_and_corporate || 0)}</span>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <Modal
                show={detailOpen}
                onClose={() => {
                    setDetailOpen(false);
                    setDetailData(null);
                }}
                title={t('finance.detailTitle')}
                className="max-w-2xl"
            >
                {detailLoading && <p className="text-slate-500 text-sm">{t('finance.loading')}</p>}
                {!detailLoading && detailData && (
                    <div className="space-y-4 text-xs text-slate-300">
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t('dash.colRestaurant')}</p>
                                    <p className="text-white font-bold">{detailData.payment.tenant_name || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t('finance.detailCadence')}</p>
                                    <p className="text-violet-200 font-bold">{cadenceLabel(t, detailData.payment.cadence_key)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t('finance.detailAmount')}</p>
                                    <p className="text-white font-mono font-black">
                                        {detailData.payment.currency || 'EUR'}{' '}
                                        {Number(detailData.payment.amount ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t('finance.col.type')}</p>
                                    <p className="text-slate-200">{detailData.payment.payment_type || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t('finance.detailMethod')}</p>
                                    <p className="text-slate-200">{detailData.payment.payment_method || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t('finance.detailStatus')}</p>
                                    <p className="text-slate-200 font-black">{paymentStatusLabel(t, detailData.payment.status)}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">{t('finance.detailExplain')}</p>
                                <p className="text-[11px] text-slate-400 leading-relaxed">{cadenceExplain(t, detailData.payment.cadence_key)}</p>
                            </div>
                            {detailData.payment.description ? (
                                <div className="rounded-lg bg-slate-950/50 border border-white/5 p-3">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">{t('finance.detailNote')}</p>
                                    <p className="text-slate-300 leading-relaxed">{cleanPaymentDescription(detailData.payment.description)}</p>
                                </div>
                            ) : null}
                            {isLicenseUpgradePayment(detailData.payment.payment_type) &&
                            canCancelLicenseUpgrade(detailData.payment.status) ? (
                                <button
                                    type="button"
                                    onClick={() => void cancelLicenseUpgrade(detailData.payment.id)}
                                    disabled={busyId === detailData.payment.id}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 text-xs font-black uppercase"
                                >
                                    <FiXCircle size={14} />
                                    {String(detailData.payment.status).toLowerCase() === 'cancelled'
                                        ? t('finance.action.repairPlan')
                                        : t('finance.action.cancelUpgrade')}
                                </button>
                            ) : null}
                            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                                <span>
                                    {t('finance.detailDueLabel')}: {detailData.payment.due_date ? String(detailData.payment.due_date).slice(0, 10) : '—'}
                                </span>
                                <span>
                                    {t('finance.detailPaidAtLabel')}: {detailData.payment.paid_at ? String(detailData.payment.paid_at).slice(0, 19) : '—'}
                                </span>
                            </div>
                        </div>

                        {detailData.tenant_billing ? (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <FiPieChart size={14} /> {t('finance.detailBilling')}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    <div className="flex justify-between border-b border-white/5 pb-1">
                                        <span className="text-slate-500">{t('finance.detailPlan')}</span>
                                        <span className="text-white font-mono">{String(detailData.tenant_billing.plan_code || '—')}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-white/5 pb-1">
                                        <span className="text-slate-500">{t('finance.detailCycle')}</span>
                                        <span className="text-white">{String(detailData.tenant_billing.billing_cycle || '—')}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-white/5 pb-1">
                                        <span className="text-slate-500">{t('finance.detailSetupTotal')}</span>
                                        <span className="text-white font-mono">
                                            €{Number(detailData.tenant_billing.setup_fee_total ?? 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-white/5 pb-1">
                                        <span className="text-slate-500">{t('finance.detailMonthlyRecurring')}</span>
                                        <span className="text-white font-mono">
                                            €{Number(detailData.tenant_billing.monthly_recurring_total ?? 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-white/5 pb-1">
                                        <span className="text-slate-500">{t('finance.detailYearlyPrepay')}</span>
                                        <span className="text-white font-mono">
                                            €{Number(detailData.tenant_billing.yearly_prepay_total ?? 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-white/5 pb-1">
                                        <span className="text-slate-500">{t('finance.detailNextDue')}</span>
                                        <span className="text-white">
                                            {detailData.tenant_billing.next_payment_due
                                                ? String(detailData.tenant_billing.next_payment_due).slice(0, 10)
                                                : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {detailData.module_lines.length > 0 ? (
                            <div className="rounded-xl border border-white/10 p-4">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">{t('finance.detailModules')}</p>
                                <div className="overflow-x-auto rounded-lg border border-white/5">
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="border-b border-white/10 text-slate-500 text-left">
                                                <th className="px-2 py-2">{t('finance.detailCol.module')}</th>
                                                <th className="px-2 py-2">{t('finance.detailCol.qty')}</th>
                                                <th className="px-2 py-2 text-right">{t('finance.detailCol.setup')}</th>
                                                <th className="px-2 py-2 text-right">{t('finance.detailCol.monthly')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detailData.module_lines.map((m, i) => (
                                                <tr key={i} className="border-b border-white/5">
                                                    <td className="px-2 py-2 text-slate-200">
                                                        {String(m.module_name || m.module_code || '—')}
                                                    </td>
                                                    <td className="px-2 py-2 font-mono">{Number(m.quantity ?? 1)}</td>
                                                    <td className="px-2 py-2 text-right font-mono">
                                                        €{Number(m.setup_price ?? m.setup_line_total ?? 0).toFixed(2)}
                                                    </td>
                                                    <td className="px-2 py-2 text-right font-mono">
                                                        €{Number(m.monthly_price ?? m.monthly_line_total ?? 0).toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : null}

                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                            <p className="text-[10px] font-black text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FiCreditCard size={14} /> {t('finance.detailInvoice')}
                            </p>
                            {detailData.invoice ? (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap justify-between gap-2 text-[11px]">
                                        <span className="text-slate-400">
                                            {t('finance.detailInvoiceNo')}:{' '}
                                            <span className="text-white font-mono">
                                                {String(detailData.invoice.invoice_number || detailData.payment.invoice_number || '—')}
                                            </span>
                                        </span>
                                        {'total' in detailData.invoice && detailData.invoice.total != null ? (
                                            <span className="text-white font-mono font-black">
                                                €{Number(detailData.invoice.total).toFixed(2)}
                                            </span>
                                        ) : null}
                                    </div>
                                    {Array.isArray(detailData.invoice.items) && detailData.invoice.items.length > 0 ? (
                                        <ul className="rounded-lg border border-white/10 divide-y divide-white/5">
                                            {(detailData.invoice.items as { description?: string; total?: number; unit_price?: number }[]).map(
                                                (it, idx) => (
                                                    <li key={idx} className="px-3 py-2 flex justify-between gap-2">
                                                        <span className="text-slate-300">{it.description || '—'}</span>
                                                        <span className="text-emerald-200 font-mono shrink-0">
                                                            €{Number(it.total ?? it.unit_price ?? 0).toFixed(2)}
                                                        </span>
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    ) : (
                                        <p className="text-slate-500 text-[11px]">{t('finance.detailNoLines')}</p>
                                    )}
                                    {detailData.payment.invoice_number ? (
                                        <button
                                            type="button"
                                            onClick={() => void downloadInvoiceJson(String(detailData.payment.invoice_number))}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/30 border border-blue-500/40 text-blue-200 text-[10px] font-black uppercase hover:bg-blue-600/50"
                                        >
                                            <FiDownload size={14} /> {t('finance.detailInvoiceDl')}
                                        </button>
                                    ) : null}
                                </div>
                            ) : (
                                <p className="text-slate-500">{t('finance.detailNoInvoice')}</p>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setDetailOpen(false);
                                setDetailData(null);
                            }}
                            className="w-full py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-xs font-bold"
                        >
                            {t('finance.detailClose')}
                        </button>
                    </div>
                )}
            </Modal>

            {payModalOpen && selectedInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        
                        {/* Header */}
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-lg font-black text-white flex items-center gap-2">
                                <FiCreditCard className="text-emerald-400" />
                                {t('finance.payModal.title')}
                            </h3>
                            <button 
                                onClick={() => {
                                    setPayModalOpen(false);
                                    setSelectedInvoice(null);
                                    setCheckoutUrl(null);
                                    setGeneratedUrlForId(null);
                                }} 
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        
                        {/* Body */}
                        <div className="p-6 space-y-6">
                            {/* Invoice Summary Card */}
                            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            {t('finance.payModal.customer')}
                                        </p>
                                        <p className="text-sm font-bold text-white mt-0.5">
                                            {selectedInvoice.tenant_name || (selectedInvoice as any).tenant_id || '-'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            {t('finance.payModal.dueDate')}
                                        </p>
                                        <p className="text-xs font-mono font-bold text-slate-300 mt-0.5">
                                            {selectedInvoice.due_date ? String(selectedInvoice.due_date).slice(0, 10) : '-'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-between items-end pt-3 border-t border-white/5 mt-2">
                                    <div>
                                        <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase bg-violet-500/10 text-violet-300 border border-violet-500/20">
                                            {selectedInvoice.payment_type}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">
                                            {t('finance.payModal.amountDue')}
                                        </p>
                                        <p className="text-2xl font-black text-emerald-400 font-mono">
                                            {selectedInvoice.currency || 'EUR'} {Number(selectedInvoice.amount || 0).toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Options */}
                            <div className="space-y-4">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    {t('finance.payModal.selectMethod')}
                                </p>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Option 1: Pay with Reseller Wallet */}
                                    <button
                                        type="button"
                                        disabled={payLoading}
                                        onClick={async () => {
                                            if (!selectedInvoice) return;
                                            const totalAmount = Number(selectedInvoice.amount || 0);
                                            const walletBal = Number(admin?.wallet_balance ?? 0);
                                            if (walletBal < totalAmount) {
                                                toast.error(tf('finance.payModal.insufficientBalance', {
                                                    wallet: walletBal.toFixed(2),
                                                    invoice: totalAmount.toFixed(2),
                                                }));
                                                return;
                                            }
                                            if (!window.confirm(tf('finance.payModal.confirmWallet', { amount: totalAmount.toFixed(2) }))) {
                                                return;
                                            }
                                            setPayLoading(true);
                                            try {
                                                const res = await payTenantInvoiceWithWallet(selectedInvoice.id);
                                                if (res.ok) {
                                                    toast.success(t('finance.payModal.paySuccess'));
                                                    setPayModalOpen(false);
                                                    setSelectedInvoice(null);
                                                    setCheckoutUrl(null);
                                                    setGeneratedUrlForId(null);
                                                    // Refresh
                                                    await loadPayments();
                                                    await Promise.all([fetchFinanceSummary(), fetchStats()]);
                                                } else {
                                                    toast.error(res.error || t('finance.payModal.payFailed'));
                                                }
                                            } catch (e: any) {
                                                toast.error(e.message || t('finance.payModal.genericError'));
                                            } finally {
                                                setPayLoading(false);
                                            }
                                        }}
                                        className="flex flex-col items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-center transition-all group disabled:opacity-50"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2 group-hover:scale-110 transition-transform">
                                            <FiBriefcase size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-xs uppercase">
                                                {t('finance.payModal.payFromWallet')}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                                                {tf('finance.payModal.payFromWalletHint', { balance: (admin?.wallet_balance ?? 0).toFixed(2) })}
                                            </p>
                                        </div>
                                    </button>

                                    {/* Option 2: Generate Checkout Link */}
                                    <button
                                        type="button"
                                        disabled={payLoading}
                                        onClick={async () => {
                                            if (!selectedInvoice) return;
                                            if (generatedUrlForId === selectedInvoice.id && checkoutUrl) return;
                                            setPayLoading(true);
                                            try {
                                                const url = await fetchCheckoutLinkForTenant(selectedInvoice.id);
                                                if (url) {
                                                    setCheckoutUrl(url);
                                                    setGeneratedUrlForId(selectedInvoice.id);
                                                    toast.success(t('finance.payModal.linkCreated'));
                                                } else {
                                                    toast.error(t('finance.payModal.linkFailed'));
                                                }
                                            } catch (e: any) {
                                                toast.error(e.message || t('finance.payModal.genericError'));
                                            } finally {
                                                setPayLoading(false);
                                            }
                                        }}
                                        className="flex flex-col items-center justify-between p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-center transition-all group disabled:opacity-50"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 mb-2 group-hover:scale-110 transition-transform">
                                            <FiCreditCard size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-xs uppercase">
                                                {t('finance.payModal.createLink')}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                                                {t('finance.payModal.createLinkHint')}
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Generated Link Display */}
                            {checkoutUrl && generatedUrlForId === selectedInvoice.id && (
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                                    <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1">
                                        <FiCheckCircle />
                                        {t('finance.payModal.linkReady')}
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={checkoutUrl}
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(checkoutUrl);
                                                toast.success(t('finance.payModal.linkCopied'));
                                            }}
                                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                                        >
                                            <FiCopy size={14} />
                                            {t('finance.payModal.copy')}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <a
                                            href={checkoutUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black text-center transition-all flex items-center justify-center gap-1"
                                        >
                                            <FiGlobe size={14} />
                                            {t('finance.payModal.paymentPage')}
                                        </a>
                                        
                                        <a
                                            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                                                tf('finance.payModal.whatsappText', { url: checkoutUrl })
                                            )}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black text-center transition-all flex items-center justify-center gap-1"
                                        >
                                            WhatsApp
                                        </a>
                                        
                                        <a
                                            href={`mailto:?subject=${encodeURIComponent(t('finance.payModal.emailSubject'))}&body=${encodeURIComponent(
                                                tf('finance.payModal.emailBody', { url: checkoutUrl })
                                            )}`}
                                            className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black text-center transition-all flex items-center justify-center gap-1"
                                        >
                                            {t('finance.payModal.email')}
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setPayModalOpen(false);
                                    setSelectedInvoice(null);
                                    setCheckoutUrl(null);
                                    setGeneratedUrlForId(null);
                                }}
                                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-xs font-bold transition-all"
                            >
                                {t('finance.detailClose')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
