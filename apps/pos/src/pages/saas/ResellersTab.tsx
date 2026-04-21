import React, { useEffect, useMemo, useState } from 'react';
import { useSaaSStore, type Reseller } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import toast from 'react-hot-toast';
import { 
    FiUsers, FiPlus, FiBriefcase, FiTrash2, FiEdit, 
    FiSearch, FiDollarSign, FiBox, FiTrendingUp, 
    FiZap, FiShield, FiGlobe
} from 'react-icons/fi';
import { Modal, StatCard, SectionCard, TableLoadingState, TableEmptyState, Badge } from './SaaSShared';
import { emptyForm, resellerToForm, type ResellerForm } from './resellerFormTypes';
import { ResellerFormFields } from './ResellerFormUi';
import { motion, AnimatePresence } from 'framer-motion';
import { ModernConfirmModal } from '../../features/terminal/components/ModernConfirmModal';

function isResellerActive(r: Reseller): boolean {
    return r.active === 1 || r.active === true;
}

function resellerTopupPayLabel(method: string | undefined | null, t: (key: string) => string): string {
    const m = String(method ?? 'bank_transfer').toLowerCase();
    if (m === 'cash') return t('modal.tenant.pay.cash');
    if (m === 'admin_card') return t('modal.tenant.pay.admin_card');
    return t('modal.tenant.pay.bank_transfer');
}

