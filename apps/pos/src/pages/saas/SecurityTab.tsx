import React, { useEffect, useState } from 'react';
import { 
    FiKey, FiAlertTriangle, 
    FiActivity, FiGlobe, FiCpu, FiHardDrive,
    FiShield, FiUserCheck, FiTarget, FiPlus
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, EmptyState, Modal, InputGroup, SelectGroup, SubTab, Badge } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

export const SecurityTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        auditLogs, securitySummary, apiKeys, tenants, isLoading: _isLoading, 
        fetchAuditLogs, fetchSecuritySummary, fetchApiKeys, addApiKey, revokeApiKey 
    } = useSaaSStore();

    const [activeSecurityTab, setActiveSecurityTab] = useState<'audit' | 'keys' | 'compliance' | 'tse'>('audit');
    const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState(false);
    const [newKey, setNewKey] = useState({ tenant_id: '', name: '', permissions: '*' });
    const [auditFilter, setAuditFilter] = useState('all');
    const [advancedAuditFilters, setAdvancedAuditFilters] = useState({
        endpoint: '',
        actor: '',
        tenant_id: '',
        risk_level: '',
        method: '',
        from: '',
        to: '',
    });

    useEffect(() => { 
        fetchAuditLogs(); 
        fetchSecuritySummary(); 
        fetchApiKeys(); 
    }, []);

    useEffect(() => {
        const payload: Record<string, string> = {};
        if (advancedAuditFilters.endpoint.trim()) payload.endpoint = advancedAuditFilters.endpoint.trim();
        if (advancedAuditFilters.actor.trim()) payload.actor = advancedAuditFilters.actor.trim();
        if (advancedAuditFilters.tenant_id.trim()) payload.tenant_id = advancedAuditFilters.tenant_id.trim();
        if (advancedAuditFilters.risk_level.trim()) payload.risk_level = advancedAuditFilters.risk_level.trim();
        if (advancedAuditFilters.method.trim()) payload.method = advancedAuditFilters.method.trim();
        if (advancedAuditFilters.from.trim()) payload.from = advancedAuditFilters.from.trim();
        if (advancedAuditFilters.to.trim()) payload.to = advancedAuditFilters.to.trim();
        fetchAuditLogs(payload);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [advancedAuditFilters.endpoint, advancedAuditFilters.actor, advancedAuditFilters.tenant_id, advancedAuditFilters.risk_level, advancedAuditFilters.method, advancedAuditFilters.from, advancedAuditFilters.to]);

    const handleCreateApiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await addApiKey(newKey);
        if (ok) {
            setIsAddKeyModalOpen(false);
            setNewKey({ tenant_id: '', name: '', permissions: '*' });
        }
    };

    const ss = securitySummary;
    const filteredLogs = auditFilter === 'all' ? auditLogs : auditLogs.filter(log => log.action === auditFilter || log.entity_type === auditFilter);
    const readNewValue = (log: any, key: string): string => {
        try {
            const payload = typeof log.new_value === 'string' ? JSON.parse(log.new_value) : (log.new_value || {});
            const val = payload?.[key];
            return val == null ? '' : String(val);
        } catch {
            return '';
        }
    };

    const exportAuditCsv = () => {
        const rows = (activeSecurityTab === 'tse'
            ? auditLogs.filter(l => (l.action?.toLowerCase().includes('fiscal') || l.entity_type === 'tse' || l.action?.toLowerCase().includes('tse')))
            : filteredLogs
        ) as any[];
        if (!rows.length) return;
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['id', 'time', 'user_id', 'ip', 'action', 'entity_type', 'entity_id', 'method', 'status', 'risk'];
        const lines = rows.map((log) => [
            esc(log.id),
            esc(log.created_at),
            esc(log.user_id),
            esc(log.ip_address),
            esc(log.action),
            esc(log.entity_type),
            esc(log.entity_id),
            esc(readNewValue(log, 'method')),
            esc(readNewValue(log, 'status_code')),
            esc(log.risk_level || 'low'),
        ].join(','));
        const csv = `${header.join(',')}\n${lines.join('\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.6, staggerChildren: 0.05 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.98 },
        visible: { opacity: 1, scale: 1 }
    };

    return (
        <motion.div 
            className="space-y-10 pb-20"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            <div className="flex justify-center mb-12">
                <div className="flex bg-slate-900/60 backdrop-blur-3xl rounded-[32px] p-2 border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-x-auto no-scrollbar max-w-full">
                    <div className="flex items-center gap-1">
                        {[
                            { id: 'audit' as const, label: t('security.tabAudit') || 'Audit Stream', icon: <FiActivity />, count: auditLogs.length },
                            { id: 'keys' as const, label: t('security.tabKeys') || 'Access Tokens', icon: <FiKey />, count: apiKeys.length },
                            { id: 'tse' as const, label: 'TSE LOGS', icon: <FiShield />, count: auditLogs.filter(l => (l.action?.toLowerCase().includes('fiscal') || l.entity_type === 'tse' || l.action?.toLowerCase().includes('tse'))).length }
                        ].map((tb) => (
                            <SubTab 
                                key={tb.id}
                                active={activeSecurityTab === tb.id}
                                onClick={() => setActiveSecurityTab(tb.id)}
                                icon={tb.icon}
                                label={tb.label}
                                count={tb.count}
                            />
                        ))}
                    </div>
                </div>
            </div>
            {/* 1. Global Security Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
                <StatCard 
                    label={t('security.failedLogin') || 'Intrusion Attempts'} 
                    value={ss?.failedLogins24h || 0} 
                    icon={<FiAlertTriangle className="animate-pulse" />} 
                    color="rose" 
                    trend="CRITICAL" 
                    trendStatus="stable"
                />
                <StatCard 
                    label={t('security.successLogin') || 'Authorized Entry'} 
                    value={ss?.successLogins24h || 0} 
                    icon={<FiUserCheck />} 
                    color="emerald" 
                    trend="AUTHENTICATED" 
                    trendStatus="up"
                />
                <StatCard 
                    label="TSE HEALTH" 
                    value="SECURE" 
                    icon={<FiShield />} 
                    color="blue" 
                    sub="KassensicherheitsV Active"
                />
                <StatCard 
                    label={t('security.apiKeysActive') || 'Provisioned Keys'} 
                    value={ss?.activeApiKeys || 0} 
                    icon={<FiKey />} 
                    color="amber" 
                    sub="Live Integration Access"
                />
            </div>

            <AnimatePresence mode="wait">
                {(activeSecurityTab === 'audit' || activeSecurityTab === 'tse') ? (
                    <motion.div 
                        key={activeSecurityTab}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="grid grid-cols-1 gap-8 px-4 sm:px-0"
                    >
                        <SectionCard 
                            title={activeSecurityTab === 'tse' ? 'FISCAL AUDIT TERMINAL' : t('security.auditTitle')} 
                            icon={<FiActivity className="text-emerald-400" />}
                            action={
                                activeSecurityTab === 'audit' && (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex bg-slate-900/60 rounded-[18px] p-1 border border-white/5 shadow-inner">
                                            {['all', 'login', 'create', 'delete'].map(f => (
                                                <button 
                                                    key={f} 
                                                    type="button" 
                                                    onClick={() => setAuditFilter(f)} 
                                                    className={`px-4 py-2 rounded-[14px] text-[9px] font-black uppercase tracking-widest transition-all ${
                                                        auditFilter === f 
                                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                                                            : 'text-slate-500 hover:text-white'
                                                    }`}
                                                >
                                                    {f === 'all' ? t('security.filterAll') : f.toUpperCase()}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-8 gap-2">
                                            <input
                                                value={advancedAuditFilters.endpoint}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, endpoint: e.target.value }))}
                                                placeholder="Endpoint"
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            />
                                            <input
                                                value={advancedAuditFilters.actor}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, actor: e.target.value }))}
                                                placeholder="Actor"
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            />
                                            <input
                                                value={advancedAuditFilters.tenant_id}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, tenant_id: e.target.value }))}
                                                placeholder="Tenant ID"
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            />
                                            <select
                                                value={advancedAuditFilters.risk_level}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, risk_level: e.target.value }))}
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            >
                                                <option value="">Risk</option>
                                                <option value="low">LOW</option>
                                                <option value="medium">MEDIUM</option>
                                                <option value="high">HIGH</option>
                                            </select>
                                            <select
                                                value={advancedAuditFilters.method}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, method: e.target.value }))}
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            >
                                                <option value="">Method</option>
                                                <option value="GET">GET</option>
                                                <option value="POST">POST</option>
                                                <option value="PATCH">PATCH</option>
                                                <option value="DELETE">DELETE</option>
                                            </select>
                                            <input
                                                type="date"
                                                value={advancedAuditFilters.from}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, from: e.target.value }))}
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            />
                                            <input
                                                type="date"
                                                value={advancedAuditFilters.to}
                                                onChange={(e) => setAdvancedAuditFilters((p) => ({ ...p, to: e.target.value }))}
                                                className="bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white"
                                            />
                                            <button
                                                type="button"
                                                onClick={exportAuditCsv}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest"
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </div>
                                )
                            }
                        >
                            <div className="overflow-x-auto -mx-6 custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-y-2 px-6">
                                    <thead>
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                                            <th className="px-6 py-4">{t('security.colIp')}</th>
                                            <th className="px-6 py-4">SENDER/ORIGIN</th>
                                            <th className="px-6 py-4">{t('security.colAction')}</th>
                                            <th className="px-6 py-4">{t('security.colEntity')}</th>
                                            <th className="px-6 py-4">METHOD / STATUS</th>
                                            <th className="px-6 py-4">RISK</th>
                                            <th className="px-6 py-4">{t('security.colTime')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y-0">
                                        {((activeSecurityTab === 'tse' 
                                            ? auditLogs.filter(l => (l.action?.toLowerCase().includes('fiscal') || l.entity_type === 'tse' || l.action?.toLowerCase().includes('tse')))
                                            : filteredLogs
                                        ).length > 0) ? (activeSecurityTab === 'tse' 
                                            ? auditLogs.filter(l => (l.action?.toLowerCase().includes('fiscal') || l.entity_type === 'tse' || l.action?.toLowerCase().includes('tse')))
                                            : filteredLogs
                                        ).map((log) => (
                                            <motion.tr 
                                                key={log.id} 
                                                layout
                                                variants={itemVariants}
                                                className="group hover:bg-white/[0.02] transition-colors"
                                            >
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent first:rounded-l-[24px] last:rounded-r-[24px] border-y border-white/5 first:border-l last:border-r">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black text-blue-400 select-all italic tracking-tighter">{log.ip_address}</span>
                                                        <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest mt-1">NODE: {log.ip_address === '127.0.0.1' ? 'INTERNAL CORE' : 'EXTERNAL EDGE'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-slate-400 text-[10px]">
                                                            {log.user_id?.[0]?.toUpperCase() || 'S'}
                                                        </div>
                                                        <span className="text-[10px] font-black text-white uppercase tracking-tight italic">USER_{log.user_id || 'SYSTEM'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                    <Badge 
                                                        color={(log.action?.includes('delete') || log.action?.includes('security')) ? 'rose' : log.action?.includes('create') ? 'emerald' : 'blue'}
                                                    >
                                                        {log.action?.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{log.entity_type}</div>
                                                    <div className="text-[8px] text-slate-600 font-bold mt-1">ID: {log.entity_id}</div>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                    <div className="text-[10px] font-black text-cyan-300">{readNewValue(log, 'method') || '-'}</div>
                                                    <div className="text-[8px] text-slate-500 mt-1">{readNewValue(log, 'status_code') || '-'}</div>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent border-y border-white/5 border-l-0">
                                                    <Badge color={log.risk_level === 'high' ? 'rose' : log.risk_level === 'medium' ? 'amber' : 'emerald'}>
                                                        {String(log.risk_level || 'low').toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 bg-white/[0.02] group-hover:bg-transparent last:rounded-r-[24px] border-y border-white/5 border-l-0 first:border-l last:border-r text-[10px] font-mono text-slate-500 italic text-right">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                            </motion.tr>
                                        )) : (
                                            <tr><td colSpan={7}><EmptyState icon={<FiActivity />} message="No logs detected in this frequency." /></td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="keys"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="grid grid-cols-1 xl:grid-cols-12 gap-8 px-4 sm:px-0"
                    >
                        {/* API KEYS List */}
                        <div className="xl:col-span-8">
                            <SectionCard 
                                title={t('security.apiKeysTitle')} 
                                icon={<FiKey className="text-amber-400" />}
                                action={
                                    <button 
                                        onClick={() => setIsAddKeyModalOpen(true)}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl text-[10px] font-black shadow-xl shadow-blue-600/20 flex items-center gap-2 active:scale-95 transition-all uppercase tracking-widest"
                                    >
                                        <FiPlus size={14} /> NEW ACCESS TOKEN
                                    </button>
                                }
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {apiKeys.length > 0 ? apiKeys.map(key => (
                                        <div key={key.id} className="p-6 bg-slate-900/40 rounded-[32px] border border-white/5 hover:border-blue-500/20 transition-all group relative overflow-hidden">
                                            <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12 group-hover:scale-125 transition-transform"><FiKey size={60} /></div>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                                        <FiTarget size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-white italic tracking-tight">{key.name}</div>
                                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{key.tenant_name || 'MASTER'}</div>
                                                    </div>
                                                </div>
                                                <Badge color="emerald">ACTIVE</Badge>
                                            </div>
                                            <div className="bg-black/20 p-3 rounded-xl border border-white/5 mb-4 group/key">
                                                <div className="text-[9px] text-slate-600 uppercase font-black tracking-widest mb-1">ACCESS TOKEN</div>
                                                <div className="text-[10px] font-mono text-slate-300 break-all select-all">{key.key_value}</div>
                                            </div>
                                            <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                <span>PERMS: {key.permissions}</span>
                                                <button onClick={() => revokeApiKey(key.id)} className="text-rose-500 hover:text-rose-400 transition-colors">REVOKE ACCESS</button>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="col-span-2"><EmptyState icon={<FiKey />} message="No active API tokens found." /></div>
                                    )}
                                </div>
                            </SectionCard>
                        </div>

                        {/* Integrated Threat Radar (Pulse Pro Edition) */}
                        <div className="xl:col-span-4">
                            <SectionCard title={t('security.radarTitle') || 'Threat Vectors'} icon={<FiTarget className="text-rose-400" />}>
                                <div className="space-y-8 p-2">
                                    {[
                                        { label: 'CPU LOAD', value: '18%', color: 'emerald', icon: <FiCpu /> },
                                        { label: 'DB LATENCY', value: '14ms', color: 'emerald', icon: <FiActivity /> },
                                        { label: 'DISK USAGE', value: '42%', color: 'blue', icon: <FiHardDrive /> },
                                        { label: 'WEB CONNS', value: '1,243', color: 'indigo', icon: <FiGlobe /> }
                                    ].map((h, i) => (
                                        <div key={i} className="space-y-3 group text-slate-500 hover:text-white transition-colors">
                                            <div className="flex justify-between items-baseline pr-1">
                                                <div className="flex items-center gap-3 text-slate-500 group-hover:text-white transition-colors">
                                                    {React.cloneElement(h.icon as any, { size: 14, className: "opacity-40" })}
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{h.label}</span>
                                                </div>
                                                <span className="text-sm font-black italic text-white tabular-nums">{h.value}</span>
                                            </div>
                                            <div className="w-full bg-slate-900/50 h-2 rounded-full overflow-hidden border border-white/5 shadow-inner p-0.5">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: h.value }}
                                                    className={`h-full bg-gradient-to-r ${
                                                        h.color === 'emerald' ? 'from-emerald-600 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                                                        h.color === 'blue' ? 'from-blue-600 to-indigo-400 shadow-[0_0_10px_rgba(37,99,235,0.3)]' :
                                                        'from-indigo-600 to-violet-400 shadow-[0_0_10px_rgba(79,70,229,0.3)]'
                                                    } rounded-full transition-all duration-1000`} 
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

             {/* API KEY ENROLLMENT MODAL */}
             <Modal show={isAddKeyModalOpen} onClose={() => setIsAddKeyModalOpen(false)} title={t('security.apiModalTitle') || 'Key Enrollment'} maxWidth="max-w-xl">
                <form onSubmit={handleCreateApiKey} className="space-y-8">
                    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-8 space-y-6">
                        <SelectGroup 
                            label={t('security.apiTenant') || 'Target Authority'} 
                            value={newKey.tenant_id} 
                            onChange={v => setNewKey({ ...newKey, tenant_id: v })} 
                            options={[{ label: t('security.apiTenantGlobal') || 'GLOBAL (SUPER ADMIN)', value: '' }, ...tenants.map((tn) => ({ label: tn.name, value: tn.id }))]} 
                        />
                        <InputGroup label={t('security.apiKeyName') || 'Identity Name'} value={newKey.name} onChange={v => setNewKey({ ...newKey, name: v })} placeholder={t('security.apiKeyNamePh') || "e.g. Mobile-POS-Gateway"} />
                        <SelectGroup 
                            label={t('security.apiPerm') || 'Access Scope'} 
                            value={newKey.permissions} 
                            onChange={v => setNewKey({ ...newKey, permissions: v })} 
                            options={[
                                { label: t('security.apiPermFull') || 'FULL ACCESS (*)', value: '*' },
                                { label: t('security.apiPermRead') || 'READ-ONLY (GET)', value: 'r' },
                                { label: t('security.apiPermPos') || 'POS OPERATIONS ONLY', value: 'pos_ops' }
                            ]} 
                        />
                    </div>
                    <div className="bg-amber-500/10 p-6 rounded-[32px] border border-amber-500/20 shadow-xl shadow-amber-500/5">
                        <p className="text-[11px] text-amber-500 font-black uppercase tracking-widest leading-relaxed flex gap-4">
                            <FiAlertTriangle className="flex-shrink-0" size={18} />
                            {t('security.apiWarn') || 'SECURITY ALERT: These keys provide programmatic access to your infrastructure. Never share them and always rotate them every 90 days.'}
                        </p>
                    </div>
                    <div className="flex gap-4">
                         <button type="button" onClick={() => setIsAddKeyModalOpen(false)} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Cancel</button>
                         <button type="submit" className="flex-[2] py-4 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-2xl shadow-2xl shadow-amber-900/40 active:scale-95 transition-all text-[11px] tracking-widest uppercase border border-white/10 italic">{t('security.apiCreate') || 'GENERATE SECURE KEY'}</button>
                    </div>
                </form>
            </Modal>
        </motion.div>
    );
};
