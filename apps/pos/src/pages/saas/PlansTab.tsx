import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    FiCreditCard, FiToggleLeft, FiToggleRight, FiGift,
    FiPlus, FiPackage, FiCheck, FiX, FiShoppingBag,
    FiUsers, FiMonitor, FiClock, FiLayers, FiDatabase, FiPrinter,
    FiEdit2, FiSave, FiGrid, FiSliders, FiTag, FiKey,
} from 'react-icons/fi';
import { useSaaSStore, type PlanModuleRow, type BillingModuleRow } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { SectionCard, EmptyState, Modal, InputGroup, SelectGroup } from './SaaSShared';
import { BillingModulesAdminCard } from './BillingModulesAdminCard';

/* ═══════════════════════════════════════════════════
   Sabitler
   ═══════════════════════════════════════════════════ */
const PLAN_COLORS: Record<string, { bg: string; ring: string; badge: string }> = {
    basic:      { bg: 'from-slate-800 to-slate-700',  ring: 'ring-slate-500/30',  badge: 'bg-slate-600' },
    pro:        { bg: 'from-blue-800 to-indigo-700',  ring: 'ring-blue-500/30',   badge: 'bg-blue-600' },
    enterprise: { bg: 'from-amber-800 to-orange-700', ring: 'ring-amber-500/30',  badge: 'bg-amber-600' },
};
const CATEGORY_ORDER = ['feature', 'channel', 'device', 'service', 'core', 'integration'] as const;
/** Plan karşılaştırma kartlarında modül listesi için sıra */
const PLAN_CARD_CATEGORIES = ['feature', 'channel', 'device', 'service'] as const;
const MODE_STYLE: Record<string, string> = {
    included: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    addon: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    locked: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
};
function ModeIcon({ mode }: { mode: string }) {
    if (mode === 'included') return <FiCheck className="text-emerald-400" size={14} />;
    if (mode === 'addon') return <FiShoppingBag className="text-blue-400" size={12} />;
    return <FiX className="text-slate-600" size={14} />;
}

/* ═══════════════════════════════════════════════════
   Plan Oluştur / Düzenle Modalı
   ═══════════════════════════════════════════════════ */
interface PlanForm {
    name: string;
    code: string;
    monthly_fee: number;
    setup_fee: number;
    max_users: number;
    max_branches: number;
    max_products: number;
    max_devices: number;
    /** Pakette dahil yazıcı istasyonu (mutfak+adisyon vb.); ek satır için extra_printer modülü */
    max_printers: number;
    /** Aylık tenant cihaz sıfırlama hakkı */
    device_reset_quota_monthly: number;
    support_hours: string;
    trial_days: number;
}
const DEFAULT_PLAN: PlanForm = {
    name: '',
    code: '',
    monthly_fee: 49,
    setup_fee: 499,
    max_users: 10,
    max_branches: 3,
    max_products: 1000,
    max_devices: 3,
    max_printers: 2,
    device_reset_quota_monthly: 3,
    support_hours: '08:00-17:00',
    trial_days: 14,
};

type ModuleRules = Record<string, 'included' | 'addon' | 'locked'>;

