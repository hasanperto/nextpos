import React, { useEffect, useState } from 'react';
import {
    FiDatabase, FiBriefcase, FiPower, FiPlus,
    FiActivity, FiClock, FiShield, 
    FiAlertTriangle, FiDollarSign, FiLock, 
    FiCpu, FiMessageSquare, FiBox, FiLayers, 
    FiPieChart, FiSearch, FiBell, FiShoppingCart, FiSettings
} from 'react-icons/fi';
import { useSaaSStore } from '../store/useSaaSStore';
import { MenuItem, InputGroup, SelectGroup, Modal } from './saas/SaaSShared';
import { DashboardTab } from './saas/DashboardTab';
import { TenantsTab } from './saas/TenantsTab';
import { FinanceTab } from './saas/FinanceTab';
import { SecurityTab } from './saas/SecurityTab';
import { CRMTab } from './saas/CRMTab';
import { MonitoringTab } from './saas/MonitoringTab';
import { SupportTab } from './saas/SupportTab';
import { ResellersTab } from './saas/ResellersTab';
import { BackupsTab } from './saas/BackupsTab';
import { ReportsTab } from './saas/ReportsTab';
import { PlansTab } from './saas/PlansTab';
import { ShopTab } from './saas/ShopTab';
import { SettingsTab } from './saas/SettingsTab';

type TabKey = 'dashboard' | 'tenants' | 'resellers' | 'finance' | 'security' | 'reports' | 'plans' | 'backups' | 'crm' | 'monitoring' | 'support' | 'shop' | 'settings';

