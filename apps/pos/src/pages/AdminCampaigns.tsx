import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiTag, FiTrash2, FiPlus } from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

type CampaignRow = {
    id: number;
    name: string;
    discount_type: string;
    discount_value: number;
    start_date: string;
    end_date: string;
    is_active?: boolean | number;
    audience_filter?: string;
    target_category_id?: number | null;
    target_product_id?: number | null;
    applicable_order_types?: string | null;
};

type CategoryRow = { id: number; name: string; displayName?: string };
type ProductRow = { id: number; name: string; displayName?: string; categoryId?: number };
type CustomerRow = { id: number; name?: string; phone?: string | null; email?: string | null; customer_code?: string | null };

export const AdminCampaigns: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders, user } = useAuthStore();
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<CampaignRow[]>([]);
    const [creating, setCreating] = useState(false);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);
    const [form, setForm] = useState({
        name: '',
        discount_value: 10,
        start: new Date().toISOString().slice(0, 10),
        end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });
    const [targetMode, setTargetMode] = useState<'all' | 'category' | 'product'>('all');
    const [targetCategoryId, setTargetCategoryId] = useState<number | ''>('');
    const [targetProductId, setTargetProductId] = useState<number | ''>('');
    const [orderTypes, setOrderTypes] = useState<string[]>(['delivery', 'takeaway']);
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [couponForCustomers, setCouponForCustomers] = useState(false);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerSearching, setCustomerSearching] = useState(false);
    const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/coupons/campaigns', { headers: getAuthHeaders() });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            setRows(Array.isArray(data) ? data : []);
        } catch {
            toast.error(t('admin.campaigns.loadError'));
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, t]);

    const loadTargets = useCallback(async () => {
        try {
            const [catRes, prodRes] = await Promise.all([
                fetch('/api/v1/menu/categories?lang=tr', { headers: getAuthHeaders() }),
                fetch('/api/v1/menu/products?lang=tr', { headers: getAuthHeaders() }),
            ]);
            if (catRes.ok) {
                const data = await catRes.json();
                setCategories(Array.isArray(data) ? data : []);
            }
            if (prodRes.ok) {
                const data = await prodRes.json();
                setProducts(Array.isArray(data) ? data : []);
            }
        } catch {
        }
    }, [getAuthHeaders]);

    const searchCustomers = useCallback(
        async (q: string) => {
            setCustomerSearching(true);
            try {
                const qs = q.trim();
                const url = qs ? `/api/v1/customers/search?q=${encodeURIComponent(qs)}` : '/api/v1/customers/search';
                const res = await fetch(url, { headers: getAuthHeaders() });
                if (!res.ok) throw new Error('HTTP');
                const data = await res.json();
                setCustomerResults(Array.isArray(data) ? data : []);
            } catch {
                toast.error(t('admin.campaigns.customersLoadError'));
            } finally {
                setCustomerSearching(false);
            }
        },
        [getAuthHeaders, t]
    );

    useEffect(() => {
        if (!user) return;
        if (user.role !== 'admin') {
            navigate('/admin', { replace: true });
        }
    }, [user, navigate]);

    useEffect(() => {
        if (user?.role !== 'admin') return;
        void load();
        void loadTargets();
        void searchCustomers('');
    }, [load, loadTargets, searchCustomers, user?.role]);

    useEffect(() => {
        if (user?.role !== 'admin') return;
        const handle = window.setTimeout(() => {
            void searchCustomers(customerQuery);
        }, 350);
        return () => window.clearTimeout(handle);
    }, [customerQuery, searchCustomers, user?.role]);

    useEffect(() => {
        if (targetMode !== 'category') setTargetCategoryId('');
        if (targetMode !== 'product') setTargetProductId('');
    }, [targetMode]);

    const createCampaign = async () => {
        if (!form.name.trim()) {
            toast.error(t('admin.campaigns.nameRequired'));
            return;
        }
        setCreating(true);
        try {
            const selectedOrderTypes = orderTypes.map((s) => String(s).trim()).filter(Boolean);
            const applicableOrderTypes =
                selectedOrderTypes.length === 0 || selectedOrderTypes.length === 3 ? 'all' : selectedOrderTypes.join(',');

            const payload: Record<string, unknown> = {
                name: form.name.trim(),
                discount_type: 'percent',
                discount_value: form.discount_value,
                start_date: form.start,
                end_date: form.end,
                min_order_amount: 0,
                audience_filter: 'all',
                is_auto_apply: false,
                applicable_order_types: applicableOrderTypes,
            };

            if (targetMode === 'category' && targetCategoryId !== '') {
                payload.target_category_id = targetCategoryId;
            }
            if (targetMode === 'product' && targetProductId !== '') {
                payload.target_product_id = targetProductId;
            }

            const res = await fetch('/api/v1/coupons/campaigns', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'HTTP');
            }
            const createdCampaign = (await res.json().catch(() => null)) as CampaignRow | null;
            toast.success(t('admin.campaigns.created'));
            setForm((f) => ({ ...f, name: '' }));
            setSelectedCustomerIds([]);
            setCouponForCustomers(false);

            if (couponForCustomers && selectedCustomerIds.length > 0 && createdCampaign?.id) {
                const endMs = Date.parse(String(createdCampaign.end_date || form.end));
                const days = Number.isFinite(endMs)
                    ? Math.max(1, Math.ceil((endMs - Date.now()) / 86400000))
                    : 30;

                const bulkRes = await fetch('/api/v1/coupons/bulk', {
                    method: 'POST',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        campaign_id: createdCampaign.id,
                        count: selectedCustomerIds.length,
                        customer_ids: selectedCustomerIds,
                        valid_days: days,
                    }),
                });

                if (bulkRes.ok) {
                    const bulkData = await bulkRes.json().catch(() => null);
                    const created = Number(bulkData?.created ?? selectedCustomerIds.length);
                    toast.success(`${created} ${t('admin.campaigns.couponsCreated')}`);
                } else {
                    toast.error(t('admin.campaigns.couponsCreateError'));
                }
            }
            await load();
        } catch {
            toast.error(t('admin.campaigns.createError'));
        } finally {
            setCreating(false);
        }
    };

    const remove = async (id: number) => {
        setConfirm({
            title: t('admin.campaigns.delete'),
            description: t('admin.campaigns.deleteConfirm'),
            onConfirm: () => {
                void (async () => {
                    try {
                        const res = await fetch(`/api/v1/coupons/campaigns/${id}`, {
                            method: 'DELETE',
                            headers: getAuthHeaders(),
                        });
                        if (!res.ok) throw new Error('x');
                        toast.success(t('admin.campaigns.deleted'));
                        await load();
                    } catch {
                        toast.error(t('admin.campaigns.deleteError'));
                    }
                })();
            },
        });
    };

    return (
        <div className="flex-1 overflow-auto bg-[#020617] p-6 text-slate-100">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white">{t('admin.campaigns.title')}</h1>
                        <p className="mt-1 text-sm text-slate-500">{t('admin.campaigns.subtitle')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10"
                    >
                        <FiRefreshCw size={16} /> {t('admin.campaigns.refresh')}
                    </button>
                </div>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                        <FiPlus /> {t('admin.campaigns.newCampaign')}
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                            {t('admin.campaigns.fieldName')}
                            <input
                                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                            {t('admin.campaigns.fieldPercent')}
                            <input
                                type="number"
                                min={1}
                                max={100}
                                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                value={form.discount_value}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))
                                }
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                            {t('admin.campaigns.fieldStart')}
                            <input
                                type="date"
                                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                value={form.start}
                                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                            {t('admin.campaigns.fieldEnd')}
                            <input
                                type="date"
                                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                value={form.end}
                                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                            />
                        </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                            {t('admin.campaigns.fieldTarget')}
                            <select
                                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                value={targetMode}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === 'all' || v === 'category' || v === 'product') setTargetMode(v);
                                }}
                            >
                                <option value="all">{t('admin.campaigns.targetAll')}</option>
                                <option value="category">{t('admin.campaigns.targetCategory')}</option>
                                <option value="product">{t('admin.campaigns.targetProduct')}</option>
                            </select>
                        </label>

                        {targetMode === 'category' ? (
                            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                                {t('admin.campaigns.fieldCategory')}
                                <select
                                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                    value={targetCategoryId}
                                    onChange={(e) =>
                                        setTargetCategoryId(e.target.value ? Number(e.target.value) : '')
                                    }
                                >
                                    <option value="">{t('admin.campaigns.selectPlaceholder')}</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.displayName || c.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : targetMode === 'product' ? (
                            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                                {t('admin.campaigns.fieldProduct')}
                                <select
                                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                    value={targetProductId}
                                    onChange={(e) => setTargetProductId(e.target.value ? Number(e.target.value) : '')}
                                >
                                    <option value="">{t('admin.campaigns.selectPlaceholder')}</option>
                                    {products.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.displayName || p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <div />
                        )}
                    </div>

                    <div className="mt-4 space-y-2">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {t('admin.campaigns.fieldOrderTypes')}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-300">
                            {[
                                { k: 'delivery', label: t('admin.campaigns.orderTypeDelivery') },
                                { k: 'takeaway', label: t('admin.campaigns.orderTypeTakeaway') },
                                { k: 'dine_in', label: t('admin.campaigns.orderTypeDineIn') },
                            ].map((x) => {
                                const checked = orderTypes.includes(x.k);
                                return (
                                    <label key={x.k} className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                                setOrderTypes((prev) => {
                                                    if (e.target.checked) return Array.from(new Set([...prev, x.k]));
                                                    return prev.filter((t2) => t2 !== x.k);
                                                });
                                            }}
                                        />
                                        <span>{x.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="text-[11px] text-slate-500">{t('admin.campaigns.orderTypesHint')}</div>
                    </div>

                    <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
                        <label className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                                    {t('admin.campaigns.couponSectionTitle')}
                                </div>
                                <div className="text-xs text-slate-500">{t('admin.campaigns.couponSectionHint')}</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={couponForCustomers}
                                onChange={(e) => setCouponForCustomers(e.target.checked)}
                            />
                        </label>

                        {couponForCustomers && (
                            <div className="mt-4 space-y-3">
                                <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                                    {t('admin.campaigns.customerSearch')}
                                    <input
                                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                                        value={customerQuery}
                                        onChange={(e) => setCustomerQuery(e.target.value)}
                                        placeholder={t('admin.campaigns.customerSearchPh')}
                                    />
                                </label>

                                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="text-xs font-black uppercase tracking-widest text-slate-500">
                                            {t('admin.campaigns.customerList')}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {t('admin.campaigns.selectedLabel')}: {selectedCustomerIds.length}
                                        </div>
                                    </div>
                                    {customerSearching ? (
                                        <div className="py-6 text-center text-slate-500 text-sm">
                                            {t('admin.campaigns.customersLoading')}
                                        </div>
                                    ) : customerResults.length === 0 ? (
                                        <div className="py-6 text-center text-slate-500 text-sm">
                                            {t('admin.campaigns.customersEmpty')}
                                        </div>
                                    ) : (
                                        <div className="max-h-48 overflow-auto space-y-1">
                                            {customerResults.map((c) => {
                                                const id = Number(c.id);
                                                const checked = selectedCustomerIds.includes(id);
                                                const title = String(c.name || '').trim() || String(c.customer_code || '').trim() || `#${id}`;
                                                const meta = [c.customer_code, c.phone, c.email]
                                                    .map((x) => (x != null ? String(x).trim() : ''))
                                                    .filter(Boolean)
                                                    .join(' · ');
                                                return (
                                                    <label
                                                        key={id}
                                                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-bold text-white">{title}</div>
                                                            {meta ? (
                                                                <div className="truncate text-xs text-slate-500">{meta}</div>
                                                            ) : null}
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                setSelectedCustomerIds((prev) => {
                                                                    if (e.target.checked) return Array.from(new Set([...prev, id]));
                                                                    return prev.filter((x) => x !== id);
                                                                });
                                                            }}
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        disabled={creating}
                        onClick={() => void createCampaign()}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                        <FiTag size={16} /> {t('admin.campaigns.createBtn')}
                    </button>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <div className="border-b border-white/10 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
                        {t('admin.campaigns.listTitle')}
                    </div>
                    {loading ? (
                        <div className="p-12 text-center text-slate-500">{t('admin.campaigns.loading')}</div>
                    ) : rows.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">{t('admin.campaigns.empty')}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 text-xs uppercase text-slate-500">
                                        <th className="px-4 py-3">{t('admin.campaigns.colName')}</th>
                                        <th className="px-4 py-3">{t('admin.campaigns.colDiscount')}</th>
                                        <th className="px-4 py-3">{t('admin.campaigns.colPeriod')}</th>
                                        <th className="px-4 py-3 w-24"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((c) => (
                                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                            <td className="px-4 py-3 font-bold text-white">{c.name}</td>
                                            <td className="px-4 py-3 text-emerald-400">
                                                {c.discount_type === 'percent'
                                                    ? `%${c.discount_value}`
                                                    : c.discount_value}
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">
                                                {String(c.start_date).slice(0, 10)} → {String(c.end_date).slice(0, 10)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    onClick={() => void remove(c.id)}
                                                    className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                                                    title={t('admin.campaigns.delete')}
                                                    aria-label={t('admin.campaigns.delete')}
                                                >
                                                    <FiTrash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
                <ModernConfirmModal
                    isOpen={!!confirm}
                    onClose={() => setConfirm(null)}
                    title={confirm?.title || ''}
                    description={confirm?.description || ''}
                    confirmText="SİL"
                    cancelText="VAZGEÇ"
                    type="danger"
                    onConfirm={() => confirm?.onConfirm()}
                />
            </div>
        </div>
    );
};
