import React, { useState } from 'react';
import { 
    FiUsers, FiEdit3, FiShield, 
    FiDatabase, FiTerminal, FiGlobe, 
    FiActivity 
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { StatCard, SectionCard, TableEmptyState, TableLoadingState, SearchBar } from './SaaSShared';

export const TenantsTab: React.FC = () => {
    const { 
        tenants, isLoading, createTenantBackup 
    } = useSaaSStore();

    const [search, setSearch] = useState('');
    const [filterPlan, setFilterPlan] = useState('all');

    const filteredTenants = tenants.filter(t => 
        (t.name.toLowerCase().includes(search.toLowerCase()) || t.schema_name.toLowerCase().includes(search.toLowerCase())) &&
        (filterPlan === 'all' || t.subscription_plan === filterPlan)
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* 1. Tenant Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Toplam Tenant (Müşteri)" value={tenants.length} icon={<FiUsers />} color="blue" trend="+1" />
                <StatCard label="Enterprise Plan" value={tenants.filter(t => t.subscription_plan === 'enterprise').length} icon={<FiShield />} color="amber" trend="Stabil" />
                <StatCard label="Pro Plan" value={tenants.filter(t => t.subscription_plan === 'pro').length} icon={<FiActivity />} color="emerald" trend="+1" />
                <StatCard label="DB Aktif Shard" value={tenants.length} icon={<FiDatabase />} color="indigo" sub="Multi-tenant Isolated" />
            </div>

            {/* 2. Management Table */}
            <SectionCard 
                title="Aktif Restoran Yönetimi" 
                icon={<FiDatabase className="text-blue-400" />}
                action={
                    <div className="flex items-center gap-4">
                        <SearchBar value={search} onChange={setSearch} placeholder="Restoran veya şema ara..." />
                        <div className="flex bg-slate-800 rounded-xl p-1 border border-white/5">
                            {['all', 'basic', 'pro', 'enterprise'].map(p => (
                                <button key={p} onClick={() => setFilterPlan(p)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${filterPlan === p ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{p === 'all' ? 'TÜMÜ' : p.toUpperCase()}</button>
                            ))}
                        </div>
                    </div>
                }
            >
                <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="px-6 py-4">Restoran Bilgisi</th>
                                <th className="px-6 py-4">Database Schema</th>
                                <th className="px-6 py-4">Plan (Subscription)</th>
                                <th className="px-6 py-4">Kapasite</th>
                                <th className="px-6 py-4">Son İşlem</th>
                                <th className="px-6 py-4 text-right">Aksiyonlar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {isLoading ? (
                                <TableLoadingState colSpan={6} />
                            ) : filteredTenants.length > 0 ? filteredTenants.map(t => (
                                <tr key={t.id} className="hover:bg-blue-500/[0.03] transition-colors group">
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-blue-400 shadow-xl group-hover:scale-110 transition-transform">
                                                {t.name[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-white group-hover:translate-x-1 transition-transform">{t.name}</span>
                                                <span className="text-[9px] text-slate-500 font-mono tracking-tighter uppercase">{t.id.split('-')[0]}... (LIC: {t.status})</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-sm font-bold text-slate-400 font-mono truncate max-w-[150px]"><FiTerminal className="inline-block mr-1 opacity-40" /> {t.schema_name}</td>
                                    <td className="px-6 py-5">
                                        <span className={`text-[9px] font-black px-2 py-1 rounded-md border ${
                                            t.subscription_plan === 'enterprise' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                                            t.subscription_plan === 'pro' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        } uppercase`}>
                                            {t.subscription_plan}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-slate-300">{t.max_branches} Şube / {t.max_users} Kullanıcı</span>
                                            <div className="w-20 bg-slate-800 h-1 rounded-full mt-1 overflow-hidden opacity-50"><div className="bg-blue-500 h-full w-[40%]" /></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-slate-300">{new Date(t.created_at).toLocaleDateString()}</span>
                                            <span className="text-[9px] text-slate-500 uppercase font-black">{new Date(t.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Yapılandırmayı Düzenle"><FiEdit3 size={16} /></button>
                                            <button onClick={() => createTenantBackup(t.id)} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all" title="Anlık Yedek Al"><FiDatabase size={16} /></button>
                                            <button className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all" title="Şemaya Bağlan"><FiGlobe size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            )) : <TableEmptyState colSpan={6} icon={<FiDatabase />} message="Arama kriterlerine uygun müşteri bulunamadı." />}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
};
