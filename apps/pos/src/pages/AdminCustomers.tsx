import React, { useCallback, useEffect, useState } from 'react';
import { 
    FiUsers, FiSearch, FiDownload, FiUpload, FiPlus, 
    FiEdit2, FiTrash2, FiAward, FiStar, FiRefreshCcw,
    FiMail, FiMessageSquare, FiActivity, FiPieChart, FiClock, FiCheck, FiX
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface Customer {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    reward_points: number;
    total_spent: number;
    loyalty_tier: string;
    customer_code: string | null;
    last_visit_at: string | null;
    status: 'active' | 'passive';
    notes?: string;
    email_subscription: boolean;
    whatsapp_subscription: boolean;
    recent_orders?: any[];
}

export const AdminCustomers: React.FC = () => {
    const navigate = useNavigate();
    const { getAuthHeaders } = useAuthStore();
    const { settings } = usePosStore();
    const { t } = usePosLocale();
    const currency = settings?.currency || '₺';
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [modal, setModal] = useState(false);
    const [campaignModal, setCampaignModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [report, setReport] = useState<any>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [campaignMessage, setCampaignMessage] = useState('Merhaba {name}! 🌟 \n\nSizin için harika bir kampanyamız var...');
    const [campaignType, setCampaignType] = useState<'whatsapp' | 'email'>('whatsapp');
    const [activeTab, setActiveTab] = useState<'info' | 'orders' | 'report'>('info');
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cRes, sRes] = await Promise.all([
                fetch(`/api/v1/customers?q=${searchTerm}`, { headers: getAuthHeaders() }),
                fetch('/api/v1/customers/stats/loyalty', { headers: getAuthHeaders() })
            ]);

            if (cRes.status === 403 || sRes.status === 403) {
                setLocked(true);
                setCustomers([]);
                setStats(null);
                return;
            }

            setLocked(false);
            if (cRes.ok && sRes.ok) {
                const cData = await cRes.json();
                const sData = await sRes.json();
                setCustomers(cData.items || []);
                setStats(sData);
            }
        } catch (e) {
            console.error('Data load error', e);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, searchTerm]);

    useEffect(() => {
        const timer = setTimeout(loadData, 300);
        return () => clearTimeout(timer);
    }, [loadData]);

    if (locked) {
        return (
            <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-2 text-sm font-black text-white">{t('modules.locked.title')}</div>
                    <div className="mb-4 text-xs font-semibold text-slate-400">{t('modules.locked.crm.desc')}</div>
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

    const loadCustomerDetail = async (id: number) => {
        try {
            const [dRes, rRes] = await Promise.all([
                fetch(`/api/v1/customers/${id}`, { headers: getAuthHeaders() }),
                fetch(`/api/v1/customers/${id}/report`, { headers: getAuthHeaders() })
            ]);
            if (dRes.ok) setSelectedCustomer(await dRes.json());
            if (rRes.ok) setReport(await rRes.json());
            setModal(true);
            setActiveTab('info');
        } catch (e) {
            toast.error('Detaylar yüklenemedi');
        }
    };

    const handleUpdateStatus = async (id: number, newStatus: string) => {
        try {
            const res = await fetch(`/api/v1/customers/${id}`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                toast.success('Durum güncellendi');
                loadData();
            }
        } catch (e) {
            toast.error('İşlem başarısız');
        }
    };

    const handleBulkAction = async (action: string, value?: any) => {
        if (selectedIds.size === 0) return;
        try {
            const res = await fetch('/api/v1/customers/bulk-action', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds), action, value })
            });
            if (res.ok) {
                toast.success('Toplu işlem tamamlandı');
                setSelectedIds(new Set());
                loadData();
            }
        } catch (e) {
            toast.error('Toplu işlem hatası');
        }
    };

    const saveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer) return;
        setIsSaving(true);
        try {
            const res = await fetch(selectedCustomer.id ? `/api/v1/customers/${selectedCustomer.id}` : '/api/v1/customers', {
                method: selectedCustomer.id ? 'PATCH' : 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedCustomer)
            });
            if (res.ok) {
                toast.success('Müşteri kaydedildi');
                setModal(false);
                loadData();
            }
        } catch (e) {
            toast.error('Kaydetme hatası');
        } finally {
            setIsSaving(false);
        }
    };

    const exportToCSV = () => {
        if (customers.length === 0) return;
        const headers = ["ID", "İsim", "Telefon", "E-posta", "Puan", "Harcanan", "Segment"];
        const rows = customers.map(c => [
            c.id, c.name, c.phone || '', c.email || '', 
            c.reward_points, c.total_spent, c.loyalty_tier.toUpperCase()
        ]);
        
        let csvContent = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `nextpos_musteriler_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                if (lines.length < 2) return;

                // Headers parsing (Advanced detection)
                const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
                
                const findIdx = (keywords: string[]) => 
                    rawHeaders.findIndex(h => keywords.some(k => h.includes(k)));

                const nameIdx = findIdx(['name', 'isim', 'müşteri', 'given name', 'first name']);
                const lastNameIdx = findIdx(['family name', 'last name', 'soyisim']);
                const phoneIdx = findIdx(['phone', 'mobile', 'tel', 'telefon', 'gsm']);
                const emailIdx = findIdx(['email', 'e-mail', 'e-posta']);
                const pointsIdx = findIdx(['puan', 'points', 'reward']);
                const spentIdx = findIdx(['spent', 'harcama', 'total']);

                const bulkData = lines.slice(1).map(line => {
                    // Quote-aware split for complex CSVs
                    const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
                    const clean = (val?: string) => val?.replace(/"/g, '').trim() || '';

                    let name = clean(parts[nameIdx]);
                    if (lastNameIdx !== -1 && nameIdx !== -1) {
                        const lastName = clean(parts[lastNameIdx]);
                        if (lastName && !name.includes(lastName)) name += ` ${lastName}`;
                    }
                    
                    if (!name) return null;

                    return {
                        name,
                        phone: clean(parts[phoneIdx]),
                        email: clean(parts[emailIdx]),
                        reward_points: Number(clean(parts[pointsIdx])) || 0,
                        total_spent: Number(clean(parts[spentIdx])) || 0
                    };
                }).filter(Boolean);

                if (bulkData.length === 0) {
                    toast.error("Dosya boş veya uygun sütunlar bulunamadı (Ad/Telefon/Eposta)");
                    return;
                }

                const res = await fetch('/api/v1/customers/bulk', {
                    method: 'POST',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customers: bulkData })
                });

                if (res.ok) {
                    const result = await res.json();
                    toast.success(`${result.count || bulkData.length} kayıt işlendi (Yeni: ${result.success}, Atlanan: ${result.skipped || 0})`);
                    loadData();
                }
            } catch (err) {
                console.error(err);
                toast.error("CSV Okuma hatası - Lütfen standart bir format kullanın");
            }
        };
        reader.readAsText(file);
    };

    const handleSendCampaign = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/customers/campaign', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetIds: Array.from(selectedIds),
                    message: campaignMessage
                })
            });

            if (res.ok) {
                const result = await res.json();
                toast.success(`Kampanya tamamlandı: ${result.sentCount} mesaj gönderildi.`);
                setCampaignModal(false);
                setSelectedIds(new Set());
            } else {
                const err = await res.json();
                toast.error(err.error || 'Kampanya başarısız');
            }
        } catch (e) {
            toast.error('İşlem hatası');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === customers.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(customers.map(c => c.id)));
    };

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#F8FAFC]">
            {/* Header */}
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                        <FiUsers size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Müşteri CRM & Sadakat</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Portföy ve Kampanya Yönetimi</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl mr-2 animate-in slide-in-from-top">
                            <span className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">{selectedIds.size} SEÇİLDİ:</span>
                            <button onClick={() => setCampaignModal(true)} aria-label="Kampanya ata" title="Kampanya ata" className="p-2 bg-white rounded-lg text-orange-500 hover:bg-orange-50 shadow-sm transition-colors border border-orange-100"><FiMessageSquare size={14} /></button>
                            <button onClick={() => handleBulkAction('status', 'active')} aria-label="Aktif yap" title="Aktif yap" className="p-2 bg-white rounded-lg text-emerald-500 hover:bg-emerald-50 shadow-sm transition-colors border border-emerald-100"><FiCheck size={14} /></button>
                            <button onClick={() => handleBulkAction('status', 'passive')} aria-label="Pasif yap" title="Pasif yap" className="p-2 bg-white rounded-lg text-slate-400 hover:bg-slate-50 shadow-sm transition-colors border border-slate-200"><FiX size={14} /></button>
                            <button onClick={() => handleBulkAction('delete')} aria-label="Seçilenleri sil" title="Seçilenleri sil" className="p-2 bg-white rounded-lg text-red-500 hover:bg-red-50 shadow-sm transition-colors border border-red-100"><FiTrash2 size={14} /></button>
                        </div>
                    )}
                    <button onClick={exportToCSV} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 transition-all">
                        <FiDownload /> DIŞA AKTAR
                    </button>
                    <label className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 cursor-pointer transition-all">
                        <FiUpload /> İÇE AKTAR
                        <input type="file" className="hidden" accept=".csv" onChange={handleImport} />
                    </label>
                    <button 
                         onClick={() => { setSelectedCustomer({ id: 0, name: '', phone: '', email: '', reward_points: 0, total_spent: 0, loyalty_tier: 'bronze', customer_code: '', last_visit_at: null, status: 'active', email_subscription: true, whatsapp_subscription: true }); setModal(true); setActiveTab('info'); }}
                         className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-black text-white shadow-lg hover:bg-indigo-700 transition-all"
                    >
                        <FiPlus /> YENİ MÜŞTERİ
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8 space-y-8">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><FiUsers size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TOPLAM MÜŞTERİ</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">{stats?.total_customers || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center"><FiAward size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TOPLAM PUAN</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">{Math.floor(stats?.total_points_issued || 0)}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><FiStar size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">VIP MÜŞTERİ</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">{stats?.active_loyal_count || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold italic text-xl">{currency}</div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TOPLAM CİRO</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">{currency}{Number(stats?.total_crm_revenue || 0).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Table Area */}
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-50 flex items-center gap-4 bg-slate-50/30">
                        <div className="relative flex-1">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input 
                                type="text" 
                                placeholder="Müşteri ara..." 
                                className="w-full bg-white border-none rounded-2xl pl-12 pr-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button onClick={loadData} aria-label="Yenile" title="Yenile" className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-500">
                            <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/80 border-b border-slate-100">
                            <tr>
                                <th className="p-6 w-10">
                                    <input type="checkbox" checked={selectedIds.size === customers.length && customers.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                </th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Müşteri</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">İletişim</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sadakat / Puan</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {customers.map((c) => (
                                <tr key={c.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.has(c.id) ? 'bg-blue-50/30' : ''}`}>
                                    <td className="p-6">
                                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                    </td>
                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs">
                                                {c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0, 2)}
                                            </div>
                                            <div onClick={() => loadCustomerDetail(c.id)} className="cursor-pointer group">
                                                <p className="font-black text-slate-800 uppercase text-xs tracking-tight group-hover:text-blue-600 transition-colors">{c.name}</p>
                                                <p className="text-[10px] font-bold text-slate-400">#{c.customer_code || c.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <p className="font-bold text-slate-600 text-xs tabular-nums">{c.phone || '-'}</p>
                                        <p className="text-[10px] text-slate-400">{c.email || 'E-posta yok'}</p>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="font-black text-orange-600 text-sm tabular-nums">{c.reward_points} PT</span>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Harcama: {currency}{Number(c.total_spent).toLocaleString()}</span>
                                            </div>
                                            <div onClick={() => handleUpdateStatus(c.id, c.status === 'active' ? 'passive' : 'active')} className={`cursor-pointer px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${c.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}>
                                                {c.status === 'active' ? 'AKTİF' : 'PASİF'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6 text-right">
                                        <button onClick={() => loadCustomerDetail(c.id)} className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                                            <FiActivity size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Campaign Modal */}
            {campaignModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in transition-all">
                    <div className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-10 relative animate-in zoom-in-95 overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-orange-500" />
                        <h3 className="text-xl font-black text-slate-800 mb-2 uppercase italic tracking-tighter">İLETİŞİM KAMPANYASI</h3>
                        <p className="text-[10px] font-bold text-slate-400 mb-6 uppercase tracking-widest">TOPLAM {selectedIds.size} KİŞİYE GÖNDERİLECEK</p>
                        
                        <div className="flex gap-4 mb-6">
                            <button 
                                onClick={() => setCampaignType('whatsapp')}
                                className={`flex-1 p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${campaignType === 'whatsapp' ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}
                            >
                                <FiMessageSquare size={20} />
                                <span className="text-[10px] font-black uppercase tracking-widest">WhatsApp</span>
                            </button>
                            <button 
                                onClick={() => setCampaignType('email')}
                                className={`flex-1 p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${campaignType === 'email' ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}
                            >
                                <FiMail size={20} />
                                <span className="text-[10px] font-black uppercase tracking-widest">E-Posta</span>
                            </button>
                        </div>

                        <div className="space-y-6 mb-8">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">MESAJ İÇERİĞİ</label>
                                <textarea 
                                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20 h-40 resize-none transition-all"
                                    value={campaignMessage}
                                    onChange={(e) => setCampaignMessage(e.target.value)}
                                />
                                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Değişkenler: <span className="text-indigo-500">{`{name}`}</span></p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                            <button onClick={() => setCampaignModal(false)} className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">İPTAL</button>
                            <button 
                                onClick={handleSendCampaign}
                                disabled={loading}
                                className="px-10 py-4 bg-orange-500 text-white rounded-2xl text-[11px] font-black hover:bg-orange-600 transition-all uppercase tracking-widest disabled:opacity-50 shadow-lg shadow-orange-100"
                            >
                                {loading ? 'İŞLENİYOR...' : 'KAMPANYAYI BAŞLAT'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Detail / Edit Modal */}
            {modal && selectedCustomer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in transition-all">
                    <div className="w-full max-w-4xl bg-white rounded-[40px] shadow-2xl relative animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600" />
                        
                        {/* Modal Header */}
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-2xl">
                                    {selectedCustomer.name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">{selectedCustomer.name || 'YENİ MÜŞTERİ'}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{selectedCustomer.customer_code || 'PROTAS'}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${selectedCustomer.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {selectedCustomer.status === 'active' ? 'AKTİF PORTFÖY' : 'PASİF'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setModal(false)} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors">
                                <FiX size={24} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex px-8 border-b border-slate-50 bg-slate-50/30">
                            {[
                                { id: 'info', label: 'PROFİL BİLGİLERİ', icon: FiEdit2 },
                                { id: 'orders', label: 'SİPARİŞ GEÇMİŞİ', icon: FiClock },
                                { id: 'report', label: 'ANALİZ & RAPOR', icon: FiPieChart }
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id as any)}
                                    className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === t.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <t.icon size={14} />
                                    {t.label}
                                    {activeTab === t.id && <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-600 rounded-t-full" />}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-8">
                            {activeTab === 'info' && selectedCustomer && (
                                <form onSubmit={saveCustomer} className="grid grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">AD SOYAD ZORUNLU</label>
                                            <input 
                                                required
                                                className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                value={selectedCustomer.name}
                                                onChange={e => setSelectedCustomer({...selectedCustomer, name: e.target.value})}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">TELEFON</label>
                                                <input 
                                                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    value={selectedCustomer.phone || ''}
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">E-POSTA</label>
                                                <input 
                                                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    value={selectedCustomer.email || ''}
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, email: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100/50 flex items-center gap-6">
                                            <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                                                <img 
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${selectedCustomer.customer_code || selectedCustomer.id}`} 
                                                    alt="Customer QR"
                                                    className="w-20 h-20"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">MÜŞTERİ NUMARASI</p>
                                                <p className="text-xl font-black text-indigo-600 tracking-tighter">{selectedCustomer.customer_code || `ID: ${selectedCustomer.id}`}</p>
                                                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase italic">Bu kod fiziksel kart veya mobil tarama için kullanılabilir</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-6 pt-4">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!selectedCustomer.whatsapp_subscription} 
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, whatsapp_subscription: e.target.checked})} 
                                                    className="w-5 h-5 rounded-lg border-slate-200 text-indigo-600" 
                                                />
                                                <span className="text-[11px] font-black text-slate-600 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">WhatsApp Duyuru Kabul</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!selectedCustomer.email_subscription} 
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, email_subscription: e.target.checked})} 
                                                    className="w-5 h-5 rounded-lg border-slate-200 text-indigo-600" 
                                                />
                                                <span className="text-[11px] font-black text-slate-600 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">E-Posta Duyuru Kabul</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">MÜŞTERİ NOTLARI / ALERJİLER</label>
                                            <textarea 
                                                className="w-full bg-slate-50 border-none rounded-3xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 h-40 resize-none"
                                                value={selectedCustomer.notes || ''}
                                                onChange={e => setSelectedCustomer({...selectedCustomer, notes: e.target.value})}
                                            />
                                        </div>
                                        <div className="flex justify-end gap-3 pt-4">
                                            <button 
                                                type="submit" 
                                                disabled={isSaving}
                                                className="px-12 py-4 bg-indigo-600 text-white rounded-2xl text-[11px] font-black hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-xl shadow-indigo-100 disabled:opacity-50"
                                            >
                                                {isSaving ? 'KAYDEDİLİYOR...' : 'DEĞİŞİKLİKLERİ KAYDET'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {activeTab === 'orders' && (
                                <div className="space-y-4">
                                    {!selectedCustomer.recent_orders?.length ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                                            <FiClock size={48} className="mb-4 opacity-20" />
                                            <p className="text-sm font-black uppercase tracking-widest">Henüz sipariş kaydı bulunmuyor</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-slate-100">
                                                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarih</th>
                                                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Adisyon #</th>
                                                    <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Tutar</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {selectedCustomer.recent_orders.map((o: any) => (
                                                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-4 text-xs font-bold text-slate-500 tabular-nums">{new Date(o.created_at).toLocaleDateString()}</td>
                                                        <td className="py-4 text-xs font-black text-slate-800 uppercase tracking-tight">#{o.order_number}</td>
                                                        <td className="py-4 text-xs font-black text-indigo-600 text-right tabular-nums">{currency}{o.total_amount}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeTab === 'report' && report && (
                                <div className="grid grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="space-y-8">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">HARCAMA ANALİZİ</p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TOPLAM SİPARİŞ</p>
                                                    <p className="text-2xl font-black text-indigo-600 mt-1 tabular-nums">{report.summary.order_count}</p>
                                                </div>
                                                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ORT. SEPET</p>
                                                    <p className="text-2xl font-black text-indigo-600 mt-1 tabular-nums">{currency}{Math.round(report.summary.avg_order_value)}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">FAVORİ ÜRÜNLER</p>
                                            <div className="space-y-3">
                                                {report.favoriteProducts.map((p: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-1.5">
                                                        <div className="flex justify-between text-[11px] font-black text-slate-700 uppercase tracking-tight">
                                                            <span>{p.product_name}</span>
                                                            <span className="text-slate-400">{p.count} KEZ</span>
                                                        </div>
                                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                                                                style={{ width: `${(p.count / report.favoriteProducts[0].count) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-8">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">AYLIK ZİYARET TRENDİ</p>
                                            <div className="flex items-end gap-3 h-48 pt-4">
                                                {report.visitHistory.length === 0 ? (
                                                    <div className="w-full flex items-center justify-center text-slate-200">
                                                        <FiActivity size={32} />
                                                    </div>
                                                ) : (
                                                    report.visitHistory.map((v: any, i: number) => (
                                                        <div key={i} className="flex-1 flex flex-col items-center gap-3">
                                                            <div className="w-full bg-indigo-100 rounded-t-xl group relative cursor-help" style={{ height: `${(v.count / Math.max(...report.visitHistory.map((x: any) => x.count))) * 100}%` }}>
                                                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {v.count} SİP
                                                                </div>
                                                            </div>
                                                            <span className="text-[8px] font-black text-slate-400 uppercase">{new Date(v.month).toLocaleString('tr', { month: 'short' })}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-2xl shadow-indigo-200 relative overflow-hidden">
                                            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12"><FiAward size={120} /></div>
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">SADAKAT SEGMENTİ</p>
                                            <p className="text-3xl font-black mt-2 tracking-tighter uppercase italic">{selectedCustomer.loyalty_tier || 'BRONZE'}</p>
                                            <p className="text-[11px] font-medium mt-4 opacity-80 leading-relaxed">
                                                {selectedCustomer.name} işletmenizde toplam <span className="font-black">{currency}{Number(selectedCustomer.total_spent).toLocaleString()}</span> harcama yaptı.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};
