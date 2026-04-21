import React, { useEffect } from 'react';
import { 
    FiTrendingUp, FiTrendingDown, FiAward, FiUsers, FiBarChart2, 
    FiArrowUpRight, FiLayers, FiShield, FiZap, FiTarget, FiPieChart 
} from 'react-icons/fi';
import { useSaaSStore } from '../../store/useSaaSStore';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { StatCard, SectionCard, EmptyState } from './SaaSShared';
import { motion, AnimatePresence } from 'framer-motion';

export const ReportsTab: React.FC = () => {
    const { t } = useSaaSLocale();
    const { growthReport, fetchGrowthReport, settings } = useSaaSStore();
    const currency = settings?.currency || '€';
    
    useEffect(() => { 
        fetchGrowthReport(); 
    }, [fetchGrowthReport]);
    
    const gr = growthReport;

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
            {/* 1. Global Growth Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 sm:px-0">
                <StatCard 
                    label={t('reports.totalRest')} 
                    value={gr?.totalTenants || 0} 
                    icon={<FiUsers />} 
                    color="blue" 
                    trendStatus="up"
                    trend="+5.2%"
                />
                <StatCard 
                    label={t('reports.churn')} 
                    value={`%${gr?.churnRate || 0}`} 
                    icon={<FiTrendingDown />} 
                    color="rose" 
                    trendStatus="down"
                    trend="-1.2%"
                    sub="Monthly Erosion"
                />
                <StatCard 
                    label={t('reports.activePlans')} 
                    value={gr?.planDistribution?.length || 0} 
                    icon={<FiPieChart />} 
                    color="emerald" 
                    sub="Active Revenue Tiers"
                />
                <StatCard 
                    label="EST. CLV" 
                    value={`${currency}4.2k`} 
                    icon={<FiZap />} 
                    color="purple" 
                    sub="Customer Lifetime Value"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 px-4 sm:px-0">
                {/* 2. Monthly Retention Engine */}
                <div className="xl:col-span-12">
                    <SectionCard 
                        title={t('reports.monthlyGrowth')} 
                        icon={<FiTrendingUp className="text-emerald-400" />}
                        action={
                            <div className="flex bg-slate-900/40 rounded-xl p-1 border border-white/5 shadow-xl">
                                <button className="px-3 py-1 text-[9px] font-black text-white bg-blue-600 rounded-lg uppercase">Tenants</button>
                                <button className="px-3 py-1 text-[9px] font-black text-slate-500 hover:text-white uppercase transition-colors">Revenue</button>
                            </div>
                        }
                    >
                        {gr?.monthlyGrowth && gr.monthlyGrowth.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-8">
                                <div className="space-y-6">
                                    {gr.monthlyGrowth.slice(-6).map((m: any, i: number) => {
                                        const max = Math.max(...gr.monthlyGrowth.map((x: any) => x.new_tenants || 1));
                                        const pct = ((m.new_tenants || 0) / max) * 100;
                                        return (
                                            <motion.div 
                                                key={i} 
                                                className="group"
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                            >
                                                <div className="flex justify-between items-center mb-2 px-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.month}</span>
                                                    <span className="text-[11px] font-black text-white italic">+{m.new_tenants} <span className="text-[8px] text-slate-600 not-italic uppercase tracking-tighter">New Nodes</span></span>
                                                </div>
                                                <div className="h-4 bg-white/[0.02] border border-white/5 rounded-full overflow-hidden p-0.5 group-hover:border-blue-500/20 transition-all">
                                                    <motion.div 
                                                        className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 rounded-full relative shadow-[0_0_15px_rgba(59,130,246,0.2)]" 
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${Math.max(pct, 5)}%` }}
                                                        transition={{ duration: 1, ease: "easeOut" }}
                                                    >
                                                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                                                    </motion.div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                                <div className="relative p-12 bg-white/[0.012] rounded-[48px] border border-white/5 hidden lg:flex flex-col items-center justify-center text-center overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <FiTarget size={120} className="text-blue-500/10 mb-6 group-hover:scale-110 transition-transform duration-700" />
                                    <div className="text-4xl font-black text-white italic tracking-tighter mb-2">AESTHETIC-DRIVEN</div>
                                    <div className="text-xs font-black text-blue-400 uppercase tracking-[0.4em] mb-4">Growth Strategy 2026</div>
                                    <p className="text-[10px] text-slate-500 font-bold max-w-[200px] leading-relaxed uppercase opacity-40 group-hover:opacity-100 transition-opacity">Dynamic resource allocation and reseller micro-incentives active.</p>
                                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-20" />
                                </div>
                            </div>
                        ) : <EmptyState icon={<FiTrendingUp />} message={t('reports.growthEmpty')} />}
                    </SectionCard>
                </div>

                {/* 3. Elite Portfolio & Plan Distribution */}
                <div className="xl:col-span-7">
                    <SectionCard title={t('reports.topTen')} icon={<FiAward className="text-amber-400" />}>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {gr?.topTenants && gr.topTenants.length > 0 ? (
                                    gr.topTenants.map((row: any, i: number) => (
                                        <motion.div 
                                            key={row.id} 
                                            layout
                                            variants={itemVariants}
                                            className="flex items-center gap-5 p-5 bg-slate-900/40 backdrop-blur-xl rounded-[32px] border border-white/5 hover:border-amber-400/30 transition-all group relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity rotate-12">
                                                <FiAward size={80} />
                                            </div>
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black shadow-2xl relative overflow-hidden ${
                                                i === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-amber-900' : 
                                                i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800' :
                                                i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-orange-900' :
                                                'bg-white/5 text-slate-500 border border-white/10'
                                            }`}>
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-black text-white text-base tracking-tight mb-1 truncate group-hover:text-amber-400 transition-colors uppercase italic">{row.name}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                                                        row.subscription_plan === 'enterprise' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                                                        row.subscription_plan === 'pro' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                        'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                    } tracking-wider`}>
                                                        {row.subscription_plan}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">Established {new Date(row.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-lg font-black text-emerald-400 font-mono tracking-tighter">{currency}{Number(row.total_paid || 0).toLocaleString()}</div>
                                                <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{t('reports.totalPaid')}</div>
                                            </div>
                                        </motion.div>
                                    ))
                                ) : <EmptyState icon={<FiAward />} message={t('reports.topEmpty')} />}
                            </AnimatePresence>
                        </div>
                    </SectionCard>
                </div>

                <div className="xl:col-span-5 h-fit">
                    <SectionCard title={t('reports.planDist')} icon={<FiBarChart2 className="text-blue-400" />}>
                        <div className="grid grid-cols-1 gap-4">
                            {gr?.planDistribution?.map((p: any, i: number) => {
                                const colors = [
                                    'from-slate-800 to-slate-900 border-white/5 text-slate-500', 
                                    'from-blue-600/20 to-indigo-600/10 border-blue-500/20 text-blue-400', 
                                    'from-amber-600/20 to-orange-600/10 border-amber-500/20 text-amber-400'
                                ];
                                const icons = [<FiLayers size={24}/>, <FiZap size={24}/>, <FiShield size={24}/>];
                                const currentStyle = colors[i] || colors[0];
                                
                                        const lastClass = currentStyle.split(' ').pop() || '';
                                        return (
                                            <motion.div 
                                                key={i} 
                                                variants={itemVariants}
                                                whileHover={{ x: 10 }}
                                                className={`bg-gradient-to-br ${currentStyle} p-6 rounded-[32px] border flex items-center gap-6 group transition-all`}
                                            >
                                                <div className={`p-4 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform ${lastClass.replace('text-', 'text-opacity-80 text-')}`}>
                                                    {icons[i] || icons[0]}
                                                </div>
                                        <div>
                                            <div className="text-3xl font-black text-white italic tracking-tighter leading-none mb-1">{p.count}</div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.2em]">{p.plan} {t('reports.totalRest')}</div>
                                        </div>
                                        <FiArrowUpRight className="ml-auto opacity-0 group-hover:opacity-40 transition-opacity" size={24} />
                                    </motion.div>
                                );
                            })}
                        </div>
                    </SectionCard>
                </div>
            </div>
        </motion.div>
    );
};
