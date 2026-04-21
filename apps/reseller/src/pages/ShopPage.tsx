import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FiShoppingCart, FiCheck, FiPackage, FiZap, FiTag, FiHome, FiAward } from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { WalletCardVisual } from '../components/WalletCardVisual.tsx';

type ResellerWalletSettings = {
    currency?: string;
    active_gateway?: string;
    virtual_pos_test_mode?: number;
    stripe_public_key?: string;
    reseller_bank_accounts: Array<{
        bank_name?: string;
        account_holder?: string;
        iban?: string;
        currency?: string;
        note?: string;
    }>;
};

type TopupPayMethod = 'bank_transfer' | 'cash' | 'admin_card';
type TopupRow = {
    id: number;
    amount: string | number;
    status?: string;
    created_at?: string;
    note?: string | null;
    payment_method?: string | null;
    transfer_reference?: string | null;
    transfer_date?: string | null;
    transfer_time?: string | null;
};

export function ShopPage() {
    const {
        lang,
        resellerPlans,
        fetchResellerPlans,
        purchaseResellerPlan,
        isLoading,
        admin,
        token,
        fetchStats,
    } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;
    const [topupAmount, setTopupAmount] = useState('');
    const [topupNote, setTopupNote] = useState('');
    const [topupMethod, setTopupMethod] = useState<TopupPayMethod>('bank_transfer');
    const [transferReference, setTransferReference] = useState('');
    const [transferDate, setTransferDate] = useState('');
    const [transferTime, setTransferTime] = useState('');
    const [topupBusy, setTopupBusy] = useState(false);
    const [topupHistory, setTopupHistory] = useState<TopupRow[]>([]);
    const [walletSettings, setWalletSettings] = useState<ResellerWalletSettings | null>(null);
    const [walletSettingsLoaded, setWalletSettingsLoaded] = useState(false);
    const [cardName, setCardName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [cardFocus, setCardFocus] = useState<'number' | 'name' | 'expiry' | 'cvc' | null>(null);

    useEffect(() => {
        fetchResellerPlans();
    }, [fetchResellerPlans]);

    useEffect(() => {
        if (token) void fetchStats();
    }, [token, fetchStats]);

    const loadWalletSettings = async () => {
        if (!token) {
            setWalletSettingsLoaded(false);
            return;
        }
        setWalletSettingsLoaded(false);
        try {
            const res = await fetch('/api/v1/tenants/system/settings', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setWalletSettings({ reseller_bank_accounts: [], active_gateway: 'none', virtual_pos_test_mode: 0 });
                return;
            }
            const json = (await res.json()) as Record<string, unknown>;
            setWalletSettings({
                currency: typeof json.currency === 'string' ? json.currency : undefined,
                active_gateway: typeof json.active_gateway === 'string' ? json.active_gateway : 'none',
                virtual_pos_test_mode: Number(json.virtual_pos_test_mode) === 1 ? 1 : 0,
                stripe_public_key: typeof json.stripe_public_key === 'string' ? json.stripe_public_key : '',
                reseller_bank_accounts: Array.isArray(json.reseller_bank_accounts) ? (json.reseller_bank_accounts as ResellerWalletSettings['reseller_bank_accounts']) : [],
            });
        } catch {
            setWalletSettings({ reseller_bank_accounts: [], active_gateway: 'none', virtual_pos_test_mode: 0 });
        } finally {
            setWalletSettingsLoaded(true);
        }
    };

    useEffect(() => {
        void loadWalletSettings();
    }, [token]);

    const loadTopupHistory = async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/v1/tenants/reseller/wallet/topup-requests', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const raw = await res.json();
            setTopupHistory(Array.isArray(raw) ? raw : []);
        } catch {
            setTopupHistory([]);
        }
    };

    useEffect(() => {
        void loadTopupHistory();
    }, [token]);

    const activeGw = String(walletSettings?.active_gateway ?? 'none').toLowerCase();
    const cardTestBypassNoGateway =
        walletSettingsLoaded &&
        Number(walletSettings?.virtual_pos_test_mode) === 1 &&
        activeGw === 'none';

    const gatewayDisplayLabel = () => {
        if (!walletSettingsLoaded) return '…';
        if (cardTestBypassNoGateway) return t('shop.walletGatewayTestSim');
        if (activeGw === 'stripe') return 'Stripe';
        if (activeGw === 'iyzico') return 'iyzico';
        if (activeGw === 'paytr') return 'PayTR';
        return t('shop.walletGatewayNoneLabel');
    };

    const submitTopup = async () => {
        if (!token) return;
        const n = Number(topupAmount.replace(',', '.'));
        if (!Number.isFinite(n) || n < 10) {
            toast.error('Min. 10 €');
            return;
        }
        if (topupMethod === 'bank_transfer') {
            if (!transferDate.trim() || !transferReference.trim()) {
                toast.error(t('shop.walletTransferRequired'));
                return;
            }
        }
        if (topupMethod === 'admin_card' && walletSettingsLoaded && activeGw === 'none' && !cardTestBypassNoGateway) {
            toast.error(t('shop.walletCardNotConfigured'));
            return;
        }
        if (topupMethod === 'admin_card' && !walletSettingsLoaded) {
            toast.error(t('shop.walletSettingsLoading'));
            return;
        }
        setTopupBusy(true);
        try {
            const body: Record<string, unknown> = {
                amount: n,
                note: topupNote.trim() || undefined,
                payment_method: topupMethod,
            };
            if (topupMethod === 'bank_transfer') {
                body.transfer_reference = transferReference.trim();
                body.transfer_date = transferDate.trim();
                if (transferTime.trim()) body.transfer_time = transferTime.trim();
            }
            const res = await fetch('/api/v1/tenants/reseller/wallet/topup-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                checkoutUrl?: string;
                testModeSimulated?: boolean;
            };
            if (!res.ok) {
                toast.error(json.error || 'Hata');
                return;
            }
            if (json.checkoutUrl) {
                toast.success(t('shop.walletStripeRedirect'));
                window.location.href = json.checkoutUrl;
                return;
            }
            if (json.testModeSimulated) {
                toast.success(t('shop.walletTestSimOk'));
                void fetchStats();
            } else {
                toast.success(t('shop.walletRequestOk'));
            }
            setTopupAmount('');
            setTopupNote('');
            setTopupMethod('bank_transfer');
            setTransferReference('');
            setTransferDate('');
            setTransferTime('');
            await loadTopupHistory();
        } catch {
            toast.error('Hata');
        } finally {
            setTopupBusy(false);
        }
    };

    const topupMethodLabel = (pm?: string | null) => {
        const p = String(pm ?? 'bank_transfer').toLowerCase();
        if (p === 'cash') return t('shop.walletPayCash');
        if (p === 'admin_card') return t('shop.walletPayCard');
        return t('shop.walletPayBank');
    };

    const topupStatusLabel = (st?: string | null) => {
        const s = String(st ?? '').toLowerCase();
        if (s === 'approved') return t('shop.walletStatusApproved');
        if (s === 'rejected') return t('shop.walletStatusRejected');
        if (s === 'awaiting_card') return t('shop.walletStatusAwaitingCard');
        if (s === 'checkout_failed') return t('shop.walletStatusCheckoutFailed');
        if (s === 'pending') return t('shop.walletStatusPending');
        return st || '—';
    };

    const currentPlanId = admin?.reseller_plan_id ?? null;
    const currentPlan = resellerPlans.find((p) => p.id === currentPlanId);
    const currentPrice =
        currentPlan != null
            ? parseFloat(String(currentPlan.price))
            : Number(admin?.reseller_plan_price ?? 0) || 0;
    const nameFromAdmin = admin?.reseller_plan_name != null ? String(admin.reseller_plan_name).trim() : '';
    const codeFromAdmin = admin?.reseller_plan_code != null ? String(admin.reseller_plan_code).trim() : '';
    const hasAssignedPlan =
        currentPlanId != null || nameFromAdmin.length > 0 || codeFromAdmin.length > 0;
    const displayPlanName =
        currentPlan?.name ??
        (nameFromAdmin.length > 0 ? nameFromAdmin : null) ??
        (codeFromAdmin.length > 0 ? codeFromAdmin : null) ??
        (currentPlanId != null ? t('shop.planLabelById').replace('{id}', String(currentPlanId)) : null);
    const displayPlanCode = currentPlan?.code ?? admin?.reseller_plan_code ?? null;
    const displayPackLicenses = currentPlan?.license_count ?? admin?.reseller_plan_license_cap ?? null;

    const sortedPlans = useMemo(() => {
        const list = [...resellerPlans];
        list.sort((a, b) => {
            if (a.id === currentPlanId) return -1;
            if (b.id === currentPlanId) return 1;
            return parseFloat(String(a.price)) - parseFloat(String(b.price));
        });
        return list;
    }, [resellerPlans, currentPlanId]);

    const handlePurchase = async (planId: number) => {
        if (!globalThis.confirm(t('shop.confirmPurchase'))) return;
        const r = await purchaseResellerPlan(planId);
        if (r.ok) {
            toast.success(t('shop.alertSuccess'));
            void fetchResellerPlans();
            void fetchStats();
        } else if (r.error) toast.error(r.error);
    };

    return (
        <div className="space-y-8 animate-in">
            <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 p-8 rounded-[32px] border border-blue-500/20 backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                    <FiShoppingCart size={120} />
                </div>
                <div className="relative z-10">
                    <h2 className="text-2xl font-black text-white mb-2">{t('shop.title')}</h2>
                    <p className="text-slate-400 max-w-2xl text-sm font-medium leading-relaxed">
                        {t('shop.intro')}{' '}
                        <span className="text-blue-400 font-bold">&quot;{t('shop.introHighlight')}&quot;</span>{' '}
                        {t('shop.introEnd')}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-4">
                        <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                            <FiZap className="text-blue-400" />
                            <span className="text-xs font-bold text-blue-100 italic">{t('shop.badgeFast')}</span>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                            <FiTag className="text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-100">{t('shop.badgeBulk')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-[32px] border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-6 md:p-8 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-violet-500/20 border border-violet-400/30 text-violet-200">
                            <FiAward size={22} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-300/90">
                                {t('shop.currentSubscriptionTitle')}
                            </p>
                            <h3 className="text-xl md:text-2xl font-black text-white mt-0.5">
                                {hasAssignedPlan ? displayPlanName ?? t('shop.noPlanTitle') : t('shop.noPlanTitle')}
                            </h3>
                            {displayPlanCode ? (
                                <p className="text-xs text-slate-400 font-mono mt-1">
                                    {t('shop.planCode')}: {displayPlanCode}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-right">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 min-w-[120px]">
                            <p className="text-[9px] font-bold text-slate-500 uppercase">{t('shop.licensesInPool')}</p>
                            <p className="text-lg font-black text-emerald-300">{admin?.available_licenses ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 min-w-[120px]">
                            <p className="text-[9px] font-bold text-slate-500 uppercase">{t('shop.walletBalanceLabel')}</p>
                            <p className="text-lg font-black text-white">
                                €{Number(admin?.wallet_balance ?? 0).toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
                {displayPackLicenses != null && Number.isFinite(displayPackLicenses) ? (
                    <p className="text-sm text-slate-300">
                        <span className="text-slate-500">{t('shop.packLicenseCapLabel')}:</span>{' '}
                        <span className="font-bold text-violet-200">{displayPackLicenses}</span>
                    </p>
                ) : null}
                <p className="text-xs text-slate-400 leading-relaxed max-w-3xl border-t border-white/5 pt-4">
                    {hasAssignedPlan ? t('shop.currentSubscriptionHint') : t('shop.noPlanHint')}
                </p>
            </div>

            <div className="rounded-[32px] border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
                <h3 className="text-lg font-black text-white">{t('shop.walletTopupTitle')}</h3>
                <p className="text-xs text-slate-400 max-w-2xl">{t('shop.walletTopupHint')}</p>
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('shop.walletGatewayBadge')}</span>
                    <span className="text-sm font-black text-emerald-300">{gatewayDisplayLabel()}</span>
                    {walletSettingsLoaded && Number(walletSettings?.virtual_pos_test_mode) === 1 ? (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-[10px] font-black text-amber-200 uppercase tracking-wider">
                            {t('shop.walletVirtualPosTest')}
                        </span>
                    ) : null}
                    {walletSettingsLoaded && activeGw === 'stripe' && walletSettings?.stripe_public_key ? (
                        <span className="text-[10px] text-slate-500">Stripe · pk…</span>
                    ) : null}
                </div>
                <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('shop.walletPayMethod')}</p>
                    <div className="flex flex-wrap gap-2">
                        {(
                            [
                                ['bank_transfer', 'shop.walletPayBank'],
                                ['cash', 'shop.walletPayCash'],
                                ['admin_card', 'shop.walletPayCard'],
                            ] as const
                        ).map(([value, labelKey]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setTopupMethod(value)}
                                className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${
                                    topupMethod === value
                                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/40'
                                        : 'bg-white/5 text-slate-400 border border-white/10 hover:border-white/20'
                                }`}
                            >
                                {t(labelKey)}
                            </button>
                        ))}
                    </div>
                </div>
                {topupMethod === 'bank_transfer' && (
                    <div className="space-y-3 pt-1">
                        <div className="flex items-center gap-2 text-white">
                            <FiHome className="text-emerald-400 shrink-0" size={18} />
                            <p className="text-sm font-bold">{t('shop.walletBankTitle')}</p>
                        </div>
                        {!walletSettingsLoaded ? (
                            <p className="text-xs text-slate-500">{t('shop.walletSettingsLoading')}</p>
                        ) : (walletSettings?.reseller_bank_accounts?.length ?? 0) === 0 ? (
                            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">{t('shop.walletBankEmpty')}</p>
                        ) : (
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {(walletSettings?.reseller_bank_accounts ?? []).map((row, idx) => (
                                    <li
                                        key={`${row.iban || ''}-${idx}`}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-1.5 text-xs"
                                    >
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{row.bank_name || '—'}</p>
                                        <p className="text-sm font-bold text-white">{row.account_holder || '—'}</p>
                                        <p className="font-mono text-slate-300 break-all">{row.iban || '—'}</p>
                                        <div className="flex flex-wrap gap-2 pt-1 text-[10px] text-slate-500">
                                            {row.currency ? <span>{row.currency}</span> : null}
                                            {row.note ? <span className="text-slate-400">{row.note}</span> : null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">
                                    {t('shop.walletTransferDate')}
                                </label>
                                <input
                                    type="date"
                                    value={transferDate}
                                    onChange={(e) => setTransferDate(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">
                                    {t('shop.walletTransferTime')}
                                </label>
                                <input
                                    type="time"
                                    value={transferTime}
                                    onChange={(e) => setTransferTime(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                                />
                            </div>
                            <div className="sm:col-span-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">
                                    {t('shop.walletTransferRef')}
                                </label>
                                <input
                                    value={transferReference}
                                    onChange={(e) => setTransferReference(e.target.value)}
                                    placeholder={t('shop.walletTransferRefPh')}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                                />
                            </div>
                        </div>
                    </div>
                )}
                {topupMethod === 'admin_card' && !walletSettingsLoaded ? (
                    <p className="text-xs text-slate-500">{t('shop.walletSettingsLoading')}</p>
                ) : null}
                {topupMethod === 'admin_card' && walletSettingsLoaded && activeGw === 'none' && !cardTestBypassNoGateway ? (
                    <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">{t('shop.walletCardNotConfigured')}</p>
                ) : null}
                {topupMethod === 'admin_card' && walletSettingsLoaded && (activeGw !== 'none' || cardTestBypassNoGateway) ? (
                    <div className="pt-2 space-y-3 border-t border-white/10">
                        <p className="text-sm font-black text-white">{t('shop.walletCardSection')}</p>
                        <WalletCardVisual
                            gatewayLabel={gatewayDisplayLabel()}
                            disclaimer={t('shop.walletCardDisclaimer')}
                            labelPreviewFields={t('shop.walletCardPreviewTitle')}
                            labelName={t('shop.cardFieldName')}
                            labelNumber={t('shop.cardFieldNumber')}
                            labelExpiry={t('shop.cardFieldExpiry')}
                            labelCvc={t('shop.cardFieldCvc')}
                            labelCard={t('shop.cardLabelOnCard')}
                            placeholderName={t('shop.cardPlaceholderName')}
                            placeholderNumber={t('shop.cardPlaceholderNumber')}
                            placeholderCvc={t('shop.cardPlaceholderCvc')}
                            cardholderName={cardName}
                            cardNumberDigits={cardNumber}
                            expiry={cardExpiry}
                            cvc={cardCvc}
                            focused={cardFocus}
                            onFocusField={setCardFocus}
                            onChangeName={setCardName}
                            onChangeNumber={setCardNumber}
                            onChangeExpiry={setCardExpiry}
                            onChangeCvc={setCardCvc}
                        />
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-3 items-end">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{t('shop.walletAmount')}</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={topupAmount}
                            onChange={(e) => setTopupAmount(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white w-36"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{t('shop.walletNote')}</label>
                        <input
                            value={topupNote}
                            onChange={(e) => setTopupNote(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                        />
                    </div>
                    <button
                        type="button"
                        disabled={topupBusy}
                        onClick={() => void submitTopup()}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black disabled:opacity-50"
                    >
                        {t('shop.walletSubmit')}
                    </button>
                </div>
                <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('shop.walletHistory')}</p>
                    {topupHistory.length === 0 ? (
                        <p className="text-xs text-slate-600">—</p>
                    ) : (
                        <ul className="space-y-1 text-xs text-slate-300">
                            {topupHistory.slice(0, 8).map((r) => (
                                <li
                                    key={r.id}
                                    className="flex flex-wrap justify-between gap-x-3 gap-y-1 border border-white/5 rounded-lg px-3 py-2"
                                >
                                    <span>€{Number(r.amount).toFixed(2)}</span>
                                    <span className="text-slate-400">{topupMethodLabel(r.payment_method)}</span>
                                    <span className="text-slate-500">{topupStatusLabel(r.status)}</span>
                                    <span className="text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                <div>
                    <h3 className="text-lg font-black text-white">{t('shop.packagesSectionTitle')}</h3>
                    <p className="text-xs text-slate-500 mt-1">{t('shop.packagesSectionSubtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {sortedPlans.map((plan) => {
                    const isCurrent = plan.id === currentPlanId;
                    const planPrice = parseFloat(String(plan.price));
                    const isLower = currentPrice > 0 && planPrice < currentPrice;
                    const isUpgrade = planPrice > currentPrice || (currentPrice === 0 && !isCurrent);

                    return (
                        <div
                            key={plan.id}
                            className={`bg-white/5 border rounded-[32px] overflow-hidden transition-all group flex flex-col h-full ${isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-white/5 hover:border-blue-500/30'}`}
                        >
                            {isCurrent && (
                                <div className="bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest text-center py-1.5 flex items-center justify-center gap-2">
                                    <FiCheck /> {t('shop.currentBadge')}
                                </div>
                            )}

                            <div className="p-8 pb-4">
                                <div className="flex justify-between items-start mb-6">
                                    <div className={`p-3 rounded-2xl border transition-all duration-300 ${isCurrent ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-blue-600/10 border-blue-500/20 group-hover:bg-blue-600 group-hover:text-white'}`}>
                                        <FiPackage size={24} />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{plan.code}</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                                <div className="flex items-baseline gap-1 mb-6">
                                    <span className="text-3xl font-black text-white">€{plan.price}</span>
                                    <span className="text-slate-500 text-xs font-bold">{t('shop.perPack')}</span>
                                </div>
                            </div>

                            <div className="px-8 pb-8 flex-1 space-y-4">
                                <div className={`p-4 rounded-2xl border ${isCurrent ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-blue-600/5 border-blue-500/10'}`}>
                                    <span className="text-xs text-slate-400 block mb-1">{t('shop.licenseCap')}</span>
                                    <span className={`text-lg font-black ${isCurrent ? 'text-emerald-400' : 'text-blue-400'}`}>
                                        {isUpgrade && currentPlan
                                            ? t('shop.extraLicenses').replace('{n}', String(plan.license_count - currentPlan.license_count))
                                            : t('shop.restLicenses').replace('{n}', String(plan.license_count))}
                                    </span>
                                </div>
                                {plan.description && (
                                    <ul className="space-y-2">
                                        {plan.description.split('+').map((feature: string, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-xs text-slate-400 font-medium">
                                                <FiCheck className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                                                {feature.trim()}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="p-8 pt-0 mt-auto">
                                <button
                                    type="button"
                                    onClick={() => handlePurchase(plan.id)}
                                    disabled={isLoading || isCurrent || isLower}
                                    className="w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-600/30"
                                >
                                    {isCurrent
                                        ? t('shop.currentBadge')
                                        : isLower
                                          ? t('shop.noDowngrade')
                                          : isUpgrade && hasAssignedPlan
                                            ? t('shop.upgradeBuy')
                                            : t('shop.buy')}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {resellerPlans.length === 0 && !isLoading && (
                <p className="text-center text-slate-500 text-sm">{t('shop.empty')}</p>
            )}
        </div>
    );
}
