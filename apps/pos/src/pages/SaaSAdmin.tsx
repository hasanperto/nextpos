import React, { useEffect, useState } from 'react';
import {
    FiDatabase, FiBriefcase, FiPower, FiPlus,
    FiActivity, FiShield,
    FiAlertTriangle, FiDollarSign, FiLock,
    FiMessageSquare, FiBox, FiLayers,
    FiPieChart, FiSearch, FiBell, FiShoppingCart, FiSettings, FiRefreshCw,
    FiInbox, FiTag, FiMenu, FiX, FiFileText,
} from 'react-icons/fi';
import { useSaaSLocale, SaaSLocaleProvider } from '../contexts/SaaSLocaleContext';
import { SaaSLanguageSwitcher } from '../components/saas/SaaSLanguageSwitcher';
import { useSaaSStore } from '../store/useSaaSStore';
import { MenuItem, InputGroup, SelectGroup, Modal } from './saas/SaaSShared';
import { DashboardTab } from './saas/DashboardTab';
import { TenantsTab } from './saas/TenantsTab';
import { FinanceTab } from './saas/FinanceTab';
import { AccountingTab } from './saas/AccountingTab';
import { SecurityTab } from './saas/SecurityTab';
import { CRMTab } from './saas/CRMTab';
import { MonitoringTab } from './saas/MonitoringTab';
import { SupportTab } from './saas/SupportTab';
import { ResellersTab } from './saas/ResellersTab';
import { BackupsTab } from './saas/BackupsTab';
import { ReportsTab } from './saas/ReportsTab';
import { PlansTab } from './saas/PlansTab';
import { CampaignsTab } from './saas/CampaignsTab';
import { PosInvoicesTab } from './saas/PosInvoicesTab';
import { PosInvoiceLogsTab } from './saas/PosInvoiceLogsTab';
import { ShopTab } from './saas/ShopTab';
import { SettingsTab } from './saas/SettingsTab';
import { useResellerRealtimeSync } from '../hooks/useResellerRealtimeSync';
import { motion, AnimatePresence } from 'framer-motion';

type TabKey = 'dashboard' | 'tenants' | 'posInvoices' | 'posInvoiceLogs' | 'resellers' | 'finance' | 'accounting' | 'security' | 'reports' | 'plans' | 'campaigns' | 'backups' | 'crm' | 'monitoring' | 'support' | 'shop' | 'settings';

function generateMasterPassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const len = 8;
    const bytes = new Uint8Array(len);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
}

function tabTitle(t: (k: string) => string, k: TabKey, isReseller: boolean): string {
    if (isReseller && k === 'finance') return t('tab.financeReseller');
    if (isReseller && k === 'crm') return t('tab.crmReseller');
    if (!isReseller && k === 'finance') return t('tab.financeNav');
    return t(`tab.${k}`);
}

