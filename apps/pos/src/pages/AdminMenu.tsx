import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit, FiTrash2, FiRefreshCcw, FiLayers, FiTag, FiShoppingBag, FiSearch, FiCopy, FiDollarSign } from 'react-icons/fi';
import * as FaIcons from 'react-icons/fa';

import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { ModernConfirmModal } from '../features/terminal/components/ModernConfirmModal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

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
    const { t } = usePosLocale();
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

    const toggleProductActive = async (prod: AdminProduct) => {
        try {
            const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
            const newActiveState = !(prod.is_active === 1 || prod.is_active === true);
            const payload = {
                category_id: prod.category_id,
                name: prod.name,
                description: prod.description || '',
                base_price: Number(prod.base_price),
                price_takeaway: Number(prod.price_takeaway || prod.base_price),
                price_delivery: Number(prod.price_delivery || prod.base_price),
                image_url: prod.image_url || null,
                is_active: newActiveState,
                prep_time_min: Number(prod.prep_time_min ?? 15),
                allergens: prod.allergens || null,
                translations: prod.translations || {},
            };

            const res = await fetch(`/api/v1/menu/admin/products/${prod.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast.success(newActiveState ? 'Ürün satışa açıldı' : 'Ürün satışa kapatıldı');
                fetchData();
            } else {
                const j = await res.json().catch(() => ({}));
                toast.error((j as { error?: string }).error || 'İşlem başarısız.');
            }
        } catch (error) {
            console.error(error);
            toast.error('Bağlantı hatası.');
        }
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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const loadingToast = toast.loading('Görsel sunucuya yükleniyor...');
        
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Data = reader.result as string;
                
                const res = await fetch('/api/v1/menu/admin/products/upload-image', {
                    method: 'POST',
                    headers: {
                        ...getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileData: base64Data
                    })
                });
                
                const data = await res.json();
                toast.dismiss(loadingToast);
                
                if (res.ok && data.imageUrl) {
                    setFormData(prev => ({ ...prev, image_url: data.imageUrl }));
                    toast.success('Görsel başarıyla yüklendi!');
                } else {
                    toast.error(data.error || 'Dosya yükleme hatası.');
                }
            };
            reader.onerror = () => {
                toast.dismiss(loadingToast);
                toast.error('Dosya okunamadı.');
            };
            reader.readAsDataURL(file);
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error('Görsel yüklenirken bir sorun oluştu.');
        }
    };

    const filteredProducts = products.filter((p) => {
        const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
            <header className="min-h-[5rem] lg:h-20 bg-[#0f172a]/95 border-b border-white/5 backdrop-blur-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 px-6 sm:px-8 py-4 lg:py-0 z-10">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto">
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{t('admin.menu.title')}</h2>
                    {tab === 'products' && (
                        <div className="relative w-full sm:w-64">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder={t('admin.menu.searchPlaceholder')}
                                className="w-full pl-10 pr-4 py-2 bg-white/5 text-white border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all font-medium outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <div className="flex rounded-2xl border border-white/5 bg-[#0f172a]/65 p-1 text-xs sm:text-sm backdrop-blur-md relative">
                        {(['products', 'categories', 'bulk'] as Tab[]).map((tabKey) => {
                            const isActive = tab === tabKey;
                            const tabLabel =
                                tabKey === 'products'
                                    ? t('admin.menu.tab.products')
                                    : tabKey === 'categories'
                                      ? t('admin.menu.tab.categories')
                                      : t('admin.menu.tab.bulk');
                            return (
                                <button
                                    key={tabKey}
                                    type="button"
                                    onClick={() => setTab(tabKey)}
                                    className={`relative rounded-xl px-3 sm:px-4 py-2 font-extrabold uppercase tracking-wider text-[10px] sm:text-xs transition-all duration-300 select-none cursor-pointer flex items-center justify-center gap-1.5 ${
                                        isActive
                                            ? 'bg-blue-600/10 border border-blue-500/35 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.08)]'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                                    }`}
                                >
                                    <span>{tabLabel}</span>
                                    {isActive && (
                                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.9)] animate-pulse hidden sm:block" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 ml-auto lg:ml-0">
                        <button
                            onClick={fetchData}
                            className="p-2 text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
                            title={t('admin.menu.refresh')}
                            aria-label={t('admin.menu.refresh')}
                        >
                            <FiRefreshCcw size={18} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={qrPreview}
                            className="text-xs sm:text-sm font-bold text-violet-600 hover:underline cursor-pointer"
                        >
                            {t('admin.menu.qrPreview')}
                        </button>
                    </div>
                    {tab === 'products' && (
                        <button
                            onClick={openNewProductModal}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold shadow-md shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm shrink-0 w-full sm:w-auto"
                        >
                            <FiPlus size={16} /> {t('admin.menu.newProduct')}
                        </button>
                    )}
                    {tab === 'categories' && (
                        <button
                            onClick={() => {
                                setEditingCat(null);
                                setCatForm({ name: '', icon: 'utensils', sort_order: '0', kitchen_station: 'hot' });
                                setCatModal(true);
                            }}
                            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm shrink-0 w-full sm:w-auto shadow-md shadow-blue-500/10"
                        >
                            <FiPlus size={16} /> {t('admin.menu.newCategoryBtn')}
                        </button>
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 sm:p-8">
                {tab === 'categories' && (
                    <div className="bg-white/[0.02] rounded-xl border border-white/5 backdrop-blur-md overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/5 text-xs uppercase text-slate-400">
                                    <th className="p-4">ID</th>
                                    <th className="p-4">{t('admin.menu.cat.colIcon')}</th>
                                    <th className="p-4">{t('admin.menu.cat.colName')}</th>
                                    <th className="p-4">{t('admin.menu.cat.colSort')}</th>
                                    <th className="p-4">{t('admin.menu.cat.colStation')}</th>
                                    <th className="p-4" />

                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((c) => (
                                    <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                                        <td className="p-4 font-mono text-sm">#{c.id}</td>
                                        <td className="p-4">
                                            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-slate-300">
                                                <CategoryIcon iconName={c.icon} className="text-xl" />
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold">{c.name}</td>

                                        <td className="p-4">{c.sort_order ?? 0}</td>
                                        <td className="p-4 text-xs font-bold uppercase text-slate-400">
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
                                                {t('admin.menu.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                className="text-red-500"
                                                onClick={() => deleteCategory(c.id)}
                                            >
                                                {t('admin.menu.delete')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'bulk' && (
                    <div className="max-w-xl rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md p-6">
                        <h3 className="mb-4 font-bold text-white">{t('admin.menu.bulk.title')}</h3>
                        <p className="mb-4 text-sm text-slate-400">
                            {t('admin.menu.bulk.subtitle').replace('{{currency}}', currency)}
                        </p>
                        <div className="flex gap-2 mb-4">
                            <select 
                                onChange={(e) => setBulkCatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="text-[11px] font-black uppercase tracking-tight bg-white/5 text-white border border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={bulkCatFilter}
                            >
                                <option value="all">{t('admin.menu.bulk.allCategories')}</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            
                            <button 
                                onClick={() => {
                                    const visiblePids = products
                                        .filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter)
                                        .map(p => p.id);
                                    setBulkSel(Array.from(new Set([...bulkSel, ...visiblePids])));
                                }}
                                className="text-[10px] font-black uppercase tracking-tighter bg-blue-500/10 text-blue-400 px-3 py-1 rounded-lg hover:bg-blue-500/20 transition-colors border border-blue-500/20"
                            >
                                {t('admin.menu.bulk.markVisible')}
                            </button>
                            <button 
                                onClick={() => {
                                    const visiblePids = products
                                        .filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter)
                                        .map(p => p.id);
                                    setBulkSel(bulkSel.filter(id => !visiblePids.includes(id)));
                                }}
                                className="text-[10px] font-black uppercase tracking-tighter bg-white/5 text-slate-400 px-3 py-1 rounded-lg hover:bg-white/10 transition-colors border border-white/10"
                            >
                                {t('admin.menu.bulk.unmarkVisible')}
                            </button>
                        </div>

                        <div className="mb-4 max-h-64 space-y-1 overflow-auto text-sm border border-white/10 rounded-xl bg-white/5 p-2">
                            {products
                                .filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter)
                                .map((p) => (
                                <label key={p.id} className="flex cursor-pointer items-center gap-3 text-slate-300 hover:bg-white/5 p-2 rounded-lg transition-all group border border-transparent hover:border-white/10">
                                    <input
                                        type="checkbox"
                                        checked={bulkSel.includes(p.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setBulkSel([...bulkSel, p.id]);
                                            else setBulkSel(bulkSel.filter((x) => x !== p.id));
                                        }}
                                        className="w-4 h-4 rounded border-white/20 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-slate-300 group-hover:text-blue-400 font-bold transition-colors">{p.name}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">{t('admin.menu.price.dineIn')}: {currency}{p.base_price}</span>
                                    </div>
                                </label>
                            ))}
                            {products.filter(p => bulkCatFilter === 'all' || p.category_id === bulkCatFilter).length === 0 && (
                                <div className="py-8 text-center text-slate-400 font-medium text-xs">{t('admin.menu.bulk.noProductsInCategory')}</div>
                            )}
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                                <span className="text-sm font-bold text-slate-300">{t('admin.menu.bulk.priceTargets')}</span>
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
                                            className="rounded border-white/20 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className={`text-xs font-bold ${bulkMode === 'percent-of-base' ? 'text-slate-500' : 'text-slate-300'}`}>{t('admin.menu.price.dineIn')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={bulkTargets.includes('takeaway')}
                                            onChange={(e) => {
                                                if (e.target.checked) setBulkTargets([...bulkTargets, 'takeaway']);
                                                else setBulkTargets(bulkTargets.filter(t => t !== 'takeaway'));
                                            }}
                                            className="rounded border-white/20 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs font-bold text-slate-300">{t('admin.menu.price.takeaway')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={bulkTargets.includes('delivery')}
                                            onChange={(e) => {
                                                if (e.target.checked) setBulkTargets([...bulkTargets, 'delivery']);
                                                else setBulkTargets(bulkTargets.filter(t => t !== 'delivery'));
                                            }}
                                            className="rounded border-white/20 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs font-bold text-slate-300">{t('admin.menu.price.delivery')}</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    className="rounded-lg border border-white/10 bg-white/5 text-white p-2.5 text-sm font-bold"
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
                                    <option value="percent">{t('admin.menu.bulk.mode.percent')}</option>
                                    <option value="fixed">{t('admin.menu.bulk.mode.fixed').replace('{{currency}}', currency)}</option>
                                    <option value="percent-of-base">{t('admin.menu.bulk.mode.percentOfBase')}</option>
                                </select>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="w-24 rounded-lg border border-white/10 bg-white/5 text-white p-2.5 text-sm font-bold"
                                    value={bulkVal}
                                    onChange={(e) => setBulkVal(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => void runBulk()}
                                    className="rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white shadow-lg hover:bg-blue-700 transition-all"
                                >
                                    {t('admin.menu.bulk.apply')}
                                </button>
                            </div>

                            {bulkMode === 'percent-of-base' && (
                                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 animate-in fade-in slide-in-from-top-2">
                                    <p className="mt-1 text-[11px] text-emerald-400 leading-relaxed font-bold">
                                        💡 İpucu: Artış için normal rakam (Örn: 10), indirim yapmak için başına eksi koyun (Örn: -10).
                                    </p>
                                    <p className="mt-2 text-[10px] text-slate-500 leading-relaxed italic">
                                        {t('admin.menu.bulk.hintPercentOfBase')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'products' && (
                    <div className="space-y-6 p-2">
                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-3 overflow-x-auto pb-4 custom-scrollbar">
                            <button
                                onClick={() => setSelectedCategoryId('all')}
                                className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${
                                    selectedCategoryId === 'all' 
                                    ? 'bg-sky-500 text-white shadow-md scale-105' 
                                    : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
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
                                        : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                                    }`}
                                >
                                    <CategoryIcon iconName={c.icon} className={selectedCategoryId === c.id ? 'text-white' : 'text-slate-400'} />
                                    {c.name}
                                </button>
                            ))}
                        </div>

                        {/* Products Grid */}
                        <div className="flex flex-col sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-8">
                            {isLoading ? (
                                <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
                                    <FiRefreshCcw className="animate-spin mb-4" size={32} />
                                    <span className="font-bold">{t('admin.menu.loading')}</span>
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
                                    <FiShoppingBag className="mb-4 opacity-50" size={48} />
                                    <span className="font-bold text-lg">{t('admin.menu.noResults')}</span>
                                </div>
                            ) : (
                                filteredProducts.map((prod) => (
                                    <React.Fragment key={prod.id}>
                                        {/* 📱 Compact Mobile List Item */}
                                        <div className="block sm:hidden bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-all relative">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void toggleProductActive(prod);
                                                    }}
                                                    className="w-14 h-14 rounded-xl bg-white/5 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center relative cursor-pointer active:scale-95 transition-all"
                                                    title={prod.is_active ? t('admin.menu.sale.toggleActive') : t('admin.menu.sale.toggleInactive')}
                                                >
                                                    {prod.image_url ? (
                                                        <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <FiShoppingBag size={20} className="text-slate-300" />
                                                    )}
                                                    <span className={`absolute -top-1 -left-1 w-3.5 h-3.5 border-2 border-[#0c1526] rounded-full ${prod.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-[9px] font-black text-sky-500 uppercase tracking-widest block truncate max-w-[120px]">
                                                        {categories.find(c => c.id === prod.category_id)?.name || 'Kategorisiz'}
                                                    </span>
                                                    <h3 className="font-black text-white text-sm leading-snug truncate mt-0.5">{prod.name}</h3>
                                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[10px] font-mono font-black">
                                                        <span className="text-emerald-400 flex items-center gap-0.5">M:{currency}{prod.base_price}</span>
                                                        <span className="text-blue-400 flex items-center gap-0.5">G:{currency}{prod.price_takeaway || prod.base_price}</span>
                                                        <span className="text-purple-400 flex items-center gap-0.5">P:{currency}{prod.price_delivery || prod.base_price}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={() => openVariants(prod.id)} className="w-8 h-8 flex items-center justify-center bg-violet-500/10 text-violet-400 rounded-lg hover:bg-violet-500/20 transition-colors cursor-pointer" title={t('admin.menu.variants')}>
                                                    <FiLayers size={13} />
                                                </button>
                                                <button onClick={() => void openMods(prod.id)} className="w-8 h-8 flex items-center justify-center bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer" title="Modlar">
                                                    <FiTag size={13} />
                                                </button>
                                                <button onClick={() => handleEdit(prod)} className="w-8 h-8 flex items-center justify-center bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors cursor-pointer" title={t('admin.menu.edit')}>
                                                    <FiEdit size={13} />
                                                </button>
                                                <button onClick={() => handleDelete(prod.id)} className="w-8 h-8 flex items-center justify-center bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer" title={t('admin.menu.delete')}>
                                                    <FiTrash2 size={13} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* 💻 Original Desktop/Tablet Card */}
                                        <div className="hidden sm:flex bg-white/[0.02] rounded-2xl border border-white/5 backdrop-blur-md hover:bg-white/[0.04] transition-all duration-300 overflow-hidden flex-col group relative">
                                            <div className="relative h-44 bg-white/[0.04] overflow-hidden flex-shrink-0">
                                                {prod.image_url ? (
                                                    <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02] text-slate-500 group-hover:scale-105 transition-transform duration-700">
                                                        <FiShoppingBag size={56} className="opacity-40" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                                <div className="absolute top-3 left-3 flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void toggleProductActive(prod);
                                                        }}
                                                        className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                                                            prod.is_active 
                                                                ? 'bg-emerald-500/90 hover:bg-emerald-600 text-white border border-emerald-400/20 shadow-emerald-500/25' 
                                                                : 'bg-red-500/90 hover:bg-red-600 text-white border border-red-400/20 shadow-red-500/25'
                                                        }`}
                                                        title={prod.is_active ? t('admin.menu.sale.closeTitle') : t('admin.menu.sale.openTitle')}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${prod.is_active ? 'bg-white animate-pulse' : 'bg-white/60'}`} />
                                                        {prod.is_active ? t('admin.menu.sale.active') : t('admin.menu.sale.inactive')}
                                                    </button>
                                                </div>
                                                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-x-4 group-hover:translate-x-0">
                                                    <button onClick={() => openVariants(prod.id)} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-violet-400 rounded-lg shadow-lg backdrop-blur-sm transition-transform hover:scale-110" title={t('admin.menu.variants')}>
                                                        <FiLayers size={14} />
                                                    </button>
                                                    <button onClick={() => void openMods(prod.id)} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-amber-400 rounded-lg shadow-lg backdrop-blur-sm transition-transform hover:scale-110" title={t('admin.menu.modifiers')}>
                                                        <FiTag size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-5 flex-1 flex flex-col z-10 bg-transparent">
                                                <div className="mb-1">
                                                    <p className="text-[10px] font-black text-sky-500 uppercase tracking-wider mb-1">
                                                        {categories.find(c => c.id === prod.category_id)?.name || 'Kategorisiz'}
                                                    </p>
                                                    <h3 className="font-black text-white text-lg leading-tight line-clamp-1" title={prod.name}>{prod.name}</h3>
                                                </div>
                                                <p className="text-xs font-medium text-slate-400 line-clamp-2 my-2 flex-1 leading-relaxed">
                                                    {prod.description || 'Açıklama belirtilmemiş.'}
                                                </p>
                                                <div className="grid grid-cols-3 gap-1 mt-3 pt-3 border-t border-white/10 bg-white/5 rounded-xl p-2">
                                                    <div className="text-center">
                                                        <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">{t('admin.menu.price.dineIn')}</p>
                                                        <p className="font-mono text-emerald-400 font-bold text-sm tracking-tight">{currency}{prod.base_price}</p>
                                                    </div>
                                                    <div className="text-center border-l border-white/10">
                                                        <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">{t('admin.menu.price.takeaway')}</p>
                                                        <p className="font-mono text-blue-400 font-bold text-sm tracking-tight">{currency}{prod.price_takeaway || prod.base_price}</p>
                                                    </div>
                                                    <div className="text-center border-l border-white/10">
                                                        <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">{t('admin.menu.price.delivery')}</p>
                                                        <p className="font-mono text-purple-400 font-bold text-sm tracking-tight">{currency}{prod.price_delivery || prod.base_price}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 border-t border-white/5 bg-white/[0.03]">
                                                <button onClick={() => handleEdit(prod)} className="p-3 text-xs font-black text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-2 uppercase tracking-wide">
                                                    <FiEdit size={14} /> Düzenle
                                                </button>
                                                <button onClick={() => handleDelete(prod.id)} className="p-3 text-xs font-black text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border-l border-white/5 flex items-center justify-center gap-2 uppercase tracking-wide">
                                                    <FiTrash2 size={14} /> Sil
                                                </button>
                                            </div>
                                        </div>
                                    </React.Fragment>
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" 
                        onClick={() => setIsModalOpen(false)}
                    />
                    
                    {/* Off-Canvas Drawer Panel */}
                    <div className="fixed inset-y-0 right-0 z-[110] w-full max-w-md bg-[#0c1526] border-l border-white/10 flex flex-col transform transition-transform duration-300">
                        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#0f172a]/80">
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">
                                    {editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün'}
                                </h3>
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                    {editingProduct ? 'Mevcut ürünü güncelle' : 'Menüye farklı bir lezzet kat'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/20 hover:border-white/30 transition-all"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0c1526]">
                            <div className="space-y-5">
                                <Input
                                    required
                                    label="Ürün adı"
                                    value={formData.name}
                                    onChange={(v) => setFormData({ ...formData, name: v })}
                                    placeholder="Örn: Karışık Pizza"
                                    icon={<FiShoppingBag />}
                                />
                                
                                <Select
                                    required
                                    label="Kategori"
                                    value={formData.category_id}
                                    onChange={(v) => setFormData({ ...formData, category_id: v })}
                                    icon={<FiLayers />}
                                    options={[
                                        { v: '', l: 'Seçiniz' },
                                        ...categories.map((c) => ({ v: c.id, l: c.name }))
                                    ]}
                                />
                                
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Açıklama</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({ ...formData, description: e.target.value })
                                        }
                                        rows={3}
                                        className="w-full bg-white/5 text-white border border-white/10 p-3 rounded-2xl outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all font-medium text-sm resize-none placeholder:text-slate-650"
                                        placeholder="İçindekiler vb."
                                    />
                                </div>

                                <div className="bg-white/5 p-4 rounded-3xl border border-white/15">
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Satış Fiyatları ({currency})</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Input
                                                required
                                                label={t('admin.menu.price.dineIn')}
                                                value={formData.base_price}
                                                onChange={(v) => setFormData({ ...formData, base_price: v })}
                                                mask="price"
                                                icon={<FiDollarSign className="w-3.5 h-3.5" />}
                                                className="font-mono text-emerald-400 focus:border-emerald-500/50 !py-3"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                required
                                                label={t('admin.menu.price.takeaway')}
                                                value={formData.price_takeaway}
                                                onChange={(v) => setFormData({ ...formData, price_takeaway: v })}
                                                mask="price"
                                                icon={<FiDollarSign className="w-3.5 h-3.5" />}
                                                className="font-mono text-blue-400 focus:border-blue-500/50 !py-3"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                required
                                                label={t('admin.menu.price.delivery')}
                                                value={formData.price_delivery}
                                                onChange={(v) => setFormData({ ...formData, price_delivery: v })}
                                                mask="price"
                                                icon={<FiDollarSign className="w-3.5 h-3.5" />}
                                                className="font-mono text-purple-400 focus:border-purple-500/50 !py-3"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        label="Hazırlık Süresi (DK)"
                                        value={formData.prep_time_min}
                                        onChange={(v) => setFormData({ ...formData, prep_time_min: v })}
                                        mask="number"
                                        placeholder="15"
                                        icon={<FaIcons.FaClock className="w-4 h-4" />}
                                    />
                                    <Input
                                        label="Alerjenler"
                                        value={formData.allergens}
                                        onChange={(v) => setFormData({ ...formData, allergens: v })}
                                        placeholder="Örn: Gluten, Laktoz"
                                        icon={<FiTag className="w-4 h-4" />}
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                        Ürün Görseli
                                    </label>
                                    <div className="space-y-3">
                                        {/* Image URL Input & Preview */}
                                        <div className="flex gap-3 items-center">
                                            <div className="flex-1">
                                                <Input
                                                    value={formData.image_url}
                                                    onChange={(v) => setFormData({ ...formData, image_url: v })}
                                                    placeholder="Resim linki (https://...) girin veya alttan dosya yükleyin"
                                                    icon={<FiShoppingBag className="w-4 h-4" />}
                                                />
                                            </div>
                                            {formData.image_url.trim() && (
                                                <div className="w-12 h-12 rounded-xl border border-white/10 overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                                                    <img 
                                                        src={formData.image_url.startsWith('/') ? `${window.location.origin}${formData.image_url}` : formData.image_url} 
                                                        alt="Önizleme" 
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            (e.target as HTMLElement).style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* File Uploader Container */}
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                className="hidden"
                                                id="product-image-upload"
                                            />
                                            <label
                                                htmlFor="product-image-upload"
                                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/20 bg-white/5 text-xs font-bold text-slate-400 hover:bg-white/10 hover:border-white/35 transition-all cursor-pointer text-center active:scale-98"
                                            >
                                                📁 <span>Dosya Seç ve Sunucuya Yükle</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-white/10 rounded-xl overflow-hidden">
                                    <div className="bg-white/5 px-4 py-2 border-b border-white/10">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Çeviri İsimleri (Opsiyonel)</p>
                                    </div>
                                    <div className="grid grid-cols-3 divide-x divide-white/10 bg-white/[0.02]">
                                        <div className="p-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-1 text-center">DE</p>
                                            <input
                                                className="w-full text-center outline-none bg-transparent text-sm font-bold text-slate-200"
                                                value={formData.name_de}
                                                onChange={(e) => setFormData({ ...formData, name_de: e.target.value })}
                                            />
                                        </div>
                                        <div className="p-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-1 text-center">TR</p>
                                            <input
                                                className="w-full text-center outline-none bg-transparent text-sm font-bold text-slate-200"
                                                value={formData.name_tr}
                                                onChange={(e) => setFormData({ ...formData, name_tr: e.target.value })}
                                            />
                                        </div>
                                        <div className="p-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-1 text-center">EN</p>
                                            <input
                                                className="w-full text-center outline-none bg-transparent text-sm font-bold text-slate-200"
                                                value={formData.name_en}
                                                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer select-none bg-white/5 p-4 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active}
                                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="sr-only"
                                            />
                                            <div className={`block w-12 h-7 rounded-full transition-colors ${formData.is_active ? 'bg-emerald-500' : 'bg-white/10'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${formData.is_active ? 'transform translate-x-5' : ''}`}></div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`font-black uppercase tracking-wider text-sm ${formData.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>{formData.is_active ? t('admin.menu.sale.active') : t('admin.menu.sale.inactive')}</span>
                                            <span className="text-[10px] text-slate-400">Menüde aktif olarak gösterilir</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-6 pb-2 border-t border-white/10 flex gap-3 sticky bottom-0 bg-[#0c1526]">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-3.5 flex-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold uppercase tracking-wider text-sm transition-colors border border-white/10"
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
                        className="w-full max-w-md rounded-2xl bg-[#0c1526] border border-white/10 p-6 text-white"
                    >
                        <h3 className="mb-4 font-bold">{editingCat ? t('admin.menu.cat.editTitle') : t('admin.menu.cat.newTitle')}</h3>
                        <Input
                            required
                            label="Kategori Adı"
                            value={catForm.name}
                            onChange={(v) => setCatForm({ ...catForm, name: v })}
                            placeholder="Ad"
                            icon={<FiTag className="w-4 h-4" />}
                            className="mb-3"
                        />
                        <label className="mb-2 block text-xs font-bold uppercase text-slate-400">
                            Kategori İkonu
                        </label>
                        <div className="grid grid-cols-5 gap-2 mb-4 p-3 border border-white/10 rounded-xl max-h-48 overflow-y-auto bg-white/5">
                            {ICON_OPTIONS.map(iconName => (
                                <button
                                    key={iconName}
                                    type="button"
                                    onClick={() => setCatForm({ ...catForm, icon: iconName })}
                                    className={`p-3 rounded-xl border flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${
                                        catForm.icon === iconName 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 z-10' 
                                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                                    }`}
                                    title={iconName}
                                >
                                    <CategoryIcon iconName={iconName} className="text-xl" />
                                </button>
                            ))}
                        </div>

                        <Input
                            label="Sıra"
                            value={catForm.sort_order}
                            onChange={(v) => setCatForm({ ...catForm, sort_order: v })}
                            mask="number"
                            placeholder="Sıra"
                            icon={<FiLayers className="w-4 h-4" />}
                            className="mb-3"
                        />
                        <Select
                            label="Mutfak İstasyonu"
                            value={catForm.kitchen_station}
                            onChange={(v) => setCatForm({ ...catForm, kitchen_station: v as any })}
                            icon={<FaIcons.FaUtensils className="w-4 h-4" />}
                            options={[
                                { v: 'hot', l: 'Ana mutfak (sıcak)' },
                                { v: 'bar', l: 'Bar' },
                                { v: 'cold', l: 'Soğuk' }
                            ]}
                            className="mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCatModal(false)} className="px-4 py-2 text-slate-300 hover:bg-white/5 rounded-lg">
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
                    <div className="w-full max-w-md rounded-2xl bg-[#0c1526] border border-white/10 p-6 text-white">
                        <h3 className="mb-4 font-bold">Boyutlar (varyant)</h3>
                        <ul className="mb-4 max-h-40 space-y-1 overflow-auto text-sm">
                            {variants.map((v) => (
                                <li key={v.id} className="flex justify-between border-b border-white/10 py-1">
                                    <span>{v.name}</span>
                                    <span className="font-mono">{currency}{v.price}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <input
                                placeholder="Ad"
                                className="flex-1 rounded-lg border border-white/10 bg-white/5 text-white p-2"
                                value={newVar.name}
                                onChange={(e) => setNewVar({ ...newVar, name: e.target.value })}
                            />
                            <input
                                placeholder={currency}
                                type="number"
                                className="w-24 rounded border border-white/10 bg-white/5 text-white p-2"
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
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setCopyVarModal(true)}
                                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-blue-500 hover:text-blue-400 py-2 border border-blue-500/30 rounded-lg bg-blue-500/10 transition-colors"
                            >
                                <FiCopy size={16} /> Diğer ürünlere kopyala
                            </button>
                        </div>
                        <button
                            type="button"
                            className="mt-4 w-full py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm font-bold text-slate-300 transition-colors"
                            onClick={() => setVariantModal(false)}
                        >
                            Kapat
                        </button>
                    </div>
                </div>
            )}

            {copyVarModal && variantPid && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-[#0c1526] border border-white/10 p-6 text-white">
                        <h3 className="text-xl font-black text-white mb-2">Varyantları Kopyala</h3>
                        <p className="text-sm text-slate-400 mb-6 font-medium">Bu ürünün boyut ve varyantlarını diğer ürünlere aktarın.</p>
                        
                        <div className="space-y-4 mb-6">
                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:border-blue-500/40 transition-colors">
                                <input 
                                    type="radio" 
                                    name="copyMode" 
                                    checked={copyVarTarget === 'category'} 
                                    onChange={() => setCopyVarTarget('category')}
                                />
                                <div>
                                    <span className="block font-bold text-sm text-white">Aynı Kategoridekiler</span>
                                    <span className="text-[11px] text-slate-400">Bu ürünle aynı kategorideki tüm ürünlere kopyalar.</span>
                                </div>
                            </label>
                            
                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:border-blue-500/40 transition-colors">
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
                                    <span className="block font-bold text-sm text-white">Belirli Ürünler</span>
                                    <span className="text-[11px] text-slate-400">Listeden seçeceğiniz belirli ürünlere kopyalar.</span>
                                </div>
                            </label>
                        </div>

                        {copyVarTarget === 'specific' && (
                            <div className="mb-6 max-h-48 overflow-y-auto border border-white/10 rounded-xl p-2 space-y-1 bg-white/[0.03]">
                                {products.filter(p => p.id !== variantPid).map(p => (
                                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="checkbox"
                                            checked={copyVarSel.includes(p.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setCopyVarSel([...copyVarSel, p.id]);
                                                else setCopyVarSel(copyVarSel.filter(id => id !== p.id));
                                            }}
                                            className="rounded border-white/20 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-bold text-slate-300">{p.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCopyVarModal(false)}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-sm transition-colors border border-white/10"
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
                    <div className="w-full max-w-md rounded-2xl bg-[#0c1526] border border-white/10 p-6 text-white">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-lg">Modifikatör seçimi</h3>
                            <button onClick={() => setModModal(false)} className="text-slate-400">✕</button>
                        </div>
                        
                        {/* New Modifier Input */}
                        <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-wider">Hızlı Yeni Ekle</p>
                            <div className="flex gap-2">
                                <input
                                    placeholder="Ekstra Malzeme..."
                                    className="flex-1 rounded-lg border border-white/10 bg-white/5 text-white p-2 text-sm font-bold outline-none focus:border-indigo-500"
                                    value={newMod.name}
                                    onChange={(e) => setNewMod({ ...newMod, name: e.target.value })}
                                />
                                <input
                                    placeholder={currency}
                                    type="number"
                                    step="0.1"
                                    className="w-20 rounded-lg border border-white/10 bg-white/5 text-white p-2 text-sm font-mono font-bold outline-none focus:border-indigo-500"
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
                                <label key={m.id} className="flex cursor-pointer items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10">
                                    <input
                                        type="checkbox"
                                        checked={modSel.includes(m.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setModSel([...modSel, m.id]);
                                            else setModSel(modSel.filter((x) => x !== m.id));
                                        }}
                                        className="h-4 w-4 rounded border-white/20 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-bold text-slate-300">{m.name}</span>
                                    {/* Backend'den gelirse fiyatı gösterelim */}
                                    {/* <span className="text-[10px] font-mono text-slate-400 ml-auto font-bold">€0.00</span> */}
                                </label>
                            ))}
                        </div>

                        <div className="space-y-3 pt-4 border-t border-white/10">
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
                                className="w-full flex items-center justify-center gap-2 text-xs font-black text-blue-400 hover:text-blue-300 py-2.5 border border-blue-500/30 rounded-xl bg-blue-500/10 transition-colors uppercase tracking-widest"
                            >
                                <FiCopy size={14} /> Diğer ürünlere kopyala
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {copyModModal && modPid && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-[#0c1526] border border-white/10 p-6 text-white">
                        <h3 className="text-xl font-black text-white mb-2">Modifikatörleri Kopyala</h3>
                        <p className="text-sm text-slate-400 mb-6 font-medium">Bu ürünün seçili ek malzemelerini diğer ürünlere aktarın.</p>
                        
                        <div className="space-y-4 mb-6">
                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:border-blue-500/40 transition-colors">
                                <input 
                                    type="radio" 
                                    name="copyModMode" 
                                    checked={copyModTarget === 'category'} 
                                    onChange={() => setCopyModTarget('category')}
                                />
                                <div>
                                    <span className="block font-bold text-sm text-white">Aynı Kategoridekiler</span>
                                    <span className="text-[11px] text-slate-400">Bu ürünle aynı kategorideki tüm ürünlere kopyalar.</span>
                                </div>
                            </label>
                            
                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:border-blue-500/40 transition-colors">
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
                                    <span className="block font-bold text-sm text-white">Belirli Ürünler</span>
                                    <span className="text-[11px] text-slate-400">Listeden seçeceğiniz belirli ürünlere kopyalar.</span>
                                </div>
                            </label>
                        </div>

                        {copyModTarget === 'specific' && (
                            <div className="mb-6 max-h-48 overflow-y-auto border border-white/10 rounded-xl p-2 space-y-1 bg-white/[0.03]">
                                {products.filter(p => p.id !== modPid).map(p => (
                                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="checkbox"
                                            checked={copyModSel.includes(p.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setCopyModSel([...copyModSel, p.id]);
                                                else setCopyModSel(copyModSel.filter(id => id !== p.id));
                                            }}
                                            className="rounded border-white/20 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-bold text-slate-300">{p.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCopyModModal(false)}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-sm transition-colors border border-white/10"
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






