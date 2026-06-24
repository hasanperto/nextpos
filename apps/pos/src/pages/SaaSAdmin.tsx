import React, { useEffect, useState, useMemo } from 'react';
import {
    FiDatabase,
    FiBriefcase,
    FiPlus,
    FiActivity,
    FiShield,
    FiAlertTriangle,
    FiDollarSign,
    FiLock,
    FiKey,
    FiLayers,
    FiZap,
    FiCheckCircle,
    FiSearch,
    FiBell,
    FiSettings,
    FiRefreshCw,
    FiMenu,
    FiFileText,
    FiUser,
    FiMail,
    FiPhone,
    FiHash,
    FiMapPin,
    FiLoader,
    FiCpu,
    FiMessageSquare,
    FiPower,
    FiChevronDown,
    FiPieChart,
    FiShoppingCart,
    FiInbox,
    FiTag,
    FiX,
    FiBox
} from 'react-icons/fi';
import { FieldLabel, IconInput, FormCard, MaskedIconField } from './saas/ResellerFormUi';
import { useSaaSLocale, SaaSLocaleProvider } from '../contexts/SaaSLocaleContext';
import { SaaSLanguageSwitcher } from '../components/saas/SaaSLanguageSwitcher';
import { useSaaSStore } from '../store/useSaaSStore';
import type { PlanModuleRow } from '../store/useSaaSStore';
import toast from 'react-hot-toast';
import { MenuItem, InputGroup, Modal, BottomNavItem } from './saas/SaaSShared';
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
import { SaasAdminsTab } from './saas/SaasAdminsTab';
import { useResellerRealtimeSync } from '../hooks/useResellerRealtimeSync';
import { motion, AnimatePresence } from 'framer-motion';

