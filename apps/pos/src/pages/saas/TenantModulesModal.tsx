import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FiCheck,
    FiLock,
    FiPackage,
    FiShoppingCart,
    FiShoppingBag,
    FiLayers,
    FiBox,
    FiCreditCard,
    FiDollarSign,
    FiHome,
    FiPieChart,
    FiFilter,
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { Modal } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

type Ent = {
    code: string;
    name: string;
    category: string;
    enabled: boolean;
    mode: string;
    reason: string;
    setup_price?: number;
    monthly_price?: number;
    quantity?: number;
    monthlyLineTotal?: number;
};

type BillingSnap = {
    planCode: string;
    billingCycle: 'monthly' | 'yearly';
    monthlyRecurringTotal: number;
    planBaseMonthly: number;
    monthlyFromAddons: number;
    nextPaymentDue: string | null;
};

function SectionCard({
    title,
    icon,
    accent,
    children,
    className = '',
}: {
    title: string;
    icon: React.ReactNode;
    accent: 'emerald' | 'amber' | 'violet';
    children: React.ReactNode;
    className?: string;
}) {
    const border =
        accent === 'emerald' ? 'border-emerald-500/50' : accent === 'amber' ? 'border-amber-500/50' : 'border-violet-500/50';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-4 backdrop-blur-md shadow-2xl transition-all hover:border-white/20 ${className}`}
        >
            <h3
                className={`mb-4 flex items-center gap-2.5 border-l-2 ${border} pl-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-white transition-colors`}
            >
                <span className="text-slate-500 [&>svg]:shrink-0">{icon}</span>
                {title}
            </h3>
            {children}
        </motion.div>
    );
}

export const TenantModulesModal: React.FC<{
    tenantId: string;
    tenantName: string;
    onClose: () => void;
}> = ({ tenantId, tenantName, onClose }) => {
    const { t } = useSaaSLocale();
    const { token: saasToken, settings } = useSaaSStore();
    const { getAuthHeaders } = useAuthStore();
    const currency = settings?.currency || '€';

    const PAYMENT_OPTS = useMemo(
        () =>
            [
                { id: 'wallet_balance' as const, label: t('modules.pay.wallet'), hint: t('modules.pay.walletHint'), icon: <FiPieChart className="text-emerald-400/90" size={16} /> },
                { id: 'bank_transfer' as const, label: t('modules.pay.transfer'), hint: t('modules.pay.transferHint'), icon: <FiHome className="text-sky-400/90" size={16} /> },
                { id: 'admin_card' as const, label: t('modules.pay.card'), hint: t('modules.pay.cardHint'), icon: <FiCreditCard className="text-violet-400/90" size={16} /> },
                { id: 'cash' as const, label: t('modules.pay.cash'), hint: t('modules.pay.cashHint'), icon: <FiDollarSign className="text-amber-400/90" size={16} /> },
            ],
        [t],
    );

    const reasonLabel = (reason: string) => {
        const key = `modules.reason.${reason}`;
        const v = t(key);
        return v === key ? reason : v;
    };
    const [data, setData] = useState<{ tenantId: string; entitlements: Ent[]; billingSnapshot?: BillingSnap | null } | null>(
        null
    );
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [addonPick, setAddonPick] = useState<string[]>([]);
    const [extraQty, setExtraQty] = useState(1);
    const [paymentMethod, setPaymentMethod] = useState<'wallet_balance' | 'bank_transfer' | 'admin_card' | 'cash'>(
        'bank_transfer'
    );
    const [msg, setMsg] = useState('');
    const [loading, setLoading] = useState(true);

    const billingFetch = useCallback(
        async (path: string, init?: RequestInit) => {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(saasToken ? { Authorization: `Bearer ${saasToken}` } : getAuthHeaders()),
                ...((init?.headers as Record<string, string>) || {}),
            };
            return fetch(`/api/v1/billing${path}`, { ...init, headers });
        },
        [getAuthHeaders, saasToken],
    );

    const load = async () => {
        setLoading(true);
        try {
            const res = await billingFetch(`/tenants/${encodeURIComponent(tenantId)}/entitlements`);
            if (!res.ok) {
                setData(null);
                setMsg(res.status === 401 ? t('modules.error.unauthorized') : t('modules.error.loadEntitlements'));
                setLoading(false);
                return;
            }
            const d = await res.json();
            setData(d);
            setMsg('');
        } catch {
            setData(null);
            setMsg(t('modules.error.loadEntitlements'));
        }
        setAddonPick([]);
        setCategoryFilter('all');
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [tenantId]);

    const list = data?.entitlements || [];

    const activeModules = useMemo(() => list.filter((e) => e.enabled), [list]);

    const lockedModules = useMemo(() => list.filter((e) => e.mode === 'locked'), [list]);

    /** Sadece satılabilir ek modüller: planda addon, henüz açılmamış (dahil/kilitli/aktif hariç) */
    const purchasableAddons = useMemo(() => {
        return list
            .filter((e) => e.mode === 'addon' && !e.enabled)
            .sort((a, b) => {
                const c = a.category.localeCompare(b.category);
                if (c !== 0) return c;
                return a.name.localeCompare(b.name);
            });
    }, [list]);

    const purchasableCategories = useMemo(
        () => [...new Set(purchasableAddons.map((e) => e.category))].sort(),
        [purchasableAddons]
    );

    const filteredPurchasable = useMemo(() => {
        if (categoryFilter === 'all') return purchasableAddons;
        return purchasableAddons.filter((e) => e.category === categoryFilter);
    }, [categoryFilter, purchasableAddons]);

    /** Planlar sekmesindeki kartla aynı: dahil / ek satış / kilit — «aktif» değil, tanım */
    const CATEGORY_ORDER = ['core', 'feature', 'channel', 'device', 'service', 'integration'];
    const planMatrixByCategory = useMemo(() => {
        const m = new Map<string, Ent[]>();
        for (const e of list) {
            const c = e.category || 'feature';
            if (!m.has(c)) m.set(c, []);
            m.get(c)!.push(e);
        }
        for (const arr of m.values()) {
            arr.sort((a, b) => a.name.localeCompare(b.name));
        }
        const keys = [...m.keys()].sort((a, b) => {
            const ia = CATEGORY_ORDER.indexOf(a);
            const ib = CATEGORY_ORDER.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        return keys.map((k) => ({ category: k, items: m.get(k)! }));
    }, [list]);

    const categoryTitle = (cat: string) => {
        const k = `plans.category.${cat}`;
        const v = t(k);
        return v === k ? cat : v;
    };

    const price = (e: Ent) => ({
        setup: Number(e.setup_price ?? 0),
        monthly: Number(e.monthly_price ?? 0),
    });

    const cartLines = useMemo(() => {
        const lines: { code: string; name: string; setup: number; monthly: number; qty: number }[] = [];
        for (const code of addonPick) {
            const e = purchasableAddons.find((x) => x.code === code);
            if (!e) continue;
            const p = price(e);
            const qty = code === 'extra_device' ? Math.max(1, extraQty) : 1;
            lines.push({
                code,
                name: e.name,
                setup: p.setup * qty,
                monthly: p.monthly * qty,
                qty,
            });
        }
        return lines;
    }, [addonPick, purchasableAddons, extraQty]);

    const cartTotals = useMemo(() => {
        let setup = 0;
        let monthly = 0;
        for (const l of cartLines) {
            setup += l.setup;
            monthly += l.monthly;
        }
        return { setup, monthly };
    }, [cartLines]);

    const toggleAddon = (code: string) => {
        setAddonPick((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    };

    const handlePurchase = async () => {
        if (!addonPick.length) return;
        const ext = addonPick.includes('extra_device') ? extraQty : undefined;
        try {
            const res = await billingFetch(`/tenants/${encodeURIComponent(tenantId)}/addons`, {
                method: 'POST',
                body: JSON.stringify({
                    module_codes: addonPick,
                    ...(ext ? { extra_device_qty: ext } : {}),
                    payment_method: paymentMethod,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMsg(d?.error || t('modules.error.generic'));
                return;
            }

            const totals = d?.totals;
            let nextMsg = `${t('modules.purchase.ok')}: ${(d?.added || []).join(', ') || '—'}`;
            if ((d?.skipped || []).length) {
                nextMsg += ` · ${t('modules.purchase.skipped')}: ${d?.skipped?.join(', ')}`;
            }
            if (totals) {
                nextMsg += ` · ${t('modules.purchase.estimate')
                    .replace('{setup}', `${currency}${Number(totals.setup || 0).toFixed(2)}`)
                    .replace('{monthly}', `${currency}${Number(totals.monthly || 0).toFixed(2)}`)}`;
            }
            setMsg(nextMsg);
            await load();
        } catch {
            setMsg(t('modules.error.generic'));
        }
    };

    return (
        <Modal 
            show={true} 
            title={t('modules.title').replace('{name}', tenantName)} 
            onClose={onClose} 
            maxWidth="max-w-6xl"
        >
            {loading ? (
                <div className="py-12 text-center text-sm text-slate-500">{t('modules.loading')}</div>
            ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-12 xl:gap-4">
                    {/* Sol: durum */}
                    <div className="space-y-3 xl:col-span-5">
                        {data?.billingSnapshot && (
                            <SectionCard
                                title={t('modules.billingSummary')}
                                accent="violet"
                                icon={<FiPieChart size={15} className="text-violet-400/90" />}
                            >
                                <div className="space-y-3 rounded-2xl border border-white/5 bg-black/40 px-4 py-4 text-xs text-slate-300 shadow-inner">
                                    <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                                        <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">{t('modules.planLabel')}</span>
                                        <span className="font-black text-blue-400 tracking-wider truncate">{data.billingSnapshot.planCode}</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-slate-500">{t('modules.planBaseFee')}</span>
                                        <span className="tabular-nums font-bold text-slate-200">{currency}{data.billingSnapshot.planBaseMonthly.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-slate-500">{t('modules.addonsMonthlyLine')}</span>
                                        <span className="tabular-nums font-bold text-violet-400">{currency}{data.billingSnapshot.monthlyFromAddons.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between gap-2 border-t border-white/10 pt-3 font-black text-white text-sm">
                                        <span className="uppercase tracking-tighter">{t('modules.totalMonthlyService')}</span>
                                        <span className="tabular-nums text-emerald-400">{currency}{data.billingSnapshot.monthlyRecurringTotal.toFixed(2)}</span>
                                    </div>
                                    {data.billingSnapshot.nextPaymentDue && (
                                        <div className="flex justify-between gap-2 text-[10px] text-slate-600 bg-white/5 px-2 py-1.5 rounded-lg mt-2">
                                            <span className="font-bold">{t('modules.nextPaymentDue')}</span>
                                            <span className="font-mono text-slate-400">{data.billingSnapshot.nextPaymentDue}</span>
                                        </div>
                                    )}
                                    <p className="text-[10px] leading-relaxed text-slate-600 italic mt-2 px-1">{t('modules.monthlyRecurringNote')}</p>
                                </div>
                            </SectionCard>
                        )}

                        {list.length > 0 && (
                            <SectionCard
                                title={t('modules.planMatrixTitle')}
                                accent="amber"
                                icon={<FiLayers size={15} className="text-amber-400/90" />}
                            >
                                <p className="mb-2.5 text-[10px] leading-relaxed text-slate-500">{t('modules.planMatrixHelp')}</p>
                                <div className="max-h-[min(36vh,260px)] space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                                    {planMatrixByCategory.map(({ category, items }) => (
                                        <div key={category} className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
                                            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.25em] text-white/20 border-b border-white/5 pb-1">
                                                {categoryTitle(category)}
                                            </div>
                                            <div className="space-y-2">
                                                {items.map((e) => {
                                                    const p = price(e);
                                                    return (
                                                        <div
                                                            key={e.code}
                                                            className={`flex items-center gap-2.5 text-[11px] ${
                                                                e.mode === 'locked' ? 'opacity-40 grayscale' : 'opacity-100'
                                                            }`}
                                                        >
                                                            <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                                                                e.mode === 'included' ? 'bg-emerald-500/10 text-emerald-400' :
                                                                e.mode === 'addon' ? 'bg-sky-500/10 text-sky-400' :
                                                                'bg-amber-500/10 text-amber-500'
                                                            }`}>
                                                                {e.mode === 'included' && <FiCheck size={11} />}
                                                                {e.mode === 'addon' && <FiShoppingBag size={11} />}
                                                                {e.mode === 'locked' && <FiLock size={11} />}
                                                            </div>
                                                            <span className="min-w-0 flex-1 truncate font-medium text-slate-300">{e.name}</span>
                                                            {e.mode === 'addon' && (
                                                                <span className="shrink-0 text-[10px] tabular-nums font-black text-sky-400/60 bg-sky-400/5 px-2 py-0.5 rounded-full border border-sky-400/10">
                                                                    +{currency}{p.monthly.toFixed(2)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        <SectionCard title={t('modules.activeTitle')} accent="emerald" icon={<FiCheck size={15} className="text-emerald-400/90" />}>
                            <p className="mb-2 text-[10px] leading-relaxed text-slate-500">{t('modules.activeSubtitle')}</p>
                            {activeModules.length === 0 ? (
                                <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-3 text-xs text-slate-500">
                                    <FiLayers className="mt-0.5 shrink-0 text-slate-600" size={16} />
                                    <span>{t('modules.activeEmpty')}</span>
                                </div>
                            ) : (
                                <ul className="max-h-[min(40vh,220px)] space-y-1.5 overflow-y-auto pr-0.5 custom-scrollbar">
                                    {activeModules.map((e) => (
                                        <li
                                            key={e.code}
                                            className="flex items-start gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2.5 py-2"
                                        >
                                            <FiLayers className="mt-0.5 shrink-0 text-emerald-400/80" size={14} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-white">{e.name}</div>
                                                <div className="font-mono text-[10px] text-slate-500">{e.code}</div>
                                                {(e.reason === 'purchased_addon' || e.quantity) && (
                                                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                                                        {e.quantity != null && e.quantity > 1 && (
                                                            <span>
                                                                {t('modules.qtyShort')}: {e.quantity}
                                                            </span>
                                                        )}
                                                        {e.monthlyLineTotal != null && e.monthlyLineTotal > 0 && (
                                                            <span className="text-violet-300/90">
                                                                {t('modules.monthlyLineShort')}: {currency}{e.monthlyLineTotal.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-[9px] font-semibold uppercase text-emerald-400/90">
                                                {reasonLabel(e.reason)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SectionCard>

                        {lockedModules.length > 0 && (
                            <SectionCard title={t('modules.lockedTitle')} accent="amber" icon={<FiLock size={15} className="text-amber-400/90" />}>
                                <ul className="max-h-[min(36vh,200px)] space-y-1.5 overflow-y-auto pr-0.5 custom-scrollbar">
                                    {lockedModules.map((e) => {
                                        const p = price(e);
                                        return (
                                            <li
                                                key={e.code}
                                                className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-2 text-xs"
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <FiLock className="shrink-0 text-amber-400/70" size={13} />
                                                    <span className="truncate text-slate-300">{e.name}</span>
                                                </span>
                                                <span className="shrink-0 tabular-nums text-[10px] text-slate-500">
                                                    {p.setup > 0 || p.monthly > 0
                                                        ? `${t('modules.priceSetup')} ${p.setup}${currency} · ${t('modules.priceMonth')} ${p.monthly}${currency}`
                                                        : '—'}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </SectionCard>
                        )}
                    </div>

                    {/* Sağ: satın alma */}
                    <div className="space-y-3 xl:col-span-7">
                        {purchasableAddons.length > 0 && (
                            <>
                                <SectionCard title={t('modules.pickAddon')} accent="violet" icon={<FiPackage size={15} className="text-violet-400/90" />}>
                                    {purchasableCategories.length > 1 && (
                                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                            <FiFilter size={12} className="text-slate-500" />
                                            <button
                                                type="button"
                                                onClick={() => setCategoryFilter('all')}
                                                className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                                    categoryFilter === 'all' ? 'bg-violet-500/30 text-white' : 'bg-white/5 text-slate-500'
                                                }`}
                                            >
                                                {t('modules.filterAll')}
                                            </button>
                                            {purchasableCategories.map((cat) => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setCategoryFilter(cat)}
                                                    className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                                        categoryFilter === cat ? 'bg-violet-500/30 text-white' : 'bg-white/5 text-slate-500'
                                                    }`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="grid max-h-[min(42vh,300px)] grid-cols-1 gap-3 overflow-y-auto pr-2 sm:grid-cols-2 custom-scrollbar pb-2">
                                        <AnimatePresence mode="popLayout">
                                        {filteredPurchasable.map((e) => {
                                            const p = price(e);
                                            const sel = addonPick.includes(e.code);
                                            return (
                                                <motion.label
                                                    key={e.code}
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className={`relative flex cursor-pointer flex-col gap-2.5 rounded-2xl border p-4 transition-all duration-300 group shadow-lg ${
                                                        sel
                                                            ? 'border-violet-500/50 bg-violet-600/10 ring-2 ring-violet-500/20 shadow-violet-900/20'
                                                            : 'border-white/5 bg-black/30 hover:border-white/20 hover:bg-black/40'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={sel}
                                                        onChange={() => toggleAddon(e.code)}
                                                        className="absolute right-4 top-4 h-4 w-4 rounded-lg border-white/20 accent-violet-500 cursor-pointer"
                                                    />
                                                    <div className="flex items-start gap-3 pr-8">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-inner ${sel ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-500 group-hover:text-violet-400'}`}>
                                                            <FiBox size={18} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className={`text-sm font-bold leading-tight transition-colors ${sel ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{e.name}</div>
                                                            <div className="font-mono text-[9px] text-slate-600 mt-0.5 tracking-widest uppercase">{e.code}</div>
                                                        </div>
                                                    </div>
                                                    <div className={`flex justify-between border-t border-white/10 pt-3 text-[10px] font-black tabular-nums transition-colors ${sel ? 'text-violet-300' : 'text-slate-500'}`}>
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] uppercase tracking-widest opacity-50 mb-0.5">{t('modules.setupLabel')}</span>
                                                            <span className="text-xs">{currency}{p.setup.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex flex-col text-right">
                                                            <span className="text-[8px] uppercase tracking-widest opacity-50 mb-0.5">{t('modules.monthlyLabel')}</span>
                                                            <span className="text-xs">{currency}{p.monthly.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </motion.label>
                                            );
                                        })}
                                        </AnimatePresence>
                                    </div>

                                    {addonPick.includes('extra_device') && (
                                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                                            <label className="text-[10px] font-medium uppercase text-slate-500">{t('modal.tenant.extraDevices')}</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={extraQty}
                                                onChange={(ev) => setExtraQty(Number(ev.target.value) || 1)}
                                                className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-center text-xs text-white tabular-nums"
                                            />
                                        </div>
                                    )}
                                </SectionCard>

                                {addonPick.length > 0 && (
                                    <div className="rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-500/10 to-transparent p-3">
                                        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">
                                            <FiShoppingCart size={15} /> {t('modules.cartTitle')}
                                        </div>
                                        <ul className="space-y-1.5 text-xs text-slate-300">
                                            {cartLines.map((l) => (
                                                <li key={l.code} className="flex justify-between gap-2">
                                                    <span className="truncate">
                                                        {l.name}
                                                        {l.qty > 1 ? ` ×${l.qty}` : ''}
                                                    </span>
                                                    <span className="shrink-0 tabular-nums text-slate-500">
                                                        {t('modules.cartLine').replace('{setup}', l.setup.toFixed(2)).replace('{monthly}', l.monthly.toFixed(2))}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-white">
                                            <span className="text-xs text-slate-400">{t('modules.totalEst')}</span>
                                            <span className="tabular-nums text-violet-200">
                                                {currency}{cartTotals.setup.toFixed(2)} + {currency}{cartTotals.monthly.toFixed(2)}/ay
                                            </span>
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            <span className="text-[10px] font-medium uppercase text-slate-500">{t('modules.payMethod')}</span>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {PAYMENT_OPTS.map((opt) => (
                                                    <label
                                                        key={opt.id}
                                                        className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-all ${
                                                            paymentMethod === opt.id
                                                                ? 'border-violet-400/50 bg-violet-600/20'
                                                                : 'border-white/10 bg-black/20 hover:border-white/20'
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="pay"
                                                            checked={paymentMethod === opt.id}
                                                            onChange={() => setPaymentMethod(opt.id)}
                                                            className="mt-0.5 accent-violet-500"
                                                        />
                                                        <span className="flex min-w-0 flex-1 gap-2">
                                                            <span className="mt-0.5 shrink-0">{opt.icon}</span>
                                                            <span>
                                                                <span className="block text-xs font-semibold text-white">{opt.label}</span>
                                                                <span className="mt-0.5 block text-[10px] text-slate-500">{opt.hint}</span>
                                                            </span>
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={!addonPick.length}
                                            onClick={handlePurchase}
                                            className="mt-3 w-full rounded-lg bg-violet-600 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-violet-900/25 transition hover:bg-violet-500 disabled:opacity-40"
                                        >
                                            {t('modules.completePurchase')}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {purchasableAddons.length === 0 && activeModules.length > 0 && (
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-center text-xs text-slate-500">
                                {t('modules.noMoreAddons')}
                            </div>
                        )}

                        {msg && (
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-slate-300">{msg}</div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
};
