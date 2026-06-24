import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FiX, FiInfo, FiDollarSign, FiTerminal, FiShield, 
    FiDatabase, FiCalendar, FiGlobe, FiUsers, FiBox, FiCheckCircle, FiClock, FiFileText,
    FiBriefcase, FiPhone, FiMail, FiUser, FiMapPin, FiTrendingUp, FiSettings, FiAlertTriangle
} from 'react-icons/fi';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import { Modal, Badge } from './SaaSShared';
import { useSaaSStore } from '../../store/useSaaSStore';
import type { Tenant } from '../../store/useSaaSStore';
import toast from 'react-hot-toast';

interface Props {
    tenant: Tenant;
    onClose: () => void;
}

const UserCredsCard: React.FC<{
    user: { username: string; label: string; desc: string; defaultPin: string; defaultPw: string };
    schemaName: string;
}> = ({ user, schemaName }) => {
    const { token } = useSaaSStore();
    const [editingType, setEditingType] = useState<'none' | 'password' | 'pin'>('none');
    const [newValue, setNewValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newValue.trim()) return;

        setIsLoading(true);
        const toastId = toast.loading(`${user.label} için ${editingType === 'pin' ? 'PIN' : 'Şifre'} güncelleniyor...`);
        try {
            const body: any = {
                schema_name: schemaName,
                username: user.username,
            };
            if (editingType === 'pin') {
                body.new_pin = newValue.trim();
            } else {
                body.new_password = newValue.trim();
            }

            const res = await fetch('/api/v1/tenants/change-user-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Güncelleme başarısız.', { id: toastId });
                return;
            }

            toast.success(`${user.label} ${editingType === 'pin' ? 'PIN kodu' : 'Şifresi'} başarıyla güncellendi!`, { id: toastId });
            setEditingType('none');
            setNewValue('');
        } catch (err) {
            console.error(err);
            toast.error('Bağlantı hatası oluştu.', { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 rounded-2xl p-4.5 space-y-3 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden text-left">
            <div className="flex justify-between items-start">
                <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        {user.label}
                    </h5>
                    <span className="font-mono text-[9px] text-slate-400 font-semibold block mt-0.5">kullanıcı adı: {user.username}</span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {user.username === 'admin' ? 'YÖNETİCİ' : 'STANDART'}
                </span>
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-relaxed">
                {user.desc}
            </p>

            {editingType === 'none' ? (
                <div className="flex gap-2 pt-1.5 border-t border-slate-100 dark:border-white/5">
                    <button
                        type="button"
                        onClick={() => { setEditingType('password'); setNewValue(''); }}
                        className="flex-1 text-[10px] font-black uppercase py-1.8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer text-center"
                    >
                        Şifre Değiştir
                    </button>
                    <button
                        type="button"
                        onClick={() => { setEditingType('pin'); setNewValue(''); }}
                        className="flex-1 text-[10px] font-black uppercase py-1.8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer text-center"
                    >
                        PIN Değiştir
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSave} className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-450 dark:text-slate-500 text-left">
                            Yeni {editingType === 'pin' ? 'PIN Kodu (4-6 rakam)' : 'Giriş Şifresi (min 6 karakter)'}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type={editingType === 'pin' ? 'text' : 'password'}
                                pattern={editingType === 'pin' ? '\\d{4,6}' : '.{6,}'}
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                required
                                placeholder={editingType === 'pin' ? `Varsayılan: ${user.defaultPin}` : `Varsayılan: ${user.defaultPw}`}
                                className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-blue-500/50"
                            />
                            <div className="flex gap-1">
                                <button
                                    type="submit"
                                    disabled={isLoading || !newValue.trim()}
                                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-slate-900 dark:text-white text-[10px] font-black uppercase cursor-pointer"
                                >
                                    Kaydet
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingType('none')}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase cursor-pointer"
                                >
                                    Vazgeç
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
};

export const TenantDetailModal: React.FC<Props> = ({ tenant, onClose }) => {
    const { t } = useSaaSLocale();
    const { token, fetchTenants, fetchTenantEntitlements, invoices, accountingUpcoming, fetchInvoices, fetchAccountingUpcoming, settings, billingModulesAdmin, fetchBillingModulesAdmin } = useSaaSStore();
    
    const [activeTab, setActiveTab] = useState<'overview' | 'company' | 'modules' | 'finance' | 'security_users'>('overview');

    const [modules, setModules] = useState<any[]>([]);
    const [billingSnapshot, setBillingSnapshot] = useState<any>(null);
    const [isLoadingModules, setIsLoadingModules] = useState(true);
    const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'overdue' | 'pending'>('all');

    const currency = settings?.currency || '€';

    useEffect(() => {
        if (!billingModulesAdmin || billingModulesAdmin.length === 0) {
            fetchBillingModulesAdmin();
        }
        
        // Fetch specific data for this tenant
        fetchInvoices({ tenant: tenant.id });
        fetchAccountingUpcoming();
        
        setIsLoadingModules(true);
        fetchTenantEntitlements(tenant.id).then(data => {
            if (data && data.entitlements) {
                setModules(data.entitlements);
            }
            if (data && data.billingSnapshot) {
                setBillingSnapshot(data.billingSnapshot);
            }
            setIsLoadingModules(false);
        });
    }, [tenant.id]);

    const tenantInvoices = invoices.filter(i => String(i.tenant_id) === String(tenant.id) || i.tenant_name === tenant.name);
    const tenantUpcoming = accountingUpcoming.filter(u => String(u.tenant_id) === String(tenant.id) || u.tenant_name === tenant.name);

    const totalPaid = tenantInvoices.filter(i => i.status === 'paid').reduce((acc, curr) => acc + Number(curr.total || 0), 0);
    const totalOverdue = tenantInvoices.filter(i => i.status === 'overdue').reduce((acc, curr) => acc + Number(curr.total || 0), 0);
    const totalPending = tenantInvoices.filter(i => i.status === 'pending' || i.status === 'draft').reduce((acc, curr) => acc + Number(curr.total || 0), 0);

    const filteredInvoices = invoiceFilter === 'all' 
        ? tenantInvoices 
        : tenantInvoices.filter(i => i.status === invoiceFilter || (invoiceFilter === 'pending' && (i.status === 'draft' || i.status === 'pending')));

    const tabs = [
        { id: 'overview', label: 'Genel Bakış', icon: <FiInfo /> },
        { id: 'company', label: 'Şirket & İletişim', icon: <FiBriefcase /> },
        { id: 'modules', label: 'Modüller', icon: <FiBox /> },
        { id: 'finance', label: 'Finans & Fatura', icon: <FiDollarSign /> },
        { id: 'security_users', label: 'Güvenlik & Personel', icon: <FiShield /> },
    ] as const;

    const createdDate = tenant.created_at ? new Date(tenant.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const expireDate = tenant.license_expires_at ? new Date(tenant.license_expires_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Süresiz';

    const walletBal = Number(tenant.wallet_balance || 0);

    return (
        <Modal 
            show={true} 
            onClose={onClose} 
            title={`Restoran Detayları: ${tenant.name}`} 
            maxWidth="max-w-4xl"
        >
            <div className="flex flex-col sm:flex-row gap-6 -mt-2">
                {/* Sidebar Navigation */}
                <div className="w-full sm:w-52 shrink-0 flex flex-col gap-1.5">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-wider ${
                                activeTab === tab.id 
                                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10 shadow-sm' 
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 border border-transparent'
                            }`}
                        >
                            {React.cloneElement(tab.icon as any, { size: 16 })}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-6 min-h-[440px] overflow-visible">
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && (
                            <motion.div 
                                key="overview"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-6"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-2xl border border-blue-500/10 shadow-sm">
                                            {tenant.name[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">{tenant.name}</h3>
                                            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                <FiTerminal size={14} className="opacity-60" />
                                                <span className="font-mono text-xs">{tenant.schema_name}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Badge color={
                                        tenant.status === 'active' ? 'emerald' : 
                                        tenant.status === 'suspended' ? 'rose' : 'slate'
                                    }>
                                        {tenant.status.toUpperCase()}
                                    </Badge>
                                </div>

                                {/* DNS Provisioning Error Alert */}
                                {tenant.settings?.qr_web_provisioning_error && (
                                    <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-sm font-black text-rose-800 dark:text-rose-450 flex items-center gap-1.5">
                                                <FiAlertTriangle className="animate-pulse shrink-0" size={15} />
                                                Subdomain / DNS Kurulum Hatası
                                            </h4>
                                            <p className="text-xs text-rose-700 dark:text-rose-400/80 mt-1 font-semibold break-words leading-relaxed">
                                                Sistem QR Menü domain yönlendirmesini otomatik tamamlayamadı. Hata: <code className="font-mono bg-rose-100 dark:bg-rose-900/40 px-1 py-0.5 rounded text-[10px]">{tenant.settings.qr_web_provisioning_error}</code>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const toastId = toast.loading('DNS Yönlendirmesi yeniden deneniyor...');
                                                try {
                                                    const res = await fetch(`/api/v1/tenants/${tenant.id}/retry-dns`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': `Bearer ${token}`
                                                        },
                                                        body: JSON.stringify({})
                                                    });
                                                    if (res.ok) {
                                                        toast.success('Yönlendirme başarılı, kiracı aktif edildi!', { id: toastId });
                                                        await fetchTenants();
                                                        onClose();
                                                    } else {
                                                        const err = await res.json();
                                                        toast.error(err.error || 'Yönlendirme başarısız.', { id: toastId });
                                                    }
                                                } catch (e) {
                                                    toast.error('Bağlantı hatası oluştu.', { id: toastId });
                                                }
                                            }}
                                            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0 cursor-pointer"
                                        >
                                            Yeniden Dene
                                        </button>
                                    </div>
                                )}

                                {/* ═══════ PREPAID CUZDAN GLOW CARD ═══════ */}
                                <div className={`p-5 rounded-2xl border backdrop-blur-md relative overflow-hidden transition-all shadow-sm ${
                                    walletBal < 0 
                                        ? 'bg-rose-500/[0.04] border-rose-500/20 text-rose-800 dark:text-rose-400 shadow-rose-500/5' 
                                        : walletBal === 0 
                                            ? 'bg-amber-500/[0.04] border-amber-500/20 text-amber-800 dark:text-amber-400 shadow-amber-500/5'
                                            : 'bg-emerald-500/[0.04] border-emerald-500/20 text-emerald-800 dark:text-emerald-400 shadow-emerald-500/5'
                                }`}>
                                    <div className="flex justify-between items-center relative z-10">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ön Ödemeli Cüzdan Bakiyesi</span>
                                            <div className="text-3xl font-black tabular-nums mt-1 tracking-tight">
                                                {currency}{walletBal.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${
                                            walletBal < 0 
                                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                                                : walletBal === 0 
                                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                        }`}>
                                            <FiDollarSign size={22} className={walletBal > 0 ? 'animate-bounce' : ''} />
                                        </div>
                                    </div>
                                    {walletBal < 0 && (
                                        <div className="text-[10px] font-bold mt-3 flex items-center gap-1.5 opacity-90 border-t border-rose-500/10 pt-2.5">
                                            <FiShield className="shrink-0 animate-pulse text-rose-500" size={12} />
                                            <span>DIKKAT: Borç bakiye nedeniyle restoran POS ekranlarında ödeme uyarısı gösterilmektedir.</span>
                                        </div>
                                    )}
                                    {walletBal === 0 && (
                                        <div className="text-[10px] font-semibold mt-3 flex items-center gap-1.5 opacity-90 border-t border-amber-500/10 pt-2.5">
                                            <FiInfo className="shrink-0 text-amber-500" size={12} />
                                            <span>Sıfır Bakiye: Aylık servis günü geldiğinde cüzdandan tahsilat yapılamazsa servis otomatik askıya alınır.</span>
                                        </div>
                                    )}
                                    {walletBal > 0 && (
                                        <div className="text-[10px] font-semibold mt-3 flex items-center gap-1.5 opacity-90 border-t border-emerald-500/10 pt-2.5">
                                            <FiCheckCircle className="shrink-0 text-emerald-500" size={12} />
                                            <span>Cüzdan Aktif & Güvenli: Sıradaki servis tahsilatı cüzdan bakiyesinden otomatik gerçekleştirilecektir.</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Abonelik Planı</div>
                                        <div className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <FiSettings className="text-blue-500" size={15} />
                                            <span>{tenant.subscription_plan.toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">TSE Uyumluluk</div>
                                        <div className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            {tenant.subscription_plan !== 'basic' ? (
                                                <><FiCheckCircle className="text-emerald-500" size={15} /> <span>TSE Uyumlu (Mali Mod)</span></>
                                            ) : (
                                                <><FiShield className="text-slate-400" size={15} /> <span>Mali Olmayan Mod (No Fiscal)</span></>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Kapasite</div>
                                        <div className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <FiUsers className="text-amber-500" size={15} /> 
                                            <span>{tenant.max_branches} Şube / {tenant.max_users} Personel</span>
                                        </div>
                                    </div>
                                    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Cihaz Sıfırlama Hakkı</div>
                                        <div className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <FiDatabase className="text-emerald-500" size={15} /> 
                                            <span>{tenant.device_reset_remaining ?? 'Limit Yok'} Kaldı</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'company' && (
                            <motion.div 
                                key="company"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-6"
                            >
                                {/* Şirket Fatura Bilgileri */}
                                <div>
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                                        <FiBriefcase />
                                        <span>Firma & Fatura Bilgileri</span>
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Resmi Unvan</div>
                                            <div className="font-bold text-slate-800 dark:text-white text-sm">
                                                {tenant.company_title || 'Belirtilmedi'}
                                            </div>
                                        </div>
                                        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl flex gap-4 justify-between">
                                            <div className="flex-1">
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Vergi Dairesi</div>
                                                <div className="font-bold text-slate-800 dark:text-white text-sm">
                                                    {tenant.tax_office || '—'}
                                                </div>
                                            </div>
                                            <div className="flex-1 border-l border-slate-100 dark:border-white/5 pl-4">
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Vergi Numarası</div>
                                                <div className="font-mono font-bold text-slate-800 dark:text-white text-sm">
                                                    {tenant.tax_number || '—'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* İletişim Bilgileri */}
                                <div>
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                                        <FiUser />
                                        <span>Yetkili & İletişim Bilgileri</span>
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Yetkili Kişi</div>
                                            <div className="font-bold text-slate-800 dark:text-white text-sm truncate" title={tenant.authorized_person}>
                                                {tenant.authorized_person || 'Belirtilmedi'}
                                            </div>
                                        </div>
                                        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">E-Posta Adresi</div>
                                            <div className="font-bold text-slate-800 dark:text-white text-sm truncate flex items-center gap-1.5" title={tenant.contact_email}>
                                                <FiMail className="opacity-50" size={13} />
                                                <span>{tenant.contact_email || '—'}</span>
                                            </div>
                                        </div>
                                        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Telefon Numarası</div>
                                            <div className="font-bold text-slate-800 dark:text-white text-sm truncate flex items-center gap-1.5">
                                                <FiPhone className="opacity-50" size={13} />
                                                <span>{tenant.contact_phone || '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Adres Bilgisi */}
                                <div>
                                    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-4 rounded-xl">
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><FiMapPin /> <span>Hizmet & Fatura Adresi</span></div>
                                        <div className="text-slate-700 dark:text-slate-300 text-xs font-semibold leading-relaxed mt-1">
                                            {tenant.address || 'Kayıtlı bir adres bilgisi bulunmuyor.'}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'modules' && (
                            <motion.div 
                                key="modules"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-4"
                            >
                                <div className="text-xs text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200/50 dark:border-white/5 flex items-start gap-3">
                                    <FiInfo size={16} className="text-blue-500 shrink-0 mt-0.5" />
                                    <p>Bu bölümden restorana ait aktif faturalandırma modüllerini görebilirsiniz. Modülleri değiştirmek için işlemler menüsündeki "Modüller" butonunu kullanın.</p>
                                </div>

                                {isLoadingModules ? (
                                    <div className="py-12 flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                        <span className="text-xs font-semibold text-slate-500">Modüller Yükleniyor...</span>
                                    </div>
                                ) : modules.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {modules.map((m: any) => {
                                            const code = m.module_code || m.code;
                                            const catalogItem = billingModulesAdmin?.find(bm => bm.code === code);
                                            const name = catalogItem ? catalogItem.name : code;
                                            const price = catalogItem ? catalogItem.monthly_price : 0;
                                            const modeText = m.mode === 'included' ? 'Pakete Dahil' : 'Ekstra Satın Alım';
                                            
                                            return (
                                                <div key={code} className="p-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 rounded-xl flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 dark:hover:border-white/10 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/10">
                                                            <FiBox size={18} />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-sm text-slate-800 dark:text-white">{name}</div>
                                                            <div className="text-xs text-slate-400 font-semibold mt-0.5">{modeText}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        {m.mode === 'included' ? (
                                                            <Badge color="blue">DAHİL</Badge>
                                                        ) : (
                                                            <div className="font-black text-slate-800 dark:text-white tabular-nums">{currency}{Number(price).toFixed(2)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 opacity-50 bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 rounded-2xl">
                                        <FiBox size={44} className="mx-auto mb-3 text-slate-400" />
                                        <p className="text-xs font-semibold">Aktif ekstra modül bulunmuyor.</p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === 'finance' && (
                            <motion.div 
                                key="finance"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-6"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                                    {billingSnapshot && (
                                        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-5 rounded-2xl shadow-sm space-y-4">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-3">
                                                <span>Aylık Servis Ücreti Özeti</span>
                                                <Badge color="blue">{billingSnapshot.billingCycle === 'yearly' ? 'YILLIK AYLIK' : 'AYLIK SERVİS'}</Badge>
                                            </h4>
                                            <div className="flex flex-col gap-3">
                                                <div className="flex justify-between items-center text-xs font-semibold">
                                                    <span className="text-slate-500">Plan Aylık Ücreti <span className="uppercase text-[9px] font-black ml-1 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-blue-500">{billingSnapshot.planCode}</span></span>
                                                    <span className="font-bold text-slate-800 dark:text-white tabular-nums">{currency}{Number(billingSnapshot.planBaseMonthly).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-semibold">
                                                    <span className="text-slate-500">Ek Modüller (Aylık Satır)</span>
                                                    <span className="font-bold text-slate-800 dark:text-white tabular-nums">{currency}{Number(billingSnapshot.monthlyFromAddons).toFixed(2)}</span>
                                                </div>
                                                <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex justify-between items-center mt-1">
                                                    <span className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider">Toplam Periyodik Servis</span>
                                                    <span className="font-black text-blue-600 dark:text-blue-400 text-lg tabular-nums">{currency}{Number(billingSnapshot.monthlyRecurringTotal).toFixed(2)}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 text-right">
                                                    Sonraki Vade: <span className="text-slate-800 dark:text-white">{billingSnapshot.nextPaymentDue ? new Date(billingSnapshot.nextPaymentDue).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Belirsiz'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Lisans Ayarları & Kayıt Tarihi */}
                                    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 p-5 rounded-2xl shadow-sm space-y-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5 pb-3 flex items-center gap-1.5">
                                            <FiGlobe />
                                            <span>Lisans & Tescil Bilgileri</span>
                                        </h4>
                                        <div className="flex flex-col gap-2.5 text-xs font-semibold text-slate-500">
                                            <div className="flex justify-between">
                                                <span>Kayıt Tarihi</span>
                                                <span className="text-slate-800 dark:text-white">{createdDate}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Lisans Vade Sonu</span>
                                                <span className="text-slate-800 dark:text-white">{expireDate}</span>
                                            </div>
                                            <div className="flex justify-between border-t border-slate-100 dark:border-white/5 pt-2 mt-1">
                                                <span>Kayıt Kaynağı</span>
                                                <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.2 rounded ${
                                                    tenant.created_by_role === 'reseller' 
                                                        ? 'bg-violet-500/10 text-violet-500' 
                                                        : 'bg-blue-500/10 text-blue-500'
                                                }`}>
                                                    {tenant.created_by_role === 'reseller' ? 'Bayi Kaydı' : 'Admin Kaydı'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Kayıt Eden Yetkili</span>
                                                <span className="text-slate-800 dark:text-white font-mono text-[10px]">{tenant.created_by || 'system'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="bg-emerald-500/[0.04] border border-emerald-500/10 p-4 rounded-2xl text-emerald-600 dark:text-emerald-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-1">Ödenen Toplam</div>
                                        <div className="text-xl font-black tabular-nums">{currency}{totalPaid.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-amber-500/[0.04] border border-amber-500/10 p-4 rounded-2xl text-amber-600 dark:text-amber-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-1">Bekleyen Tutar</div>
                                        <div className="text-xl font-black tabular-nums">{currency}{totalPending.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-rose-500/[0.04] border border-rose-500/10 p-4 rounded-2xl text-rose-600 dark:text-rose-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-1">Gecikmiş Bakiye</div>
                                        <div className="text-xl font-black tabular-nums">{currency}{totalOverdue.toFixed(2)}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Upcoming Payments */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-white/5 pb-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2"><FiClock className="text-amber-500" /> Gelecek Ödemeler</h4>
                                        </div>
                                        {tenantUpcoming.length > 0 ? (
                                            <div className="space-y-2">
                                                {tenantUpcoming.map((up: any, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 rounded-xl">
                                                        <div>
                                                            <div className="text-xs font-bold text-slate-800 dark:text-white">{up.description || up.module_code || up.plan_code || 'Abonelik / Taksit'}</div>
                                                            <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{up.due_date ? new Date(up.due_date).toLocaleDateString('tr-TR') : '—'}</div>
                                                        </div>
                                                        <div className="font-black text-sm text-slate-800 dark:text-white tabular-nums">{currency}{Number(up.amount || up.total || 0).toFixed(2)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 p-4 bg-white/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-white/5 rounded-xl text-center font-semibold">Önümüzdeki 7 gün için planlanmış bir ödeme tahsilatı bulunmuyor.</div>
                                        )}
                                    </div>
 
                                    {/* Recent Invoices */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-white/5 pb-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2"><FiFileText className="text-blue-500" /> Faturalar</h4>
                                            <select 
                                                value={invoiceFilter}
                                                onChange={(e) => setInvoiceFilter(e.target.value as any)}
                                                className="text-[9px] uppercase font-black bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-600 dark:text-slate-300 cursor-pointer"
                                            >
                                                <option value="all">Tümü</option>
                                                <option value="paid">Ödenmiş</option>
                                                <option value="pending">Bekleyen</option>
                                                <option value="overdue">Gecikmiş</option>
                                            </select>
                                        </div>
                                        {filteredInvoices.length > 0 ? (
                                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                                                {filteredInvoices.map(inv => (
                                                    <div key={inv.id} className="flex items-center justify-between p-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 rounded-xl">
                                                        <div>
                                                            <div className="text-xs font-bold text-slate-800 dark:text-white">#{inv.invoice_number}</div>
                                                            <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{new Date(inv.created_at).toLocaleDateString('tr-TR')}</div>
                                                        </div>
                                                        <div className="text-right flex flex-col items-end gap-1 shrink-0">
                                                            <div className="font-black text-sm text-slate-800 dark:text-white">{currency}{Number(inv.total || 0).toFixed(2)}</div>
                                                            <Badge color={inv.status === 'paid' ? 'emerald' : inv.status === 'overdue' ? 'rose' : 'amber'}>
                                                                {inv.status.toUpperCase()}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 p-4 bg-white/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-white/5 rounded-xl text-center font-semibold">Fatura kaydı bulunmuyor.</div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {activeTab === 'security_users' && (
                            <motion.div 
                                key="security_users"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-6"
                            >
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
                                        <FiShield className="text-blue-500" /> Şema Şifre & PIN Yönetimi
                                    </h4>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Restoran şemasındaki personel hesaplarının şifre ve PIN kodlarını güvenli bir şekilde sıfırlayabilir veya güncelleyebilirsiniz.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { username: 'admin', label: 'Restoran Yöneticisi', desc: 'Yönetim paneli ve tüm sistem ayarları yetkisi.', defaultPin: '123456', defaultPw: 'admin123' },
                                        { username: 'cashier', label: 'Kasa Görevlisi (Kasiyer)', desc: 'Satış, ödeme alma ve kasa raporları.', defaultPin: '111111', defaultPw: 'kasa123' },
                                        { username: 'waiter', label: 'Garson (Tablet Kullanıcısı)', desc: 'Sipariş alma, masa taşıma ve adisyon açma.', defaultPin: '222222', defaultPw: 'garson123' },
                                        { username: 'kitchen', label: 'Mutfak Şefi', desc: 'Sipariş hazırlama ve mutfak ekranı takibi.', defaultPin: '333333', defaultPw: 'mutfak123' },
                                    ].map((usr) => (
                                        <UserCredsCard 
                                            key={usr.username} 
                                            user={usr} 
                                            schemaName={tenant.schema_name} 
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </Modal>
    );
};

