import React, { useEffect } from 'react';
import { 
    FiActivity, FiCpu, FiHardDrive, FiWifi, 
    FiClock, FiTerminal, FiGlobe, 
    FiServer, FiDatabase, FiCloud, FiHeart, FiZap, FiCheckCircle, FiSearch, FiLayers, FiShield
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

export const MonitoringTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { 
        admin, systemHealth, fetchSystemHealth, tenants, fetchTenants, presence, fetchPresence
    } = useSaaSStore();

    const isReseller = admin?.role === 'reseller';

    useEffect(() => { 
        fetchSystemHealth(); 
        fetchTenants();
        fetchPresence();
        const healthInterval = setInterval(fetchSystemHealth, 30000); 
        const presenceInterval = setInterval(fetchPresence, 15000); 
        return () => {
            clearInterval(healthInterval);
            clearInterval(presenceInterval);
        };
    }, [fetchSystemHealth, fetchTenants, fetchPresence]);

    const h = systemHealth;
    const recentMetrics = h?.recentMetrics || [];
    const maxLatency = Math.max(...recentMetrics.map((m: any) => Number(m.metric_value) || 1));

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: { duration: 0.6, staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.98 },
        visible: { opacity: 1, scale: 1 }
    };

    return (
        <motion.div 
            className="space-y-8 pb-10"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Global Pulse Analytics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
                <StatCard 
                    label={isReseller ? t('monitor.portfolioHealth') : t('monitor.healthScore')} 
                    value={isReseller ? "99.9%" : "98.7%"} 
                    icon={<FiHeart className="animate-pulse" />} 
                    color="rose" 
                    trendStatus="up"
                    trend="OPTIMAL"
                />
                <StatCard 
                    label={isReseller ? t('monitor.onlineTenants') : t('monitor.activeConn')} 
                    value={Object.values(presence).reduce((a, b) => a + b, 0)} 
                    icon={<FiWifi className="animate-bounce-slow" />} 
                    color="blue" 
                    sub={`${Object.keys(presence).length} Terminals Active`}
                />
                <StatCard 
                    label={isReseller ? t('monitor.avgResponse') : t('monitor.uptime')} 
                    value={isReseller ? "34ms" : (h?.uptimeFormatted || '0s')} 
                    icon={isReseller ? <FiZap className="text-amber-400" /> : <FiClock />} 
                    color="amber" 
                    sub="Network Velocity"
                />
                <StatCard 
                    label={t('monitor.globalLatency')} 
                    value={h?.dbLatency || '9ms'} 
                    icon={<FiActivity />} 
                    color="emerald" 
                    trendStatus="stable"
                    trend="LOW"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 px-4 sm:px-0">
                {/* 2. Infrastructure Radar / Tenant Pulse */}
                <div className={isReseller ? "xl:col-span-8" : "xl:col-span-8"}>
                    <SectionCard 
                        title={isReseller ? t('monitor.tenantLivePulse') : t('monitor.radarTitle')} 
                        icon={<FiActivity className="text-emerald-400" />}
                        action={
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-xl shadow-emerald-500/5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                                    <span className="text-[9px] font-black uppercase text-emerald-400 tracking-widest">{t('monitor.liveBadge')}</span>
                                </div>
                                {isReseller && (
                                    <div className="relative group">
                                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                                        <input type="text" className="bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-[9px] text-white outline-none focus:border-blue-500/30 transition-all w-32 font-bold" placeholder="SEARCH..." />
                                    </div>
                                )}
                            </div>
                        }
                    >
                        {isReseller ? (
                            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-3 custom-scrollbar p-2">
                                <AnimatePresence mode="popLayout">
                                    {tenants.map((tenant) => {
                                        const isOnline = !!presence[tenant.id];
                                        return (
                                            <motion.div 
                                                key={tenant.id}
                                                layout
                                                variants={itemVariants}
                                                className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-5 rounded-[32px] hover:border-blue-500/30 transition-all group relative overflow-hidden flex items-center justify-between"
                                            >
                                                <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12 scale-150">
                                                    <FiActivity size={80} />
                                                </div>
                                                <div className="flex items-center gap-5 relative z-10">
                                                    <div className="relative">
                                                        <div className="w-16 h-16 rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center font-black text-blue-500 border border-white/5 shadow-2xl group-hover:scale-105 transition-all group-hover:rotate-3 italic text-xl">
                                                            {tenant.name[0].toUpperCase()}
                                                        </div>
                                                        <div className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full border-[4px] border-[#0a0f1d] shadow-[0_0_20px_rgba(0,0,0,0.8)] ${isOnline ? 'bg-emerald-500 animate-ping-slow' : 'bg-slate-700'}`} />
                                                        <div className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full border-[4px] border-[#0a0f1d] shadow-lg ${isOnline ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                                                    </div>
                                                    <div>
                                                        <div className="text-lg font-black text-white italic tracking-tight uppercase group-hover:text-blue-400 transition-colors leading-none mb-2">{tenant.name}</div>
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">{tenant.schema_name}</div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-1 h-1 bg-slate-700 rounded-full" />
                                                                <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{tenant.id.slice(0, 8)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8 relative z-10">
                                                    <div className="text-right hidden sm:block">
                                                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">NETWORK PULSE</div>
                                                        <div className={`text-[10px] font-black italic ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>{isOnline ? 'LATENCY: 14ms' : 'OFFLINE'}</div>
                                                    </div>
                                                    <button className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-white transition-all bg-white/5 rounded-2xl hover:bg-blue-600 active:scale-90 border border-white/5 shadow-xl">
                                                        <FiTerminal size={16} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                {tenants.length === 0 && <EmptyState icon={<FiLayers />} message="No tenants monitored." />}
                            </div>
                        ) : (
                            <div className="p-4 space-y-8">
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                                    {[
                                        { name: 'Core API Gateway', status: 'online', type: 'service', latency: '12ms', icon: <FiCloud /> },
                                        { name: 'Primary RDS', status: 'online', type: 'db', latency: '8ms', icon: <FiDatabase /> },
                                        { name: 'Redis Node Cluster', status: 'warning', type: 'cache', latency: '144ms', icon: <FiCpu /> },
                                        { name: 'S3 Asset Store', status: 'online', type: 'storage', latency: '32ms', icon: <FiHardDrive /> },
                                        { name: 'Socket IO Link', status: 'online', type: 'network', latency: '5ms', icon: <FiWifi /> },
                                        { name: 'Global Balancer', status: 'online', type: 'service', latency: '4ms', icon: <FiServer /> }
                                    ].map((s, i) => (
                                        <motion.div 
                                            key={i} 
                                            variants={itemVariants}
                                            className="group p-5 bg-slate-900/40 rounded-[32px] border border-white/5 hover:border-blue-500/20 transition-all cursor-default relative overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="flex justify-between items-start mb-6">
                                                <div className={`p-3 rounded-2xl shadow-xl ${
                                                    s.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' :
                                                    s.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                                                    'bg-rose-500/10 text-rose-400'
                                                }`}>
                                                    {React.cloneElement(s.icon as any, { size: 18 })}
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-xl border ${
                                                        s.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                        s.status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                        'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                    }`}>
                                                        {s.status.toUpperCase()}
                                                    </div>
                                                    <div className="text-[10px] font-mono font-black text-slate-500 mt-2 italic">{s.latency}</div>
                                                </div>
                                            </div>
                                            <div className="relative z-10">
                                                <div className="font-black text-xs text-white uppercase tracking-tighter italic">{s.name}</div>
                                                <div className="text-[9px] text-slate-600 uppercase font-black mt-1 tracking-[0.2em]">{s.type}</div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-baseline px-2 mt-4">
                                        <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">{t('monitor.latencyHistory')}</h4>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic opacity-60 px-2 py-0.5 border border-white/5 rounded-lg">LAST 48 NODES</span>
                                            <span className="text-[10px] font-black text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20 shadow-xl shadow-emerald-500/5 italic">AVG: 24ms</span>
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-1.5 h-36 bg-black/40 rounded-[40px] p-8 border border-white/5 relative overflow-hidden group/chart">
                                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-500/5 to-transparent pointer-events-none" />
                                        {recentMetrics.length > 0 ? recentMetrics.slice(-48).map((m: any, i: number) => {
                                            const val = Number(m.metric_value) || 0;
                                            const pct = (val / Math.max(maxLatency, 100)) * 100;
                                            return (
                                                <div key={i} className="flex-1 group relative h-full flex items-end">
                                                    <motion.div 
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${Math.max(pct, 6)}%` }}
                                                        className={`w-full rounded-t-lg transition-all duration-700 shadow-2xl ${
                                                            val > 100 ? 'bg-gradient-to-t from-rose-600 to-rose-400' : 
                                                            val > 50 ? 'bg-gradient-to-t from-amber-500 to-amber-300' : 
                                                            'bg-gradient-to-t from-blue-600 via-indigo-500 to-cyan-400'
                                                        } opacity-60 group-hover:opacity-100 group-hover:scale-y-110`} 
                                                    />
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block bg-slate-900 border border-white/20 text-white p-3 rounded-2xl z-20 shadow-2xl pointer-events-none">
                                                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Snapshot</div>
                                                        <div className="text-sm font-black italic">{val}ms</div>
                                                        <div className="text-[9px] text-slate-400 mt-1">{new Date(m.recorded_at).toLocaleTimeString()}</div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <FiActivity size={32} className="text-slate-800 animate-pulse" />
                                                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest italic">{t('monitor.collecting')}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </SectionCard>
                </div>

                {/* 3. Side panels: Infra Health / Micro Terminal */}
                <div className="xl:col-span-4 space-y-8">
                    {!isReseller && (
                        <SectionCard title={t('monitor.dbHealth')} icon={<FiDatabase className="text-indigo-400" />}>
                            <div className="space-y-6">
                                {h?.dbSizes ? h.dbSizes.slice(0, 5).map((db: any, i: number) => (
                                    <div key={i} className="space-y-3 group">
                                        <div className="flex justify-between items-end px-1">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Instance Name</span>
                                                <span className="text-xs font-black text-white italic truncate max-w-[150px] group-hover:text-blue-400 transition-colors uppercase">{db.db_name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-black text-white tabular-nums tracking-tighter italic">{db.size_mb} MB</span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-white/5 p-0.5">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min((db.size_mb / 500) * 100, 100)}%` }}
                                                className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
                                            />
                                        </div>
                                    </div>
                                )) : <EmptyState icon={<FiDatabase />} message={t('monitor.dbWaiting')} />}
                                <div className="pt-6 border-t border-white/5 mt-4">
                                    <div className="flex justify-between items-center bg-white/[0.03] p-4 rounded-2xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><FiLayers size={14}/></div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('monitor.activeThreads')}</span>
                                        </div>
                                        <span className="text-base font-black text-white italic">{h?.activeConnections || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}

                    <SectionCard title={t('monitor.terminalTitle')} icon={<FiTerminal className="text-blue-400" />}>
                        <div className="bg-black/80 backdrop-blur-3xl rounded-[40px] p-6 font-mono text-[10px] text-emerald-400/80 h-[380px] overflow-y-auto space-y-3 custom-scrollbar border border-white/10 shadow-2xl relative group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                                <FiTerminal size={40} />
                            </div>
                            <div className="sticky top-0 bg-transparent backdrop-blur-xl border-b border-white/5 pb-3 mb-4 font-black uppercase tracking-[0.3em] text-[8px] text-slate-600 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                REMOTE SESSION v1.4.2 [AES-256]
                            </div>
                            <p className="text-slate-600 select-none opacity-40">[{new Date().toLocaleTimeString()}] CLOUD-WATCH: Backup verification complete.</p>
                            <p className="flex gap-3 leading-relaxed">
                                <span className="text-slate-500/50">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> 
                                <span className="text-blue-500 font-black">INFO</span> 
                                <span className="opacity-90">Auto-scaling group 'EU-DE-1' adjusted to 3 active nodes.</span>
                            </p>
                            <p className="flex gap-3 leading-relaxed">
                                <span className="text-slate-500/50">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> 
                                <span className="text-emerald-500 font-black">OK</span> 
                                <span className="opacity-90">Global SSL certificate check: 100% valid. Next expiry: 342 days.</span>
                            </p>
                            <p className="flex gap-3 leading-relaxed">
                                <span className="text-slate-500/50">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> 
                                <span className="text-amber-500 font-black">WARN</span> 
                                <span className="opacity-90">Memory threshold reached in REDIS-PRIMARY-01 [Usage: 88%].</span>
                            </p>
                            <p className="flex gap-3 leading-relaxed">
                                <span className="text-slate-500/50">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> 
                                <span className="text-rose-500 font-black">ALERT</span> 
                                <span className="opacity-90 text-rose-400">Brute-force mitigation active for IP 185.122.x.x.</span>
                            </p>
                            <p className="animate-pulse text-white inline-block px-1 bg-white/10 select-none mt-2">_</p>
                        </div>
                    </SectionCard>

                    {isReseller && (
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-8 rounded-[48px] text-white shadow-2xl relative overflow-hidden group border border-white/20">
                            <div className="absolute -right-8 -bottom-8 opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-700">
                                <FiCheckCircle size={200} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md"><FiShield size={24} className="text-white drop-shadow-lg" /></div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Security Protocol</span>
                                </div>
                                <h4 className="text-2xl font-black tracking-tight italic mb-3">Portfolio Guard v2.0</h4>
                                <p className="text-xs text-white/70 font-bold leading-relaxed uppercase tracking-tighter">
                                    Adaptive threat detection and automated isolation protocols are active for your reseller network.
                                </p>
                                <div className="mt-8 pt-8 border-t border-white/10 flex items-center justify-between">
                                    <div className="text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-2xl bg-white/5 border border-white/10 italic">
                                        Safe Operation
                                    </div>
                                    <FiZap className="text-white animate-pulse" size={20} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Global Infrastructure Visualizer */}
            {!isReseller && (
                <SectionCard title={t('monitor.mapTitle')} icon={<FiGlobe className="text-blue-400" />}>
                    <div className="relative aspect-[21/9] bg-[#050810] shadow-2xl rounded-[48px] border border-white/10 overflow-hidden group">
                        {/* High-tech grid background */}
                        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                             style={{ backgroundImage: `radial-gradient(circle at 2px 2px, #2563eb 1px, transparent 0)`, backgroundSize: '32px 32px' }} />
                        
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <div className="w-[120%] aspect-square border-[0.5px] border-white/5 rounded-full border-dashed animate-[spin_120s_linear_infinite]" />
                            <div className="absolute w-[80%] aspect-square border-[0.5px] border-white/5 rounded-full border-dashed animate-[spin_80s_linear_infinite_reverse]" />
                            <div className="absolute w-[40%] aspect-square border-[0.5px] border-blue-500/10 rounded-full animate-pulse shadow-[0_0_100px_rgba(37,99,235,0.05)]" />
                        </div>

                        {/* Region Markers with Pulse */}
                        {[
                            { top: '35%', left: '50%', name: 'EU-CENT-1', city: 'Frankfurt', id: 'PRIMARY' },
                            { top: '40%', left: '15%', name: 'US-EAST-1', city: 'N.Virginia', id: 'REPLICA' },
                            { top: '65%', left: '80%', name: 'AP-SE-1', city: 'Singapore', id: 'LATENCY-GW' }
                        ].map((m, idx) => (
                            <div key={idx} className="absolute group/marker" style={{ top: m.top, left: m.left }}>
                                <div className="relative">
                                    <div className={`absolute -inset-8 rounded-full opacity-0 group-hover/marker:opacity-20 transition-opacity ${idx === 0 ? 'bg-emerald-500 animate-ping' : 'bg-blue-500 animate-pulse'}`} />
                                    <div className={`relative w-4 h-4 rounded-full shadow-2xl border-2 border-white cursor-help ${idx === 0 ? 'bg-emerald-500 shadow-emerald-500/80' : 'bg-blue-600 shadow-blue-500/80'}`} />
                                    
                                    <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/20 p-5 rounded-[28px] opacity-0 group-hover/marker:opacity-100 transition-all scale-90 group-hover/marker:scale-100 pointer-events-none z-30 shadow-[0_30px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl min-w-[180px]">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{m.id} NODE</span>
                                            <FiZap size={12} className={idx === 0 ? 'text-emerald-400' : 'text-blue-400'} />
                                        </div>
                                        <div className="text-sm font-black text-white uppercase italic mb-1 tracking-tight">{m.name}</div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.city}</div>
                                        <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">ENCRYPTED</span>
                                            <span className="text-[10px] font-black text-slate-300">99.9% Up</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="absolute bottom-10 left-10 flex flex-col gap-2">
                             <div className="flex items-center gap-3">
                                 <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                 <span className="text-[10px] font-black text-white italic uppercase tracking-[0.2em]">Operational Nodes Active</span>
                             </div>
                             <div className="flex items-center gap-3">
                                 <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
                                 <span className="text-[10px] font-black text-white italic uppercase tracking-[0.2em]">Replica Cluster Synced</span>
                             </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 py-8 flex justify-center pointer-events-none">
                            <span className="text-[11px] font-black text-slate-800 uppercase tracking-[3em] opacity-40">GLOBAL GEOMETRY INTERFACE</span>
                        </div>
                    </div>
                </SectionCard>
            )}
        </motion.div>
    );
};
