import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FiHome, FiLayout, FiLogOut, FiGrid, FiPackage, FiUsers, FiBarChart2, FiLayers, FiTruck, FiSettings, FiDollarSign, FiShield, FiTarget, FiPercent, FiCalendar, FiBook } from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useStaffPresenceBroadcast } from '../hooks/useStaffPresenceBroadcast';
import { BillingWarning } from '../components/BillingWarning';

export const AdminShell: React.FC = () => {
    const navigate = useNavigate();
    const { logout, user, getAuthHeaders } = useAuthStore();
    const fetchSettings = usePosStore((s) => s.fetchSettings);
    const { t } = usePosLocale();
    useStaffPresenceBroadcast();
    const [entitlementMap, setEntitlementMap] = useState<Record<string, boolean> | null>(null);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        const load = async () => {
            try {
                const r = await fetch('/api/v1/billing/status', { headers: getAuthHeaders() });
                if (!r.ok) return;
                const s = await r.json();
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
        <div className="flex h-screen bg-[#020617] text-black font-sans">
            <aside className="flex w-64 flex-col bg-[#0f172a] border-r border-white/5 text-black shadow-2xl">
                <div className="flex h-20 items-center border-b border-slate-700">
                    <h1 className="px-6 text-xl font-black tracking-widest text-[#38BDF8]">
                        NextPOS <span className="text-white font-medium">{t('admin.shell.badge_admin')}</span>
                    </h1>
                </div>
                <nav className="flex-1 space-y-2 px-4 py-6">
                    <NavLink to="/admin" end className={linkClass}>
                        <FiLayout size={18} /> {t('admin.shell.nav_overview')}
                    </NavLink>
                    
                    {user?.role === 'admin' && (
                        <>
                            <NavLink to="/admin/menu" className={linkClass}>
                                <FiGrid size={18} /> {t('admin.shell.nav_menu')}
                            </NavLink>
                            <NavLink to="/admin/floor" className={linkClass}>
                                <FiLayers size={18} /> {t('admin.shell.nav_floor')}
                            </NavLink>
                            <NavLink to="/admin/staff" className={linkClass}>
                                <FiShield size={18} /> {t('admin.shell.nav_staff')}
                            </NavLink>
                        </>
                    )}

                    <NavLink to="/admin/staff-performance" className={linkClass}>
                        <FiTarget size={18} /> {t('admin.shell.nav_staff_perf')}
                    </NavLink>
                    
                    {user?.role === 'admin' && (
                        <>
                            {canUseCustomers && (
                                <NavLink to="/admin/customers" className={linkClass}>
                                    <FiUsers size={18} /> {t('admin.shell.nav_customers')}
                                </NavLink>
                            )}
                            <NavLink to="/admin/campaigns" className={linkClass}>
                                <FiPercent size={18} /> {t('admin.shell.nav_campaigns')}
                            </NavLink>
                            {canUseReservations && (
                                <NavLink to="/admin/reservations" className={linkClass}>
                                    <FiCalendar size={18} /> {t('admin.shell.nav_reservations')}
                                </NavLink>
                            )}
                        </>
                    )}

                    <NavLink to="/admin/reports" className={linkClass}>
                        <FiBarChart2 size={18} /> {t('admin.shell.nav_reports')}
                    </NavLink>
                    
                    {user?.role === 'admin' && (
                        <>
                            {canUseInventory && (
                                <>
                                    <NavLink to="/admin/stock" className={linkClass}>
                                        <FiPackage size={18} /> {t('admin.shell.nav_stock')}
                                    </NavLink>
                                    <NavLink to="/admin/recipes" className={linkClass}>
                                        <FiBook size={18} /> {t('admin.shell.nav_recipes')}
                                    </NavLink>
                                </>
                            )}
                            {canUseCourierModule && (
                                <>
                                    <NavLink to="/admin/delivery" className={linkClass}>
                                        <FiTruck size={18} /> {t('admin.shell.nav_zones')}
                                    </NavLink>
                                    <NavLink to="/admin/couriers" className={linkClass}>
                                        <FiTruck size={18} /> {t('admin.shell.nav_couriers')}
                                    </NavLink>
                                </>
                            )}
                            <NavLink to="/admin/settings" className={linkClass}>
                                <FiSettings size={18} /> {t('admin.shell.nav_settings')}
                            </NavLink>
                            <NavLink to="/admin/accounting" className={linkClass}>
                                <FiDollarSign size={18} /> {t('admin.shell.nav_accounting')}
                            </NavLink>
                        </>
                    )}
                </nav>
                <div className="space-y-2 border-t border-slate-700 p-4">
                    {user && (
                        <p className="truncate px-2 text-xs text-slate-500">
                            {user.name} · {user.role}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => navigate('/pos')}
                        className="flex w-full items-center gap-2 px-4 py-2 text-slate-400 transition-colors hover:text-white"
                    >
                        <FiHome /> {t('admin.shell.pos_terminal')}
                    </button>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-4 py-2 text-red-400 transition-colors hover:text-red-300"
                    >
                        <FiLogOut /> {t('admin.shell.logout')}
                    </button>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <BillingWarning />
                <Outlet />
            </div>
        </div>
    );
};
