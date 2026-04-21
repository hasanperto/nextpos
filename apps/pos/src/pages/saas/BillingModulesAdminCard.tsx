import React, { useEffect, useState, useMemo } from 'react';
import { FiLayers, FiPlus, FiEdit2, FiTrash2, FiRefreshCw, FiSearch } from 'react-icons/fi';
import {
    useSaaSStore,
    type BillingModuleAdminRow,
    type BillingModuleCreateInput,
} from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { SectionCard, Modal, InputGroup, SelectGroup } from './SaaSShared';
import {
    getBillingModuleIconOptions,
    BillingModuleIconPreview,
    mergeIconSelectOptions,
} from './billingModuleIcons';

const CATEGORY_KEYS = ['feature', 'channel', 'device', 'service', 'core', 'integration'] as const;

const emptyCreate: BillingModuleCreateInput = {
    code: '',
    name: '',
    description: '',
    category: 'feature',
    setup_price: 0,
    monthly_price: 0,
    icon: '',
    sort_order: 100,
};

export const BillingModulesAdminCard: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        admin,
        token,
        billingModulesAdmin,
        billingModulesAdminError,
        fetchBillingModulesAdmin,
        createBillingModule,
        updateBillingModule,
        deleteBillingModule,
        settings,
    } = useSaaSStore();

    const currency = settings?.currency || '€';

    const [loading, setLoading] = useState(false);
    /** idle: token bekleniyor veya ilk kare; loading: istek; done: tamam (boş/hata/tablo) */
    const [listFetchState, setListFetchState] = useState<'idle' | 'loading' | 'done'>('idle');
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState<BillingModuleCreateInput>(emptyCreate);
    const [editRow, setEditRow] = useState<BillingModuleAdminRow | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editCat, setEditCat] = useState<string>('feature');
    const [editSetup, setEditSetup] = useState(0);
    const [editMonthly, setEditMonthly] = useState(0);
    const [editIcon, setEditIcon] = useState('');
    const [editSort, setEditSort] = useState(100);
    const [editActive, setEditActive] = useState(true);

    /** Kategori sekmesi: all | feature | channel | … */
    const [categoryTab, setCategoryTab] = useState<string>('all');
    /** Kod, ad, açıklama içinde ara */
    const [listFilter, setListFilter] = useState('');
    /** Durum süzgeci */
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    const isSuper = admin?.role === 'super_admin';

    /** Token persist ile sonra geldiğinde yeniden çek (aksi halde liste boş kalıyordu) */
    useEffect(() => {
        if (!isSuper || !token) {
            setListFetchState('idle');
            return;
        }
        setListFetchState('loading');
        void fetchBillingModulesAdmin().finally(() => setListFetchState('done'));
    }, [isSuper, token, fetchBillingModulesAdmin]);

    const sorted = useMemo(
        () => [...billingModulesAdmin].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)),
        [billingModulesAdmin]
    );
    const categoryLabels = useMemo(
        () => ({
            feature: t('billingModules.cat.feature'),
            channel: t('billingModules.cat.channel'),
            device: t('billingModules.cat.device'),
            service: t('billingModules.cat.service'),
            core: t('billingModules.cat.core'),
            integration: t('billingModules.cat.integration'),
        }),
        [t]
    );
    const CATEGORY_OPTS = useMemo(
        () => CATEGORY_KEYS.map((k) => ({ value: k, label: categoryLabels[k] })),
        [categoryLabels]
    );
    const iconSelectOptions = useMemo(() => getBillingModuleIconOptions(t), [t]);

    const categoryCounts = useMemo(() => {
        const c: Record<string, number> = { all: sorted.length };
        for (const k of CATEGORY_KEYS) c[k] = 0;
        for (const r of sorted) {
            const k = r.category || 'feature';
            c[k] = (c[k] ?? 0) + 1;
        }
        return c;
    }, [sorted]);

    const filteredModules = useMemo(() => {
        let rows = sorted;
        if (categoryTab !== 'all') {
            rows = rows.filter((r) => (r.category || 'feature') === categoryTab);
        }
        if (statusFilter === 'active') rows = rows.filter((r) => r.is_active === 1);
        if (statusFilter === 'inactive') rows = rows.filter((r) => r.is_active !== 1);
        const q = listFilter.trim().toLowerCase();
        if (q) {
            rows = rows.filter(
                (r) =>
                    r.code.toLowerCase().includes(q) ||
                    r.name.toLowerCase().includes(q) ||
                    (r.description ?? '').toLowerCase().includes(q)
            );
        }
        return rows;
    }, [sorted, categoryTab, listFilter, statusFilter]);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await fetchBillingModulesAdmin();
        } finally {
            setLoading(false);
        }
    };

    const openEdit = (row: BillingModuleAdminRow) => {
        setEditRow(row);
        setEditName(row.name);
        setEditDesc(row.description ?? '');
        setEditCat(row.category || 'feature');
        setEditSetup(Number(row.setup_price) || 0);
        setEditMonthly(Number(row.monthly_price) || 0);
        setEditIcon(row.icon ?? '');
        setEditSort(row.sort_order ?? 100);
        setEditActive(row.is_active === 1);
    };

    const submitCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = createForm.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!code || !createForm.name.trim()) return;
        const ok = await createBillingModule({
            ...createForm,
            code,
            name: createForm.name.trim(),
            description: createForm.description?.trim() || null,
            icon: createForm.icon?.trim() || null,
            sort_order: Number(createForm.sort_order) || 100,
        });
        if (ok) {
            setShowCreate(false);
            setCreateForm(emptyCreate);
        }
    };

    const submitEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editRow) return;
        const ok = await updateBillingModule(editRow.code, {
            name: editName.trim(),
            description: editDesc.trim() || null,
            category: editCat as BillingModuleCreateInput['category'],
            setup_price: editSetup,
            monthly_price: editMonthly,
            icon: editIcon.trim() || null,
            sort_order: editSort,
            is_active: editActive,
        });
        if (ok) setEditRow(null);
    };

    const handleSoftDelete = async (row: BillingModuleAdminRow) => {
        if (!confirm(t('billingModules.softDeleteConfirm').replace('{name}', row.name))) return;
        await deleteBillingModule(row.code, false);
    };

    const handleHardDelete = async (row: BillingModuleAdminRow) => {
        if (
            !confirm(
                t('billingModules.hardDeleteConfirm').replace('{code}', row.code)
            )
        )
            return;
        await deleteBillingModule(row.code, true);
    };

    if (!isSuper) return null;

    const waitingToken = !token;
    const listBusy = !waitingToken && listFetchState !== 'done';
    const showTable =
        !waitingToken && listFetchState === 'done' && !billingModulesAdminError && sorted.length > 0;
    const showEmptyHint = !waitingToken && listFetchState === 'done' && !billingModulesAdminError && sorted.length === 0;

    return (
        <>
            <SectionCard
                title={t('billingModules.title')}
                icon={<FiLayers className="text-violet-400" />}
                action={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void handleRefresh()}
                            disabled={loading}
                            className="text-xs bg-white/10 text-white px-3 py-2.5 rounded-xl font-bold flex items-center gap-1.5 hover:bg-white/15 transition-all disabled:opacity-50"
                            title={t('billingModules.refresh')}
                        >
                            <FiRefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCreateForm(emptyCreate);
                                setShowCreate(true);
                            }}
                            className="text-xs bg-violet-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5 hover:bg-violet-500 transition-all"
                        >
                            <FiPlus size={12} /> {t('billingModules.newModule')}
                        </button>
                    </div>
                }
            >
                <p className="text-xs text-slate-500 mb-4 leading-relaxed max-w-3xl">
                    {t('billingModules.descStart')}{' '}
                    <code className="text-violet-400/90 font-mono">snake_case</code>
                    {t('billingModules.descMiddle')}
                    {t('billingModules.descEnd')}
                </p>

                {waitingToken && (
                    <p className="text-slate-400 text-sm">{t('billingModules.sessionLoading')}</p>
                )}
                {!waitingToken && listBusy && (
                    <p className="text-slate-400 text-sm">{t('billingModules.listLoading')}</p>
                )}
                {!waitingToken && !listBusy && billingModulesAdminError && (
                    <p className="text-amber-300/95 text-sm rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                        {billingModulesAdminError}
                    </p>
                )}
                {showTable && (
                    <div className="space-y-3 sm:space-y-4">
                        {/* Kategori sekmeleri — mobilde yatay kaydırma */}
                        <div className="-mx-1 sm:mx-0 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
                            <div className="flex flex-nowrap sm:flex-wrap gap-1.5 p-1 rounded-2xl bg-black/25 border border-white/10 min-w-min">
                                <button
                                    type="button"
                                    onClick={() => setCategoryTab('all')}
                                    className={`shrink-0 px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                                        categoryTab === 'all'
                                            ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {t('billingModules.all')}
                                    <span className="ml-1 opacity-70 tabular-nums">({categoryCounts.all ?? 0})</span>
                                </button>
                                {CATEGORY_KEYS.map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setCategoryTab(key)}
                                        className={`shrink-0 px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                                            categoryTab === key
                                                ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {categoryLabels[key]}
                                        <span className="ml-1 opacity-70 tabular-nums">({categoryCounts[key] ?? 0})</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Arama + durum */}
                        <div className="flex flex-col gap-3">
                            <div className="relative w-full min-w-0">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                <input
                                    type="search"
                                    value={listFilter}
                                    onChange={(e) => setListFilter(e.target.value)}
                                    placeholder={t('billingModules.searchPh')}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold w-full sm:w-auto">{t('billingModules.status')}</span>
                                {(
                                    [
                                        ['all', t('billingModules.statusAll')],
                                        ['active', t('billingModules.statusActive')],
                                        ['inactive', t('billingModules.statusInactive')],
                                    ] as const
                                ).map(([val, label]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setStatusFilter(val)}
                                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all ${
                                            statusFilter === val
                                                ? 'bg-white/15 text-white ring-1 ring-white/20'
                                                : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {filteredModules.length === 0 ? (
                            <p className="text-slate-500 text-sm py-6 sm:py-8 text-center rounded-2xl border border-dashed border-white/10">
                                {t('billingModules.filteredEmpty')}
                            </p>
                        ) : (
                            <>
                                {/* Mobil: kartlar — ekrana sığan yükseklik */}
                                <div className="md:hidden space-y-2 max-h-[min(52vh,28rem)] overflow-y-auto overscroll-contain pr-0.5 -mr-0.5">
                                    {filteredModules.map((row) => (
                                        <div
                                            key={row.id}
                                            className={`rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2 ${row.is_active ? '' : 'opacity-70'}`}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="font-mono text-[11px] text-violet-300 break-all">{row.code}</span>
                                                <span
                                                    className={`shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                                        row.is_active
                                                            ? 'bg-emerald-500/15 text-emerald-400'
                                                            : 'bg-slate-600/20 text-slate-500'
                                                    }`}
                                                >
                                                    {row.is_active ? t('billingModules.statusActive') : t('billingModules.statusInactive')}
                                                </span>
                                            </div>
                                            <p className="text-white text-sm font-medium leading-snug">{row.name}</p>
                                            <p className="text-[11px] text-slate-500">
                                                {(categoryLabels[row.category as keyof typeof categoryLabels] || row.category)} · {t('billingModules.orderLower')} {row.sort_order}
                                            </p>
                                            <div className="flex justify-between items-center pt-1 border-t border-white/5">
                                                <span className="text-xs text-slate-400 tabular-nums">
                                                    {t('billingModules.setupLower')} {row.setup_price} {currency} · {t('billingModules.monthlyLower')} {row.monthly_price} {currency}
                                                </span>
                                                <div className="flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(row)}
                                                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                                                        title={t('billingModules.edit')}
                                                    >
                                                        <FiEdit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleSoftDelete(row)}
                                                        className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                                                        title={t('billingModules.deactivate')}
                                                    >
                                                        <FiTrash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* md+: tablo */}
                                <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/10 max-h-[min(50vh,26rem)] lg:max-h-[min(58vh,720px)] overflow-y-auto">
                                <table className="w-full text-sm text-left min-w-[640px]">
                                    <thead className="sticky top-0 z-[1] bg-[#121a2e] shadow-sm shadow-black/40">
                                        <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                                            <th className="px-4 py-3 font-black">{t('billingModules.colCode')}</th>
                                            <th className="px-4 py-3 font-black">{t('billingModules.colName')}</th>
                                            <th className="px-4 py-3 font-black hidden md:table-cell">{t('billingModules.category')}</th>
                                            <th className="px-4 py-3 font-black text-right">{t('billingModules.colSetupEur')}</th>
                                            <th className="px-4 py-3 font-black text-right">{t('billingModules.colMonthlyEur')}</th>
                                            <th className="px-4 py-3 font-black text-center hidden sm:table-cell">{t('billingModules.colOrder')}</th>
                                            <th className="px-4 py-3 font-black text-center">{t('billingModules.status')}</th>
                                            <th className="px-4 py-3 font-black text-right w-[100px]">{t('billingModules.action')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredModules.map((row) => (
                                            <tr
                                                key={row.id}
                                                className={`border-b border-white/5 hover:bg-white/[0.03] ${row.is_active ? '' : 'opacity-65'}`}
                                            >
                                                <td className="px-4 py-2.5 font-mono text-xs text-violet-300 align-top">
                                                    {row.code}
                                                </td>
                                                <td className="px-4 py-2.5 text-white font-medium align-top max-w-[200px]">
                                                    <span className="line-clamp-2">{row.name}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell align-top text-xs">
                                                    {categoryLabels[row.category as keyof typeof categoryLabels] || row.category}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums align-top">
                                                    {row.setup_price}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums align-top">
                                                    {row.monthly_price}
                                                </td>
                                                <td className="px-4 py-2.5 text-center tabular-nums text-slate-400 hidden sm:table-cell align-top">
                                                    {row.sort_order}
                                                </td>
                                                <td className="px-4 py-2.5 text-center align-top">
                                                    <span
                                                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded whitespace-nowrap ${
                                                            row.is_active
                                                                ? 'bg-emerald-500/15 text-emerald-400'
                                                                : 'bg-slate-600/20 text-slate-500'
                                                        }`}
                                                    >
                                                        {row.is_active ? t('billingModules.statusActive') : t('billingModules.statusInactive')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right align-top whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(row)}
                                                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 inline-flex"
                                                        title={t('billingModules.edit')}
                                                    >
                                                        <FiEdit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleSoftDelete(row)}
                                                        className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 inline-flex"
                                                        title={t('billingModules.deactivate')}
                                                    >
                                                        <FiTrash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            </>
                        )}

                        <p className="text-[11px] text-slate-600">
                            {t('billingModules.shown')}:{' '}
                            <span className="text-slate-400 font-mono tabular-nums">{filteredModules.length}</span> /{' '}
                            <span className="text-slate-500 font-mono tabular-nums">{sorted.length}</span> {t('billingModules.moduleLower')}
                        </p>
                    </div>
                )}
                {showEmptyHint && (
                    <p className="text-slate-500 text-sm">
                        {t('billingModules.emptyHintStart')}{' '}
                        <code className="text-violet-400 font-mono text-xs">npm run billing:seed</code> {t('billingModules.runAndRefresh')}
                        {t('billingModules.emptyHintEnd')} <strong className="text-slate-300">{t('billingModules.newModule')}</strong> {t('billingModules.emptyHintTail')}
                    </p>
                )}

                <p className="text-[11px] text-slate-600 mt-2">
                    {t('billingModules.footnote')}
                </p>
            </SectionCard>

            <Modal show={showCreate} onClose={() => setShowCreate(false)} title={t('billingModules.newModalTitle')} maxWidth="max-w-xl">
                <form onSubmit={(e) => void submitCreate(e)} className="space-y-4">
                    <InputGroup
                        label={t('billingModules.code')}
                        value={createForm.code}
                        onChange={(v) => setCreateForm((f) => ({ ...f, code: v.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                        placeholder={t('billingModules.codePh')}
                    />
                    <InputGroup
                        label={t('billingModules.visibleName')}
                        value={createForm.name}
                        onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))}
                    />
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('billingModules.description')}</label>
                        <textarea
                            value={createForm.description ?? ''}
                            onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-violet-500/50 resize-y min-h-[60px]"
                        />
                    </div>
                    <SelectGroup
                        label={t('billingModules.category')}
                        value={createForm.category}
                        onChange={(v) => setCreateForm((f) => ({ ...f, category: v as BillingModuleCreateInput['category'] }))}
                        options={CATEGORY_OPTS}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup
                            label={`${t('billingModules.setupFee')} (${currency})`}
                            type="number"
                            value={createForm.setup_price}
                            onChange={(v) => setCreateForm((f) => ({ ...f, setup_price: Number(v) }))}
                        />
                        <InputGroup
                            label={`${t('billingModules.monthlyFee')} (${currency})`}
                            type="number"
                            value={createForm.monthly_price}
                            onChange={(v) => setCreateForm((f) => ({ ...f, monthly_price: Number(v) }))}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                                {t('billingModules.icon')}
                            </label>
                            <div className="flex gap-3 items-center">
                                <div className="flex-1 min-w-0">
                                    <div className="relative">
                                        <select
                                            value={createForm.icon ?? ''}
                                            onChange={(e) =>
                                                setCreateForm((f) => ({ ...f, icon: e.target.value || '' }))
                                            }
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-violet-500/50 transition-all appearance-none"
                                        >
                                            {iconSelectOptions.map((o) => (
                                                <option key={o.value || 'none'} value={o.value} className="bg-[#1E293B]">
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                                <BillingModuleIconPreview name={createForm.icon ?? ''} />
                            </div>
                        </div>
                        <InputGroup
                            label={t('billingModules.order')}
                            type="number"
                            value={createForm.sort_order ?? 100}
                            onChange={(v) => setCreateForm((f) => ({ ...f, sort_order: Number(v) }))}
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-violet-600 py-3.5 rounded-xl text-white font-black text-sm"
                    >
                        {t('billingModules.create')}
                    </button>
                </form>
            </Modal>

            <Modal show={!!editRow} onClose={() => setEditRow(null)} title={t('billingModules.editModalTitle')} maxWidth="max-w-xl">
                {editRow && (
                    <form onSubmit={(e) => void submitEdit(e)} className="space-y-4">
                        <p className="text-xs font-mono text-violet-400 bg-white/5 px-3 py-2 rounded-lg border border-white/10">
                            {editRow.code}
                        </p>
                        <InputGroup label={t('billingModules.visibleName')} value={editName} onChange={setEditName} />
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('billingModules.description')}</label>
                            <textarea
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                rows={2}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-violet-500/50 resize-y min-h-[60px]"
                            />
                        </div>
                        <SelectGroup label={t('billingModules.category')} value={editCat} onChange={setEditCat} options={CATEGORY_OPTS} />
                        <div className="grid grid-cols-2 gap-4">
                            <InputGroup label={`${t('billingModules.setupFee')} (${currency})`} type="number" value={editSetup} onChange={(v) => setEditSetup(Number(v))} />
                            <InputGroup label={`${t('billingModules.monthlyFee')} (${currency})`} type="number" value={editMonthly} onChange={(v) => setEditMonthly(Number(v))} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                                    {t('billingModules.icon')}
                                </label>
                                <div className="flex gap-3 items-center">
                                    <div className="flex-1 min-w-0">
                                        <div className="relative">
                                            <select
                                                value={editIcon}
                                                onChange={(e) => setEditIcon(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-violet-500/50 transition-all appearance-none"
                                            >
                                                {mergeIconSelectOptions(editIcon, t).map((o) => (
                                                    <option key={o.value || 'none'} value={o.value} className="bg-[#1E293B]">
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                    <BillingModuleIconPreview name={editIcon} />
                                </div>
                            </div>
                            <InputGroup label={t('billingModules.order')} type="number" value={editSort} onChange={(v) => setEditSort(Number(v))} />
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={editActive}
                                onChange={(e) => setEditActive(e.target.checked)}
                                className="rounded border-white/20 bg-white/5 accent-violet-500 w-4 h-4"
                            />
                            <span className="text-sm text-slate-300">{t('billingModules.activeHelp')}</span>
                        </label>
                        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                            <button type="submit" className="w-full bg-violet-600 py-3.5 rounded-xl text-white font-black text-sm">
                                {t('billingModules.save')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleHardDelete(editRow)}
                                className="w-full py-2.5 rounded-xl text-red-400 text-xs font-bold border border-red-500/30 hover:bg-red-500/10"
                            >
                                {t('billingModules.hardDelete')}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
};
