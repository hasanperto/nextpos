import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit, FiTrash2, FiRefreshCcw, FiLayers, FiTag, FiShoppingBag, FiSearch, FiCopy } from 'react-icons/fi';
import * as FaIcons from 'react-icons/fa';

import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';

type AdminProduct = {
    id: number;
    category_id: number;
    name: string;
    description: string | null;
    base_price: string;
    price_takeaway?: string;
    price_delivery?: string;
    image_url: string | null;
    is_active: number | boolean;
    prep_time_min?: number;
    allergens?: string | null;
    translations?: Record<string, { name?: string; description?: string }>;
};

type AdminCategory = {
    id: number;
    name: string;
    icon?: string;
    sort_order?: number;
    is_active?: boolean;
    kitchen_station?: string;
};

type ModifierOpt = { id: number; name: string };

type Tab = 'products' | 'categories' | 'bulk';

const ICON_OPTIONS = [
    'Utensils', 'PizzaSlice', 'Hamburger', 'Coffee', 'IceCream',
    'Beer', 'WineGlass', 'Leaf', 'Fish', 'DrumstickBite',
    'AppleAlt', 'Cookie', 'Egg', 'BreadSlice', 'Cheese',
    'Carrot', 'Flask', 'GlassMartini', 'Hotdog', 'CandyCane',
    'Lemon', 'MugHot', 'PepperHot', 'Seedling', 'Cocktail'
];

const CategoryIcon = ({ iconName, className }: { iconName?: string; className?: string }) => {
    const name = !iconName ? 'FaUtensils' : iconName.startsWith('Fa') ? iconName : `Fa${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`;
    const IconComponent = (FaIcons as any)[name] || FaIcons.FaUtensils;
    return <IconComponent className={className} />;
};


