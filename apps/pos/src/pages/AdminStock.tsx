import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiDownload, FiRefreshCcw } from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

type Prod = {
    id: number;
    category_id: number;
    name: string;
    description?: string | null;
    base_price: string;
    price_takeaway?: string;
    price_delivery?: string;
    image_url?: string | null;
    is_active: boolean | number;
    stock_qty?: number | string;
    min_stock_qty?: number | string;
    supplier_name?: string | null;
    last_purchase_price?: number | string | null;
    last_purchase_at?: string | null;
    is_low_stock?: boolean;
};

type LowStockAlert = {
    id: number;
    name: string;
    stock_qty: string | number;
    min_stock_qty: string | number;
    deficit_qty: string | number;
    supplier_name?: string;
    last_purchase_price?: string | number;
    last_purchase_at?: string | null;
    is_active: boolean | number;
    last_movement_at?: string | null;
};

function severityLabel(deficit: number, minStock: number): 'kritik' | 'yüksek' | 'orta' {
    const base = Math.max(1, minStock);
    const ratio = deficit / base;
    if (ratio >= 1) return 'kritik';
    if (ratio >= 0.5) return 'yüksek';
    return 'orta';
}

export const AdminStock: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders, logout } = useAuthStore();
    const { t } = usePosLocale();
    const [products, setProducts] = useState<Prod[]>([]);
    const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [alertsLoading, setAlertsLoading] = useState(false);
    const [locked, setLocked] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'low_stock'>('all');
    const [bulkLoading, setBulkLoading] = useState(false);
    const [supplierDraft, setSupplierDraft] = useState<Record<number, string>>({});
    const [purchaseDraft, setPurchaseDraft] = useState<Record<number, string>>({});
    const [purchaseDateDraft, setPurchaseDateDraft] = useState<Record<number, string>>({});
    const [savingMetaId, setSavingMetaId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/v1/menu/admin/products', { headers: getAuthHeaders() });
        if (res.status === 401) {
            logout();
            return;
        }
        const data = res.ok ? await res.json() : [];
        const arr = Array.isArray(data) ? data : [];
        setProducts(arr);
        const sDraft: Record<number, string> = {};
        const pDraft: Record<number, string> = {};
        const dDraft: Record<number, string> = {};
        for (const p of arr) {
            sDraft[p.id] = String(p.supplier_name || '');
            pDraft[p.id] =
                p.last_purchase_price != null && Number(p.last_purchase_price) > 0
                    ? Number(p.last_purchase_price).toFixed(4)
                    : '';
            dDraft[p.id] = p.last_purchase_at ? String(p.last_purchase_at).slice(0, 10) : '';
        }
        setSupplierDraft(sDraft);
        setPurchaseDraft(pDraft);
        setPurchaseDateDraft(dDraft);
        setLoading(false);
    }, [getAuthHeaders, logout]);

    const loadAlerts = useCallback(async () => {
        setAlertsLoading(true);
        try {
            const res = await fetch('/api/v1/admin/stock/alerts?limit=50', { headers: getAuthHeaders() });
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.status === 403) {
                setLocked(true);
                setAlerts([]);
                return;
            }
            setLocked(false);
            const data = res.ok ? await res.json() : { rows: [] };
            setAlerts(Array.isArray(data?.rows) ? data.rows : []);
        } finally {
            setAlertsLoading(false);
        }
    }, [getAuthHeaders, logout]);

    useEffect(() => {
        void load();
        void loadAlerts();
    }, [load, loadAlerts]);

    const toggle = async (p: Prod) => {
        const next = !(p.is_active === true || p.is_active === 1);
        const res = await fetch(`/api/v1/menu/admin/products/${p.id}`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category_id: p.category_id,
                name: p.name,
                description: p.description ?? null,
                base_price: p.base_price,
                price_takeaway: p.price_takeaway ?? p.base_price,
                price_delivery: p.price_delivery ?? p.base_price,
                image_url: p.image_url ?? null,
                is_active: next,
                stock_qty: p.stock_qty ?? 0,
                min_stock_qty: p.min_stock_qty ?? 0,
                supplier_name: p.supplier_name ?? null,
                last_purchase_price: p.last_purchase_price ?? null,
                last_purchase_at: p.last_purchase_at ?? null,
            }),
        });
        if (res.ok) {
            void load();
            void loadAlerts();
        }
    };

    const adjustStock = async (p: Prod, delta: number) => {
        const res = await fetch(`/api/v1/menu/admin/products/${p.id}/stock-adjust`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                delta_qty: delta,
                reason: delta > 0 ? 'manual_restock' : 'manual_sellout',
            }),
        });
        if (res.ok) {
            void load();
            void loadAlerts();
        }
    };

    const saveSupplierMeta = async (p: Prod) => {
        const supplier = (supplierDraft[p.id] || '').trim();
        const rawPrice = (purchaseDraft[p.id] || '').trim();
        const rawDate = (purchaseDateDraft[p.id] || '').trim();
        const priceNum = rawPrice === '' ? null : Number(rawPrice);
        if (rawPrice !== '' && (!Number.isFinite(priceNum) || priceNum! < 0)) {
            toast.error('Son alış fiyatı geçersiz');
            return;
        }
        setSavingMetaId(p.id);
        try {
            const res = await fetch(`/api/v1/menu/admin/products/${p.id}`, {
                method: 'PUT',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category_id: p.category_id,
                    name: p.name,
                    description: p.description ?? null,
                    base_price: p.base_price,
                    price_takeaway: p.price_takeaway ?? p.base_price,
                    price_delivery: p.price_delivery ?? p.base_price,
                    image_url: p.image_url ?? null,
                    is_active: p.is_active === true || p.is_active === 1,
                    stock_qty: p.stock_qty ?? 0,
                    min_stock_qty: p.min_stock_qty ?? 0,
                    supplier_name: supplier || null,
                    last_purchase_price: priceNum,
                    last_purchase_at: rawDate || null,
                }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                toast.error(j.error || 'Tedarik bilgisi kaydedilemedi');
                return;
            }
            toast.success('Tedarik bilgisi kaydedildi');
            await load();
            await loadAlerts();
        } finally {
            setSavingMetaId(null);
        }
    };

    const filtered = products.filter((p) => {
        const isActive = p.is_active === true || p.is_active === 1;
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'inactive' && isActive) return false;
        if (statusFilter === 'low_stock' && !(p.is_low_stock || Number(p.stock_qty ?? 0) <= Number(p.min_stock_qty ?? 0))) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return p.name.toLowerCase().includes(q);
    });

    const activeCount = products.filter((p) => p.is_active === true || p.is_active === 1).length;
    const inactiveCount = Math.max(0, products.length - activeCount);
    const lowStockCount = products.filter((p) => Number(p.stock_qty ?? 0) <= Number(p.min_stock_qty ?? 0)).length;
    const sortedAlerts = useMemo(() => {
        const withMeta = alerts.map((a) => {
            const deficit = Number(a.deficit_qty ?? 0);
            const minStock = Number(a.min_stock_qty ?? 0);
            const severity = severityLabel(deficit, minStock);
            const sevRank = severity === 'kritik' ? 3 : severity === 'yüksek' ? 2 : 1;
            return {
                ...a,
                deficit,
                minStock,
                lastPurchasePrice: Number(a.last_purchase_price ?? 0),
                lastPurchaseAt: a.last_purchase_at ? String(a.last_purchase_at).slice(0, 10) : '',
                supplierName: String(a.supplier_name || '').trim(),
                severity,
                sevRank,
            };
        });
        return withMeta.sort((x, y) => y.sevRank - x.sevRank || y.deficit - x.deficit || x.name.localeCompare(y.name));
    }, [alerts]);

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

    const downloadReplenishmentCsv = () => {
        const rows = sortedAlerts;
        if (rows.length === 0) return;
        const header = [
            'urun_id',
            'urun_adi',
            'tedarikci',
            'son_alis_fiyati',
            'stok',
            'min_stok',
            'acik_miktar',
            'onerilen_tedarik',
            'onerilen_siparis_tutari',
            'seviye',
        ];
        const lines = rows.map((a) => {
            const recommended = Math.max(a.minStock * 1.2 - Number(a.stock_qty ?? 0), a.deficit);
            const estimatedAmount = recommended * (a.lastPurchasePrice > 0 ? a.lastPurchasePrice : 0);
            return [
                a.id,
                `"${String(a.name).replace(/"/g, '""')}"`,
                `"${String(a.supplierName || '-').replace(/"/g, '""')}"`,
                a.lastPurchasePrice > 0 ? a.lastPurchasePrice.toFixed(4) : '',
                Number(a.stock_qty ?? 0).toFixed(2),
                a.minStock.toFixed(2),
                a.deficit.toFixed(2),
                recommended.toFixed(2),
                estimatedAmount > 0 ? estimatedAmount.toFixed(2) : '',
                a.severity,
            ].join(',');
        });
        const content = `\uFEFF${header.join(',')}\n${lines.join('\n')}`;
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `replenishment-list-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const bulkSetActive = async (next: boolean) => {
        const target = filtered.filter((p) => (p.is_active === true || p.is_active === 1) !== next);
        if (target.length === 0) return;
        setBulkLoading(true);
        try {
            await Promise.all(
                target.map((p) =>
                    fetch(`/api/v1/menu/admin/products/${p.id}`, {
                        method: 'PUT',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            category_id: p.category_id,
                            name: p.name,
                            description: p.description ?? null,
                            base_price: p.base_price,
                            price_takeaway: p.price_takeaway ?? p.base_price,
                            price_delivery: p.price_delivery ?? p.base_price,
                            image_url: p.image_url ?? null,
                            is_active: next,
                            stock_qty: p.stock_qty ?? 0,
                            min_stock_qty: p.min_stock_qty ?? 0,
                            supplier_name: p.supplier_name ?? null,
                            last_purchase_price: p.last_purchase_price ?? null,
                            last_purchase_at: p.last_purchase_at ?? null,
                        }),
                    })
                )
            );
            await load();
            await loadAlerts();
        } finally {
            setBulkLoading(false);
        }
    };

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Stok / müsaitlik</h2>
                    <p className="text-sm text-slate-500">
                        Ürünü tek tıkla satıştan çek (ileride envanter sayımı eklenecek)
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        void load();
                        void loadAlerts();
                    }}
                    className="rounded-lg border border-slate-200 p-2"
                >
                    <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                </button>
            </header>

            <div className="flex-1 overflow-auto p-8">
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-black uppercase text-amber-800">Düşük stok alarmları</p>
                        <div className="flex items-center gap-2">
                            {sortedAlerts.length > 0 && (
                                <button
                                    type="button"
                                    onClick={downloadReplenishmentCsv}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                                >
                                    <FiDownload size={12} /> Replenishment CSV
                                </button>
                            )}
                            <span className="text-[11px] font-bold text-amber-700">
                                {alertsLoading ? 'Yükleniyor...' : `${sortedAlerts.length} ürün`}
                            </span>
                        </div>
                    </div>
                    {sortedAlerts.length > 0 ? (
                        <div className="max-h-36 overflow-auto rounded-lg border border-amber-200 bg-white/70">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-amber-100/60 text-amber-800">
                                    <tr>
                                        <th className="p-2">Ürün</th>
                                        <th className="p-2">Tedarikçi</th>
                                        <th className="p-2">Son Alış</th>
                                        <th className="p-2">Son Tarih</th>
                                        <th className="p-2">Stok</th>
                                        <th className="p-2">Min</th>
                                        <th className="p-2">Açık</th>
                                        <th className="p-2">Seviye</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedAlerts.map((a) => (
                                        <tr key={a.id} className="border-t border-amber-100">
                                            <td className="p-2 font-bold text-slate-700">{a.name}</td>
                                            <td className="p-2 text-slate-600">{a.supplierName || '-'}</td>
                                            <td className="p-2 tabular-nums text-slate-600">
                                                {a.lastPurchasePrice > 0 ? a.lastPurchasePrice.toFixed(4) : '-'}
                                            </td>
                                            <td className="p-2 tabular-nums text-slate-600">{a.lastPurchaseAt || '-'}</td>
                                            <td className="p-2 tabular-nums">{Number(a.stock_qty ?? 0).toFixed(2)}</td>
                                            <td className="p-2 tabular-nums">{a.minStock.toFixed(2)}</td>
                                            <td className="p-2 font-black tabular-nums text-rose-700">
                                                {a.deficit.toFixed(2)}
                                            </td>
                                            <td className="p-2">
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                                                        a.severity === 'kritik'
                                                            ? 'bg-rose-100 text-rose-700'
                                                            : a.severity === 'yüksek'
                                                              ? 'bg-amber-100 text-amber-700'
                                                              : 'bg-blue-100 text-blue-700'
                                                    }`}
                                                >
                                                    {a.severity}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-xs text-amber-700">Kritik stok alarmı yok.</p>
                    )}
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase text-slate-500">Toplam Urun</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{products.length}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase text-emerald-700">Satista</p>
                        <p className="mt-1 text-2xl font-black text-emerald-800">{activeCount}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase text-rose-700">Kapali</p>
                        <p className="mt-1 text-2xl font-black text-rose-800">{inactiveCount}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                        <p className="text-xs font-bold uppercase text-amber-700">Kritik Stok</p>
                        <p className="mt-1 text-2xl font-black text-amber-800">{lowStockCount}</p>
                    </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Urun ara..."
                        className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                    >
                        <option value="all">Tum durumlar</option>
                        <option value="active">Sadece satista</option>
                        <option value="inactive">Sadece kapali</option>
                        <option value="low_stock">Sadece kritik stok</option>
                    </select>
                    <button
                        type="button"
                        disabled={bulkLoading}
                        onClick={() => void bulkSetActive(true)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50"
                    >
                        Filtredekileri satisa ac
                    </button>
                    <button
                        type="button"
                        disabled={bulkLoading}
                        onClick={() => void bulkSetActive(false)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
                    >
                        Filtredekileri kapat
                    </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <datalist id="supplier-suggestions">
                        {[...new Set(products.map((x) => String(x.supplier_name || '').trim()).filter(Boolean))].map((s) => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="p-3">Ürün</th>
                                <th className="p-3">Tedarik</th>
                                <th className="p-3">Stok</th>
                                <th className="p-3">Müsait</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => (
                                <tr key={p.id} className="border-t border-slate-100">
                                    <td className="p-3 font-bold">{p.name}</td>
                                    <td className="p-3">
                                        <div className="flex min-w-[260px] items-center gap-2">
                                            <input
                                                type="text"
                                                list="supplier-suggestions"
                                                value={supplierDraft[p.id] ?? ''}
                                                onChange={(e) =>
                                                    setSupplierDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                }
                                                placeholder="Tedarikçi"
                                                className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                                            />
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                value={purchaseDraft[p.id] ?? ''}
                                                onChange={(e) =>
                                                    setPurchaseDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                }
                                                placeholder="Son alış"
                                                className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                            />
                                            <input
                                                type="date"
                                                value={purchaseDateDraft[p.id] ?? ''}
                                                onChange={(e) =>
                                                    setPurchaseDateDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                }
                                                className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                                            />
                                            <button
                                                type="button"
                                                disabled={savingMetaId === p.id}
                                                onClick={() => void saveSupplierMeta(p)}
                                                className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 disabled:opacity-50"
                                            >
                                                Kaydet
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void adjustStock(p, -1)}
                                                className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold"
                                            >
                                                -1
                                            </button>
                                            <span
                                                className={`min-w-16 text-center text-xs font-black ${
                                                    Number(p.stock_qty ?? 0) <= Number(p.min_stock_qty ?? 0)
                                                        ? 'text-amber-700'
                                                        : 'text-slate-700'
                                                }`}
                                            >
                                                {Number(p.stock_qty ?? 0).toFixed(0)} / min {Number(p.min_stock_qty ?? 0).toFixed(0)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => void adjustStock(p, 1)}
                                                className="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold"
                                            >
                                                +1
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <button
                                            type="button"
                                            onClick={() => toggle(p)}
                                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                                                p.is_active === true || p.is_active === 1
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : 'bg-red-100 text-red-800'
                                            }`}
                                        >
                                            {p.is_active === true || p.is_active === 1
                                                ? 'Satışta'
                                                : 'Kapalı'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td className="p-4 text-sm text-slate-500" colSpan={4}>
                                        Filtreye uygun urun bulunamadi.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
};
