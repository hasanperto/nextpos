import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    FiSettings, FiPrinter,
    FiSave, FiTrash2, FiCheckCircle, FiAlertCircle,
    FiEye, FiLock, FiCreditCard, FiPhoneCall, FiMessageCircle, FiHardDrive, FiCopy, FiTablet,
    FiRefreshCw, FiPackage, FiZap, FiX,
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { fetchLocalPrinterList } from '../lib/printerAgent';
import { TenantModulesModal } from './saas/TenantModulesModal';
import { SaaSLocaleProvider } from '../contexts/SaaSLocaleContext';
import { BranchesTab } from './admin-settings/BranchesTab';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { printTestReceipt } from '../lib/posPrint';

interface PosSettings {
    /** GET /admin/settings — abonelik yazıcı kotası */
    billingLimits?: {
        maxPrinters: number;
        basePrinters: number;
        extraPrintersPurchased: number;
    };
    registration: {
        name: string;
        address: string;
        phone: string;
        taxNumber: string;
        taxOffice?: string;
    };
    name: string;
    address: string;
    phone: string;
    taxNumber: string;
    language: string;
    currency: string;
    receipt: {
        header: string;
        footer: string;
        showLogo: boolean;
        showAddress: boolean;
        showPhone: boolean;
    };
    vat: { label: string; value: number }[];
    integrations: {
        payment: {
            provider: 'stripe' | 'sumup' | 'iyzico' | 'manual';
            apiKey: string;
            terminalId: string;
            simulationMode: boolean;
        };
        whatsapp: {
            enabled: boolean;
            phoneNumberId?: string;
            phoneNumber: string;
            apiKey: string;
            webhookKey?: string;
            sendWelcomeMessage: boolean;
            sendOrderReadyMessage: boolean;
        };
        callerId: {
            enabled: boolean;
            source: 'voip' | 'android' | 'modem';
            androidKey?: string;
            createCustomerMode: 'before' | 'after' | 'callback';
            voipUsername?: string;
            voipPassword?: string;
            voipDomain?: string;
        };
        hardware: {
            drawerOpenCommand: string;
            primaryPrinter: string;
        };
        onlineOrder: {
            enabled: boolean;
            autoCreateCustomer: boolean;
            qrNotificationSound: string;
            whatsappNotificationSound: string;
            alertInterval: number;
            allowGuestCheckout: boolean;
        };
        idleTimeout?: number;
        floorPlanMode?: 'grid' | 'visual';
        applyFloorPlanTo?: 'cashier' | 'waiter' | 'both';
        /** Masa bu dakikadan uzun doluysa kırmızı “uzun süre” uyarısı (garson/kasiyer masa planı) */
        longOccupiedMinutes?: number;
        pickupSecurity?: {
            requirePIN: boolean;
        };
        kiosk?: {
            enabled: boolean;
            allowSelfRegistration: boolean;
            pairingSecret: string;
            deviceNotes: string;
            linkedDevices: {
                deviceCode?: string;
                tableId?: number;
                tableName?: string;
                tableQrCode?: string;
                sectionName?: string | null;
                label?: string;
                createdAt?: string;
                lastSeenAt?: string;
            }[];
        };
        printStations?: {
            printers: { id: string; name: string; role: 'kitchen' | 'receipt' | 'bar'; systemPrinterName?: string }[];
            kitchenAutoPrint: boolean;
            receiptOnPayment: boolean;
            receiptOnSessionClose: boolean;
            reprintKitchenEnabled: boolean;
            reprintReceiptEnabled: boolean;
        };
    };
    accountingVisibility?: {
        hideCancelled: boolean;
        hideDeleted: boolean;
    };
    pickupSecurity?: {
        requirePIN: boolean;
    };
    applyFloorPlanTo?: string;
    longOccupiedMinutes?: number;
    idleTimeout?: number;
    floorPlanMode?: string;
}

const defaultKioskSettings = (): NonNullable<PosSettings['integrations']['kiosk']> => ({
    enabled: true,
    allowSelfRegistration: true,
    pairingSecret: '',
    deviceNotes: '',
    linkedDevices: [],
});

const defaultPrintStations = (): NonNullable<PosSettings['integrations']['printStations']> => ({
    printers: [
        { id: 'default-kitchen', name: 'Mutfak', role: 'kitchen' },
        { id: 'default-receipt', name: 'Adisyon / Fiş', role: 'receipt' },
    ],
    kitchenAutoPrint: true,
    receiptOnPayment: true,
    receiptOnSessionClose: true,
    reprintKitchenEnabled: true,
    reprintReceiptEnabled: true,
});

function tpl(t: (k: string) => string, key: string, vars: Record<string, string | number>): string {
    let s = t(key);
    Object.entries(vars).forEach(([k, v]) => {
        s = s.replace(`{{${k}}}`, String(v)).replace(`{${k}}`, String(v));
    });
    return s;
}