export const ResellersTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        resellers, fetchResellers, fetchResellerPlans, resellerPlans, 
        createReseller, updateReseller, deleteReseller, isLoading, settings,
        resellerWalletTopups, fetchResellerWalletTopupsAdmin, fetchResellerTopupPendingCount, reviewResellerWalletTopup,
    } = useSaaSStore();
    
    const currency = settings?.currency || '€';
    const [showNewModal, setShowNewModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null);

    const [createForm, setCreateForm] = useState<ResellerForm>(emptyForm);
    const [editForm, setEditForm] = useState<ResellerForm>(emptyForm);
    const [transferLicenses, setTransferLicenses] = useState(0);
    const [transferWallet, setTransferWallet] = useState(0);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);

    useEffect(() => {
        void fetchResellers();
        void fetchResellerPlans();
        void fetchResellerWalletTopupsAdmin();
        void fetchResellerTopupPendingCount();
    }, [fetchResellers, fetchResellerPlans, fetchResellerWalletTopupsAdmin, fetchResellerTopupPendingCount]);

    const planOptions = useMemo(
        () =>
            (resellerPlans || [])
                .filter((p: { is_active?: number }) => p.is_active !== 0)
                .map((p: { id: number; name: string; price: number; license_count: number }) => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    license_count: p.license_count,
                })),
        [resellerPlans],
    );

    const filtered = useMemo(() => {
        let list = [...(resellers || [])];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(r => 
                (r.company_name || '').toLowerCase().includes(q) || 
                (r.username || '').toLowerCase().includes(q)
            );
        }
        return list.sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'tr'));
    }, [resellers, searchQuery]);

    const openCreate = () => {
        setCreateForm(emptyForm());
        setShowNewModal(true);
    };

    const openEdit = (r: Reseller) => {
        setSelectedReseller(r);
        setEditForm(resellerToForm(r));
        setTransferLicenses(0);
        setTransferWallet(0);
        setShowEditModal(true);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const ok = await createReseller({
                username: createForm.username.trim(),
                password: createForm.password,
                email: createForm.email.trim(),
                company_name: createForm.company_name.trim(),
                tax_number: createForm.tax_number.trim() || undefined,
                tax_office: createForm.tax_office.trim() || undefined,
                billing_address: createForm.billing_address.trim() || undefined,
                city: createForm.city.trim() || undefined,
                district: createForm.district.trim() || undefined,
                postal_code: createForm.postal_code.trim() || undefined,
                country: createForm.country.trim() || undefined,
                phone: createForm.phone.trim() || undefined,
                mobile_phone: createForm.mobile_phone.trim() || undefined,
                contact_person: createForm.contact_person.trim() || undefined,
                admin_notes: createForm.admin_notes.trim() || undefined,
                commission_rate: createForm.commission_rate,
                available_licenses: createForm.available_licenses,
                active: createForm.active,
                ...(createForm.reseller_plan_id != null
                    ? {
                          reseller_plan_id: createForm.reseller_plan_id,
                          purchase_payment_method: createForm.purchase_payment_method,
                      }
                    : {}),
            });
            if (ok) {
                setShowNewModal(false);
                setCreateForm(emptyForm());
            } else {
                toast.error(t('reseller.errCreate'));
            }
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedReseller) return;
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                company_name: editForm.company_name.trim(),
                email: editForm.email.trim(),
                active: editForm.active,
                tax_number: editForm.tax_number.trim() || null,
                tax_office: editForm.tax_office.trim() || null,
                billing_address: editForm.billing_address.trim() || null,
                city: editForm.city.trim() || null,
                district: editForm.district.trim() || null,
                postal_code: editForm.postal_code.trim() || null,
                country: editForm.country.trim() || null,
                phone: editForm.phone.trim() || null,
                mobile_phone: editForm.mobile_phone.trim() || null,
                contact_person: editForm.contact_person.trim() || null,
                admin_notes: editForm.admin_notes.trim() || null,
                commission_rate: editForm.commission_rate,
            };
            if (editForm.password.trim().length > 0) {
                payload.password = editForm.password;
            }
            if (editForm.upgrade_reseller_plan_id != null) {
                payload.upgrade_reseller_plan_id = editForm.upgrade_reseller_plan_id;
                payload.upgrade_payment_method = editForm.upgrade_payment_method;
            }
            const ok = await updateReseller(selectedReseller.id, payload);
            if (ok) {
                setShowEditModal(false);
                setSelectedReseller(null);
            } else {
                toast.error(t('reseller.errUpdate'));
            }
        } finally {
            setSaving(false);
        }
    };

    const handleFinancialTransfer = async (type: 'license' | 'wallet') => {
        if (!selectedReseller) return;
        setSaving(true);
        try {
            const payload: Record<string, any> = {};
            if (type === 'license' && transferLicenses > 0) {
                payload.add_licenses = transferLicenses;
            } else if (type === 'wallet' && transferWallet !== 0) {
                if (transferWallet > 0) payload.add_wallet = transferWallet;
                else payload.deduct_wallet = Math.abs(transferWallet);
            } else return;

            const ok = await updateReseller(selectedReseller.id, payload);
            if (ok) {
                if (type === 'license') setTransferLicenses(0);
                else setTransferWallet(0);
                
                await fetchResellers();
                const updated = useSaaSStore.getState().resellers?.find((x) => x.id === selectedReseller.id);
                if (updated) {
                    setSelectedReseller(updated);
                    setEditForm(resellerToForm(updated));
                }
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        setConfirm({
            title: t('reseller.delete'),
            description: t('reseller.deleteConfirm'),
            onConfirm: () => void deleteReseller(id),
        });
    };

    const totalWallet = useMemo(() => resellers.reduce((sum, r) => sum + (Number(r.wallet_balance) || 0), 0), [resellers]);
    const totalLicenses = useMemo(() => resellers.reduce((sum, r) => sum + (r.available_licenses || 0), 0), [resellers]);

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.5, staggerChildren: 0.1 }
        }
    };

    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Tactical Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
                <StatCard 
                    label={t('reseller.title') || 'Active Partners'} 
                    value={resellers.length} 
                    icon={<FiUsers />} 
                    color="blue" 
                    trendStatus="up"
                    trend="+2"
                />
                <StatCard 
                    label="NETWORK VOLUME" 
                    value={`${currency}${resellers.reduce((acc, curr) => acc + (Number(curr.monthly_volume) || 0), 0).toLocaleString()}`} 
                    icon={<FiTrendingUp />} 
                    color="emerald" 
                    trendStatus="up"
                    trend="High"
                />
                <StatCard 
                    label="WALLET LIQUIDITY" 
                    value={`${currency}${totalWallet.toLocaleString()}`} 
                    icon={<FiDollarSign />} 
                    color="amber" 
                    trendStatus="stable"
                    trend="DEPOSITED"
                />
                <StatCard 
                    label="LICENSE INVENTORY" 
                    value={totalLicenses} 
                    icon={<FiBox />} 
                    color="indigo" 
                    sub="Pre-paid Pool" 
                />
            </div>

            {/* 2. Management Table */}
            <SectionCard 
                title={t('reseller.title')} 
                icon={<FiShield className="text-blue-400" />}
                action={
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative group min-w-[240px]">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-blue-400 transition-colors" size={14} />
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-[20px] pl-11 pr-4 py-2.5 text-xs text-white outline-none focus:border-blue-500/50 transition-all font-bold placeholder:text-slate-600 shadow-inner"
                                placeholder="Search Partners..."
                            />
                        </div>
                        <button 
                            onClick={openCreate}
                            className="h-11 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[20px] text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <FiPlus size={14} /> NEW PARTNER
                        </button>
                    </div>
                }
            >
                <div className="overflow-x-auto -mx-6 custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                        <thead>
                            <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                <th className="px-6 py-4">Partner Details</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Portfolio</th>
                                <th className="px-6 py-4">Commission</th>
                                <th className="px-6 py-4">Wallet Balance</th>
                                <th className="px-6 py-4 text-right">Operational Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-0">
                            {isLoading ? (
                                <TableLoadingState colSpan={6} />
                            ) : filtered.length > 0 ? (
                                <AnimatePresence mode="popLayout">
                                    {filtered.map((row) => (
                                        <motion.tr 
                                            key={row.id}
                                            layout
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="group hover:bg-white/[0.02] transition-colors relative"
                                        >
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-white/5 first:border-l last:border-r">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center font-black text-indigo-400 shadow-2xl group-hover:scale-110 transition-transform relative overflow-hidden">
                                                        <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/20 transition-colors" />
                                                        <FiBriefcase size={18} />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-sm text-white group-hover:text-blue-400 transition-colors truncate">{row.company_name || row.username}</span>
                                                            {isResellerActive(row) && (
                                                                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> VERIFIED
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter truncate mt-0.5">UID: {row.username}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 text-center">
                                                <Badge color={isResellerActive(row) ? 'emerald' : 'rose'}>
                                                    {isResellerActive(row) ? t('reseller.active') : t('reseller.inactive')}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <FiZap size={10} className="text-slate-600" />
                                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{row.tenant_count || 0} Restaurants</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <FiBox size={10} className="text-slate-600" />
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{row.available_licenses || 0} Free Licenses</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <div className="flex flex-col">
                                                    <div className="text-sm font-black text-blue-400 tabular-nums italic">%{Number(row.commission_rate || 0).toFixed(0)}</div>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.1em]">REVENUE SHARE</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <div className="flex flex-col">
                                                    <div className="text-sm font-black text-white tabular-nums tracking-tighter">{currency}{Number(row.wallet_balance || 0).toLocaleString()}</div>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.1em]">LIQUID BALANCE</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 rounded-r-[24px] text-right border-r">
                                                <div className="flex items-center justify-end gap-3 opacity-40 group-hover:opacity-100 transition-all transform group-hover:translate-x-0 translate-x-1">
                                                    <button 
                                                        onClick={() => openEdit(row)}
                                                        className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-300 border border-white/5 transition-all active:scale-95"
                                                    >
                                                        ANALYTICS
                                                    </button>
                                                    <button 
                                                        onClick={() => openEdit(row)}
                                                        className="p-2.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all active:scale-90"
                                                    >
                                                        <FiEdit size={16} title={t('reseller.editBtn')} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(row.id)}
                                                        className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"
                                                    >
                                                        <FiTrash2 size={16} title={t('reseller.deleteBtn')} />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            ) : (
                                <TableEmptyState colSpan={6} icon={<FiBriefcase />} message="No active resellers found in network" />
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            <SectionCard title={t('reseller.topupTitle')} icon={<FiDollarSign className="text-emerald-400" />}>
                {resellerWalletTopups.length === 0 ? (
                    <p className="text-xs text-slate-500 px-2 py-4">{t('reseller.topupEmpty')}</p>
                ) : (
                    <div className="overflow-x-auto -mx-6 custom-scrollbar">
                        <table className="w-full text-left text-xs px-6">
                            <thead>
                                <tr className="text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-white/10">
                                    <th className="px-6 py-3">{t('reseller.topupColPartner')}</th>
                                    <th className="px-6 py-3">{t('reseller.topupColAmount')}</th>
                                    <th className="px-6 py-3">{t('reseller.topupColMethod')}</th>
                                    <th className="px-6 py-3">{t('reseller.topupColTransfer')}</th>
                                    <th className="px-6 py-3">{t('reseller.topupColStatus')}</th>
                                    <th className="px-6 py-3">{t('reseller.topupColDate')}</th>
                                    <th className="px-6 py-3 text-right">{t('reseller.colActions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resellerWalletTopups.map((row) => (
                                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-6 py-3 text-white font-bold">
                                            {row.company_name || row.username || `#${row.reseller_id}`}
                                            <div className="text-[10px] text-slate-500 font-mono">{row.username}</div>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-emerald-300">
                                            {currency}{Number(row.amount).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-3 text-slate-300 text-[11px] font-bold">
                                            {resellerTopupPayLabel(row.payment_method, t)}
                                        </td>
                                        <td className="px-6 py-3 text-slate-400 text-[10px] max-w-[160px]">
                                            {row.transfer_date || row.transfer_reference || row.transfer_time ? (
                                                <div className="space-y-0.5">
                                                    <div className="font-mono text-slate-300">
                                                        {[row.transfer_date, row.transfer_time].filter(Boolean).join(' ')}
                                                    </div>
                                                    <div className="truncate text-slate-500" title={row.transfer_reference || ''}>
                                                        {row.transfer_reference || '—'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span
                                                className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                    row.status === 'pending'
                                                        ? 'bg-amber-500/15 text-amber-300'
                                                        : row.status === 'awaiting_card'
                                                          ? 'bg-sky-500/15 text-sky-300'
                                                          : row.status === 'approved'
                                                            ? 'bg-emerald-500/15 text-emerald-300'
                                                            : row.status === 'checkout_failed'
                                                              ? 'bg-rose-500/15 text-rose-300'
                                                              : 'bg-slate-500/15 text-slate-400'
                                                }`}
                                            >
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-500">
                                            {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            {row.status === 'pending' ? (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const r = await reviewResellerWalletTopup(row.id, 'approve');
                                                            if (!r.ok) toast.error(r.error || t('reseller.topupErr'));
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[10px] font-black text-white"
                                                    >
                                                        {t('reseller.topupApprove')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const r = await reviewResellerWalletTopup(row.id, 'reject');
                                                            if (!r.ok) toast.error(r.error || t('reseller.topupErr'));
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg border border-white/20 text-[10px] font-black text-slate-300 hover:bg-white/5"
                                                    >
                                                        {t('reseller.topupReject')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
            
            {/* 3. Global Network Map Simulation */}
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[48px] overflow-hidden shadow-2xl relative group h-80">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #6366f1 1px, transparent 0)', backgroundSize: '48px 48px' }} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[500px] h-[300px] border border-indigo-500/20 rounded-[100%] absolute opacity-20" />
                    <div className="w-[800px] h-[500px] border border-indigo-500/10 rounded-[100%] absolute opacity-10" />
                    <FiGlobe size={180} className="text-white opacity-5 animate-spin-slow" />
                </div>
                <div className="relative z-10 p-12 h-full flex flex-col items-center justify-center text-center">
                    <Badge color="blue">Global Partner Expansion</Badge>
                    <h2 className="text-3xl font-black text-white italic tracking-tighter mt-4 max-w-lg leading-tight uppercase">Strategic Network Visualizer Under Active Integration</h2>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-3">Simulating partner nodes across major economic zones...</p>
                </div>
            </div>

            {/* Modals */}
            <Modal
                show={showNewModal}
                onClose={() => setShowNewModal(false)}
                title={t('reseller.modalNew')}
                maxWidth="max-w-4xl"
            >
                <form onSubmit={handleCreate} className="space-y-6">
                    <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8">
                        <ResellerFormFields f={createForm} setF={setCreateForm} mode="create" plans={planOptions} />
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t border-white/5">
                        <button
                            type="button"
                            onClick={() => setShowNewModal(false)}
                            className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all"
                        >
                            {t('reseller.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest disabled:opacity-50 shadow-2xl shadow-blue-900/40 border border-white/10 transition-all active:scale-95"
                        >
                            {saving ? t('reseller.saving') : t('reseller.create')}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                show={showEditModal}
                onClose={() => setShowEditModal(false)}
                title={selectedReseller ? `${selectedReseller.company_name || selectedReseller.username}` : t('reseller.editTitle')}
                maxWidth="max-w-5xl"
            >
                {selectedReseller && (
                    <form onSubmit={handleSaveEdit} className="space-y-8">
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                            <div className="xl:col-span-8 bg-white/[0.02] border border-white/5 rounded-[40px] p-10">
                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em] mb-8 flex items-center gap-3">
                                    <FiUsers size={14}/> {t('reseller.profileInfo') || 'Partner Profile Details'}
                                </h4>
                                <ResellerFormFields
                                    f={editForm}
                                    setF={setEditForm}
                                    mode="edit"
                                    plans={planOptions}
                                    editContext={
                                        selectedReseller
                                            ? {
                                                  currentPlanId: selectedReseller.reseller_plan_id ?? null,
                                                  currentPlanPrice: selectedReseller.reseller_plan_price ?? null,
                                                  currentPlanName: selectedReseller.reseller_plan_name ?? null,
                                                  currentPlanLicenses: selectedReseller.reseller_plan_licenses ?? null,
                                              }
                                            : null
                                    }
                                />
                            </div>

                            <div className="xl:col-span-4 space-y-6">
                                <div className="bg-slate-900/60 border border-white/10 rounded-[40px] p-8 space-y-6 shadow-2xl">
                                    <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em] mb-2 flex items-center gap-3">
                                        <FiShield size={14}/> {t('reseller.financialTerminal') || 'Financial Gateway'}
                                    </h4>
                                    
                                    <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-end">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{t('reseller.licensePool')}</span>
                                                <span className="text-2xl font-black text-white italic tracking-tighter">{selectedReseller.available_licenses}</span>
                                            </div>
                                            <FiBox size={24} className="text-slate-700" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={0}
                                                value={transferLicenses || ''}
                                                onChange={(e) => setTransferLicenses(Number(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-black italic outline-none focus:border-blue-500/40 transition-all placeholder:text-slate-700"
                                                placeholder="Amount"
                                            />
                                            <button
                                                type="button"
                                                disabled={saving || transferLicenses <= 0}
                                                onClick={() => handleFinancialTransfer('license')}
                                                className="px-6 py-2.5 h-[42px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/40 transition-all active:scale-95 disabled:opacity-40"
                                            >
                                                {t('reseller.transfer')}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-black/40 rounded-3xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-end">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">WALLET_LIQUIDITY</span>
                                                <span className="text-2xl font-black text-emerald-400 italic tracking-tighter">{currency}{(Number(selectedReseller.wallet_balance) || 0).toLocaleString()}</span>
                                            </div>
                                            <FiDollarSign size={24} className="text-slate-700" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={transferWallet || ''}
                                                onChange={(e) => setTransferWallet(Number(e.target.value))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-black italic outline-none focus:border-emerald-500/40 transition-all placeholder:text-slate-700"
                                                placeholder={`+/- ${currency}`}
                                            />
                                            <button
                                                type="button"
                                                disabled={saving || transferWallet === 0}
                                                onClick={() => handleFinancialTransfer('wallet')}
                                                className="px-6 py-2.5 h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/40 transition-all active:scale-95 disabled:opacity-40"
                                            >
                                                SYNC
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[40px] text-white shadow-2xl relative overflow-hidden group border border-white/10">
                                     <div className="absolute -right-8 -bottom-8 opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-700">
                                         <FiZap size={140} />
                                     </div>
                                     <div className="relative z-10">
                                         <h5 className="text-sm font-black uppercase tracking-[0.2em] mb-4">Partner Performance</h5>
                                         <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                                             <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Revenue Generation</div>
                                             <div className="font-black italic">{currency}4.2k <span className="text-emerald-300 text-[10px]">High</span></div>
                                         </div>
                                         <div className="flex items-center justify-between">
                                             <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Operational Nodes</div>
                                             <div className="font-black italic">{selectedReseller.total_tenants ?? 0} UNITS</div>
                                         </div>
                                     </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-8 border-t border-white/5">
                            <button
                                type="button"
                                onClick={() => setShowEditModal(false)}
                                className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all"
                            >
                                {t('reseller.close')}
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest disabled:opacity-50 shadow-2xl shadow-emerald-900/40 border border-white/10 transition-all active:scale-95"
                            >
                                {saving ? t('reseller.saving') : t('reseller.save')}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
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
        </motion.div>
    );
};
