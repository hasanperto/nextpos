import React from 'react';
import { 
    FiActivity, FiUsers, FiDollarSign, FiTrendingUp, 
    FiAlertTriangle, FiCheckCircle, FiClock, FiLayers, 
    FiMessageSquare, FiShield 
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';

export const DashboardTab: React.FC = () => {
    const { 
        stats, tenants, supportStats, systemHealth 
    } = useSaaSStore();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* 1. Global Stat Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Toplam Restoran" value={stats?.totalTenants || 0} icon={<FiUsers />} color="blue" trend="+3" />
                <StatCard label="Aktif Abonelikler" value={stats?.activeTenants || 0} icon={<FiCheckCircle />} color="emerald" trend="+2" />
                <StatCard label="Tahmini Aylık Gelir" value={`€${(stats?.monthlyRevenue || 0).toLocaleString()}`} icon={<FiDollarSign />} color="indigo" trend="+15%" />
                <StatCard label="Sistem Sağlığı" value={systemHealth?.status === 'ok' ? 'AKTİF' : 'RİSKLİ'} icon={<FiActivity />} color={systemHealth?.status === 'ok' ? 'emerald' : 'red'} sub={systemHealth?.dbLatency || '0ms latency'} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 2. Urgent Alerts & Notifications */}
                <div className="md:col-span-2 space-y-6">
                    <SectionCard title="Sistem Uyarıları & Bekleyen İşlemler" icon={<FiAlertTriangle className="text-amber-400" />}>
                         <div className="space-y-4">
                            {supportStats?.open && supportStats.open > 0 ? (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between group transition-all hover:bg-red-500/20">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-500/20 text-red-400 rounded-xl"><FiMessageSquare /></div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Bekleyen Destek Talepleri</h4>
                                            <p className="text-[10px] text-slate-500 uppercase font-black mt-0.5">{supportStats.open} Adet Yanıtlanmamış Mesaj</p>
                                        </div>
                                    </div>
                                    <button className="text-[10px] font-black text-red-400 uppercase tracking-widest px-4 py-2 bg-red-500/10 rounded-lg group-hover:bg-red-500 group-hover:text-white transition-all">İNCELE</button>
                                </div>
                            ) : null}

                            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center justify-between opacity-80">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl"><FiShield /></div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white uppercase tracking-tighter">Güvenlik Kontrolü</h4>
                                        <p className="text-[10px] text-slate-500 uppercase font-black mt-0.5">Tüm sistemler %100 güvenli ve güncel.</p>
                                    </div>
                                </div>
                                <FiCheckCircle className="text-emerald-500" />
                            </div>

                            <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center justify-between opacity-80">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><FiLayers /></div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white uppercase tracking-tighter">Yedekleme Durumu</h4>
                                        <p className="text-[10px] text-slate-500 uppercase font-black mt-0.5">Son global yedekleme: Bugün 03:00</p>
                                    </div>
                                </div>
                                <span className="text-[9px] font-black text-slate-500 select-none">BAŞARILI</span>
                            </div>
                         </div>
                    </SectionCard>

                    <SectionCard title="Son Kayıt Olan Restoranlar" icon={<FiActivity className="text-blue-400" />}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-white/5">
                                        <th className="px-4 py-3">Restoran Adı</th>
                                        <th className="px-4 py-3">Plan</th>
                                        <th className="px-4 py-3">Kayıt Tarihi</th>
                                        <th className="px-4 py-3 text-right">Durum</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.03]">
                                    {tenants.slice(0, 5).map(t => (
                                        <tr key={t.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 font-bold text-sm text-white">{t.name}</td>
                                            <td className="px-4 py-3"><span className="text-[9px] font-black uppercase px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{t.subscription_plan}</span></td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">{new Date(t.created_at).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-right"><div className={`w-2 h-2 rounded-full inline-block ${t.status === 'active' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-red-500'}`} title={t.status} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>

                {/* 3. Small Sidebar Charts / Info */}
                <div className="space-y-6">
                    <SectionCard title="Hızlı Sistem Özeti" icon={<FiTrendingUp className="text-indigo-400" />}>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center pr-1 text-[10px] font-black uppercase text-slate-500">
                                    <span>DB Yükü</span>
                                    <span className="text-white">Low</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 w-[12%]" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center pr-1 text-[10px] font-black uppercase text-slate-500">
                                    <span>API Latency</span>
                                    <span className="text-white">12ms</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 w-[8%]" />
                                </div>
                            </div>
                            <div className="pt-4 border-t border-white/5">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Uptime (30 Gün)</div>
                                <div className="text-4xl font-black text-white tracking-tighter">%99.98</div>
                            </div>
                        </div>
                    </SectionCard>

                    <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[28px] shadow-2xl shadow-blue-600/20 text-white relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-20 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform"><FiActivity size={120} /></div>
                        <h4 className="text-lg font-black uppercase tracking-widest mb-1">PRO PLUS</h4>
                        <p className="text-[10px] font-bold text-white/60 mb-6 uppercase">Yıllık Lisans Hedeflenen</p>
                        <div className="text-3xl font-black mb-4 tracking-tighter">€12,500 <span className="text-xs text-white/50">/ month</span></div>
                        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden mb-2">
                            <div className="h-full bg-white w-[64%]" />
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase">
                            <span>Hedef: €20k</span>
                            <span>%64</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
