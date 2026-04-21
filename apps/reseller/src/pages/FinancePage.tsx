import { useEffect, useMemo, useState } from 'react';
import { FiDollarSign, FiClock, FiCreditCard, FiPackage, FiTrendingUp, FiPieChart, FiMail, FiCheckCircle, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { StatCard } from '../components/Shared.tsx';

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

export function FinancePage() {
    const { lang, financeSummary, fetchFinanceSummary, fetchStats, admin, token } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;
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
        const header = ['id', 'tenant', 'type', 'method', 'amount', 'currency', 'status', 'due_date', 'paid_at', 'created_at', 'description'];
        const body = rows.map((r) =>
            [
                r.id,
                r.tenant_name || '',
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
            <p className="text-slate-500 text-sm">{t('finance.subtitle')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label={t('finance.totalEarnings')} value={`€${fs.total_earnings.toFixed(2)}`} icon={<FiDollarSign size={28} />} color="blue" />
                <StatCard label={t('finance.totalPending')} value={`€${fs.total_pending.toFixed(2)}`} icon={<FiClock size={28} />} color="orange" />
                <StatCard label={t('finance.walletBalance')} value={`€${(admin?.wallet_balance ?? fs.wallet_balance).toFixed(2)}`} icon={<FiCreditCard size={28} />} color="emerald" />
                <StatCard label={t('sidebar.licenses')} value={admin?.available_licenses ?? 0} icon={<FiPackage size={28} />} color="indigo" />
            </div>

            {/* Komisyon kırılımı */}
            {totalCommissions > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mb-1">Aylık</p>
                        <p className="text-lg font-black text-white">€{monthlyTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">Servis komisyonu</p>
                    </div>
                    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-purple-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-1">Yıllık</p>
                        <p className="text-lg font-black text-white">€{yearlyTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">Yıllık ön ödeme</p>
                    </div>
                    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider mb-1">Ek Modül</p>
                        <p className="text-lg font-black text-white">€{addonTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">Modül komisyonu</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-green-500/5 p-4 text-center">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wider mb-1">Kurulum</p>
                        <p className="text-lg font-black text-white">€{setupTotal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">Setup fee</p>
                    </div>
                </div>
            )}

            {/* Plan dağılımı */}
            {planDist.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3">Plan Dağılımı</h3>
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
                                        <td className="px-3 py-2 text-center text-slate-400">{inv.status || '—'}</td>
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
                            <option value="all">Tüm yöntemler</option>
                            <option value="bank_transfer">Havale/EFT</option>
                            <option value="cash">Nakit</option>
                            <option value="admin_card">Kart (POS)</option>
                            <option value="wallet_balance">Bakiye</option>
                        </select>
                        <input
                            type="text"
                            value={tenant}
                            onChange={(e) => setTenant(e.target.value)}
                            placeholder="Restoran / tenant ara"
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
                                <th className="px-3 py-3 text-left">{t('finance.col.type')}</th>
                                <th className="px-3 py-3 text-right">Tutar</th>
                                <th className="px-3 py-3 text-center">Durum</th>
                                <th className="px-3 py-3 text-center">{t('finance.col.due')}</th>
                                <th className="px-3 py-3 text-right">{t('finance.col.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">{t('finance.loading')}</td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">{t('finance.empty')}</td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-3 py-3 text-white font-semibold">{r.tenant_name || '-'}</td>
                                        <td className="px-3 py-3 text-slate-300">{r.payment_type || '-'}</td>
                                        <td className="px-3 py-3 text-right text-slate-200 font-mono">
                                            {r.currency || 'EUR'} {Number(r.amount || 0).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                r.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400'
                                                    : r.status === 'overdue' ? 'bg-rose-500/10 text-rose-400'
                                                        : r.status === 'pending' ? 'bg-amber-500/10 text-amber-300'
                                                            : 'bg-slate-500/10 text-slate-400'
                                            }`}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center text-slate-400">{r.due_date ? String(r.due_date).slice(0, 10) : '-'}</td>
                                        <td className="px-3 py-3">
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => void setPaymentStatus(r.id, 'paid')}
                                                    disabled={busyId === r.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                                                >
                                                    <FiCheckCircle size={12} /> {t('finance.action.markPaid')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void setPaymentStatus(r.id, 'overdue')}
                                                    disabled={busyId === r.id}
                                                    className="px-2 py-1 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                                                >
                                                    {t('finance.action.markOverdue')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void sendReminder(r.id)}
                                                    disabled={busyId === r.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
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
                    <div className="flex items-center gap-2 mb-4">
                        <FiClock className="text-amber-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('finance.commissionBreakdown')}</h3>
                    </div>
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
        </div>
    );
}