const PlanEditorModal: React.FC<{
    show: boolean;
    onClose: () => void;
    editMode: boolean;
    editPlanId?: number;
    initialForm: PlanForm;
    initialRules: ModuleRules;
    catalog: BillingModuleRow[];
    onSave: (form: PlanForm, rules: ModuleRules, editId?: number) => Promise<void>;
    currency: string;
}> = ({ show, onClose, editMode, editPlanId, initialForm, initialRules, catalog, onSave, currency }) => {
    const { t } = useSaaSLocale();
    const catLabel = (cat: string) => {
        const k = `plans.category.${cat}`;
        const v = t(k);
        return v === k ? cat : v;
    };
    const modeLabel = (m: 'included' | 'addon' | 'locked') => t(`plans.mode.${m}`);
    const [step, setStep] = useState<1 | 2>(1);
    const [form, setForm] = useState<PlanForm>(initialForm);
    const [rules, setRules] = useState<ModuleRules>({});
    const [saving, setSaving] = useState(false);

    /** Katalogdaki her modül için kural: eksikler addon (API ile uyumlu) */
    const mergedFromProps = useMemo(() => {
        const r: ModuleRules = {};
        for (const c of catalog) {
            r[c.code] = initialRules[c.code] ?? 'addon';
        }
        return r;
    }, [catalog, initialRules]);

    useEffect(() => {
        if (!show) return;
        setForm(initialForm);
        setRules(mergedFromProps);
        setStep(1);
    }, [show, initialForm, mergedFromProps]);

    const grouped = useMemo(() => {
        const m: Record<string, BillingModuleRow[]> = {};
        for (const c of catalog) {
            const cat = c.category || 'feature';
            if (!m[cat]) m[cat] = [];
            m[cat].push(c);
        }
        return m;
    }, [catalog]);

    const sortedCategories = useMemo(() => {
        const keys = Object.keys(grouped);
        const ordered = CATEGORY_ORDER.filter((k) => keys.includes(k));
        const rest = keys.filter((k) => !CATEGORY_ORDER.includes(k as (typeof CATEGORY_ORDER)[number]));
        return [...ordered, ...rest.sort()];
    }, [grouped]);

    const stats = useMemo(() => {
        let included = 0;
        let addon = 0;
        let locked = 0;
        for (const c of catalog) {
            const mode = rules[c.code] ?? 'addon';
            if (mode === 'included') included++;
            else if (mode === 'addon') addon++;
            else locked++;
        }
        return { included, addon, locked };
    }, [rules, catalog]);

    const F = useCallback((field: keyof PlanForm, val: string | number) => setForm(f => ({ ...f, [field]: val })), []);

    const applyBulk = (mode: 'included' | 'addon' | 'locked', category?: string) => {
        setRules(prev => {
            const next = { ...prev };
            const targets = category ? catalog.filter(c => c.category === category) : catalog;
            for (const m of targets) next[m.code] = mode;
            return next;
        });
    };

    const handleSubmit = async () => {
        if (!form.name || !form.code) return;
        setSaving(true);
        try { await onSave(form, rules, editMode ? editPlanId : undefined); }
        finally { setSaving(false); }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 w-full max-w-3xl rounded-[24px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="p-5 border-b border-white/5 bg-white/5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                            {editMode ? <FiEdit2 className="text-blue-400" /> : <FiPlus className="text-blue-400" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">{editMode ? t('plans.editor.editTitle') : t('plans.editor.newTitle')}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('plans.editor.step').replace('{step}', String(step)).replace('{part}', step === 1 ? t('plans.editor.step1') : t('plans.editor.step2'))}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Kapat" title="Kapat" className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"><FiX size={20} /></button>
                </div>

                {/* Steps indicator */}
                <div className="px-5 pt-4 pb-2 flex gap-2 shrink-0">
                    <button onClick={() => setStep(1)} className={`flex-1 h-1.5 rounded-full transition-all ${step >= 1 ? 'bg-blue-500' : 'bg-white/10'}`} />
                    <button onClick={() => step === 2 ? null : setStep(2)} className={`flex-1 h-1.5 rounded-full transition-all ${step >= 2 ? 'bg-blue-500' : 'bg-white/10'}`} />
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                    {step === 1 && (
                        <div className="space-y-5 animate-in fade-in duration-300">
                            {/* Temel */}
                            <div>
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><FiCreditCard size={12} /> {t('plans.editor.basic')}</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <InputGroup label={t('plans.editor.planName')} value={form.name} onChange={v => F('name', v)} placeholder={t('plans.editor.planNamePh')} />
                                    <InputGroup label={t('plans.editor.planCode')} value={form.code} onChange={v => F('code', v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder={t('plans.editor.planCodePh')} />
                                </div>
                            </div>

                            {/* Fiyat */}
                            <div>
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><FiCreditCard size={12} /> {t('plans.editor.pricing')}</div>
                                <div className="grid grid-cols-3 gap-4">
                                    <InputGroup label={t('plans.editor.monthlyFee')} type="number" value={form.monthly_fee} onChange={v => F('monthly_fee', Number(v))} />
                                    <InputGroup label={t('plans.editor.setupFee')} type="number" value={form.setup_fee} onChange={v => F('setup_fee', Number(v))} />
                                    <InputGroup label={t('plans.editor.trialDays')} type="number" value={form.trial_days} onChange={v => F('trial_days', Number(v))} />
                                </div>
                            </div>

                            {/* Limitler */}
                            <div>
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><FiSliders size={12} /> {t('plans.editor.limits')}</div>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.editor.maxDevices')}</label>
                                        <div className="flex items-center gap-3">
                                            <input type="range" min={1} max={50} value={form.max_devices} onChange={e => F('max_devices', Number(e.target.value))} className="flex-1 accent-blue-500" />
                                            <span className="text-lg font-black text-white w-8 text-center">{form.max_devices}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.editor.maxPrinters')}</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="range"
                                                min={1}
                                                max={30}
                                                value={form.max_printers}
                                                onChange={(e) => F('max_printers', Number(e.target.value))}
                                                className="flex-1 accent-violet-500"
                                            />
                                            <span className="text-lg font-black text-white w-8 text-center">{form.max_printers}</span>
                                        </div>
                                        <p className="mt-1.5 text-[9px] font-medium text-slate-500 leading-snug">{t('plans.editor.maxPrintersHint')}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Aylık Cihaz Sıfırlama</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="range"
                                                min={0}
                                                max={30}
                                                value={form.device_reset_quota_monthly}
                                                onChange={(e) => F('device_reset_quota_monthly', Number(e.target.value))}
                                                className="flex-1 accent-rose-500"
                                            />
                                            <span className="text-lg font-black text-white w-8 text-center">{form.device_reset_quota_monthly}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.maxBranch')}</label>
                                        <div className="flex items-center gap-3">
                                            <input type="range" min={1} max={50} value={form.max_branches} onChange={e => F('max_branches', Number(e.target.value))} className="flex-1 accent-blue-500" />
                                            <span className="text-lg font-black text-white w-8 text-center">{form.max_branches}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.maxUser')}</label>
                                        <div className="flex items-center gap-3">
                                            <input type="range" min={1} max={100} value={form.max_users} onChange={e => F('max_users', Number(e.target.value))} className="flex-1 accent-blue-500" />
                                            <span className="text-lg font-black text-white w-8 text-center">{form.max_users}</span>
                                        </div>
                                    </div>
                                    <InputGroup label={t('plans.maxProduct')} type="number" value={form.max_products} onChange={v => F('max_products', Number(v))} />
                                    <SelectGroup label={t('plans.supportHours')} value={form.support_hours} onChange={v => F('support_hours', v)} options={[
                                        { label: t('plans.support.business'), value: '08:00-17:00' },
                                        { label: t('plans.support.extended'), value: '08:00-22:00' },
                                        { label: t('plans.support.24'), value: '7/24' },
                                    ]} />
                                </div>
                            </div>

                            {/* Özet */}
                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4">
                                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">{t('plans.summary')}</div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                    <div className="text-center"><span className="text-2xl font-black text-white">{currency}{form.monthly_fee}</span><div className="text-[10px] text-slate-500">{t('plans.monthlyLabel')}</div></div>
                                    <div className="text-center"><span className="text-2xl font-black text-white">{form.max_devices}</span><div className="text-[10px] text-slate-500">{t('plans.deviceLabel')}</div></div>
                                    <div className="text-center"><span className="text-2xl font-black text-white">{form.max_printers}</span><div className="text-[10px] text-slate-500">{t('plans.printerLabel')}</div></div>
                                    <div className="text-center"><span className="text-2xl font-black text-white">{form.device_reset_quota_monthly}</span><div className="text-[10px] text-slate-500">Reset/Ay</div></div>
                                    <div className="text-center"><span className="text-2xl font-black text-white">{form.max_branches}</span><div className="text-[10px] text-slate-500">{t('plans.branchLabel')}</div></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && catalog.length === 0 && (
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
                            <p className="text-sm text-amber-200/90 font-medium">{t('plans.catalogEmpty')}</p>
                            <p className="text-xs text-slate-500 mt-2">{t('plans.catalogHint')}</p>
                        </div>
                    )}

                    {step === 2 && catalog.length > 0 && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            {/* Toplu işlem */}
                            <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-white/5">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('plans.bulk')}</span>
                                {(['included', 'addon', 'locked'] as const).map(m => (
                                    <button key={m} type="button" onClick={() => applyBulk(m)} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${MODE_STYLE[m]}`}>
                                        {t('plans.bulkAll').replace('{mode}', modeLabel(m))}
                                    </button>
                                ))}
                                <div className="ml-auto flex items-center gap-3 text-[10px] font-bold">
                                    <span className="text-emerald-400">{t('plans.stat.included').replace('{n}', String(stats.included))}</span>
                                    <span className="text-blue-400">{t('plans.stat.addon').replace('{n}', String(stats.addon))}</span>
                                    <span className="text-slate-500">{t('plans.stat.locked').replace('{n}', String(stats.locked))}</span>
                                </div>
                            </div>

                            {/* Kategorilere göre modüller */}
                            {sortedCategories.map((cat) => {
                                const mods = grouped[cat];
                                if (!mods?.length) return null;
                                return (
                                    <div key={cat} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{catLabel(cat)}</span>
                                            <div className="flex gap-1">
                                                {(['included', 'addon', 'locked'] as const).map(m => (
                                                    <button key={m} type="button" onClick={() => applyBulk(m, cat)}
                                                        className="text-[9px] text-slate-600 hover:text-white px-2 py-0.5 rounded border border-white/5 hover:border-white/20 transition-all">
                                                        {modeLabel(m)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            {mods.map(mod => {
                                                const mode = rules[mod.code] || 'addon';
                                                return (
                                                    <div key={mod.code} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-all group">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-bold text-white truncate">{mod.name}</div>
                                                            <div className="text-[10px] text-slate-500 truncate">{mod.description || mod.code}</div>
                                                        </div>
                                                        <div className="text-[10px] text-slate-600 text-right shrink-0 w-20">
                                                            {mod.setup_price > 0 && <div>{currency}{mod.setup_price} {t('plans.setupShort')}</div>}
                                                            {mod.monthly_price > 0 && <div>{currency}{mod.monthly_price}{t('modal.tenant.perMonth')}</div>}
                                                            {mod.setup_price === 0 && mod.monthly_price === 0 && <div>{t('plans.free')}</div>}
                                                        </div>
                                                        <div className="flex gap-1 shrink-0">
                                                            {(['included', 'addon', 'locked'] as const).map(m => (
                                                                <button key={m} type="button" onClick={() => setRules(prev => ({ ...prev, [mod.code]: m }))}
                                                                    className={`w-7 h-7 rounded-lg text-[10px] font-black flex items-center justify-center transition-all border ${
                                                                        mode === m
                                                                            ? m === 'included' ? 'bg-emerald-500 text-white border-emerald-400'
                                                                            : m === 'addon' ? 'bg-blue-500 text-white border-blue-400'
                                                                            : 'bg-slate-600 text-white border-slate-500'
                                                                            : 'bg-white/5 text-slate-600 border-white/5 hover:border-white/20'
                                                                    }`}
                                                                    title={modeLabel(m)}
                                                                >
                                                                    {m === 'included' ? <FiCheck size={12} /> : m === 'addon' ? <FiShoppingBag size={10} /> : <FiX size={12} />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                    {step === 1 ? (
                        <>
                            <button type="button" onClick={onClose} className="px-5 py-3 text-sm font-bold text-slate-400 hover:text-white transition-all">{t('plans.editor.cancel')}</button>
                            <button type="button" onClick={() => setStep(2)} disabled={!form.name || !form.code}
                                className="px-8 py-3 bg-blue-600 text-white font-black text-sm rounded-xl hover:bg-blue-500 transition-all disabled:opacity-30 flex items-center gap-2">
                                {t('plans.configureModules')} <FiGrid size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={() => setStep(1)} className="px-5 py-3 text-sm font-bold text-slate-400 hover:text-white transition-all flex items-center gap-2"><FiSliders size={14} /> {t('plans.editor.back')}</button>
                            <button type="button" onClick={handleSubmit} disabled={saving}
                                className="px-8 py-3 bg-emerald-600 text-white font-black text-sm rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center gap-2">
                                <FiSave size={14} /> {saving ? t('plans.saving') : editMode ? t('plans.updatePlanBtn') : t('plans.createPlanBtn')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   Bayi lisans paketi — oluştur / düzenle modalı
   ═══════════════════════════════════════════════════ */
export interface ResellerPackageForm {
    name: string;
    code: string;
    price: number;
    license_count: number;
    description: string;
}

const DEFAULT_RESELLER_FORM: ResellerPackageForm = {
    name: '',
    code: '',
    price: 999,
    license_count: 10,
    description: '',
};

const ResellerPackageModal: React.FC<{
    show: boolean;
    onClose: () => void;
    editId: number | null;
    initial: ResellerPackageForm;
    onSave: (data: ResellerPackageForm, editId: number | null) => Promise<void>;
    currency: string;
}> = ({ show, onClose, editId, initial, onSave, currency }) => {
    const { t } = useSaaSLocale();
    const [form, setForm] = useState<ResellerPackageForm>(initial);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (show) setForm(initial);
    }, [show, initial]);

    const perLicense =
        form.license_count > 0 ? (form.price / form.license_count).toFixed(2) : '0';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.code.trim()) return;
        setSaving(true);
        try {
            await onSave(form, editId);
        } finally {
            setSaving(false);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-emerald-500/20 w-full max-w-lg rounded-[24px] overflow-hidden shadow-2xl shadow-emerald-900/20 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-white/5 bg-gradient-to-r from-emerald-950/80 to-teal-950/50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 flex items-center justify-center ring-1 ring-emerald-400/30">
                            <FiPackage className="text-emerald-400" size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">
                                {editId ? t('plans.resellerModal.editTitle') : t('plans.resellerModal.newTitle')}
                            </h3>
                            <p className="text-[11px] text-emerald-200/70 font-medium">
                                {t('plans.resellerModal.sub')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"
                        aria-label={t('plans.resellerModal.close')}
                    >
                        <FiX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.resellerModal.pkgName')}</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-600"
                                    placeholder={t('plans.resellerModal.pkgNamePh')}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.resellerModal.sysCode')}</label>
                                <input
                                    value={form.code}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                                        }))
                                    }
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-emerald-500/50 transition-all"
                                    placeholder={t('plans.resellerModal.sysCodePh')}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block flex items-center gap-2">
                                <FiKey size={12} /> {t('plans.resellerModal.licensePool')}
                            </label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min={1}
                                    max={500}
                                    value={form.license_count}
                                    onChange={(e) => setForm((f) => ({ ...f, license_count: Number(e.target.value) }))}
                                    className="flex-1 accent-emerald-500"
                                />
                                <span className="text-2xl font-black text-white w-14 text-center tabular-nums">{form.license_count}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                {t('plans.resellerModal.poolHint')}
                            </p>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.resellerModal.totalPrice')}</label>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={form.price}
                                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all"
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold">
                                    <FiTag size={14} /> {t('plans.resellerModal.perLicense').replace('{price}', `${currency}${perLicense}`)}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('plans.resellerModal.desc')}</label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-all resize-y min-h-[80px] placeholder:text-slate-600"
                                placeholder={t('plans.resellerModal.descPh')}
                            />
                        </div>
                    </div>

                    <div className="p-5 border-t border-white/5 bg-white/[0.02] flex items-center justify-between gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-3 text-sm font-bold text-slate-400 hover:text-white transition-all"
                        >
                            {t('plans.resellerModal.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !form.name.trim() || !form.code.trim()}
                            className="px-8 py-3 bg-emerald-600 text-white font-black text-sm rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-40 flex items-center gap-2"
                        >
                            <FiSave size={16} />
                            {saving ? t('plans.resellerModal.saving') : editId ? t('plans.resellerModal.update') : t('plans.resellerModal.savePkg')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════
   Ana Bileşen: PlansTab
   ═══════════════════════════════════════════════════ */
export const PlansTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        plans, promoCodes, resellerPlans,
        fetchPlans, addPlan, updatePlan, deletePlan,
        fetchPromoCodes, addPromoCode, togglePromoCode,
        fetchSettings, fetchResellerPlans, addResellerPlan, updateResellerPlan, deleteResellerPlan,
        fetchBillingCatalog, billingModuleCatalog, savePlanModuleRules,
        settings,
    } = useSaaSStore();

    const currency = settings?.currency || '€';

    const [showPromoModal, setShowPromoModal] = useState(false);
    const [showResellerModal, setShowResellerModal] = useState(false);
    const [resellerEditId, setResellerEditId] = useState<number | null>(null);
    const [resellerFormInitial, setResellerFormInitial] = useState<ResellerPackageForm>(DEFAULT_RESELLER_FORM);
    const [showPlanEditor, setShowPlanEditor] = useState(false);
    const [editPlanTarget, setEditPlanTarget] = useState<{ id: number; form: PlanForm; rules: ModuleRules } | null>(null);

    const [promo, setPromo] = useState({ code: '', discount_type: 'percent' as const, discount_value: 10, max_uses: 100, valid_until: '' });
    const [allMatrices, setAllMatrices] = useState<Record<string, PlanModuleRow[]>>({});

    useEffect(() => {
        fetchPlans();
        fetchPromoCodes();
        fetchSettings();
        fetchResellerPlans();
        fetchBillingCatalog();
    }, []);

    useEffect(() => {
        if (plans.length === 0) return;
        const load = async () => {
            const result: Record<string, PlanModuleRow[]> = {};
            for (const p of plans) {
                try {
                    const res = await fetch(`/api/v1/billing/plan-modules/${encodeURIComponent(p.code)}`);
                    if (res.ok) { const data = await res.json(); result[p.code] = data.modules || []; }
                } catch { /* skip */ }
            }
            setAllMatrices(result);
        };
        load();
    }, [plans]);

    const openNewPlan = async () => {
        setEditPlanTarget(null);
        if (billingModuleCatalog.length === 0) {
            await fetchBillingCatalog();
        }
        setShowPlanEditor(true);
    };

    const openEditPlan = async (p: any) => {
        if (billingModuleCatalog.length === 0) {
            await fetchBillingCatalog();
        }
        const mods = allMatrices[p.code] || [];
        const rules: ModuleRules = {};
        for (const m of mods) rules[m.code] = m.mode;
        const cat = useSaaSStore.getState().billingModuleCatalog;
        for (const c of cat) {
            if (rules[c.code] == null) rules[c.code] = 'addon';
        }
        setEditPlanTarget({
            id: p.id,
            form: {
                name: p.name, code: p.code,
                monthly_fee: p.monthly_fee, setup_fee: p.setup_fee,
                max_users: p.max_users, max_branches: p.max_branches ?? 1,
                max_products: p.max_products, max_devices: (p as any).max_devices ?? 1,
                max_printers: (p as any).max_printers ?? 2,
                device_reset_quota_monthly: (p as any).device_reset_quota_monthly ?? 3,
                support_hours: (p as any).support_hours ?? '08:00-17:00',
                trial_days: p.trial_days ?? 14,
            },
            rules,
        });
        setShowPlanEditor(true);
    };

    const handleSavePlan = async (form: PlanForm, rules: ModuleRules, editId?: number) => {
        if (editId) {
            await updatePlan(editId, form);
        } else {
            await addPlan(form);
        }
        const cat = useSaaSStore.getState().billingModuleCatalog;
        const fullRules: ModuleRules = { ...rules };
        for (const m of cat) {
            if (fullRules[m.code] == null) fullRules[m.code] = 'addon';
        }
        if (Object.keys(fullRules).length > 0) {
            await savePlanModuleRules(form.code, fullRules);
        }
        await fetchPlans();
        try {
            const res = await fetch(`/api/v1/billing/plan-modules/${encodeURIComponent(form.code)}`);
            if (res.ok) {
                const data = await res.json();
                setAllMatrices((prev) => ({ ...prev, [form.code]: data.modules || [] }));
            }
        } catch { /* ignore */ }
        setShowPlanEditor(false);
        setEditPlanTarget(null);
    };

    const defaultRulesForNew = useMemo(() => {
        const r: ModuleRules = {};
        for (const m of billingModuleCatalog) r[m.code] = 'addon';
        return r;
    }, [billingModuleCatalog]);

    const handleCreatePromo = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await addPromoCode(promo);
        if (ok) { setShowPromoModal(false); setPromo({ code: '', discount_type: 'percent', discount_value: 10, max_uses: 100, valid_until: '' }); }
    };

    const openResellerCreate = () => {
        setResellerEditId(null);
        setResellerFormInitial(DEFAULT_RESELLER_FORM);
        setShowResellerModal(true);
    };

    const openResellerEdit = (rp: { id: number; name: string; code: string; price: number; license_count: number; description?: string }) => {
        setResellerEditId(rp.id);
        setResellerFormInitial({
            name: rp.name || '',
            code: rp.code || '',
            price: Number(rp.price) || 0,
            license_count: Number(rp.license_count) || 1,
            description: (rp as { description?: string }).description || '',
        });
        setShowResellerModal(true);
    };

    const handleResellerSave = async (data: ResellerPackageForm, editId: number | null) => {
        const payload = {
            name: data.name.trim(),
            code: data.code.trim(),
            price: data.price,
            license_count: data.license_count,
            description: data.description.trim() || undefined,
        };
        const ok = editId != null ? await updateResellerPlan(editId, payload) : await addResellerPlan(payload);
        if (ok) {
            setShowResellerModal(false);
            setResellerEditId(null);
            setResellerFormInitial(DEFAULT_RESELLER_FORM);
            await fetchResellerPlans();
        }
    };

    return (
        <div className="space-y-8 pb-10">

            <BillingModulesAdminCard />

            {/* ═══════ PLAN KARŞILAŞTIRMA KARTLARI ═══════ */}
            <SectionCard
                title={t('plans.compareTitle')}
                icon={<FiCreditCard className="text-blue-400" />}
                action={
                    <button onClick={openNewPlan} className="text-xs bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5 hover:bg-blue-500 transition-all">
                        <FiPlus size={12} /> {t('plans.newPlan')}
                    </button>
                }
            >
                {plans.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {plans.map((p) => {
                            const c = PLAN_COLORS[p.code] || { bg: 'from-purple-800 to-purple-700', ring: 'ring-purple-500/30', badge: 'bg-purple-600' };
                            const modules = allMatrices[p.code] || [];
                            const includedCount = modules.filter(m => m.mode === 'included').length;
                            const addonCount = modules.filter(m => m.mode === 'addon').length;

                            return (
                                <div key={p.id} className={`bg-gradient-to-br ${c.bg} rounded-3xl border border-white/10 ring-1 ${c.ring} overflow-hidden flex flex-col group`}>
                                    <div className="p-6 pb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md text-white ${c.badge}`}>{p.code}</span>
                                            <div className="flex items-center gap-2">
                                                <button type="button" onClick={() => openEditPlan(p)} className="text-white/30 hover:text-white transition-all" title={t('plans.edit')} aria-label={t('plans.edit')}><FiEdit2 size={14} /></button>
                                                <button type="button" onClick={() => updatePlan(p.id, { is_active: !p.is_active })} className="text-white/40 hover:text-white" title={p.is_active ? t('plans.deactivate') : t('plans.activate')} aria-label={p.is_active ? t('plans.deactivate') : t('plans.activate')}>
                                                    {p.is_active ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-black text-white">{p.name}</h3>
                                        <div className="flex items-baseline gap-1 mt-3">
                                            <span className="text-3xl font-black text-white">{currency}{p.monthly_fee}</span>
                                            <span className="text-sm text-white/50 font-bold">{t('plans.perMonth')}</span>
                                        </div>
                                        <div className="text-xs text-white/40 mt-1">{t('plans.setupFee')}: {currency}{p.setup_fee}</div>
                                    </div>

                                    <div className="px-6 grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="flex items-center gap-1.5 text-white/70"><FiLayers size={12} /><span>{(p as any).max_branches || 1} {t('plans.branch')}</span></div>
                                        <div className="flex items-center gap-1.5 text-white/70"><FiUsers size={12} /><span>{p.max_users} {t('plans.user')}</span></div>
                                        <div className="flex items-center gap-1.5 text-white/70"><FiMonitor size={12} /><span>{(p as any).max_devices || 1} {t('plans.device')}</span></div>
                                        <div className="flex items-center gap-1.5 text-white/70"><FiPrinter size={12} /><span>{(p as any).max_printers ?? 2} {t('plans.printer')}</span></div>
                                        <div className="flex items-center gap-1.5 text-rose-300"><FiKey size={12} /><span>{(p as any).device_reset_quota_monthly ?? 3} reset/ay</span></div>
                                        <div className="flex items-center gap-1.5 text-white/70"><FiClock size={12} /><span>{(p as any).support_hours || '09-17'}</span></div>
                                        <div className="flex items-center gap-1.5 text-white/70"><FiDatabase size={12} /><span>{p.max_products} {t('plans.product')}</span></div>
                                        <div className="flex items-center gap-1.5 text-emerald-400"><FiCheck size={12} /><span>{t('plans.includedCount').replace('{n}', String(includedCount))}</span></div>
                                    </div>

                                    <div className="flex-1 mt-4 px-6 pb-4 space-y-3 max-h-[260px] overflow-y-auto custom-scrollbar">
                                        {PLAN_CARD_CATEGORIES.map(cat => {
                                            const catMods = modules.filter(m => m.category === cat);
                                            if (!catMods.length) return null;
                                            return (
                                                <div key={cat}>
                                                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{t(`plans.category.${cat}`)}</div>
                                                    <div className="space-y-1">
                                                        {catMods.map(m => (
                                                            <div key={m.code} className="flex items-center gap-2 text-[11px]">
                                                                <ModeIcon mode={m.mode} />
                                                                <span className={m.mode === 'locked' ? 'text-slate-600 line-through' : 'text-white/80'}>{m.name}</span>
                                                                {m.mode === 'addon' && <span className="text-[11px] text-blue-300/60 ml-auto">+{currency}{m.monthly_price}{t('plans.perMonth')}</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="border-t border-white/10 p-4 flex items-center justify-between">
                                        <span className="text-[10px] text-white/40">{t('plans.addonSellable').replace('{n}', String(addonCount))}</span>
                                        <button onClick={() => { if (confirm(t('plans.deleteConfirm'))) deletePlan(p.id); }} className="text-red-400 text-[10px] font-black uppercase hover:text-red-300">{t('plans.delete')}</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : <EmptyState icon={<FiCreditCard />} message={t('plans.emptyPlans')} />}
            </SectionCard>

            {/* ═══════ BAYİ LİSANS PAKETLERİ ═══════ */}
            <SectionCard
                title={t('plans.resellerSection')}
                icon={<FiPackage className="text-emerald-400" />}
                action={
                    <button
                        type="button"
                        onClick={openResellerCreate}
                        className="text-xs bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 hover:from-emerald-500 hover:to-teal-500 transition-all"
                    >
                        <FiPlus size={12} /> {t('plans.newPackage')}
                    </button>
                }
            >
                <p className="text-sm text-slate-400 mb-6 max-w-3xl leading-relaxed">
                    {t('plans.resellerIntro')}
                </p>
                {resellerPlans.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                        {resellerPlans.map((rp: { id: number; name: string; code: string; price: number; license_count: number; description?: string }) => {
                            const per =
                                rp.license_count > 0
                                    ? (Number(rp.price) / Number(rp.license_count)).toFixed(2)
                                    : '0';
                            return (
                                <div
                                    key={rp.id}
                                    className="group relative rounded-3xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/40 via-slate-900/80 to-slate-950/90 p-6 overflow-hidden ring-1 ring-white/5 hover:ring-emerald-500/25 transition-all duration-300"
                                >
                                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none group-hover:bg-emerald-500/15 transition-colors" />
                                    <div className="relative flex items-start justify-between gap-3">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-mono">
                                            {rp.code}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => openResellerEdit(rp)}
                                            className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                                            title={t('plans.edit')}
                                        >
                                            <FiEdit2 size={16} />
                                        </button>
                                    </div>
                                    <h4 className="relative text-xl font-black text-white mt-4 tracking-tight">{rp.name}</h4>
                                    {rp.description ? (
                                        <p className="relative text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{rp.description}</p>
                                    ) : (
                                        <p className="relative text-[11px] text-slate-600 mt-2 italic">{t('plans.noDesc')}</p>
                                    )}
                                    <div className="relative mt-6 grid grid-cols-2 gap-4">
                                        <div className="rounded-2xl bg-black/25 border border-white/5 p-4">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('plans.licensePool')}</div>
                                            <div className="text-3xl font-black text-white tabular-nums">{rp.license_count}</div>
                                            <div className="text-[10px] text-slate-500 mt-1">{t('plans.installCount')}</div>
                                        </div>
                                        <div className="rounded-2xl bg-black/25 border border-white/5 p-4">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('plans.packagePrice')}</div>
                                            <div className="text-3xl font-black text-emerald-400 tabular-nums">{currency}{rp.price}</div>
                                            <div className="text-[10px] text-emerald-500/80 mt-1">{t('plans.perLicense').replace('{price}', `${currency}${per}`)}</div>
                                        </div>
                                    </div>
                                    <div className="relative mt-5 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openResellerEdit(rp)}
                                            className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                                        >
                                            {t('plans.edit')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (
                                                    confirm(
                                                        t('plans.deletePackageConfirm')
                                                    )
                                                )
                                                    deleteResellerPlan(rp.id);
                                            }}
                                            className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                                        >
                                            {t('plans.deleteShort')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                        <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 text-emerald-400/50 mb-4">
                            <FiPackage size={40} />
                        </div>
                        <p className="text-slate-400 font-medium">{t('plans.noResellerPackages')}</p>
                        <button
                            type="button"
                            onClick={openResellerCreate}
                            className="mt-4 text-sm font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
                        >
                            {t('plans.createFirst')}
                        </button>
                    </div>
                )}
            </SectionCard>

            {/* ═══════ PROMOSYON KODLARI ═══════ */}
            <SectionCard
                title={t('plans.promoTitle')}
                icon={<FiGift className="text-pink-400" />}
                action={
                    <button onClick={() => setShowPromoModal(true)} className="text-xs bg-pink-600 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1" type="button">
                        <FiPlus size={12} /> {t('plans.newCode')}
                    </button>
                }
            >
                {promoCodes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {promoCodes.map(p => (
                            <div key={p.id} className={`p-4 rounded-xl border transition-all ${p.is_active ? 'bg-black/20 border-white/5' : 'bg-red-500/5 border-red-500/10 opacity-50'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-lg font-black text-pink-400 font-mono">{p.code}</span>
                                        <div className="text-sm font-bold text-white mt-1">
                                            {p.discount_type === 'percent'
                                                ? t('plans.discountPct').replace('{n}', String(p.discount_value))
                                                : t('plans.discountEur').replace('{n}', String(p.discount_value))}
                                        </div>
                                    </div>
                                    <button onClick={() => togglePromoCode(p.id)} className="text-slate-400 hover:text-white">{p.is_active ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <EmptyState icon={<FiGift />} message={t('plans.promoEmpty')} />}
            </SectionCard>

            {/* ═══════ MODALS ═══════ */}
            <PlanEditorModal
                show={showPlanEditor}
                onClose={() => { setShowPlanEditor(false); setEditPlanTarget(null); }}
                editMode={!!editPlanTarget}
                editPlanId={editPlanTarget?.id}
                initialForm={editPlanTarget?.form ?? DEFAULT_PLAN}
                initialRules={editPlanTarget?.rules ?? defaultRulesForNew}
                catalog={billingModuleCatalog}
                onSave={handleSavePlan}
                currency={currency}
            />

            <ResellerPackageModal
                show={showResellerModal}
                onClose={() => {
                    setShowResellerModal(false);
                    setResellerEditId(null);
                }}
                editId={resellerEditId}
                initial={resellerFormInitial}
                onSave={handleResellerSave}
                currency={currency}
            />

            <Modal show={showPromoModal} onClose={() => setShowPromoModal(false)} title={t('plans.promoModalTitle')} titleUppercase={false}>
                <form onSubmit={handleCreatePromo} className="space-y-5">
                    <InputGroup label={t('plans.promoCode')} value={promo.code} onChange={v => setPromo({ ...promo, code: v })} />
                    <SelectGroup
                        label={t('plans.discountType')}
                        value={promo.discount_type}
                        onChange={v => setPromo({ ...promo, discount_type: v as any })}
                        options={[
                            { label: t('plans.discountPctOpt'), value: 'percent' },
                            { label: t('plans.discountFixedOpt'), value: 'fixed' },
                        ]}
                    />
                    <InputGroup label={t('plans.discountValue')} type="number" value={promo.discount_value} onChange={v => setPromo({ ...promo, discount_value: Number(v) })} />
                    <button type="submit" className="w-full bg-pink-600 py-4 rounded-xl text-white font-black text-xs uppercase">{t('plans.promoCreate')}</button>
                </form>
            </Modal>
        </div>
    );
};
