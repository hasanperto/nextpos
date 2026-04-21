import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
    FiUsers, FiEdit3, FiShield,
    FiDatabase, FiTerminal, FiGlobe,
    FiCopy, FiSearch, FiZap, FiCheckCircle, FiFileText, FiBell
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, TableEmptyState, TableLoadingState } from './SaaSShared';
import { TenantModulesModal } from './TenantModulesModal';
import { TenantEditModal } from './TenantEditModal';
import { PaymentLinkModal } from './PaymentLinkModal';
import type { Tenant } from '../../store/useSaaSStore';
import { motion, AnimatePresence } from 'framer-motion';

export const TenantsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        tenants, isLoading, createTenantBackup, admin, token,
        setSelectedTenantId,
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

    const resetTenantDevices = async (tenantId: string, tenantName: string) => {
        if (!token) {
            toast.error('Oturum yok');
            return;
        }
        const ok = window.confirm(`"${tenantName}" için tüm kullanıcıların cihaz kilidini sıfırlamak istiyor musunuz?`);
        if (!ok) return;
        setResettingTenantId(tenantId);
        try {
            const res = await fetch(`/api/v1/tenants/${tenantId}/reset-user-devices`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(payload?.error || 'Cihaz kilidi sıfırlanamadı');
                return;
            }
            const unlimited = payload?.quota?.unlimited === true;
            const remaining = payload?.quota?.remaining;
            if (unlimited) {
                toast.success('Cihaz kilidi sıfırlandı. Kalan hak: ∞');
            } else if (typeof remaining === 'number') {
                toast.success(`Cihaz kilidi sıfırlandı. Kalan hak: ${remaining}`);
            } else {
                toast.success('Cihaz kilidi sıfırlandı');
            }
        } catch {
            toast.error('Cihaz kilidi sıfırlanamadı');
        } finally {
            setResettingTenantId(null);
        }
    };

    useEffect(() => {
        if (!editTenant) return;
        const next = tenants.find((x) => x.id === editTenant.id);
        if (next) setEditTenant(next);
    }, [tenants, editTenant?.id]);

    /** Süper admin: POS’ta Socket ile kayıtlı çevrimiçi personel (REST ile ~8 sn) */
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
            className="space-y-8 pb-10"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Tactical Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
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
                    trend="Fiscal Ready"
                />
                <StatCard 
                    label={t('tenants.stat.dbShard')} 
                    value="GLOBAL-1" 
                    icon={<FiDatabase />} 
                    color="indigo" 
                    sub={t('tenants.stat.shardSub')} 
                />
            </div>

            {/* 2. Management Table */}
            <SectionCard 
                title={t('tenants.section.title')} 
                icon={<FiDatabase className="text-blue-400" />}
                action={
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative group min-w-[240px]">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-blue-400 transition-colors" size={14} />
                            <input 
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-[20px] pl-11 pr-4 py-2.5 text-xs text-white outline-none focus:border-blue-500/50 transition-all font-bold placeholder:text-slate-600 shadow-inner"
                                placeholder={t('tenants.search.placeholder')}
                            />
                        </div>
                        <div className="flex bg-slate-900/40 backdrop-blur-md rounded-[20px] p-1.5 border border-white/5 shadow-xl">
                            {['all', 'basic', 'pro', 'enterprise'].map(p => (
                                <button 
                                    key={p} 
                                    onClick={() => setFilterPlan(p)} 
                                    className={`px-4 py-1.5 rounded-[14px] text-[9px] font-black uppercase tracking-widest transition-all ${filterPlan === p ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {p === 'all' ? t('tenants.filter.all') : p.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                }
            >
                <div className="overflow-x-auto custom-scrollbar relative">
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900/80 to-transparent pointer-events-none z-10 opacity-0 transition-opacity group-hover:opacity-100" />
                    <table className="w-full text-left border-separate border-spacing-y-2 px-6 min-w-[600px]">
                        <thead>
                            <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                <th className="px-4 sm:px-6 py-3 sm:py-4">{t('tenants.table.info')}</th>
                                <th className="px-4 sm:px-6 py-3 sm:py-4">{t('tenants.table.schema')}</th>
                                <th className="px-4 sm:px-6 py-3 sm:py-4">{t('tenants.table.planCol')}</th>
                                <th className="px-4 sm:px-6 py-3 sm:py-4 text-center">Compliance</th>
                                <th className="px-4 sm:px-6 py-3 sm:py-4">{t('tenants.table.capacity')}</th>
                                <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">{t('tenants.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-0">
                            {isLoading ? (
                                <TableLoadingState colSpan={6} />
                            ) : filteredTenants.length > 0 ? (
                                <AnimatePresence mode="popLayout">
                                    {filteredTenants.map((row) => (
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
                                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center font-black text-blue-400 shadow-2xl group-hover:scale-110 transition-transform relative overflow-hidden">
                                                        <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/20 transition-colors" />
                                                        <span className="relative z-10">{row.name[0]?.toUpperCase()}</span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-sm text-white group-hover:text-blue-400 transition-colors truncate">{row.name}</span>
                                                            {admin?.role === 'super_admin' &&
                                                                (() => {
                                                                    const plist = presenceByTenant[row.id];
                                                                    const n = plist ? new Set(plist.map((p) => String(p.userId))).size : 0;
                                                                    return n > 0 ? (
                                                                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 shadow-lg shadow-emerald-500/5 animate-pulse">
                                                                            <FiZap size={8} /> LIVE {n}
                                                                        </span>
                                                                    ) : null;
                                                                })()}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1 min-w-0">
                                                            <span className="text-[9px] text-slate-500 font-mono font-bold truncate max-w-[120px]">{row.id}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => void copyTenantUuid(row.id)}
                                                                className={`p-1 rounded-lg transition-all ${copiedTenantId === row.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100'}`}
                                                            >
                                                                <FiCopy size={10} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-slate-800/50 rounded-lg text-slate-500"><FiTerminal size={12} /></div>
                                                    <span className="text-xs font-black text-slate-400 font-mono truncate max-w-[140px] uppercase tracking-tighter">{row.schema_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-[10px] border ${
                                                    row.subscription_plan === 'enterprise' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-lg shadow-amber-500/5' : 
                                                    row.subscription_plan === 'pro' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/5' :
                                                    'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-lg shadow-blue-500/5'
                                                } uppercase tracking-[0.1em]`}>
                                                    {row.subscription_plan}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <div className="flex items-center justify-center">
                                                    {row.subscription_plan !== 'basic' ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                                                <FiCheckCircle size={14} />
                                                            </div>
                                                            <span className="text-[8px] font-black text-emerald-500/70 uppercase">TSE READY</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1 opacity-40">
                                                            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/5 flex items-center justify-center text-slate-500">
                                                                <FiShield size={14} />
                                                            </div>
                                                            <span className="text-[8px] font-black text-slate-600 uppercase">NO FISCAL</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                <div className="flex flex-col">
                                                    <div className="flex justify-between items-end mb-1">
                                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{row.max_branches} BR / {row.max_users} USR</span>
                                                        <span className="text-[8px] font-bold text-slate-500 italic">85% LOAD</span>
                                                    </div>
                                                    <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden border border-white/5">
                                                        <motion.div 
                                                            initial={{ width: 0 }}
                                                            animate={{ width: row.subscription_plan === 'enterprise' ? '85%' : row.subscription_plan === 'pro' ? '60%' : '30%' }}
                                                            transition={{ duration: 1, ease: "easeOut" }}
                                                            className={`h-full ${row.subscription_plan === 'enterprise' ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-blue-600 to-blue-400'} shadow-[0_0_8px_rgba(59,130,246,0.5)]`} 
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0 rounded-r-[24px] text-right border-r">
                                                <div className="flex items-center justify-end gap-1 opacity-40 group-hover:opacity-100 transition-all transform group-hover:translate-x-0 translate-x-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPaymentTenant({ id: row.id, name: row.name })}
                                                        className="px-3 py-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-emerald-500/20"
                                                        title={t('tenants.action.payLink')}
                                                    >
                                                        {t('tenants.action.payLink')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedTenantId(String(row.id));
                                                            window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoices' } }));
                                                        }}
                                                        className="p-2.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-2xl transition-all active:scale-90"
                                                        title={t('tab.posInvoices')}
                                                    >
                                                        <FiFileText size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedTenantId(String(row.id));
                                                            window.dispatchEvent(new CustomEvent('saas:navigate', { detail: { tab: 'posInvoiceLogs' } }));
                                                        }}
                                                        className="p-2.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-2xl transition-all active:scale-90"
                                                        title={t('tab.posInvoiceLogs')}
                                                    >
                                                        <FiBell size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditTenant(row)}
                                                        className="p-2.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-2xl transition-all active:scale-90"
                                                        title={t('tenants.action.editTitle')}
                                                    >
                                                        <FiEdit3 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => resetTenantDevices(String(row.id), row.name)}
                                                        disabled={resettingTenantId === String(row.id)}
                                                        className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all active:scale-90 disabled:opacity-40"
                                                        title={`Cihaz kilidini sıfırla${
                                                            (row as any).device_reset_unlimited
                                                                ? ' (Kalan: ∞)'
                                                                : (row as any).device_reset_remaining != null
                                                                    ? ` (Kalan: ${(row as any).device_reset_remaining})`
                                                                    : ''
                                                        }`}
                                                    >
                                                        <FiZap size={16} />
                                                    </button>
                                                    {admin?.role === 'super_admin' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setModulesTenant({ id: row.id, name: row.name })}
                                                            className="px-3 py-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-indigo-500/20"
                                                        >
                                                            {t('tenants.action.modulesBtn')}
                                                        </button>
                                                    )}
                                                    <button 
                                                        type="button"
                                                        onClick={() => createTenantBackup(row.id)} 
                                                        className="p-2.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-2xl transition-all active:scale-90" 
                                                        title={t('tenants.action.backupTitle')}
                                                    >
                                                        <FiDatabase size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const q = new URLSearchParams({
                                                                tenant: row.id,
                                                                name: row.name,
                                                                user: 'admin',
                                                            });
                                                            const opened = window.open(`${window.location.origin}/login?${q.toString()}`, '_blank', 'noopener,noreferrer');
                                                            if (!opened) {
                                                                toast.error('Portal açılamadı — tarayıcı açılır pencere engelini kaldırın', { icon: '🔒', duration: 6000 });
                                                            }
                                                        }}
                                                        className="p-2.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-2xl transition-all active:scale-90"
                                                        title={t('tenants.action.schemaTitle')}
                                                    >
                                                        <FiGlobe size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            ) : <TableEmptyState colSpan={6} icon={<FiDatabase />} message={t('tenants.empty')} />}
                        </tbody>
                    </table>
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
            </AnimatePresence>
        </motion.div>
    );
};