type TabKey = 'dashboard' | 'tenants' | 'posInvoices' | 'posInvoiceLogs' | 'resellers' | 'finance' | 'accounting' | 'security' | 'reports' | 'plans' | 'campaigns' | 'backups' | 'crm' | 'monitoring' | 'support' | 'shop' | 'settings' | 'saasUsers';

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
        resellers,
        createTenant, login, logout, createBackup,
        fetchSystemHealth, fetchGrowthReport, fetchFinancialSummary, fetchBackupStats,
        fetchResellerPlans,
        fetchPlanModuleMatrix, planModuleMatrix,
        plans, fetchPlans,
        fetchBillingCatalog, billingModuleCatalog,
    } = useSaaSStore();

    const currency = settings?.currency || '€';

    useResellerRealtimeSync();

    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [creationProgress, setCreationProgress] = useState(0);
    const [newTenant, setNewTenant] = useState<{
        name: string; schema_name: string; status: string; subscription_plan: string;
        contact_email: string;
        authorized_person: string; contact_phone: string; tax_office: string; tax_number: string;
        address: string; master_password: string;
        license_usage_type: 'prepaid' | 'direct_sale';
        payment_interval: 'monthly' | 'yearly';
        payment_method: string;
        module_codes: string[];
        extra_device_qty: number;
        extra_printer_qty: number;
        qr_domain: string;
        max_users: number;
        max_branches: number;
        resellerId?: number | null;
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
        extra_printer_qty: 1,
        qr_domain: '',
        max_users: 10,
        max_branches: 1,
        resellerId: null,
    });

    const [isSchemaManuallyEdited, setIsSchemaManuallyEdited] = useState(false);
    const [draftIdForPayment, setDraftIdForPayment] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isCompletingPayment, setIsCompletingPayment] = useState(false);

    // Auto-generate schema name from tenant name
    useEffect(() => {
        if (!newTenant.name || isSchemaManuallyEdited) return;
        const slug = 'schema_' + newTenant.name.toLowerCase()
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        setNewTenant(prev => ({ ...prev, schema_name: slug }));
    }, [newTenant.name, isSchemaManuallyEdited]);

    const toggleModule = (code: string) => {
        const rule = planModuleMatrix?.modules.find(m => m.code === code);
        if (!rule || rule.mode === 'included' || rule.mode === 'locked') return;

        if (newTenant.module_codes.includes(code)) {
            setNewTenant(prev => ({ ...prev, module_codes: prev.module_codes.filter(c => c !== code) }));
        } else {
            setNewTenant(prev => ({ ...prev, module_codes: [...prev.module_codes, code] }));
        }
    };

    const getModuleClass = (code: string) => {
        const isSelected = newTenant.module_codes.includes(code);
        const rule = planModuleMatrix?.modules.find(m => m.code === code);
        const mode = rule?.mode || 'addon';

        if (mode === 'locked') return `flex items-center gap-3 p-4 rounded-2xl border opacity-50 cursor-not-allowed bg-gray-100 dark:bg-white/5 border-white/5`;
        if (mode === 'included') return `flex items-center gap-3 p-4 rounded-2xl border bg-blue-600/5 border-blue-500/30 cursor-default`;

        return `flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'bg-blue-600/10 border-blue-500/50' : 'bg-white/5 border-white/10 hover:border-white/20'}`;
    };

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
        const onNavigate = (ev: Event) => {
            const detail = (ev as CustomEvent<{ tab?: TabKey; sub?: string }>).detail;
            const tab = detail?.tab;
            if (!tab) return;
            setActiveTab(tab);
            if (detail?.sub) {
                localStorage.setItem('saas:accounting:sub', detail.sub);
                window.dispatchEvent(new CustomEvent('saas:accounting:set-sub', { detail: { sub: detail.sub } }));
            }
            setSidebarOpen(false);
        };
        window.addEventListener('saas:navigate', onNavigate as EventListener);
        return () => window.removeEventListener('saas:navigate', onNavigate as EventListener);
    }, []);

    useEffect(() => {
        if (isAddTenantModalOpen && newTenant.subscription_plan) {
            fetchPlanModuleMatrix(newTenant.subscription_plan);
        }
    }, [isAddTenantModalOpen, newTenant.subscription_plan, fetchPlanModuleMatrix]);

    useEffect(() => {
        if (isAddTenantModalOpen && token) {
            fetchPlans();
            fetchBillingCatalog();
        }
    }, [isAddTenantModalOpen, token, fetchPlans, fetchBillingCatalog]);

    const currentSubPlan = useMemo(() => plans.find((p) => p.code === newTenant.subscription_plan), [plans, newTenant.subscription_plan]);

    useEffect(() => {
        if (currentSubPlan) {
            setNewTenant(prev => ({
                ...prev,
                max_users: Number(currentSubPlan.max_users) || 10,
                max_branches: Number(currentSubPlan.max_branches) || 1,
            }));
        }
    }, [currentSubPlan]);

    useEffect(() => {
        if (planModuleMatrix && planModuleMatrix.planCode === newTenant.subscription_plan) {
            const includedCodes = planModuleMatrix.modules.filter(m => m.mode === 'included').map(m => m.code);
            const currentAddons = newTenant.module_codes.filter(code => {
                const rule = planModuleMatrix.modules.find(m => m.code === code);
                return rule && rule.mode === 'addon';
            });
            const uniqueCodes = Array.from(new Set([...includedCodes, ...currentAddons]));
            setNewTenant(prev => ({ ...prev, module_codes: uniqueCodes }));
        }
    }, [planModuleMatrix]);

    useEffect(() => {
        if (!isAddTenantModalOpen) return;
        setNewTenant((prev) => ({ ...prev, master_password: generateMasterPassword() }));
    }, [isAddTenantModalOpen]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        login(loginForm.username, loginForm.password);
    };

    useEffect(() => {
        if (!isSchemaManuallyEdited && newTenant.name) {
            const slug = newTenant.name.toLowerCase()
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_{2,}/g, '_')
                .replace(/^_+|_+$/g, '');
            if (slug) {
                setNewTenant(prev => ({ ...prev, schema_name: `schema_${slug}` }));
            }
        }
    }, [newTenant.name, isSchemaManuallyEdited]);

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        const { qr_domain, resellerId, ...tenantData } = newTenant;
        const payload: Record<string, unknown> = { ...tenantData };
        if (resellerId != null && resellerId > 0) {
            payload.reseller_id = resellerId;
        }
        if (Number(payload.extra_device_qty) < 1) delete payload.extra_device_qty;
        if (Number(payload.extra_printer_qty) < 1) delete payload.extra_printer_qty;
        payload.schema_name = String(payload.schema_name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');

        setIsCreating(true);
        setCreationProgress(0);
        const progressInterval = window.setInterval(() => {
            setCreationProgress(prev => {
                if (prev >= 90) return prev;
                return prev + 5;
            });
        }, 500);

        try {
            const res = await createTenant(payload);
            window.clearInterval(progressInterval);
            
            if (res) {
                setCreationProgress(100);
                if (res.requires_card_payment && res.draftId) {
                    toast.success('Ödeme bekleniyor, provizyon formu açılıyor...');
                    setDraftIdForPayment(res.draftId);
                } else {
                    if (qr_domain?.trim() && Array.isArray(payload.module_codes) && payload.module_codes.includes('qr_web_menu')) {
                        const newest = useSaaSStore.getState().tenants.find(t => t.schema_name === payload.schema_name);
                        if (newest) await useSaaSStore.getState().addQrDomain(newest.id, qr_domain.trim().toLowerCase());
                    }
                    setIsAddTenantModalOpen(false);
                    setIsSchemaManuallyEdited(false);
                    setNewTenant(prev => ({ ...prev, name: '', schema_name: '', module_codes: [], resellerId: null }));
                }
            }
        } catch (error: any) {
            window.clearInterval(progressInterval);
            toast.error(error.message || 'Tenant oluşturulamadı');
        } finally {
            setIsCreating(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-800 rounded-full blur-[120px]" />
                </div>
                <div className="absolute top-8 right-8"><SaaSLanguageSwitcher /></div>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-[480px] z-10">
                    <div className="text-center mb-12">
                        <div className="inline-flex p-5 rounded-[32px] bg-blue-600/10 mb-6 border border-blue-500/20 shadow-[0_0_50px_rgba(37,99,235,0.2)]">
                            <FiShield className="text-blue-500" size={48} />
                        </div>
                        <h1 className="text-5xl font-black text-white tracking-tighter mb-3">NEXTPOS <span className="text-blue-500 italic">SAAS</span></h1>
                        <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px] opacity-70">{t('login.subtitle')}</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-slate-900/40 backdrop-blur-3xl p-10 rounded-[48px] border border-white/5 space-y-8">
                        <div className="space-y-6">
                            <InputGroup label={t('login.username')} value={loginForm.username} onChange={v => setLoginForm({ ...loginForm, username: v })} placeholder="admin" />
                            <InputGroup label={t('login.password')} type="password" value={loginForm.password} onChange={v => setLoginForm({ ...loginForm, password: v })} placeholder="••••••••" />
                        </div>
                        {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-[20px] text-rose-400 text-xs font-black flex items-center gap-3 uppercase tracking-widest"><FiAlertTriangle /> {error}</div>}
                        <button type="submit" disabled={isLoading} className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[24px] text-white font-black uppercase tracking-widest">{isLoading ? t('login.loading') : t('login.submit')}</button>
                    </form>
                </motion.div>
            </div>
        );
    }

    const isReseller = admin?.role === 'reseller';
    const isSuperAdmin = admin?.role === 'super_admin';

    return (
        <div className="min-h-screen bg-[#070b14] text-slate-200 flex font-sans overflow-hidden">
            <AnimatePresence>{sidebarOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] lg:hidden" onClick={() => setSidebarOpen(false)} />}</AnimatePresence>
            <aside className={`fixed lg:relative inset-y-0 left-0 z-[80] lg:z-auto w-72 sm:w-80 bg-[#0a0f1d]/95 border-r border-white/5 flex flex-col transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
                <div className="p-8 flex flex-col h-full relative">
                    {/* Mobile Close Button */}
                    <button 
                        onClick={() => setSidebarOpen(false)} 
                        className="lg:hidden absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all"
                    >
                        <FiX size={20} />
                    </button>

                    <div className="flex items-center gap-4 mb-10 px-2">
                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20"><FiZap className="text-white" size={24} /></div>
                        <div><h1 className="text-xl font-black text-white tracking-tighter">NEXTPOS</h1><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Control Center</p></div>
                    </div>
                    <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
                        <MenuItem active={activeTab === 'dashboard'} icon={<FiActivity />} label={t('tab.dashboard')} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
                        <MenuItem active={activeTab === 'tenants'} icon={<FiBriefcase />} label={t('tab.tenants')} onClick={() => { setActiveTab('tenants'); setSidebarOpen(false); }} />
                        <MenuItem active={activeTab === 'posInvoices'} icon={<FiFileText />} label={t('tab.posInvoices')} onClick={() => { setActiveTab('posInvoices'); setSidebarOpen(false); }} />
                        {isSuperAdmin && (
                            <MenuItem active={activeTab === 'posInvoiceLogs'} icon={<FiInbox />} label={t('tab.posInvoiceLogs')} onClick={() => { setActiveTab('posInvoiceLogs'); setSidebarOpen(false); }} />
                        )}
                        <MenuItem active={activeTab === 'finance'} icon={<FiDollarSign />} label={isReseller ? t('tab.financeReseller') : t('tab.financeNav')} onClick={() => { setActiveTab('finance'); setSidebarOpen(false); }} />
                        {isSuperAdmin && <MenuItem active={activeTab === 'accounting'} icon={<FiLayers />} label={t('tab.accounting')} onClick={() => { setActiveTab('accounting'); setSidebarOpen(false); }} />}
                        {!isReseller && <MenuItem active={activeTab === 'resellers'} icon={<FiBriefcase />} label={t('tab.resellers')} onClick={() => { setActiveTab('resellers'); setSidebarOpen(false); }} />}
                        {isSuperAdmin && (
                            <>
                                <MenuItem active={activeTab === 'security'} icon={<FiShield />} label={t('tab.security')} onClick={() => { setActiveTab('security'); setSidebarOpen(false); }} />
                                <MenuItem active={activeTab === 'reports'} icon={<FiPieChart />} label={t('tab.reports')} onClick={() => { setActiveTab('reports'); setSidebarOpen(false); }} />
                                <MenuItem active={activeTab === 'plans'} icon={<FiBox />} label={t('tab.plans')} onClick={() => { setActiveTab('plans'); setSidebarOpen(false); }} />
                                <MenuItem active={activeTab === 'campaigns'} icon={<FiTag />} label={t('tab.campaigns')} onClick={() => { setActiveTab('campaigns'); setSidebarOpen(false); }} />
                                <MenuItem active={activeTab === 'backups'} icon={<FiDatabase />} label={t('tab.backups')} onClick={() => { setActiveTab('backups'); setSidebarOpen(false); }} />
                                <MenuItem active={activeTab === 'crm'} icon={<FiUser />} label={t('tab.crm')} onClick={() => { setActiveTab('crm'); setSidebarOpen(false); }} />
                                <MenuItem active={activeTab === 'saasUsers'} icon={<FiKey />} label={t('tab.saasUsers')} onClick={() => { setActiveTab('saasUsers'); setSidebarOpen(false); }} />
                            </>
                        )}
                        {isReseller && (
                            <MenuItem active={activeTab === 'campaigns'} icon={<FiTag />} label={t('tab.campaigns')} onClick={() => { setActiveTab('campaigns'); setSidebarOpen(false); }} />
                        )}
                        {isReseller && (
                            <MenuItem active={activeTab === 'shop'} icon={<FiShoppingCart />} label={t('tab.shop')} onClick={() => { setActiveTab('shop'); setSidebarOpen(false); }} />
                        )}
                        <MenuItem active={activeTab === 'monitoring'} icon={<FiCpu />} label={t('tab.monitoring')} onClick={() => { setActiveTab('monitoring'); setSidebarOpen(false); }} />
                        <MenuItem active={activeTab === 'support'} icon={<FiMessageSquare />} label={t('tab.support')} onClick={() => { setActiveTab('support'); setSidebarOpen(false); }} />
                        <MenuItem active={activeTab === 'settings'} icon={<FiSettings />} label={t('tab.settings')} onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }} />
                    </nav>
                    <div className="pt-6 border-t border-white/5"><button onClick={logout} className="w-full flex items-center gap-4 p-4 rounded-2xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all font-black text-[10px] uppercase tracking-widest"><FiPower /> {t('header.logout')}</button></div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-[#070b14] relative pb-20 lg:pb-0">
                <header className="h-20 sm:h-24 border-b border-white/5 flex items-center justify-between px-6 sm:px-10 shrink-0 bg-[#070b14]/50 backdrop-blur-3xl z-50">
                    <button onClick={() => setSidebarOpen(true)} className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white active:scale-95 transition-all"><FiMenu size={20} /></button>
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-white tracking-tighter truncate">{tabTitle(t, activeTab, isReseller)}</h2>
                    </div>
                    <div className="flex items-center gap-4">
                        <SaaSLanguageSwitcher />
                        {activeTab === 'tenants' && (
                            <button onClick={() => setIsAddTenantModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl text-[10px] font-black shadow-2xl shadow-blue-600/30 flex items-center gap-2 active:scale-95 transition-all uppercase tracking-widest">
                                <FiPlus size={14} /> <span>{t('header.registerRestaurant')}</span>
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 sm:p-10 custom-scrollbar relative">
                    <AnimatePresence mode="wait">
                        <motion.div key={activeTab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                            {activeTab === 'dashboard' && <DashboardTab isSuperAdmin={isSuperAdmin} onNavigate={setActiveTab} />}
                            {activeTab === 'tenants' && <TenantsTab />}
                            {activeTab === 'posInvoices' && <PosInvoicesTab />}
                            {activeTab === 'posInvoiceLogs' && <PosInvoiceLogsTab />}
                            {activeTab === 'finance' && <FinanceTab />}
                            {activeTab === 'accounting' && <AccountingTab />}
                            {activeTab === 'monitoring' && <MonitoringTab />}
                            {activeTab === 'support' && <SupportTab />}
                            {activeTab === 'resellers' && <ResellersTab />}
                            {activeTab === 'backups' && <BackupsTab />}
                            {activeTab === 'crm' && <CRMTab />}
                            {activeTab === 'reports' && <ReportsTab />}
                            {activeTab === 'plans' && <PlansTab />}
                            {activeTab === 'campaigns' && <CampaignsTab />}
                            {activeTab === 'shop' && <ShopTab />}
                            {activeTab === 'settings' && <SettingsTab />}
                            {activeTab === 'saasUsers' && <SaasAdminsTab />}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Mobile Bottom Navigation */}
                <div className="lg:hidden fixed bottom-0 left-0 right-0 h-20 bg-[#0a0f1d]/90 backdrop-blur-3xl border-t border-white/10 flex items-center justify-around px-2 z-[60] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                    <BottomNavItem active={activeTab === 'dashboard'} icon={<FiActivity />} label={t('tab.dashboard')} onClick={() => setActiveTab('dashboard')} />
                    <BottomNavItem active={activeTab === 'tenants'} icon={<FiBriefcase />} label={t('tab.tenants')} onClick={() => setActiveTab('tenants')} />
                    <BottomNavItem active={activeTab === 'finance'} icon={<FiDollarSign />} label={t('tab.financeNav')} onClick={() => setActiveTab('finance')} />
                    <BottomNavItem active={activeTab === 'support'} icon={<FiMessageSquare />} label={t('tab.support')} onClick={() => setActiveTab('support')} />
                    <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center justify-center gap-1 text-slate-500 min-w-[60px]">
                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center active:scale-90 transition-all">
                            <FiMenu size={16} />
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Menu</span>
                    </button>
                </div>
            </main>

            {/* ═══════════════════ ADD TENANT MODAL ═══════════════════ */}
            <Modal show={isAddTenantModalOpen} onClose={() => { setIsAddTenantModalOpen(false); setIsSchemaManuallyEdited(false); }} title={t('modal.tenant.title')} maxWidth="max-w-7xl">
                <form onSubmit={handleCreateTenant} className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        {/* Left Column: Basic & Contact */}
                        <div className="space-y-6">
                            <FormCard title={t('modal.tenant.name')}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <FieldLabel required>{t('modal.tenant.name')}</FieldLabel>
                                        <IconInput icon={<FiBriefcase />}><input type="text" value={newTenant.name} onChange={e => setNewTenant({ ...newTenant, name: e.target.value })} placeholder="e.g. Gurme Burger" required /></IconInput>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <FieldLabel required>{t('modal.tenant.schema')}</FieldLabel>
                                        <IconInput icon={<FiDatabase />}><input type="text" value={newTenant.schema_name} onChange={e => { setIsSchemaManuallyEdited(true); setNewTenant({ ...newTenant, schema_name: e.target.value }); }} placeholder="schema_restaurant_name" required /></IconInput>
                                    </div>
                                    {isSuperAdmin && (
                                        <div className="sm:col-span-2">
                                            <FieldLabel>{t('modal.tenant.resellerSelect')}</FieldLabel>
                                            <IconInput icon={<FiBriefcase />}>
                                                <select
                                                    value={newTenant.resellerId ?? ''}
                                                    onChange={e => setNewTenant({
                                                        ...newTenant,
                                                        resellerId: e.target.value === '' ? null : Number(e.target.value),
                                                    })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                                                >
                                                    <option value="" className="bg-[#1e293b]">{t('modal.tenant.noReseller')}</option>
                                                    {(resellers || []).map((r) => (
                                                        <option key={r.id} value={r.id} className="bg-[#1e293b]">
                                                            {r.company_name || r.username}
                                                        </option>
                                                    ))}
                                                </select>
                                            </IconInput>
                                            <p className="mt-1 text-[10px] text-slate-500">{t('modal.tenant.resellerSelectHint')}</p>
                                        </div>
                                    )}
                                </div>
                            </FormCard>

                            <FormCard title={t('reseller.form.contact')}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2"><FieldLabel>{t('modal.tenant.authorizedPerson')}</FieldLabel><IconInput icon={<FiUser />}><input type="text" value={newTenant.authorized_person} onChange={e => setNewTenant({ ...newTenant, authorized_person: e.target.value })} /></IconInput></div>
                                    <div><FieldLabel>{t('modal.tenant.contactPhone')}</FieldLabel><MaskedIconField icon={<FiPhone />} mask="0 000 000 00 00" value={newTenant.contact_phone} onAcceptUnmasked={v => setNewTenant({ ...newTenant, contact_phone: v })} placeholder="0 5XX XXX XX XX" /></div>
                                    <div><FieldLabel>{t('modal.tenant.contactEmail')}</FieldLabel><IconInput icon={<FiMail />}><input type="email" value={newTenant.contact_email} onChange={e => setNewTenant({ ...newTenant, contact_email: e.target.value })} placeholder="owner@domain.com" /></IconInput></div>
                                </div>
                            </FormCard>

                            <FormCard title={t('reseller.form.tax')}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><FieldLabel>{t('modal.tenant.taxOffice')}</FieldLabel><IconInput icon={<FiFileText />}><input type="text" value={newTenant.tax_office} onChange={e => setNewTenant({ ...newTenant, tax_office: e.target.value })} /></IconInput></div>
                                    <div><FieldLabel>{t('modal.tenant.taxNumber')}</FieldLabel><MaskedIconField icon={<FiHash />} mask="00000000000" value={newTenant.tax_number} onAcceptUnmasked={v => setNewTenant({ ...newTenant, tax_number: v })} /></div>
                                </div>
                            </FormCard>
                        </div>

                        {/* Right Column: Billing & Modules */}
                        <div className="space-y-6">
                            <FormCard title={t('reseller.form.finance')}>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between"><FieldLabel required>{t('modal.tenant.masterPassword')}</FieldLabel><button type="button" onClick={() => setNewTenant({ ...newTenant, master_password: generateMasterPassword() })} className="text-[10px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest"><FiRefreshCw /> {t('modal.tenant.regenerate')}</button></div>
                                    <IconInput icon={<FiLock />}><input type="password" value={newTenant.master_password} onChange={e => setNewTenant({ ...newTenant, master_password: e.target.value })} className="font-mono text-center tracking-widest" required /></IconInput>
                                    <div>
                                        <FieldLabel required>{t('modal.tenant.subscriptionPlan')}</FieldLabel>
                                        <IconInput icon={<FiZap />}>
                                            <select value={newTenant.subscription_plan} onChange={e => setNewTenant({ ...newTenant, subscription_plan: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 appearance-none cursor-pointer">
                                                {plans.map(p => <option key={p.id} value={p.code} className="bg-[#1e293b]">{p.name} - {currency}{p.monthly_fee}/mo</option>)}
                                            </select>
                                        </IconInput>
                                    </div>
                                </div>
                            </FormCard>

                            <FormCard title={t('modal.tenant.modules', 'Modüller')}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {billingModuleCatalog.map(mod => {
                                        const rule = planModuleMatrix?.modules.find(m => m.code === mod.code);
                                        const mode = rule?.mode || 'addon';
                                        const isSelected = newTenant.module_codes.includes(mod.code);
                                        return (
                                            <div key={mod.code} className={getModuleClass(mod.code)} onClick={() => toggleModule(mod.code)}>
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-500'}`}>{isSelected ? <FiCheckCircle /> : <FiLayers />}</div>
                                                <div className="flex-1">
                                                    <p className="text-[11px] font-bold truncate">{mod.name}</p>
                                                    <p className="text-[9px] text-slate-500">{mode === 'included' ? t('common.included') : `+${currency}${mod.monthly_price}/mo`}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </FormCard>
                        </div>
                    </div>

                    {/* Footer / Summary */}
                    <div className="mt-8 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center gap-8 bg-blue-600/5 -mx-8 px-8 pb-8 rounded-b-3xl">
                        <div className="flex-1 w-full grid grid-cols-2 gap-8">
                            <div><p className="text-xs text-gray-400 uppercase font-bold">{t('reseller.order.setupTotal')}</p><p className="text-3xl font-black text-white">{currency}{(Number(currentSubPlan?.setup_fee || 0) + newTenant.module_codes.reduce((sum, c) => sum + Number(billingModuleCatalog?.find(m => m.code === c)?.setup_price || 0), 0)).toFixed(2)}</p></div>
                            <div><p className="text-xs text-gray-400 uppercase font-bold">{t('reseller.order.monthlyTotal')}</p><p className="text-3xl font-black text-emerald-500">{currency}{(Number(currentSubPlan?.monthly_fee || 0) + newTenant.module_codes.reduce((sum, c) => sum + Number(billingModuleCatalog?.find(m => m.code === c)?.monthly_price || 0), 0)).toFixed(2)}</p></div>
                        </div>
                        <div className="flex-1 w-full max-w-sm space-y-4">
                            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none cursor-pointer" value={newTenant.payment_method} onChange={e => setNewTenant({ ...newTenant, payment_method: e.target.value })}>
                                <option value="bank_transfer" className="bg-[#1e293b]">{t('reseller.form.payInvoice')}</option>
                                <option value="cash" className="bg-[#1e293b]">{t('reseller.form.payCash')}</option>
                                <option value="admin_card" className="bg-[#1e293b]">{t('modal.tenant.adminCard')}</option>
                            </select>
                            <button type="submit" disabled={isCreating} className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50">
                                {isCreating ? <><FiLoader className="animate-spin" /> {creationProgress}%</> : <><FiCheckCircle /> {t('modal.tenant.submit')}</>}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Async creation progress overlay */}
                {isCreating && (
                    <div className="absolute inset-0 bg-[#070b14]/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 rounded-[28px] animate-in fade-in duration-200">
                        <div className="relative w-24 h-24 mb-6">
                            <div className="absolute inset-0 rounded-full border-4 border-white/5 border-t-blue-500 animate-spin" />
                            <div className="absolute inset-2 rounded-full border-4 border-white/5 border-b-purple-500 animate-spin [animation-direction:reverse]" />
                            <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-white tabular-nums">
                                {creationProgress}%
                            </div>
                        </div>
                        <h4 className="text-base font-black text-white tracking-tight uppercase">Restoran Kuruluyor</h4>
                        <p className="text-xs text-slate-450 mt-2 text-center max-w-[280px]">
                            Veritabanı şeması oluşturuluyor, tablolar migrate ediliyor ve menü tanımları yükleniyor. Lütfen pencereyi kapatmayın.
                        </p>
                    </div>
                )}

                {/* Bayi Kredi Kartı Ödemesi Formu */}
                {draftIdForPayment && (
                    <div className="absolute inset-0 bg-[#070b14]/95 backdrop-blur-xl z-50 flex flex-col justify-center p-8 rounded-[28px] animate-in zoom-in duration-300">
                        <div className="max-w-md mx-auto w-full">
                            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                💳 Bayi Kredi Kartı Ödemesi
                            </h3>
                            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                Doğrudan Satış planı kapsamındaki restoran kurulum bedeli bayi kartından tahsil edilecektir. Ödeme sonrası restoran şeması aktifleşecektir.
                            </p>
                            
                            {paymentError && (
                                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs font-semibold">
                                    ⚠️ {paymentError}
                                </div>
                            )}
                            
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                setIsCompletingPayment(true);
                                setPaymentError(null);
                                
                                const toastId = toast.loading('Kart provizyonu alınıyor...');
                                try {
                                    const res = await fetch(`/api/v1/tenants/tenant-drafts/${draftIdForPayment}/complete-card`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token}`
                                        },
                                        body: JSON.stringify({ success: true })
                                    });
                                    
                                    if (res.ok) {
                                        toast.success('Ödeme tamamlandı! Restoran kuruldu.', { id: toastId });
                                        setIsAddTenantModalOpen(false);
                                        setDraftIdForPayment(null);
                                        setIsSchemaManuallyEdited(false);
                                        setNewTenant(prev => ({ ...prev, name: '', schema_name: '', module_codes: [], resellerId: null }));
                                        await useSaaSStore.getState().fetchTenants();
                                    } else {
                                        const err = await res.json();
                                        setPaymentError(err.error || 'Ödeme başarısız oldu.');
                                        toast.error('Ödeme başarısız.', { id: toastId });
                                    }
                                } catch (e) {
                                    setPaymentError('Ödeme servisine bağlanılamadı.');
                                    toast.error('Bağlantı hatası.', { id: toastId });
                                } finally {
                                    setIsCompletingPayment(false);
                                }
                            }} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kart Sahibinin Adı Soyadı</label>
                                    <input type="text" required placeholder="John Doe" className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-blue-500 outline-none" />
                                </div>
                                
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kart Numarası</label>
                                    <input type="text" required maxLength={19} placeholder="4000 1234 5678 9010" className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-blue-500 outline-none font-mono" />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Son Kullanma</label>
                                        <input type="text" required maxLength={5} placeholder="MM/YY" className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-blue-500 outline-none font-mono text-center" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CVC</label>
                                        <input type="password" required maxLength={3} placeholder="•••" className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-blue-500 outline-none font-mono text-center" />
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="submit"
                                        disabled={isCompletingPayment}
                                        className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isCompletingPayment ? 'Ödeniyor...' : 'Ödemeyi Tamamla'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isCompletingPayment}
                                        onClick={() => {
                                            setDraftIdForPayment(null);
                                            setPaymentError(null);
                                        }}
                                        className="px-6 h-12 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                    >
                                        İptal Et
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
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
