import React, { useState, useEffect } from 'react';
import { FiUsers, FiUserPlus, FiX, FiCheck, FiSearch, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
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

type SearchPhase = 'idle' | 'loading' | 'empty' | 'hits';

export const TableOpenModal: React.FC<TableOpenModalProps> = ({ tableId, tableName, onClose, onConfirm }) => {
    const [guestCount, setGuestCount] = useState(1);
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
    const [quickName, setQuickName] = useState('');
    const [quickPhone, setQuickPhone] = useState('');
    const [quickSaving, setQuickSaving] = useState(false);
    const [quickRegisterOpen, setQuickRegisterOpen] = useState(false);
    const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders);
    const { t, lang } = usePosLocale();

    useEffect(() => {
        if (search.length < 2) {
            setCustomers([]);
            setSearchPhase('idle');
            return;
        }

        const delay = setTimeout(async () => {
            setSearchPhase('loading');
            try {
                const res = await fetch(`/api/v1/customers/search?q=${encodeURIComponent(search)}`, {
                    headers: {
                        ...getAuthHeaders(),
                        Accept: 'application/json',
                    },
                });
                if (res.ok) {
                    const data = (await res.json()) as Customer[];
                    const list = Array.isArray(data) ? data : [];
                    setCustomers(list);
                    setSearchPhase(list.length > 0 ? 'hits' : 'empty');
                    if (list.length > 0) setQuickRegisterOpen(false);
                } else {
                    setCustomers([]);
                    setSearchPhase('empty');
                }
            } catch (e) {
                console.error(e);
                setCustomers([]);
                setSearchPhase('empty');
            }
        }, 300);

        return () => clearTimeout(delay);
    }, [search, getAuthHeaders, t]);

    const openQuickRegisterForm = () => {
        setQuickName(search.trim());
        setQuickPhone('');
        setQuickRegisterOpen(true);
    };

    const handleQuickRegister = async () => {
        const name = quickName.trim();
        if (name.length < 2) {
            toast.error(t('floor.quickRegisterNameMin'));
            return;
        }
        setQuickSaving(true);
        try {
            const res = await fetch('/api/v1/customers', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    name,
                    phone: quickPhone.trim() || undefined,
                    preferredLanguage: lang === 'tr' ? 'tr' : lang === 'en' ? 'en' : 'de',
                }),
            });
            if (res.status === 401) {
                useAuthStore.getState().logout();
                return;
            }
            const raw = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = (raw as { error?: string })?.error || t('floor.quickRegisterError');
                toast.error(err);
                return;
            }
            const c = raw as { id?: number; name?: string; phone?: string | null };
            if (c.id == null) {
                toast.error(t('floor.quickRegisterError'));
                return;
            }
            setSelectedCustomer({
                id: Number(c.id),
                name: String(c.name || name),
                phone: String(c.phone || ''),
            });
            setSearch('');
            setCustomers([]);
            setSearchPhase('idle');
            setQuickPhone('');
            setQuickRegisterOpen(false);
            toast.success(t('floor.quickRegisterSuccess'));
        } catch (e) {
            console.error(e);
            toast.error(t('floor.quickRegisterError'));
        } finally {
            setQuickSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-md animate-in zoom-in duration-300 rounded-[2.5rem] bg-[#1a1c1e] border border-white/10 shadow-2xl shadow-emerald-500/10 max-h-[92vh] overflow-y-auto overflow-x-hidden no-scrollbar">
                {/* Header */}
                <div className="p-8 border-b border-white/5 bg-gradient-to-br from-emerald-500/10 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                <FiUsers size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">
                                    {t('floor.openTable')}: {tableName}
                                </h3>
                                <p className="text-xs font-bold text-emerald-400/60 uppercase tracking-widest mt-1">
                                    {t('floor.sessionDetails')}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                        >
                            <FiX size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    {/* Guest Count */}
                    <div className="space-y-4">
                        <label className="text-sm font-black text-white/50 uppercase tracking-widest ml-1">
                            {t('floor.guestCountLabel')}
                        </label>
                        <div className="flex items-center justify-between gap-4 p-2 bg-white/5 rounded-3xl border border-white/5">
                            <button
                                type="button"
                                onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                                className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white font-black text-2xl hover:bg-white/10 transition-colors"
                            >
                                -
                            </button>
                            <span className="text-4xl font-black text-white w-12 text-center">{guestCount}</span>
                            <button
                                type="button"
                                onClick={() => setGuestCount(guestCount + 1)}
                                className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white font-black text-2xl hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Customer Selection */}
                    <div className="space-y-4">
                        <label className="text-sm font-black text-white/50 uppercase tracking-widest ml-1">
                            {t('floor.customerOptional')}
                        </label>
                        {selectedCustomer ? (
                            <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                                        <FiCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="font-black text-white">{selectedCustomer.name}</p>
                                        <p className="text-xs font-bold text-emerald-400">{selectedCustomer.phone || '—'}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCustomer(null)}
                                    className="text-white/40 hover:text-white font-bold text-xs uppercase tracking-widest underline"
                                >
                                    {t('floor.changeCustomer')}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="relative group">
                                    <FiSearch
                                        className={`absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-emerald-500 transition-colors ${
                                            searchPhase === 'loading' ? 'animate-pulse' : ''
                                        }`}
                                    />
                                    <input
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all placeholder:text-white/20"
                                        placeholder={t('floor.searchPlaceholder')}
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setQuickRegisterOpen(false);
                                        }}
                                        autoComplete="off"
                                    />
                                    {searchPhase === 'loading' && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                        </div>
                                    )}
                                    {searchPhase === 'hits' && customers.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-3 bg-[#242628] border border-white/10 rounded-2xl shadow-2xl z-10 max-h-48 overflow-y-auto">
                                            {customers.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCustomer(c);
                                                        setSearch('');
                                                        setCustomers([]);
                                                        setSearchPhase('idle');
                                                        setQuickRegisterOpen(false);
                                                    }}
                                                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0 text-left transition-colors"
                                                >
                                                    <div>
                                                        <p className="font-black text-white">{c.name}</p>
                                                        <p className="text-xs font-bold text-white/40">{c.phone || '—'}</p>
                                                    </div>
                                                    <FiUserPlus className="text-emerald-500 shrink-0" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {searchPhase === 'empty' && search.trim().length >= 2 && (
                                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
                                        <div className="p-3 sm:p-4 flex flex-col gap-3">
                                            <div className="flex items-start gap-3">
                                                <FiAlertCircle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                                                <p className="text-sm font-black text-amber-100 leading-snug min-w-0">
                                                    {t('floor.customerNotFound')}
                                                </p>
                                            </div>
                                            {!quickRegisterOpen ? (
                                                <button
                                                    type="button"
                                                    onClick={openQuickRegisterForm}
                                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/15 text-emerald-100 font-black text-[11px] uppercase tracking-widest hover:bg-emerald-500/25 hover:border-emerald-400/70 active:scale-[0.99] transition-all"
                                                >
                                                    <FiUserPlus size={18} className="shrink-0" />
                                                    {t('floor.quickRegisterTitle')}
                                                </button>
                                            ) : (
                                                <div className="space-y-3 pt-1 border-t border-amber-500/15">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-[11px] font-bold text-amber-200/80 leading-snug">
                                                            {t('floor.quickRegisterHint')}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setQuickRegisterOpen(false)}
                                                            className="shrink-0 text-[10px] font-black text-white/45 hover:text-white uppercase tracking-widest underline"
                                                        >
                                                            {t('floor.quickRegisterHideForm')}
                                                        </button>
                                                    </div>
                                                    <input
                                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold outline-none focus:border-emerald-500/40"
                                                        value={quickName}
                                                        onChange={(e) => setQuickName(e.target.value)}
                                                        placeholder={t('floor.searchPlaceholder')}
                                                    />
                                                    <input
                                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold outline-none focus:border-emerald-500/40"
                                                        value={quickPhone}
                                                        onChange={(e) => setQuickPhone(e.target.value)}
                                                        placeholder={t('floor.quickRegisterPhone')}
                                                        inputMode="tel"
                                                        autoComplete="tel"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={quickSaving || quickName.trim().length < 2}
                                                        onClick={() => void handleQuickRegister()}
                                                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-[11px] uppercase tracking-widest transition-all"
                                                    >
                                                        {quickSaving ? t('floor.quickRegisterSaving') : t('floor.quickRegisterSave')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-black/20 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => onConfirm(guestCount, selectedCustomer?.id ?? null)}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-5 rounded-3xl font-black text-lg tracking-tight transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98]"
                    >
                        {t('floor.startSession')}
                    </button>
                </div>
            </div>
        </div>
    );
};