export const AdminSettings: React.FC = () => {
    const { t, lang } = usePosLocale();
    const getAuthHeaders = useAuthStore(s => s.getAuthHeaders);
    const tenantId = useAuthStore(s => s.tenantId);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'online_order' | 'receipt' | 'tax' | 'kiosk' | 'printing' | 'branches' | 'modules' | 'demo'>('general');
    const [agentPrinters, setAgentPrinters] = useState<string[]>([]);
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentHint, setAgentHint] = useState<string | null>(null);
    const [showModulesModal, setShowModulesModal] = useState(false);
    const [seedingDemo, setSeedingDemo] = useState(false);
    const [demoConfirmed, setDemoConfirmed] = useState(false);
    const [demoConfirmText, setDemoConfirmText] = useState('');
    const [resettingDevices, setResettingDevices] = useState(false);
    const [billingStatus, setBillingStatus] = useState<{
        planCode: string | null;
        maxDevices: { base: number; extra: number; total: number } | null;
        nextPaymentDue: string | null;
        hasWarning: boolean;
        isSuspended: boolean;
    } | null>(null);
    const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
    const [billingLoading, setBillingLoading] = useState(false);

    const [settings, setSettings] = useState<PosSettings>({
        registration: { name: '', address: '', phone: '', taxNumber: '' },
        name: '',
        address: '',
        phone: '',
        taxNumber: '',
        language: 'de',
        currency: 'EUR',
        receipt: {
            header: '',
            footer: '',
            showLogo: false,
            showAddress: true,
            showPhone: true
        },
        vat: [],
        integrations: {
            payment: { provider: 'manual', apiKey: '', terminalId: '', simulationMode: false },
            whatsapp: { enabled: false, phoneNumberId: '', phoneNumber: '', apiKey: '', webhookKey: '', sendWelcomeMessage: true, sendOrderReadyMessage: true },
            callerId: { enabled: false, source: 'android', createCustomerMode: 'after' },
            hardware: { drawerOpenCommand: '27,112,0,25,250', primaryPrinter: 'Default' },
            onlineOrder: {
                enabled: false,
                autoCreateCustomer: true,
                qrNotificationSound: 'bell_ding.mp3',
                whatsappNotificationSound: 'whatsapp_alert.mp3',
                alertInterval: 30,
                allowGuestCheckout: true
            },
            idleTimeout: 300,
            longOccupiedMinutes: 45,
            pickupSecurity: {
                requirePIN: false
            },
            kiosk: {
                enabled: true,
                allowSelfRegistration: true,
                pairingSecret: '',
                deviceNotes: '',
                linkedDevices: []
            },
            printStations: {
                printers: [
                    { id: 'default-kitchen', name: 'Mutfak', role: 'kitchen' },
                    { id: 'default-receipt', name: 'Adisyon / Fiş', role: 'receipt' },
                ],
                kitchenAutoPrint: true,
                receiptOnPayment: true,
                receiptOnSessionClose: true,
                reprintKitchenEnabled: true,
                reprintReceiptEnabled: true,
            },
        }
        ,
        accountingVisibility: { hideCancelled: false, hideDeleted: false }
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        if (activeTab !== 'modules') return;
        if (billingLoading) return;
        if (billingStatus && subscriptionPlans.length > 0) return;

        const loadBilling = async () => {
            setBillingLoading(true);
            try {
                const [st, plans] = await Promise.all([
                    fetch('/api/v1/billing/status', { headers: getAuthHeaders() })
                        .then((r) => (r.ok ? r.json() : null))
                        .catch(() => null),
                    fetch('/api/v1/subscriptions')
                        .then((r) => (r.ok ? r.json() : []))
                        .catch(() => []),
                ]);
                setBillingStatus(st);
                setSubscriptionPlans(Array.isArray(plans) ? plans : []);
            } finally {
                setBillingLoading(false);
            }
        };

        void loadBilling();
    }, [activeTab, billingLoading, billingStatus, getAuthHeaders, subscriptionPlans.length]);

    const loadAgentPrinters = async () => {
        setAgentLoading(true);
        setAgentHint(null);
        const r = await fetchLocalPrinterList();
        setAgentPrinters(r.printers);
        if (!r.ok) {
            setAgentHint('Yerel köprü yanıt vermiyor. Kasada ayrı pencerede: npm run printer-agent (127.0.0.1:3910)');
        } else if (r.printers.length === 0) {
            setAgentHint('Sistemde kayıtlı yazıcı yok veya liste alınamadı.');
        }
        setAgentLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'printing') void loadAgentPrinters();
    }, [activeTab]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/settings', {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok) {
                const int = data.integrations || {};
                setSettings({
                    ...data,
                    billingLimits: data.billingLimits,
                    registration: data.registration || { name: data.name, address: data.address, phone: data.phone, taxNumber: data.taxNumber },
                    integrations: {
                        ...settings.integrations,
                        ...int,
                        kiosk: {
                            enabled: int.kiosk?.enabled ?? true,
                            allowSelfRegistration: int.kiosk?.allowSelfRegistration ?? true,
                            pairingSecret: int.kiosk?.pairingSecret ?? '',
                            deviceNotes: int.kiosk?.deviceNotes ?? '',
                            linkedDevices: Array.isArray(int.kiosk?.linkedDevices) ? int.kiosk!.linkedDevices : [],
                        },
                        printStations: int.printStations || settings.integrations.printStations,
                    },
                    accountingVisibility: data.accountingVisibility || { hideCancelled: false, hideDeleted: false },
                    receipt: data.receipt || settings.receipt,
                    vat: data.vat || []
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus(null);
        try {
            const res = await fetch('/api/v1/admin/settings', {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                setStatus({ type: 'success', msg: 'Sistem yapılandırması başarıyla güncellendi.' });
                await fetchSettings();
            } else {
                let errMsg = 'Ayarlar kaydedilirken bir hata oluştu.';
                try {
                    const j = (await res.json()) as { error?: string };
                    if (j?.error) errMsg = j.error;
                } catch {
                    /* ignore */
                }
                setStatus({ type: 'error', msg: errMsg });
            }
        } catch (e) {
            setStatus({ type: 'error', msg: 'Sunucuyla bağlantı kurulamadı.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSeedDemo = async () => {
        const expected = 'DEMO YUKLE';
        const normalized = demoConfirmText.trim().toUpperCase().replace('Ü', 'U');
        if (!demoConfirmed || normalized !== expected) {
            setStatus({ type: 'error', msg: 'Lütfen kutuyu işaretleyin ve "DEMO YÜKLE" yazarak onay verin.' });
            return;
        }
        setSeedingDemo(true);
        setStatus(null);
        try {
            const res = await fetch('/api/v1/admin/settings/demo-seed', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    confirmReset: true,
                    preset: 'restaurant_courier',
                }),
            });
            const payload = await res.json().catch(() => ({}));
            if (res.ok) {
                const s = payload?.summary || {};
                setStatus({
                    type: 'success',
                    msg: `Demo içerik yüklendi. Bölge:${s.sections || 0}, Masa:${s.tables || 0}, Kategori:${s.categories || 0}, Ürün:${s.products || 0}`,
                });
                toast.success('Demo veriler başarıyla yüklendi');
                setDemoConfirmed(false);
                setDemoConfirmText('');
            } else {
                const err = payload?.error || 'Demo veri yükleme başarısız.';
                setStatus({ type: 'error', msg: err });
                toast.error(err);
            }
        } catch {
            setStatus({ type: 'error', msg: 'Sunucuya ulaşılamadı. Demo veri yüklenemedi.' });
            toast.error('Demo veri yüklenemedi');
        } finally {
            setSeedingDemo(false);
        }
    };

    const handleResetAllDevices = async () => {
        const ok = window.confirm('Bu tenant içindeki TÜM kullanıcıların cihaz kilidi sıfırlansın mı?');
        if (!ok) return;
        setResettingDevices(true);
        setStatus(null);
        try {
            const res = await fetch('/api/v1/users/reset-devices/all', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
            });
            const payload = await res.json().catch(() => ({}));
            if (res.ok) {
                const remaining = payload?.quota?.remaining;
                if (typeof remaining === 'number') {
                    toast.success(`Cihaz kilidi sıfırlandı. Kalan hak: ${remaining}`);
                    setStatus({ type: 'success', msg: `Tüm kullanıcıların cihaz kilidi sıfırlandı. Bu ay kalan hak: ${remaining}.` });
                } else {
                    toast.success('Cihaz kilidi sıfırlandı');
                    setStatus({ type: 'success', msg: 'Tüm kullanıcıların cihaz kilidi sıfırlandı.' });
                }
            } else {
                const err = payload?.error || 'Cihaz kilidi sıfırlanamadı.';
                toast.error(err);
                setStatus({ type: 'error', msg: err });
            }
        } catch {
            toast.error('Cihaz kilidi sıfırlanamadı');
            setStatus({ type: 'error', msg: 'Sunucuya ulaşılamadı.' });
        } finally {
            setResettingDevices(false);
        }
    };

    const updateVat = (idx: number, field: string, val: string | number) => {
        const newVat = [...settings.vat];
        newVat[idx] = { ...newVat[idx], [field]: val };
        setSettings(s => ({ ...s, vat: newVat }));
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-100">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-2xl"></div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">
                        {t('settings.terminal.preparing')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[#020617] font-sans text-slate-100">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md px-10 z-50">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600/20 rounded-xl">
                        <FiSettings className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">
                            {t('settings.title')}
                        </h1>
                        <p className="text-blue-400/60 font-medium">
                            {tpl(t, 'settings.subtitleActive', { version: '2.4.1' })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowPreview(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl transition-all border border-slate-700/50 font-medium"
                    >
                        <FiEye className="w-4 h-4" />
                        {t('settings.btn.previewReceipt')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-xl transition-all shadow-lg shadow-blue-600/20 font-semibold"
                    >
                        <FiSave className={`w-5 h-5 ${saving ? 'animate-spin' : ''}`} />
                        {saving ? t('settings.btn.updating') : t('settings.btn.updateSystem')}
                    </button>
                </div>
            </header>

            {/* Nav Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900/50 border border-slate-800/50 rounded-2xl mb-8 overflow-x-auto no-scrollbar">
                {[
                    { id: 'general', icon: FiHardDrive, label: t('settings.tabs.general') },
                    { id: 'integrations', icon: FiZap, label: t('settings.tabs.integrations') },
                    { id: 'online-order', icon: FiMessageCircle, label: t('settings.tabs.onlineOrder') },
                    { id: 'receipt', icon: FiPrinter, label: t('settings.tabs.receipt') },
                    { id: 'tax', icon: FiCreditCard, label: t('settings.tabs.tax') },
                    { id: 'kiosk', icon: FiTablet, label: t('settings.tabs.kiosk') },
                    { id: 'printing', icon: FiSettings, label: t('settings.tabs.printing') },
                    { id: 'demo', icon: FiRefreshCw, label: t('settings.tabs.demo') },
                    { id: 'branches', icon: FiPackage, label: t('settings.tabs.branches') },
                    { id: 'modules', icon: FiSettings, label: t('settings.tabs.modules') },
                ].map((tab) => (
                    <TabBtn key={tab.id} id={tab.id} label={tab.label} active={activeTab} onClick={setActiveTab} />
                ))}
            </div>

            <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 overflow-y-auto p-10 pos-scrollbar">
                    <div className="max-w-5xl space-y-10 pb-20">
                        {status && (
                            <div className={`p-5 rounded-2xl flex items-center gap-3 font-bold text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                {status.type === 'success' ? <FiCheckCircle size={20}/> : <FiAlertCircle size={20}/>}
                                {status.msg}
                            </div>
                        )}

                        {activeTab === 'branches' && (
                            <BranchesTab />
                        )}

                        {activeTab === 'general' && (
                            <div className="space-y-10">
                                <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm relative overflow-hidden group">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-blue-600/20 rounded-lg">
                                            <FiLock className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-white">
                                            {t('settings.labels.legalData')}
                                        </h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {t('settings.labels.companyName')}
                                            </label>
                                            <input
                                                type="text"
                                                value={settings.registration.name || ""}
                                                onChange={(e) => setSettings({ ...settings, registration: { ...settings.registration, name: e.target.value } })}
                                                className="w-full bg-slate-900/50 border border-slate-800 text-white px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                                                placeholder={t('settings.placeholder.companyName')}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {t('settings.labels.legalAddress')}
                                            </label>
                                            <textarea
                                                value={settings.registration.address || ""}
                                                onChange={(e) => setSettings({ ...settings, registration: { ...settings.registration, address: e.target.value } })}
                                                className="w-full bg-slate-900/50 border border-slate-800 text-white px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all h-20 resize-none"
                                                placeholder={t('settings.placeholder.address')}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                    {t('settings.labels.contactLine')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.registration.phone || ""}
                                                    onChange={(e) => setSettings({ ...settings, registration: { ...settings.registration, phone: e.target.value } })}
                                                    className="w-full bg-slate-900/50 border border-slate-800 text-white px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                                                    placeholder={t('settings.placeholder.phone')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                    {t('settings.labels.taxOfficeNo')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.registration.taxNumber || ""}
                                                    onChange={(e) => setSettings({ ...settings, registration: { ...settings.registration, taxNumber: e.target.value } })}
                                                    className="w-full bg-slate-900/50 border border-slate-800 text-white px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                                                    placeholder={t('settings.placeholder.taxNo')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-amber-500/20 p-8 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-10 text-amber-400 scale-150 rotate-12"><FiRefreshCw size={80}/></div>
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> {t('settings.labels.demoSeeding')}
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed mb-6">
                                        {t('settings.desc.demoSeeding')}
                                    </p>
                                    {import.meta.env.PROD ? (
                                        <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-bold text-rose-400 flex items-center gap-2">
                                            <FiAlertCircle size={16} />
                                            Production ortamında demo verisi yüklenemez.
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('demo')}
                                            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/20 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-600/40 transition-all active:scale-95"
                                        >
                                            <FiRefreshCw size={14} />
                                            {t('settings.btn.goToDemo')}
                                        </button>
                                    )}
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div> {t('settings.labels.operationalSettings')}
                                    </h3>
                                    <div className="grid grid-cols-2 gap-8">
                                        <InputField 
                                            label={t('settings.labels.systemLanguage')} 
                                            type="select" 
                                            value={settings.language} 
                                            options={[{v:'tr', l:'Türkçe'}, {v:'de', l:'Deutsch'}, {v:'en', l:'English'}]}
                                            onChange={v => setSettings(s => ({ ...s, language: v }))} 
                                        />
                                        <InputField 
                                            label={t('settings.labels.currencySymbol')} 
                                            value={settings.currency ?? 'EUR'} 
                                            onChange={v => setSettings(s => ({ ...s, currency: v }))}
                                        />
                                        <InputField 
                                            label={t('settings.labels.autoLockTimeout')} 
                                            type="number" 
                                            value={settings.idleTimeout || 3600} 
                                            onChange={v => setSettings(s => ({ ...s, idleTimeout: parseInt(v) }))}
                                        />
                                        <InputField 
                                            label={t('settings.labels.defaultViewMode')} 
                                            type="select" 
                                            value={settings.floorPlanMode || 'grid'} 
                                            options={[{v:'grid', l:'Grid List'}, {v:'visual', l:'Visual (SVG)'}]}
                                            onChange={v => setSettings(s => ({ ...s, floorPlanMode: v }))}
                                        />
                                        <InputField 
                                            label={t('settings.labels.applyViewTo')} 
                                            type="select" 
                                            value={settings.applyFloorPlanTo || 'both'} 
                                            options={[{v:'cashier', l:'Kasiyer'}, {v:'waiter', l:'Garson'}, {v:'both', l:'Her İkisi'}]}
                                            onChange={v => setSettings(s => ({ ...s, applyFloorPlanTo: v }))}
                                        />
                                        <div className="space-y-2">
                                            <InputField 
                                                label={t('settings.labels.longOccupiedThreshold')} 
                                                type="number" 
                                                value={settings.longOccupiedMinutes || 45} 
                                                onChange={v => setSettings(s => ({ ...s, longOccupiedMinutes: parseInt(v) }))}
                                            />
                                            <p className="text-[10px] text-slate-500 italic">
                                                {t('settings.desc.longOccupied')}
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> {t('settings.labels.accountingVisibility')}
                                    </h3>
                                    <div className="space-y-6">
                                        <ToggleOption 
                                            label={t('settings.labels.hideCancelledInAccounting')} 
                                            active={settings.accountingVisibility?.hideCancelled || false} 
                                            onChange={(val) => setSettings({ ...settings, accountingVisibility: { ...settings.accountingVisibility, hideCancelled: val, hideDeleted: settings.accountingVisibility?.hideDeleted || false } })} 
                                        />
                                        <ToggleOption 
                                            label={t('settings.labels.hideDeletedInAccounting')} 
                                            active={settings.accountingVisibility?.hideDeleted || false} 
                                            onChange={(val) => setSettings({ ...settings, accountingVisibility: { ...settings.accountingVisibility, hideDeleted: val, hideCancelled: settings.accountingVisibility?.hideCancelled || false } })} 
                                        />
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> {t('settings.labels.security')}
                                    </h3>
                                    <div className="space-y-4">
                                        <ToggleOption 
                                            label={t('settings.labels.requirePinForPickup')} 
                                            active={settings.pickupSecurity?.requirePIN || false} 
                                            onChange={(val) => setSettings({ ...settings, pickupSecurity: { requirePIN: val } })} 
                                        />
                                        <p className="text-[10px] text-emerald-400/70 font-medium italic">
                                            {t('settings.desc.securityPin')}
                                        </p>
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-rose-500/20 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> {t('settings.labels.deviceLock')}
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400 mb-6 italic">
                                        {t('settings.desc.deviceLock')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleResetAllDevices}
                                        disabled={resettingDevices}
                                        className="h-14 rounded-2xl bg-rose-600/10 border border-rose-600/30 px-8 text-xs font-black text-rose-500 hover:bg-rose-600 hover:text-white transition-all disabled:opacity-50 flex items-center gap-3"
                                    >
                                        <FiRefreshCw size={16} className={resettingDevices ? 'animate-spin' : ''} />
                                        {resettingDevices ? t('settings.btn.resetting') : t('settings.btn.resetDeviceLocks')}
                                    </button>
                                </section>
                            </div>
                        )}

                        {activeTab === 'integrations' && (
                            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                {/* CALLER ID & VOIP */}
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><FiPhoneCall/></div>
                                        {t('settings.labels.callerIdVoip')}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label={t('settings.labels.enableCallerId')} 
                                                active={settings.integrations.callerId.enabled}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, enabled: v } } }))}
                                            />
                                        </div>
                                        <InputField 
                                            label={t('settings.labels.signalSource')} 
                                            type="select" 
                                            value={settings.integrations.callerId.source || 'android'}
                                            options={[
                                                {v: 'android', l: t('settings.options.androidGateway')},
                                                {v: 'voip', l: t('settings.options.voipSip')},
                                                {v: 'modem', l: t('settings.options.usbModem')}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, source: v as any } } }))}
                                        />
                                        <InputField 
                                            label={t('settings.labels.newCustomerMode')} 
                                            type="select" 
                                            value={settings.integrations.callerId.createCustomerMode}
                                            options={[
                                                {v: 'before', l: t('settings.options.regBefore')},
                                                {v: 'after', l: t('settings.options.regAuto')},
                                                {v: 'callback', l: t('settings.options.regManual')}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, createCustomerMode: v as any } } }))}
                                        />
                                        
                                        {settings.integrations.callerId.source === 'android' && (
                                            <>
                                                <InputField label={t('settings.labels.androidSyncKey')} value={settings.integrations.callerId.androidKey || ''} placeholder={t('settings.placeholder.complexKey')} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, androidKey: v } } }))} />
                                                <div className="col-span-2 p-5 bg-blue-50 border border-blue-100 rounded-2xl relative group">
                                                    <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-2">{t('settings.labels.androidWebhookUrl')}</label>
                                                    <div className="flex items-center gap-3">
                                                        <code className="text-[10px] font-bold text-blue-900 break-all flex-1">
                                                            {window.location.origin}/api/v1/integrations/caller-id?tenant={useAuthStore.getState().tenantId}&key={settings.integrations.callerId.androidKey || 'ANAHTAR-YOK'}
                                                        </code>
                                                        <button 
                                                            onClick={() => {
                                                                const url = `${window.location.origin}/api/v1/integrations/caller-id?tenant=${useAuthStore.getState().tenantId}&key=${settings.integrations.callerId.androidKey || 'ANAHTAR-YOK'}`;
                                                                navigator.clipboard.writeText(url);
                                                                toast.success(t('settings.toast.webhookCopied'));
                                                            }}
                                                            className="p-3 bg-white border border-blue-100 rounded-xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                                            title={t('settings.btn.copy')}
                                                        >
                                                            <FiCopy size={16} />
                                                        </button>
                                                    </div>
                                                    <p className="mt-2 text-[9px] font-bold text-blue-400 italic">
                                                        {t('settings.desc.androidWebhook')}
                                                    </p>
                                                </div>
                                            </>
                                        )}

                                        {settings.integrations.callerId.source === 'voip' && (
                                            <>
                                                <InputField label={t('settings.labels.voipProxy')} value={settings.integrations.callerId.voipDomain || ''} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, voipDomain: v } } }))} />
                                                <InputField label={t('settings.labels.voipUser')} value={settings.integrations.callerId.voipUsername || ''} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, voipUsername: v } } }))} />
                                                <InputField label={t('settings.labels.voipPass')} value={settings.integrations.callerId.voipPassword || ''} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, voipPassword: v } } }))} />
                                            </>
                                        )}
                                    </div>
                                </section>

                                {/* PAYMENT GATEWAYS */}
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><FiCreditCard/></div>
                                        {t('settings.labels.paymentTerminal')}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label={t('settings.labels.simulationMode')} 
                                                active={settings.integrations.payment.simulationMode}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, simulationMode: v } } }))}
                                            />
                                            <p className="mt-2 text-[10px] font-bold text-orange-500 uppercase flex items-center gap-2">
                                                <FiAlertCircle/> {t('settings.desc.simulationWarning')}
                                            </p>
                                        </div>
                                        <InputField 
                                            label={t('settings.labels.paymentProvider')} 
                                            type="select" 
                                            value={settings.integrations.payment.provider}
                                            options={[
                                                {v: 'manual', l: t('settings.options.manualPos')},
                                                {v: 'stripe', l: 'Stripe Terminal (Air)'},
                                                {v: 'sumup', l: 'SumUp Air / Solo'},
                                                {v: 'iyzico', l: 'Iyzico Android POS'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, provider: v as any } } }))}
                                        />
                                        <InputField label={t('settings.labels.apiKey')} value={settings.integrations.payment.apiKey} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, apiKey: v } } }))} />
                                        <InputField label={t('settings.labels.terminalId')} value={settings.integrations.payment.terminalId} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, terminalId: v } } }))} />
                                    </div>
                                </section>

                                {/* WHATSAPP API */}
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center"><FiMessageCircle/></div>
                                        {t('settings.labels.whatsappAutomation')}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label={t('settings.labels.enableWhatsapp')} 
                                                active={settings.integrations.whatsapp.enabled}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, enabled: v } } }))}
                                            />
                                        </div>
                                        <InputField label={t('settings.labels.whatsappPhoneId')} value={settings.integrations.whatsapp.phoneNumberId || ''} placeholder="123456789012345" onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, phoneNumberId: v } } }))} />
                                        <InputField label={t('settings.labels.cloudApiToken')} value={settings.integrations.whatsapp.apiKey} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, apiKey: v } } }))} />
                                        <InputField label={t('settings.labels.whatsappBusNo')} value={settings.integrations.whatsapp.phoneNumber} placeholder="+905..." onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, phoneNumber: v } } }))} />
                                        <InputField label={t('settings.labels.webhookKey')} value={settings.integrations.whatsapp.webhookKey || ''} placeholder={t('settings.placeholder.randomKey')} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, webhookKey: v } } }))} />
                                        <div className="col-span-2">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">{t('settings.labels.whatsappWebhookUrl')}</label>
                                            <div className="flex items-center gap-3">
                                                <code className="text-[10px] font-bold text-slate-700 break-all flex-1">
                                                    {window.location.origin}/api/v1/integrations/whatsapp?tenant={useAuthStore.getState().tenantId}&key={settings.integrations.whatsapp.webhookKey || 'ANAHTAR-YOK'}
                                                </code>
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label={t('settings.labels.autoWelcome')} 
                                                active={settings.integrations.whatsapp.sendWelcomeMessage}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, sendWelcomeMessage: v } } }))}
                                            />
                                            <ToggleOption 
                                                label={t('settings.labels.notifyReady')} 
                                                active={settings.integrations.whatsapp.sendOrderReadyMessage}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, sendOrderReadyMessage: v } } }))}
                                            />
                                        </div>
                                    </div>
                                </section>

                                {/* HARDWARE */}
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center"><FiHardDrive/></div>
                                        {t('settings.labels.hardware')}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <InputField label={t('settings.labels.drawerCommand')} value={settings.integrations.hardware.drawerOpenCommand} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, hardware: { ...s.integrations.hardware, drawerOpenCommand: v } } }))} />
                                        <InputField label={t('settings.labels.primaryPrinter')} value={settings.integrations.hardware.primaryPrinter} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, hardware: { ...s.integrations.hardware, primaryPrinter: v } } }))} />
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'online_order' && (
                            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-8 opacity-5 text-orange-500 scale-150 rotate-12"><FiSettings size={80}/></div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center"><FiSettings/></div>
                                        {t('settings.labels.onlineOrderQr')}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label={t('settings.labels.enableOnline')} 
                                                active={settings.integrations.onlineOrder?.enabled ?? false}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), enabled: v } } }))}
                                            />
                                        </div>
                                        <ToggleOption 
                                            label={t('settings.labels.allowGuest')} 
                                            active={settings.integrations.onlineOrder?.allowGuestCheckout ?? true}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), allowGuestCheckout: v } } }))}
                                        />
                                        <ToggleOption 
                                            label={t('settings.labels.autoCreateCust')} 
                                            active={settings.integrations.onlineOrder?.autoCreateCustomer ?? true}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), autoCreateCustomer: v } } }))}
                                        />
                                    </div>
                                </section>

                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm border-l-4 border-l-rose-500">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10">{t('settings.labels.alarmSounds')}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <InputField 
                                            label={t('settings.labels.qrNotifySound')} 
                                            type="select" 
                                            value={settings.integrations.onlineOrder?.qrNotificationSound ?? 'bell_ding.mp3'}
                                            options={[
                                                {v: 'bell_ding.mp3', l: t('settings.options.classicBell')},
                                                {v: 'kitchen_order.mp3', l: t('settings.options.kitchenFiq')},
                                                {v: 'digital_alert.mp3', l: t('settings.options.digitalAlert')},
                                                {v: 'modern_chime.mp3', l: t('settings.options.modernChime')}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), qrNotificationSound: v } } }))}
                                        />
                                        <InputField 
                                            label={t('settings.labels.waNotifySound')} 
                                            type="select" 
                                            value={settings.integrations.onlineOrder?.whatsappNotificationSound ?? 'whatsapp_alert.mp3'}
                                            options={[
                                                {v: 'whatsapp_alert.mp3', l: t('settings.options.stdWhatsapp')},
                                                {v: 'bird_tweet.mp3', l: t('settings.options.birdTweet')},
                                                {v: 'pulse_echo.mp3', l: t('settings.options.pulseEcho')},
                                                {v: 'radar_ping.mp3', l: t('settings.options.radarPing')}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), whatsappNotificationSound: v } } }))}
                                        />
                                        <InputField 
                                            label={t('settings.labels.alertInterval')} 
                                            type="number"
                                            value={String(settings.integrations.onlineOrder?.alertInterval ?? 30)}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), alertInterval: Number(v) } } }))}
                                        />
                                        <div className="flex flex-col justify-end pb-2">
                                            <p className="text-[10px] text-slate-400 font-bold italic leading-relaxed">
                                                {t('settings.desc.alarmInterval')}
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'receipt' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10">{t('settings.labels.receiptTexts')}</h3>
                                    <div className="space-y-6">
                                        <InputField label={t('settings.labels.headerSlogan')} value={settings.receipt.header} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, header: v } }))} />
                                        <InputField label={t('settings.labels.footerInfo')} value={settings.receipt.footer} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, footer: v } }))} />
                                        <div className="space-y-3 pt-4">
                                            <ToggleOption label={t('settings.labels.showLogo')} active={settings.receipt.showLogo} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, showLogo: v } }))} />
                                            <ToggleOption label={t('settings.labels.showAddr')} active={settings.receipt.showAddress} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, showAddress: v } }))} />
                                            <ToggleOption label={t('settings.labels.showPhone')} active={settings.receipt.showPhone} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, showPhone: v } }))} />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'tax' && (
                            <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm max-w-2xl">
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10">{t('settings.labels.vatConfig')}</h3>
                                <div className="space-y-4">
                                    {settings.vat.map((v, i) => (
                                        <div key={i} className="flex gap-4 items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                            <input className="flex-1 bg-transparent border-none text-xs font-black text-slate-700 outline-none uppercase" value={v.label} onChange={e => updateVat(i, 'label', e.target.value)} />
                                            <div className="w-20"><input type="number" className="w-full bg-white border rounded-xl px-4 py-2 text-sm font-black" value={v.value} onChange={e => updateVat(i, 'value', Number(e.target.value))} /></div>
                                            <button onClick={() => setSettings(s => ({...s, vat: s.vat.filter((_, idx)=>idx!==i)}))} className="text-rose-400 p-2" aria-label={t('settings.btn.deleteTax')} title={t('settings.btn.deleteTax')}><FiTrash2/></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setSettings(s => ({...s, vat: [...s.vat, {label:'YENİ', value:0}]}))} className="w-full py-4 border-2 border-dashed border-slate-100 rounded-2xl text-[10px] font-black text-slate-400 uppercase">+ {t('settings.btn.addTax')}</button>
                                </div>
                            </section>
                        )}

                        {activeTab === 'kiosk' && (
                            <div className="max-w-3xl space-y-8 animate-in slide-in-from-right-4 duration-300">
                                <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
                                    <h3 className="mb-8 flex items-center gap-3 text-xs font-black uppercase tracking-widest text-white">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                                            <FiTablet size={20} />
                                        </div>
                                        {t('settings.labels.kioskSetup')}
                                    </h3>
                                    <p className="mb-8 text-[11px] font-bold leading-relaxed text-slate-400">
                                        {t('settings.desc.kioskSetup')}
                                    </p>
                                    <div className="space-y-6">
                                        <ToggleOption
                                            label={t('settings.labels.enableKiosk')}
                                            active={settings.integrations.kiosk?.enabled ?? true}
                                            onChange={(v) =>
                                                setSettings((s) => {
                                                    const k = { ...defaultKioskSettings(), ...s.integrations.kiosk };
                                                    return {
                                                        ...s,
                                                        integrations: {
                                                            ...s.integrations,
                                                            kiosk: { ...k, enabled: v },
                                                        },
                                                    };
                                                })
                                            }
                                        />
                                        <ToggleOption
                                            label={t('settings.labels.allowSelfReg')}
                                            active={settings.integrations.kiosk?.allowSelfRegistration ?? true}
                                            onChange={(v) =>
                                                setSettings((s) => {
                                                    const k = { ...defaultKioskSettings(), ...s.integrations.kiosk };
                                                    return {
                                                        ...s,
                                                        integrations: {
                                                            ...s.integrations,
                                                            kiosk: { ...k, allowSelfRegistration: v },
                                                        },
                                                    };
                                                })
                                            }
                                        />
                                        <InputField
                                            label={t('settings.labels.pairingCode')}
                                            value={settings.integrations.kiosk?.pairingSecret ?? ''}
                                            placeholder={t('settings.placeholder.codeOptional')}
                                            onChange={(v) =>
                                                setSettings((s) => {
                                                    const k = { ...defaultKioskSettings(), ...s.integrations.kiosk };
                                                    return {
                                                        ...s,
                                                        integrations: {
                                                            ...s.integrations,
                                                            kiosk: { ...k, pairingSecret: v },
                                                        },
                                                    };
                                                })
                                            }
                                        />
                                        <div>
                                            <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                {t('settings.labels.deviceNotes')}
                                            </label>
                                            <textarea
                                                className="min-h-[100px] w-full rounded-2xl border-2 border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/40"
                                                placeholder={t('settings.placeholder.deviceNotes')}
                                                value={settings.integrations.kiosk?.deviceNotes ?? ''}
                                                onChange={(e) =>
                                                    setSettings((s) => {
                                                        const k = { ...defaultKioskSettings(), ...s.integrations.kiosk };
                                                        return {
                                                            ...s,
                                                            integrations: {
                                                                ...s.integrations,
                                                                kiosk: { ...k, deviceNotes: e.target.value },
                                                            },
                                                        };
                                                    })
                                                }
                                            />
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                                            <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                {t('settings.labels.registeredCodes')}
                                            </p>
                                            <div className="max-h-[240px] space-y-2 overflow-y-auto">
                                                {(settings.integrations.kiosk?.linkedDevices ?? []).length === 0 ? (
                                                    <p className="text-xs font-bold text-slate-500">{t('settings.status.noKiosk')}</p>
                                                ) : (
                                                    [...(settings.integrations.kiosk?.linkedDevices ?? [])]
                                                        .sort((a, b) =>
                                                            String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
                                                        )
                                                        .map((d, idx) => (
                                                            <div
                                                                key={d.deviceCode || `dev-${idx}`}
                                                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px]"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-black text-emerald-400/90">
                                                                        {d.tableName || d.label || t('settings.labels.table')}
                                                                        {d.sectionName ? (
                                                                            <span className="font-bold text-slate-500"> · {d.sectionName}</span>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                                                                        {d.deviceCode || `— (${t('settings.status.oldRecord')})`}
                                                                    </div>
                                                                    {d.lastSeenAt ? (
                                                                        <div className="mt-1 text-[9px] text-slate-600">
                                                                            {t('settings.labels.lastSeen')}: {new Date(d.lastSeenAt).toLocaleString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US')}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                {d.deviceCode ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 rounded-lg border border-white/15 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                                                                            title={t('settings.btn.copy')}
                                                                            onClick={() => {
                                                                                void navigator.clipboard.writeText(d.deviceCode!);
                                                                                toast.success(t('settings.toast.deviceCodeCopied'));
                                                                            }}
                                                                        >
                                                                            <FiCopy size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 rounded-lg border border-rose-500/15 p-2 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                                                            title="İptal Et (Revoke)"
                                                                            onClick={async () => {
                                                                                if (!confirm('Bu cihazın erişimini iptal etmek istiyor musunuz? Cihaz anında kilitlenecektir.')) return;
                                                                                try {
                                                                                    const res = await fetch(`/api/v1/admin/settings/kiosk/revoke/${encodeURIComponent(d.deviceCode!)}`, {
                                                                                        method: 'DELETE',
                                                                                        headers: getAuthHeaders()
                                                                                    });
                                                                                    if (res.ok) {
                                                                                        toast.success('Cihaz yetkisi iptal edildi.');
                                                                                        // Optimistically remove from state
                                                                                        setSettings(s => {
                                                                                            const k = s.integrations.kiosk || { enabled: true, allowSelfRegistration: true, pairingSecret: '', deviceNotes: '', linkedDevices: [] };
                                                                                            return {
                                                                                                ...s,
                                                                                                integrations: {
                                                                                                    ...s.integrations,
                                                                                                    kiosk: {
                                                                                                        ...k,
                                                                                                        linkedDevices: k.linkedDevices.filter(x => x.deviceCode !== d.deviceCode)
                                                                                                    }
                                                                                                }
                                                                                            };
                                                                                        });
                                                                                    } else {
                                                                                        toast.error('İptal işlemi başarısız.');
                                                                                    }
                                                                                } catch (e) {
                                                                                    toast.error('Bağlantı hatası.');
                                                                                }
                                                                            }}
                                                                        >
                                                                            <FiTrash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-[10px] font-bold text-slate-400">
                                            <p className="mb-2 text-emerald-400">{t('settings.labels.pairingGuide')}</p>
                                            {t('settings.desc.pairingGuide')}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'printing' && (
                            <div className="max-w-3xl space-y-8 animate-in slide-in-from-right-4 duration-300">
                                <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
                                    <h3 className="mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-widest text-white">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
                                            <FiPrinter size={20} />
                                        </div>
                                        {t('settings.labels.kitchenReceiptPrinting')}
                                    </h3>
                                    <p className="mb-6 text-[11px] font-bold leading-relaxed text-slate-400">
                                        {t('settings.desc.printingAgent')}
                                    </p>
                                    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
                                        <button
                                            type="button"
                                            onClick={() => void loadAgentPrinters()}
                                            disabled={agentLoading}
                                            className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-600/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-sky-100 hover:bg-sky-600/50 disabled:opacity-50"
                                        >
                                            <FiRefreshCw size={14} className={agentLoading ? 'animate-spin' : ''} />
                                            {t('settings.btn.refreshPrinters')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => printTestReceipt(settings)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-600/50"
                                        >
                                            <FiPrinter size={14} />
                                            TEST ÇIKTISI AL
                                        </button>
                                        <span className="text-[10px] font-bold text-slate-500">
                                            {agentPrinters.length > 0 ? tpl(t, 'settings.status.printersFound', { count: agentPrinters.length }) : t('settings.status.noPrinters')}
                                        </span>
                                    </div>
                                    {agentHint ? (
                                        <p className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[10px] font-bold text-amber-200/90">{agentHint}</p>
                                    ) : null}
                                    <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-[11px] font-bold text-slate-300">
                                        <p className="mb-1 text-amber-400/90">{t('settings.labels.billingQuota')}</p>
                                        <p className="leading-relaxed text-slate-400">
                                            {tpl(t, 'settings.desc.printerQuota', { base: settings.billingLimits?.basePrinters ?? 2 })}
                                        </p>
                                        <p className="mt-2 font-mono text-[10px] text-slate-500">
                                            {t('settings.labels.usedCount')}: {(settings.integrations.printStations?.printers?.length ?? 0) + ' / '}
                                            {settings.billingLimits?.maxPrinters ?? 2} · {t('settings.labels.extraModules')}:{' '}
                                            {settings.billingLimits?.extraPrintersPurchased ?? 0}
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400/90">{t('settings.labels.kitchenStation')}</div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('settings.labels.systemPrinter')}</label>
                                            <select
                                                className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-sky-500/50"
                                                value={settings.integrations.printStations?.printers?.[0]?.systemPrinterName ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setSettings((s) => {
                                                        const ps = { ...defaultPrintStations(), ...s.integrations.printStations };
                                                        const printers = [...(ps.printers?.length ? ps.printers : defaultPrintStations().printers)];
                                                        const cur = printers[0];
                                                        printers[0] = {
                                                            ...cur,
                                                            id: cur?.id || 'default-kitchen',
                                                            role: 'kitchen',
                                                            systemPrinterName: v || undefined,
                                                            name: v || cur?.name || t('settings.labels.kitchen'),
                                                        };
                                                        return {
                                                            ...s,
                                                            integrations: {
                                                                ...s.integrations,
                                                                printStations: { ...ps, printers },
                                                            },
                                                        };
                                                    });
                                                }}
                                            >
                                                <option value="">— {t('settings.options.selectFromList')} —</option>
                                                {agentPrinters.map((pn) => (
                                                    <option key={pn} value={pn}>
                                                        {pn}
                                                    </option>
                                                ))}
                                            </select>
                                            <InputField
                                                label={t('settings.labels.receiptLabel')}
                                                value={settings.integrations.printStations?.printers?.[0]?.name || t('settings.labels.kitchen')}
                                                onChange={(v) =>
                                                    setSettings((s) => {
                                                        const ps = { ...defaultPrintStations(), ...s.integrations.printStations };
                                                        const printers = [...(ps.printers?.length ? ps.printers : defaultPrintStations().printers)];
                                                        printers[0] = {
                                                            ...printers[0],
                                                            id: printers[0]?.id || 'default-kitchen',
                                                            role: 'kitchen',
                                                            name: v,
                                                        };
                                                        return {
                                                            ...s,
                                                            integrations: {
                                                                ...s.integrations,
                                                                printStations: { ...ps, printers },
                                                            },
                                                        };
                                                    })
                                                }
                                            />
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-violet-400/90">{t('settings.labels.receiptStation')}</div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{t('settings.labels.systemPrinter')}</label>
                                            <select
                                                className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-500/50"
                                                value={
                                                    (() => {
                                                        const ps = { ...defaultPrintStations(), ...settings.integrations.printStations };
                                                        const pr = [...(ps.printers?.length ? ps.printers : defaultPrintStations().printers)];
                                                        const ri = pr.findIndex((p) => p.role === 'receipt');
                                                        return ri >= 0 ? pr[ri].systemPrinterName ?? '' : '';
                                                    })()
                                                }
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setSettings((s) => {
                                                        const ps = { ...defaultPrintStations(), ...s.integrations.printStations };
                                                        let printers = [...(ps.printers?.length ? ps.printers : defaultPrintStations().printers)];
                                                        const ri = printers.findIndex((p) => p.role === 'receipt');
                                                        if (ri >= 0) {
                                                            printers[ri] = {
                                                                ...printers[ri],
                                                                systemPrinterName: v || undefined,
                                                                name: v || printers[ri].name,
                                                            };
                                                        } else {
                                                            printers.push({
                                                                id: 'default-receipt',
                                                                name: v || t('settings.labels.receiptFile'),
                                                                role: 'receipt',
                                                                systemPrinterName: v || undefined,
                                                            });
                                                        }
                                                        return {
                                                            ...s,
                                                            integrations: {
                                                                ...s.integrations,
                                                                printStations: { ...ps, printers },
                                                            },
                                                        };
                                                    });
                                                }}
                                            >
                                                <option value="">— {t('settings.options.selectFromList')} —</option>
                                                {agentPrinters.map((pn) => (
                                                    <option key={`r-${pn}`} value={pn}>
                                                        {pn}
                                                    </option>
                                                ))}
                                            </select>
                                            <InputField
                                                label={t('settings.labels.receiptLabel')}
                                                value={
                                                    settings.integrations.printStations?.printers?.find((p) => p.role === 'receipt')?.name ||
                                                    t('settings.labels.receiptFile')
                                                }
                                                onChange={(v) =>
                                                    setSettings((s) => {
                                                        const ps = { ...defaultPrintStations(), ...s.integrations.printStations };
                                                        let printers = [...(ps.printers?.length ? ps.printers : defaultPrintStations().printers)];
                                                        const ri = printers.findIndex((p) => p.role === 'receipt');
                                                        if (ri >= 0) printers[ri] = { ...printers[ri], name: v };
                                                        else
                                                            printers.push({
                                                                id: 'default-receipt',
                                                                name: v,
                                                                role: 'receipt',
                                                            });
                                                        return {
                                                            ...s,
                                                            integrations: {
                                                                ...s.integrations,
                                                                printStations: { ...ps, printers },
                                                            },
                                                        };
                                                    })
                                                }
                                            />
                                        </div>
                                        <ToggleOption
                                            label={t('settings.labels.autoPrintKitchen')}
                                            active={settings.integrations.printStations?.kitchenAutoPrint !== false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    integrations: {
                                                        ...s.integrations,
                                                        printStations: {
                                                            ...defaultPrintStations(),
                                                            ...s.integrations.printStations,
                                                            kitchenAutoPrint: v,
                                                        },
                                                    },
                                                }))
                                            }
                                        />
                                        <ToggleOption
                                            label={t('settings.labels.autoPrintReceiptPayment')}
                                            active={settings.integrations.printStations?.receiptOnPayment !== false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    integrations: {
                                                        ...s.integrations,
                                                        printStations: {
                                                            ...defaultPrintStations(),
                                                            ...s.integrations.printStations,
                                                            receiptOnPayment: v,
                                                        },
                                                    },
                                                }))
                                            }
                                        />
                                        <ToggleOption
                                            label={t('settings.labels.autoPrintReceiptClose')}
                                            active={settings.integrations.printStations?.receiptOnSessionClose !== false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    integrations: {
                                                        ...s.integrations,
                                                        printStations: {
                                                            ...defaultPrintStations(),
                                                            ...s.integrations.printStations,
                                                            receiptOnSessionClose: v,
                                                        },
                                                    },
                                                }))
                                            }
                                        />
                                        <ToggleOption
                                            label={t('settings.labels.showReprintKitchen')}
                                            active={settings.integrations.printStations?.reprintKitchenEnabled !== false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    integrations: {
                                                        ...s.integrations,
                                                        printStations: {
                                                            ...defaultPrintStations(),
                                                            ...s.integrations.printStations,
                                                            reprintKitchenEnabled: v,
                                                        },
                                                    },
                                                }))
                                            }
                                        />
                                        <ToggleOption
                                            label={t('settings.labels.showReprintReceipt')}
                                            active={settings.integrations.printStations?.reprintReceiptEnabled !== false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    integrations: {
                                                        ...s.integrations,
                                                        printStations: {
                                                            ...defaultPrintStations(),
                                                            ...s.integrations.printStations,
                                                            reprintReceiptEnabled: v,
                                                        },
                                                    },
                                                }))
                                            }
                                        />
                                        {(settings.integrations.printStations?.printers || []).slice(2).map((p, j) => {
                                            const idx = j + 2;
                                            return (
                                                <div
                                                    key={p.id || `extra-${idx}`}
                                                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                                                >
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                        {tpl(t, 'settings.labels.extraStation', { index: idx + 1 })}
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                                                            {t('settings.labels.systemPrinter')}
                                                        </label>
                                                        <select
                                                            className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-white/25"
                                                            value={p.systemPrinterName ?? ''}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                setSettings((s) => {
                                                                    const ps = {
                                                                        ...defaultPrintStations(),
                                                                        ...s.integrations.printStations,
                                                                    };
                                                                    const printers = [...(ps.printers || [])];
                                                                    printers[idx] = {
                                                                        ...printers[idx],
                                                                        systemPrinterName: v || undefined,
                                                                        name: v || printers[idx].name,
                                                                    };
                                                                    return {
                                                                        ...s,
                                                                        integrations: {
                                                                            ...s.integrations,
                                                                            printStations: { ...ps, printers },
                                                                        },
                                                                    };
                                                                });
                                                            }}
                                                        >
                                                            <option value="">— {t('settings.options.selectFromList')} —</option>
                                                            {agentPrinters.map((pn) => (
                                                                <option key={`${idx}-${pn}`} value={pn}>
                                                                    {pn}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                                    <div className="min-w-0 flex-1">
                                                        <InputField
                                                            label={tpl(t, 'settings.labels.stationLabel', { index: idx + 1 })}
                                                            value={p.name}
                                                            onChange={(v) =>
                                                                setSettings((s) => {
                                                                    const ps = {
                                                                        ...defaultPrintStations(),
                                                                        ...s.integrations.printStations,
                                                                    };
                                                                    const printers = [...(ps.printers || [])];
                                                                    printers[idx] = { ...printers[idx], name: v };
                                                                    return {
                                                                        ...s,
                                                                        integrations: {
                                                                            ...s.integrations,
                                                                            printStations: { ...ps, printers },
                                                                        },
                                                                    };
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="w-full sm:w-44">
                                                        <InputField
                                                            type="select"
                                                            label={t('settings.labels.role')}
                                                            value={p.role}
                                                            options={[
                                                                { v: 'kitchen', l: t('settings.labels.kitchen') },
                                                                { v: 'receipt', l: t('settings.labels.receiptFile') },
                                                                { v: 'bar', l: t('settings.labels.barExtra') },
                                                            ]}
                                                            onChange={(v) =>
                                                                setSettings((s) => {
                                                                    const ps = {
                                                                        ...defaultPrintStations(),
                                                                        ...s.integrations.printStations,
                                                                    };
                                                                    const printers = [...(ps.printers || [])];
                                                                    const role = v as 'kitchen' | 'receipt' | 'bar';
                                                                    printers[idx] = { ...printers[idx], role };
                                                                    return {
                                                                        ...s,
                                                                        integrations: {
                                                                            ...s.integrations,
                                                                            printStations: { ...ps, printers },
                                                                        },
                                                                    };
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="h-12 w-full shrink-0 rounded-2xl border border-red-500/30 px-4 text-[10px] font-black uppercase tracking-wider text-red-400 hover:bg-red-500/10 sm:w-auto sm:self-end"
                                                        onClick={() =>
                                                            setSettings((s) => {
                                                                const ps = {
                                                                    ...defaultPrintStations(),
                                                                    ...s.integrations.printStations,
                                                                };
                                                                const printers = (ps.printers || []).filter((_, i) => i !== idx);
                                                                return {
                                                                    ...s,
                                                                    integrations: {
                                                                        ...s.integrations,
                                                                        printStations: { ...ps, printers },
                                                                    },
                                                                };
                                                            })
                                                        }
                                                    >
                                                        {t('settings.btn.delete')}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {(() => {
                                            const maxP = settings.billingLimits?.maxPrinters ?? 2;
                                            const n = settings.integrations.printStations?.printers?.length ?? 0;
                                            if (n >= maxP) return null;
                                            return (
                                                <button
                                                    type="button"
                                                    className="w-full rounded-2xl border border-sky-500/40 bg-sky-500/10 py-3 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20"
                                                    onClick={() =>
                                                        setSettings((s) => {
                                                            const ps = {
                                                                ...defaultPrintStations(),
                                                                ...s.integrations.printStations,
                                                            };
                                                            const printers = [
                                                                ...(ps.printers?.length
                                                                    ? ps.printers
                                                                    : defaultPrintStations().printers),
                                                            ];
                                                            printers.push({
                                                                id: `extra-${Date.now()}`,
                                                                name: t('settings.labels.barExtra'),
                                                                role: 'bar',
                                                            });
                                                            return {
                                                                ...s,
                                                                integrations: {
                                                                    ...s.integrations,
                                                                    printStations: { ...ps, printers },
                                                                },
                                                            };
                                                        })
                                                    }
                                                >
                                                    {t('settings.btn.addExtraStation')}
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'demo' && (
                            <div className="max-w-3xl space-y-8 animate-in slide-in-from-right-4 duration-300">
                                <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8">
                                    <h3 className="mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-widest text-white">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                                            <FiRefreshCw size={18} />
                                        </div>
                                        {t('settings.labels.demoLoadTitle')}
                                    </h3>
                                    <p className="mb-6 text-[11px] font-bold leading-relaxed text-slate-300">
                                        {t('settings.desc.demoLoad')}
                                    </p>
                                    <div className="mb-6 grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-wider text-slate-300">
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">{t('settings.options.demoZones')}</div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">{t('settings.options.demoTables')}</div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">{t('settings.options.demoCategories')}</div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">{t('settings.options.demoVariants')}</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-[10px] font-bold text-rose-100">
                                        {t('settings.desc.demoWarningText')}
                                    </div>
                                    <div className="mt-6 space-y-4">
                                        <label className="flex items-center gap-3 text-[11px] font-bold text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={demoConfirmed}
                                                onChange={(e) => setDemoConfirmed(e.target.checked)}
                                                className="h-4 w-4 rounded border-white/20 bg-transparent"
                                            />
                                            {t('settings.labels.confirmDemoCheckbox')}
                                        </label>
                                        <InputField
                                            label={tpl(t, 'settings.labels.demoConfirmInput', { text: t('settings.placeholder.demoConfirm') })}
                                            value={demoConfirmText}
                                            onChange={setDemoConfirmText}
                                            placeholder={t('settings.placeholder.demoConfirm')}
                                        />
                                        {import.meta.env.PROD ? (
                                            <div className="px-4 py-3 mt-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-bold text-rose-400 flex items-center gap-2">
                                                <FiAlertCircle size={16} />
                                                Production ortamında demo verisi yüklenemez.
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleSeedDemo}
                                                disabled={seedingDemo}
                                                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/30 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-600/50 disabled:opacity-50"
                                            >
                                                <FiRefreshCw size={14} className={seedingDemo ? 'animate-spin' : ''} />
                                                {seedingDemo ? t('settings.status.demoLoading') : t('settings.btn.loadDemoNow')}
                                            </button>
                                        )}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'modules' && (
                            <div className="max-w-3xl space-y-8 animate-in slide-in-from-right-4 duration-300">
                                <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
                                    <h3 className="mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-widest text-white">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400">
                                            <FiPackage size={20} />
                                        </div>
                                        {t('settings.labels.modulesSubscription')}
                                    </h3>
                                    <p className="mb-6 text-[11px] font-bold leading-relaxed text-slate-400">
                                        {t('settings.desc.modulesInfo')}
                                    </p>
                                    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6">
                                        <div className="mb-5 flex items-center justify-between">
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('settings.labels.restaurant')}</div>
                                                <div className="text-sm font-black text-white">{settings.registration.name || t('settings.labels.restaurant')}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowModulesModal(true)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-600/30 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                                            >
                                                <FiPackage size={15} />
                                                {t('settings.btn.manageModules')}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                {
                                                    label: t('settings.labels.plan'),
                                                    value: (() => {
                                                        if (billingLoading) return '…';
                                                        const planCode = billingStatus?.planCode ? String(billingStatus.planCode).toLowerCase() : '';
                                                        const plan = subscriptionPlans.find((p) => String(p?.code || '').toLowerCase() === planCode);
                                                        return plan?.name || (planCode ? planCode.toUpperCase() : '—');
                                                    })(),
                                                    accent: 'text-blue-400',
                                                },
                                                {
                                                    label: t('settings.labels.monthlyService'),
                                                    value: (() => {
                                                        if (billingLoading) return '…';
                                                        const planCode = billingStatus?.planCode ? String(billingStatus.planCode).toLowerCase() : '';
                                                        const plan = subscriptionPlans.find((p) => String(p?.code || '').toLowerCase() === planCode);
                                                        const fee = plan?.monthly_fee != null ? Number(plan.monthly_fee) : null;
                                                        const cur = String(plan?.currency || settings.currency || 'EUR').toUpperCase();
                                                        const sym = cur === 'EUR' ? '€' : cur === 'TRY' ? '₺' : `${cur} `;
                                                        if (fee == null || Number.isNaN(fee)) return '—';
                                                        return `${sym}${Math.round(fee)}`;
                                                    })(),
                                                    accent: 'text-emerald-400',
                                                },
                                                {
                                                    label: t('settings.labels.extraDevice'),
                                                    value: (() => {
                                                        if (billingLoading) return '…';
                                                        const md = billingStatus?.maxDevices;
                                                        if (!md) return '—';
                                                        return `${md.extra} (${tpl(t, 'settings.labels.totalCount', { count: md.total })})`;
                                                    })(),
                                                    accent: 'text-amber-400',
                                                },
                                            ].map((item) => (
                                                <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{item.label}</div>
                                                    <div className={`text-sm font-black ${item.accent}`}>{item.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </div>

                {/* PREVIEW PANEL */}
                <div className={`transition-all duration-700 ease-in-out bg-slate-300 border-l border-slate-200 shadow-2xl overflow-y-auto ${showPreview ? 'w-[450px] translate-x-0' : 'w-0 translate-x-full invisible'}`}>
                    <div className="p-10 flex flex-col items-center relative">
                        <button onClick={() => setShowPreview(false)} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-800 transition-colors">
                            <FiX size={20} />
                        </button>
                         <div className="w-[340px] bg-white shadow-2xl p-10 min-h-[600px] font-mono text-[11px] text-slate-800 relative">
                             {/* Jagged Header */}
                             <div className="absolute top-0 left-0 w-full h-3 bg-white" style={{clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)'}}></div>

                             <div className="text-center space-y-4 pt-10">
                                 {settings.receipt.showLogo && <div className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-full mx-auto flex items-center justify-center text-slate-300 text-2xl"><FiPrinter/></div>}
                                 <h4 className="text-[16px] font-black uppercase">{settings.registration.name}</h4>
                                 {settings.receipt.header && <p className="italic">{settings.receipt.header}</p>}
                                 <div className="text-[9px] uppercase space-y-1">
                                     {settings.receipt.showAddress && <p>{settings.registration.address}</p>}
                                     {settings.receipt.showPhone && <p className="font-bold">Tel: {settings.registration.phone}</p>}
                                     <p>{settings.registration.taxOffice} / {settings.registration.taxNumber}</p>
                                 </div>
                             </div>

                             <div className="border-t border-dashed border-slate-400 my-6" />
                             <div className="space-y-1.5">
                                 <div className="flex justify-between"><span>1x Super Pizza</span><span>12.50</span></div>
                                 <div className="flex justify-between"><span>2x Ayran</span><span>4.00</span></div>
                             </div>
                             <div className="border-t-2 border-dotted border-black my-6" />
                             <div className="flex justify-between font-black text-[14px]"><span>{t('settings.labels.total')}</span><span>{settings.currency} 16.50</span></div>
                             <div className="border-t border-dashed border-slate-400 my-6" />
                             {settings.receipt.footer && <div className="text-center italic uppercase leading-tight font-black">{settings.receipt.footer}</div>}
                             <div className="pt-10 text-center opacity-30 text-[9px]">{new Date().toLocaleString()}</div>
                         </div>
                    </div>
                </div>
            </div>

            {showModulesModal && (
                <SaaSLocaleProvider initialLang={lang === 'de' ? 'de' : lang === 'en' ? 'en' : 'tr'}>
                    <TenantModulesModal
                        tenantId={tenantId || ''}
                        tenantName={settings.registration.name || t('settings.labels.restaurant')}
                        onClose={() => setShowModulesModal(false)}
                    />
                </SaaSLocaleProvider>
            )}
        </div>
    );
};


// UI COMPONENTS
const TabBtn: React.FC<{ id: any, label: string, active: any, onClick: any }> = ({ id, label, active, onClick }) => (
    <button onClick={() => onClick(id)} className={`h-full px-2 whitespace-nowrap border-b-2 transition-all text-[10px] font-black uppercase tracking-[0.2em] ${active === id ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
        {label}
    </button>
);

const InputField: React.FC<{ label: string, value: string | number, placeholder?: string, type?: 'text' | 'select' | 'number', options?: {v:string, l:string}[], onChange: (v: string) => void }> = ({ label, value, placeholder, type = 'text', options, onChange }) => (
    <div className="group">
        <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest group-focus-within:text-blue-400 transition-colors">{label}</label>
        {type === 'select' ? (
            <select value={value === null || value === undefined ? "" : String(value)} onChange={e => onChange(e.target.value)} className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-black outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all">
                {options?.map(o => <option key={o.v} value={o.v} className="bg-[#0f172a] text-black">{o.l}</option>)}
            </select>
        ) : (
            <input type={type} value={value === null || value === undefined ? "" : String(value)} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-black outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-slate-600" />
        )}
    </div>
);

const ToggleOption: React.FC<{ label: string, active: boolean, onChange: (v: boolean) => void }> = ({ label, active, onChange }) => (
    <div className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer group ${active ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`} onClick={() => onChange(!active)}>
        <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${active ? 'text-indigo-400' : 'text-slate-500'}`}>{label}</span>
        <div className={`w-10 h-6 rounded-full transition-all relative ${active ? 'bg-indigo-600' : 'bg-slate-700'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-lg ${active ? 'left-5' : 'left-1'}`}></div>
        </div>
    </div>
);
