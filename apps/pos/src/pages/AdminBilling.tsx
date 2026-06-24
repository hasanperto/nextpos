import React, { useEffect, useState, useCallback } from 'react';
import { 
    FiCreditCard, FiDollarSign, FiClock, FiCheckCircle, FiAlertTriangle, 
    FiActivity, FiPlus, FiArrowUpRight, FiLayers, FiPackage, FiLoader, FiGlobe, FiChevronRight, FiLock, FiCopy
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';

function tpl(t: (k: string) => string, key: string, vars: Record<string, string | number>): string {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{{${k}}}`).join(String(v));
    }
    return s;
}

function isWalletPayableInvoice(p: PaymentHistoryItem): boolean {
    const pt = String(p.payment_type || 'subscription').toLowerCase();
    if (p.status === 'paid') return false;
    return !['wallet_deposit', 'reseller_income', 'reseller_wallet_topup'].includes(pt);
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

interface WalletTransaction {
    id: number;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    type: string;
    description: string | null;
    referenceId: string | null;
    createdAt: string;
}

interface PaymentHistoryItem {
    id: number;
    tenant_id: string;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method: string | null;
    description: string | null;
    status: 'paid' | 'pending' | 'overdue' | 'failed';
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
}

interface SubscriptionPlan {
    id: number;
    code: string;
    name: string;
    monthly_fee: number;
    setup_fee: number;
    max_users: number;
    max_branches: number;
    max_products: number;
    max_devices: number;
    max_printers: number;
    support_hours: string;
    features: string[];
    trial_days: number;
    is_active: boolean;
}

interface SystemModule {
    code: string;
    name: string;
    description: string | null;
    category: string;
    setup_price: number;
    monthly_price: number;
    sort_order: number;
}

const CardChip: React.FC = () => (
    <div className="w-10 h-8 bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-500 rounded-md border border-amber-300/40 shadow-inner relative overflow-hidden flex flex-col justify-between p-1.5 shrink-0">
        <div className="flex justify-between">
            <div className="w-1.5 h-1 border-b border-r border-amber-600/30"></div>
            <div className="w-1.5 h-1 border-b border-l border-amber-600/30"></div>
        </div>
        <div className="h-px bg-amber-600/30 w-full"></div>
        <div className="flex justify-between">
            <div className="w-1.5 h-1 border-t border-r border-amber-600/30"></div>
            <div className="w-1.5 h-1 border-t border-l border-amber-600/30"></div>
        </div>
    </div>
);

const getCardBrand = (number: string) => {
    const clean = number.replace(/\s+/g, '');
    if (clean.startsWith('4')) return 'visa';
    if (/^5[1-5]|^2[2-7]/.test(clean)) return 'mastercard';
    if (/^3[47]/.test(clean)) return 'amex';
    return 'generic';
};

const getCardStyle = (brand: string) => {
    switch (brand) {
        case 'visa':
            return {
                bg: 'bg-gradient-to-br from-[#0c1e4e] via-[#0f2d7a] to-[#1642ad]',
                logo: (
                    <svg className="h-6 w-auto text-white fill-current" viewBox="0 0 120 38">
                        <path d="M15.3 35.6L25 3.8h7.7L23 35.6h-7.7zm28.9.2l6-19.4c1.1-3 3.6-5.5 6.7-5.5h19.5v5.8H61.6l-5 13.6h-12.4zm44-32h-11.7l-9.8 24c-.6 1.4-1.7 2.4-3.1 2.8l10.8-26.8h13.8zm23 24.3l8.8-24.3h-8.1l-5.4 16.5-2.2-10.7c-.5-2.5-2.5-5.8-5.3-5.8H88.5l-.3.9c2 .9 4.3 2 5.7 3.5 1.1 1.2 1.6 2.6 1.3 4.2l-5.2 21h8.2z"/>
                    </svg>
                ),
                name: 'Visa'
            };
        case 'mastercard':
            return {
                bg: 'bg-gradient-to-br from-[#1e0a0a] via-[#3d1212] to-[#7a1a1a]',
                logo: (
                    <div className="flex -space-x-2.5 items-center">
                        <div className="w-6 h-6 rounded-full bg-[#EB001B] shadow-lg"></div>
                        <div className="w-6 h-6 rounded-full bg-[#F79E1B] opacity-90 shadow-lg"></div>
                    </div>
                ),
                name: 'Mastercard'
            };
        case 'amex':
            return {
                bg: 'bg-gradient-to-br from-[#1c1d24] via-[#2a2c35] to-[#404352]',
                logo: (
                    <div className="bg-[#0170B2] px-2 py-1 rounded text-white font-black tracking-wider text-[10px] border border-blue-400/20 shadow-md">
                        AMEX
                    </div>
                ),
                name: 'American Express'
            };
        default:
            return {
                bg: 'bg-gradient-to-br from-[#111827] via-[#1f2937] to-[#374151]',
                logo: <FiCreditCard className="text-slate-400" size={24} />,
                name: 'Credit Card'
            };
    }
};

export const AdminBilling: React.FC = () => {
    const { getAuthHeaders, tenantId } = useAuthStore();
    const fetchCheckoutLink = usePosStore(s => s.fetchCheckoutLink);
    const { t, lang } = usePosLocale();

    // States
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [modules, setModules] = useState<SystemModule[]>([]);

    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'invoices' | 'wallet'>('invoices');

    // Payment Modal States
    const [showPaymentModal, setShowPaymentModal] = useState<PaymentHistoryItem | null>(null);
    const [paymentModalStep, setPaymentModalStep] = useState<1 | 2 | 3>(1);
    const [paymentModalMethod, setPaymentModalMethod] = useState<'wallet_balance' | 'credit_card' | 'bank_transfer'>('wallet_balance');

    // Deposit Modal
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositStep, setDepositStep] = useState<1 | 2 | 3>(1);
    const [depositForm, setDepositForm] = useState({
        amount: 100,
        paymentMethod: 'credit_card' as 'credit_card' | 'bank_transfer',
        description: t('billing.defaultDepositDesc')
    });

    // Card Form State
    const [cardForm, setCardForm] = useState({
        number: '',
        name: '',
        expiry: '',
        cvv: ''
    });
    const [cardFocused, setCardFocused] = useState<'number' | 'name' | 'expiry' | 'cvv' | null>(null);
    const [cardTilt, setCardTilt] = useState({ rotateX: 0, rotateY: 0 });

    const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (cardFocused === 'cvv') return; // Do not tilt when card is flipped
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        // Subtle premium rotation (up to 12 degrees)
        const rotateX = ((centerY - y) / centerY) * 12;
        const rotateY = ((x - centerX) / centerX) * 12;
        setCardTilt({ rotateX, rotateY });
    };

    const handleCardMouseLeave = () => {
        setCardTilt({ rotateX: 0, rotateY: 0 });
    };

    const PRESET_AMOUNTS = [
        { amount: 50, label: '50 EUR', bonus: 0 },
        { amount: 100, label: '100 EUR', bonus: 0 },
        { amount: 200, label: '200 EUR', bonus: 10, badge: '%10 Bonus' },
        { amount: 500, label: '500 EUR', bonus: 20, badge: '%20 Bonus' }
    ];

    // 3D Secure Verification Simulator Modal
    const [showOTPModal, setShowOTPModal] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [otpError, setOtpError] = useState<string | null>(null);
    const [otpLoading, setOtpLoading] = useState(false);

    // Bulk Purchase Modal
    const [showBulkModal, setShowBulkModal] = useState<SubscriptionPlan | null>(null);
    const [bulkMonths, setBulkMonths] = useState<6 | 12>(12);

    // Module Purchase Modal
    const [showModulePurchaseModal, setShowModulePurchaseModal] = useState<{
        code: string;
        name: string;
        monthlyPrice: number;
        setupPrice: number;
    } | null>(null);

    const [purchaseResult, setPurchaseResult] = useState<{
        success: boolean;
        message: string;
        moduleName: string;
        price: number;
    } | null>(null);
    const [confirmWalletPayment, setConfirmWalletPayment] = useState(true);

    const copyToClipboard = (text: string, label: string) => {
        void navigator.clipboard.writeText(text);
        toast.success(tpl(t, 'billing.toastCopied', { label }));
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        const headers = getAuthHeaders();
        try {
            // 1. Billing Status
            const statusRes = await fetch('/api/v1/billing/status', { headers });
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                setStatus(statusData);
            }

            // 2. Wallet Transactions
            if (tenantId) {
                const txRes = await fetch(`/api/v1/billing/tenants/${tenantId}/wallet/transactions`, { headers });
                if (txRes.ok) {
                    const txData = await txRes.json();
                    setTransactions(txData || []);
                }
            }

            // 3. Payment History / Invoices
            const payRes = await fetch('/api/v1/billing/payments', { headers });
            if (payRes.ok) {
                const payData = await payRes.json();
                setPayments(payData || []);
            }

            // 4. Subscription Plans
            const planRes = await fetch('/api/v1/billing/plans', { headers });
            if (planRes.ok) {
                const planData = await planRes.json();
                setPlans(planData || []);
            }

            // 5. System Modules
            const modRes = await fetch('/api/v1/billing/modules', { headers });
            if (modRes.ok) {
                const modData = await modRes.json();
                setModules(modData || []);
            }

        } catch (error) {
            console.error('[ERROR] load billing data:', error);
            toast.error(t('billing.toastLoadDataFailed'));
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, tenantId, t]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (showDepositModal) {
            setDepositForm(prev => ({
                ...prev,
                description: t('billing.defaultDepositDesc')
            }));
        }
    }, [showDepositModal, t]);

    // Top up wallet
    const handleDeposit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (depositForm.amount <= 0) {
            toast.error(t('billing.toastAmountMinError'));
            return;
        }

        if (depositForm.paymentMethod === 'credit_card') {
            setActionLoading('deposit');
            const headers = getAuthHeaders();
            try {
                const res = await fetch(`/api/v1/billing/tenants/${tenantId}/wallet/deposit`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: depositForm.amount,
                        paymentMethod: 'credit_card',
                        description: depositForm.description,
                    }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    requiresPayment?: boolean;
                    paymentUrl?: string;
                    message?: string;
                };
                if (res.ok && data.requiresPayment && data.paymentUrl) {
                    window.location.href = data.paymentUrl;
                    return;
                }
                if (res.ok) {
                    toast.success(data.message || t('billing.toastDepositSuccess'));
                    setShowDepositModal(false);
                    void loadData();
                } else {
                    toast.error(data.error || t('billing.toastDepositFailed'));
                }
            } catch {
                toast.error(t('billing.toastConnectionError'));
            } finally {
                setActionLoading(null);
            }
            return;
        }

        setActionLoading('deposit');
        const headers = getAuthHeaders();
        try {
            const res = await fetch(`/api/v1/billing/tenants/${tenantId}/wallet/deposit`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(depositForm)
            });

            if (res.ok) {
                const data = await res.json();
                if (data.status === 'pending') {
                    toast.success(data.message || t('billing.toastTransferPending'));
                    setShowDepositModal(false);
                } else {
                    toast.success(t('billing.toastDepositInstantSuccess'));
                    setShowDepositModal(false);
                }
                void loadData();
            } else {
                const err = await res.json();
                toast.error(err.error || t('billing.toastDepositFailed'));
            }
        } catch (error) {
            toast.error(t('billing.toastConnectionError'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleOTPSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otpCode !== '123456') {
            setOtpError(t('billing.otpError'));
            return;
        }

        setOtpLoading(true);
        setOtpError(null);
        const headers = getAuthHeaders();
        try {
            const res = await fetch(`/api/v1/billing/tenants/${tenantId}/wallet/deposit`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: depositForm.amount,
                    paymentMethod: 'credit_card',
                    description: depositForm.description,
                    isDirectSimulated: true
                })
            });

            if (res.ok) {
                toast.success(t('billing.toastDepositSuccess'));
                setShowOTPModal(false);
                setShowDepositModal(false);
                setCardForm({ number: '', name: '', expiry: '', cvv: '' });
                setOtpCode('');
                void loadData();
            } else {
                const err = await res.json();
                setOtpError(err.error || t('billing.toastDepositFailed'));
            }
        } catch (error) {
            setOtpError(t('billing.toastConnectionError'));
        } finally {
            setOtpLoading(false);
        }
    };

    // Pay invoice online (checkout link)
    const handlePayOnline = async (paymentHistoryId: number) => {
        setActionLoading(`pay_${paymentHistoryId}`);
        try {
            const link = await fetchCheckoutLink(paymentHistoryId);
            if (link) {
                const w = window.open(link, '_blank');
                if (!w) {
                    toast.error(t('billing.popupBlockedError'));
                }
            }
        } catch (error: any) {
            toast.error(error.message || t('billing.paymentLinkError'));
        } finally {
            setActionLoading(null);
        }
    };

    // Purchase Bulk Plan
    const handlePurchaseBulk = async () => {
        if (!showBulkModal) return;
        setActionLoading(`bulk_${showBulkModal.code}`);
        const headers = getAuthHeaders();
        try {
            const res = await fetch(`/api/v1/billing/tenants/${tenantId}/plans/purchase-bulk`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planCode: showBulkModal.code,
                    months: bulkMonths
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || t('billing.toastBulkSuccess'));
                setShowBulkModal(null);
                void loadData();
            } else {
                const err = await res.json();
                toast.error(err.error || t('billing.toastBulkFailed'));
            }
        } catch (error) {
            toast.error(t('billing.toastConnectionFailed'));
        } finally {
            setActionLoading(null);
        }
    };

    // Purchase individual module
    const handlePurchaseModule = async (moduleCode: string) => {
        if (!showModulePurchaseModal) return;
        setActionLoading(`mod_${moduleCode}`);
        const headers = getAuthHeaders();
        try {
            const res = await fetch(`/api/v1/billing/tenants/${tenantId}/modules/${moduleCode}/purchase`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' }
            });

            const totalCost = showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice;

            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || t('billing.toastModuleSuccess'));
                setPurchaseResult({
                    success: true,
                    message: data.message || t('billing.toastModuleSuccess'),
                    moduleName: showModulePurchaseModal.name,
                    price: totalCost
                });
                void loadData();
            } else {
                const err = await res.json();
                toast.error(err.error || t('billing.toastModuleFailed'));
                setPurchaseResult({
                    success: false,
                    message: err.error || t('billing.toastModuleFailed'),
                    moduleName: showModulePurchaseModal.name,
                    price: totalCost
                });
            }
        } catch (error) {
            toast.error(t('billing.toastConnectionFailed'));
            setPurchaseResult({
                success: false,
                message: t('billing.toastConnectionError'),
                moduleName: showModulePurchaseModal.name,
                price: showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice
            });
        } finally {
            setActionLoading(null);
        }
    };

    if (loading && !status) {
        return (
            <div className="flex h-full items-center justify-center bg-[#020617] text-white">
                <div className="flex flex-col items-center gap-3">
                    <FiLoader className="animate-spin text-[#38BDF8]" size={36} />
                    <p className="text-sm font-bold text-slate-400">{t('billing.loading')}</p>
                </div>
            </div>
        );
    }

    const walletBalance = status?.walletBalance ?? 0;
    const isNegativeBalance = walletBalance < 0;

    return (
        <div className="flex min-h-screen flex-col bg-[#020617] text-slate-100 relative overflow-x-hidden font-sans p-4 sm:p-6 md:p-8">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-pink-500/10 rounded-full blur-[150px] pointer-events-none" />

            {/* Header */}
            <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-slate-100 via-slate-300 to-slate-400 bg-clip-text text-transparent flex items-center gap-3">
                        <FiCreditCard className="text-[#38BDF8] shrink-0" /> {t('billing.title')}
                    </h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                        {t('billing.subtitle')}
                    </p>
                </div>
                <button
                    onClick={() => void loadData()}
                    className="self-start px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-xs font-bold transition-all"
                >
                    {t('billing.updateData')}
                </button>
            </header>

            {/* Main Billing Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                
                {/* Left Column: Wallet & Billing Status (Spans 5 cols) */}
                <div className="xl:col-span-5 space-y-6">
                    
                    {/* Wallet Balance Card */}
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-6 relative overflow-hidden transition-all duration-300">
                        <div className="absolute -right-6 -top-6 bg-[#38BDF8]/5 w-32 h-32 rounded-full blur-2xl opacity-60"></div>
                        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <FiDollarSign className="text-[#38BDF8]" /> {t('billing.walletBalance')}
                            </span>
                            {isNegativeBalance && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 border border-rose-500/30 text-rose-400 animate-pulse">
                                    {t('billing.insufficientBalance')}
                                </span>
                            )}
                        </div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className={`text-4xl sm:text-5xl font-black tracking-tight ${isNegativeBalance ? 'text-rose-400' : 'text-slate-100'}`}>
                                {Number(walletBalance).toFixed(2)}
                            </span>
                            <span className="text-xl font-bold text-slate-400">EUR</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">
                            {t('billing.walletDisclaimer')}
                        </p>

                        <div className="mt-5 flex gap-3">
                            <button
                                onClick={() => {
                                    setDepositStep(1);
                                    setCardForm({ number: '', name: '', expiry: '', cvv: '' });
                                    setDepositForm({
                                        amount: 100,
                                        paymentMethod: 'credit_card',
                                        description: t('billing.defaultDepositDesc')
                                    });
                                    setShowDepositModal(true);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#38BDF8] to-blue-600 hover:from-[#4dd0ff] hover:to-blue-500 text-black font-black uppercase text-xs rounded-xl shadow-lg shadow-blue-500/10 transition-all active:scale-[0.97]"
                            >
                                <FiPlus size={16} /> {t('billing.topUp')}
                            </button>
                        </div>
                    </div>

                    {/* Active Subscription Status Card */}
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-6 relative overflow-hidden transition-all duration-300">
                        <div className="absolute -right-6 -top-6 bg-pink-500/5 w-32 h-32 rounded-full blur-2xl opacity-60"></div>
                        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <FiActivity className="text-pink-400" /> {t('billing.planStatus')}
                            </span>
                            {status?.nextPaymentDue && (
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                    status.daysRemaining !== null && status.daysRemaining <= 7
                                        ? 'bg-amber-500/25 border-amber-500/30 text-amber-400'
                                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                }`}>
                                    {status.daysRemaining !== null && status.daysRemaining <= 0 ? t('billing.overdue') : t('billing.active')}
                                </span>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400">{t('billing.currentSub')}</span>
                                <span className="text-sm font-black text-[#38BDF8] uppercase tracking-wide">
                                    {status?.planCode || t('billing.planUndefined')}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400">{t('billing.dueDate')}</span>
                                <span className="text-sm font-black text-slate-200">
                                    {status?.nextPaymentDue || t('billing.uncertain')}
                                </span>
                            </div>
                            {status && status.daysRemaining !== null && (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400">{t('billing.remainingTime')}</span>
                                    <span className={`text-sm font-black ${
                                        status.daysRemaining <= 7 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'
                                    }`}>
                                        {status.daysRemaining <= 0 ? t('billing.expired') : tpl(t, 'billing.days', { n: status.daysRemaining })}
                                    </span>
                                </div>
                            )}
                            {status && status.maxDevices && (
                                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                    <span className="text-xs font-bold text-slate-400">{t('billing.deviceLimit')}</span>
                                    <span className="text-sm font-black text-slate-200">
                                        {status.maxDevices.total} <span className="text-slate-500 text-xs font-medium">{tpl(t, 'billing.deviceLimitDetail', { base: status.maxDevices.base, extra: status.maxDevices.extra })}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Upgrade Plans & Modules Catalog (Spans 7 cols) */}
                <div className="xl:col-span-7 space-y-6">
                    
                    {/* Subscription Upgrades & Bulk Lock Section */}
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-6 relative">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-5">
                            <FiLayers className="text-[#38BDF8]" /> {t('billing.upgradeTitle')}
                        </h3>

                        {plans.length === 0 ? (
                            <p className="text-xs font-bold text-slate-500 text-center py-4">{t('billing.noPlans')}</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {plans.map((p) => {
                                    const isCurrent = status?.planCode === p.code;
                                    return (
                                        <div 
                                            key={p.id} 
                                            className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                                                isCurrent 
                                                    ? 'bg-blue-950/20 border-blue-500/30 shadow-md shadow-blue-950/10' 
                                                    : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                                            }`}
                                        >
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-black text-sm text-slate-100">{p.name}</h4>
                                                    {isCurrent && (
                                                        <span className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                                                            {t('billing.currentPlan')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline gap-1 my-3">
                                                    <span className="text-2xl font-black text-[#38BDF8]">{Number(p.monthly_fee).toFixed(0)}</span>
                                                    <span className="text-xs font-bold text-slate-400">{t('billing.eurMonth')}</span>
                                                </div>
                                                <ul className="text-[10px] text-slate-400 space-y-1.5 my-3 border-t border-white/5 pt-3">
                                                    <li dangerouslySetInnerHTML={{ __html: tpl(t, 'billing.planMaxUsers', { n: p.max_users }) }} />
                                                    <li dangerouslySetInnerHTML={{ __html: tpl(t, 'billing.planMaxBranches', { n: p.max_branches }) }} />
                                                    <li dangerouslySetInnerHTML={{ __html: tpl(t, 'billing.planMaxDevices', { n: p.max_devices }) }} />
                                                    <li dangerouslySetInnerHTML={{ __html: tpl(t, 'billing.planSupport', { support: p.support_hours }) }} />
                                                </ul>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setBulkMonths(12);
                                                    setShowBulkModal(p);
                                                }}
                                                className={`w-full py-2 rounded-lg text-xs font-black uppercase tracking-wider mt-3 transition-all ${
                                                    isCurrent 
                                                        ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/35'
                                                        : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                                                }`}
                                            >
                                                {isCurrent ? t('billing.upgradeButtonCurrent') : t('billing.upgradeButtonSelect')}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Addon Modules Catalog Section */}
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-6 relative">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <FiPackage className="text-pink-400" /> {t('billing.addonsTitle')}
                        </h3>

                        {modules.length === 0 ? (
                            <p className="text-xs font-bold text-slate-500 text-center py-4">{t('billing.noModules')}</p>
                        ) : (
                            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                                {modules.map((m) => {
                                    const isActivated = status?.entitlements?.some(e => e.code === m.code && e.enabled);
                                    return (
                                        <div 
                                            key={m.code} 
                                            className="bg-white/[0.01] border border-white/5 rounded-xl p-3.5 flex items-center justify-between gap-4 transition-all hover:bg-white/[0.02]"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-xs text-slate-200 truncate">{m.name}</h4>
                                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                                                        {m.category}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-1 truncate">{m.description || t('billing.addonDefaultDesc')}</p>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="text-right">
                                                    <span className="block text-xs font-black text-emerald-400">
                                                        {Number(m.monthly_price) > 0 ? `${Number(m.monthly_price).toFixed(0)} € / ${t('billing.eurMonth').split('/')[1]?.trim() || 'ay'}` : t('billing.gift')}
                                                    </span>
                                                    {Number(m.setup_price) > 0 && (
                                                        <span className="block text-[8px] font-medium text-slate-500">
                                                            +{Number(m.setup_price).toFixed(0)} € {t('billing.setupPrice')}
                                                        </span>
                                                    )}
                                                </div>

                                                {isActivated ? (
                                                    <span className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-400">
                                                        {t('billing.active')}
                                                    </span>
                                                ) : (
                                                    <button
                                                        disabled={actionLoading === `mod_${m.code}`}
                                                        onClick={() => setShowModulePurchaseModal({
                                                            code: m.code,
                                                            name: m.name,
                                                            monthlyPrice: Number(m.monthly_price),
                                                            setupPrice: Number(m.setup_price)
                                                        })}
                                                        className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/30 rounded-lg text-[9px] font-black uppercase text-emerald-400 tracking-wider transition-all disabled:opacity-50"
                                                    >
                                                        {actionLoading === `mod_${m.code}` ? t('billing.processing') : t('billing.buy')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Section: Tabbed Logs (Invoices & Wallet Transactions) */}
            <div className="mt-6 md:mt-8 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/5 pb-4 mb-4 sm:mb-6">
                    <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar -mx-1 px-1">
                        <button
                            onClick={() => setActiveTab('invoices')}
                            className={`shrink-0 pb-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-wider relative transition-all whitespace-nowrap ${
                                activeTab === 'invoices' ? 'text-[#38BDF8]' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {t('billing.tabInvoices')}
                            {activeTab === 'invoices' && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#38BDF8] to-blue-500 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('wallet')}
                            className={`shrink-0 pb-3 px-1 text-[10px] sm:text-xs font-black uppercase tracking-wider relative transition-all whitespace-nowrap ${
                                activeTab === 'wallet' ? 'text-[#38BDF8]' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {t('billing.tabWalletHistory')}
                            {activeTab === 'wallet' && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#38BDF8] to-blue-500 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Tab: Invoices */}
                {activeTab === 'invoices' && (
                    <>
                        {payments.length === 0 ? (
                            <p className="text-xs font-bold text-slate-500 text-center py-8">{t('billing.noInvoices')}</p>
                        ) : (
                            <>
                                {/* Mobil: kart listesi */}
                                <div className="md:hidden space-y-3">
                                    {payments.map((p) => {
                                        const invoiceNo = p.description?.includes('INV-')
                                            ? p.description.match(/INV-[A-Z0-9]+/)?.[0]
                                            : `#${p.id}`;
                                        return (
                                            <div
                                                key={p.id}
                                                className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                                            {new Date(p.created_at).toLocaleDateString(lang)}
                                                        </p>
                                                        <p className="font-mono text-sm font-black text-slate-100 truncate mt-0.5">
                                                            {invoiceNo}
                                                        </p>
                                                    </div>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                                        p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                        p.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' :
                                                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    }`}>
                                                        {p.status === 'paid' ? t('billing.paid') :
                                                         p.status === 'overdue' ? t('billing.overdue') : t('billing.pending')}
                                                    </span>
                                                </div>
                                                {p.description && (
                                                    <p className="text-[11px] text-slate-400 leading-snug line-clamp-2" title={p.description}>
                                                        {p.description}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] uppercase font-black">
                                                        {p.payment_type}
                                                    </span>
                                                    <span className="text-base font-black text-slate-100 tabular-nums">
                                                        {Number(p.amount).toFixed(2)} {p.currency || 'EUR'}
                                                    </span>
                                                </div>
                                                {isWalletPayableInvoice(p) ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setPaymentModalStep(1);
                                                            setPaymentModalMethod(walletBalance >= p.amount ? 'wallet_balance' : 'credit_card');
                                                            setShowPaymentModal(p);
                                                        }}
                                                        className="w-full py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 border border-rose-500/30 rounded-lg text-[10px] font-black uppercase text-white tracking-wider transition-all"
                                                    >
                                                        {t('billing.pay')}
                                                    </button>
                                                ) : (
                                                    <p className="text-[10px] text-slate-500 text-center">
                                                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString(lang) : '-'}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Masaüstü: tablo */}
                                <div className="hidden md:block overflow-x-auto no-scrollbar">
                                    <table className="w-full border-collapse text-left min-w-[640px]">
                                        <thead>
                                            <tr className="border-b border-white/5 text-[10px] font-black uppercase text-slate-500">
                                                <th className="py-3 px-4">{t('billing.tableDate')}</th>
                                                <th className="py-3 px-4">{t('billing.tableInvoiceNo')}</th>
                                                <th className="py-3 px-4">{t('billing.tableDescription')}</th>
                                                <th className="py-3 px-4">{t('billing.tableType')}</th>
                                                <th className="py-3 px-4">{t('billing.tableAmount')}</th>
                                                <th className="py-3 px-4">{t('billing.tableStatus')}</th>
                                                <th className="py-3 px-4 text-right">{t('billing.tableAction')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs font-bold divide-y divide-white/[0.02] text-slate-300">
                                            {payments.map((p) => (
                                                <tr key={p.id} className="hover:bg-white/[0.01] transition-colors">
                                                    <td className="py-3 px-4 font-normal text-[11px] text-slate-500">
                                                        {new Date(p.created_at).toLocaleDateString(lang)}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-[11px] text-slate-200">
                                                        {p.description?.includes('INV-') 
                                                            ? p.description.match(/INV-[A-Z0-9]+/)?.[0] 
                                                            : `#${p.id}`}
                                                    </td>
                                                    <td className="py-3 px-4 font-normal max-w-xs truncate" title={p.description || ''}>
                                                        {p.description}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-black">
                                                            {p.payment_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-black text-slate-100">
                                                        {Number(p.amount).toFixed(2)} {p.currency || 'EUR'}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                            p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                            p.status === 'overdue' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' :
                                                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                        }`}>
                                                            {p.status === 'paid' ? t('billing.paid') :
                                                             p.status === 'overdue' ? t('billing.overdue') : t('billing.pending')}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        {isWalletPayableInvoice(p) ? (
                                                            <button
                                                                onClick={() => {
                                                                    setPaymentModalStep(1);
                                                                    setPaymentModalMethod(walletBalance >= p.amount ? 'wallet_balance' : 'credit_card');
                                                                    setShowPaymentModal(p);
                                                                }}
                                                                className="px-3.5 py-1.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 border border-rose-500/30 rounded-lg text-[10px] font-black uppercase text-white tracking-wider transition-all shadow-lg shadow-rose-950/20"
                                                            >
                                                                {t('billing.pay')}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[10px] font-normal text-slate-500">
                                                                {p.paid_at ? new Date(p.paid_at).toLocaleDateString(lang) : '-'}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* Tab: Wallet Logs */}
                {activeTab === 'wallet' && (
                    <>
                        {transactions.length === 0 ? (
                            <p className="text-xs font-bold text-slate-500 text-center py-8">{t('billing.walletLogsTitle')}</p>
                        ) : (
                            <>
                                {/* Mobil: kart listesi */}
                                <div className="md:hidden space-y-3">
                                    {transactions.map((tx) => {
                                        const isDeposit = tx.amount > 0;
                                        return (
                                            <div
                                                key={tx.id}
                                                className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                                            {new Date(tx.createdAt).toLocaleDateString(lang)}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                                            {new Date(tx.createdAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] uppercase font-black ${
                                                        tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        tx.type === 'bonus' ? 'bg-amber-500/10 text-amber-400' :
                                                        'bg-slate-800 text-slate-400'
                                                    }`}>
                                                        {tx.type}
                                                    </span>
                                                </div>
                                                {tx.description && (
                                                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-3" title={tx.description}>
                                                        {tx.description}
                                                    </p>
                                                )}
                                                <p className={`text-xl font-black tabular-nums ${isDeposit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {isDeposit ? '+' : ''}{Number(tx.amount).toFixed(2)} EUR
                                                </p>
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px]">
                                                    <div>
                                                        <p className="text-slate-500 font-bold uppercase tracking-wider mb-0.5">{t('billing.balanceBefore')}</p>
                                                        <p className="font-black text-slate-400 tabular-nums">{Number(tx.balanceBefore).toFixed(2)} EUR</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-slate-500 font-bold uppercase tracking-wider mb-0.5">{t('billing.balanceAfter')}</p>
                                                        <p className="font-black text-slate-200 tabular-nums">{Number(tx.balanceAfter).toFixed(2)} EUR</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Masaüstü: tablo */}
                                <div className="hidden md:block overflow-x-auto no-scrollbar">
                                    <table className="w-full border-collapse text-left min-w-[560px]">
                                        <thead>
                                            <tr className="border-b border-white/5 text-[10px] font-black uppercase text-slate-500">
                                                <th className="py-3 px-4">{t('billing.tableDate')}</th>
                                                <th className="py-3 px-4">{t('billing.tableDescription')}</th>
                                                <th className="py-3 px-4">{t('billing.tableType')}</th>
                                                <th className="py-3 px-4">{t('billing.tableAmount')}</th>
                                                <th className="py-3 px-4">{t('billing.balanceBefore')}</th>
                                                <th className="py-3 px-4">{t('billing.balanceAfter')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs font-bold divide-y divide-white/[0.02] text-slate-300">
                                            {transactions.map((tx) => {
                                                const isDeposit = tx.amount > 0;
                                                return (
                                                    <tr key={tx.id} className="hover:bg-white/[0.01] transition-colors">
                                                        <td className="py-3 px-4 font-normal text-[11px] text-slate-500">
                                                            {new Date(tx.createdAt).toLocaleString(lang)}
                                                        </td>
                                                        <td className="py-3 px-4 font-normal max-w-sm truncate" title={tx.description || ''}>
                                                            {tx.description}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-black ${
                                                                tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' :
                                                                tx.type === 'bonus' ? 'bg-amber-500/10 text-amber-400' :
                                                                'bg-slate-800 text-slate-400'
                                                            }`}>
                                                                {tx.type}
                                                            </span>
                                                        </td>
                                                        <td className={`py-3 px-4 font-black ${isDeposit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {isDeposit ? '+' : ''}{Number(tx.amount).toFixed(2)} EUR
                                                        </td>
                                                        <td className="py-3 px-4 font-normal text-slate-400">
                                                            {Number(tx.balanceBefore).toFixed(2)} EUR
                                                        </td>
                                                        <td className="py-3 px-4 font-black text-slate-200">
                                                            {Number(tx.balanceAfter).toFixed(2)} EUR
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Unified Invoice Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#0b1322] border border-white/10 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 text-slate-100">
                        <div className="px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a]/60">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <FiCreditCard className="text-[#38BDF8]" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-200">{t('billing.invoicePayTitle')}</h3>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{tpl(t, 'billing.invoiceLabel', { description: showPaymentModal.description || `#${showPaymentModal.id}` })}</p>
                                </div>
                            </div>
                            
                            {/* Stepped Progress Indicator */}
                            <div className="flex items-center gap-2 text-xs font-bold">
                                <span className={`px-2.5 py-1 rounded-full ${paymentModalStep >= 1 ? 'bg-[#38BDF8] text-black' : 'bg-white/5 text-slate-500'}`}>{t('billing.stepMethodLabel')}</span>
                                <span className="h-px w-6 bg-white/10" />
                                <span className={`px-2.5 py-1 rounded-full ${paymentModalStep >= 2 ? 'bg-[#38BDF8] text-black' : 'bg-white/5 text-slate-500'}`}>{t('billing.stepDetailsLabel')}</span>
                            </div>
                        </div>

                        {/* Step 1: Method Selection */}
                        {paymentModalStep === 1 && (
                            <div className="p-6 space-y-6 animate-in fade-in duration-300">
                                <div>
                                    <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-2">{t('billing.choosePaymentMethod')}</h4>
                                    <p className="text-xs text-slate-400">
                                        {(() => {
                                            const text = t('billing.invoiceAmountText');
                                            const parts = text.split('{{amount}}');
                                            if (parts.length === 2) {
                                                return (
                                                    <>
                                                        {parts[0]}
                                                        <strong className="text-[#38BDF8] text-sm">{Number(showPaymentModal.amount).toFixed(2)}</strong>
                                                        {parts[1]}
                                                    </>
                                                );
                                            }
                                            return text;
                                        })()}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Cüzdan Bakiyesi Button */}
                                    <button
                                        type="button"
                                        onClick={() => setPaymentModalMethod('wallet_balance')}
                                        className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-44 relative overflow-hidden ${
                                            paymentModalMethod === 'wallet_balance'
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8] shadow-lg shadow-blue-500/10'
                                                : 'bg-white/[0.01] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start w-full">
                                            <FiDollarSign className="text-2xl" />
                                            {walletBalance >= showPaymentModal.amount ? (
                                                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider">
                                                    {t('billing.sufficientBalance')}
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-wider">
                                                    {t('billing.insufficientBalance')}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <span className="text-lg font-black block text-slate-200">{t('billing.walletBalanceTitle')}</span>
                                            <span className="text-xs font-medium text-slate-400 mt-1 block leading-relaxed">
                                                {t('billing.walletBalanceDesc')}
                                            </span>
                                        </div>
                                    </button>

                                    {/* Credit Card Button */}
                                    <button
                                        type="button"
                                        onClick={() => setPaymentModalMethod('credit_card')}
                                        className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-44 relative overflow-hidden ${
                                            paymentModalMethod === 'credit_card'
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8] shadow-lg shadow-blue-500/10'
                                                : 'bg-white/[0.01] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start w-full">
                                            <FiCreditCard className="text-2xl" />
                                            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider">
                                                {t('billing.onlinePay')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-lg font-black block text-slate-200">{t('billing.creditCard')}</span>
                                            <span className="text-xs font-medium text-slate-400 mt-1 block leading-relaxed">
                                                {t('billing.creditCardDesc')}
                                            </span>
                                        </div>
                                    </button>

                                    {/* Bank Transfer Button */}
                                    <button
                                        type="button"
                                        onClick={() => setPaymentModalMethod('bank_transfer')}
                                        className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-44 relative overflow-hidden ${
                                            paymentModalMethod === 'bank_transfer'
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8] shadow-lg shadow-blue-500/10'
                                                : 'bg-white/[0.01] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start w-full">
                                            <FiGlobe className="text-2xl" />
                                            <span className="px-2.5 py-0.5 rounded bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider">
                                                {t('billing.transferApprovalTime')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-lg font-black block text-slate-200">{t('billing.bankTransfer')}</span>
                                            <span className="text-xs font-medium text-slate-400 mt-1 block leading-relaxed">
                                                {t('billing.bankTransferDesc')}
                                            </span>
                                        </div>
                                    </button>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(null)}
                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                    >
                                        {t('billing.cancelSimple')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentModalStep(2)}
                                        className="px-6 py-3 bg-gradient-to-r from-[#38BDF8] to-blue-600 hover:from-[#4dd0ff] hover:to-blue-500 text-black font-black uppercase text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                                    >
                                        {t('billing.goToDetails')} <FiChevronRight />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Payment Details */}
                        {paymentModalStep === 2 && (
                            <div className="animate-in fade-in duration-300">
                                {paymentModalMethod === 'wallet_balance' && (
                                    <div className="p-6 space-y-6">
                                        <div>
                                            <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-2">{t('billing.walletPayDetailsTitle')}</h4>
                                            <p className="text-xs text-slate-400">{t('billing.walletPayDetailsDesc')}</p>
                                        </div>

                                        <div className="bg-[#020617]/50 border border-white/5 p-4 rounded-xl text-xs space-y-2.5">
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">{t('billing.payableAmount')}</span>
                                                <span className="font-black text-slate-200">{Number(showPaymentModal.amount).toFixed(2)} EUR</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">{t('billing.walletBalance')}:</span>
                                                <span className="font-black text-slate-200">{Number(walletBalance).toFixed(2)} EUR</span>
                                            </div>
                                            {walletBalance >= showPaymentModal.amount ? (
                                                <div className="flex justify-between border-t border-white/5 pt-2 text-sm font-black text-slate-100">
                                                    <span>{t('billing.balanceAfterPayLabel')}</span>
                                                    <span className="text-emerald-400">{(Number(walletBalance) - Number(showPaymentModal.amount)).toFixed(2)} EUR</span>
                                                </div>
                                            ) : (
                                                <div className="flex justify-between border-t border-white/5 pt-2 text-sm font-black text-slate-100">
                                                    <span>{t('billing.missingAmountLabel')}</span>
                                                    <span className="text-rose-400">{(Number(showPaymentModal.amount) - Number(walletBalance)).toFixed(2)} EUR</span>
                                                </div>
                                            )}
                                        </div>

                                        {walletBalance < showPaymentModal.amount && (
                                            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-bold rounded-xl leading-relaxed">
                                                {t('billing.invoiceWalletInsufficientDesc')}
                                            </div>
                                        )}

                                        <div className="flex justify-between pt-6 border-t border-white/5">
                                            <button
                                                type="button"
                                                onClick={() => setPaymentModalStep(1)}
                                                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                            >
                                                {t('billing.back')}
                                            </button>
                                            {walletBalance >= showPaymentModal.amount ? (
                                                <button
                                                    type="button"
                                                    disabled={actionLoading === `pay_wallet_${showPaymentModal.id}`}
                                                    onClick={async () => {
                                                        setActionLoading(`pay_wallet_${showPaymentModal.id}`);
                                                        const ok = await usePosStore.getState().payInvoiceWithWallet(showPaymentModal.id);
                                                        setActionLoading(null);
                                                        if (ok) {
                                                            setShowPaymentModal(null);
                                                            void loadData();
                                                        }
                                                    }}
                                                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                                                >
                                                    {actionLoading === `pay_wallet_${showPaymentModal.id}` ? t('billing.processing') : t('billing.payWithWalletConfirm')}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const needed = Math.ceil(Number(showPaymentModal.amount) - Number(walletBalance));
                                                        setDepositForm({
                                                            amount: Math.max(10, needed),
                                                            paymentMethod: 'credit_card',
                                                            description: tpl(t, 'billing.depositForInvoiceDesc', { desc: showPaymentModal.description || `#${showPaymentModal.id}` })
                                                        });
                                                        setDepositStep(1);
                                                        setShowPaymentModal(null);
                                                        setShowDepositModal(true);
                                                    }}
                                                    className="px-6 py-3 bg-gradient-to-r from-[#38BDF8] to-blue-600 hover:from-[#4dd0ff] hover:to-blue-500 text-black font-black uppercase text-xs rounded-xl shadow-lg transition-all"
                                                >
                                                    {t('billing.topUp')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {paymentModalMethod === 'credit_card' && (
                                    <div className="p-6 space-y-6">
                                        <div>
                                            <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-2">{t('billing.creditCardPayTitle')}</h4>
                                            <p className="text-xs text-slate-400">{t('billing.creditCardPayDesc')}</p>
                                        </div>

                                        <div className="bg-[#020617]/50 border border-white/5 p-4 rounded-xl text-xs space-y-2">
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">{t('billing.tableInvoiceNo')} / {t('billing.tableDescription')}:</span>
                                                <span className="text-slate-200 font-bold">{showPaymentModal.description || `#${showPaymentModal.id}`}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">{t('billing.totalToPayLabel')}</span>
                                                <span className="font-black text-[#38BDF8] text-sm">{Number(showPaymentModal.amount).toFixed(2)} EUR</span>
                                            </div>
                                        </div>

                                        <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-bold rounded-xl leading-relaxed flex items-center gap-2">
                                            {t('billing.stripeRedirectNote')}
                                        </div>

                                        <div className="flex justify-between pt-6 border-t border-white/5">
                                            <button
                                                type="button"
                                                onClick={() => setPaymentModalStep(1)}
                                                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                            >
                                                {t('billing.back')}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={actionLoading === `pay_${showPaymentModal.id}`}
                                                onClick={async () => {
                                                    setShowPaymentModal(null);
                                                    await handlePayOnline(showPaymentModal.id);
                                                }}
                                                className="px-6 py-3 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                                            >
                                                {actionLoading === `pay_${showPaymentModal.id}` ? t('billing.processing') : t('billing.goToCardPaymentPage')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {paymentModalMethod === 'bank_transfer' && (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
                                        {/* Column 1: Bank card details (Spans 6 cols) */}
                                        <div className="lg:col-span-6 flex flex-col justify-center items-center space-y-6 border-b lg:border-b-0 lg:border-r border-white/5 pb-6 lg:pb-0 lg:pr-6">
                                            <div>
                                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center mb-4">{t('billing.bankDetailsTitle')}</h5>
                                                
                                                {/* Premium Bank Account Card */}
                                                <div className="relative w-[320px] h-[190px] rounded-3xl bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] border border-white/10 p-5 flex flex-col justify-between text-white shadow-2xl relative overflow-hidden select-none">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#38BDF8]/5 rounded-full blur-2xl pointer-events-none"></div>
                                                    
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-black tracking-widest text-[#38BDF8] uppercase">DEUTSCHE BANK AG</span>
                                                        <FiGlobe className="text-slate-400" size={20} />
                                                    </div>

                                                    <div className="space-y-2 py-2">
                                                        <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-slate-400">
                                                            <span>{t('billing.bankReceiverName')}</span>
                                                            <button 
                                                                onClick={() => copyToClipboard('NextPOS Technologies GmbH', t('billing.bankReceiverName'))}
                                                                className="text-[#38BDF8] hover:underline flex items-center gap-0.5"
                                                            >
                                                                <FiCopy size={8} /> {t('billing.copy')}
                                                            </button>
                                                        </div>
                                                        <div className="text-xs font-mono font-bold truncate text-slate-200">NextPOS Technologies GmbH</div>
                                                        
                                                        <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-slate-400">
                                                            <span>{t('billing.bankIban')}</span>
                                                            <button 
                                                                onClick={() => copyToClipboard('DE89370400440532991100', 'IBAN')}
                                                                className="text-[#38BDF8] hover:underline flex items-center gap-0.5"
                                                            >
                                                                <FiCopy size={8} /> {t('billing.copy')}
                                                            </button>
                                                        </div>
                                                        <div className="text-xs font-mono font-bold tracking-wider text-slate-200">DE89 3704 0044 0532 9911 00</div>
                                                    </div>

                                                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 border-t border-white/5 pt-2">
                                                        <div>
                                                            <span className="block text-[6px] text-slate-500 uppercase">BIC/SWIFT</span>
                                                            <span className="font-mono text-slate-200">DEUTDEDBXXX</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-[6px] text-slate-500 uppercase">{t('billing.bankRefCode')}</span>
                                                            <span className="font-mono text-[#38BDF8]">INV-{showPaymentModal.id}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div 
                                                className="text-[10px] text-slate-500 text-center leading-relaxed"
                                                dangerouslySetInnerHTML={{
                                                    __html: tpl(t, 'billing.bankTransferWarning', { ref: `INV-${showPaymentModal.id}` })
                                                }}
                                            />
                                        </div>

                                        {/* Column 2: Confirmation / Action (Spans 6 cols) */}
                                        <div className="lg:col-span-6 flex flex-col justify-between">
                                            <div className="space-y-6">
                                                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-4">
                                                    <h6 className="text-xs font-black text-slate-200 uppercase tracking-wider">{t('billing.paymentSummaryTitle')}</h6>
                                                    
                                                    <div className="space-y-2.5 text-xs">
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-400">{t('billing.invoice')}:</span>
                                                            <span className="font-mono text-slate-200">#{showPaymentModal.id}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-400">{t('billing.payableAmount')}</span>
                                                            <span className="font-black text-slate-200">{Number(showPaymentModal.amount).toFixed(2)} EUR</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-400">{t('billing.paymentMethodLabel')}</span>
                                                            <span className="font-bold text-slate-200">{t('billing.bankTransferLabel')}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-bold rounded-xl leading-relaxed">
                                                    {t('billing.bankTransferInfoText')}
                                                </div>

                                                {/* Navigation Actions */}
                                                <div className="flex justify-between pt-6 border-t border-white/5 mt-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPaymentModalStep(1)}
                                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                                    >
                                                        {t('billing.back')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={actionLoading === 'invoice_transfer'}
                                                        onClick={async () => {
                                                            setActionLoading('invoice_transfer');
                                                            try {
                                                                const headers = getAuthHeaders();
                                                                await fetch('/api/v1/support/tickets', {
                                                                    method: 'POST',
                                                                    headers: { ...headers, 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                        subject: tpl(t, 'billing.supportTransferSubject', { ref: `INV-${showPaymentModal.id}` }),
                                                                        message: tpl(t, 'billing.supportTransferMessage', { ref: `INV-${showPaymentModal.id}`, amount: Number(showPaymentModal.amount).toFixed(2) }),
                                                                        priority: 'medium',
                                                                        category: 'billing',
                                                                        tenant_id: tenantId
                                                                    })
                                                                });
                                                                toast.success(t('billing.toastTransferPending'));
                                                                setShowPaymentModal(null);
                                                                void loadData();
                                                            } catch (err) {
                                                                toast.error(t('billing.toastTransferFailed'));
                                                            } finally {
                                                                setActionLoading(null);
                                                            }
                                                        }}
                                                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                                                    >
                                                        {actionLoading === 'invoice_transfer' ? t('billing.processing') : t('billing.sendTransferConfirm')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal 1: Bakiye Yükle (Deposit) */}
            {showDepositModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#0b1322] border border-white/10 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 text-slate-100">
                        <div className="px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a]/60">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <FiDollarSign className="text-[#38BDF8]" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-200">{t('billing.depositTitle')}</h3>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('billing.premiumFinancePanel')}</p>
                                </div>
                            </div>
                            
                            {/* Stepped Progress Indicator */}
                            <div className="flex items-center gap-2 text-xs font-bold">
                                <span className={`px-2.5 py-1 rounded-full ${depositStep >= 1 ? 'bg-[#38BDF8] text-black' : 'bg-white/5 text-slate-500'}`}>{t('billing.step1Amount')}</span>
                                <span className="h-px w-6 bg-white/10" />
                                <span className={`px-2.5 py-1 rounded-full ${depositStep >= 2 ? 'bg-[#38BDF8] text-black' : 'bg-white/5 text-slate-500'}`}>{t('billing.step2Method')}</span>
                                <span className="h-px w-6 bg-white/10" />
                                <span className={`px-2.5 py-1 rounded-full ${depositStep >= 3 ? 'bg-[#38BDF8] text-black' : 'bg-white/5 text-slate-500'}`}>{t('billing.step3Info')}</span>
                            </div>
                        </div>

                        {/* Step 1: Amount Selection */}
                        {depositStep === 1 && (
                            <div className="p-6 space-y-6 animate-in fade-in duration-300">
                                <div>
                                    <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-2">{t('billing.depositStep1Title')}</h4>
                                    <p className="text-xs text-slate-400">{t('billing.depositStep1Desc')}</p>
                                </div>

                                {/* Preset Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {PRESET_AMOUNTS.map((preset) => (
                                        <button
                                            key={preset.amount}
                                            type="button"
                                            onClick={() => setDepositForm({ ...depositForm, amount: preset.amount })}
                                            className={`p-4 rounded-2xl border transition-all text-center flex flex-col justify-between items-center relative overflow-hidden ${
                                                depositForm.amount === preset.amount
                                                    ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8] shadow-lg shadow-blue-500/10 scale-[1.03]'
                                                    : 'bg-white/[0.01] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                                            }`}
                                        >
                                            {preset.badge && (
                                                <span className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500 text-black font-black text-[8px] rounded-bl-lg uppercase tracking-wider">
                                                    {preset.badge}
                                                </span>
                                            )}
                                            <span className="text-2xl font-black block mt-2">{preset.amount}</span>
                                            <span className="text-[10px] font-bold text-slate-500 block mb-1">EUR</span>
                                            {preset.bonus > 0 && (
                                                <span className="text-[9px] font-black text-emerald-400 mt-2 block bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                    +{(preset.amount * preset.bonus / 100).toFixed(0)} EUR {t('billing.gift')}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* Manual Amount Input */}
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">{t('billing.enterCustomAmount')}</label>
                                    <div className="relative">
                                        <input 
                                            type="number"
                                            min="10"
                                            required
                                            placeholder={t('billing.enterAmountPlaceholder')}
                                            value={depositForm.amount}
                                            onChange={e => {
                                                const val = Number(e.target.value);
                                                setDepositForm({ ...depositForm, amount: val });
                                            }}
                                            className="w-full bg-[#020617] border border-white/10 rounded-2xl px-5 py-4 text-white font-black text-2xl outline-none focus:border-[#38BDF8]/50 transition-colors pr-16 font-mono"
                                        />
                                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-black text-slate-500">EUR</span>
                                    </div>
                                    
                                    {/* Dynamic Bonus Info */}
                                    <div className="mt-3">
                                        {depositForm.amount >= 400 ? (
                                            <div 
                                                className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-xs font-black text-emerald-400 rounded-xl flex items-center gap-2 animate-pulse"
                                                dangerouslySetInnerHTML={{
                                                    __html: tpl(t, 'billing.bonus20Active', { amount: `<strong>+${(depositForm.amount * 0.2).toFixed(2)} EUR</strong>` })
                                                }}
                                            />
                                        ) : depositForm.amount >= 200 ? (
                                            <div 
                                                className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-xs font-black text-emerald-400 rounded-xl flex items-center gap-2 animate-pulse"
                                                dangerouslySetInnerHTML={{
                                                    __html: tpl(t, 'billing.bonus10Active', { amount: `<strong>+${(depositForm.amount * 0.1).toFixed(2)} EUR</strong>` })
                                                }}
                                            />
                                        ) : (
                                            <div 
                                                className="p-3 bg-white/5 border border-white/5 text-[11px] text-slate-400 rounded-xl"
                                                dangerouslySetInnerHTML={{
                                                    __html: t('billing.bonusOpportunity')
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setShowDepositModal(false)}
                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                    >
                                        {t('billing.cancelSimple')}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={depositForm.amount < 10}
                                        onClick={() => setDepositStep(2)}
                                        className="px-6 py-3 bg-gradient-to-r from-[#38BDF8] to-blue-600 hover:from-[#4dd0ff] hover:to-blue-500 text-black font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-30 flex items-center gap-1.5"
                                    >
                                        {t('billing.goToPaymentMethod')} <FiChevronRight />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Payment Method Selection */}
                        {depositStep === 2 && (
                            <div className="p-6 space-y-6 animate-in fade-in duration-300">
                                <div>
                                    <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-2">{t('billing.depositStep2Title')}</h4>
                                    <p className="text-xs text-slate-400">
                                        {(() => {
                                            const text = t('billing.depositAmountTextDesc');
                                            const parts = text.split('{{amount}}');
                                            if (parts.length === 2) {
                                                return (
                                                    <>
                                                        {parts[0]}
                                                        <strong className="text-[#38BDF8] text-sm">{depositForm.amount.toFixed(2)}</strong>
                                                        {parts[1]}
                                                    </>
                                                );
                                            }
                                            return text;
                                        })()}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Credit Card Button */}
                                    <button
                                        type="button"
                                        onClick={() => setDepositForm({ ...depositForm, paymentMethod: 'credit_card' })}
                                        className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-40 relative overflow-hidden ${
                                            depositForm.paymentMethod === 'credit_card'
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8] shadow-lg shadow-blue-500/10'
                                                : 'bg-white/[0.01] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start w-full">
                                            <FiCreditCard className="text-2xl" />
                                            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider">
                                                {t('billing.instantActive')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-lg font-black block text-slate-200">{t('billing.creditCard')}</span>
                                            <span className="text-xs font-medium text-slate-400 mt-1 block leading-relaxed">
                                                {t('billing.creditCardLoadDesc')}
                                            </span>
                                        </div>
                                    </button>

                                    {/* Bank Transfer Button */}
                                    <button
                                        type="button"
                                        onClick={() => setDepositForm({ ...depositForm, paymentMethod: 'bank_transfer' })}
                                        className={`p-6 rounded-2xl border transition-all text-left flex flex-col justify-between h-40 relative overflow-hidden ${
                                            depositForm.paymentMethod === 'bank_transfer'
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8] shadow-lg shadow-blue-500/10'
                                                : 'bg-white/[0.01] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start w-full">
                                            <FiGlobe className="text-2xl" />
                                            <span className="px-2.5 py-0.5 rounded bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider">
                                                {t('billing.transferApprovalTime')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-lg font-black block text-slate-200">{t('billing.bankTransfer')}</span>
                                            <span className="text-xs font-medium text-slate-400 mt-1 block leading-relaxed">
                                                {t('billing.bankTransferLoadDesc')}
                                            </span>
                                        </div>
                                    </button>
                                </div>

                                {/* Footer Actions */}
                                <div className="flex justify-between pt-4 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setDepositStep(1)}
                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                    >
                                        {t('billing.back')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDepositStep(3)}
                                        className="px-6 py-3 bg-gradient-to-r from-[#38BDF8] to-blue-600 hover:from-[#4dd0ff] hover:to-blue-500 text-black font-black uppercase text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                                    >
                                        {t('billing.enterDetails')} <FiChevronRight />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Payment Details */}
                        {depositStep === 3 && (
                            <div className="animate-in fade-in duration-300">
                                {depositForm.paymentMethod === 'credit_card' ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
                                        
                                        {/* Column 1: Card & Summary (Spans 5 cols) */}
                                        <div className="lg:col-span-5 flex flex-col justify-center items-center space-y-6 border-b lg:border-b-0 lg:border-r border-white/5 pb-6 lg:pb-0 lg:pr-6">
                                            <div>
                                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center mb-4">Card Preview (3D Interactive)</h5>
                                                
                                                {/* 3D Interactive Card container */}
                                                <div className="relative w-[320px] h-[190px] mx-auto select-none" style={{ perspective: '1000px' }}>
                                                    <div 
                                                        className="w-full h-full rounded-3xl shadow-2xl transition-transform duration-700 cursor-grab active:cursor-grabbing"
                                                        onMouseMove={handleCardMouseMove}
                                                        onMouseLeave={handleCardMouseLeave}
                                                        style={{
                                                            transform: cardFocused === 'cvv' ? 'rotateY(180deg)' : `perspective(1000px) rotateX(${cardTilt.rotateX}deg) rotateY(${cardTilt.rotateY}deg)`,
                                                            transformStyle: 'preserve-3d',
                                                        }}
                                                    >
                                                        {/* Card Front Face */}
                                                        <div 
                                                            className={`absolute inset-0 w-full h-full rounded-2xl border border-white/10 p-5 flex flex-col justify-between text-white ${getCardStyle(getCardBrand(cardForm.number)).bg}`}
                                                            style={{
                                                                backfaceVisibility: 'hidden',
                                                                transform: 'rotateY(0deg)',
                                                            }}
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <CardChip />
                                                                <div>
                                                                    {getCardStyle(getCardBrand(cardForm.number)).logo}
                                                                </div>
                                                            </div>

                                                            <div className="text-xl font-mono tracking-widest text-center py-2 text-white font-bold drop-shadow-md">
                                                                {cardForm.number || '•••• •••• •••• ••••'}
                                                            </div>

                                                            <div className="flex justify-between items-end text-[10px] uppercase font-bold tracking-wider text-slate-200">
                                                                <div className="min-w-0 flex-1 pr-4">
                                                                    <span className="block text-[7px] text-slate-400 uppercase mb-0.5">{t('billing.cardHolderName').replace(' Adı Soyadı', '').replace(' Name', '')}</span>
                                                                    <span className="block truncate font-mono drop-shadow">{cardForm.name || t('billing.cardHolderPlaceholder')}</span>
                                                                </div>
                                                                <div className="shrink-0 text-right">
                                                                    <span className="block text-[7px] text-slate-400 uppercase mb-0.5">{t('billing.cardExpiryShort')}</span>
                                                                    <span className="block font-mono drop-shadow">{cardForm.expiry || 'AA/YY'}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Card Back Face */}
                                                        <div 
                                                            className={`absolute inset-0 w-full h-full rounded-2xl border border-white/10 flex flex-col justify-between text-white ${getCardStyle(getCardBrand(cardForm.number)).bg}`}
                                                            style={{
                                                                backfaceVisibility: 'hidden',
                                                                transform: 'rotateY(180deg)',
                                                            }}
                                                        >
                                                            <div className="w-full h-10 bg-slate-950/80 mt-4"></div>
                                                            
                                                            <div className="px-5">
                                                                <div className="text-[7px] text-slate-400 uppercase mb-1">{t('billing.cardCvv').toUpperCase()}</div>
                                                                <div className="w-full h-8 bg-white/5 rounded flex items-center justify-end px-3 font-mono text-sm tracking-widest italic text-slate-300 relative border border-white/5">
                                                                    <div className="absolute left-2 text-[8px] text-slate-500 select-none">NextPOS SECURE</div>
                                                                    <span className="font-black text-white bg-slate-950 px-2.5 py-0.5 rounded text-xs select-none shadow-md">
                                                                        {cardForm.cvv || '•••'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="p-3 text-[7px] text-slate-400 leading-normal text-center border-t border-white/5 bg-black/20">
                                                                {t('billing.secureInfrastructure')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Summary Cards */}
                                            <div className="w-full bg-[#020617]/50 border border-white/5 p-4 rounded-xl text-xs space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400">{t('billing.depositAmountLabel')}</span>
                                                    <span className="font-black text-slate-200">{depositForm.amount.toFixed(2)} EUR</span>
                                                </div>
                                                {depositForm.amount >= 200 && (
                                                    <div className="flex justify-between text-emerald-400 font-bold">
                                                        <span>{t('billing.bonusEarnedLabel')}</span>
                                                        <span>+{(depositForm.amount * (depositForm.amount >= 400 ? 0.2 : 0.1)).toFixed(2)} EUR</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between border-t border-white/5 pt-2 font-black text-sm text-slate-100">
                                                    <span>{t('billing.totalToWalletLabel')}</span>
                                                    <span className="text-[#38BDF8]">
                                                        {(depositForm.amount * (depositForm.amount >= 400 ? 1.2 : depositForm.amount >= 200 ? 1.1 : 1.0)).toFixed(2)} EUR
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                                <FiLock className="text-emerald-400" /> {t('billing.pciCompliance')}
                                            </div>
                                        </div>

                                        {/* Column 2: Form Fields (Spans 7 cols) */}
                                        <div className="lg:col-span-7 flex flex-col justify-between">
                                            <form onSubmit={handleDeposit} className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">{t('billing.cardNumber')}</label>
                                                    <div className="relative">
                                                        <input 
                                                            type="text"
                                                            required
                                                            placeholder="4000 1234 5678 9000"
                                                            value={cardForm.number}
                                                            onFocus={() => setCardFocused('number')}
                                                            onBlur={() => setCardFocused(null)}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const formatted = val.replace(/\D/g, '').substring(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
                                                                setCardForm({ ...cardForm, number: formatted });
                                                            }}
                                                            className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-[#38BDF8]/50 transition-colors pr-10"
                                                        />
                                                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                                                            <FiCreditCard />
                                                        </span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">{t('billing.cardHolderName')}</label>
                                                    <input 
                                                        type="text"
                                                        required
                                                        placeholder="AHMET YILMAZ"
                                                        value={cardForm.name}
                                                        onFocus={() => setCardFocused('name')}
                                                        onBlur={() => setCardFocused(null)}
                                                        onChange={e => setCardForm({ ...cardForm, name: e.target.value.toUpperCase() })}
                                                        className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-[#38BDF8]/50 transition-colors"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">{t('billing.cardExpiry')}</label>
                                                        <input 
                                                            type="text"
                                                            required
                                                            placeholder="08/29"
                                                            value={cardForm.expiry}
                                                            onFocus={() => setCardFocused('expiry')}
                                                            onBlur={() => setCardFocused(null)}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const formatted = val.replace(/\D/g, '').substring(0, 4).replace(/(\d{2})(?=\d)/g, '$1/');
                                                                setCardForm({ ...cardForm, expiry: formatted });
                                                            }}
                                                            className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm text-center outline-none focus:border-[#38BDF8]/50 transition-colors"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">{t('billing.cardCvv')}</label>
                                                        <input 
                                                            type="password"
                                                            required
                                                            placeholder="•••"
                                                            value={cardForm.cvv}
                                                            onFocus={() => setCardFocused('cvv')}
                                                            onBlur={() => setCardFocused(null)}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const formatted = val.replace(/\D/g, '').substring(0, 3);
                                                                setCardForm({ ...cardForm, cvv: formatted });
                                                            }}
                                                            className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm text-center outline-none focus:border-[#38BDF8]/50 transition-colors"
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">{t('billing.description')}</label>
                                                    <input 
                                                        type="text"
                                                        required
                                                        value={depositForm.description}
                                                        onChange={e => setDepositForm({ ...depositForm, description: e.target.value })}
                                                        className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs outline-none focus:border-[#38BDF8]/50 transition-colors"
                                                    />
                                                </div>

                                                {/* Navigation Actions */}
                                                <div className="flex justify-between pt-6 border-t border-white/5 mt-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDepositStep(2)}
                                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                                    >
                                                        {t('billing.back')}
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        disabled={actionLoading === 'deposit'}
                                                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                                                    >
                                                        {actionLoading === 'deposit' ? t('billing.processing') : t('billing.securePay')}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>

                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
                                        
                                        {/* Column 1: Bank card details (Spans 6 cols) */}
                                        <div className="lg:col-span-6 flex flex-col justify-center items-center space-y-6 border-b lg:border-b-0 lg:border-r border-white/5 pb-6 lg:pb-0 lg:pr-6">
                                            <div>
                                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center mb-4">{t('billing.bankDetailsTitle')}</h5>
                                                
                                                {/* Premium Bank Account Card */}
                                                <div className="relative w-[320px] h-[190px] rounded-3xl bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] border border-white/10 p-5 flex flex-col justify-between text-white shadow-2xl relative overflow-hidden select-none">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#38BDF8]/5 rounded-full blur-2xl pointer-events-none"></div>
                                                    
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-black tracking-widest text-[#38BDF8] uppercase">DEUTSCHE BANK AG</span>
                                                        <FiGlobe className="text-slate-400" size={20} />
                                                    </div>

                                                    <div className="space-y-2 py-2">
                                                        <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-slate-400">
                                                            <span>{t('billing.bankReceiverName')}</span>
                                                            <button 
                                                                onClick={() => copyToClipboard('NextPOS Technologies GmbH', t('billing.bankReceiverName'))}
                                                                className="text-[#38BDF8] hover:underline flex items-center gap-0.5"
                                                            >
                                                                <FiCopy size={8} /> {t('billing.copy')}
                                                            </button>
                                                        </div>
                                                        <div className="text-xs font-mono font-bold truncate text-slate-200">NextPOS Technologies GmbH</div>
                                                        
                                                        <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-slate-400">
                                                            <span>{t('billing.bankIban')}</span>
                                                            <button 
                                                                onClick={() => copyToClipboard('DE89370400440532991100', 'IBAN')}
                                                                className="text-[#38BDF8] hover:underline flex items-center gap-0.5"
                                                            >
                                                                <FiCopy size={8} /> {t('billing.copy')}
                                                            </button>
                                                        </div>
                                                        <div className="text-xs font-mono font-bold tracking-wider text-slate-200">DE89 3704 0044 0532 9911 00</div>
                                                    </div>

                                                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 border-t border-white/5 pt-2">
                                                        <div>
                                                            <span className="block text-[6px] text-slate-500 uppercase">BIC/SWIFT</span>
                                                            <span className="font-mono text-slate-200">DEUTDEDBXXX</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-[6px] text-slate-500 uppercase">{t('billing.bankRefCode')}</span>
                                                            <span className="font-mono text-[#38BDF8]">TX-{tenantId?.substring(0, 8).toUpperCase()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div 
                                                className="text-[10px] text-slate-500 text-center leading-relaxed"
                                                dangerouslySetInnerHTML={{
                                                    __html: tpl(t, 'billing.bankTransferWarning', { ref: `TX-${tenantId?.substring(0, 8).toUpperCase()}` })
                                                }}
                                            />
                                        </div>

                                        {/* Column 2: Confirmation / Action (Spans 6 cols) */}
                                        <div className="lg:col-span-6 flex flex-col justify-between">
                                            <form onSubmit={handleDeposit} className="space-y-6">
                                                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-4">
                                                    <h6 className="text-xs font-black text-slate-200 uppercase tracking-wider">{t('billing.transferSummary')}</h6>
                                                    
                                                    <div className="space-y-2.5 text-xs">
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-400">{t('billing.amountToLoad')}:</span>
                                                            <span className="font-black text-slate-200">{depositForm.amount.toFixed(2)} EUR</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-400">{t('billing.expectedBonusLabel')}</span>
                                                            <span className="font-black text-emerald-400">
                                                                {depositForm.amount >= 200 
                                                                    ? `+${(depositForm.amount * (depositForm.amount >= 400 ? 0.2 : 0.1)).toFixed(2)} EUR`
                                                                    : t('billing.none')}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between border-t border-white/5 pt-2 text-sm font-black">
                                                            <span className="text-slate-300">{t('billing.totalToWalletLabel')}</span>
                                                            <span className="text-[#38BDF8]">
                                                                {(depositForm.amount * (depositForm.amount >= 400 ? 1.2 : depositForm.amount >= 200 ? 1.1 : 1.0)).toFixed(2)} EUR
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">{t('billing.descriptionNote')}</label>
                                                    <input 
                                                        type="text"
                                                        required
                                                        value={depositForm.description}
                                                        onChange={e => setDepositForm({ ...depositForm, description: e.target.value })}
                                                        className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#38BDF8]/50 transition-colors"
                                                    />
                                                </div>

                                                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-bold rounded-xl leading-relaxed">
                                                    {t('billing.depositBankTransferInfoText')}
                                                </div>

                                                {/* Navigation Actions */}
                                                <div className="flex justify-between pt-6 border-t border-white/5 mt-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDepositStep(2)}
                                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                                    >
                                                        {t('billing.back')}
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        disabled={actionLoading === 'deposit'}
                                                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
                                                    >
                                                        {actionLoading === 'deposit' ? t('billing.processing') : t('billing.sendTransferNotification')}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* Modal 1.5: 3D Secure SMS Verification Simulator */}
            {showOTPModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100000] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#0b1322] border border-white/15 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative text-slate-100 p-6 animate-in zoom-in-95 duration-200">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                                <FiLock className="text-[#38BDF8]" size={24} />
                            </div>
                            <h4 className="text-sm font-black text-slate-100 uppercase tracking-widest">NextPOS 3D Secure</h4>
                            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider">{t('billing.secureSubtitle')}</p>
                        </div>

                        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 mb-4 text-[10px] leading-relaxed text-slate-400">
                            <span className="text-emerald-400 font-bold block mb-1 font-sans">{t('billing.smsCodeSent')}</span>
                            <span dangerouslySetInnerHTML={{
                                __html: tpl(t, 'billing.smsCodeSentDesc', {
                                    amount: `<strong class="text-slate-200">${Number(depositForm.amount).toFixed(2)} EUR</strong>`
                                })
                            }} />
                            <div className="mt-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded p-2 text-center font-black" dangerouslySetInnerHTML={{
                                __html: tpl(t, 'billing.simVerificationCode', {
                                    code: '<span class="text-slate-100 select-all font-mono">123456</span>'
                                })
                            }} />
                        </div>

                        <form onSubmit={handleOTPSubmit} className="space-y-4">
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">{t('billing.otpLabel')}</label>
                                <input 
                                    type="text"
                                    required
                                    placeholder="••••••"
                                    maxLength={6}
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white font-black text-lg text-center tracking-[1em] outline-none focus:border-[#38BDF8]/50 transition-colors font-mono"
                                />
                            </div>

                            {otpError && (
                                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-bold rounded-lg text-center leading-relaxed">
                                    {otpError}
                                </div>
                            )}

                            <div className="flex gap-3 mt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowOTPModal(false);
                                        setOtpError(null);
                                    }}
                                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                >
                                    {t('billing.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={otpLoading}
                                    className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition-all disabled:opacity-50"
                                >
                                    {otpLoading ? t('billing.verifying') : t('billing.confirmAndPay')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal 2: Bulk Plan Purchase (Toptan Satın Alım) */}
            {showBulkModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
                    <div className="bg-[#0c1526] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 text-slate-100">
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#0f172a]/60">
                            <h3 className="font-black text-slate-200 flex items-center gap-2"><FiLayers className="text-[#38BDF8]" /> {t('billing.bulkPurchaseTitle')}</h3>
                            <button 
                                onClick={() => setShowBulkModal(null)}
                                className="text-slate-500 hover:text-white"
                            >
                                {t('billing.cancelSimple')}
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-[#020617] border border-white/5 p-4 rounded-xl">
                                <h4 className="text-sm font-black text-[#38BDF8]">{tpl(t, 'billing.planSubscriptionLabel', { name: showBulkModal.name })}</h4>
                                <p className="text-[10px] text-slate-400 mt-1">{tpl(t, 'billing.fixedMonthlyPrice', { price: Number(showBulkModal.monthly_fee).toFixed(2) })}</p>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">{t('billing.purchasePeriod')}</label>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => setBulkMonths(6)}
                                        className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${
                                            bulkMonths === 6 
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8]' 
                                                : 'bg-[#020617] border-white/10 text-slate-400'
                                        }`}
                                    >
                                        {t('billing.bulk6Months')}
                                    </button>
                                    <button 
                                        onClick={() => setBulkMonths(12)}
                                        className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${
                                            bulkMonths === 12 
                                                ? 'bg-[#38BDF8]/10 border-[#38BDF8] text-[#38BDF8]' 
                                                : 'bg-[#020617] border-white/10 text-slate-400'
                                        }`}
                                    >
                                        {t('billing.bulk12Months')}
                                    </button>
                                </div>
                            </div>

                            {/* Fiyat Detayları */}
                            <div className="bg-[#020617]/50 border border-white/5 p-4 rounded-xl text-xs space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">{t('billing.normalAmount')}</span>
                                    <span>{(Number(showBulkModal.monthly_fee) * bulkMonths).toFixed(2)} EUR</span>
                                </div>
                                {bulkMonths === 12 && (
                                    <div className="flex justify-between text-emerald-400 font-bold">
                                        <span>{t('billing.annualDiscountLabel')}</span>
                                        <span>-{(Number(showBulkModal.monthly_fee) * bulkMonths * 0.15).toFixed(2)} EUR</span>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-white/5 pt-2 font-black text-sm text-slate-100">
                                    <span>{t('billing.totalToCollect')}</span>
                                    <span className="text-emerald-400">
                                        {bulkMonths === 12 
                                            ? (Number(showBulkModal.monthly_fee) * 12 * 0.85).toFixed(2)
                                            : (Number(showBulkModal.monthly_fee) * 6).toFixed(2)} EUR
                                    </span>
                                </div>
                            </div>

                            {/* Cüzdan Durumu */}
                            <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-slate-400">{t('billing.currentWalletBalance')}</span>
                                <span className={`font-black ${
                                    Number(walletBalance) < (bulkMonths === 12 ? Number(showBulkModal.monthly_fee) * 12 * 0.85 : Number(showBulkModal.monthly_fee) * 6)
                                        ? 'text-rose-400 animate-pulse'
                                        : 'text-slate-200'
                                }`}>
                                    {Number(walletBalance).toFixed(2)} EUR
                                </span>
                            </div>

                            {Number(walletBalance) < (bulkMonths === 12 ? Number(showBulkModal.monthly_fee) * 12 * 0.85 : Number(showBulkModal.monthly_fee) * 6) ? (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-bold rounded-lg leading-relaxed">
                                    {t('billing.insufficientBalanceWarning')}
                                </div>
                            ) : (
                                <button
                                    onClick={handlePurchaseBulk}
                                    disabled={actionLoading === `bulk_${showBulkModal.code}`}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50 mt-3"
                                >
                                    {actionLoading === `bulk_${showBulkModal.code}` ? t('billing.processing') : t('billing.payWithWalletConfirm')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal 3: Module Purchase Confirmation */}
            {showModulePurchaseModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
                    <div className="bg-[#0c1526] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 text-slate-100">
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#0f172a]/60">
                            <h3 className="font-black text-slate-200 flex items-center gap-2"><FiPackage className="text-[#38BDF8]" /> {t('billing.modulePurchaseTitle')}</h3>
                            <button 
                                onClick={() => {
                                    setShowModulePurchaseModal(null);
                                    setPurchaseResult(null);
                                    setConfirmWalletPayment(true);
                                }}
                                className="text-slate-500 hover:text-white"
                            >
                                {t('billing.cancelSimple')}
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            {purchaseResult ? (
                                <div className="text-center space-y-4 animate-in fade-in duration-300">
                                    <div className="flex justify-center">
                                        {purchaseResult.success ? (
                                            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-pulse">
                                                <FiCheckCircle size={36} className="animate-bounce" />
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                                                <FiAlertTriangle size={36} className="animate-pulse" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <h4 className={`text-lg font-black ${purchaseResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {purchaseResult.success ? t('billing.purchaseSuccess') : t('billing.purchaseFailed')}
                                        </h4>
                                        <p className="text-xs text-slate-400 leading-relaxed px-4">
                                            {purchaseResult.message}
                                        </p>
                                    </div>

                                    {purchaseResult.success && (
                                        <div className="bg-[#020617] border border-white/5 p-3 rounded-xl text-left text-xs space-y-1">
                                            <div className="flex justify-between text-slate-400">
                                                <span>{t('billing.activeModuleLabel')}</span>
                                                <span className="text-slate-200 font-bold">{purchaseResult.moduleName}</span>
                                            </div>
                                            <div className="flex justify-between text-slate-400">
                                                <span>{t('billing.collectedAmountLabel')}</span>
                                                <span className="text-emerald-400 font-bold">{purchaseResult.price.toFixed(2)} EUR</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        {purchaseResult.success ? (
                                            <button
                                                onClick={() => {
                                                    setShowModulePurchaseModal(null);
                                                    setPurchaseResult(null);
                                                    setConfirmWalletPayment(true);
                                                }}
                                                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all"
                                            >
                                                {t('billing.cancelSimple')}
                                            </button>
                                        ) : (
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => setPurchaseResult(null)}
                                                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase rounded-xl transition-all"
                                                >
                                                    {t('billing.goBack')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowModulePurchaseModal(null);
                                                        setPurchaseResult(null);
                                                        setConfirmWalletPayment(true);
                                                    }}
                                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-xs rounded-xl transition-all"
                                                >
                                                    {t('billing.cancelSimple')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-[#020617] border border-white/5 p-4 rounded-xl">
                                        <h4 className="text-sm font-black text-[#38BDF8]">{tpl(t, 'billing.moduleLabel', { name: showModulePurchaseModal.name })}</h4>
                                        <div className="mt-2 space-y-1 text-xs">
                                            <div className="flex justify-between text-slate-400">
                                                <span>{t('billing.monthlyUsagePrice')}</span>
                                                <span className="text-slate-200 font-bold">{showModulePurchaseModal.monthlyPrice.toFixed(2)} {t('billing.eurMonth')}</span>
                                            </div>
                                            {showModulePurchaseModal.setupPrice > 0 && (
                                                <div className="flex justify-between text-slate-400">
                                                    <span>{t('billing.oneTimeSetupPrice')}</span>
                                                    <span className="text-slate-200 font-bold">+{showModulePurchaseModal.setupPrice.toFixed(2)} EUR</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Fiyat Detayları */}
                                    <div className="bg-[#020617]/50 border border-white/5 p-4 rounded-xl text-xs space-y-2">
                                        <div className="flex justify-between border-t border-white/5 pt-2 font-black text-sm text-slate-100">
                                            <span>{t('billing.totalToCollect')}</span>
                                            <span className="text-emerald-400 font-black">
                                                {(showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice).toFixed(2)} EUR
                                            </span>
                                        </div>
                                    </div>

                                    {/* Cüzdan Durumu */}
                                    <div className="flex items-center justify-between text-xs px-1">
                                        <span className="text-slate-400">{t('billing.currentWalletBalance')}</span>
                                        <span className={`font-black ${
                                            Number(walletBalance) < (showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice)
                                                ? 'text-rose-400 animate-pulse'
                                                : 'text-slate-200'
                                        }`}>
                                            {Number(walletBalance).toFixed(2)} EUR
                                        </span>
                                    </div>

                                    {Number(walletBalance) < (showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice) ? (
                                        <div className="space-y-3">
                                            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-bold rounded-lg leading-relaxed">
                                                {tpl(t, 'billing.insufficientWalletBalanceDesc', { needed: (showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice).toFixed(2), balance: Number(walletBalance).toFixed(2) })}
                                            </div>
                                            <p className="text-[11px] text-slate-400 text-center px-2">
                                                {t('billing.redirectConfirmText')}
                                            </p>
                                            <button
                                                onClick={() => {
                                                    const neededAmount = Math.ceil((showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice) - Number(walletBalance));
                                                    const prefillAmount = Math.max(10, neededAmount);
                                                    setDepositForm({
                                                        amount: prefillAmount,
                                                        paymentMethod: 'credit_card',
                                                        description: tpl(t, 'billing.depositForModuleDesc', { name: showModulePurchaseModal.name })
                                                    });
                                                    setDepositStep(1);
                                                    setShowModulePurchaseModal(null);
                                                    setShowDepositModal(true);
                                                    toast.success(tpl(t, 'billing.toastAmountTransferred', { amount: prefillAmount }));
                                                }}
                                                className="w-full py-3 bg-gradient-to-r from-[#38BDF8] to-blue-600 hover:from-[#4dd0ff] hover:to-blue-500 text-black font-black uppercase text-xs rounded-xl shadow-lg transition-all text-center flex items-center justify-center gap-1.5"
                                            >
                                                {t('billing.redirectToDeposit')}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <label className="flex items-center gap-3 p-4 bg-white/[0.02] hover:bg-white/5 border border-white/5 rounded-xl cursor-pointer transition-all">
                                                <input 
                                                    type="checkbox"
                                                    checked={confirmWalletPayment}
                                                    onChange={(e) => setConfirmWalletPayment(e.target.checked)}
                                                    className="rounded border-white/10 bg-black/40 text-[#38BDF8] focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer"
                                                />
                                                <div className="flex-1">
                                                    <span className="text-xs font-black text-slate-200 block">{t('billing.payFromWalletCheckboxLabel')}</span>
                                                    <span className="text-[10px] text-slate-500 block mt-0.5">{tpl(t, 'billing.willBeChargedFromWallet', { price: (showModulePurchaseModal.monthlyPrice + showModulePurchaseModal.setupPrice).toFixed(2) })}</span>
                                                </div>
                                            </label>

                                            <button
                                                disabled={actionLoading === `mod_${showModulePurchaseModal.code}` || !confirmWalletPayment}
                                                onClick={() => handlePurchaseModule(showModulePurchaseModal.code)}
                                                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase text-xs rounded-xl shadow-lg transition-all disabled:opacity-50 mt-3"
                                            >
                                                {actionLoading === `mod_${showModulePurchaseModal.code}` ? t('billing.processing') : t('billing.payWithWalletConfirm')}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBilling;
