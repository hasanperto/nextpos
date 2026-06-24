import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FiHome, FiLayout, FiLogOut, FiGrid, FiPackage, FiUsers, FiBarChart2, FiLayers, FiTruck, FiSettings, FiDollarSign, FiShield, FiTarget, FiPercent, FiCalendar, FiBook, FiMenu, FiX, FiSun, FiMoon, FiMessageSquare, FiCreditCard, FiClock, FiGlobe } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useStaffPresenceBroadcast } from '../hooks/useStaffPresenceBroadcast';
import { BillingWarning } from '../components/BillingWarning';

export const AdminShell: React.FC = () => {
    const navigate = useNavigate();
    const { logout, user, getAuthHeaders } = useAuthStore();
    const fetchSettings = usePosStore((s) => s.fetchSettings);
    const lang = usePosStore((s) => s.lang);
    const setLang = usePosStore((s) => s.setLang);
    const { t } = usePosLocale();
    useStaffPresenceBroadcast();
    const [entitlementMap, setEntitlementMap] = useState<Record<string, boolean> | null>(null);
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { theme, toggleTheme, isDark } = useTheme();
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        const load = async () => {
            try {
                const r = await fetch('/api/v1/billing/status', { headers: getAuthHeaders() });
                if (!r.ok) return;
                const s = await r.json();
                setDaysRemaining(s.daysRemaining ?? null);
                const list = Array.isArray(s?.entitlements) ? s.entitlements : [];
                const map: Record<string, boolean> = {};
                for (const e of list) {
                    if (e?.code) map[String(e.code)] = Boolean(e.enabled);
                }
                setEntitlementMap(map);
            } catch {
            }
        };
        void load();
    }, [getAuthHeaders]);

    const canUseCustomers = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.customer_crm !== false;
    }, [entitlementMap]);

    const canUseInventory = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.inventory !== false;
    }, [entitlementMap]);

    const canUseReservations = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.table_reservation !== false;
    }, [entitlementMap]);

    const canUseCourierModule = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.courier_module !== false;
    }, [entitlementMap]);

    const canUseAdvancedReports = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.advanced_reports !== false;
    }, [entitlementMap]);

    const canUseWhatsApp = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.whatsapp_orders !== false;
    }, [entitlementMap]);

    const canUseCallerId = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.caller_id_android !== false;
    }, [entitlementMap]);

    const canUseFiscalTse = useMemo(() => {
        if (!entitlementMap) return true;
        return entitlementMap.fiscal_tse !== false;
    }, [entitlementMap]);

    useEffect(() => {
        const allowedRoles = ['admin', 'cashier'];
        if (user && !allowedRoles.includes(user.role)) {
            navigate('/cashier', { replace: true });
        }
    }, [user, navigate]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const linkClass = ({ isActive }: { isActive: boolean }) =>
        `w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
            isActive
                ? 'bg-blue-600/20 text-blue-400 font-bold border-blue-500/30'
                : 'hover:bg-slate-700/50 text-slate-300 border-transparent'
        }`;

    return (
        <div className="flex flex-col lg:flex-row h-screen bg-[#020617] text-white font-sans overflow-hidden">
            {/* Mobile Header */}
            <header className="lg:hidden flex h-16 shrink-0 items-center justify-between bg-[#0f172a] border-b border-white/5 px-4 z-30 shadow-md">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        aria-label="Toggle Menu"
                    >
                        {isMobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
                    </button>
                    <h1 className="text-md font-black tracking-widest text-[#38BDF8]">
                        NextPOS <span className="text-white font-medium text-xs">{t('admin.shell.badge_admin')}</span>
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    {/* Mobile Network Status */}
                    {isOnline ? (
                        <div className="flex items-center justify-center h-9 w-9 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/5" title="Çevrimiçi (Online)">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-[9px] font-black uppercase tracking-wider animate-pulse shadow-lg shadow-rose-500/5" title="Çevrimdışı (Offline)">
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                            </span>
                            <span>{t('status.offline') || 'OFFLINE'}</span>
                        </div>
                    )}
                    {daysRemaining !== null && (
                        <div 
                            onClick={() => navigate('/admin/billing')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border shrink-0 backdrop-blur-md cursor-pointer ${
                                daysRemaining > 20 
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                            }`}
                        >
                            <FiClock size={10} className={daysRemaining <= 20 ? 'animate-pulse' : ''} />
                            <span>{daysRemaining} Gün</span>
                        </div>
                    )}
                    {/* Theme Toggle (Mobile) */}
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-95"
                        title={isDark ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
                    >
                        {isDark ? <FiSun size={16} className="text-amber-400" /> : <FiMoon size={16} className="text-indigo-400" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/pos')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                        <FiHome size={14} />
                        <span>POS</span>
                    </button>
                </div>
            </header>

            {/* Sidebar Backdrop for Mobile */}
            {isMobileMenuOpen && (
                <div 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity cursor-pointer"
                />
            )}

            {/* Admin Sidebar Navigation */}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0f172a] border-r border-white/5 text-black shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
                isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}>
                <div className="flex h-20 items-center border-b border-slate-700 shrink-0">
                    <h1 className="px-6 text-xl font-black tracking-widest text-[#38BDF8] flex items-center justify-between w-full">
                        <span>NextPOS <span className="text-white font-medium">{t('admin.shell.badge_admin')}</span></span>
                        <button 
                            type="button" 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                        >
                            <FiX size={18} />
                        </button>
                    </h1>
                </div>
                <nav className="flex-1 space-y-1.5 px-4 py-6 overflow-y-auto no-scrollbar">
                    <NavLink to="/admin" end className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                        <FiLayout size={18} /> {t('admin.shell.nav_overview')}
                    </NavLink>
                    
                    {user?.role === 'admin' && (
                        <>
                            <NavLink to="/admin/menu" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiGrid size={18} /> {t('admin.shell.nav_menu')}
                            </NavLink>
                            <NavLink to="/admin/floor" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiLayers size={18} /> {t('admin.shell.nav_floor')}
                            </NavLink>
                            <NavLink to="/admin/staff" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiShield size={18} /> {t('admin.shell.nav_staff')}
                            </NavLink>
                        </>
                    )}

                    <NavLink to="/admin/staff-performance" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                        <FiTarget size={18} /> {t('admin.shell.nav_staff_perf')}
                    </NavLink>
                    
                    <NavLink to="/admin/settlements" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                        <FiDollarSign size={18} /> {t('admin.shell.nav_settlements') || 'Personel Mutabakatı'}
                    </NavLink>
                    
                    {user?.role === 'admin' && (
                        <>
                            {canUseCustomers && (
                                <NavLink to="/admin/customers" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                    <FiUsers size={18} /> {t('admin.shell.nav_customers')}
                                </NavLink>
                            )}
                            <NavLink to="/admin/campaigns" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiPercent size={18} /> {t('admin.shell.nav_campaigns')}
                            </NavLink>
                            {canUseReservations && (
                                <NavLink to="/admin/reservations" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                    <FiCalendar size={18} /> {t('admin.shell.nav_reservations')}
                                </NavLink>
                            )}
                        </>
                    )}

                    <NavLink to="/admin/reports" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                        <FiBarChart2 size={18} /> {t('admin.shell.nav_reports')}
                    </NavLink>
                    
                    {user?.role === 'admin' && (
                        <>
                            {canUseInventory && (
                                <>
                                    <NavLink to="/admin/stock" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                        <FiPackage size={18} /> {t('admin.shell.nav_stock')}
                                    </NavLink>
                                    <NavLink to="/admin/recipes" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                        <FiBook size={18} /> {t('admin.shell.nav_recipes')}
                                    </NavLink>
                                </>
                            )}
                            {canUseCourierModule && (
                                <>
                                    <NavLink to="/admin/delivery" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                        <FiTruck size={18} /> {t('admin.shell.nav_zones')}
                                    </NavLink>
                                    <NavLink to="/admin/couriers" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                        <FiTruck size={18} /> {t('admin.shell.nav_couriers')}
                                    </NavLink>
                                </>
                            )}
                            <NavLink to="/admin/billing" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiCreditCard size={18} /> {t('admin.shell.nav_billing') || 'Lisans & Ödemeler'}
                            </NavLink>
                            <NavLink to="/admin/settings" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiSettings size={18} /> {t('admin.shell.nav_settings')}
                            </NavLink>
                            <NavLink to="/admin/accounting" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiDollarSign size={18} /> {t('admin.shell.nav_accounting')}
                            </NavLink>
                            <NavLink to="/admin/support" className={linkClass} onClick={() => setIsMobileMenuOpen(false)}>
                                <FiMessageSquare size={18} /> {t('admin.shell.nav_support')}
                            </NavLink>
                        </>
                    )}
                </nav>
                <div className="space-y-2 border-t border-slate-700 p-4 shrink-0">
                    {user && (
                        <p className="truncate px-2 text-xs text-slate-500">
                            {user.name} · {user.role}
                        </p>
                    )}
                    {/* Theme Toggle */}
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="theme-toggle flex w-full items-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 transition-all cursor-pointer group hover:bg-white/10"
                        title={isDark ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
                    >
                        <div className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${isDark ? 'bg-indigo-600/40' : 'bg-amber-400/40'}`}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${isDark ? 'left-0.5 bg-indigo-400' : 'left-[22px] bg-amber-400'}`}>
                                {isDark ? <FiMoon size={10} className="text-white" /> : <FiSun size={10} className="text-white" />}
                            </div>
                        </div>
                        <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">
                            {isDark ? 'Karanlık Tema' : 'Aydınlık Tema'}
                        </span>
                    </button>
                    {/* Language Switcher */}
                    <div className="flex w-full items-center gap-3 px-4 py-2 rounded-xl border border-white/10 bg-white/5 group hover:bg-white/10 relative transition-all">
                        <FiGlobe className="text-slate-400 group-hover:text-slate-200 transition-colors shrink-0" size={16} />
                        <div className="flex-1 min-w-0">
                            <select
                                value={lang}
                                onChange={(e) => setLang(e.target.value as any)}
                                className="w-full bg-transparent border-none text-xs font-bold text-slate-400 group-hover:text-slate-200 focus:outline-none cursor-pointer appearance-none pr-8 py-1"
                            >
                                <option value="tr" className="bg-[#0f172a] text-white">🇹🇷 Türkçe</option>
                                <option value="de" className="bg-[#0f172a] text-white">🇩🇪 Deutsch</option>
                                <option value="en" className="bg-[#0f172a] text-white">🇬🇧 English</option>
                            </select>
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                            <span className="text-[10px]">▼</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setIsMobileMenuOpen(false); navigate('/pos'); }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-slate-400 transition-colors hover:text-white cursor-pointer text-left"
                    >
                        <FiHome /> {t('admin.shell.pos_terminal')}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-red-400 transition-colors hover:text-red-300 cursor-pointer text-left"
                    >
                        <FiLogOut /> {t('admin.shell.logout')}
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#020617]">
                {/* Desktop Header */}
                <header className="hidden lg:flex h-16 shrink-0 items-center justify-between bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 px-6 z-30 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {t('admin.shell.title')}
                        </span>
                        {user?.branchName && (
                            <span className="text-xs font-bold text-slate-500 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                                🏢 {user.branchName}
                            </span>
                        )}
                        {/* Network Status Badge */}
                        {isOnline ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-emerald-500/5">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span>{t('status.online') || 'Çevrimiçi'}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-wider animate-pulse shadow-lg shadow-rose-500/5">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                                </span>
                                <span>{t('status.offline') || 'Çevrimdışı'}</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {daysRemaining !== null && (
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border shrink-0 backdrop-blur-md ${
                                daysRemaining > 20 
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                            }`}>
                                <FiClock size={12} className={daysRemaining <= 20 ? 'animate-pulse' : ''} />
                                <span>{t('admin.shell.daysRemaining').replace('{{days}}', String(daysRemaining))}</span>
                                <button 
                                    onClick={() => navigate('/admin/billing')}
                                    className="ml-1.5 px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded text-[8px] font-black uppercase transition-all"
                                >
                                    {t('admin.shell.extendLicense')}
                                </button>
                            </div>
                        )}

                        <div className="h-6 w-px bg-white/5" />
                        
                        <button
                            type="button"
                            onClick={() => navigate('/pos')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 hover:bg-white/10"
                        >
                            <FiHome size={14} />
                            <span>{t('admin.shell.pos_terminal')}</span>
                        </button>
                    </div>
                </header>

                <BillingWarning />
                <div className="flex-1 overflow-y-auto">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};
