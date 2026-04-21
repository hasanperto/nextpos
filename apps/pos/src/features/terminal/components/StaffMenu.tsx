import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FiX, FiUser, FiBarChart2, FiFileText, 
    FiLogOut, FiMoon, FiSettings,

    FiDatabase, FiHelpCircle, FiLock
} from 'react-icons/fi';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

export const StaffMenu: React.FC = () => {
    const { showStaffMenu, setStaffMenu, setStaffPanelTab } = useUIStore();
    const { user, logout } = useAuthStore();
    const { t } = usePosLocale();

    const handleAction = (tabId: string) => {
        setStaffMenu(false);
        if (['profile', 'stats', 'daily_report'].includes(tabId)) {
            const finalTab = tabId === 'daily_report' ? 'report' : tabId;
            setStaffPanelTab(finalTab as any);
        }
    };

    const menuItems = [
        { 
            id: 'profile', 
            label: t('staff.profile') || 'Kasiyer Profili', 
            icon: <FiUser size={18} />, 
            color: 'text-blue-400', 
            bg: 'bg-blue-400/10' 
        },
        { 
            id: 'stats', 
            label: t('staff.stats') || 'İstatistikler', 
            icon: <FiBarChart2 size={18} />, 
            color: 'text-emerald-400', 
            bg: 'bg-emerald-400/10' 
        },
        { 
            id: 'daily_report', 
            label: t('staff.daily_report') || 'Günlük Rapor', 
            icon: <FiFileText size={18} />, 
            color: 'text-amber-400', 
            bg: 'bg-amber-400/10' 
        },
        { 
            id: 'backup', 
            label: t('staff.backup') || 'Yerel Yedek', 
            icon: <FiDatabase size={18} />, 
            color: 'text-purple-400', 
            bg: 'bg-purple-400/10' 
        },
        { 
            id: 'settings', 
            label: t('staff.settings') || 'Ayarlar', 
            icon: <FiSettings size={18} />, 
            color: 'text-slate-400', 
            bg: 'bg-slate-400/10' 
        },
        { 
            id: 'help', 
            label: t('staff.help') || 'Yardım Merkezi', 
            icon: <FiHelpCircle size={18} />, 
            color: 'text-blue-500', 
            bg: 'bg-blue-500/10' 
        },
    ];

    if (!showStaffMenu) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex justify-end">
                {/* Overlay */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setStaffMenu(false)}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                {/* Sidebar Menu */}
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="relative w-full max-w-[320px] h-full bg-[#0a0e1a] border-l border-white/5 flex flex-col shadow-2xl"
                >
                    {/* Header */}
                    <div className="p-6 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-900/30">
                                {user?.name?.charAt(0) || 'K'}
                            </div>
                            <div>
                                <h3 className="text-white font-black tracking-tight">{user?.name || 'Kasiyer'}</h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{user?.role?.toUpperCase() || 'STAFF'}</span>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => setStaffMenu(false)}
                            className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95"
                        >
                            <FiX size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 gap-3">
                            <button className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                                <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 group-hover:scale-110 transition-all">
                                    <FiLock size={20} />
                                </div>
                                <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-white transition-all">Kilitle</span>
                            </button>
                            <button className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-all">
                                    <FiMoon size={20} />
                                </div>
                                <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-white transition-all">Gece Modu</span>
                            </button>
                        </div>

                        {/* Navigation Menu */}
                        <div className="space-y-1">
                            <h4 className="px-3 mb-3 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Personel Paneli</h4>
                            {menuItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleAction(item.id)}
                                    className="w-full flex items-center gap-4 px-3 py-3 rounded-2xl bg-transparent hover:bg-white/5 transition-all group border border-transparent hover:border-white/5"
                                >

                                    <div className={`p-2.5 rounded-xl ${item.bg} ${item.color} group-hover:scale-110 transition-all shadow-sm`}>
                                        {item.icon}
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-all">
                                        {item.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Status Bar */}
                        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">Sistem Durumu</span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 bg-emerald-500 text-white rounded uppercase tracking-wider animate-pulse">Online</span>
                            </div>
                            <div className="h-1 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: '100%' }}
                                    className="h-full bg-emerald-500" 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/5">
                        <button 
                            onClick={() => { setStaffMenu(false); logout(); }}
                            className="w-full h-12 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl flex items-center justify-center gap-3 hover:bg-rose-500 hover:text-white transition-all font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-900/10 group active:scale-95"
                        >
                            <FiLogOut size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                            {t('auth.logout') || 'Oturumu Kapat'}
                        </button>
                        
                        <div className="mt-4 flex items-center justify-center gap-2 opacity-20">
                            <span className="text-[10px] font-black text-white italic tracking-tighter uppercase">NextPOS v2.0</span>
                            <div className="w-1 h-1 rounded-full bg-white" />
                            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Built with precision</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
