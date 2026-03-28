import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiRefreshCcw, FiLogOut, FiHome } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface AdminProduct {
    id: number;
    category_id: number;
    name: string;
    description: string | null;
    base_price: string;
    price_takeaway: string;
    price_delivery: string;
    image_url: string | null;
    is_active: number;
}

interface AdminCategory {
    id: number;
    name: string;
}

export const AdminMenu: React.FC = () => {
    const navigate = useNavigate();
    const { logout, getAuthHeaders } = useAuthStore();
    
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [categories, setCategories] = useState<AdminCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
        is_active: true
    });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const headers = getAuthHeaders();
            const [catRes, prodRes] = await Promise.all([
                fetch('/api/v1/menu/admin/categories', { headers }),
                fetch('/api/v1/menu/admin/products', { headers })
            ]);

            if (catRes.status === 401 || prodRes.status === 401) {
                logout();
                return;
            }

            const catData = await catRes.json();
            const prodData = await prodRes.json();

            setCategories(Array.isArray(catData) ? catData : []);
            setProducts(Array.isArray(prodData) ? prodData : []);
        } catch (error) {
            console.error('Data fetch error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
            const payload = {
                ...formData,
                category_id: Number(formData.category_id),
                base_price: Number(formData.base_price),
                price_takeaway: Number(formData.price_takeaway),
                price_delivery: Number(formData.price_delivery)
            };

            const url = editingProduct 
                ? `/api/v1/menu/admin/products/${editingProduct.id}` 
                : '/api/v1/menu/admin/products';
            
            const method = editingProduct ? 'PUT' : 'POST';

            const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });

            if (res.ok) {
                setIsModalOpen(false);
                fetchData();
            } else {
                alert('İşlem başarısız!');
            }
        } catch (error) {
            console.error(error);
            alert('Sunucu hatası');
        }
    };

    const handleEdit = (prod: AdminProduct) => {
        setEditingProduct(prod);
        setFormData({
            category_id: prod.category_id.toString(),
            name: prod.name,
            description: prod.description || '',
            base_price: prod.base_price,
            price_takeaway: prod.price_takeaway || prod.base_price,
            price_delivery: prod.price_delivery || prod.base_price,
            image_url: prod.image_url || '',
            is_active: prod.is_active === 1
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
        
        try {
            const res = await fetch(`/api/v1/menu/admin/products/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (res.ok) {
                fetchData();
            } else {
                alert('Silme işlemi başarısız!');
            }
        } catch (error) {
            console.error(error);
        }
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
            is_active: true
        });
        setIsModalOpen(true);
    };

    return (
        <div className="flex h-screen bg-[#F1F5F9] font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-800 text-white flex flex-col shadow-xl">
                <div className="p-6 h-20 flex items-center border-b border-slate-700">
                    <h1 className="text-xl font-black tracking-widest text-[#38BDF8]">
                        NextPOS <span className="text-white font-medium">ADMIN</span>
                    </h1>
                </div>
                <nav className="flex-1 px-4 py-6 space-y-2">
                    <button className="w-full flex items-center gap-3 bg-blue-600/20 text-blue-400 font-bold px-4 py-3 rounded-xl border border-blue-500/30">
                        Ürün Yönetimi
                    </button>
                    {/* Diğer menüler eklenebilir */}
                </nav>
                <div className="p-4 border-t border-slate-700 space-y-2">
                    <button onClick={() => navigate('/')} className="w-full flex items-center gap-2 text-slate-300 hover:text-white px-4 py-2 transition-colors">
                        <FiHome /> Kasa Ekranına Dön
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center gap-2 text-red-400 hover:text-red-300 px-4 py-2 transition-colors">
                        <FiLogOut /> Güvenli Çıkış
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-20 bg-white shadow-sm flex items-center justify-between px-8 z-10">
                    <h2 className="text-2xl font-bold text-slate-800">Ürün Listesi</h2>
                    <div className="flex gap-4">
                        <button onClick={fetchData} className="p-2 text-slate-400 hover:text-blue-500 transition-colors" title="Yenile">
                            <FiRefreshCcw size={20} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                        <button 
                            onClick={openNewProductModal}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md shadow-blue-500/30 flex items-center gap-2 transition-all active:scale-95"
                        >
                            <FiPlus size={18} /> Yeni Ürün Ekle
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-bold tracking-wider">
                                    <th className="p-4 w-16 text-center">ID</th>
                                    <th className="p-4">Ürün Adı</th>
                                    <th className="p-4">Kategori</th>
                                    <th className="p-4 text-right">Masa Fiyatı</th>
                                    <th className="p-4 text-right">Gel-Al</th>
                                    <th className="p-4 text-right">Paket</th>
                                    <th className="p-4 text-center">Durum</th>
                                    <th className="p-4 text-center">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">Yükleniyor...</td></tr>
                                ) : products.length === 0 ? (
                                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">Ürün bulunamadı</td></tr>
                                ) : (
                                    products.map(prod => (
                                        <tr key={prod.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                            <td className="p-4 text-center text-slate-400 font-mono text-sm">#{prod.id}</td>
                                            <td className="p-4 font-bold text-slate-700">{prod.name}</td>
                                            <td className="p-4 text-slate-500">
                                                {categories.find(c => c.id === prod.category_id)?.name || prod.category_id}
                                            </td>
                                            <td className="p-4 text-right font-mono font-medium text-emerald-600">€{prod.base_price}</td>
                                            <td className="p-4 text-right font-mono font-medium text-blue-600">€{prod.price_takeaway || prod.base_price}</td>
                                            <td className="p-4 text-right font-mono font-medium text-purple-600">€{prod.price_delivery || prod.base_price}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${prod.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {prod.is_active ? 'Aktif' : 'Pasif'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => handleEdit(prod)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Düzenle">
                                                        <FiEdit size={16} />
                                                    </button>
                                                    <button onClick={() => handleDelete(prod.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Sil">
                                                        <FiTrash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-800">
                                {editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-2"><FiTrash2 className="hidden"/>Kapat</button>
                        </div>
                        
                        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-5">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Ürün Adı</label>
                                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Örn: Karışık Pizza" />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Kategori</label>
                                    <select required value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})} className="w-full border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                        <option value="" disabled>Seçiniz...</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Açıklama (Opsiyonel)</label>
                                    <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>

                                {/* ÇOKLU FİYATLANDIRMA ZORUNLULUĞU KURALI */}
                                <div className="col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b pb-2">Çoklu Fiyatlandırma (Kurallı)</h4>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-600 mb-1">Masada (Dine-In) €</label>
                                            <input required type="number" step="0.01" value={formData.base_price} onChange={e => setFormData({...formData, base_price: e.target.value})} className="w-full border border-emerald-200 bg-emerald-50/50 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono" placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-blue-600 mb-1">Gel-Al (Takeaway) €</label>
                                            <input required type="number" step="0.01" value={formData.price_takeaway} onChange={e => setFormData({...formData, price_takeaway: e.target.value})} className="w-full border border-blue-200 bg-blue-50/50 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-purple-600 mb-1">Paket Servis €</label>
                                            <input required type="number" step="0.01" value={formData.price_delivery} onChange={e => setFormData({...formData, price_delivery: e.target.value})} className="w-full border border-purple-200 bg-purple-50/50 p-2.5 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono" placeholder="0.00" />
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Görsel URL (Opsiyonel)</label>
                                    <input type="text" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none" placeholder="https://..." />
                                </div>

                                <div className="col-span-2 pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-5 h-5 text-blue-600 rounded" />
                                        <span className="font-bold text-slate-700">Bu ürün satışta (Aktif)</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-6 flex justify-end gap-3 border-t mt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 rounded-lg font-bold transition-colors">İptal</button>
                                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md shadow-blue-500/30 transition-colors">
                                    {editingProduct ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
