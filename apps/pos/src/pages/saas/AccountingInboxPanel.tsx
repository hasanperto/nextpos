import React, { useState } from 'react';
import { FiAlertCircle, FiCalendar, FiCheck } from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';

export type AccountingInboxPanelProps = {
    /** undefined = tümü */
    pendingMax?: number;
    paidMax?: number;
};

export const AccountingInboxPanel: React.FC<AccountingInboxPanelProps> = ({ pendingMax, paidMax }) => {
    const { t } = useSaaSLocale();
    const {
        financeInbox,
        fetchFinanceInbox,
        fetchPayments,
        fetchFinancialSummary,
        recordSubscriptionPayment,
        sendPaymentDueMail, settings,
    } = useSaaSStore();

    const currency = settings?.currency || '€';

    const [inboxBusyId, setInboxBusyId] = useState<number | null>(null);

    const pending = financeInbox?.pending || [];
    const paidRecent = financeInbox?.paidRecent || [];
    const pendingList = pendingMax != null ? pending.slice(0, pendingMax) : pending;
    const paidList = paidMax != null ? paidRecent.slice(0, paidMax) : paidRecent;

    return (
        <div className="bg-slate-900/50 border border-white/5 p-8 rounded-[32px]">
            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <FiAlertCircle className="text-indigo-300" /> {t('finance.accountingInboxTitle')}
            </h4>

            <div className="space-y-4">
                {pendingList.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                            <FiCheck size={16} />
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold">{t('finance.accountingNoPending')}</span>
                    </div>
                ) : (
                    pendingList.map((p) => {
                        const dueStr = p.due_date ? new Date(p.due_date).toLocaleDateString('tr-TR') : '—';
                        const statusLabel = p.status === 'pending' ? t('finance.statusPending') : t('finance.statusOverdue');
                        const isBusy = inboxBusyId === p.id;
                        return (
                            <div key={p.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                        <div className="text-xs font-black text-white truncate">{p.tenant_name || p.tenant_id}</div>
                                        <div className="text-[10px] text-slate-500 font-bold italic mt-1 flex items-center gap-2">
                                            <FiCalendar size={12} /> {dueStr}
                                        </div>
                                    </div>
                                    <span
                                        className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                            p.status === 'pending'
                                                ? 'bg-orange-500/10 text-orange-400'
                                                : 'bg-red-600/10 text-red-400'
                                        }`}
                                    >
                                        {statusLabel}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-black text-white">{currency}{Number(p.amount || 0).toFixed(2)}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={async () => {
                                                setInboxBusyId(p.id);
                                                await recordSubscriptionPayment(String(p.tenant_id), Number(p.amount || 0));
                                                await fetchFinanceInbox();
                                                await fetchPayments();
                                                await fetchFinancialSummary();
                                                setInboxBusyId(null);
                                            }}
                                            className="text-[10px] font-black text-emerald-300 hover:text-emerald-200 transition-all uppercase tracking-widest disabled:opacity-40"
                                        >
                                            {t('finance.accountingMarkPaid')}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={async () => {
                                                setInboxBusyId(p.id);
                                                await sendPaymentDueMail(Number(p.id));
                                                setInboxBusyId(null);
                                            }}
                                            className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-all uppercase tracking-widest disabled:opacity-40"
                                        >
                                            {t('finance.accountingSendMail')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div className="pt-4 border-t border-white/10">
                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">
                        {t('finance.accountingPaidRecent')}
                    </div>
                    {paidList.length === 0 ? (
                        <div className="text-center text-[10px] text-slate-500 font-bold">{t('finance.accountingNoPaidYet')}</div>
                    ) : (
                        paidList.map((p) => {
                            const paidStr = p.paid_at ? new Date(p.paid_at).toLocaleDateString('tr-TR') : '—';
                            return (
                                <div key={p.id} className="flex items-center justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                        <div className="text-[11px] text-white font-bold truncate">{p.tenant_name || p.tenant_id}</div>
                                        <div className="text-[10px] text-slate-500 font-bold">{paidStr}</div>
                                    </div>
                                    <div className="text-[11px] text-emerald-300 font-black tabular-nums">{currency}{Number(p.amount || 0).toFixed(2)}</div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
