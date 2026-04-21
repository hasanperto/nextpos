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
                toast.error('Her satırda geçerli bir hammadde seçin');
                return;
            }
            if (!l.qty_per_unit || l.qty_per_unit <= 0) {
                toast.error('Miktar (qty_per_unit) pozitif olmalı');
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
                toast.success('Reçete kaydedildi');
                await loadRecipe(selectedId);
            } else {
                const j = await res.json().catch(() => ({}));
                toast.error(j.error || 'Kayıt başarısız');
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
                toast.error('Rapor yüklenemedi');
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
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div>
                    <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
                        <FiLayers /> Reçete (BOM)
                    </h2>
                    <p className="text-sm text-slate-500">
                        <strong>Genel:</strong> varyant seçilmeden tanımlanan satırlar tüm varyantlara uygulanır.
                        <strong className="ml-1">Varyant özel:</strong> aynı hammadde için satır ekleyip varyant seçerseniz, o
                        varyant siparişlerinde bu miktar geçerli olur (genel satırı ezer).
                    </p>
                </div>
                <button type="button" onClick={() => void loadProducts()} className="rounded-lg border border-slate-200 p-2" aria-label="Yenile" title="Yenile">
                    <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                </button>
            </header>

            <div className="flex-1 overflow-auto p-8 space-y-6">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4 text-sm text-indigo-950">
                    <p className="font-bold text-indigo-900">Siparişte stok düşümü</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-indigo-900/90">
                        <li>Reçetesi olmayan menü ürününde stok düşmez.</li>
                        <li>Yetersiz hammadde stokunda sipariş reddedilir (400, kod: INSUFFICIENT_STOCK).</li>
                        <li>Sipariş iptal / QR red / açık oturum iptali: tamamlanmamış siparişlerde reçete iadesi yapılır.</li>
                    </ul>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <label className="mb-2 block text-xs font-bold uppercase text-slate-500">Menü ürünü</label>
                        <select
                            value={selectedId ?? ''}
                            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="">— Seçin —</option>
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        {selectedId != null && (
                            <p className="mt-2 text-xs text-slate-500">
                                Düzenlenen: <span className="font-bold text-slate-800">{selectedName}</span>
                                {variants.length > 0 && (
                                    <span className="block text-[11px] text-slate-400">
                                        {variants.length} varyant — reçetede &quot;Tüm varyantlar&quot; veya tek seçim.
                                    </span>
                                )}
                            </p>
                        )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="mb-3 text-xs font-bold uppercase text-slate-500">Reçete satırları</p>
                        {selectedId == null ? (
                            <p className="text-sm text-slate-400">Önce menü ürünü seçin.</p>
                        ) : (
                            <>
                                <div className="space-y-4">
                                    {lines.map((line, idx) => (
                                        <div
                                            key={idx}
                                            className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="text-[10px] font-bold uppercase text-slate-500">
                                                    Kapsam
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
                                                    className="min-w-[10rem] flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                                                >
                                                    <option value="">Tüm varyantlar</option>
                                                    {variants.map((v) => (
                                                        <option key={v.id} value={v.id}>
                                                            {v.name}
                                                            {v.is_default === true || v.is_default === 1 ? ' (varsayılan)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="relative">
                                                <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                                                    <FiSearch size={10} /> Hammadde ara
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
                                                    placeholder="Ürün adı yazın…"
                                                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                                                />
                                                {line.ingredient_product_id > 0 && (
                                                    <p className="mt-1 text-[11px] text-emerald-700">
                                                        Seçili: #{line.ingredient_product_id} {line.ingredient_name}
                                                    </p>
                                                )}
                                                {line.searchText.trim().length > 0 && (
                                                    <div
                                                        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-white shadow-md"
                                                        style={{ zIndex: 20 + idx }}
                                                    >
                                                        {filteredIngredients(line.searchText).length === 0 ? (
                                                            <div className="px-2 py-2 text-xs text-slate-400">Eşleşen ürün yok</div>
                                                        ) : (
                                                            filteredIngredients(line.searchText).map((p) => (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() => pickIngredient(idx, p)}
                                                                    className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-100"
                                                                >
                                                                    <span className="font-mono text-slate-400">#{p.id}</span>{' '}
                                                                    {p.name}
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="text-[10px] font-bold uppercase text-slate-500">
                                                    1 satılan birim başına
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    min="0.0001"
                                                    className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
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
                                                    className="ml-auto rounded p-1.5 text-rose-600 hover:bg-rose-50"
                                                    title="Satırı sil"
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
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
                                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
                                    >
                                        <FiPlus /> Satır ekle
                                    </button>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void saveRecipe()}
                                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                                    >
                                        <FiSave /> Kaydet
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase text-slate-600">Reçete tüketim özeti</h3>
                        {report.length > 0 && (
                            <button
                                type="button"
                                onClick={() => downloadReportCsv()}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                            >
                                <FiDownload /> CSV
                            </button>
                        )}
                    </div>
                    <div className="mb-4 flex flex-wrap items-end gap-2">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500">Başlangıç</label>
                            <input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="rounded border border-slate-200 px-2 py-1 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500">Bitiş</label>
                            <input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="rounded border border-slate-200 px-2 py-1 text-sm"
                            />
                        </div>
                        <button
                            type="button"
                            disabled={reportLoading}
                            onClick={() => void loadReport()}
                            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                            Yükle
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="p-2">Hammadde</th>
                                    <th className="p-2">Düşüm</th>
                                    <th className="p-2">İade (iptal)</th>
                                    <th className="p-2">Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.map((r) => (
                                    <tr key={r.product_id} className="border-t border-slate-100">
                                        <td className="p-2 font-medium">
                                            <span className="mr-1 font-mono text-xs text-slate-400">#{r.product_id}</span>
                                            {r.product_name}
                                        </td>
                                        <td className="p-2 tabular-nums">{r.consumed}</td>
                                        <td className="p-2 tabular-nums">{r.restored}</td>
                                        <td className="p-2 font-bold tabular-nums text-slate-900">{r.net_consumed}</td>
                                    </tr>
                                ))}
                                {report.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-4 text-center text-slate-400">
                                            Veri yok veya aralığı yükleyin.
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
