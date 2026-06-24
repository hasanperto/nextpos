import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
    FiUsers, FiEdit3, FiShield,
    FiDatabase, FiTerminal, FiGlobe,
    FiCopy, FiSearch, FiZap, FiCheckCircle, FiFileText, FiBell, FiEye, FiTrash2,
    FiMoreVertical, FiChevronDown, FiChevronUp, FiSettings
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, TableEmptyState, TableLoadingState, Badge } from './SaaSShared';
import { TenantModulesModal } from './TenantModulesModal';
import { TenantEditModal } from './TenantEditModal';
import { PaymentLinkModal } from './PaymentLinkModal';
import { TenantDetailModal } from './TenantDetailModal';
import type { Tenant } from '../../store/useSaaSStore';
import { motion, AnimatePresence } from 'framer-motion';

export const TenantsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        tenants, isLoading, createTenantBackup, admin, token,
        setSelectedTenantId,
        deleteTenant,
    } = useSaaSStore();
    const [resettingTenantId, setResettingTenantId] = useState<string | null>(null);

    const [presenceByTenant, setPresenceByTenant] = useState<
        Record<string, { userId: string | number; username: string; role: string }[]>
    >({});

    const [search, setSearch] = useState('');
    const [filterPlan, setFilterPlan] = useState('all');
    const [copiedTenantId, setCopiedTenantId] = useState<string | null>(null);
    const [modulesTenant, setModulesTenant] = useState<{ id: string; name: string } | null>(null);
    const [paymentTenant, setPaymentTenant] = useState<{ id: string; name: string } | null>(null);
    const [editTenant, setEditTenant] = useState<Tenant | null>(null);
    const [detailTenant, setDetailTenant] = useState<Tenant | null>(null);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

    const resetTenantDevices = async (tenantId: string, tenantName: string) => {
        if (!token) {
            toast.error(t('tenants.error.sessionMissing'));
            return;
        }
        const ok = window.confirm(t('tenants.confirmReset', { name: tenantName }));
        if (!ok) return;
        setResettingTenantId(tenantId);
        try {
            const res = await fetch(`/api/v1/tenants/${tenantId}/reset-user-devices`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(payload?.error || t('tenants.error.resetFailed'));
                return;
            }
            const unlimited = payload?.quota?.unlimited === true;
            const remaining = payload?.quota?.remaining;
            if (unlimited) {
                toast.success(t('tenants.success.resetUnlimited'));
            } else if (typeof remaining === 'number') {
                toast.success(t('tenants.success.resetRemaining', { n: remaining }));
            } else {
                toast.success(t('tenants.success.reset'));
            }
        } catch {
            toast.error(t('tenants.error.resetFailed'));
        } finally {
            setResettingTenantId(null);
        }
    };

    const impersonateTenant = async (tenantId: string, tenantName: string) => {
        if (!token) {
            toast.error(t('tenants.error.sessionMissing') || 'SaaS oturumunuz bulunamadı.');
            return;
        }
        const toastId = toast.loading('Gölge giriş bağlantısı kuruluyor...');
        try {
            const res = await fetch('/api/v1/auth/impersonate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ tenantId }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Gölge giriş kodu oluşturulamadı.', { id: toastId });
                return;
            }
            toast.success('Bağlantı başarılı! Yönlendiriliyorsunuz...', { id: toastId });
            const q = new URLSearchParams({ impersonate_code: data.code });
            window.open(`${window.location.origin}/login?${q.toString()}`, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Impersonation error:', err);
            toast.error('Bağlantı kurulurken teknik bir hata oluştu.', { id: toastId });
        }
    };


    useEffect(() => {
        if (!editTenant) return;
        const next = tenants.find((x) => x.id === editTenant.id);
        if (next) setEditTenant(next);
    }, [tenants, editTenant?.id]);

    useEffect(() => {
        if (admin?.role !== 'super_admin' || !token) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch('/api/v1/tenants/presence', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = (await res.json()) as {
                    byTenant?: Record<string, { userId: string | number; username: string; role: string; socketId: string }[]>;
                };
                if (cancelled || !data.byTenant) return;
                const next: Record<string, { userId: string | number; username: string; role: string }[]> = {};
                for (const [tid, rows] of Object.entries(data.byTenant)) {
                    next[tid] = rows.map(({ userId, username, role }) => ({ userId, username, role }));
                }
                setPresenceByTenant(next);
            } catch {
                /* yut */
            }
        };
        void load();
        const id = window.setInterval(load, 8000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [admin?.role, token]);

    const filteredTenants = tenants.filter((row) => 
        (row.name.toLowerCase().includes(search.toLowerCase()) || row.schema_name.toLowerCase().includes(search.toLowerCase())) &&
        (filterPlan === 'all' || row.subscription_plan === filterPlan)
    );

    const copyTenantUuid = async (id: string) => {
        try {
            await navigator.clipboard.writeText(id);
            setCopiedTenantId(id);
            window.setTimeout(() => setCopiedTenantId((cur: string | null) => (cur === id ? null : cur)), 2000);
        } catch {
            /* yut */
        }
    };

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
            className="space-y-6 pb-10 max-w-7xl mx-auto mt-4 px-4 sm:px-6 lg:px-8"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Tactical Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard 
                    label={t('tenants.stat.total')} 
                    value={tenants.length} 
                    icon={<FiUsers />} 
                    color="blue" 
                    trendStatus="up"
                    trend="+4%"
                />
                <StatCard 
                    label={t('dashboard.stat.onlineNow')} 
                    value={Object.values(presenceByTenant).reduce((acc: number, curr) => acc + (curr as any[]).length, 0)} 
                    icon={<FiZap />} 
                    color="emerald" 
                    trendStatus="up"
                    trend="LIVE"
                />
                <StatCard 
                    label={t('dashboard.stat.compliance')} 
                    value={`${Math.round((tenants.filter(t => t.subscription_plan !== 'basic').length / (tenants.length || 1)) * 100)}%`} 
                    icon={<FiShield />} 
                    color="amber" 
                    trendStatus="stable"
                    trend={t('tenants.stat.complianceHint')}
                />
                <StatCard 
                    label={t('tenants.stat.dbShard')} 
                    value="GLOBAL-1" 
                    icon={<FiDatabase />} 
                    color="indigo" 
                    sub={t('tenants.stat.shardSub')} 
                />
            </div>

            {/* 2. Management Table & Mobile Cards */}
            <SectionCard 
                title={t('tenants.section.title')} 
                icon={<FiDatabase className="text-blue-500" />}
                action={
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <div className="relative group w-full sm:w-64">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={16} />
                            <input 
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500 dark:text-slate-400 shadow-sm"
                                placeholder={t('tenants.search.placeholder')}
                            />
                        </div>
                        <div className="flex bg-slate-100 dark:bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full sm:w-auto overflow-x-auto no-scrollbar">
                            {['all', 'basic', 'pro', 'enterprise'].map(p => (
                                <button 
                                    key={p} 
                                    onClick={() => setFilterPlan(p)} 
                                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${filterPlan === p ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-600 dark:text-slate-500 dark:text-slate-400'}`}
                                >
                                    {p === 'all' ? t('tenants.filter.all') : p.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                }
            >
                {/* Backdrop overlay for closing dropdowns when clicking outside */}
                {activeDropdownId && (
                    <div 
                        className="fixed inset-0 z-20 cursor-default bg-transparent" 
                        onClick={() => setActiveDropdownId(null)} 
                    />
                )}

                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-visible">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-slate-800/85 text-[10px] font-black uppercase tracking-wider">
                                <th className="px-6 py-4">{t('tenants.table.info')}</th>
                                <th className="px-6 py-4">{t('tenants.table.schema')}</th>
                                <th className="px-6 py-4">{t('tenants.table.planCol')}</th>
                                <th className="px-6 py-4 text-center">{t('tenants.table.compliance')}</th>
                                <th className="px-6 py-4">{t('tenants.table.capacity')}</th>
                                <th className="px-6 py-4">Oluşturulma</th>
                                <th className="px-6 py-4 text-right">{t('tenants.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                            {isLoading ? (
                                <TableLoadingState colSpan={7} />
                            ) : filteredTenants.length > 0 ? (
                                <AnimatePresence mode="popLayout">
                                    {filteredTenants.map((row) => (
                                        <motion.tr 
                                            key={row.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-all duration-200 group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/10 shadow-sm">
                                                        {row.name[0]?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-sm text-slate-800 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">{row.name}</span>
                                                            {admin?.role === 'super_admin' && (presenceByTenant[row.id]?.length || 0) > 0 && (
                                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Aktif Kullanıcı Var" />
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-1 text-slate-400 text-xs">
                                                            <span className="font-mono text-[10px] tracking-tight">{row.id}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => void copyTenantUuid(row.id)}
                                                                className={`p-1 rounded transition-colors ${copiedTenantId === row.id ? 'text-emerald-500 bg-emerald-500/10' : 'hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}
                                                                title="UUID Kopyala"
                                                            >
                                                                <FiCopy size={11} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                                                    <FiTerminal size={13} className="opacity-60" />
                                                    <span>{row.schema_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge color={row.subscription_plan === 'enterprise' ? 'amber' : row.subscription_plan === 'pro' ? 'emerald' : 'blue'}>
                                                    {row.subscription_plan.toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {row.subscription_plan !== 'basic' ? (
                                                    <div className="inline-flex flex-col items-center gap-0.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                                                        <FiCheckCircle size={14} className="animate-pulse" />
                                                        <span className="text-[9px] font-black tracking-tight">TSE READY</span>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex flex-col items-center gap-0.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 px-2 py-1 rounded-lg">
                                                        <FiShield size={14} />
                                                        <span className="text-[9px] font-bold tracking-tight">NO FISCAL</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                    {row.max_branches} BR <span className="opacity-40">/</span> {row.max_users} USR
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                                        {(row as any).created_at
                                                            ? new Date((row as any).created_at).toLocaleDateString('tr-TR')
                                                            : '—'}
                                                    </span>
                                                    <span className={`text-[9px] font-bold tracking-wider uppercase px-1 py-0.2 rounded w-max ${
                                                        (row as any).created_by_role === 'reseller' 
                                                            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' 
                                                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                    }`}>
                                                        {(row as any).created_by_role === 'reseller' ? 'BAYİ' : 'ADMİN'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right overflow-visible">
                                                <div className="relative inline-flex items-center justify-end gap-1.5">
                                                    {/* Primary Shortcut Buttons */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setDetailTenant(row)}
                                                        className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/20 rounded-xl transition-all active:scale-95 border border-transparent hover:border-blue-500/10"
                                                        title="Görüntüle"
                                                    >
                                                        <FiEye size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditTenant(row)}
                                                        className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded-xl transition-all active:scale-95 border border-transparent hover:border-indigo-500/10"
                                                        title={t('tenants.action.editTitle')}
                                                    >
                                                        <FiEdit3 size={15} />
                                                    </button>

                                                    {/* Dropdown Menu Toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveDropdownId(activeDropdownId === row.id ? null : row.id)}
                                                        className={`p-2 rounded-xl transition-all active:scale-95 border ${
                                                            activeDropdownId === row.id 
                                                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-white/10' 
                                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border-transparent'
                                                        }`}
                                                        title="İşlemler"
                                                    >
                                                        <FiMoreVertical size={15} />
                                                    </button>

                                                    {/* Dropdown Container */}
                                                    <AnimatePresence>
                                                        {activeDropdownId === row.id && (
                                                            <motion.div
                                                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                                                transition={{ duration: 0.12 }}
                                                                className="absolute right-0 top-full mt-2 w-60 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 rounded-[20px] shadow-2xl p-2.5 space-y-1.5 z-30 text-left"
                                                            >
                                                                {/* FİNANS BÖLÜMÜ */}
                                                                <div>
                                                                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2.5 py-1">
                                                                        FİNANS
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setPaymentTenant({ id: row.id, name: row.name });
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors"
                                                                    >
                                                                        <FiCheckCircle size={14} className="text-emerald-500" />
                                                                        <span>{t('tenants.action.payLink')}</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSelectedTenantId(String(row.id));
                                                                            window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoices' } }));
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors"
                                                                    >
                                                                        <FiFileText size={14} className="text-blue-500" />
                                                                        <span>{t('tab.posInvoices')}</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSelectedTenantId(String(row.id));
                                                                            window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoiceLogs' } }));
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors"
                                                                    >
                                                                        <FiBell size={14} className="text-amber-500" />
                                                                        <span>{t('tab.posInvoiceLogs')}</span>
                                                                    </button>
                                                                </div>

                                                                {/* YÖNETİM BÖLÜMÜ */}
                                                                <div className="border-t border-slate-100 dark:border-white/5 pt-1.5">
                                                                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2.5 py-1">
                                                                        SİSTEM & ALTYAPI
                                                                    </div>
                                                                    {admin?.role === 'super_admin' && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setModulesTenant({ id: row.id, name: row.name });
                                                                                setActiveDropdownId(null);
                                                                            }}
                                                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors"
                                                                        >
                                                                            <FiTerminal size={14} className="text-indigo-500" />
                                                                            <span>Modül Yönetimi</span>
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            resetTenantDevices(String(row.id), row.name);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        disabled={resettingTenantId === String(row.id)}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50"
                                                                    >
                                                                        <FiZap size={14} className="text-rose-500" />
                                                                        <span>Cihaz Kilidi Sıfırla</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            createTenantBackup(row.id);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors"
                                                                    >
                                                                        <FiDatabase size={14} className="text-emerald-500" />
                                                                        <span>Bulut Yedek Al</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            impersonateTenant(String(row.id), row.name);
                                                                            setActiveDropdownId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 rounded-xl transition-colors"
                                                                    >
                                                                        <FiGlobe size={14} className="text-cyan-500" />
                                                                        <span>Şemaya Giriş Yap (Gölge)</span>
                                                                    </button>
                                                                </div>

                                                                {/* TEHLİKELİ ALAN */}
                                                                {admin?.role === 'super_admin' && (
                                                                    <div className="border-t border-slate-100 dark:border-white/5 pt-1.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                setActiveDropdownId(null);
                                                                                const ok = window.confirm(
                                                                                    `"${row.name}" restoranı pasif (inactive) yapılacak; POS erişimi kapanır. Şema silinmez. Devam?`,
                                                                                );
                                                                                if (!ok) return;
                                                                                const done = await deleteTenant(String(row.id));
                                                                                if (done) toast.success('Restoran pasifleştirildi (inactive).');
                                                                                else toast.error(useSaaSStore.getState().error || 'Pasifleştirme başarısız.');
                                                                            }}
                                                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.8 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                                                                        >
                                                                            <FiTrash2 size={14} />
                                                                            <span>Pasife Al (Soft)</span>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            ) : <TableEmptyState colSpan={7} icon={<FiDatabase />} message={t('tenants.empty')} />}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card List View */}
                <div className="lg:hidden p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/20">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                            <span className="text-xs font-semibold text-slate-500">{t('common.syncing')}</span>
                        </div>
                    ) : filteredTenants.length > 0 ? (
                        filteredTenants.map((row) => {
                            const isExpanded = expandedCardId === row.id;
                            return (
                                <div 
                                    key={row.id} 
                                    className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-white/5 rounded-[24px] p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative overflow-hidden"
                                >
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/10">
                                                {row.name[0]?.toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate max-w-[140px]">{row.name}</h4>
                                                    {admin?.role === 'super_admin' && (presenceByTenant[row.id]?.length || 0) > 0 && (
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    )}
                                                </div>
                                                <span className="text-xs text-slate-400 font-mono mt-0.5 block truncate max-w-[150px]">{row.schema_name}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <Badge color={row.subscription_plan === 'enterprise' ? 'amber' : row.subscription_plan === 'pro' ? 'emerald' : 'blue'}>
                                                {row.subscription_plan.toUpperCase()}
                                            </Badge>
                                            {row.subscription_plan !== 'basic' ? (
                                                <span className="text-[8px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1 rounded-md">TSE</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Card Body Metrics */}
                                    <div className="grid grid-cols-2 gap-4 py-3 border-t border-b border-slate-100 dark:border-white/5 text-xs">
                                        <div>
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{t('tenants.table.capacity')}</div>
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">{row.max_branches} BR / {row.max_users} USR</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Oluşturulma</div>
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                                                {(row as any).created_at ? new Date((row as any).created_at).toLocaleDateString('tr-TR') : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row of ID copy & detail drawer toggle */}
                                    <div className="flex items-center justify-between text-xs text-slate-400">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono text-[9px] tracking-tight">{row.id.slice(0, 18)}...</span>
                                            <button
                                                type="button"
                                                onClick={() => void copyTenantUuid(row.id)}
                                                className={`p-1 rounded transition-colors ${copiedTenantId === row.id ? 'text-emerald-500 bg-emerald-500/10' : 'hover:text-blue-500'}`}
                                            >
                                                <FiCopy size={11} />
                                            </button>
                                        </div>
                                        <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${
                                            (row as any).created_by_role === 'reseller' 
                                                ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' 
                                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                        }`}>
                                            Kayıt: {(row as any).created_by_role === 'reseller' ? 'Bayi' : 'Admin'}
                                        </span>
                                    </div>

                                    {/* Primary Touch Actions Row */}
                                    <div className="flex items-center gap-2 pt-2">
                                        <button 
                                            onClick={() => setDetailTenant(row)} 
                                            className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                        >
                                            <FiEye size={14} /> 
                                            <span>Detay</span>
                                        </button>
                                        <button 
                                            onClick={() => setEditTenant(row)} 
                                            className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl transition-all active:scale-95"
                                            title="Düzenle"
                                        >
                                            <FiEdit3 size={15} />
                                        </button>
                                        <button 
                                            onClick={() => setExpandedCardId(isExpanded ? null : row.id)} 
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 border ${
                                                isExpanded 
                                                    ? 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white' 
                                                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-transparent'
                                            }`}
                                        >
                                            <FiSettings size={14} />
                                            <span>{isExpanded ? 'Kapat' : 'İşlemler'}</span>
                                            {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                                        </button>
                                    </div>

                                    {/* Expandable Sub-Action Panel */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                                    <button 
                                                        onClick={() => {
                                                            setPaymentTenant({ id: row.id, name: row.name });
                                                            setExpandedCardId(null);
                                                        }}
                                                        className="flex flex-col items-center justify-center p-3 rounded-xl border border-emerald-500/10 dark:border-emerald-500/5 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-all active:scale-95 gap-1.5"
                                                    >
                                                        <FiCheckCircle size={16} />
                                                        <span className="text-[10px] font-bold">Ödeme</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedTenantId(String(row.id));
                                                            window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoices' } }));
                                                            setExpandedCardId(null);
                                                        }}
                                                        className="flex flex-col items-center justify-center p-3 rounded-xl border border-blue-500/10 dark:border-blue-500/5 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-all active:scale-95 gap-1.5"
                                                    >
                                                        <FiFileText size={16} />
                                                        <span className="text-[10px] font-bold">Faturalar</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedTenantId(String(row.id));
                                                            window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoiceLogs' } }));
                                                            setExpandedCardId(null);
                                                        }}
                                                        className="flex flex-col items-center justify-center p-3 rounded-xl border border-amber-500/10 dark:border-amber-500/5 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-all active:scale-95 gap-1.5"
                                                    >
                                                        <FiBell size={16} />
                                                        <span className="text-[10px] font-bold">Fatura Log</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            createTenantBackup(row.id);
                                                            setExpandedCardId(null);
                                                        }}
                                                        className="flex flex-col items-center justify-center p-3 rounded-xl border border-cyan-500/10 dark:border-cyan-500/5 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 transition-all active:scale-95 gap-1.5"
                                                    >
                                                        <FiDatabase size={16} />
                                                        <span className="text-[10px] font-bold">Yedek Al</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            impersonateTenant(String(row.id), row.name);
                                                            setExpandedCardId(null);
                                                        }} 
                                                        className="flex flex-col items-center justify-center p-3 rounded-xl border border-teal-500/10 dark:border-teal-500/5 bg-teal-500/5 hover:bg-teal-500/10 text-teal-600 dark:text-teal-400 transition-all active:scale-95 gap-1.5 font-semibold"
                                                    >
                                                        <FiGlobe size={16} />
                                                        <span className="text-[10px] font-bold">Şema Giriş</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            resetTenantDevices(String(row.id), row.name);
                                                            setExpandedCardId(null);
                                                        }} 
                                                        className="flex flex-col items-center justify-center p-3 rounded-xl border border-orange-500/10 dark:border-orange-500/5 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 transition-all active:scale-95 gap-1.5 font-semibold"
                                                    >
                                                        <FiZap size={16} />
                                                        <span className="text-[10px] font-bold">Kilidi Aç</span>
                                                    </button>
                                                    {admin?.role === 'super_admin' && (
                                                        <button 
                                                            onClick={() => {
                                                                setModulesTenant({ id: row.id, name: row.name });
                                                                setExpandedCardId(null);
                                                            }}
                                                            className="flex flex-col items-center justify-center p-3 rounded-xl border border-indigo-500/10 dark:border-indigo-500/5 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-all active:scale-95 gap-1.5"
                                                        >
                                                            <FiTerminal size={16} />
                                                            <span className="text-[10px] font-bold">Modüller</span>
                                                        </button>
                                                    )}
                                                    {admin?.role === 'super_admin' && (
                                                        <button 
                                                            onClick={async () => {
                                                                setExpandedCardId(null);
                                                                const ok = window.confirm(
                                                                    `"${row.name}" restoranı pasif (inactive) yapılacak; POS erişimi kapanır. Şema silinmez. Devam?`,
                                                                );
                                                                if (!ok) return;
                                                                const done = await deleteTenant(String(row.id));
                                                                if (done) toast.success('Restoran pasifleştirildi (inactive).');
                                                                else toast.error(useSaaSStore.getState().error || 'Pasifleştirme başarısız.');
                                                            }}
                                                            className="flex flex-col items-center justify-center p-3 rounded-xl border border-rose-500/10 dark:border-rose-500/5 bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-all active:scale-95 gap-1.5"
                                                        >
                                                            <FiTrash2 size={16} />
                                                            <span className="text-[10px] font-bold">Pasife Al</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })
                    ) : (
                        <TableEmptyState colSpan={1} icon={<FiDatabase />} message={t('tenants.empty')} />
                    )}
                </div>
            </SectionCard>

            {/* Modals */}
            <AnimatePresence>
                {editTenant && (
                    <TenantEditModal tenant={editTenant} onClose={() => setEditTenant(null)} />
                )}
                {modulesTenant && (
                    <TenantModulesModal
                        tenantId={modulesTenant.id}
                        tenantName={modulesTenant.name}
                        onClose={() => setModulesTenant(null)}
                    />
                )}
                {paymentTenant && (
                    <PaymentLinkModal
                        tenantId={paymentTenant.id}
                        tenantName={paymentTenant.name}
                        onClose={() => setPaymentTenant(null)}
                    />
                )}
                {detailTenant && (
                    <TenantDetailModal
                        tenant={detailTenant}
                        onClose={() => setDetailTenant(null)}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};
