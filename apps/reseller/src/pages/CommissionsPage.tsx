import { useEffect } from 'react';
import { FiDownload } from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { EmptyState } from '../components/Shared.tsx';

export function CommissionsPage() {
    const { lang, financeSummary, fetchFinanceSummary } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;

    useEffect(() => {
        fetchFinanceSummary();
    }, [fetchFinanceSummary]);

    const monthly = financeSummary?.monthly_earnings ?? [];
    const plans = financeSummary?.plan_distribution ?? [];
    const total = Number(financeSummary?.total_earnings ?? 0);
    const pending = Number(financeSummary?.total_pending ?? 0);
    const wallet = Number(financeSummary?.wallet_balance ?? 0);
    const br = financeSummary?.commission_breakdown;

    return (
        <div className="space-y-6 animate-in">
            <p className="text-slate-500 text-sm">{t('comm.subtitle')}</p>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                    <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-2xl px-6 py-3">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('comm.total')}</span>
                        <span className="text-xl font-black text-emerald-400">€{total.toFixed(2)}</span>
                    </div>
                    <div className="bg-amber-600/10 border border-amber-500/20 rounded-2xl px-6 py-3">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('comm.pending')}</span>
                        <span className="text-xl font-black text-amber-300">€{pending.toFixed(2)}</span>
                    </div>
                    <div className="bg-sky-600/10 border border-sky-500/20 rounded-2xl px-6 py-3">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('comm.wallet')}</span>
                        <span className="text-xl font-black text-sky-300">€{wallet.toFixed(2)}</span>
                    </div>
                </div>
                <button
                    type="button"
                    className="flex items-center gap-2 text-xs font-black text-blue-400 hover:text-blue-300 uppercase"
                    onClick={() => globalThis.print()}
                >
                    <FiDownload size={14} /> {t('comm.downloadPdf')}
                </button>
            </div>

            {br && (br.monthly_billing_cycle > 0 || br.yearly_billing_cycle > 0 || br.sales_with_addon_modules > 0 || br.setup_and_corporate > 0) ? (
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">{t('comm.breakdownTitle')}</h3>
                    <p className="text-[11px] text-slate-500 mb-3">{t('comm.breakdownHint')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('comm.breakdownMonthly')}</span>
                            <p className="text-lg font-black text-emerald-400 tabular-nums">€{br.monthly_billing_cycle.toFixed(2)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('comm.breakdownYearly')}</span>
                            <p className="text-lg font-black text-emerald-400 tabular-nums">€{br.yearly_billing_cycle.toFixed(2)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('comm.breakdownAddon')}</span>
                            <p className="text-lg font-black text-emerald-400 tabular-nums">€{br.sales_with_addon_modules.toFixed(2)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('comm.breakdownSetup')}</span>
                            <p className="text-lg font-black text-emerald-400 tabular-nums">€{br.setup_and_corporate.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            ) : null}

            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">{t('comm.byMonth')}</h3>
                {monthly.length === 0 ? (
                    <EmptyState text={t('comm.noData')} />
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-4 py-3 text-left">{t('comm.month')}</th>
                                    <th className="px-4 py-3 text-right">{t('comm.commission')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthly.map((row, i) => (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 font-bold text-white">{String(row.month)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums font-black text-emerald-400">
                                            €{Number(row.total).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">{t('comm.planDistribution')}</h3>
                {plans.length === 0 ? (
                    <EmptyState text={t('comm.noData')} />
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-4 py-3 text-left">{t('comm.plan')}</th>
                                    <th className="px-4 py-3 text-right">{t('rest.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plans.map((row, i) => (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 font-bold text-white uppercase">{String(row.plan)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-300">{Number(row.count)}</td>
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
