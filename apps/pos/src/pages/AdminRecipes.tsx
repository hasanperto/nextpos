import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiLayers, FiRefreshCcw, FiSave, FiPlus, FiTrash2, FiDownload, FiSearch } from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

type Prod = { id: number; name: string };
type Variant = { id: number; name: string; is_default?: boolean | number };

type RecipeLine = {
    ingredient_product_id: number;
    ingredient_name: string;
    qty_per_unit: number;
    variant_id: number | null;
    variant_name?: string;
    searchText: string;
};

type ConsumptionRow = {
    product_id: number;
    product_name: string;
    consumed: string;
    restored: string;
    net_consumed: string;
};

function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

export const AdminRecipes: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders, logout } = useAuthStore();
    const { t } = usePosLocale();
    const [products, setProducts] = useState<Prod[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [lines, setLines] = useState<RecipeLine[]>([]);
    const [saving, setSaving] = useState(false);
    const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const [to, setTo] = useState(todayISO);
    const [report, setReport] = useState<ConsumptionRow[]>([]);
    const [reportLoading, setReportLoading] = useState(false);
    const [locked, setLocked] = useState(false);

    const loadProducts = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/v1/menu/admin/products', { headers: getAuthHeaders() });
        if (res.status === 401) {
            logout();
            return;
        }
        const data = res.ok ? await res.json() : [];
        setProducts(Array.isArray(data) ? data.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })) : []);
        setLoading(false);
    }, [getAuthHeaders, logout]);

    const loadVariants = useCallback(
        async (pid: number) => {
            const res = await fetch(`/api/v1/menu/admin/products/${pid}/variants`, { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.status === 403) {
                setLocked(true);
                setVariants([]);
                return;
            }
            setLocked(false);
            const data = res.ok ? await res.json() : [];
            setVariants(Array.isArray(data) ? data : []);
        },
        [getAuthHeaders, logout]
    );

    const loadRecipe = useCallback(
        async (pid: number) => {
            const res = await fetch(`/api/v1/menu/admin/products/${pid}/recipe`, { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.status === 403) {
                setLocked(true);
                setLines([]);
                return;
            }
            setLocked(false);
            const data = res.ok ? await res.json() : [];
            const arr = Array.isArray(data) ? data : [];
            setLines(
                arr.map(
                    (r: {
                        ingredient_product_id: number;
                        qty_per_unit: unknown;
                        ingredient_name?: string;
                        variant_id?: number | null;
                        variant_name?: string | null;
                    }) => ({
                        ingredient_product_id: Number(r.ingredient_product_id),
                        qty_per_unit: Number(r.qty_per_unit) || 1,
                        ingredient_name: String(r.ingredient_name || ''),
                        variant_id: r.variant_id != null ? Number(r.variant_id) : null,
                        variant_name: r.variant_name ? String(r.variant_name) : undefined,
                        searchText: String(r.ingredient_name || ''),
                    })
                )
            );
        },
        [getAuthHeaders, logout]
    );

    useEffect(() => {
        void loadProducts();
    }, [loadProducts]);

    useEffect(() => {
        if (selectedId != null) {
            void loadVariants(selectedId);
            void loadRecipe(selectedId);
        } else {
            setVariants([]);
            setLines([]);
        }
    }, [selectedId, loadRecipe, loadVariants]);

    const ingredientCandidates = useMemo(() => {
        if (selectedId == null) return [];
        return products.filter((p) => p.id !== selectedId);
    }, [products, selectedId]);

    const saveRecipe = async () => {
        if (selectedId == null) return;
        for (const l of lines) {
            if (!l.ingredient_product_id || l.ingredient_product_id === selectedId) {
                toast.error(t('admin.recipes.toast.invalidIngredient'));
                return;
            }
            if (!l.qty_per_unit || l.qty_per_unit <= 0) {
                toast.error(t('admin.recipes.toast.invalidQty'));
                return;
            }
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/v1/menu/admin/products/${selectedId}/recipe`, {
                method: 'PUT',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lines: lines.map((l) => ({
                        ingredient_product_id: l.ingredient_product_id,
                        qty_per_unit: l.qty_per_unit,
                        variant_id: l.variant_id,
                    })),
                }),
            });
            if (res.status === 403) {
                setLocked(true);
                return;
            }
            setLocked(false);
            if (res.ok) {
                toast.success(t('admin.recipes.toast.saved'));
                await loadRecipe(selectedId);
            } else {
                const j = await res.json().catch(() => ({}));
                toast.error(j.error || t('admin.recipes.toast.saveError'));
            }
        } finally {
            setSaving(false);
        }
    };

    const loadReport = async () => {
        setReportLoading(true);
        try {
            const res = await fetch(
                `/api/v1/admin/stock/consumption?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
                { headers: getAuthHeaders() }
            );
            if (res.status === 403) {
                setLocked(true);
                setReport([]);
                return;
            }
            setLocked(false);
            if (res.ok) {
                const j = await res.json();
                setReport(Array.isArray(j.rows) ? j.rows : []);
            } else {
                toast.error(t('admin.recipes.toast.reportError'));
            }
        } finally {
            setReportLoading(false);
        }
    };

    const downloadReportCsv = () => {
        const header = ['hammadde_id', 'hammadde_ad', 'dusum', 'iade', 'net'];
        const rows = report.map((r) =>
            [r.product_id, `"${String(r.product_name).replace(/"/g, '""')}"`, r.consumed, r.restored, r.net_consumed].join(',')
        );
        const blob = new Blob([`\uFEFF${header.join(',')}\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `stok-tuketim-${from}_${to}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const pickIngredient = (lineIdx: number, p: Prod) => {
        setLines((prev) => {
            const next = [...prev];
            next[lineIdx] = {
                ...next[lineIdx],
                ingredient_product_id: p.id,
                ingredient_name: p.name,
                searchText: p.name,
            };
            return next;
        });
    };

    const filteredIngredients = (q: string) => {
        const t = q.trim().toLowerCase();
        if (!t) return ingredientCandidates.slice(0, 12);
        return ingredientCandidates.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 12);
    };

    const selectedName = products.find((p) => p.id === selectedId)?.name || '';

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.inventory.desc')}</div>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/settings', { replace: true })}
                        className="rounded-xl border border-violet-500/40 bg-violet-600/30 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                    >
                        {t('modules.locked.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            {/* Header */}
            <header className="flex flex-col sm:flex-row gap-4 sm:h-20 shrink-0 sm:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 sm:px-8 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-600/10 border border-blue-500/35 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                        <FiLayers size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.recipes.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.recipes.subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={() => void loadProducts()}
                        aria-label={t('admin.recipes.refresh')}
                        title={t('admin.recipes.refresh')}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 transition-all cursor-pointer"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 sm:p-8 space-y-6 z-10">
                <div className="bg-indigo-500/[0.02] border border-indigo-500/15 p-6 rounded-[28px] shadow-xl text-slate-300 backdrop-blur-md relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/30" />
                    <p className="font-black text-xs uppercase tracking-wider text-indigo-400 mb-2">{t('admin.recipes.rules.title')}</p>
                    <ul className="list-inside list-disc space-y-1.5 text-xs font-bold text-slate-400">
                        <li>{t('admin.recipes.rules.noRecipe')}</li>
                        <li>{t('admin.recipes.rules.insufficient')}</li>
                        <li>{t('admin.recipes.rules.cancelRestore')}</li>
                    </ul>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    {/* Menu Product Selector */}
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl backdrop-blur-md flex flex-col justify-start">
                        <label className="mb-2.5 block text-[9px] font-black uppercase text-slate-500 tracking-widest">{t('admin.recipes.selectProduct')}</label>
                        <div className="relative">
                            <select
                                value={selectedId ?? ''}
                                onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full bg-[#020617] border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
                            >
                                <option value="">{t('admin.recipes.selectPlaceholder')}</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedId != null && (
                            <div className="mt-4 p-4 rounded-2xl bg-white/[0.01] border border-white/5 animate-in fade-in">
                                <p className="text-xs font-bold text-slate-400">
                                    {t('admin.recipes.editing')} <span className="font-black text-indigo-400 uppercase">{selectedName}</span>
                                </p>
                                {variants.length > 0 && (
                                    <span className="block text-[10px] font-semibold text-slate-500 mt-1 italic">
                                        {t('admin.recipes.variantsHint').replace('{{count}}', String(variants.length))}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Recipe Lines */}
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl backdrop-blur-md">
                        <p className="mb-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">{t('admin.recipes.componentsTitle')}</p>
                        {selectedId == null ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-500 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                                <FiLayers size={36} className="mb-3 opacity-20 animate-pulse" />
                                <p className="text-xs font-black uppercase tracking-widest">{t('admin.recipes.selectProductHint')}</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-4 max-h-[50vh] overflow-auto pr-2 no-scrollbar">
                                    {lines.map((line, idx) => (
                                        <div
                                            key={idx}
                                            className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 space-y-3 relative"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest shrink-0">
                                                    {t('admin.recipes.col.variant')}
                                                </label>
                                                <select
                                                    value={line.variant_id ?? ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value ? Number(e.target.value) : null;
                                                        const vn = variants.find((x) => x.id === v)?.name;
                                                        setLines((prev) => {
                                                            const n = [...prev];
                                                            n[idx] = {
                                                                ...n[idx],
                                                                variant_id: v,
                                                                variant_name: vn,
                                                            };
                                                            return n;
                                                        });
                                                    }}
                                                    className="w-full bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
                                                >
                                                    <option value="">{t('admin.recipes.allVariants')}</option>
                                                    {variants.map((v) => (
                                                        <option key={v.id} value={v.id}>
                                                            {v.name}
                                                            {v.is_default === true || v.is_default === 1 ? t('admin.recipes.defaultVariant') : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="relative">
                                                <label className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                    <FiSearch size={12} /> {t('admin.recipes.searchIngredient')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={line.searchText}
                                                    onChange={(e) => {
                                                        const t = e.target.value;
                                                        setLines((prev) => {
                                                            const n = [...prev];
                                                            n[idx] = { ...n[idx], searchText: t };
                                                            return n;
                                                        });
                                                    }}
                                                    placeholder={t('admin.recipes.searchIngredientPlaceholder')}
                                                    className="w-full bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                />
                                                {line.ingredient_product_id > 0 && (
                                                    <p className="mt-1.5 text-[10px] font-black text-emerald-400 uppercase tracking-tight">
                                                        {t('admin.recipes.selectedIngredient')
                                                            .replace('{{id}}', String(line.ingredient_product_id))
                                                            .replace('{{name}}', line.ingredient_name)}
                                                    </p>
                                                )}
                                                {line.searchText.trim().length > 0 && (
                                                    <div
                                                        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl no-scrollbar"
                                                        style={{ zIndex: 30 + idx }}
                                                    >
                                                        {filteredIngredients(line.searchText).length === 0 ? (
                                                            <div className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">{t('admin.recipes.noIngredientMatch')}</div>
                                                        ) : (
                                                            filteredIngredients(line.searchText).map((p) => (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() => pickIngredient(idx, p)}
                                                                    className="block w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/5 transition-colors font-bold uppercase"
                                                                >
                                                                    <span className="font-mono text-slate-500 mr-2">#{p.id}</span>
                                                                    {p.name}
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest shrink-0">
                                                    {t('admin.recipes.qtyLabel')}
                                                </label>
                                                <div className="flex items-center gap-2 w-full">
                                                    <input
                                                        type="number"
                                                        step="0.0001"
                                                        min="0.0001"
                                                        className="w-28 bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                        value={line.qty_per_unit}
                                                        onChange={(e) => {
                                                            setLines((prev) => {
                                                                const n = [...prev];
                                                                n[idx] = { ...n[idx], qty_per_unit: Number(e.target.value) || 0 };
                                                                return n;
                                                            });
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                                                        className="ml-auto rounded-xl p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
                                                        title={t('admin.recipes.deleteRowTitle')}
                                                    >
                                                        <FiTrash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setLines((prev) => [
                                                ...prev,
                                                {
                                                    ingredient_product_id: 0,
                                                    ingredient_name: '',
                                                    qty_per_unit: 1,
                                                    variant_id: null,
                                                    searchText: '',
                                                },
                                            ])
                                        }
                                        className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2.5 text-xs font-black text-slate-300 hover:text-white transition-all cursor-pointer"
                                    >
                                        <FiPlus /> {t('admin.recipes.addRow')}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void saveRecipe()}
                                        className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        <FiSave /> {t('admin.recipes.saveRecipe')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Recipe Consumption Report */}
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl backdrop-blur-md">
                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-black uppercase text-white tracking-tight">{t('admin.recipes.report.title')}</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.recipes.report.subtitle')}</p>
                        </div>
                        {report.length > 0 && (
                            <button
                                type="button"
                                onClick={() => downloadReportCsv()}
                                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 text-xs font-black text-slate-300 hover:text-white transition-all cursor-pointer"
                            >
                                <FiDownload /> {t('admin.recipes.report.exportCsv')}
                            </button>
                        )}
                    </div>

                    <div className="mb-6 flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-white/[0.01] border border-white/5">
                        <div className="flex-1 min-w-[120px]">
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">{t('admin.recipes.report.fromDate')}</label>
                            <input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">{t('admin.recipes.report.toDate')}</label>
                            <input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            />
                        </div>
                        <button
                            type="button"
                            disabled={reportLoading}
                            onClick={() => void loadReport()}
                            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {reportLoading ? t('admin.recipes.report.loading') : t('admin.recipes.report.fetch')}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-white/[0.01] border-b border-white/5 select-none text-slate-500">
                                <tr>
                                    <th className="p-4 text-[9px] font-black uppercase tracking-widest">{t('admin.recipes.report.col.ingredient')}</th>
                                    <th className="p-4 text-[9px] font-black uppercase tracking-widest">{t('admin.recipes.report.col.consumed')}</th>
                                    <th className="p-4 text-[9px] font-black uppercase tracking-widest">{t('admin.recipes.report.col.restored')}</th>
                                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-right">{t('admin.recipes.report.col.net')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-bold">
                                {report.map((r) => (
                                    <tr key={r.product_id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-4 text-white">
                                            <span className="mr-2 font-mono text-slate-500 text-xs">#{r.product_id}</span>
                                            {r.product_name}
                                        </td>
                                        <td className="p-4 tabular-nums text-slate-400">{r.consumed}</td>
                                        <td className="p-4 tabular-nums text-emerald-400">+{r.restored}</td>
                                        <td className="p-4 font-black tabular-nums text-indigo-400 text-right">{r.net_consumed}</td>
                                    </tr>
                                ))}
                                {report.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-500 text-xs font-black uppercase tracking-widest">
                                            {t('admin.recipes.report.empty')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
};
