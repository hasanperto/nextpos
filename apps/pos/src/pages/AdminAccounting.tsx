import React, { useState, useEffect } from 'react';
import { 
    FiDollarSign, FiSearch, FiRefreshCcw, FiEdit, 
    FiCheckCircle, FiXCircle, FiCalendar, FiFileText, FiGift, FiTrendingUp
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';

interface Transaction {
    id: number;
    total_amount: number;
    payment_status: string;
    status: string;
    notes: string | null;
    deleted_at?: string | null;
    deleted_by?: number | null;
    delete_reason?: string | null;
    created_at: string;
    table_name: string | null;
    waiter_name: string | null;
    items: {
        id: number;
        product_name: string;
        quantity: number;
        unit_price: number;
        total_price: number;
        status: string;
    }[];
}

export const AdminAccounting: React.FC = () => {
    const { isAuthenticated, token, tenantId, refreshTokenAction } = useAuthStore();
    const { settings, fetchSettings } = usePosStore();
    const currency = settings?.currency || '€';
    const [type, setType] = useState<'sales' | 'cancelled' | 'deleted'>('sales');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({ total_amount: 0, status: '', notes: '' });
    // Muhasebe silme işlevi (deletingId, deleteReason) planda belirtildiği gibi tamamen kaldırıldı.
    // Muhasebede sadece storno (iptal/iade) işlemi yapılmalıdır.
    const [visibility, setVisibility] = useState<{ hideCancelled: boolean; hideDeleted: boolean }>({
        hideCancelled: false,
        hideDeleted: false,
    });

    const [summary, setSummary] = useState({
        today_turnover: 0,
        total_turnover: 0,
        total_cancelled: 0,
        total_discount: 0
    });

    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        minAmount: '',
        maxAmount: '',
        paymentMethod: 'all',
        waiterName: 'all',
        showPanel: false
    });

    const fetchTransactions = async (retry = true) => {
        if (!isAuthenticated || !token || !tenantId) return;
        if (type === 'cancelled' && visibility.hideCancelled) {
            setTransactions([]);
            setLoading(false);
            return;
        }
        if (type === 'deleted' && visibility.hideDeleted) {
            setTransactions([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/accounting?type=${type}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId,
                    'Content-Type': 'application/json'
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions);
                setSummary(data.summary);
            } else if (res.status === 401 && retry) {
                const success = await refreshTokenAction();
                if (success) setTimeout(() => fetchTransactions(false), 200);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (isAuthenticated && token && tenantId) {
            fetchTransactions();
            void fetchSettings();
        }
    }, [type, isAuthenticated, token, tenantId, visibility.hideCancelled, visibility.hideDeleted]);

    useEffect(() => {
        if (!isAuthenticated || !token || !tenantId) return;
        const load = async () => {
            try {
                const res = await fetch('/api/v1/admin/settings', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-tenant-id': tenantId,
                    },
                });
                if (!res.ok) return;
                const data = await res.json();
                const v = data?.accountingVisibility || {};
                setVisibility({
                    hideCancelled: Boolean(v.hideCancelled),
                    hideDeleted: Boolean(v.hideDeleted),
                });
            } catch {
                /* ignore */
            }
        };
        void load();
    }, [isAuthenticated, token, tenantId]);

    useEffect(() => {
        if (type === 'cancelled' && visibility.hideCancelled) setType('sales');
        if (type === 'deleted' && visibility.hideDeleted) setType('sales');
    }, [type, visibility.hideCancelled, visibility.hideDeleted]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing || !token || !tenantId) return;
        try {
            const res = await fetch(`/api/v1/admin/accounting/${editing.id}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify(editForm)
            });
            if (res.ok) {
                setEditing(null);
                fetchTransactions();
            } else if (res.status === 401) {
                const refreshed = await refreshTokenAction();
                if (refreshed) handleUpdate(e);
            }
        } catch { toast.error('İşlem kaydedilemedi. İnternet bağlantısını kontrol edip tekrar deneyin.'); }
    };

    // Silme (confirmDelete) ve Geri Alma (restoreTransaction) fonksiyonları güvenlik gereği tamamen kaldırıldı.

    const filtered = transactions.filter(t => {
        const textMatch = t.id.toString().includes(search) || 
            (t.table_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (t.waiter_name || '').toLowerCase().includes(search.toLowerCase());
        
        if (!textMatch) return false;

        if (filters.startDate) {
            const start = new Date(filters.startDate).getTime();
            const created = new Date(t.created_at).getTime();
            if (created < start) return false;
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate).setHours(23,59,59,999);
            const created = new Date(t.created_at).getTime();
            if (created > end) return false;
        }

        if (filters.minAmount && Number(t.total_amount) < Number(filters.minAmount)) return false;
        if (filters.maxAmount && Number(t.total_amount) > Number(filters.maxAmount)) return false;

        if (filters.waiterName !== 'all' && t.waiter_name !== filters.waiterName) return false;
        const tObj = t as any;
        if (filters.paymentMethod !== 'all' && tObj.payment_method !== filters.paymentMethod) return false;

        return true;
    });

    const uniqueWaiters = Array.from(new Set(transactions.map(t => t.waiter_name).filter(Boolean)));
    const uniquePaymentMethods = Array.from(new Set(transactions.map(t => (t as any).payment_method).filter(Boolean)));

    return (
        <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 font-sans relative">
            {/* Background Ambient Glow */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-600/5 rounded-full blur-[180px] -z-10" />

            <header className="flex h-24 shrink-0 items-center justify-between border-b border-white/5 bg-slate-900/40 backdrop-blur-3xl px-10 shadow-2xl relative z-10">
                <div className="flex items-center gap-6">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                        <FiDollarSign size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Muhasebe</h2>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mt-2">Satış / İptal / İade kayıtları</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <FiSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                        <input 
                            placeholder="İşlem ID veya masa adı ara..." 
                            aria-label="İşlem arama"
                            className="bg-white/5 border border-white/10 rounded-[1.5rem] pl-12 pr-6 py-3.5 text-xs font-black text-white outline-none focus:border-emerald-500/50 focus:bg-white/[0.08] transition-all w-80 tracking-wide"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={() => setFilters({...filters, showPanel: !filters.showPanel})} 
                        aria-label="Filtreleri aç/kapat"
                        className={`px-6 py-3.5 flex items-center gap-3 rounded-[1.5rem] border font-black text-xs uppercase tracking-widest transition-all ${filters.showPanel ? 'bg-emerald-500 text-white border-emerald-500 shadow-xl shadow-emerald-900/20' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}
                    >
                         <FiFileText size={16}/> Filtreler
                    </button>
                    <button 
                         onClick={() => fetchTransactions()} 
                         aria-label="Yenile"
                         className="p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-500 hover:text-emerald-400 hover:border-emerald-400/30 transition-all active:scale-95"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} size={20} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 px-10 py-10 bg-black/20 border-b border-white/5 shrink-0">
                    <SummaryCard title="Live Daily Volume" value={summary.today_turnover} icon={<FiDollarSign/>} color="emerald" />
                    <SummaryCard title="Global Turnover" value={summary.total_turnover} icon={<FiTrendingUp/>} color="blue" />
                    <SummaryCard title="Terminal Void Loss" value={summary.total_cancelled} icon={<FiXCircle/>} color="rose" />
                    <SummaryCard title="Loyalty & Discount" value={summary.total_discount} icon={<FiGift/>} color="amber" />
                </div>

                {filters.showPanel && (
                    <div className="bg-slate-900/60 backdrop-blur-3xl border-b border-white/5 px-10 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8 animate-in slide-in-from-top duration-500">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Temporal Range</label>
                            <div className="flex items-center gap-3">
                                <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none transition-all" />
                                <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none transition-all" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Threshold ({currency})</label>
                            <div className="flex items-center gap-3">
                                <input placeholder="MIN" value={filters.minAmount} onChange={e => setFilters({...filters, minAmount: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none transition-all" />
                                <input placeholder="MAX" value={filters.maxAmount} onChange={e => setFilters({...filters, maxAmount: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none transition-all" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gateway Channel</label>
                            <select value={filters.paymentMethod} onChange={e => setFilters({...filters, paymentMethod: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none transition-all uppercase tracking-widest">
                                <option value="all">ALL CHANNELS</option>
                                {uniquePaymentMethods.map(m => <option key={m} value={m} className="bg-slate-900">{m?.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Personnel Matrix</label>
                            <select value={filters.waiterName} onChange={e => setFilters({...filters, waiterName: e.target.value})} className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-[10px] font-black text-white focus:border-emerald-500 outline-none transition-all uppercase tracking-widest">
                                <option value="all">ALL STAFF</option>
                                {uniqueWaiters.map(w => <option key={w} value={w!} className="bg-slate-900">{w?.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button 
                                onClick={() => setFilters({ startDate: '', endDate: '', minAmount: '', maxAmount: '', paymentMethod: 'all', waiterName: 'all', showPanel: true })}
                                className="w-full h-[46px] bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all"
                            > Reset Protocol
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-slate-950/40 backdrop-blur-md px-10 flex items-center gap-10 shrink-0 border-b border-white/5">
                    <TabBtn id="sales" active={type} onClick={() => setType('sales')} label="SUCCESSFUL TRANSACTIONS" icon={<FiCheckCircle/>}/>
                    {!visibility.hideCancelled && (
                        <TabBtn id="cancelled" active={type} onClick={() => setType('cancelled')} label="VOID & CANCELLED LOGS" icon={<FiXCircle/>}/>
                    )}
                    {/* Silinenler sekmesi de güvenlik gereği (sadece storno kuralı) arayüzden gizlendi. */}
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
                    {filtered.map(t => (
                        <div key={t.id} className="bg-slate-900/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/5 p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 group transition-all hover:bg-white/[0.03] hover:translate-x-1 border-l-8" style={{borderLeftColor: type === 'sales' ? '#10b981' : '#f43f5e'}}>
                            <div className="flex items-center gap-8 flex-1">
                                <div className="h-20 w-20 rounded-[2rem] bg-black/40 border border-white/5 flex flex-col items-center justify-center opacity-60 group-hover:opacity-100 transition-all">
                                    <span className="text-[10px] font-black text-slate-500 leading-none mb-1 tracking-tighter">ID</span>
                                    <span className="text-xl font-black text-white italic tracking-tighter">#{t.id}</span>
                                </div>
                                <div className="space-y-4 flex-1">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-xl font-black text-white italic tracking-tighter uppercase">
                                            {t.table_name ? `${t.table_name}` : 'EXPRESS DELIVERY'}
                                        </h4>
                                        <div className="flex gap-2">
                                            {(t as any).payment_method && (
                                                <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black rounded-lg uppercase tracking-widest transition-all group-hover:bg-indigo-500 group-hover:text-white">
                                                    {(t as any).payment_method.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {t.items?.map((item, idx) => (
                                            <span key={idx} className="text-[11px] font-bold text-slate-500 bg-white/[0.02] border border-white/5 px-3 py-1 rounded-xl">
                                                <span className="text-emerald-400 font-black">{item.quantity}x</span> {item.product_name}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-4 text-[9px] font-black text-slate-600 uppercase tracking-widest italic">
                                        <span className="flex items-center gap-2"><FiCalendar/> {new Date(t.created_at).toLocaleString()}</span>
                                        {t.notes && <span className="text-rose-400 flex items-center gap-2 underline decoration-rose-500/30">PROTOCOL NOTE: {t.notes}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-10">
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Transactional Value</p>
                                    <p className={`text-4xl font-black italic tracking-tighter tabular-nums ${type === 'sales' ? 'text-emerald-400' : 'text-slate-600 line-through'}`}>
                                        {currency}{Number(t.total_amount).toFixed(2)}
                                    </p>
                                </div>
                                <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                    {type !== 'deleted' && (
                                        <button 
                                            onClick={() => { setEditing(t); setEditForm({ total_amount: Number(t.total_amount), status: t.status, notes: t.notes || '' }); }}
                                            className="w-14 h-14 rounded-[1.2rem] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all active:scale-90"
                                        >
                                            <FiEdit size={20}/>
                                        </button>
                                    )}
                                    {/* Silme (FiTrash2) ve Geri Alma (FiRefreshCcw) butonları kaldırıldı */}
                                </div>
                            </div>
                        </div>
                    ))}

                    {filtered.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center py-40 opacity-20">
                            <FiFileText size={80} className="mb-6 animate-pulse" />
                            <h4 className="text-xl font-black italic tracking-[0.5em] text-white">RECORDS_EMPTY</h4>
                        </div>
                    )}
                </div>
            </div>

            {editing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xl p-8">
                    <form onSubmit={handleUpdate} className="w-full max-w-xl rounded-[3rem] bg-slate-900 border border-white/10 p-12 shadow-2xl animate-in zoom-in-95 duration-500">
                        <header className="flex items-center gap-6 mb-12 border-b border-white/5 pb-8">
                             <div className="w-16 h-16 rounded-3xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                                 <FiEdit size={28}/>
                             </div>
                             <div>
                                 <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Operational Override</h3>
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Transaction Identity: #{editing.id}</p>
                             </div>
                        </header>

                        <div className="space-y-8 mb-12">
                             <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Value Adjustment ({currency})</label>
                                <input 
                                    type="number" step="0.01" 
                                    className="w-full rounded-2xl border border-white/5 bg-black/40 px-6 py-5 text-2xl font-black text-white focus:border-indigo-500/50 outline-none transition-all shadow-inner"
                                    value={editForm.total_amount} 
                                    onChange={e => setEditForm({...editForm, total_amount: Number(e.target.value)})} 
                                />
                             </div>
                             <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Lifecycle Status</label>
                                <select 
                                    className="w-full rounded-2xl border border-white/5 bg-black/40 px-6 py-5 text-sm font-black text-white focus:border-indigo-500/50 outline-none transition-all uppercase tracking-widest"
                                    value={editForm.status} 
                                    onChange={e => setEditForm({...editForm, status: e.target.value})}
                                >
                                    <option value="completed" className="bg-slate-900">VERIFIED SETTLEMENT</option>
                                    <option value="cancelled" className="bg-slate-900">VOIDED / TERMINATED</option>
                                </select>
                             </div>
                             <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Override Rationale</label>
                                <textarea
                                    className="w-full rounded-2xl border border-white/5 bg-black/40 px-6 py-5 text-sm font-bold text-white focus:border-indigo-500/50 outline-none transition-all min-h-[120px]"
                                    placeholder="Not ekleyin (örn. iade/iptal nedeni)..."
                                    value={editForm.notes} 
                                    onChange={e => setEditForm({...editForm, notes: e.target.value})}
                                />
                             </div>
                        </div>

                        <div className="flex justify-end gap-6">
                            <button type="button" onClick={() => setEditing(null)} className="px-8 py-5 text-xs font-black text-slate-500 hover:text-white transition-all uppercase tracking-widest">Vazgeç</button>
                            <button type="submit" className="px-10 py-5 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.3em] shadow-xl shadow-indigo-900/20 active:scale-95 transition-all">Kaydet</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Silme doğrulama modalı (deletingId) sistemden çıkarıldı */}
        </main>
    );
};

const SummaryCard: React.FC<{ title: string, value: number, icon: any, color: string }> = ({ title, value, icon, color }) => {
    const { settings } = usePosStore();
    const currency = settings?.currency || '€';
    const colorConfigs: any = {
        emerald: 'from-emerald-600/20 to-emerald-950/40 border-emerald-500/20 text-emerald-400',
        blue: 'from-blue-600/20 to-blue-950/40 border-blue-500/20 text-blue-400',
        rose: 'from-rose-600/20 to-rose-950/40 border-rose-500/20 text-rose-400',
        amber: 'from-amber-600/20 to-amber-950/40 border-amber-500/20 text-amber-400'
    };
    return (
        <div className={`bg-gradient-to-br ${colorConfigs[color]} p-8 rounded-[3rem] border shadow-2xl flex items-center gap-6 group transition-all hover:scale-[1.02]`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 bg-white/5 border border-white/10 ${colorConfigs[color].split(' ').pop()}`}>
                {React.cloneElement(icon, { size: 28 })}
            </div>
            <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-60 text-white">{title}</p>
                <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-black text-white italic tracking-tighter tabular-nums leading-none">{currency}{Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>
        </div>
    );
};

const TabBtn: React.FC<{ id: string, active: string, onClick: any, label: string, icon: any }> = ({ id, active, onClick, label, icon }) => (
    <button onClick={onClick} className={`h-20 flex items-center gap-3 px-2 border-b-2 transition-all font-black text-[10px] uppercase tracking-[0.4em] relative ${active === id ? 'text-white border-emerald-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
        {active === id && (
            <motion.div layoutId="active-account-tab" className="absolute bottom-0 inset-x-0 h-0.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
        )}
        {icon} {label}
    </button>
);
