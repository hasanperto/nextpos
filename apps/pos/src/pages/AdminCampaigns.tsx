import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    FiRefreshCw, 
    FiTag, 
    FiTrash2, 
    FiPlus, 
    FiPercent, 
    FiCopy, 
    FiCheck, 
    FiSearch, 
    FiSliders, 
    FiUsers,
    FiGift,
    FiTruck
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

type CampaignRow = {
    id: number;
    name: string;
    discount_type: 'percent' | 'fixed' | 'free_item' | 'free_delivery';
    discount_value: number;
    discount_item_id?: number | null;
    start_date: string;
    end_date: string;
    is_active?: boolean | number;
    audience_filter?: string;
    target_category_id?: number | null;
    target_product_id?: number | null;
    applicable_order_types?: string | null;
};

type CouponRow = {
    id: number;
    code: string;
    campaign_id: number | null;
    customer_id: number | null;
    phone: string | null;
    email: string | null;
    discount_type: 'percent' | 'fixed' | 'free_item' | 'free_delivery';
    discount_value: number;
    target_category_id?: number | null;
    target_product_id?: number | null;
    applicable_order_types?: string | null;
    min_order_amount: number;
    valid_from: string;
    valid_until: string;
    usage_limit: number;
    usage_count: number;
    status: 'active' | 'paused' | 'expired' | 'depleted';
    created_at: string;
    customer_name?: string | null;
};

type CategoryRow = { id: number; name: string; displayName?: string };
type ProductRow = { id: number; name: string; displayName?: string; categoryId?: number };
type CustomerRow = { id: number; name?: string; phone?: string | null; email?: string | null; customer_code?: string | null };

