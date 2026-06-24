import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
    FiDownload, FiRefreshCcw, FiSearch, FiSliders, FiBox, 
    FiAlertTriangle, FiSave, FiPlus, FiMinus 
} from 'react-icons/fi';
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

function severityLevel(deficit: number, minStock: number): 'critical' | 'high' | 'medium' {
    const base = Math.max(1, minStock);
    const ratio = deficit / base;
    if (ratio >= 1) return 'critical';
    if (ratio >= 0.5) return 'high';
    return 'medium';
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
            toast.error(t('admin.stock.toast.invalidPrice'));
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
                toast.error(j.error || t('admin.stock.toast.saveError'));
                return;
            }
            toast.success(t('admin.stock.toast.saveSuccess'));
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
            const severity = severityLevel(deficit, minStock);
            const sevRank = severity === 'critical' ? 3 : severity === 'high' ? 2 : 1;
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
                        <FiBox size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.stock.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.stock.subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={() => {
                            void load();
                            void loadAlerts();
                        }}
                        aria-label={t('admin.stock.refresh')}
                        title={t('admin.stock.refresh')}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 transition-all cursor-pointer"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 sm:p-8 space-y-8 z-10">
                {/* Low Stock Alerts */}
                <div className="bg-amber-500/[0.02] border border-amber-500/15 p-6 rounded-[28px] shadow-xl relative overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/30" />
                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <FiAlertTriangle className="text-amber-500 animate-pulse" size={16} />
                            <p className="text-xs font-black uppercase tracking-wider text-amber-400">{t('admin.stock.lowStockAlerts')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {sortedAlerts.length > 0 && (
                                <button
                                    type="button"
                                    onClick={downloadReplenishmentCsv}
                                    className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 px-3 py-1.5 text-[10px] font-black text-amber-300 transition-all cursor-pointer"
                                >
                                    <FiDownload size={12} /> {t('admin.stock.replenishmentCsv')}
                                </button>
                            )}
                            <span className="text-[10px] font-extrabold text-amber-500/70 uppercase tracking-widest">
                                {alertsLoading
                                    ? t('admin.stock.loading')
                                    : t('admin.stock.alertsCount').replace('{{count}}', String(sortedAlerts.length))}
                            </span>
                        </div>
                    </div>

                    {sortedAlerts.length > 0 ? (
                        <div className="max-h-48 overflow-auto rounded-2xl border border-white/5 bg-black/20">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-white/[0.01] border-b border-white/5 text-slate-400 select-none">
                                        <tr>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.product')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.supplier')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.lastPurchase')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.lastDate')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.stock')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.min')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.deficit')}</th>
                                            <th className="p-3 font-black text-[9px] uppercase tracking-widest">{t('admin.stock.col.level')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-bold text-slate-300">
                                        {sortedAlerts.map((a) => (
                                            <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="p-3 text-white uppercase text-xs tracking-tight">{a.name}</td>
                                                <td className="p-3 text-slate-400">{a.supplierName || '-'}</td>
                                                <td className="p-3 tabular-nums text-slate-400">
                                                    {a.lastPurchasePrice > 0 ? `${a.lastPurchasePrice.toFixed(4)}` : '-'}
                                                </td>
                                                <td className="p-3 tabular-nums text-slate-400">{a.lastPurchaseAt || '-'}</td>
                                                <td className="p-3 tabular-nums">{Number(a.stock_qty ?? 0).toFixed(2)}</td>
                                                <td className="p-3 tabular-nums">{a.minStock.toFixed(2)}</td>
                                                <td className="p-3 font-black tabular-nums text-rose-400">
                                                    -{a.deficit.toFixed(2)}
                                                </td>
                                                <td className="p-3">
                                                    <span
                                                        className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest border ${
                                                            a.severity === 'critical'
                                                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_12px_rgba(239,68,68,0.1)]'
                                                                : a.severity === 'high'
                                                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                        }`}
                                                    >
                                                        {t(`admin.stock.severity.${a.severity}`)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">{t('admin.stock.noCriticalAlerts')}</p>
                    )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-blue-400 flex items-center justify-center border border-white/5"><FiBox size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.stock.metric.totalProducts')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{products.length}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-emerald-400 flex items-center justify-center border border-white/5"><FiSliders size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.stock.metric.active')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{activeCount}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-rose-400 flex items-center justify-center border border-white/5"><FiSliders size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.stock.metric.inactive')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{inactiveCount}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-amber-400 flex items-center justify-center border border-white/5"><FiAlertTriangle size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.stock.metric.critical')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{lowStockCount}</p>
                        </div>
                    </div>
                </div>

                {/* Table Area with Search/Filters */}
                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] shadow-2xl overflow-hidden backdrop-blur-md">
                    <div className="p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.01]">
                        <div className="flex flex-col sm:flex-row gap-3 flex-1">
                            <div className="relative flex-1 max-w-xs">
                                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t('admin.stock.searchPlaceholder')}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                />
                            </div>
                            <div className="relative">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="bg-[#0f172a] border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all cursor-pointer appearance-none pr-10"
                                >
                                    <option value="all">{t('admin.stock.filter.all')}</option>
                                    <option value="active">{t('admin.stock.filter.active')}</option>
                                    <option value="inactive">{t('admin.stock.filter.inactive')}</option>
                                    <option value="low_stock">{t('admin.stock.filter.lowStock')}</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                                    <FiSliders size={14} />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                disabled={bulkLoading}
                                onClick={() => void bulkSetActive(true)}
                                className="rounded-xl bg-emerald-600/10 border border-emerald-500/35 hover:bg-emerald-600/20 px-4 py-2.5 text-xs font-black text-emerald-400 transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {t('admin.stock.bulkEnable')}
                            </button>
                            <button
                                type="button"
                                disabled={bulkLoading}
                                onClick={() => void bulkSetActive(false)}
                                className="rounded-xl bg-rose-600/10 border border-rose-500/35 hover:bg-rose-600/20 px-4 py-2.5 text-xs font-black text-rose-400 transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {t('admin.stock.bulkDisable')}
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <datalist id="supplier-suggestions">
                            {[...new Set(products.map((x) => String(x.supplier_name || '').trim()).filter(Boolean))].map((s) => (
                                <option key={s} value={s} />
                            ))}
                        </datalist>
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-white/[0.01] border-b border-white/5 select-none text-slate-500">
                                <tr>
                                    <th className="p-6 text-[9px] font-black uppercase tracking-widest">{t('admin.stock.col.product')}</th>
                                    <th className="p-6 text-[9px] font-black uppercase tracking-widest">{t('admin.stock.col.supplierInfo')}</th>
                                    <th className="p-6 text-[9px] font-black uppercase tracking-widest">{t('admin.stock.col.stockMin')}</th>
                                    <th className="p-6 text-[9px] font-black uppercase tracking-widest text-right">{t('admin.stock.col.status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-bold">
                                {filtered.map((p) => (
                                    <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-black text-slate-300 text-xs shrink-0 border border-white/5">
                                                    {p.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="font-black text-white uppercase text-xs tracking-tight">{p.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-500">#PRD-{p.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-wrap items-center gap-2 max-w-xl">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        list="supplier-suggestions"
                                                        value={supplierDraft[p.id] ?? ''}
                                                        onChange={(e) =>
                                                            setSupplierDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                        }
                                                        placeholder={t('admin.stock.placeholder.supplier')}
                                                        className="w-32 bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.0001"
                                                        min="0"
                                                        value={purchaseDraft[p.id] ?? ''}
                                                        onChange={(e) =>
                                                            setPurchaseDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                        }
                                                        placeholder={t('admin.stock.placeholder.price')}
                                                        className="w-24 bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="date"
                                                        value={purchaseDateDraft[p.id] ?? ''}
                                                        onChange={(e) =>
                                                            setPurchaseDateDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                                        }
                                                        className="w-32 bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={savingMetaId === p.id}
                                                    onClick={() => void saveSupplierMeta(p)}
                                                    className="flex items-center justify-center p-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/35 hover:bg-indigo-600/20 text-indigo-400 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                                                    title={t('admin.stock.saveSupplierTitle')}
                                                >
                                                    <FiSave size={14} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void adjustStock(p, -1)}
                                                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                                                >
                                                    <FiMinus size={12} />
                                                </button>
                                                <span
                                                    className={`min-w-20 text-center text-xs font-black tracking-tight tabular-nums px-2 py-1 rounded-lg ${
                                                        Number(p.stock_qty ?? 0) <= Number(p.min_stock_qty ?? 0)
                                                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                                                            : 'text-slate-300 bg-white/5'
                                                    }`}
                                                >
                                                    {t('admin.stock.stockMinLabel')
                                                        .replace('{{stock}}', Number(p.stock_qty ?? 0).toFixed(0))
                                                        .replace('{{min}}', Number(p.min_stock_qty ?? 0).toFixed(0))}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => void adjustStock(p, 1)}
                                                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                                                >
                                                    <FiPlus size={12} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button
                                                type="button"
                                                onClick={() => toggle(p)}
                                                className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all border ${
                                                    p.is_active === true || p.is_active === 1
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                                                }`}
                                            >
                                                {p.is_active === true || p.is_active === 1
                                                    ? t('admin.stock.status.active')
                                                    : t('admin.stock.status.inactive')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td className="p-6 text-slate-500 text-xs font-black uppercase tracking-wider text-center" colSpan={4}>
                                            {t('admin.stock.empty')}
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