export const AdminMenu: React.FC = () => {
    const { logout, getAuthHeaders } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const currency = settings?.currency || '€';

    const [tab, setTab] = useState<Tab>('products');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [categories, setCategories] = useState<AdminCategory[]>([]);
    const [modifiers, setModifiers] = useState<ModifierOpt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [confirm, setConfirm] = useState<null | { title: string; description: string; confirmText: string; type: 'danger' | 'warning' | 'info'; onConfirm: () => void }>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
    const [formData, setFormData] = useState({
        category_id: '',
        name: '',
        description: '',
        base_price: '',
        price_takeaway: '',
        price_delivery: '',
        image_url: '',
        is_active: true,
        prep_time_min: '15',
        allergens: '',
        name_de: '',
        name_tr: '',
        name_en: '',
    });

    const [variantModal, setVariantModal] = useState(false);
    const [variantPid, setVariantPid] = useState<number | null>(null);
    const [variants, setVariants] = useState<{ id: number; name: string; price: string }[]>([]);
    const [newVar, setNewVar] = useState({ name: '', price: '' });
    const [copyVarModal, setCopyVarModal] = useState(false);
    const [copyVarTarget, setCopyVarTarget] = useState<'category' | 'specific'>('category');
    const [copyVarSel, setCopyVarSel] = useState<number[]>([]);

    const [modModal, setModModal] = useState(false);
    const [modPid, setModPid] = useState<number | null>(null);
    const [modSel, setModSel] = useState<number[]>([]);
    const [newMod, setNewMod] = useState({ name: '', price: '' });
    const [copyModModal, setCopyModModal] = useState(false);
    const [copyModTarget, setCopyModTarget] = useState<'category' | 'specific'>('category');
    const [copyModSel, setCopyModSel] = useState<number[]>([]);

    const [catModal, setCatModal] = useState(false);
    const [catForm, setCatForm] = useState({
        name: '',
        icon: 'utensils',
        sort_order: '0',
        kitchen_station: 'hot' as 'hot' | 'bar' | 'cold',
    });
    const [editingCat, setEditingCat] = useState<AdminCategory | null>(null);

    const [bulkSel, setBulkSel] = useState<number[]>([]);
    const [bulkMode, setBulkMode] = useState<'percent' | 'fixed' | 'percent-of-base'>('percent');
    const [bulkVal, setBulkVal] = useState('5');
    const [bulkTargets, setBulkTargets] = useState<string[]>(['base', 'takeaway', 'delivery']);
    const [bulkCatFilter, setBulkCatFilter] = useState<number | 'all'>('all');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const headers = getAuthHeaders();
            const [catRes, prodRes, modRes] = await Promise.all([
                fetch('/api/v1/menu/admin/categories', { headers }),
                fetch('/api/v1/menu/admin/products', { headers }),
                fetch('/api/v1/menu/modifiers', { headers }),
            ]);
            if (catRes.status === 401 || prodRes.status === 401) {
                logout();
                return;
            }
            const catData = await catRes.json();
            const prodData = await prodRes.json();
            const modData = modRes.ok ? await modRes.json() : [];
            setCategories(Array.isArray(catData) ? catData : []);
            setProducts(Array.isArray(prodData) ? prodData : []);
            setModifiers(Array.isArray(modData) ? modData.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })) : []);
        } catch (error) {
            console.error('Data fetch error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        void fetchSettings();
    }, []);

    const buildTranslations = () => {
        const t: Record<string, { name: string }> = {};
        if (formData.name_de) t.de = { name: formData.name_de };
        if (formData.name_tr) t.tr = { name: formData.name_tr };
        if (formData.name_en) t.en = { name: formData.name_en };
        return Object.keys(t).length ? t : undefined;
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
            const translations = buildTranslations();
            const payload: Record<string, unknown> = {
                ...formData,
                category_id: Number(formData.category_id),
                base_price: Number(formData.base_price),
                price_takeaway: Number(formData.price_takeaway),
                price_delivery: Number(formData.price_delivery),
                prep_time_min: Number(formData.prep_time_min) || 15,
                allergens: formData.allergens || null,
            };
            if (translations) payload.translations = translations;

            const url = editingProduct
                ? `/api/v1/menu/admin/products/${editingProduct.id}`
                : '/api/v1/menu/admin/products';
            const method = editingProduct ? 'PUT' : 'POST';

            const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });

            if (res.ok) {
                setIsModalOpen(false);
                fetchData();
            } else {
                const j = await res.json().catch(() => ({}));
                toast.error((j as { error?: string }).error || 'İşlem başarısız. Lütfen tekrar deneyin.');
            }
        } catch (error) {
            console.error(error);
            toast.error('Sunucuya bağlanılamadı. İnternetinizi kontrol edip tekrar deneyin.');
        }
    };

    const handleEdit = (prod: AdminProduct) => {
        setEditingProduct(prod);
        const tr = prod.translations || {};
        setFormData({
            category_id: prod.category_id.toString(),
            name: prod.name,
            description: prod.description || '',
            base_price: prod.base_price,
            price_takeaway: prod.price_takeaway || prod.base_price,
            price_delivery: prod.price_delivery || prod.base_price,
            image_url: prod.image_url || '',
            is_active: prod.is_active === 1 || prod.is_active === true,
            prep_time_min: String(prod.prep_time_min ?? 15),
            allergens: prod.allergens || '',
            name_de: tr.de?.name || '',
            name_tr: tr.tr?.name || '',
            name_en: tr.en?.name || '',
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        setConfirm({
            title: 'Ürünü sil',
            description: 'Bu ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
            confirmText: 'SİL',
            type: 'danger',
            onConfirm: () => {
                void (async () => {
                    try {
                        const res = await fetch(`/api/v1/menu/admin/products/${id}`, {
                            method: 'DELETE',
                            headers: getAuthHeaders(),
                        });
                        if (!res.ok) {
                            const j = await res.json().catch(() => ({}));
                            toast.error((j as { error?: string }).error || 'Silme işlemi başarısız. Lütfen tekrar deneyin.');
                            return;
                        }
                        toast.success('Ürün silindi');
                        fetchData();
                    } catch {
                        toast.error('Sunucu bağlantısı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.');
                    }
                })();
            },
        });
    };

    const openNewProductModal = () => {
        setEditingProduct(null);
        setFormData({
            category_id: categories.length > 0 ? categories[0].id.toString() : '',
            name: '',
            description: '',
            base_price: '',
            price_takeaway: '',
            price_delivery: '',
            image_url: '',
            is_active: true,
            prep_time_min: '15',
            allergens: '',
            name_de: '',
            name_tr: '',
            name_en: '',
        });
        setIsModalOpen(true);
    };

    const saveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editingCat
            ? `/api/v1/menu/admin/categories/${editingCat.id}`
            : '/api/v1/menu/admin/categories';
        const method = editingCat ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: catForm.name,
                icon: catForm.icon,
                sort_order: Number(catForm.sort_order),
                kitchen_station: catForm.kitchen_station,
            }),
        });
        if (res.ok) {
            setCatModal(false);
            setEditingCat(null);
            fetchData();
        } else {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || 'Kategori kaydedilemedi. Lütfen tekrar deneyin.');
        }
    };

    const deleteCategory = async (id: number) => {
        setConfirm({
            title: 'Kategoriyi sil',
            description: 'Bu kategoriyi silmek istiyor musunuz? Bu işlem geri alınamaz.',
            confirmText: 'SİL',
            type: 'danger',
            onConfirm: () => {
                void (async () => {
                    const res = await fetch(`/api/v1/menu/admin/categories/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                        toast.success('Kategori silindi');
                        fetchData();
                        return;
                    }
                    const j = await res.json().catch(() => ({}));
                    toast.error((j as { error?: string }).error || 'Silinemedi. Lütfen tekrar deneyin.');
                })();
            },
        });
    };

    const runBulk = async () => {
        if (bulkSel.length === 0) {
            toast.error('Lütfen en az 1 ürün seçin.');
            return;
        }
        const res = await fetch('/api/v1/menu/admin/products/bulk-price', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_ids: bulkSel,
                mode: bulkMode,
                value: Number(bulkVal),
                targets: bulkTargets
            }),
        });
        if (res.ok) {
            setBulkSel([]);
            toast.success('Toplu güncelleme tamamlandı');
            fetchData();
        } else {
            const j = await res.json().catch(() => ({}));
            toast.error((j as { error?: string }).error || 'Toplu güncelleme başarısız');
        }
    };

    const loadVariants = useCallback(async (pid: number) => {
        const res = await fetch(`/api/v1/menu/admin/products/${pid}/variants`, {
            headers: getAuthHeaders(),
        });
        const data = res.ok ? await res.json() : [];
        setVariants(Array.isArray(data) ? data : []);
    }, [getAuthHeaders]);

    const openVariants = (pid: number) => {
        setVariantPid(pid);
        setVariantModal(true);
        void loadVariants(pid);
    };

    const addVariant = async () => {
        if (!variantPid || !newVar.name || !newVar.price) return;
        const res = await fetch(`/api/v1/menu/admin/products/${variantPid}/variants`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newVar.name, price: Number(newVar.price) }),
        });
        if (res.ok) {
            setNewVar({ name: '', price: '' });
            void loadVariants(variantPid);
        }
    };

    const openMods = async (pid: number) => {
        setModPid(pid);
        setModModal(true);
        const pres = await fetch(`/api/v1/menu/products/${pid}`, { headers: getAuthHeaders() });
        const p = pres.ok ? await pres.json() : null;
        const ids = (p?.modifiers || []).map((m: { id: number }) => m.id);
        setModSel(Array.isArray(ids) ? ids : []);
    };

    const saveMods = async () => {
        if (!modPid) return;
        const res = await fetch(`/api/v1/menu/admin/products/${modPid}/modifiers`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ modifier_ids: modSel }),
        });
        if (res.ok) {
            setModModal(false);
            fetchData();
        }
    };

    const qrPreview = async () => {
        const res = await fetch('/api/v1/tables', { headers: getAuthHeaders() });
        const t = res.ok ? await res.json() : [];
        const id = Array.isArray(t) && t[0]?.id ? t[0].id : '1';
        const opened = window.open(`/qr/${id}`, '_blank', 'noopener,noreferrer');
        if (!opened) {
            toast.error('QR kod açılamadı — tarayıcı açılır pencere engelini kaldırın', { icon: '🔒', duration: 6000 });
        }
    };

    const handleCopyVariants = async () => {
        if (!variantPid) return;
        const targetIds = copyVarTarget === 'category' 
            ? products.filter(p => p.category_id === products.find(src => src.id === variantPid)?.category_id && p.id !== variantPid).map(p => p.id)
            : copyVarSel;
            
        if (targetIds.length === 0) {
            toast.error('Hedef ürün seçilmedi. Lütfen en az 1 ürün seçin.');
            return;
        }

        try {
            const res = await fetch('/api/v1/menu/admin/products/copy-variants', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_pid: variantPid, target_pids: targetIds }),
            });
            if (res.ok) {
                toast.success('Varyantlar kopyalandı');
                setCopyVarModal(false);
            } else {
                const j = await res.json().catch(() => ({}));
                toast.error((j as { error?: string }).error || 'Kopyalama başarısız');
            }
        } catch (error) {
            console.error(error);
            toast.error('Kopyalama başarısız. Lütfen tekrar deneyin.');
        }
    };

    const addModifier = async () => {
        if (!newMod.name) return;
        try {
            const res = await fetch('/api/v1/menu/admin/modifiers', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: newMod.name, 
                    price: Number(newMod.price) || 0,
                    category: '0_Ekstralar' // Default category to show for all products
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setNewMod({ name: '', price: '' });
                // Tüm modifikatörleri tekrar çek
                const modRes = await fetch('/api/v1/menu/modifiers', { headers: getAuthHeaders() });
                const modData = modRes.ok ? await modRes.json() : [];
                setModifiers(Array.isArray(modData) ? modData.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })) : []);
                // Yeni modifikatörü mevcut seçime ekle
                if (data.id) setModSel([...modSel, data.id]);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleCopyModifiers = async () => {
        if (!modPid) return;
        const targetIds = copyModTarget === 'category' 
            ? products.filter(p => p.category_id === products.find(src => src.id === modPid)?.category_id && p.id !== modPid).map(p => p.id)
            : copyModSel;
            
        if (targetIds.length === 0) {
            toast.error('Hedef ürün seçilmedi. Lütfen en az 1 ürün seçin.');
            return;
        }

        try {
            const res = await fetch('/api/v1/menu/admin/products/copy-modifiers', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_pid: modPid, target_pids: targetIds }),
            });
            if (res.ok) {
                toast.success('Modifikatörler kopyalandı');
                setCopyModModal(false);
            } else {
                const j = await res.json().catch(() => ({}));
                toast.error((j as { error?: string }).error || 'Kopyalama başarısız');
            }
        } catch (error) {
            console.error(error);
            toast.error('Kopyalama başarısız. Lütfen tekrar deneyin.');
        }
    };

    const filteredProducts = products.filter((p) => {
        const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9] font-sans">
            <header className="h-20 bg-white shadow-sm flex flex-wrap items-center justify-between gap-4 px-8 z-10">
                <div className="flex items-center gap-6">
                    <h2 className="text-2xl font-bold text-slate-800">Menü yönetimi</h2>
                    {tab === 'products' && (
                        <div className="relative w-64">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Ürün veya açıklama ara..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
                        {(['products', 'categories', 'bulk'] as Tab[]).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTab(t)}
                                className={`rounded-md px-3 py-1.5 font-bold ${
                                    tab === t ? 'bg-white shadow text-blue-600' : 'text-slate-500'
                                }`}
                            >
                                {t === 'products' ? 'Ürünler' : t === 'categories' ? 'Kategoriler' : 'Toplu fiyat'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={fetchData}
                        className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                        title="Yenile"
                        aria-label="Yenile"
                    >
                        <FiRefreshCcw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={qrPreview}
                        className="text-sm font-bold text-violet-600 hover:underline"
                    >
                        QR önizleme
                    </button>
                    {tab === 'products' && (
                        <button
                            onClick={openNewProductModal}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md flex items-center gap-2"
                        >
                            <FiPlus size={18} /> Yeni ürün
                        </button>
                    )}
                    {tab === 'categories' && (
                        <button
                            onClick={() => {
                                setEditingCat(null);
                                setCatForm({ name: '', icon: 'utensils', sort_order: '0', kitchen_station: 'hot' });
                                setCatModal(true);
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                        >
                            <FiPlus /> Kategori
                        </button>
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                {tab === 'categories' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                                    <th className="p-4">ID</th>
                                    <th className="p-4">İKON</th>
                                    <th className="p-4">AD</th>
                                    <th className="p-4">SIRA</th>
                                    <th className="p-4">İSTASYON</th>
                                    <th className="p-4" />

                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((c) => (
                                    <tr key={c.id} className="border-b border-slate-100">
                                        <td className="p-4 font-mono text-sm">#{c.id}</td>
                                        <td className="p-4">
                                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                                                <CategoryIcon iconName={c.icon} className="text-xl" />
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold">{c.name}</td>

                                        <td className="p-4">{c.sort_order ?? 0}</td>
                                        <td className="p-4 text-xs font-bold uppercase text-slate-600">
                                            {c.kitchen_station === 'bar'
                                                ? 'Bar'
                                                : c.kitchen_station === 'cold'
                                                  ? 'Soğuk'
                                                  : 'Ana mutfak'}
                                        </td>
                                        <td className="p-4">
                                            <button
                                                type="button"
                                                className="text-blue-600 mr-3"
                                                onClick={() => {
                                                    setEditingCat(c);
                                                    setCatForm({
                                                        name: c.name,
                                                        icon: c.icon || 'utensils',
                                                        sort_order: String(c.sort_order ?? 0),
                                                        kitchen_station:
                                                            c.kitchen_station === 'bar' || c.kitchen_station === 'cold'
                                                                ? c.kitchen_station
                                                                : 'hot',
                                                    });
                                                    setCatModal(true);
                                                }}
                                            >
                                                Düzenle
                                            </button>
                                            <button
                                                type="button"
                                                className="text-red-500"
                                                onClick={() => deleteCategory(c.id)}
                                            >
                                                Sil
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'bulk' && (
                    <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-4 font-bold text-slate-800">Toplu fiyat</h3>
                        <p className="mb-4 text-sm text-slate-500">
                            Listeden ürün işaretleyin; yüzde veya sabit {currency} ekleyin.
                        </p>
                        <div className="flex gap-2 mb-4">
                            <select 
                                onChange={(e) => setBulkCatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="text-[11px] font-black uppercase tracking-tight bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={bulkCatFilter}
                            >
                                <option value="all">Tüm Kategoriler</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            
                            <button 
                                onClick={() => {
                                    const visiblePids = products
                                        .filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter)
                                        .map(p => p.id);
                                    setBulkSel(Array.from(new Set([...bulkSel, ...visiblePids])));
                                }}
                                className="text-[10px] font-black uppercase tracking-tighter bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                            >
                                Listeyi İşaretle
                            </button>
                            <button 
                                onClick={() => {
                                    const visiblePids = products
                                        .filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter)
                                        .map(p => p.id);
                                    setBulkSel(bulkSel.filter(id => !visiblePids.includes(id)));
                                }}
                                className="text-[10px] font-black uppercase tracking-tighter bg-slate-100 text-slate-500 px-3 py-1 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
                            >
                                İşareti Kaldır
                            </button>
                        </div>

                        <div className="mb-4 max-h-64 space-y-1 overflow-auto text-sm border border-slate-100 p-2 rounded-xl bg-slate-50/50 shadow-inner">
                            {products
                                .filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter)
                                .map((p) => (
                                <label key={p.id} className="flex cursor-pointer items-center gap-3 hover:bg-white p-2 rounded-lg transition-all group border border-transparent hover:border-slate-200 hover:shadow-sm">
                                    <input
                                        type="checkbox"
                                        checked={bulkSel.includes(p.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setBulkSel([...bulkSel, p.id]);
                                            else setBulkSel(bulkSel.filter((x) => x !== p.id));
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-slate-700 group-hover:text-blue-600 font-bold transition-colors">{p.name}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">Masa: {currency}{p.base_price}</span>
                                    </div>
                                </label>
                            ))}
                            {products.filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter).length === 0 && (
                                <div className="py-8 text-center text-slate-400 font-medium text-xs">Bu kategoride ürün bulunamadı.</div>
                            )}
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <span className="text-sm font-bold text-slate-700">Kullanılacak Fiyatlar</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            disabled={bulkMode === 'percent-of-base'}
                                            checked={bulkTargets.includes('base')}
                                            onChange={(e) => {
                                                if (e.target.checked) setBulkTargets([...bulkTargets, 'base']);
                                                else setBulkTargets(bulkTargets.filter(t => t !== 'base'));
                                            }}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className={`text-xs font-bold ${bulkMode === 'percent-of-base' ? 'text-slate-300' : 'text-slate-600'}`}>Masa</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={bulkTargets.includes('takeaway')}
                                            onChange={(e) => {
                                                if (e.target.checked) setBulkTargets([...bulkTargets, 'takeaway']);
                                                else setBulkTargets(bulkTargets.filter(t => t !== 'takeaway'));
                                            }}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs font-bold text-slate-600">Gel-Al</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={bulkTargets.includes('delivery')}
                                            onChange={(e) => {
                                                if (e.target.checked) setBulkTargets([...bulkTargets, 'delivery']);
                                                else setBulkTargets(bulkTargets.filter(t => t !== 'delivery'));
                                            }}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs font-bold text-slate-600">Paket</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    className="rounded-lg border border-slate-200 p-2.5 text-sm font-bold bg-slate-50"
                                    value={bulkMode}
                                    onChange={(e) => {
                                        const newMode = e.target.value as any;
                                        setBulkMode(newMode);
                                        // percent-of-base modunda base hedef olamaz
                                        if (newMode === 'percent-of-base') {
                                            setBulkTargets(bulkTargets.filter(t => t !== 'base'));
                                        }
                                    }}
                                >
                                    <option value="percent">Yüzde (%) Ekle/Çıkar</option>
                                    <option value="fixed">Sabit ({currency}) Ekle/Çıkar</option>
                                    <option value="percent-of-base">Masa fiyatına oranla (%)</option>
                                </select>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="w-24 rounded-lg border border-slate-200 p-2.5 text-sm font-bold"
                                    value={bulkVal}
                                    onChange={(e) => setBulkVal(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => void runBulk()}
                                    className="rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white shadow-lg hover:bg-blue-700 transition-all"
                                >
                                    Uygula
                                </button>
                            </div>

                            {bulkMode === 'percent-of-base' && (
                                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                                    <p className="mt-1 text-[11px] text-emerald-600 leading-relaxed font-bold">
                                        💡 İpucu: Artış için normal rakam (Örn: 10), indirim yapmak için başına eksi koyun (Örn: -10).
                                    </p>
                                    <p className="mt-2 text-[10px] text-slate-500 leading-relaxed italic">
                                        * "Masa fiyatına oranla" modunda Gel-Al/Paket fiyatları, Masa fiyatı üzerinden hesaplanır.
                                        * Diğer modlarda mevcut fiyatlar üzerinden artış/indirim yapılır.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'products' && (
                    <div className="space-y-6 shadow-sm p-2">
                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-3 overflow-x-auto pb-4 custom-scrollbar">
                            <button
                                onClick={() => setSelectedCategoryId('all')}
                                className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${
                                    selectedCategoryId === 'all' 
                                    ? 'bg-slate-800 text-white shadow-md scale-105' 
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                }`}
                            >
                                Tüm Menü
                            </button>
                            {categories.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedCategoryId(c.id)}
                                    className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
                                        selectedCategoryId === c.id 
                                        ? 'bg-sky-500 text-white shadow-md scale-105' 
                                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                    }`}
                                >
                                    <CategoryIcon iconName={c.icon} className={selectedCategoryId === c.id ? 'text-white' : 'text-slate-400'} />
                                    {c.name}
                                </button>
                            ))}
                        </div>

                        {/* Products Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 lg:grid-cols-3 gap-6 pb-8">
                            {isLoading ? (
                                <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
                                    <FiRefreshCcw className="animate-spin mb-4" size={32} />
                                    <span className="font-bold">Yükleniyor...</span>
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
                                    <FiShoppingBag className="mb-4 opacity-50" size={48} />
                                    <span className="font-bold text-lg">Sonuç bulunamadı</span>
                                </div>
                            ) : (
                                filteredProducts.map((prod) => (
                                    <div key={prod.id} className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:shadow-[0_8px_30px_-5px_rgba(6,81,237,0.15)] transition-all duration-300 border border-slate-200/60 overflow-hidden flex flex-col group relative">
                                        <div className="relative h-44 bg-slate-50 overflow-hidden flex-shrink-0">
                                            {prod.image_url ? (
                                                <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-300 group-hover:scale-105 transition-transform duration-700">
                                                    <FiShoppingBag size={56} className="opacity-40" />
                                                </div>
                                            )}
                                            {/* Top Overlay Gradients */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                            
                                            {/* Status Badge */}
                                            <div className="absolute top-3 left-3 flex gap-2">
                                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm backdrop-blur-md ${prod.is_active ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                                                    {prod.is_active ? 'Satışta' : 'Pasif'}
                                                </span>
                                            </div>

                                            {/* Action Badges */}
                                            <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-x-4 group-hover:translate-x-0">
                                                <button onClick={() => openVariants(prod.id)} className="w-8 h-8 flex items-center justify-center bg-white/95 hover:bg-white text-violet-600 rounded-lg shadow-lg backdrop-blur-sm transition-transform hover:scale-110" title="Boyutlar / Varyantlar">
                                                    <FiLayers size={14} />
                                                </button>
                                                <button onClick={() => void openMods(prod.id)} className="w-8 h-8 flex items-center justify-center bg-white/95 hover:bg-white text-amber-600 rounded-lg shadow-lg backdrop-blur-sm transition-transform hover:scale-110" title="Modifikatörler">
                                                    <FiTag size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="p-5 flex-1 flex flex-col z-10 bg-white">
                                            <div className="mb-1">
                                                <p className="text-[10px] font-black text-sky-500 uppercase tracking-wider mb-1">
                                                    {categories.find(c => c.id === prod.category_id)?.name || 'Kategorisiz'}
                                                </p>
                                                <h3 className="font-black text-slate-800 text-lg leading-tight line-clamp-1" title={prod.name}>{prod.name}</h3>
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 line-clamp-2 my-2 flex-1 leading-relaxed">
                                                {prod.description || 'Açıklama belirtilmemiş.'}
                                            </p>
                                            
                                            <div className="grid grid-cols-3 gap-1 mt-3 pt-3 border-t border-slate-100/80 bg-slate-50/50 rounded-xl p-2">
                                                <div className="text-center">
                                                    <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">Masa</p>
                                                    <p className="font-mono text-emerald-600 font-bold text-sm tracking-tight">{currency}{prod.base_price}</p>
                                                </div>
                                                <div className="text-center border-l border-slate-200">
                                                    <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">Gel-Al</p>
                                                    <p className="font-mono text-blue-600 font-bold text-sm tracking-tight">{currency}{prod.price_takeaway}</p>
                                                </div>
                                                <div className="text-center border-l border-slate-200">
                                                    <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">Paket</p>
                                                    <p className="font-mono text-purple-600 font-bold text-sm tracking-tight">{currency}{prod.price_delivery}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/30">
                                            <button onClick={() => handleEdit(prod)} className="p-3 text-xs font-black text-slate-500 hover:text-blue-600 hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-2 uppercase tracking-wide">
                                                <FiEdit size={14} /> Düzenle
                                            </button>
                                            <button onClick={() => handleDelete(prod.id)} className="p-3 text-xs font-black text-slate-500 hover:text-red-600 hover:bg-red-50/50 transition-colors border-l border-slate-100 flex items-center justify-center gap-2 uppercase tracking-wide">
                                                <FiTrash2 size={14} /> Sil
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <>
                    {/* Drawer Overlay */}
                    <div 
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] transition-opacity" 
                        onClick={() => setIsModalOpen(false)}
                    />
                    
                    {/* Off-Canvas Drawer Panel */}
                    <div className="fixed inset-y-0 right-0 z-[110] w-full max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">
                                    {editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün'}
                                </h3>
                                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                    {editingProduct ? 'Mevcut ürünü güncelle' : 'Menüye farklı bir lezzet kat'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 hover:border-slate-300 shadow-sm transition-all"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Ürün adı</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all font-bold text-slate-800"
                                        placeholder="Örn: Karışık Pizza"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Kategori</label>
                                    <select
                                        required
                                        value={formData.category_id}
                                        onChange={(e) =>
                                            setFormData({ ...formData, category_id: e.target.value })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all font-bold text-slate-800"
                                    >
                                        <option value="" disabled>Seçiniz</option>
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Açıklama</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({ ...formData, description: e.target.value })
                                        }
                                        rows={3}
                                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all font-medium text-sm text-slate-600 resize-none"
                                        placeholder="İçindekiler vb."
                                    />
                                </div>

                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-3">Satış Fiyatları ({currency})</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold text-emerald-600 mb-1 pl-1">Masa</p>
                                            <input
                                                required
                                                type="number"
                                                step="0.01"
                                                value={formData.base_price}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, base_price: e.target.value })
                                                }
                                                className="w-full border-t border-x-0 border-b-2 border-slate-200 bg-white p-2.5 rounded-lg font-mono font-bold text-emerald-700 outline-none focus:border-emerald-500 transition-colors shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-blue-600 mb-1 pl-1">Gel-al</p>
                                            <input
                                                required
                                                type="number"
                                                step="0.01"
                                                value={formData.price_takeaway}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, price_takeaway: e.target.value })
                                                }
                                                className="w-full border-t border-x-0 border-b-2 border-slate-200 bg-white p-2.5 rounded-lg font-mono font-bold text-blue-700 outline-none focus:border-blue-500 transition-colors shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-purple-600 mb-1 pl-1">Paket</p>
                                            <input
                                                required
                                                type="number"
                                                step="0.01"
                                                value={formData.price_delivery}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, price_delivery: e.target.value })
                                                }
                                                className="w-full border-t border-x-0 border-b-2 border-slate-200 bg-white p-2.5 rounded-lg font-mono font-bold text-purple-700 outline-none focus:border-purple-500 transition-colors shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Hazırlık Süresi (DK)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none font-bold text-slate-700 text-center"
                                            value={formData.prep_time_min}
                                            onChange={(e) =>
                                                setFormData({ ...formData, prep_time_min: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Alerjenler</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none font-medium text-sm text-slate-700"
                                            value={formData.allergens}
                                            onChange={(e) =>
                                                setFormData({ ...formData, allergens: e.target.value })
                                            }
                                            placeholder="Gluten, Süt vb."
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                                        Görsel URL
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.image_url}
                                        onChange={(e) =>
                                            setFormData({ ...formData, image_url: e.target.value })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:border-sky-500 font-mono text-xs text-slate-600"
                                        placeholder="https://.../pizza.jpg"
                                    />
                                </div>

                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Çeviri İsimleri (Opsiyonel)</p>
                                    </div>
                                    <div className="grid grid-cols-3 divide-x divide-slate-100">
                                        <div className="p-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-1 text-center">DE</p>
                                            <input
                                                className="w-full text-center outline-none bg-transparent text-sm font-bold text-slate-700"
                                                value={formData.name_de}
                                                onChange={(e) => setFormData({ ...formData, name_de: e.target.value })}
                                            />
                                        </div>
                                        <div className="p-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-1 text-center">TR</p>
                                            <input
                                                className="w-full text-center outline-none bg-transparent text-sm font-bold text-slate-700"
                                                value={formData.name_tr}
                                                onChange={(e) => setFormData({ ...formData, name_tr: e.target.value })}
                                            />
                                        </div>
                                        <div className="p-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-1 text-center">EN</p>
                                            <input
                                                className="w-full text-center outline-none bg-transparent text-sm font-bold text-slate-700"
                                                value={formData.name_en}
                                                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer select-none bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active}
                                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="sr-only"
                                            />
                                            <div className={`block w-12 h-7 rounded-full transition-colors ${formData.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${formData.is_active ? 'transform translate-x-5' : ''}`}></div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`font-black uppercase tracking-wider text-sm ${formData.is_active ? 'text-emerald-600' : 'text-slate-500'}`}>Satışta</span>
                                            <span className="text-[10px] text-slate-400">Menüde aktif olarak gösterilir</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-6 pb-2 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-3.5 flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold uppercase tracking-wider text-sm transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3.5 flex-[2] bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-wider text-sm shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                >
                                    {editingProduct ? 'Değişiklikleri Kaydet' : 'Ürünü Ekle'}
                                </button>
                            </div>
                        </form>
                    </div>
                </>
            )}

            {catModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <form
                        onSubmit={saveCategory}
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3 className="mb-4 font-bold">{editingCat ? 'Kategori düzenle' : 'Yeni kategori'}</h3>
                        <input
                            required
                            className="mb-3 w-full rounded border p-2"
                            placeholder="Ad"
                            value={catForm.name}
                            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                        />
                        <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                            Kategori İkonu
                        </label>
                        <div className="grid grid-cols-5 gap-2 mb-4 p-3 border border-slate-200 rounded-xl max-h-48 overflow-y-auto bg-slate-50">
                            {ICON_OPTIONS.map(iconName => (
                                <button
                                    key={iconName}
                                    type="button"
                                    onClick={() => setCatForm({ ...catForm, icon: iconName })}
                                    className={`p-3 rounded-xl border flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${
                                        catForm.icon === iconName 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 z-10' 
                                        : 'bg-white border-slate-100 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                                    }`}
                                    title={iconName}
                                >
                                    <CategoryIcon iconName={iconName} className="text-xl" />
                                </button>
                            ))}
                        </div>

                        <input
                            type="number"
                            className="mb-3 w-full rounded border p-2"
                            placeholder="Sıra"
                            value={catForm.sort_order}
                            onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })}
                        />
                        <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                            Mutfak istasyonu
                        </label>
                        <select
                            className="mb-4 w-full rounded border p-2"
                            value={catForm.kitchen_station}
                            onChange={(e) =>
                                setCatForm({
                                    ...catForm,
                                    kitchen_station: e.target.value as 'hot' | 'bar' | 'cold',
                                })
                            }
                        >
                            <option value="hot">Ana mutfak (sıcak)</option>
                            <option value="bar">Bar</option>
                            <option value="cold">Soğuk</option>
                        </select>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCatModal(false)} className="px-4 py-2">
                                İptal
                            </button>
                            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white">
                                Kaydet
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {variantModal && variantPid && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <h3 className="mb-4 font-bold">Boyutlar (varyant)</h3>
                        <ul className="mb-4 max-h-40 space-y-1 overflow-auto text-sm">
                            {variants.map((v) => (
                                <li key={v.id} className="flex justify-between border-b py-1">
                                    <span>{v.name}</span>
                                    <span className="font-mono">{currency}{v.price}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <input
                                placeholder="Ad"
                                className="flex-1 rounded border p-2"
                                value={newVar.name}
                                onChange={(e) => setNewVar({ ...newVar, name: e.target.value })}
                            />
                            <input
                                placeholder={currency}
                                type="number"
                                className="w-24 rounded border p-2"
                                value={newVar.price}
                                onChange={(e) => setNewVar({ ...newVar, price: e.target.value })}
                            />
                            <button
                                type="button"
                                onClick={() => void addVariant()}
                                className="rounded bg-blue-600 px-3 text-white"
                            >
                                Ekle
                            </button>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setCopyVarModal(true)}
                                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 py-2 border border-blue-200 rounded-lg bg-blue-50/50 transition-colors"
                            >
                                <FiCopy size={16} /> Diğer ürünlere kopyala
                            </button>
                        </div>
                        <button
                            type="button"
                            className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-600 transition-colors"
                            onClick={() => setVariantModal(false)}
                        >
                            Kapat
                        </button>
                    </div>
                </div>
            )}

            {copyVarModal && variantPid && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                        <h3 className="text-xl font-black text-slate-800 mb-2">Varyantları Kopyala</h3>
                        <p className="text-sm text-slate-500 mb-6 font-medium">Bu ürünün boyut ve varyantlarını diğer ürünlere aktarın.</p>
                        
                        <div className="space-y-4 mb-6">
                            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                <input 
                                    type="radio" 
                                    name="copyMode" 
                                    checked={copyVarTarget === 'category'} 
                                    onChange={() => setCopyVarTarget('category')}
                                />
                                <div>
                                    <span className="block font-bold text-sm text-slate-800">Aynı Kategoridekiler</span>
                                    <span className="text-[11px] text-slate-500">Bu ürünle aynı kategorideki tüm ürünlere kopyalar.</span>
                                </div>
                            </label>
                            
                            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                <input 
                                    type="radio" 
                                    name="copyMode" 
                                    checked={copyVarTarget === 'specific'} 
                                    onChange={() => {
                                        setCopyVarTarget('specific');
                                        setCopyVarSel([]);
                                    }}
                                />
                                <div>
                                    <span className="block font-bold text-sm text-slate-800">Belirli Ürünler</span>
                                    <span className="text-[11px] text-slate-500">Listeden seçeceğiniz belirli ürünlere kopyalar.</span>
                                </div>
                            </label>
                        </div>

                        {copyVarTarget === 'specific' && (
                            <div className="mb-6 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
                                {products.filter(p => p.id !== variantPid).map(p => (
                                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="checkbox"
                                            checked={copyVarSel.includes(p.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setCopyVarSel([...copyVarSel, p.id]);
                                                else setCopyVarSel(copyVarSel.filter(id => id !== p.id));
                                            }}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-bold text-slate-600">{p.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCopyVarModal(false)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCopyVariants()}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg transition-all"
                            >
                                Kopyalamayı Başlat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modModal && modPid && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-lg">Modifikatör seçimi</h3>
                            <button onClick={() => setModModal(false)} className="text-slate-400">✕</button>
                        </div>
                        
                        {/* New Modifier Input */}
                        <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-wider">Hızlı Yeni Ekle</p>
                            <div className="flex gap-2">
                                <input
                                    placeholder="Ekstra Malzeme..."
                                    className="flex-1 rounded-lg border border-slate-200 p-2 text-sm font-bold"
                                    value={newMod.name}
                                    onChange={(e) => setNewMod({ ...newMod, name: e.target.value })}
                                />
                                <input
                                    placeholder={currency}
                                    type="number"
                                    step="0.1"
                                    className="w-20 rounded-lg border border-slate-200 p-2 text-sm font-mono font-bold"
                                    value={newMod.price}
                                    onChange={(e) => setNewMod({ ...newMod, price: e.target.value })}
                                />
                                <button
                                    type="button"
                                    onClick={() => void addModifier()}
                                    className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-sm shadow-sm"
                                >
                                    Ekle
                                </button>
                            </div>
                        </div>

                        <div className="mb-4 max-h-48 space-y-2 overflow-auto custom-scrollbar">
                            {modifiers.map((m) => (
                                <label key={m.id} className="flex cursor-pointer items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                                    <input
                                        type="checkbox"
                                        checked={modSel.includes(m.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setModSel([...modSel, m.id]);
                                            else setModSel(modSel.filter((x) => x !== m.id));
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-bold text-slate-700">{m.name}</span>
                                    {/* Backend'den gelirse fiyatı gösterelim */}
                                    {/* <span className="text-[10px] font-mono text-slate-400 ml-auto font-bold">€0.00</span> */}
                                </label>
                            ))}
                        </div>

                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => void saveMods()}
                                className="w-full rounded-xl bg-blue-600 py-3 font-black text-white shadow-lg hover:bg-blue-700 transition-all uppercase text-xs tracking-widest"
                            >
                                Seçimleri Kaydet
                            </button>
                            <button
                                type="button"
                                onClick={() => setCopyModModal(true)}
                                className="w-full flex items-center justify-center gap-2 text-xs font-black text-blue-600 hover:text-blue-700 py-2.5 border border-blue-200 rounded-xl bg-blue-50/50 transition-colors uppercase tracking-widest"
                            >
                                <FiCopy size={14} /> Diğer ürünlere kopyala
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {copyModModal && modPid && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                        <h3 className="text-xl font-black text-slate-800 mb-2">Modifikatörleri Kopyala</h3>
                        <p className="text-sm text-slate-500 mb-6 font-medium">Bu ürünün seçili ek malzemelerini diğer ürünlere aktarın.</p>
                        
                        <div className="space-y-4 mb-6">
                            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                <input 
                                    type="radio" 
                                    name="copyModMode" 
                                    checked={copyModTarget === 'category'} 
                                    onChange={() => setCopyModTarget('category')}
                                />
                                <div>
                                    <span className="block font-bold text-sm text-slate-800">Aynı Kategoridekiler</span>
                                    <span className="text-[11px] text-slate-500">Bu ürünle aynı kategorideki tüm ürünlere kopyalar.</span>
                                </div>
                            </label>
                            
                            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                <input 
                                    type="radio" 
                                    name="copyModMode" 
                                    checked={copyModTarget === 'specific'} 
                                    onChange={() => {
                                        setCopyModTarget('specific');
                                        setCopyModSel([]);
                                    }}
                                />
                                <div>
                                    <span className="block font-bold text-sm text-slate-800">Belirli Ürünler</span>
                                    <span className="text-[11px] text-slate-500">Listeden seçeceğiniz belirli ürünlere kopyalar.</span>
                                </div>
                            </label>
                        </div>

                        {copyModTarget === 'specific' && (
                            <div className="mb-6 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
                                {products.filter(p => p.id !== modPid).map(p => (
                                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="checkbox"
                                            checked={copyModSel.includes(p.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setCopyModSel([...copyModSel, p.id]);
                                                else setCopyModSel(copyModSel.filter(id => id !== p.id));
                                            }}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-bold text-slate-600">{p.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCopyModModal(false)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleCopyModifiers()}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg transition-all"
                            >
                                Kopyalamayı Başlat
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ModernConfirmModal
                isOpen={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm?.title || ''}
                description={confirm?.description || ''}
                confirmText={confirm?.confirmText || 'EVET'}
                cancelText="VAZGEÇ"
                type={confirm?.type || 'warning'}
                onConfirm={() => confirm?.onConfirm()}
            />
        </main>
    );
};