export const AdminCampaigns: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders, user } = useAuthStore();
    const { t } = usePosLocale();
    
    // Tab State: 'campaigns' | 'coupons'
    const [activeTab, setActiveTab] = useState<'campaigns' | 'coupons'>('campaigns');
    
    // Load states
    const [loading, setLoading] = useState(true);
    const [couponsLoading, setCouponsLoading] = useState(false);
    
    // Data list states
    const [rows, setRows] = useState<CampaignRow[]>([]);
    const [coupons, setCoupons] = useState<CouponRow[]>([]);
    
    // Form and input states
    const [creating, setCreating] = useState(false);
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);
    
    // Campaign Form
    const [form, setForm] = useState({
        name: '',
        discount_type: 'percent' as 'percent' | 'fixed' | 'free_item' | 'free_delivery',
        discount_value: 10,
        discount_item_id: '' as number | '',
        start: new Date().toISOString().slice(0, 10),
        end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });
    
    // Campaign Target selection
    const [targetMode, setTargetMode] = useState<'all' | 'category' | 'product'>('all');
    const [targetCategoryId, setTargetCategoryId] = useState<number | ''>('');
    const [targetProductId, setTargetProductId] = useState<number | ''>('');
    const [orderTypes, setOrderTypes] = useState<string[]>(['delivery', 'takeaway']);
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [products, setProducts] = useState<ProductRow[]>([]);
    
    // Customer search for coupon binding
    const [couponForCustomers, setCouponForCustomers] = useState(false);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerSearching, setCustomerSearching] = useState(false);
    const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
    
    // Bulk Coupon Generation Form
    const [bulkCampaignId, setBulkCampaignId] = useState<number | ''>('');
    const [bulkCount, setBulkCount] = useState<number>(10);
    const [bulkValidDays, setBulkValidDays] = useState<number>(30);
    const [bulkGenerating, setBulkGenerating] = useState(false);
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    
    // Coupons search & filters
    const [couponsSearch, setCouponsSearch] = useState('');
    const [couponsFilterStatus, setCouponsFilterStatus] = useState<'all' | 'active' | 'depleted' | 'expired'>('all');

    // Load campaigns
    const loadCampaigns = useCallback(async () => {
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

    // Load coupons
    const loadCoupons = useCallback(async () => {
        setCouponsLoading(true);
        try {
            const url = couponsFilterStatus !== 'all' 
                ? `/api/v1/coupons?status=${couponsFilterStatus}`
                : '/api/v1/coupons';
            const res = await fetch(url, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            setCoupons(Array.isArray(data) ? data : []);
        } catch {
            toast.error(t('admin.campaigns.couponsLoadError'));
        } finally {
            setCouponsLoading(false);
        }
    }, [getAuthHeaders, couponsFilterStatus]);

    // Load static categories and products
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
            /* ignore */
        }
    }, [getAuthHeaders]);

    // Search customers
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

    // Auth check
    useEffect(() => {
        if (!user) return;
        if (user.role !== 'admin') {
            navigate('/admin', { replace: true });
        }
    }, [user, navigate]);

    // Load initial data
    useEffect(() => {
        if (user?.role !== 'admin') return;
        void loadCampaigns();
        void loadTargets();
        void searchCustomers('');
    }, [loadCampaigns, loadTargets, searchCustomers, user?.role]);

    // Fetch coupons when tab changes or filter changes
    useEffect(() => {
        if (user?.role !== 'admin') return;
        if (activeTab === 'coupons') {
            void loadCoupons();
        }
    }, [activeTab, loadCoupons, user?.role]);

    // Debounced customer search
    useEffect(() => {
        if (user?.role !== 'admin') return;
        const handle = window.setTimeout(() => {
            void searchCustomers(customerQuery);
        }, 350);
        return () => window.clearTimeout(handle);
    }, [customerQuery, searchCustomers, user?.role]);

    // Target Category/Product reset on mode change
    useEffect(() => {
        if (targetMode !== 'category') setTargetCategoryId('');
        if (targetMode !== 'product') setTargetProductId('');
    }, [targetMode]);

    // Create Campaign
    const createCampaign = async () => {
        if (!form.name.trim()) {
            toast.error(t('admin.campaigns.nameRequired'));
            return;
        }
        if (form.discount_type === 'free_item' && form.discount_item_id === '') {
            toast.error(t('admin.campaigns.freeItemRequired'));
            return;
        }
        
        setCreating(true);
        try {
            const selectedOrderTypes = orderTypes.map((s) => String(s).trim()).filter(Boolean);
            const applicableOrderTypes =
                selectedOrderTypes.length === 0 || selectedOrderTypes.length === 3 ? 'all' : selectedOrderTypes.join(',');

            const payload: Record<string, unknown> = {
                name: form.name.trim(),
                discount_type: form.discount_type,
                discount_value: form.discount_type === 'free_delivery' || form.discount_type === 'free_item' ? 0 : form.discount_value,
                start_date: form.start,
                end_date: form.end,
                min_order_amount: 0,
                audience_filter: 'all',
                is_auto_apply: false,
                applicable_order_types: applicableOrderTypes,
            };

            if (form.discount_type === 'free_item' && form.discount_item_id !== '') {
                payload.discount_item_id = form.discount_item_id;
            }
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
            setForm((f) => ({ ...f, name: '', discount_value: 10, discount_item_id: '' }));
            setSelectedCustomerIds([]);
            setCouponForCustomers(false);

            // If coupon binding is selected for customers, trigger bulk coupon generation
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
                    toast.success(t('admin.campaigns.couponsCreatedToast').replace('{{count}}', String(created)));
                } else {
                    toast.error(t('admin.campaigns.couponsCreateError'));
                }
            }
            await loadCampaigns();
        } catch (e: any) {
            toast.error(e.message || t('admin.campaigns.createError'));
        } finally {
            setCreating(false);
        }
    };

    // Remove Campaign
    const removeCampaign = async (id: number) => {
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
                        await loadCampaigns();
                    } catch {
                        toast.error(t('admin.campaigns.deleteError'));
                    }
                })();
            },
        });
    };

    // Bulk Generate Coupons for existing campaign
    const generateBulkCoupons = async () => {
        if (!bulkCampaignId) {
            toast.error(t('admin.campaigns.selectCampaignRequired'));
            return;
        }
        if (bulkCount <= 0 || bulkCount > 1000) {
            toast.error(t('admin.campaigns.bulkCountInvalid'));
            return;
        }

        setBulkGenerating(true);
        setGeneratedCodes([]);
        try {
            const res = await fetch('/api/v1/coupons/bulk', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign_id: bulkCampaignId,
                    count: bulkCount,
                    valid_days: bulkValidDays,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'HTTP');
            }
            const codes = Array.isArray(data.coupons) ? data.coupons.map((c: any) => c.code) : [];
            setGeneratedCodes(codes);
            toast.success(t('admin.campaigns.bulkSuccess').replace('{{count}}', String(data.created || bulkCount)));
            void loadCoupons();
            void loadCampaigns();
        } catch (e: any) {
            toast.error(e.message || t('admin.campaigns.bulkFailed'));
        } finally {
            setBulkGenerating(false);
        }
    };

    // Remove single coupon
    const removeCoupon = async (id: number, code: string) => {
        setConfirm({
            title: t('admin.campaigns.deleteCouponTitle'),
            description: t('admin.campaigns.deleteCouponDesc').replace('{{code}}', code),
            onConfirm: () => {
                void (async () => {
                    try {
                        const res = await fetch(`/api/v1/coupons/${id}`, {
                            method: 'DELETE',
                            headers: getAuthHeaders(),
                        });
                        if (!res.ok) throw new Error('x');
                        toast.success(t('admin.campaigns.couponDeleted'));
                        void loadCoupons();
                    } catch {
                        toast.error(t('admin.campaigns.couponDeleteError'));
                    }
                })();
            },
        });
    };

    // Copy bulk generated codes to clipboard
    const copyToClipboard = () => {
        if (generatedCodes.length === 0) return;
        const text = generatedCodes.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            toast.success(t('admin.campaigns.copiedToast'));
            setTimeout(() => setCopied(false), 2000);
        });
    };

    // Filtering coupons in client for search bar
    const filteredCoupons = coupons.filter(c => {
        const query = couponsSearch.trim().toLowerCase();
        if (!query) return true;
        const codeMatch = c.code.toLowerCase().includes(query);
        const emailMatch = c.email?.toLowerCase().includes(query);
        const phoneMatch = c.phone?.toLowerCase().includes(query);
        const custMatch = c.customer_name?.toLowerCase().includes(query);
        return codeMatch || emailMatch || phoneMatch || custMatch;
    });

    const getDiscountLabel = (type: string, value: number, itemId?: number | null) => {
        switch (type) {
            case 'percent':
                return t('admin.campaigns.discountPercentLabel').replace('{{value}}', String(value));
            case 'fixed':
                return t('admin.campaigns.discountFixedLabel').replace('{{value}}', String(value));
            case 'free_delivery':
                return t('admin.campaigns.discountFreeDeliveryLabel');
            case 'free_item': {
                const prod = products.find(p => p.id === itemId);
                const name = prod?.displayName || prod?.name || `#${itemId}`;
                return t('admin.campaigns.discountFreeItemLabel').replace('{{name}}', name);
            }
            default:
                return `%${value}`;
        }
    };

    const couponFilters = useMemo(() => [
        { k: 'all' as const, label: t('admin.campaigns.filter.all') },
        { k: 'active' as const, label: t('admin.campaigns.filter.active') },
        { k: 'depleted' as const, label: t('admin.campaigns.filter.depleted') },
        { k: 'expired' as const, label: t('admin.campaigns.filter.expired') },
    ], [t]);

    return (
        <div className="flex-1 overflow-auto bg-[#020617] p-6 text-slate-100 font-sans">
            <div className="mx-auto max-w-5xl space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-b border-white/5 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white italic uppercase">
                            {t('admin.campaigns.title')}
                        </h1>
                        <p className="mt-1.5 text-sm text-slate-500 font-medium">
                            {t('admin.campaigns.subtitle')}
                        </p>
                    </div>
                    
                    {/* Tab Buttons */}
                    <div className="flex bg-[#0f172a]/65 p-1 rounded-2xl border border-white/5 select-none self-start md:self-auto backdrop-blur-md relative">
                        <button
                            type="button"
                            onClick={() => setActiveTab('campaigns')}
                            className={`relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap select-none border cursor-pointer transition-all duration-300 group ${
                                activeTab === 'campaigns' 
                                    ? 'bg-emerald-600/10 border-emerald-500/35 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.08)]' 
                                    : 'bg-white/[0.01] border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] hover:border-white/5'
                            }`}
                        >
                            <FiPercent className={`w-3.5 h-3.5 transition-all duration-300 ${activeTab === 'campaigns' ? 'scale-110 text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                            <span>{t('admin.campaigns.tab.campaigns')}</span>
                            {activeTab === 'campaigns' && (
                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('coupons')}
                            className={`relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap select-none border cursor-pointer transition-all duration-300 group ${
                                activeTab === 'coupons' 
                                    ? 'bg-emerald-600/10 border-emerald-500/35 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.08)]' 
                                    : 'bg-white/[0.01] border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] hover:border-white/5'
                            }`}
                        >
                            <FiTag className={`w-3.5 h-3.5 transition-all duration-300 ${activeTab === 'coupons' ? 'scale-110 text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                            <span>{t('admin.campaigns.tab.coupons')}</span>
                            {activeTab === 'coupons' && (
                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse" />
                            )}
                        </button>
                    </div>
                </div>

                {activeTab === 'campaigns' ? (
                    /* ─────────────────────────────────────────────────────────────
                       TAB: KAMPANYALAR
                       ───────────────────────────────────────────────────────────── */
                    <div className="space-y-8 animate-fadeIn">
                        {/* New Campaign Form Card */}
                        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-2xl shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full -ml-16 -mt-16 pointer-events-none" />
                            <h2 className="mb-6 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                                <FiPlus className="text-emerald-500" /> {t('admin.campaigns.newCampaign')}
                            </h2>
                            
                            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.fieldName')}
                                    <input
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                        value={form.name}
                                        placeholder={t('admin.campaigns.namePlaceholder')}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    />
                                </label>
                                
                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.fieldDiscountType')}
                                    <select
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                        value={form.discount_type}
                                        onChange={(e) => {
                                            const val = e.target.value as any;
                                            setForm(f => ({ ...f, discount_type: val, discount_value: val === 'percent' ? 10 : val === 'fixed' ? 5 : 0 }));
                                        }}
                                    >
                                        <option value="percent">{t('admin.campaigns.discountPercent')}</option>
                                        <option value="fixed">{t('admin.campaigns.discountFixed')}</option>
                                        <option value="free_item">{t('admin.campaigns.discountFreeItem')}</option>
                                        <option value="free_delivery">{t('admin.campaigns.discountFreeDelivery')}</option>
                                    </select>
                                </label>

                                {form.discount_type === 'percent' || form.discount_type === 'fixed' ? (
                                    <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                        {form.discount_type === 'percent' ? t('admin.campaigns.fieldPercentValue') : t('admin.campaigns.fieldAmountValue')}
                                        <input
                                            type="number"
                                            min={1}
                                            max={form.discount_type === 'percent' ? 100 : 10000}
                                            className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                            value={form.discount_value}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))
                                            }
                                        />
                                    </label>
                                ) : form.discount_type === 'free_item' ? (
                                    <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                        {t('admin.campaigns.fieldFreeProduct')}
                                        <select
                                            className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                            value={form.discount_item_id}
                                            onChange={(e) => setForm(f => ({ ...f, discount_item_id: e.target.value ? Number(e.target.value) : '' }))}
                                        >
                                            <option value="">{t('admin.campaigns.selectProduct')}</option>
                                            {products.map(p => (
                                                <option key={p.id} value={p.id}>{p.displayName || p.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : (
                                    <div className="hidden lg:block" />
                                )}
                                
                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.fieldStart')}
                                    <input
                                        type="date"
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                        value={form.start}
                                        onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                                    />
                                </label>
                                
                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.fieldEnd')}
                                    <input
                                        type="date"
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                        value={form.end}
                                        onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                                    />
                                </label>
                                
                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.fieldTarget')}
                                    <select
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
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
                            </div>

                            <div className="mt-5 grid gap-5 md:grid-cols-2">
                                {targetMode === 'category' ? (
                                    <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                        {t('admin.campaigns.fieldCategory')}
                                        <select
                                            className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
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
                                    <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                        {t('admin.campaigns.fieldProduct')}
                                        <select
                                            className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
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
                                ) : null}
                            </div>

                            <div className="mt-5 space-y-3">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                    <FiSliders className="text-emerald-500" /> {t('admin.campaigns.fieldOrderTypes')}
                                </div>
                                <div className="flex flex-wrap gap-5 text-sm font-bold text-slate-300 bg-black/25 p-4 rounded-2xl border border-white/5">
                                    {[
                                        { k: 'delivery', label: t('admin.campaigns.orderTypeDelivery') },
                                        { k: 'takeaway', label: t('admin.campaigns.orderTypeTakeaway') },
                                        { k: 'dine_in', label: t('admin.campaigns.orderTypeDineIn') },
                                    ].map((x) => {
                                        const checked = orderTypes.includes(x.k);
                                        return (
                                            <label key={x.k} className="inline-flex items-center gap-2.5 cursor-pointer hover:text-white transition-all select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    className="w-4.5 h-4.5 rounded border-white/10 accent-emerald-500 cursor-pointer"
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
                                <div className="text-[11px] text-slate-500 italic">
                                    {t('admin.campaigns.orderTypesHint')}
                                </div>
                            </div>

                            {/* Optional: Immediately bind coupons to selected customers */}
                            <div className="mt-6 rounded-2xl border border-white/5 bg-black/25 p-5">
                                <label className="flex items-center justify-between gap-4 cursor-pointer">
                                    <div className="space-y-1">
                                        <div className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
                                            <FiUsers className="text-emerald-500" /> {t('admin.campaigns.couponSectionTitle')}
                                        </div>
                                        <div className="text-xs text-slate-500">{t('admin.campaigns.couponSectionHint')}</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={couponForCustomers}
                                        className="w-5 h-5 rounded border-white/10 accent-emerald-500 cursor-pointer shrink-0"
                                        onChange={(e) => setCouponForCustomers(e.target.checked)}
                                    />
                                </label>

                                {couponForCustomers && (
                                    <div className="mt-5 space-y-4 animate-slideDown">
                                        <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                            {t('admin.campaigns.customerSearch')}
                                            <input
                                                className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                                value={customerQuery}
                                                onChange={(e) => setCustomerQuery(e.target.value)}
                                                placeholder={t('admin.campaigns.customerSearchPh')}
                                            />
                                        </label>

                                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                                                    {t('admin.campaigns.customerList')}
                                                </div>
                                                <div className="text-xs font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                                                    {t('admin.campaigns.selectedLabel')}: {selectedCustomerIds.length}
                                                </div>
                                            </div>
                                            
                                            {customerSearching ? (
                                                <div className="py-8 text-center text-slate-500 text-sm">
                                                    <FiRefreshCw className="animate-spin text-emerald-500 inline-block mr-2" />
                                                    {t('admin.campaigns.customersLoading')}
                                                </div>
                                            ) : customerResults.length === 0 ? (
                                                <div className="py-8 text-center text-slate-500 text-sm">
                                                    {t('admin.campaigns.customersEmpty')}
                                                </div>
                                            ) : (
                                                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
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
                                                                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                                                                    checked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-white/[0.04] border border-transparent'
                                                                }`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-sm font-bold text-white">{title}</div>
                                                                    {meta ? (
                                                                        <div className="truncate text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{meta}</div>
                                                                    ) : null}
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    className="w-4.5 h-4.5 rounded border-white/10 accent-emerald-500"
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
                                className="mt-6 w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                <FiTag size={16} /> {t('admin.campaigns.createBtn')}
                            </button>
                        </section>

                        {/* Existing Campaigns List Table */}
                        <section className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden shadow-xl">
                            <div className="border-b border-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">
                                {t('admin.campaigns.listTitle')}
                            </div>
                            {loading ? (
                                <div className="p-12 text-center text-slate-500">
                                    <FiRefreshCw className="animate-spin text-emerald-500 inline-block mr-2" />
                                    {t('admin.campaigns.loading')}
                                </div>
                            ) : rows.length === 0 ? (
                                <div className="p-12 text-center text-slate-500">{t('admin.campaigns.empty')}</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-white/[0.01] text-[10px] font-black uppercase tracking-widest text-slate-500 select-none">
                                                <th className="px-6 py-4">{t('admin.campaigns.colName')}</th>
                                                <th className="px-6 py-4">{t('admin.campaigns.colDiscountType')}</th>
                                                <th className="px-6 py-4">{t('admin.campaigns.colDiscount')}</th>
                                                <th className="px-6 py-4">{t('admin.campaigns.colPeriod')}</th>
                                                <th className="px-6 py-4 w-20"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((c) => (
                                                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 font-bold text-white text-sm">{c.name}</td>
                                                    <td className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">
                                                        {c.discount_type === 'percent' && <span className="flex items-center gap-1.5 text-emerald-400"><FiPercent size={12} /> {t('admin.campaigns.typePercent')}</span>}
                                                        {c.discount_type === 'fixed' && <span className="flex items-center gap-1.5 text-amber-400"><FiTag size={12} /> {t('admin.campaigns.typeFixed')}</span>}
                                                        {c.discount_type === 'free_item' && <span className="flex items-center gap-1.5 text-rose-400"><FiGift size={12} /> {t('admin.campaigns.typeFreeItem')}</span>}
                                                        {c.discount_type === 'free_delivery' && <span className="flex items-center gap-1.5 text-sky-400"><FiTruck size={12} /> {t('admin.campaigns.typeFreeDelivery')}</span>}
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-sm text-slate-200">
                                                        {getDiscountLabel(c.discount_type, c.discount_value, c.discount_item_id)}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-bold text-slate-400">
                                                        {String(c.start_date).slice(0, 10)} ➔ {String(c.end_date).slice(0, 10)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => void removeCampaign(c.id)}
                                                            className="rounded-xl p-2.5 text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all"
                                                            title={t('admin.campaigns.delete')}
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
                    </div>
                ) : (
                    /* ─────────────────────────────────────────────────────────────
                       TAB: KUPON KODLARI
                       ───────────────────────────────────────────────────────────── */
                    <div className="space-y-8 animate-fadeIn">
                        {/* Bulk Generate Coupons Card */}
                        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-2xl shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full -ml-16 -mt-16 pointer-events-none" />
                            <h2 className="mb-6 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
                                <FiGift className="text-amber-500" /> {t('admin.campaigns.bulkTitle')}
                            </h2>

                            <div className="grid gap-5 md:grid-cols-3">
                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.bulkSelectCampaign')}
                                    <select
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-amber-500 focus:outline-none transition-all"
                                        value={bulkCampaignId}
                                        onChange={(e) => setBulkCampaignId(e.target.value ? Number(e.target.value) : '')}
                                    >
                                        <option value="">{t('admin.campaigns.bulkSelectPh')}</option>
                                        {rows.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.bulkCount')}
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-amber-500 focus:outline-none transition-all"
                                        value={bulkCount}
                                        onChange={(e) => setBulkCount(Math.max(1, Number(e.target.value) || 1))}
                                    />
                                </label>

                                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.campaigns.bulkValidDays')}
                                    <input
                                        type="number"
                                        min={1}
                                        max={365}
                                        className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-white text-sm focus:border-amber-500 focus:outline-none transition-all"
                                        value={bulkValidDays}
                                        onChange={(e) => setBulkValidDays(Math.max(1, Number(e.target.value) || 1))}
                                    />
                                </label>
                            </div>

                            <button
                                type="button"
                                disabled={bulkGenerating}
                                onClick={() => void generateBulkCoupons()}
                                className="mt-6 w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-500 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                <FiGift size={16} /> {t('admin.campaigns.bulkGenerateBtn')}
                            </button>

                            {/* Display generated codes immediately with copy option */}
                            {generatedCodes.length > 0 && (
                                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 animate-slideDown">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-xs font-black uppercase tracking-widest text-amber-300">
                                            {t('admin.campaigns.generatedCodes').replace('{{count}}', String(generatedCodes.length))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={copyToClipboard}
                                            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/5 text-xs font-bold text-white px-3 py-1.5 rounded-xl transition-all"
                                        >
                                            {copied ? <FiCheck className="text-emerald-500 animate-pulse" /> : <FiCopy />}
                                            {copied ? t('admin.campaigns.copied') : t('admin.campaigns.copyAll')}
                                        </button>
                                    </div>
                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 max-h-36 overflow-y-auto select-all font-mono text-sm leading-relaxed tracking-wider text-amber-200">
                                        {generatedCodes.join(', ')}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Search and Filters for Coupons */}
                        <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white/[0.02] border border-white/10 p-5 rounded-3xl shadow-lg">
                            <div className="flex-1 relative">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    className="w-full pl-11 pr-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-white placeholder-slate-500 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                                    placeholder={t('admin.campaigns.couponsSearchPh')}
                                    value={couponsSearch}
                                    onChange={(e) => setCouponsSearch(e.target.value)}
                                />
                            </div>

                            {/* Status Filter buttons */}
                            <div className="flex gap-1.5 self-start md:self-auto bg-black/40 p-1 rounded-2xl border border-white/5 shrink-0">
                                {couponFilters.map(st => (
                                    <button
                                        key={st.k}
                                        type="button"
                                        onClick={() => setCouponsFilterStatus(st.k as any)}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                                            couponsFilterStatus === st.k 
                                                ? 'bg-slate-700 text-white shadow-sm' 
                                                : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {st.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Coupons Table List */}
                        <section className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden shadow-xl">
                            <div className="border-b border-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">
                                {t('admin.campaigns.couponsListTitle').replace('{{count}}', String(filteredCoupons.length))}
                            </div>
                            
                            {couponsLoading ? (
                                <div className="p-12 text-center text-slate-500">
                                    <FiRefreshCw className="animate-spin text-emerald-500 inline-block mr-2" />
                                    {t('admin.campaigns.loading')}
                                </div>
                            ) : filteredCoupons.length === 0 ? (
                                <div className="p-12 text-center text-slate-500">{t('admin.campaigns.couponsNoMatch')}</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-white/[0.01] text-[10px] font-black uppercase tracking-widest text-slate-500 select-none">
                                                <th className="px-6 py-4">{t('admin.campaigns.col.code')}</th>
                                                <th className="px-6 py-4">{t('admin.campaigns.col.discountDef')}</th>
                                                <th className="px-6 py-4">{t('admin.campaigns.col.customer')}</th>
                                                <th className="px-6 py-4">{t('admin.campaigns.col.expiry')}</th>
                                                <th className="px-6 py-4 text-center">{t('admin.campaigns.col.status')}</th>
                                                <th className="px-6 py-4 w-20"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCoupons.map((c) => {
                                                const campaignName = rows.find(r => r.id === c.campaign_id)?.name || t('admin.campaigns.personalCoupon');
                                                
                                                // Expiry Check in Client
                                                const isExpired = new Date(c.valid_until) < new Date();
                                                const isUsed = c.status === 'depleted';
                                                
                                                let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                                                let badgeLabel = t('admin.campaigns.status.active');
                                                
                                                if (isUsed) {
                                                    badgeColor = 'bg-slate-500/10 text-slate-400 border-slate-500/10';
                                                    badgeLabel = t('admin.campaigns.status.depleted');
                                                } else if (isExpired || c.status === 'expired') {
                                                    badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                                                    badgeLabel = t('admin.campaigns.status.expired');
                                                }

                                                const custMeta = c.customer_name 
                                                    ? c.customer_name 
                                                    : (c.phone || c.email || '-');

                                                return (
                                                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-4 font-mono font-black text-amber-300 text-sm tracking-widest select-all">
                                                            {c.code}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="font-bold text-white text-xs">{getDiscountLabel(c.discount_type, c.discount_value)}</div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 truncate max-w-[150px]">{campaignName}</div>
                                                        </td>
                                                        <td className="px-6 py-4 text-xs font-bold text-slate-300">
                                                            {custMeta}
                                                        </td>
                                                        <td className="px-6 py-4 text-xs font-bold text-slate-400">
                                                            {String(c.valid_until).slice(0, 10)}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${badgeColor}`}>
                                                                {badgeLabel}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <button
                                                                type="button"
                                                                onClick={() => void removeCoupon(c.id, c.code)}
                                                                className="rounded-xl p-2.5 text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all"
                                                                title={t('admin.campaigns.deleteCoupon')}
                                                            >
                                                                <FiTrash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {/* Modern Confirm Modal */}
                <ModernConfirmModal
                    isOpen={!!confirm}
                    onClose={() => setConfirm(null)}
                    title={confirm?.title || ''}
                    description={confirm?.description || ''}
                    confirmText={t('admin.campaigns.confirmDelete')}
                    cancelText={t('admin.campaigns.cancel')}
                    type="danger"
                    onConfirm={() => confirm?.onConfirm()}
                />
            </div>
        </div>
    );
};
