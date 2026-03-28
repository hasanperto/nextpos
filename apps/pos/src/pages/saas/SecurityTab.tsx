import React, { useEffect, useState } from 'react';
import { 
    FiShield, FiKey, FiAlertTriangle, FiCheckCircle, FiXCircle, 
    FiActivity, FiLock, FiGlobe, FiCpu, FiHardDrive,
    FiRefreshCcw, FiEye
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { StatCard, SectionCard, EmptyState, Modal, InputGroup, SelectGroup } from './SaaSShared';

export const SecurityTab: React.FC = () => {
    const { 
        auditLogs, securitySummary, apiKeys, tenants, isLoading, 
        fetchAuditLogs, fetchSecuritySummary, fetchApiKeys, addApiKey, revokeApiKey 
    } = useSaaSStore();

    const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState(false);
    const [newKey, setNewKey] = useState({ tenant_id: '', name: '', permissions: '*' });
    const [auditFilter, setAuditFilter] = useState('all');

    useEffect(() => { 
        fetchAuditLogs(); 
        fetchSecuritySummary(); 
        fetchApiKeys(); 
    }, []);

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

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* 1. Security Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Başarısız Giriş (24s)" value={ss?.failedLogins24h || 0} icon={<FiXCircle />} color="red" trend="+5%" />
                <StatCard label="Başarılı Giriş (24s)" value={ss?.successLogins24h || 0} icon={<FiCheckCircle />} color="emerald" trend="-2%" />
                <StatCard label="Toplam Audit Kaydı" value={ss?.totalAuditLogs24h || 0} icon={<FiActivity />} color="blue" sub="Son 24 saat işlem hacmi" />
                <StatCard label="Aktif API Anahtarı" value={ss?.activeApiKeys || 0} icon={<FiKey />} color="amber" sub="Sistem geneli entegrasyonlar" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 2. Audit Log Explorer */}
                <div className="md:col-span-2">
                    <SectionCard 
                        title="Canlı Güvenlik Denetimi (Audit Log)" 
                        icon={<FiActivity className="text-emerald-400" />}
                        action={
                            <div className="flex bg-slate-800 rounded-xl p-1 border border-white/5">
                                {['all', 'login', 'create', 'delete'].map(f => (
                                    <button key={f} onClick={() => setAuditFilter(f)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${auditFilter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}>{f === 'all' ? 'TÜMÜ' : f === 'login' ? 'GİRİŞ' : f === 'create' ? 'KAYIT' : 'SİLME'}</button>
                                ))}
                            </div>
                        }
                    >
                        <div className="overflow-hidden bg-black/20 rounded-[28px] border border-white/5 shadow-inner">
                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-slate-900 border-b border-white/5 z-10">
                                        <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em]">
                                            <th className="px-6 py-4">IP / Cihaz</th>
                                            <th className="px-6 py-4">İşlem</th>
                                            <th className="px-6 py-4">Varlık</th>
                                            <th className="px-6 py-4">Zaman</th>
                                            <th className="px-6 py-4 text-right">Detay</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                        {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                            <tr key={log.id} className="hover:bg-blue-500/[0.03] transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-mono text-blue-400 select-all">{log.ip_address}</span>
                                                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">System Agent v1.2</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[9px] font-black px-2 py-1 rounded-md border ${
                                                        log.action.includes('delete') ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                                        log.action.includes('create') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                        'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                    } uppercase w-fit block`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-300 uppercase tracking-tighter">{log.entity_type}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-white font-medium">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                        <span className="text-[8px] text-slate-600 font-black">{new Date(log.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="p-2 text-slate-600 hover:text-white hover:bg-white/5 rounded-xl transition-all"><FiEye size={12} /></button>
                                                </td>
                                            </tr>
                                        )) : <EmptyState icon={<FiActivity />} message="Henüz bir denetim kaydı bulunmuyor." />}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* 3. Right Sidebar - System Health & API Keys */}
                <div className="space-y-6">
                    <SectionCard title="Sistem Sağlık Radarı" icon={<FiActivity className="text-blue-400" />}>
                        <div className="space-y-6">
                            {[
                                { label: 'CPU Kullanımı', value: '18%', color: 'emerald', icon: <FiCpu /> },
                                { label: 'DB Master Gecikme', value: '14ms', color: 'emerald', icon: <FiActivity /> },
                                { label: 'Depolama Doluluğu', value: '42%', color: 'blue', icon: <FiHardDrive /> },
                                { label: 'Aktif Socket Gateway', value: '1,243', color: 'indigo', icon: <FiGlobe /> }
                            ].map((h, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between items-center pr-1">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            {h.icon}
                                            <span className="text-[10px] font-black uppercase tracking-widest">{h.label}</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-white">{h.value}</span>
                                    </div>
                                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                        <div className={`h-full bg-${h.color}-500 transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.1)]`} style={{ width: h.value }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard 
                        title="API Entegrasyon Anahtarları" 
                        icon={<FiKey className="text-amber-400" />}
                        action={<button onClick={() => setIsAddKeyModalOpen(true)} className="p-2 bg-amber-500/10 text-amber-500 rounded-xl hover:bg-amber-500 hover:text-white transition-all"><FiRefreshCcw size={14} /></button>}
                    >
                        <div className="space-y-3">
                            {apiKeys.length > 0 ? apiKeys.map(key => (
                                <div key={key.id} className="p-3 bg-slate-900/50 rounded-2xl border border-white/5 flex justify-between items-center group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-all shadow-xl shadow-amber-500/5"><FiKey size={14} /></div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-white">{key.name}</span>
                                            <span className="text-[9px] text-slate-500 font-mono select-all">**** **** {key.key_value.slice(-4)}</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => revokeApiKey(key.id)}
                                        className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                        <FiLock size={14} />
                                    </button>
                                </div>
                            )) : <EmptyState icon={<FiKey />} message="Aktif API anahtarı yok." />}
                        </div>
                    </SectionCard>
                </div>
            </div>

             {/* API KEY MODAL */}
             <Modal show={isAddKeyModalOpen} onClose={() => setIsAddKeyModalOpen(false)} title="Yeni API Entegrasyon Anahtarı" maxWidth="max-w-md">
                <form onSubmit={handleCreateApiKey} className="space-y-5">
                    <SelectGroup 
                        label="Hangi Restoran İçin?" 
                        value={newKey.tenant_id} 
                        onChange={v => setNewKey({ ...newKey, tenant_id: v })} 
                        options={[{ label: 'Global / Sunucu Geneli', value: '' }, ...tenants.map(t => ({ label: t.name, value: t.id }))]} 
                    />
                    <InputGroup label="Anahtar İsmi (Örn: Webhook-Service)" value={newKey.name} onChange={v => setNewKey({ ...newKey, name: v })} placeholder="Servis ismi giriniz..." />
                    <SelectGroup 
                        label="Yetki Seviyesi" 
                        value={newKey.permissions} 
                        onChange={v => setNewKey({ ...newKey, permissions: v })} 
                        options={[
                            { label: 'Full Access (*)', value: '*' },
                            { label: 'Sadece Okuma (Read-Only)', value: 'r' },
                            { label: 'Mutfak/Garson API', value: 'pos_ops' }
                        ]} 
                    />
                    <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20">
                        <p className="text-[10px] text-amber-500 font-bold leading-relaxed flex gap-2">
                            <FiAlertTriangle className="flex-shrink-0" />
                            DİKKAT: Oluşturulan anahtar sadece bir kez gösterilecektir. Lütfen güvenli bir yere kaydediniz.
                        </p>
                    </div>
                    <button type="submit" className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-xl shadow-lg shadow-amber-600/20 active:scale-95 transition-all text-xs tracking-widest uppercase">API ANAHTARI OLUŞTUR</button>
                </form>
            </Modal>
        </div>
    );
};
