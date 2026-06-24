import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiAlertTriangle, FiCreditCard, FiShare2, FiLoader } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';

function tpl(t: (k: string) => string, key: string, vars: Record<string, string | number>): string {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{{${k}}}`).join(String(v));
    }
    return s;
}

interface PendingPaymentLine {
    id: number;
    tenant_id: string;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method: string | null;
    description: string | null;
    status: string;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
}

interface BillingStatus {
    isSuspended: boolean;
    hasWarning: boolean;
    nextPaymentDue: string | null;
    daysRemaining: number | null;
    pendingPaymentLine: PendingPaymentLine | null;
    planCode?: string | null;
    maxDevices?: { base: number; extra: number; total: number } | null;
    entitlements?: { code: string; enabled: boolean; mode: string }[];
    walletBalance: number;
}

export const BillingWarning: React.FC = () => {
    const { isAuthenticated } = useAuthStore();
    const navigate = useNavigate();
    const { t, lang } = usePosLocale();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        const auth = useAuthStore.getState();
        if (!isAuthenticated || !auth.user || auth.user.isSaaSAdmin) return;

        const checkStatus = async () => {
            try {
                setLoading(true);
                const headers = useAuthStore.getState().getAuthHeaders();
                const res = await fetch('/api/v1/billing/status', { headers });
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                    useAuthStore.getState().setBillingWorkspace({
                        planCode: data.planCode ?? null,
                        maxDevices: data.maxDevices ?? null,
                        entitlements: Array.isArray(data.entitlements) ? data.entitlements : [],
                        daysRemaining: data.daysRemaining ?? null,
                    });
                }
            } catch (err) {
                console.warn('Billing status check failed', err);
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
        
        // Periyodik kontrol (6 saatte bir)
        const interval = setInterval(checkStatus, 6 * 60 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isAuthenticated]);

    if (!status || !status.hasWarning || loading) return null;

    const isNegativeBalance = status.walletBalance < 0;
    const locale = lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-GB' : 'tr-TR';
    const dueDateLabel = status.nextPaymentDue
        ? new Date(status.nextPaymentDue).toLocaleDateString(locale, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
        : '—';

    return (
        <div className="relative w-full z-[9999] px-4 py-2.5 bg-gradient-to-r from-red-950/80 via-[#12070e]/95 to-slate-950/85 backdrop-blur-xl border-b border-rose-500/20 shadow-2xl shadow-red-950/15 flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-300">
            <div className="flex items-center gap-3.5 flex-1">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 shrink-0 shadow-lg shadow-rose-950/20 animate-pulse">
                    <FiAlertTriangle size={20} />
                </div>
                <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-sm font-black text-rose-200 tracking-tight animate-pulse">
                            {isNegativeBalance ? t('billing.warning.negativeBalanceTitle') : t('billing.warning.dueSoonTitle')}
                        </span>
                        {isNegativeBalance ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/25 border border-rose-500/30 text-rose-400 animate-pulse">
                                {tpl(t, 'billing.warning.balanceChip', { amount: status.walletBalance.toFixed(2) })}
                            </span>
                        ) : (
                            status.daysRemaining !== null && (
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                    status.daysRemaining < 0 
                                        ? 'bg-red-500/25 border-red-500/30 text-red-400 animate-pulse' 
                                        : 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                                }`}>
                                    {status.daysRemaining < 0
                                        ? t('billing.warning.overdue')
                                        : tpl(t, 'billing.warning.daysLeft', { n: status.daysRemaining })}
                                </span>
                            )
                        )}
                    </div>
                    <span className="text-xs font-bold text-slate-400/90 mt-0.5 leading-relaxed">
                        {isNegativeBalance
                            ? t('billing.warning.negativeHint')
                            : tpl(t, 'billing.warning.dueHint', { date: dueDateLabel })}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 justify-end">
                {/* WhatsApp & E-posta Bildirimi Stub */}
                <button
                    onClick={() => {
                        toast.success(t('billing.warning.toastLinkSent'));
                    }}
                    className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-black tracking-wide text-slate-300 transition-all duration-200 active:scale-[0.97]"
                >
                    <FiShare2 size={14} />
                    {t('billing.warning.sendLink')}
                </button>

                <button 
                    disabled={actionLoading}
                    onClick={() => {
                        const line = status.pendingPaymentLine;
                        if (!line) {
                            toast.error(t('billing.warning.toastNoPending'));
                            return;
                        }
                        navigate('/admin/billing');
                        if (status.walletBalance >= line.amount) {
                            toast.success(t('billing.warning.toastWalletOk'));
                        } else {
                            toast(t('billing.warning.toastPayOptions'), { icon: '💳' });
                        }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 border border-rose-400/40 text-xs font-black tracking-wide text-white transition-all duration-200 active:scale-[0.97] shadow-lg shadow-rose-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {actionLoading ? (
                        <>
                            <FiLoader className="animate-spin" size={14} />
                            {t('billing.warning.loading')}
                        </>
                    ) : (
                        <>
                            <FiCreditCard size={14} />
                            {t('billing.warning.payOnline')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