export const SaaSAdmin: React.FC = () => {
    const {
        token, admin, isLoading, error, fetchTenants, fetchStats, fetchSettings, fetchSupportStats, fetchResellers,
        createTenant, login, logout, supportStats, createBackup
    } = useSaaSStore();

    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
    const [newTenant, setNewTenant] = useState<{
        name: string; schema_name: string; status: string; subscription_plan: string;
        max_users: number; max_branches: number; contact_email: string;
        authorized_person: string; contact_phone: string; tax_office: string; tax_number: string;
        address: string; master_password: string;
        license_usage_type: 'prepaid' | 'direct_sale';
        payment_interval: 'monthly' | 'yearly';
    }>({
        name: '', schema_name: '', status: 'active', subscription_plan: 'basic',
        max_users: 5, max_branches: 1, contact_email: '',
        authorized_person: '', contact_phone: '', tax_office: '', tax_number: '',
        address: '', master_password: '',
        license_usage_type: 'prepaid',
        payment_interval: 'monthly'
    });

    useEffect(() => {
        if (token) {
            fetchTenants();
            fetchStats();
            fetchSettings();
            fetchSupportStats();
            if (admin?.role === 'superadmin') fetchResellers();
        }
    }, [token, admin?.id]); // admin?.id is stable, admin object changes on sync

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        login(loginForm.username, loginForm.password);
    };

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await createTenant(newTenant);
        if (ok) {
            setIsAddTenantModalOpen(false);
            setNewTenant({ 
                name: '', schema_name: '', status: 'active', subscription_plan: 'basic', 
                max_users: 5, max_branches: 1, contact_email: '', 
                authorized_person: '', contact_phone: '', tax_office: '', tax_number: '',
                address: '', master_password: '',
                license_usage_type: 'prepaid', payment_interval: 'monthly' 
            });
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-900">
                <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-4 rounded-3xl bg-blue-600/10 mb-4 border border-blue-500/20 shadow-2xl shadow-blue-500/10">
                            <FiShield className="text-blue-500" size={40} />
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tighter">NEXTPOS <span className="text-blue-500">SAAS</span></h1>
                        <p className="text-slate-500 mt-2 font-medium uppercase tracking-[0.2em] text-[10px]">Merkezi Yönetim Konsolu</p>
                    </div>

                    <form onSubmit={handleLogin} className="bg-slate-900/50 backdrop-blur-2xl p-8 rounded-[32px] border border-white/5 shadow-2xl space-y-6">
                        <InputGroup label="Yönetici Kullanıcı Adı" value={loginForm.username} onChange={v => setLoginForm({ ...loginForm, username: v })} placeholder="superadmin" />
                        <InputGroup label="Güvenlik Anahtarı" type="password" value={loginForm.password} onChange={v => setLoginForm({ ...loginForm, password: v })} placeholder="••••••••" />
                        
                        {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold flex items-center gap-2 animate-bounce"><FiAlertTriangle /> {error}</div>}
                        
                        <button type="submit" disabled={isLoading} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-white font-black hover:shadow-2xl hover:shadow-blue-600/40 active:scale-[0.98] transition-all disabled:opacity-50 text-sm tracking-widest uppercase">
                            {isLoading ? 'SİSTEME BAĞLANILIYOR...' : 'GÜVENLİ GİRİŞ YAP'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const isReseller = admin?.role === 'reseller';

    return (
        <div className="min-h-screen bg-[#0a0f1d] text-slate-200 flex font-sans selection:bg-blue-500/30">
            {/* ═══════════════════ SIDEBAR ═══════════════════ */}
            <aside className="w-72 bg-slate-900/50 border-r border-white/5 flex flex-col backdrop-blur-3xl sticky top-0 h-screen z-50">
                <div className="p-8 pb-4">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/40"><FiShield className="text-white" size={20} /></div>
                        <span className="text-xl font-black text-white tracking-tighter">NEXTPOS</span>
                    </div>

                    <div className="space-y-1.5 custom-scrollbar overflow-y-auto max-h-[70vh]">
                        <MenuItem icon={<FiBriefcase />} label="Genel Bakış" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                        <MenuItem icon={<FiDatabase />} label="Restoranlar" active={activeTab === 'tenants'} onClick={() => setActiveTab('tenants')} />
                        {isReseller && <MenuItem icon={<FiShoppingCart />} label="Mağaza & Lisans Al" active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} />}
                        {!isReseller && <MenuItem icon={<FiLayers />} label="Bayi Yönetimi" active={activeTab === 'resellers'} onClick={() => setActiveTab('resellers')} />}
                        <MenuItem icon={<FiMessageSquare />} label="Destek Talepleri" active={activeTab === 'support'} badge={supportStats?.open} onClick={() => setActiveTab('support')} />
                        
                        <div className="pt-6 pb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-5 text-nowrap">Analiz & Operasyon</span>
                        </div>
                        {!isReseller && (
                            <>
                                <MenuItem icon={<FiLock />} label="Güvenlik & Audit" active={activeTab === 'security'} onClick={() => setActiveTab('security')} />
                                <MenuItem icon={<FiPieChart />} label="Global Raporlar" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
                                <MenuItem icon={<FiDollarSign />} label="Finansal Durum" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
                                <MenuItem icon={<FiActivity />} label="Sistem Sağlığı" active={activeTab === 'monitoring'} onClick={() => setActiveTab('monitoring')} />
                                <MenuItem icon={<FiCpu />} label="Planlar & Fiyat" active={activeTab === 'plans'} onClick={() => setActiveTab('plans')} />
                                <MenuItem icon={<FiDatabase />} label="Varlık Yönetimi (CRM)" active={activeTab === 'crm'} onClick={() => setActiveTab('crm')} />
                                <MenuItem icon={<FiBox />} label="Yedekleme" active={activeTab === 'backups'} onClick={() => setActiveTab('backups')} />
                                <MenuItem icon={<FiSettings />} label="Sistem Ayarları" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                            </>
                        )}
                        {isReseller && (
                            <>
                                <MenuItem icon={<FiDollarSign />} label="Cüzdan & Kazançlar" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
                                <MenuItem icon={<FiDatabase />} label="Müşteri Portföyü (CRM)" active={activeTab === 'crm'} onClick={() => setActiveTab('crm')} />
                                <div className="mt-8 px-5 py-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform">
                                        <FiBox size={60} />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Mevcut Lisansların</span>
                                    <span className="text-xl font-black text-blue-400">{admin?.available_licenses || 0} ADET</span>
                                    <div className="mt-2 text-[9px] text-slate-500 font-bold uppercase tracking-tighter">DAHA FAZLA AL →</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="mt-auto p-6 space-y-4">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg">{admin?.username?.[0]?.toUpperCase()}</div>
                            <div className="flex flex-col">
                                <span className="text-xs font-black text-white truncate w-32">{admin?.username}</span>
                                <span className="text-[9px] text-blue-400 font-bold uppercase">{admin?.role}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={logout} className="w-full flex items-center gap-3 px-5 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all font-bold text-sm"><FiPower size={18} /> Güvenli Çıkış</button>
                </div>
            </aside>

            {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
            <main className="flex-1 p-10 max-w-7xl mx-auto w-full overflow-hidden custom-scrollbar overflow-y-auto h-screen">
                <header className="flex justify-between items-center mb-10">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase">{activeTab}</h2>
                        <p className="text-slate-500 text-xs font-medium mt-1">Sistem gerçek zamanlı verilerle senkronize edildi.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/5">
                            <button className="p-2 text-slate-400 hover:text-white transition-all"><FiClock size={16} /></button>
                            <button className="p-2 text-slate-400 hover:text-white transition-all"><FiSearch size={16} /></button>
                            <button className="p-2 text-slate-400 hover:text-white transition-all relative">
                                <FiBell size={16} />
                                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            </button>
                        </div>
                        {activeTab === 'tenants' && (
                            <button onClick={() => setIsAddTenantModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl text-xs font-black shadow-xl shadow-blue-600/20 flex items-center gap-2 active:scale-95 transition-all outline-none">
                                <FiPlus /> YENİ RESTORAN EKLE
                            </button>
                        )}
                        {activeTab === 'backups' && !isReseller && (
                                <button onClick={() => createBackup()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl text-xs font-black shadow-xl shadow-emerald-600/20 flex items-center gap-2 active:scale-95 transition-all outline-none">
                                    <FiDatabase /> TAM YEDEK AL
                                </button>
                        )}
                    </div>
                </header>

                <div className="animate-in fade-in slide-in-from-bottom-5 duration-700">
                    {activeTab === 'dashboard' && <DashboardTab />}
                    {activeTab === 'tenants' && <TenantsTab />}
                    {activeTab === 'finance' && <FinanceTab />}
                    {activeTab === 'security' && !isReseller && <SecurityTab />}
                    {activeTab === 'monitoring' && !isReseller && <MonitoringTab />}
                    {activeTab === 'support' && <SupportTab />}
                    {activeTab === 'resellers' && !isReseller && <ResellersTab />}
                    {activeTab === 'backups' && !isReseller && <BackupsTab />}
                    {activeTab === 'crm' && <CRMTab />}
                    {activeTab === 'reports' && !isReseller && <ReportsTab />}
                    {activeTab === 'plans' && !isReseller && <PlansTab />}
                    {activeTab === 'shop' && <ShopTab />}
                    {activeTab === 'settings' && <SettingsTab />}
                </div>
            </main>

            {/* ═══════════════════ MODALS ═══════════════════ */}
            <Modal show={isAddTenantModalOpen} onClose={() => setIsAddTenantModalOpen(false)} title="Yeni Restoran Onboarding">
                <form onSubmit={handleCreateTenant} className="space-y-4">
                    {isReseller && (
                        <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between mb-2">
                             <div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Mevcut Bakiyeniz</span>
                                <span className="text-sm font-bold text-white">{admin?.available_licenses || 0} Restoran Lisansı</span>
                             </div>
                             <button type="button" onClick={() => setActiveTab('shop')} className="text-[10px] font-black text-blue-400 hover:underline">+ LİSANS AL</button>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Restoran Adı" value={newTenant.name} onChange={v => setNewTenant({ ...newTenant, name: v })} placeholder="Örn: Gurme Burger" />
                        <InputGroup label="Veritabanı Şeması" value={newTenant.schema_name} onChange={v => setNewTenant({ ...newTenant, schema_name: v })} placeholder="trn_gurme_burger" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Yetkili Kişi" value={newTenant.authorized_person} onChange={v => setNewTenant({ ...newTenant, authorized_person: v })} />
                        <InputGroup label="İletişim Telefon" value={newTenant.contact_phone} onChange={v => setNewTenant({ ...newTenant, contact_phone: v })} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Vergi Dairesi" value={newTenant.tax_office} onChange={v => setNewTenant({ ...newTenant, tax_office: v })} />
                        <InputGroup label="Vergi Numarası" value={newTenant.tax_number} onChange={v => setNewTenant({ ...newTenant, tax_number: v })} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-4 my-2">
                        <InputGroup label="Master Şifre" type="password" value={newTenant.master_password} onChange={v => setNewTenant({ ...newTenant, master_password: v })} />
                        <SelectGroup label="Abonelik Planı" value={newTenant.subscription_plan} onChange={v => setNewTenant({ ...newTenant, subscription_plan: v })} options={[{ label: 'Basic', value: 'basic' }, { label: 'Pro', value: 'pro' }, { label: 'Enterprise', value: 'enterprise' }]} />
                    </div>

                    <InputGroup label="Adres" value={newTenant.address} onChange={v => setNewTenant({ ...newTenant, address: v })} />

                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="İletişim E-posta" value={newTenant.contact_email} onChange={v => setNewTenant({ ...newTenant, contact_email: v })} placeholder="email@example.com" />
                        <div className="grid grid-cols-2 gap-2">
                             <InputGroup label="Max Kullanıcı" type="number" value={newTenant.max_users} onChange={v => setNewTenant({ ...newTenant, max_users: Number(v) })} />
                             <InputGroup label="Max Şube" type="number" value={newTenant.max_branches} onChange={v => setNewTenant({ ...newTenant, max_branches: Number(v) })} />
                        </div>
                    </div>
                    
                    {isReseller && (
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Anlaşma Türü</span>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setNewTenant({ ...newTenant, license_usage_type: 'prepaid' } as any)}
                                    className={`p-4 rounded-2xl border text-left transition-all ${newTenant.license_usage_type === 'prepaid' ? 'bg-blue-600 border-blue-400' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                                >
                                    <div className={`text-xs font-black mb-1 ${newTenant.license_usage_type === 'prepaid' ? 'text-white' : 'text-slate-300'}`}>LİSANSIMDAN DÜŞ</div>
                                    <div className={`text-[10px] font-medium leading-tight ${newTenant.license_usage_type === 'prepaid' ? 'text-blue-100' : 'text-slate-500'}`}>1 lisans eksilir.</div>
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setNewTenant({ ...newTenant, license_usage_type: 'direct_sale' } as any)}
                                    className={`p-4 rounded-2xl border text-left transition-all ${newTenant.license_usage_type === 'direct_sale' ? 'bg-emerald-600 border-emerald-400' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                                >
                                    <div className={`text-xs font-black mb-1 ${newTenant.license_usage_type === 'direct_sale' ? 'text-white' : 'text-slate-300'}`}>KOMİSYONLU SATIŞ</div>
                                    <div className={`text-[10px] font-medium leading-tight ${newTenant.license_usage_type === 'direct_sale' ? 'text-emerald-100' : 'text-slate-500'}`}>Setup: %75 Bayi / %25 Sistem.</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {isReseller && newTenant.license_usage_type === 'direct_sale' && (
                        <div className="space-y-2">
                            <div className="flex bg-slate-800 rounded-xl p-1 border border-white/5">
                                <button type="button" onClick={() => setNewTenant({...newTenant, payment_interval: 'monthly'})} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${newTenant.payment_interval === 'monthly' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>AYLIK ÖDEME</button>
                                <button type="button" onClick={() => setNewTenant({...newTenant, payment_interval: 'yearly'})} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${newTenant.payment_interval === 'yearly' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>YILLIK ÖDEME (-%15)</button>
                            </div>
                        </div>
                    )}

                    <button type="submit" className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all text-xs tracking-widest uppercase mt-4">RESTORANI SİSTEME DAHİL ET</button>
                </form>
            </Modal>
        </div>
    );
};
