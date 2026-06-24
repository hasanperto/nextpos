import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
    const [campaignMessage, setCampaignMessage] = useState('');
    const [campaignType, setCampaignType] = useState<'whatsapp' | 'email'>('whatsapp');
    const [activeTab, setActiveTab] = useState<'info' | 'orders' | 'report'>('info');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setCampaignMessage(t('admin.customers.campaign.defaultMessage'));
    }, [t]);

    const profileTabs = useMemo(() => [
        { id: 'info' as const, label: t('admin.customers.tab.profile'), icon: FiEdit2 },
        { id: 'orders' as const, label: t('admin.customers.tab.orders'), icon: FiClock },
        { id: 'report' as const, label: t('admin.customers.tab.report'), icon: FiPieChart },
    ], [t]);

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
            toast.error(t('admin.customers.toast.detailFailed'));
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
                toast.success(t('admin.customers.toast.statusUpdated'));
                loadData();
            }
        } catch (e) {
            toast.error(t('admin.customers.toast.operationFailed'));
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
                toast.success(t('admin.customers.toast.bulkDone'));
                setSelectedIds(new Set());
                loadData();
            }
        } catch (e) {
            toast.error(t('admin.customers.toast.bulkFailed'));
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
                toast.success(t('admin.customers.toast.saved'));
                setModal(false);
                loadData();
            }
        } catch (e) {
            toast.error(t('admin.customers.toast.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const exportToCSV = () => {
        if (customers.length === 0) return;
        const headers = [
            t('admin.customers.csv.id'),
            t('admin.customers.csv.name'),
            t('admin.customers.csv.phone'),
            t('admin.customers.csv.email'),
            t('admin.customers.csv.points'),
            t('admin.customers.csv.spent'),
            t('admin.customers.csv.segment'),
        ];
        const rows = customers.map(row => [
            row.id, row.name, row.phone || '', row.email || '', 
            row.reward_points, row.total_spent, row.loyalty_tier.toUpperCase()
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
                    toast.error(t('admin.customers.toast.importEmpty'));
                    return;
                }

                const res = await fetch('/api/v1/customers/bulk', {
                    method: 'POST',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customers: bulkData })
                });

                if (res.ok) {
                    const result = await res.json();
                    toast.success(
                        t('admin.customers.toast.importDone')
                            .replace('{{total}}', String(result.count || bulkData.length))
                            .replace('{{success}}', String(result.success))
                            .replace('{{skipped}}', String(result.skipped || 0))
                    );
                    loadData();
                }
            } catch (err) {
                console.error(err);
                toast.error(t('admin.customers.toast.importError'));
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
                toast.success(t('admin.customers.toast.campaignDone').replace('{{count}}', String(result.sentCount)));
                setCampaignModal(false);
                setSelectedIds(new Set());
            } else {
                const err = await res.json();
                toast.error(err.error || t('admin.customers.toast.campaignFailed'));
            }
        } catch (e) {
            toast.error(t('admin.customers.toast.processError'));
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
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            {/* Ambient glows */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px]" />
            </div>

            {/* Header */}
            <header className="flex flex-col md:flex-row gap-4 md:h-20 shrink-0 md:items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md p-4 md:px-8 z-10">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-600/10 border border-blue-500/35 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                        <FiUsers size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white uppercase italic tracking-tight">{t('admin.customers.title')}</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{t('admin.customers.subtitle')}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                    {selectedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/5 rounded-xl md:mr-2 animate-in slide-in-from-top">
                            <span className="text-[9px] font-black text-slate-500 mr-2 uppercase tracking-wider">{t('admin.customers.selectedCount').replace('{{count}}', String(selectedIds.size))}</span>
                            <button onClick={() => setCampaignModal(true)} aria-label={t('admin.customers.assignCampaign')} title={t('admin.customers.assignCampaign')} className="p-2 bg-white/5 hover:bg-orange-500/20 text-orange-400 rounded-lg shadow-sm transition-all border border-orange-500/20 cursor-pointer"><FiMessageSquare size={13} /></button>
                            <button onClick={() => handleBulkAction('status', 'active')} aria-label={t('admin.customers.setActive')} title={t('admin.customers.setActive')} className="p-2 bg-white/5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg shadow-sm transition-all border border-emerald-500/20 cursor-pointer"><FiCheck size={13} /></button>
                            <button onClick={() => handleBulkAction('status', 'passive')} aria-label={t('admin.customers.setPassive')} title={t('admin.customers.setPassive')} className="p-2 bg-white/5 hover:bg-slate-700/50 text-slate-400 rounded-lg shadow-sm transition-all border border-white/10 cursor-pointer"><FiX size={13} /></button>
                            <button onClick={() => handleBulkAction('delete')} aria-label={t('admin.customers.deleteSelected')} title={t('admin.customers.deleteSelected')} className="p-2 bg-white/5 hover:bg-rose-500/20 text-rose-400 rounded-lg shadow-sm transition-all border border-rose-500/20 cursor-pointer"><FiTrash2 size={13} /></button>
                        </div>
                    )}
                    <button onClick={exportToCSV} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 text-xs font-black text-slate-300 hover:text-white transition-all cursor-pointer">
                        <FiDownload /> {t('admin.customers.export')}
                    </button>
                    <label className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 text-xs font-black text-slate-300 hover:text-white cursor-pointer transition-all">
                        <FiUpload /> {t('admin.customers.import')}
                        <input type="file" className="hidden" accept=".csv" onChange={handleImport} />
                    </label>
                    <button 
                         onClick={() => { setSelectedCustomer({ id: 0, name: '', phone: '', email: '', reward_points: 0, total_spent: 0, loyalty_tier: 'bronze', customer_code: '', last_visit_at: null, status: 'active', email_subscription: true, whatsapp_subscription: true }); setModal(true); setActiveTab('info'); }}
                         className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                    >
                        <FiPlus /> {t('admin.customers.addNew')}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-4 md:p-8 space-y-8 z-10">
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-blue-400 flex items-center justify-center border border-white/5"><FiUsers size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.stat.total')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{stats?.total_customers || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-amber-400 flex items-center justify-center border border-white/5"><FiAward size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.stat.points')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{Math.floor(stats?.total_points_issued || 0)}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-emerald-400 flex items-center justify-center border border-white/5"><FiStar size={24} /></div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.stat.vip')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{stats?.active_loyal_count || 0}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] shadow-xl flex items-center gap-5 hover:border-white/15 transition-all">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 text-indigo-400 flex items-center justify-center border border-white/5 font-bold italic text-xl">{currency}</div>
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.stat.revenue')}</p>
                            <p className="text-2xl font-black text-white tabular-nums">{currency}{Number(stats?.total_crm_revenue || 0).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Table Area */}
                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] shadow-2xl overflow-hidden backdrop-blur-md">
                    <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-white/[0.01]">
                        <div className="relative flex-1">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                type="text" 
                                placeholder={t('admin.customers.searchPh')} 
                                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button onClick={loadData} aria-label={t('admin.customers.refresh')} title={t('admin.customers.refresh')} className="p-3 bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:bg-white/10 cursor-pointer">
                            <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-white/[0.01] border-b border-white/5 select-none">
                                <tr>
                                    <th className="p-6 w-10">
                                        <input type="checkbox" checked={selectedIds.size === customers.length && customers.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                    </th>
                                    <th className="p-6 text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.customers.col.customer')}</th>
                                    <th className="p-6 text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.customers.col.contact')}</th>
                                    <th className="p-6 text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.customers.col.loyalty')}</th>
                                    <th className="p-6 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-bold">
                                {customers.map((row) => (
                                    <tr key={row.id} className={`hover:bg-white/[0.03] transition-colors ${selectedIds.has(row.id) ? 'bg-blue-600/10' : ''}`}>
                                        <td className="p-6">
                                            <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)} className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-black text-slate-300 text-xs shrink-0 border border-white/5">
                                                    {row.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                                <div onClick={() => loadCustomerDetail(row.id)} className="cursor-pointer group min-w-0">
                                                    <p className="font-black text-white uppercase text-xs tracking-tight group-hover:text-blue-400 transition-colors truncate">{row.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-500">#{row.customer_code || row.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <p className="font-bold text-slate-300 text-xs tabular-nums">{row.phone || '-'}</p>
                                            <p className="text-[10px] text-slate-500 font-medium">{row.email || t('admin.customers.noEmail')}</p>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-orange-400 text-sm tabular-nums">{t('admin.customers.points').replace('{{count}}', String(row.reward_points))}</span>
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mt-0.5">{t('admin.customers.spent').replace('{{amount}}', `${currency}${Number(row.total_spent).toLocaleString()}`)}</span>
                                                </div>
                                                <div onClick={() => handleUpdateStatus(row.id, row.status === 'active' ? 'passive' : 'active')} className={`cursor-pointer px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${row.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700/50 hover:bg-slate-700'}`}>
                                                    {row.status === 'active' ? t('admin.customers.status.active') : t('admin.customers.status.passive')}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button onClick={() => loadCustomerDetail(row.id)} className="p-2 rounded-lg bg-white/5 text-slate-300 hover:bg-blue-600 hover:text-white transition-all shadow-sm cursor-pointer">
                                                <FiActivity size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Campaign Modal */}
            {campaignModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in transition-all">
                    <div className="w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-[32px] shadow-2xl p-6 sm:p-10 relative animate-in zoom-in-95 overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500" />
                        <h3 className="text-xl font-black text-white mb-2 uppercase italic tracking-tighter">{t('admin.customers.campaign.title')}</h3>
                        <p className="text-[9px] font-bold text-slate-500 mb-6 uppercase tracking-widest">{t('admin.customers.campaign.recipients').replace('{{count}}', String(selectedIds.size))}</p>
                        
                        <div className="flex gap-4 mb-6">
                            <button 
                                onClick={() => setCampaignType('whatsapp')}
                                className={`flex-1 p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 cursor-pointer ${campaignType === 'whatsapp' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md' : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'}`}
                            >
                                <FiMessageSquare size={20} />
                                <span className="text-[9px] font-extrabold uppercase tracking-wider">{t('admin.customers.campaign.whatsapp')}</span>
                            </button>
                            <button 
                                onClick={() => setCampaignType('email')}
                                className={`flex-1 p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 cursor-pointer ${campaignType === 'email' ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-md' : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'}`}
                            >
                                <FiMail size={20} />
                                <span className="text-[9px] font-extrabold uppercase tracking-wider">{t('admin.customers.campaign.email')}</span>
                            </button>
                        </div>

                        <div className="space-y-6 mb-8">
                            <div>
                                <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">{t('admin.customers.campaign.messageLabel')}</label>
                                <textarea 
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-orange-500/20 h-40 resize-none transition-all"
                                    value={campaignMessage}
                                    onChange={(e) => setCampaignMessage(e.target.value)}
                                />
                                <p className="text-[10px] text-slate-500 mt-2 font-medium italic">{t('admin.customers.campaign.variables')} <span className="text-indigo-400 font-bold">{`{name}`}</span></p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-6 border-t border-white/5">
                            <button onClick={() => setCampaignModal(false)} className="px-6 py-4 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest cursor-pointer">{t('admin.customers.cancel')}</button>
                            <button 
                                onClick={handleSendCampaign}
                                disabled={loading}
                                className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl text-[10px] font-black hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50 shadow-lg shadow-orange-600/20 cursor-pointer"
                            >
                                {loading ? t('admin.customers.processing') : t('admin.customers.campaign.start')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Detail / Edit Modal */}
            {modal && selectedCustomer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in transition-all">
                    <div className="w-full max-w-4xl bg-[#0f172a] border border-white/10 rounded-[32px] shadow-2xl relative animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600" />
                        
                        {/* Modal Header */}
                        <div className="p-6 sm:p-8 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-indigo-400 font-black text-2xl">
                                    {selectedCustomer.name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tighter uppercase">{selectedCustomer.name || t('admin.customers.modal.newCustomer')}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">#{selectedCustomer.customer_code || 'PROTAS'}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${selectedCustomer.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                                            {selectedCustomer.status === 'active' ? t('admin.customers.modal.activePortfolio') : t('admin.customers.modal.passive')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setModal(false)} className="p-3 hover:bg-white/5 rounded-2xl text-slate-400 transition-colors cursor-pointer">
                                <FiX size={24} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex overflow-x-auto no-scrollbar px-4 sm:px-8 border-b border-white/5 bg-white/[0.01] shrink-0">
                            {profileTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-6 py-4 text-[9px] font-extrabold uppercase tracking-wider transition-all duration-300 relative cursor-pointer shrink-0 ${activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                    {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-indigo-500 rounded-t-full shadow-[0_0_8px_rgba(99,102,241,0.9)] animate-pulse" />}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-4 sm:p-8">
                            {activeTab === 'info' && selectedCustomer && (
                                <form onSubmit={saveCustomer} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">{t('admin.customers.form.nameRequired')}</label>
                                            <input 
                                                required
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                value={selectedCustomer.name}
                                                onChange={e => setSelectedCustomer({...selectedCustomer, name: e.target.value})}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">{t('admin.customers.form.phone')}</label>
                                                <input 
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    value={selectedCustomer.phone || ''}
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">{t('admin.customers.form.email')}</label>
                                                <input 
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    value={selectedCustomer.email || ''}
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, email: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-6 bg-white/[0.02] rounded-[32px] border border-white/5 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                                            <div className="bg-white p-3 rounded-2xl shadow-sm border border-transparent shrink-0">
                                                <img 
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${selectedCustomer.customer_code || selectedCustomer.id}`} 
                                                    alt="Customer QR"
                                                    className="w-20 h-20"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.form.customerNumber')}</p>
                                                <p className="text-xl font-black text-indigo-400 tracking-tighter">{selectedCustomer.customer_code || `ID: ${selectedCustomer.id}`}</p>
                                                <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase italic leading-normal">{t('admin.customers.form.qrHint')}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-6 pt-2">
                                            <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!selectedCustomer.whatsapp_subscription} 
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, whatsapp_subscription: e.target.checked})} 
                                                    className="w-5 h-5 rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-indigo-500" 
                                                />
                                                <span className="text-[10px] font-extrabold text-slate-300 group-hover:text-indigo-400 transition-colors uppercase tracking-wider">{t('admin.customers.form.whatsappOptIn')}</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!selectedCustomer.email_subscription} 
                                                    onChange={e => setSelectedCustomer({...selectedCustomer, email_subscription: e.target.checked})} 
                                                    className="w-5 h-5 rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-indigo-500" 
                                                />
                                                <span className="text-[10px] font-extrabold text-slate-300 group-hover:text-indigo-400 transition-colors uppercase tracking-wider">{t('admin.customers.form.emailOptIn')}</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="space-y-6 flex flex-col justify-between">
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">{t('admin.customers.form.notes')}</label>
                                            <textarea 
                                                className="w-full bg-black/40 border border-white/10 rounded-3xl px-5 py-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500/20 h-40 resize-none"
                                                value={selectedCustomer.notes || ''}
                                                onChange={e => setSelectedCustomer({...selectedCustomer, notes: e.target.value})}
                                            />
                                        </div>
                                        <div className="flex justify-end gap-3 pt-4 w-full">
                                            <button 
                                                type="submit" 
                                                disabled={isSaving}
                                                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest shadow-xl shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                                            >
                                                {isSaving ? t('admin.customers.saving') : t('admin.customers.saveChanges')}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {activeTab === 'orders' && (
                                <div className="space-y-4">
                                    {!selectedCustomer.recent_orders?.length ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                                            <FiClock size={48} className="mb-4 opacity-20" />
                                            <p className="text-xs font-black uppercase tracking-widest">{t('admin.customers.orders.empty')}</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/5 select-none">
                                                    <th className="py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.customers.orders.col.date')}</th>
                                                    <th className="py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('admin.customers.orders.col.check')}</th>
                                                    <th className="py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">{t('admin.customers.orders.col.amount')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 font-bold">
                                                {selectedCustomer.recent_orders.map((o: any) => (
                                                    <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="py-4 text-xs font-bold text-slate-400 tabular-nums">{new Date(o.created_at).toLocaleDateString()}</td>
                                                        <td className="py-4 text-xs font-black text-white uppercase tracking-tight">#{o.order_number}</td>
                                                        <td className="py-4 text-xs font-black text-indigo-400 text-right tabular-nums">{currency}{o.total_amount}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeTab === 'report' && report && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="space-y-8">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6 select-none">{t('admin.customers.report.spendingAnalysis')}</p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl shadow-xl">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.report.totalOrders')}</p>
                                                    <p className="text-2xl font-black text-indigo-400 mt-1 tabular-nums">{report.summary.order_count}</p>
                                                </div>
                                                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl shadow-xl">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('admin.customers.report.avgBasket')}</p>
                                                    <p className="text-2xl font-black text-indigo-400 mt-1 tabular-nums">{currency}{Math.round(report.summary.avg_order_value)}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6 select-none">{t('admin.customers.report.favorites')}</p>
                                            <div className="space-y-3.5">
                                                {report.favoriteProducts.map((p: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-1.5">
                                                        <div className="flex justify-between text-[11px] font-black text-slate-300 uppercase tracking-tight">
                                                            <span>{p.product_name}</span>
                                                            <span className="text-slate-500">{t('admin.customers.report.times').replace('{{count}}', String(p.count))}</span>
                                                        </div>
                                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
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
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6 select-none">{t('admin.customers.report.visitTrend')}</p>
                                            <div className="flex items-end gap-3 h-48 pt-4">
                                                {report.visitHistory.length === 0 ? (
                                                    <div className="w-full flex items-center justify-center text-slate-500">
                                                        <FiActivity size={32} />
                                                    </div>
                                                ) : (
                                                    report.visitHistory.map((v: any, i: number) => (
                                                        <div key={i} className="flex-1 flex flex-col items-center gap-3">
                                                            <div className="w-full bg-indigo-500/20 hover:bg-indigo-500/40 rounded-t-xl group relative cursor-help transition-colors" style={{ height: `${(v.count / Math.max(...report.visitHistory.map((x: any) => x.count))) * 100}%` }}>
                                                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-white/10 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
                                                                    {t('admin.customers.report.ordersShort').replace('{{count}}', String(v.count))}
                                                                </div>
                                                            </div>
                                                            <span className="text-[8px] font-black text-slate-500 uppercase">{new Date(v.month).toLocaleString('tr', { month: 'short' })}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[40px] text-white shadow-2xl relative overflow-hidden">
                                            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12"><FiAward size={120} /></div>
                                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60 select-none">{t('admin.customers.report.loyaltySegment')}</p>
                                            <p className="text-3xl font-black mt-2 tracking-tighter uppercase italic">{selectedCustomer.loyalty_tier || 'BRONZE'}</p>
                                            <p className="text-[11px] font-medium mt-4 opacity-80 leading-relaxed">
                                                {t('admin.customers.report.spentSummary')
                                                    .replace('{{name}}', selectedCustomer.name)
                                                    .replace('{{amount}}', `${currency}${Number(selectedCustomer.total_spent).toLocaleString()}`)}
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
