import React, { useState, useEffect } from 'react';
import { FiUsers, FiUserPlus, FiX, FiCheck, FiSearch } from 'react-icons/fi';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

interface Customer {
    id: number;
    name: string;
    phone: string;
}

interface TableOpenModalProps {
    tableId: number;
    tableName: string;
    onClose: () => void;
    onConfirm: (guestCount: number, customerId: number | null) => void;
}

export const TableOpenModal: React.FC<TableOpenModalProps> = ({ tableId, tableName, onClose, onConfirm }) => {
    const [guestCount, setGuestCount] = useState(1);
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(false);
    const { token, tenantId } = useAuthStore();
    const { t } = usePosLocale();

    useEffect(() => {
        console.log(`TableOpenModal for TableID: ${tableId}`);
    }, [tableId]);

    useEffect(() => {
        if (search.length < 2) {
            setCustomers([]);
            return;
        }

        const delay = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/v1/customers/search?q=${encodeURIComponent(search)}`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'x-tenant-id': tenantId || ''
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCustomers(data);
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        }, 300);

        return () => clearTimeout(delay);
    }, [search, token, tenantId]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-md animate-in zoom-in duration-300 rounded-[2.5rem] bg-[#1a1c1e] border border-white/10 shadow-2xl overflow-hidden shadow-emerald-500/10">
                
                {/* Header */}
                <div className="p-8 border-b border-white/5 bg-gradient-to-br from-emerald-500/10 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                <FiUsers size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">{t('floor.openTable')}: {tableName}</h3>
                                <p className="text-xs font-bold text-emerald-400/60 uppercase tracking-widest mt-1">{t('floor.sessionDetails')}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                            <FiX size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    {/* Guest Count */}
                    <div className="space-y-4">
                        <label className="text-sm font-black text-white/50 uppercase tracking-widest ml-1">{t('floor.guestCountLabel')}</label>
                        <div className="flex items-center justify-between gap-4 p-2 bg-white/5 rounded-3xl border border-white/5">
                            <button 
                                onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                                className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white font-black text-2xl hover:bg-white/10 transition-colors"
                            >
                                -
                            </button>
                            <span className="text-4xl font-black text-white w-12 text-center">{guestCount}</span>
                            <button 
                                onClick={() => setGuestCount(guestCount + 1)}
                                className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white font-black text-2xl hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Customer Selection */}
                    <div className="space-y-4">
                        <label className="text-sm font-black text-white/50 uppercase tracking-widest ml-1">{t('floor.customerOptional')}</label>
                        {selectedCustomer ? (
                            <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                                        <FiCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="font-black text-white">{selectedCustomer.name}</p>
                                        <p className="text-xs font-bold text-emerald-400">{selectedCustomer.phone}</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedCustomer(null)} className="text-white/40 hover:text-white font-bold text-xs uppercase tracking-widest underline">{t('floor.changeCustomer')}</button>
                            </div>
                        ) : (
                            <div className="relative group">
                                <FiSearch className={`absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-emerald-500 transition-colors ${loading ? 'animate-pulse' : ''}`} />
                                <input 
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all placeholder:text-white/20"
                                    placeholder={t('floor.searchPlaceholder')}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                                {loading && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                                    </div>
                                )}
                                {customers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-3 bg-[#242628] border border-white/10 rounded-2xl shadow-2xl z-10 max-h-48 overflow-y-auto">
                                        {customers.map(c => (
                                            <button 
                                                key={c.id}
                                                onClick={() => {
                                                    setSelectedCustomer(c);
                                                    setSearch('');
                                                    setCustomers([]);
                                                }}
                                                className="w-full p-4 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0 text-left transition-colors"
                                            >
                                                <div>
                                                    <p className="font-black text-white">{c.name}</p>
                                                    <p className="text-xs font-bold text-white/40">{c.phone}</p>
                                                </div>
                                                <FiUserPlus className="text-emerald-500" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-black/20 border-t border-white/5">
                    <button 
                        onClick={() => onConfirm(guestCount, selectedCustomer?.id || null)}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-5 rounded-3xl font-black text-lg tracking-tight transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98]"
                    >
                        {t('floor.startSession')}
                    </button>
                </div>
            </div>
        </div>
    );
};