const SaaSAdminInner: React.FC = () => {
    const { t } = useSaaSLocale();
    const {
        token, admin, isLoading, error, fetchTenants, fetchStats, fetchSettings, settings, fetchSupportStats, fetchResellers,
        createTenant, login, logout, supportStats, createBackup,
        fetchSystemHealth, fetchGrowthReport, fetchFinancialSummary, fetchBackupStats,
        fetchResellerPlans,
        fetchPlanModuleMatrix,
        plans, fetchPlans,
        fetchBillingCatalog,
    } = useSaaSStore();

    const currency = settings?.currency || '€';

    useResellerRealtimeSync();

    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
    const [newTenant, setNewTenant] = useState<{
        name: string; schema_name: string; status: string; subscription_plan: string;
        contact_email: string;
        authorized_person: string; contact_phone: string; tax_office: string; tax_number: string;
        address: string; master_password: string;
        license_usage_type: 'prepaid' | 'direct_sale';
        payment_interval: 'monthly' | 'yearly';
        payment_method: 'bank_transfer' | 'cash' | 'admin_card';
        module_codes: string[];
        extra_device_qty: number;
        qr_domain: string;
    }>({
        name: '', schema_name: '', status: 'active', subscription_plan: 'basic',
        contact_email: '',
        authorized_person: '', contact_phone: '', tax_office: '', tax_number: '',
        address: '', master_password: '',
        license_usage_type: 'prepaid',
        payment_interval: 'monthly',
        payment_method: 'bank_transfer',
        module_codes: [],
        extra_device_qty: 1,
        qr_domain: '',
    });

    useEffect(() => {
        const handler = (ev: any) => {
            const tab = String(ev?.detail?.tab || '');
            if (tab === 'posInvoices' || tab === 'posInvoiceLogs') {
                setActiveTab(tab as TabKey);
                setSidebarOpen(false);
            }
        };
        window.addEventListener('saas:navigate', handler);
        return () => window.removeEventListener('saas:navigate', handler);
    }, []);

    useEffect(() => {
        if (token) {
            fetchTenants();
            fetchStats();
            fetchSettings();
            fetchSupportStats();
            if (admin?.role === 'super_admin') {
                fetchResellers();
                fetchSystemHealth();
                fetchGrowthReport();
                fetchFinancialSummary();
                fetchBackupStats();
            }
            if (admin?.role === 'reseller') {
                fetchResellerPlans();
            }
        }
    }, [token, admin?.id, admin?.role]);

    useEffect(() => {
        if (isAddTenantModalOpen && (admin?.role === 'super_admin' || admin?.role === 'reseller') && newTenant.subscription_plan) {
            fetchPlanModuleMatrix(newTenant.subscription_plan);
        }
    }, [isAddTenantModalOpen, admin?.role, newTenant.subscription_plan, fetchPlanModuleMatrix]);

    useEffect(() => {
        if (isAddTenantModalOpen && token) {
            fetchPlans();
            fetchBillingCatalog();
        }
    }, [isAddTenantModalOpen, token, fetchPlans, fetchBillingCatalog]);

    const currentSubPlan = plans.find((p) => p.code === newTenant.subscription_plan);


    useEffect(() => {
        if (!isAddTenantModalOpen) return;
        setNewTenant((prev) => ({ ...prev, master_password: generateMasterPassword() }));
    }, [isAddTenantModalOpen]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        login(loginForm.username, loginForm.password);
    };

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        const { qr_domain, ...tenantData } = newTenant;
        const ok = await createTenant(tenantData);
        if (ok) {
            if (qr_domain.trim() && tenantData.module_codes.includes('qr_web_menu')) {
                const created = useSaaSStore.getState().tenants;
                const newest = created.find((t: any) => t.schema_name === tenantData.schema_name);
                if (newest) {
                    await useSaaSStore.getState().addQrDomain(newest.id, qr_domain.trim().toLowerCase());
                }
            }
            setIsAddTenantModalOpen(false);
            setNewTenant({
                name: '',
                schema_name: '',
                status: 'active',
                subscription_plan: 'basic',
                contact_email: '',
                authorized_person: '',
                contact_phone: '',
                tax_office: '',
                tax_number: '',
                address: '',
                master_password: generateMasterPassword(),
                license_usage_type: 'prepaid',
                payment_interval: 'monthly',
                payment_method: 'bank_transfer',
                module_codes: [],
                extra_device_qty: 1,
                qr_domain: '',
            });
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-6 relative overflow-hidden">
                {/* Visual Background Elements */}
                <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[120px] animate-pulse" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-800 rounded-full blur-[120px]" />
                </div>
                
                <div className="absolute top-8 right-8">
                    <SaaSLanguageSwitcher />
                </div>

                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-[360px] sm:max-w-[420px] md:max-w-[480px] lg:max-w-[520px] z-10"
                >
                    <div className="text-center mb-12">
                        <motion.div 
                            initial={{ y: -20 }}
                            animate={{ y: 0 }}
                            className="inline-flex p-5 rounded-[32px] bg-blue-600/10 mb-6 border border-blue-500/20 shadow-[0_0_50px_rgba(37,99,235,0.2)]"
                        >
                            <FiShield className="text-blue-500" size={48} />
                        </motion.div>
                        <h1 className="text-5xl font-black text-white tracking-tighter mb-3">
                            NEXTPOS <span className="text-blue-500 italic">SAAS</span>
                        </h1>
                        <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px] opacity-70">{t('login.subtitle')}</p>
                    </div>

                    <form onSubmit={handleLogin} className="bg-slate-900/40 backdrop-blur-3xl p-10 rounded-[48px] border border-white/5 shadow-2xl space-y-8 relative group">
                        <div className="space-y-6">
                            <InputGroup label={t('login.username')} value={loginForm.username} onChange={v => setLoginForm({ ...loginForm, username: v })} placeholder="e.g. admin" />
                            <InputGroup label={t('login.password')} type="password" value={loginForm.password} onChange={v => setLoginForm({ ...loginForm, password: v })} placeholder="••••••••" />
                        </div>
                        
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-[20px] text-rose-400 text-xs font-black flex items-center gap-3 uppercase tracking-widest"
                            >
                                <FiAlertTriangle size={16} /> {error}
                            </motion.div>
                        )}
                        
                        <button 
                            type="submit" 
                            disabled={isLoading} 
                            className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[24px] text-white font-black hover:shadow-[0_0_40px_rgba(37,99,235,0.4)] active:scale-95 transition-all disabled:opacity-50 text-[11px] tracking-[0.2em] uppercase"
                        >
                            {isLoading ? t('login.loading') : t('login.submit')}
                        </button>
                        <p className="text-center text-[10px] text-slate-500 font-bold opacity-60 uppercase tracking-widest">{t('login.disclaimer')}</p>
                    </form>
                </motion.div>
            </div>
        );
    }

    const isReseller = admin?.role === 'reseller';
    const isSuperAdmin = admin?.role === 'super_admin';

    return (
        <div className="min-h-screen bg-[#070b14] text-slate-200 flex font-sans selection:bg-blue-500/30 overflow-hidden">
            {/* ═══════════════════ MOBILE SIDEBAR OVERLAY ═══════════════════ */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* ═══════════════════ SIDEBAR ═══════════════════ */}
            <aside className={`
                fixed lg:relative inset-y-0 left-0 z-[80] lg:z-auto
                w-72 sm:w-80 shrink-0 bg-[#0a0f1d]/95 lg:bg-[#0a0f1d]/80 border-r border-white/5 
                flex flex-col backdrop-blur-3xl h-screen
                transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.2),transparent_70%)]" />
                </div>

                {/* Mobile Close Button */}
                <div className="lg:hidden flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-[14px] flex items-center justify-center">
                            <FiShield className="text-white" size={20} />
                        </div>
                        <span className="text-lg font-black text-white">NEXTPOS</span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                    >
                        <FiX size={22} />
                    </button>
                </div>

                <div className="p-6 pb-4 relative z-10">
                    <div className="hidden lg:flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-blue-600 rounded-[18px] shadow-lg shadow-blue-600/30 flex items-center justify-center group cursor-pointer hover:rotate-12 transition-transform">
                            <FiShield className="text-white" size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-black text-white tracking-tighter leading-none">NEXTPOS</span>
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1 opacity-80">{isReseller ? 'Reseller Hub' : 'Super Console'}</span>
                        </div>
                    </div>

                    <div className="space-y-1 custom-scrollbar overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
                        <MenuItem icon={<FiBriefcase />} label={tabTitle(t, 'dashboard', isReseller)} active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
                        <MenuItem icon={<FiLayers />} label={tabTitle(t, 'tenants', isReseller)} active={activeTab === 'tenants'} onClick={() => { setActiveTab('tenants'); setSidebarOpen(false); }} />
                        <MenuItem icon={<FiFileText />} label={tabTitle(t, 'posInvoices', isReseller)} active={activeTab === 'posInvoices'} onClick={() => { setActiveTab('posInvoices'); setSidebarOpen(false); }} />
                        <MenuItem icon={<FiBell />} label={tabTitle(t, 'posInvoiceLogs', isReseller)} active={activeTab === 'posInvoiceLogs'} onClick={() => { setActiveTab('posInvoiceLogs'); setSidebarOpen(false); }} />
                        {isReseller && <MenuItem icon={<FiShoppingCart />} label={tabTitle(t, 'shop', isReseller)} active={activeTab === 'shop'} onClick={() => { setActiveTab('shop'); setSidebarOpen(false); }} />}
                        {!isReseller && <MenuItem icon={<FiBriefcase />} label={tabTitle(t, 'resellers', isReseller)} active={activeTab === 'resellers'} onClick={() => { setActiveTab('resellers'); setSidebarOpen(false); }} />}
                        <MenuItem icon={<FiMessageSquare />} label={tabTitle(t, 'support', isReseller)} active={activeTab === 'support'} badge={supportStats?.open} onClick={() => { setActiveTab('support'); setSidebarOpen(false); }} />

                        {!isReseller && (
                            <>
                                <MenuItem icon={<FiPieChart />} label={tabTitle(t, 'plans', isReseller)} active={activeTab === 'plans'} onClick={() => { setActiveTab('plans'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiTag />} label={tabTitle(t, 'campaigns', isReseller)} active={activeTab === 'campaigns'} onClick={() => { setActiveTab('campaigns'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiDollarSign />} label={tabTitle(t, 'finance', isReseller)} active={activeTab === 'finance'} onClick={() => { setActiveTab('finance'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiInbox />} label={tabTitle(t, 'accounting', isReseller)} active={activeTab === 'accounting'} onClick={() => { setActiveTab('accounting'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiBox />} label={tabTitle(t, 'backups', isReseller)} active={activeTab === 'backups'} onClick={() => { setActiveTab('backups'); setSidebarOpen(false); }} />
                            </>
                        )}

                        <div className="pt-6 pb-2 px-4">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] opacity-40">{t('sidebar.control')}</span>
                        </div>
                        {!isReseller && (
                            <>
                                <MenuItem icon={<FiLock />} label={tabTitle(t, 'security', isReseller)} active={activeTab === 'security'} onClick={() => { setActiveTab('security'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiActivity />} label={tabTitle(t, 'monitoring', isReseller)} active={activeTab === 'monitoring'} onClick={() => { setActiveTab('monitoring'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiDatabase />} label={tabTitle(t, 'crm', isReseller)} active={activeTab === 'crm'} onClick={() => { setActiveTab('crm'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiSettings />} label={tabTitle(t, 'settings', isReseller)} active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }} />
                            </>
                        )}
                        {isReseller && (
                            <>
                                <MenuItem icon={<FiDollarSign />} label={tabTitle(t, 'finance', isReseller)} active={activeTab === 'finance'} onClick={() => { setActiveTab('finance'); setSidebarOpen(false); }} />
                                <MenuItem icon={<FiDatabase />} label={tabTitle(t, 'crm', isReseller)} active={activeTab === 'crm'} onClick={() => { setActiveTab('crm'); setSidebarOpen(false); }} />
                                <div className="mt-6 mx-2 p-5 bg-blue-600/5 border border-blue-500/10 rounded-[28px] relative overflow-hidden group">
                                    <div className="absolute -right-3 -bottom-3 opacity-5 group-hover:opacity-10 transition-transform group-hover:scale-125 rotate-12">
                                        <FiShield size={70} />
                                    </div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 opacity-60">{t('sidebar.wallet')}</span>
                                    <span className="text-xl font-black text-blue-400">{currency}{Number(admin?.wallet_balance ?? 0).toLocaleString()}</span>
                                    <div className="mt-1 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{admin?.available_licenses || 0} {t('sidebar.unitsAvailable')}</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="mt-auto p-6 relative z-10">
                    <div className="bg-white/[0.03] rounded-[28px] p-4 border border-white/5 mb-3 group hover:bg-white/[0.05] transition-all cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-base shadow-xl shadow-blue-600/20 group-hover:scale-105 transition-transform">{admin?.username?.[0]?.toUpperCase()}</div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-black text-white truncate w-28 tracking-tight group-hover:text-blue-400 transition-colors uppercase">{admin?.username}</span>
                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">{admin?.role}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={logout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[18px] text-rose-500 hover:bg-rose-500/10 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95 border border-transparent hover:border-rose-500/20"><FiPower size={16} /> {t('logout')}</button>
                </div>
            </aside>

            {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
            <main className="flex-1 min-h-0 min-w-0 flex flex-col relative z-20">
                <header className="px-4 sm:px-6 md:px-10 py-4 sm:py-6 md:py-10 flex items-center justify-between sticky top-0 bg-[#070b14]/80 backdrop-blur-xl z-50 border-b border-white/[0.03] gap-3">
                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all bg-white/5 border border-white/10"
                    >
                        <FiMenu size={20} />
                    </button>

                    <div className="flex items-center gap-2 min-w-0">
                        <motion.h2
                            key={activeTab}
                            initial={{ y: -10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-xl sm:text-2xl md:text-4xl font-black text-white tracking-tighter truncate"
                        >
                            {tabTitle(t, activeTab, isReseller)}
                        </motion.h2>
                        <div className="hidden sm:flex items-center gap-2 mt-1.5 opacity-60">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{t('header.synchronizedLive')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
                        <SaaSLanguageSwitcher />
                        {isSuperAdmin && (
                            <div className={`hidden xl:flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all shadow-2xl ${
                                settings?.tse_enabled ? 'bg-emerald-600/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-600/10 border-rose-500/20 text-rose-400'
                            }`}>
                                <FiShield size={14} className={settings?.tse_enabled ? '' : 'animate-pulse'} />
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{settings?.tse_enabled ? 'FISCAL' : 'OFFLINE'}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 sm:gap-2 bg-white/5 p-1 sm:p-1.5 rounded-xl border border-white/5">
                            <button type="button" aria-label="Ara" title="Ara" className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-slate-500 hover:text-white transition-all rounded-lg hover:bg-white/5"><FiSearch size={16} /></button>
                            <button type="button" aria-label="Bildirimler" title="Bildirimler" className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-slate-500 hover:text-white transition-all rounded-lg hover:bg-white/5 relative">
                                <FiBell size={16} />
                                <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-1.5 h-1.5 bg-rose-500 rounded-full border border-[#070b14]"></span>
                            </button>
                        </div>
                        {activeTab === 'tenants' && (
                            <button
                                onClick={() => setIsAddTenantModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-[9px] sm:text-[10px] font-black shadow-2xl shadow-blue-600/30 flex items-center gap-2 active:scale-95 transition-all outline-none uppercase tracking-widest"
                            >
                                <FiPlus size={14} /> <span className="hidden sm:inline">{t('header.registerRestaurant')}</span>
                            </button>
                        )}
                        {activeTab === 'backups' && !isReseller && (
                            <button
                                onClick={() => createBackup()}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-[9px] sm:text-[10px] font-black shadow-2xl shadow-emerald-600/30 flex items-center gap-2 active:scale-95 transition-all outline-none uppercase tracking-widest"
                            >
                                <FiDatabase size={14} /> <span className="hidden sm:inline">{t('header.createSnapshot')}</span>
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-10 custom-scrollbar relative">
                    {/* Perspective Background */}
                    <div className="absolute top-0 right-0 w-full h-full pointer-events-none opacity-5">
                       <div className="absolute top-[-20%] right-[-10%] w-[80%] h-[80%] bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.2),transparent_70%)]" />
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {activeTab === 'dashboard' && (
                                <DashboardTab
                                    isSuperAdmin={isSuperAdmin}
                                    onNavigate={(tab) => setActiveTab(tab as TabKey)}
                                />
                            )}
                            {activeTab === 'tenants' && <TenantsTab />}
                            {activeTab === 'posInvoices' && <PosInvoicesTab />}
                            {activeTab === 'posInvoiceLogs' && <PosInvoiceLogsTab />}
                            {activeTab === 'finance' && <FinanceTab />}
                            {activeTab === 'accounting' && !isReseller && <AccountingTab />}
                            {activeTab === 'security' && !isReseller && <SecurityTab />}
                            {activeTab === 'monitoring' && <MonitoringTab />}
                            {activeTab === 'support' && <SupportTab />}
                            {activeTab === 'resellers' && !isReseller && <ResellersTab />}
                            {activeTab === 'backups' && !isReseller && <BackupsTab />}
                            {activeTab === 'crm' && <CRMTab />}
                            {activeTab === 'reports' && !isReseller && <ReportsTab />}
                            {activeTab === 'plans' && !isReseller && <PlansTab />}
                            {activeTab === 'campaigns' && !isReseller && <CampaignsTab />}
                            {activeTab === 'shop' && <ShopTab />}
                            {activeTab === 'settings' && <SettingsTab />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>

            {/* ═══════════════════ MODALS ═══════════════════ */}
            <Modal show={isAddTenantModalOpen} onClose={() => setIsAddTenantModalOpen(false)} title={t('modal.tenant.title')}>
                <form onSubmit={handleCreateTenant} className="space-y-6">
                    {isReseller && (
                        <div className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-[32px] flex items-center justify-between mb-2">
                             <div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block opacity-70 mb-1">{t('modal.tenant.licensePool')}</span>
                                <span className="text-xl font-black text-white">{admin?.available_licenses || 0} <span className="text-[10px] font-medium text-slate-500">UNITS</span></span>
                             </div>
                             <button 
                                type="button" 
                                onClick={() => { setIsAddTenantModalOpen(false); setActiveTab('shop'); }} 
                                className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 hover:bg-blue-500/20 transition-all uppercase tracking-widest"
                            >
                                {t('modal.tenant.buyMore')}
                            </button>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <InputGroup label={t('modal.tenant.name')} value={newTenant.name} onChange={v => setNewTenant({ ...newTenant, name: v })} placeholder="e.g. Gurme Burger" />
                        <InputGroup label={t('modal.tenant.schema')} value={newTenant.schema_name} onChange={v => setNewTenant({ ...newTenant, schema_name: v })} placeholder="tenant_id_unique" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <InputGroup label={t('modal.tenant.authorizedPerson')} value={newTenant.authorized_person} onChange={v => setNewTenant({ ...newTenant, authorized_person: v })} />
                        <InputGroup label={t('modal.tenant.contactPhone')} value={newTenant.contact_phone} onChange={v => setNewTenant({ ...newTenant, contact_phone: v })} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <InputGroup label={t('modal.tenant.taxOffice')} value={newTenant.tax_office} onChange={v => setNewTenant({ ...newTenant, tax_office: v })} />
                        <InputGroup label={t('modal.tenant.taxNumber')} value={newTenant.tax_number} onChange={v => setNewTenant({ ...newTenant, tax_number: v })} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-8 bg-white/5 rounded-[32px] border border-white/5">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-4">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {t('modal.tenant.masterPassword')}
                                </label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setNewTenant({ ...newTenant, master_password: generateMasterPassword() })
                                    }
                                    className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                >
                                    <FiRefreshCw size={10} /> {t('modal.tenant.regenerate')}
                                </button>
                            </div>
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={newTenant.master_password}
                                onChange={(e) => setNewTenant({ ...newTenant, master_password: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-[18px] px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-all font-mono text-xs tracking-widest text-center"
                            />
                        </div>
                        <SelectGroup
                            label={t('modal.tenant.subscriptionPlan')}
                            value={newTenant.subscription_plan}
                            onChange={(v) => setNewTenant({ ...newTenant, subscription_plan: v, module_codes: [] })}
                            options={[
                                { label: 'Basic Economy', value: 'basic' },
                                { label: 'Professional Tier', value: 'pro' },
                                { label: 'Enterprise Cloud', value: 'enterprise' },
                            ]}
                        />
                    </div>
                    
                    <InputGroup label={t('modal.tenant.businessAddress')} value={newTenant.address} onChange={v => setNewTenant({ ...newTenant, address: v })} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <InputGroup label={t('modal.tenant.contactEmail')} value={newTenant.contact_email} onChange={v => setNewTenant({ ...newTenant, contact_email: v })} placeholder="owner@domain.com" />
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('modal.tenant.agreementLimits')}</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 group/limit relative overflow-hidden">
                                     <div className="absolute top-0 right-0 p-2 opacity-5 scale-125"><FiActivity size={40} /></div>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">{t('modal.tenant.terminals')}</span>
                                    <span className="text-xl font-black text-white">{currentSubPlan?.max_users ?? '—'}</span>
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 group/limit relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-2 opacity-5 scale-125"><FiLayers size={40} /></div>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">{t('modal.tenant.branches')}</span>
                                    <span className="text-xl font-black text-white">{currentSubPlan?.max_branches ?? '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {isReseller && (
                        <div className="space-y-4 pt-6 border-t border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('modal.tenant.licenseAllocation')}</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button 
                                    type="button" 
                                    onClick={() => setNewTenant({ ...newTenant, license_usage_type: 'prepaid' } as any)}
                                    className={`p-6 rounded-[32px] border text-left transition-all ${newTenant.license_usage_type === 'prepaid' ? 'bg-blue-600/10 border-blue-500 ring-4 ring-blue-600/20' : 'bg-white/5 border-white/5 hover:border-white/10 opacity-60'}`}
                                >
                                    <div className={`text-xs font-black mb-1 uppercase tracking-tight ${newTenant.license_usage_type === 'prepaid' ? 'text-blue-400' : 'text-slate-300'}`}>{t('modal.tenant.prepaidAccount')}</div>
                                    <div className={`text-[10px] font-medium leading-relaxed ${newTenant.license_usage_type === 'prepaid' ? 'text-white/80' : 'text-slate-600'}`}>{t('modal.tenant.prepaidAccountDesc')}</div>
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setNewTenant({ ...newTenant, license_usage_type: 'direct_sale' } as any)}
                                    className={`p-6 rounded-[32px] border text-left transition-all ${newTenant.license_usage_type === 'direct_sale' ? 'bg-emerald-600/10 border-emerald-500 ring-4 ring-emerald-600/20' : 'bg-white/5 border-white/5 hover:border-white/10 opacity-60'}`}
                                >
                                    <div className={`text-xs font-black mb-1 uppercase tracking-tight ${newTenant.license_usage_type === 'direct_sale' ? 'text-emerald-400' : 'text-slate-300'}`}>{t('modal.tenant.directSubscription')}</div>
                                    <div className={`text-[10px] font-medium leading-relaxed ${newTenant.license_usage_type === 'direct_sale' ? 'text-white/80' : 'text-slate-600'}`}>{t('modal.tenant.directSubscriptionDesc')}</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* QR Web Menu Domain */}
                    {newTenant.module_codes.includes('qr_web_menu') && (
                        <div className="space-y-2 pt-4 border-t border-white/5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">QR Web Menü Domain</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    value={newTenant.qr_domain}
                                    onChange={(e) => setNewTenant({ ...newTenant, qr_domain: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '') })}
                                    placeholder="qrpizza.webotonom.de"
                                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-all text-sm"
                                />
                            </div>
                            <p className="text-[9px] text-slate-600">Restoranın QR menü web adresi (ör. qrpizza.webotonom.de)</p>
                        </div>
                    )}

                    <button type="submit" className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-[0_0_50px_rgba(37,99,235,0.3)] text-white font-black rounded-3xl active:scale-95 transition-all text-[11px] tracking-[0.2em] uppercase mt-4">Confirm Registration</button>
                    <p className="text-center text-[9px] text-slate-600 font-bold uppercase tracking-widest">{t('modal.tenant.registrationDisclosure')}</p>
                </form>
            </Modal>
        </div>
    );
};

const SaaSAdmin: React.FC = () => (
    <SaaSLocaleProvider>
        <SaaSAdminInner />
    </SaaSLocaleProvider>
);

export default SaaSAdmin;
export { SaaSAdmin };
