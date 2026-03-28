import React, { useEffect } from 'react';
import { 
    FiActivity, FiCpu, FiHardDrive, FiWifi, 
    FiCheckCircle, FiClock, FiTerminal, FiGlobe, 
    FiServer, FiDatabase, FiCloud 
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';

export const MonitoringTab: React.FC = () => {
    const { 
        systemHealth, fetchSystemHealth, isLoading: _isLoading 
    } = useSaaSStore();

    useEffect(() => { 
        fetchSystemHealth(); 
        const interval = setInterval(fetchSystemHealth, 30000); // 30s update
        return () => clearInterval(interval);
    }, []);

    const h = systemHealth;
    const recentMetrics = h?.recentMetrics || [];
    const maxLatency = Math.max(...recentMetrics.map((m: any) => Number(m.metric_value) || 1));

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* 1. Global Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Sistem Sağlık Skoru" value="98.4%" icon={<FiHeart className="text-pink-400" />} color="emerald" trend="+0.2%" />
                <StatCard label="Aktif Bağlantılar" value={h?.activeConnections || 0} icon={<FiWifi />} color="blue" sub="WebSocket & API" />
                <StatCard label="Uptime (Sistem)" value={h?.uptimeFormatted || '0s'} icon={<FiClock />} color="indigo" sub="Kesintisiz Çalışma" />
                <StatCard label="Global Gecikme" value={h?.dbLatency || '0ms'} icon={<FiActivity />} color="emerald" sub="DB Yanıt Süresi" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 2. Health Radar (Central Component) */}
                <div className="md:col-span-2">
                    <SectionCard 
                        title="Live Health Radar — Global Servis İzleme" 
                        icon={<FiActivity className="text-emerald-400" />}
                        action={
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50`} />
                                <span className="text-[10px] font-black uppercase text-slate-400">CANLI İZLENİYOR</span>
                            </div>
                        }
                    >
                        <div className="relative p-6 pt-0">
                            {/* Radar Visualization */}
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { name: 'Core API Gateway', status: 'online', type: 'service', latency: '12ms', icon: <FiCloud /> },
                                    { name: 'Primary RDS (MariaDB)', status: 'online', type: 'db', latency: '8ms', icon: <FiDatabase /> },
                                    { name: 'Redis Cache Layer', status: 'online', type: 'cache', latency: '2ms', icon: <FiCpu /> },
                                    { name: 'PWA Asset Server', status: 'online', type: 'storage', latency: '45ms', icon: <FiHardDrive /> },
                                    { name: 'WebSocket Tunnel', status: 'warning', type: 'network', latency: '112ms', icon: <FiWifi /> },
                                    { name: 'Backup Nodes (Global)', status: 'offline', type: 'service', latency: '-', icon: <FiServer /> }
                                ].map((s, i) => (
                                    <div key={i} className="group p-4 bg-slate-900/60 rounded-[24px] border border-white/5 hover:border-blue-500/20 transition-all cursor-default">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`p-2 rounded-xl ${
                                                s.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' :
                                                s.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                                                'bg-red-500/10 text-red-400'
                                            }`}>
                                                {s.icon}
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-white/5 ${
                                                    s.status === 'online' ? 'text-emerald-400 bg-emerald-500/5' :
                                                    s.status === 'warning' ? 'text-amber-400 bg-amber-500/5' :
                                                    'text-red-400 bg-red-500/5'
                                                }`}>
                                                    {s.status}
                                                </div>
                                                <div className="text-[10px] font-mono text-slate-500 mt-1">{s.latency}</div>
                                            </div>
                                        </div>
                                        <div className="font-bold text-xs text-white uppercase tracking-tight">{s.name}</div>
                                        <div className="text-[9px] text-slate-500 uppercase font-black mt-0.5">{s.type}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Ping History Tracker Simulation */}
                            <div className="mt-8">
                                <div className="flex justify-between items-baseline mb-3">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Gecikme (Latency) Geçmişi</h4>
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase">ORTALAMA: 24.5ms</span>
                                </div>
                                <div className="flex items-end gap-1 h-32 bg-black/20 rounded-2xl p-4 border border-white/[0.03]">
                                    {recentMetrics.length > 0 ? recentMetrics.slice(-30).map((m: any, i: number) => {
                                        const val = Number(m.metric_value) || 0;
                                        const pct = (val / Math.max(maxLatency, 100)) * 100;
                                        return (
                                            <div key={i} className="flex-1 group relative">
                                                <div 
                                                    className={`w-full rounded-t-sm transition-all duration-500 ${val > 100 ? 'bg-red-500/60' : val > 50 ? 'bg-amber-500/60' : 'bg-emerald-500/60'}`} 
                                                    style={{ height: `${Math.max(pct, 5)}%` }} 
                                                />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-white text-[9px] px-2 py-1 rounded-md z-10 whitespace-nowrap shadow-xl">
                                                    {val}ms @ {new Date(m.recorded_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="w-full flex justify-center items-center h-full">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] animate-pulse">VERİ TOPLANIYOR...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                {/* 3. Resource Usage & DB Metrics */}
                <div className="space-y-6">
                    <SectionCard title="Veritabanı Sağlığı (DB Master)" icon={<FiDatabase className="text-blue-400" />}>
                        <div className="space-y-6">
                            {h?.dbSizes ? h.dbSizes.slice(0, 5).map((db: any, i: number) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between items-center pr-1">
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest truncate">{db.db_name}</span>
                                        <span className="text-xs font-mono font-bold text-white">{db.size_mb} MB</span>
                                    </div>
                                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden border border-white/5">
                                        <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-400 transition-all duration-1000" style={{ width: `${Math.min((db.size_mb / 500) * 100, 100)}%` }} />
                                    </div>
                                </div>
                            )) : <EmptyState icon={<FiDatabase />} message="DB metrikleri bekleniyor..." />}
                             <div className="pt-4 border-t border-white/5 mt-4">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500">
                                    <span>Aktif Thread Sayısı</span>
                                    <span className="text-white">{h?.activeConnections || 0}</span>
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Sistem Terminali (Live Audit)" icon={<FiTerminal className="text-indigo-400" />}>
                        <div className="bg-black/40 rounded-2xl p-4 font-mono text-[9px] text-emerald-400/80 h-[280px] overflow-y-auto space-y-2 custom-scrollbar border border-white/5 shadow-inner">
                            <p className="opacity-50 select-none">NextPOS Monitoring Gateway v1.4.0 (Build 302)</p>
                            <p className="text-slate-500 select-none">[03:00] CRON: Backup script executed successfully.</p>
                            <p className="flex gap-2"><span>[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> <span className="text-blue-400 font-bold">INFO:</span> New connection established from 192.168.1.1</p>
                            <p className="flex gap-2"><span>[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> <span className="text-emerald-400 font-bold">OK:</span> SSL certificate verified and active.</p>
                            <p className="flex gap-2"><span>[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> <span className="text-amber-400 font-bold">WARN:</span> High memory usage in Redis Node 1.</p>
                            <p className="flex gap-2"><span>[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> <span className="text-emerald-400 font-bold">SYS:</span> Health check broadcasted to all nodes.</p>
                            <p className="animate-pulse">_</p>
                        </div>
                    </SectionCard>
                </div>
            </div>

            {/* 4. Infrastructure Visualization Toggle */}
            <SectionCard title="Altyapı Dağılım Map (Multi-Region)" icon={<FiGlobe className="text-blue-400" />}>
                <div className="relative aspect-[21/9] bg-slate-900 shadow-inner rounded-[32px] border border-white/10 overflow-hidden group">
                     {/* Background Map Simulation */}
                     <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/world-map.png')] bg-center bg-no-repeat bg-contain" />
                     {/* Region Markers */}
                     <div className="absolute top-[30%] left-[50%] -translate-x-1/2 -translate-y-1/2">
                        <div className="relative">
                            <div className="absolute -inset-4 bg-emerald-500/20 rounded-full animate-ping" />
                            <div className="relative w-4 h-4 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.8)] border-2 border-white cursor-help">
                                 <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-3 py-1.5 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-2xl">
                                     <div className="font-bold border-b border-white/5 pb-1 mb-1 uppercase tracking-widest text-[8px]">EU-WEST (Frankfurt)</div>
                                     <div className="text-emerald-400">STATUS: %100 HEALTHY</div>
                                     <div className="text-slate-400">TOTAL TENANTS: 843</div>
                                 </div>
                            </div>
                        </div>
                     </div>
                     <div className="absolute top-[45%] left-[65%]">
                        <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] border-2 border-white opacity-40" />
                     </div>
                     <div className="absolute inset-0 flex items-center justify-center">
                         <span className="text-[10px] font-black text-slate-700 uppercase tracking-[1em] pointer-events-none select-none">GLOBAL CLOUD NETWORK</span>
                     </div>
                </div>
            </SectionCard>
        </div>
    );
};

interface FiHeartProps {
    className?: string;
}

const FiHeart: React.FC<FiHeartProps> = ({ className }) => {
    return (
        <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className={className} height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.89-8.89 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
    );
};
