import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    FiSettings, FiPrinter,
    FiSave, FiTrash2, FiCheckCircle, FiAlertCircle,
    FiEye, FiEyeOff, FiLock, FiCreditCard, FiPhoneCall, FiMessageCircle, FiHardDrive, FiCopy, FiTablet,
    FiRefreshCw, FiPackage, FiZap,
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { fetchLocalPrinterList } from '../lib/printerAgent';
import { TenantModulesModal } from './saas/TenantModulesModal';
import { SaaSLocaleProvider } from '../contexts/SaaSLocaleContext';
import { BranchesTab } from './admin-settings/BranchesTab';

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

export const AdminSettings: React.FC = () => {
    const { getAuthHeaders, tenantId } = useAuthStore();
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
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Konfigürasyon Terminali Hazırlanıyor</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-[#020617] font-sans text-slate-100">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md px-10 z-50">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                        <FiSettings size={20} className="animate-spin-slow" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight">Merkezi POS Yönetimi</h2>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sistem v3.1 Aktif</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        className={`flex items-center gap-2 rounded-xl px-5 py-3 text-[10px] font-black transition-all border ${showPreview ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                        {showPreview ? <FiEyeOff /> : <FiEye />} FİŞ ÖN İZLEME
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-8 py-3.5 text-xs font-black text-white shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                    >
                        <FiSave size={16} /> {saving ? 'GÜNCELLENİYOR...' : 'SİSTEMİ GÜNCELLE'}
                    </button>
                </div>
            </header>

            <div className="flex h-14 bg-[#0f172a] border-b border-white/5 px-10 items-center gap-6 shrink-0 overflow-x-auto no-scrollbar">
                <TabBtn id="general" label="GENEL" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="integrations" label="API & ENTEGRASYONLAR" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="online_order" label="ONLINE & QR SİPARİŞ" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="receipt" label="FİŞ TASARIMI" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="tax" label="GELİŞMİŞ VERGİ" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="kiosk" label="MASA TABLET (KİOSK)" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="printing" label="YAZICI & OTOMATİK" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="demo" label="DEMO VERİ" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="branches" label="ŞUBELER" active={activeTab} onClick={setActiveTab} />
                <TabBtn id="modules" label="MODÜLLER" active={activeTab} onClick={setActiveTab} />
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
                                    <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-500 scale-150 rotate-12"><FiLock size={80}/></div>
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> LEGAL KAYIT VERİLERİ
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <ReadOnlyField label="Tescilli Ünvan" val={settings.registration.name} />
                                        <ReadOnlyField label="Yasal Adres" val={settings.registration.address} />
                                        <ReadOnlyField label="İletişim Hattı" val={settings.registration.phone} />
                                        <ReadOnlyField label="Vergi Dairesi / No" val={`${settings.registration.taxOffice || 'GENEL'} / ${settings.registration.taxNumber}`} />
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-amber-500/20 p-8 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-10 text-amber-400 scale-150 rotate-12"><FiRefreshCw size={80}/></div>
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> DEMO VERİ YÜKLEME
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed mb-6">
                                        Masa/salon, menü, varyant ve modifikatörlerden oluşan örnek içerik yüklemek için Demo Veri sekmesine geçin.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('demo')}
                                        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/20 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-600/40 transition-all active:scale-95"
                                    >
                                        <FiRefreshCw size={14} />
                                        Demo Veri Sekmesine Git
                                    </button>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div> OPERASYONEL AYARLAR
                                    </h3>
                                    <div className="grid grid-cols-2 gap-8">
                                        <InputField 
                                            label="Sistem Dili (Bölgesel)" 
                                            type="select" 
                                            value={settings.language} 
                                            options={[{v:'tr', l:'Türkçe'}, {v:'de', l:'Deutsch'}, {v:'en', l:'English'}]}
                                            onChange={v => setSettings(s => ({ ...s, language: v }))} 
                                        />
                                        <InputField 
                                            label="Para Birimi Simgesi" 
                                            value={settings.currency ?? 'EUR'} 
                                            onChange={v => setSettings(s => ({ ...s, currency: v }))} 
                                        />
                                        <InputField 
                                            label="Otomatik Kilit Süresi (Saniye)" 
                                            type="number"
                                            value={String(settings.integrations.idleTimeout ?? 300)} 
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, idleTimeout: Number(v) } }))} 
                                        />
                                        <InputField 
                                            label="VARSAYILAN GÖRÜNÜM MODU" 
                                            type="select" 
                                            value={settings.integrations.floorPlanMode || 'grid'}
                                            options={[
                                                {v: 'grid', l: 'Liste (Grid) Görünümü'},
                                                {v: 'visual', l: 'Görsel Kat Planı'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, floorPlanMode: v as any } }))} 
                                        />
                                        <InputField 
                                            label="GÖRÜNÜMÜ UYGULA (EKRANLAR)" 
                                            type="select" 
                                            value={settings.integrations.applyFloorPlanTo || 'both'}
                                            options={[
                                                {v: 'cashier', l: 'Sadece Kasiyer'},
                                                {v: 'waiter', l: 'Sadece Garson'},
                                                {v: 'both', l: 'Her İkisi (Kasiyer & Garson)'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, applyFloorPlanTo: v as any } }))} 
                                        />
                                        <InputField 
                                            label="Uzun süre dolu masa eşiği (dakika)" 
                                            type="number"
                                            value={String(settings.integrations.longOccupiedMinutes ?? 45)} 
                                            onChange={v => {
                                                const n = Math.min(720, Math.max(5, Math.floor(Number(v) || 45)));
                                                setSettings(s => ({ ...s, integrations: { ...s.integrations, longOccupiedMinutes: n } }));
                                            }} 
                                        />
                                        <p className="col-span-2 text-[10px] text-slate-500 font-bold leading-relaxed -mt-4">
                                            Masa oturumu bu süreyi aşınca garson ve kasiyer masa planında kırmızı “uzun süre” görünümüne geçer (5–720 dk).
                                        </p>
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-white/5 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> MUHASEBE GÖRÜNÜRLÜĞÜ
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <ToggleOption
                                            label="İptal kayıtlarını muhasebede gösterme"
                                            active={settings.accountingVisibility?.hideCancelled || false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    accountingVisibility: {
                                                        hideCancelled: v,
                                                        hideDeleted: s.accountingVisibility?.hideDeleted || false,
                                                    },
                                                }))
                                            }
                                        />
                                        <ToggleOption
                                            label="Silinmiş kayıtları muhasebede gösterme"
                                            active={settings.accountingVisibility?.hideDeleted || false}
                                            onChange={(v) =>
                                                setSettings((s) => ({
                                                    ...s,
                                                    accountingVisibility: {
                                                        hideCancelled: s.accountingVisibility?.hideCancelled || false,
                                                        hideDeleted: v,
                                                    },
                                                }))
                                            }
                                        />
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-white/10 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> PERSONEL & TESLİM ALMA GÜVENLİĞİ
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <ToggleOption 
                                            label="Sipariş Tesliminde PIN Doğrulaması İste" 
                                            active={settings.integrations.pickupSecurity?.requirePIN || false}
                                            onChange={v => setSettings(s => ({ 
                                                ...s, 
                                                integrations: { 
                                                    ...s.integrations, 
                                                    pickupSecurity: { requirePIN: v } 
                                                } 
                                            }))}
                                        />
                                        <div className="flex flex-col justify-center">
                                            <p className="text-[10px] text-slate-400 font-bold italic leading-relaxed">
                                                * Aktif edildiğinde, garson veya kurye siparişi mutfaktan teslim alırken kendi 6 haneli PIN kodunu girmek zorundadır. Bu işlem sorumluluk takibi ve performans raporları için kritiktir.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <section className="bg-white/5 rounded-3xl border border-rose-500/20 p-8 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-8 opacity-10 text-rose-400 scale-150 rotate-12"><FiZap size={80}/></div>
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> CİHAZ KİLİDİ
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed mb-6">
                                        “Bu kullanıcı farklı bir cihaza kilitli” hatası alındığında, buradan tüm cihaz eşleşmelerini sıfırlayabilirsiniz.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleResetAllDevices}
                                        disabled={resettingDevices}
                                        className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-600/20 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-rose-100 hover:bg-rose-600/40 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <FiZap size={14} />
                                        {resettingDevices ? 'Sıfırlanıyor...' : 'Tüm cihaz kilitlerini sıfırla'}
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
                                        Caller ID & VoIP Santral
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label="Caller ID Sistemini Aktifleştir" 
                                                active={settings.integrations.callerId.enabled}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, enabled: v } } }))}
                                            />
                                        </div>
                                        <InputField 
                                            label="Sinyal Kaynağı (Donanım)" 
                                            type="select" 
                                            value={settings.integrations.callerId.source || 'android'}
                                            options={[
                                                {v: 'android', l: 'Android Gateway App (Önerilen)'},
                                                {v: 'voip', l: 'VoIP SIP (Bulut/Yerel Santral)'},
                                                {v: 'modem', l: 'USB Caller ID Modem (Analog)'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, source: v as any } } }))}
                                        />
                                        <InputField 
                                            label="Yeni Müşteri Kayıt Modu" 
                                            type="select" 
                                            value={settings.integrations.callerId.createCustomerMode}
                                            options={[
                                                {v: 'before', l: 'Önce Kayıt (Siparişten Önce)'},
                                                {v: 'after', l: 'Otomatik (Sipariş Esnasında)'},
                                                {v: 'callback', l: 'Sadece Manuel Seçim'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, createCustomerMode: v as any } } }))}
                                        />
                                        
                                        {settings.integrations.callerId.source === 'android' && (
                                            <>
                                                <InputField label="Android Sync Key (Şifre)" value={settings.integrations.callerId.androidKey || ''} placeholder="Karmaşık bir anahtar girin..." onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, androidKey: v } } }))} />
                                                <div className="col-span-2 p-5 bg-blue-50 border border-blue-100 rounded-2xl relative group">
                                                    <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-2">Android Uygulama Webhook URL</label>
                                                    <div className="flex items-center gap-3">
                                                        <code className="text-[10px] font-bold text-blue-900 break-all flex-1">
                                                            {window.location.origin}/api/v1/integrations/caller-id?tenant={useAuthStore.getState().tenantId}&key={settings.integrations.callerId.androidKey || 'ANAHTAR-YOK'}
                                                        </code>
                                                        <button 
                                                            onClick={() => {
                                                                const url = `${window.location.origin}/api/v1/integrations/caller-id?tenant=${useAuthStore.getState().tenantId}&key=${settings.integrations.callerId.androidKey || 'ANAHTAR-YOK'}`;
                                                                navigator.clipboard.writeText(url);
                                                                toast.success('Webhook URL kopyalandı');
                                                            }}
                                                            className="p-3 bg-white border border-blue-100 rounded-xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                                            title="Kopyala"
                                                        >
                                                            <FiCopy size={16} />
                                                        </button>
                                                    </div>
                                                    <p className="mt-2 text-[9px] font-bold text-blue-400 italic font-sans italic">Bu URL'yi Android "Caller ID to Webhook" uygulamasına kopyalayın.</p>
                                                </div>
                                            </>
                                        )}

                                        {settings.integrations.callerId.source === 'voip' && (
                                            <>
                                                <InputField label="VoIP Proxy / Domain" value={settings.integrations.callerId.voipDomain || ''} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, voipDomain: v } } }))} />
                                                <InputField label="VoIP Kullanıcı Adı (EXT)" value={settings.integrations.callerId.voipUsername || ''} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, voipUsername: v } } }))} />
                                                <InputField label="VoIP Şifre" value={settings.integrations.callerId.voipPassword || ''} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, callerId: { ...s.integrations.callerId, voipPassword: v } } }))} />
                                            </>
                                        )}
                                    </div>
                                </section>

                                {/* PAYMENT GATEWAYS */}
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><FiCreditCard/></div>
                                        Ödeme Terminali & API
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label="Ödeme Simülasyon Modu (TEST)" 
                                                active={settings.integrations.payment.simulationMode}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, simulationMode: v } } }))}
                                            />
                                            <p className="mt-2 text-[10px] font-bold text-orange-500 uppercase flex items-center gap-2">
                                                <FiAlertCircle/> AKTİF EDİLDİĞİNDE KREDİ KARTI ÖDEMELERİ GERÇEK ÇEKİM YAPMAZ, SİMÜLE EDİLİR.
                                            </p>
                                        </div>
                                        <InputField 
                                            label="Kredi Kartı Ödeme Kanalı" 
                                            type="select" 
                                            value={settings.integrations.payment.provider}
                                            options={[
                                                {v: 'manual', l: 'Dış Cihaz (Manuel Giriş)'},
                                                {v: 'stripe', l: 'Stripe Terminal (Air)'},
                                                {v: 'sumup', l: 'SumUp Air / Solo'},
                                                {v: 'iyzico', l: 'Iyzico Android POS'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, provider: v as any } } }))}
                                        />
                                        <InputField label="API Key / Merchant ID" value={settings.integrations.payment.apiKey} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, apiKey: v } } }))} />
                                        <InputField label="Terminal ID (Opsiyonel)" value={settings.integrations.payment.terminalId} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, payment: { ...s.integrations.payment, terminalId: v } } }))} />
                                    </div>
                                </section>

                                {/* WHATSAPP API */}
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center"><FiMessageCircle/></div>
                                        WhatsApp Otomasyonu
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label="WhatsApp Onay Mesajlarını Aktifleştir" 
                                                active={settings.integrations.whatsapp.enabled}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, enabled: v } } }))}
                                            />
                                        </div>
                                        <InputField label="WhatsApp Phone Number ID" value={settings.integrations.whatsapp.phoneNumberId || ''} placeholder="123456789012345" onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, phoneNumberId: v } } }))} />
                                        <InputField label="Cloud API Access Token" value={settings.integrations.whatsapp.apiKey} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, apiKey: v } } }))} />
                                        <InputField label="WhatsApp İşletme Numarası (Görsel)" value={settings.integrations.whatsapp.phoneNumber} placeholder="+905..." onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, phoneNumber: v } } }))} />
                                        <InputField label="Webhook Anahtarı" value={settings.integrations.whatsapp.webhookKey || ''} placeholder="rastgele-uzun-anahtar" onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, webhookKey: v } } }))} />
                                        <div className="col-span-2">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Webhook URL (WhatsApp)</label>
                                            <div className="flex items-center gap-3">
                                                <code className="text-[10px] font-bold text-slate-700 break-all flex-1">
                                                    {window.location.origin}/api/v1/integrations/whatsapp?tenant={useAuthStore.getState().tenantId}&key={settings.integrations.whatsapp.webhookKey || 'ANAHTAR-YOK'}
                                                </code>
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label="Yeni Üyelere Otomatik Karşılama Mesajı Gönder" 
                                                active={settings.integrations.whatsapp.sendWelcomeMessage}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, whatsapp: { ...s.integrations.whatsapp, sendWelcomeMessage: v } } }))}
                                            />
                                            <ToggleOption 
                                                label="Paket/Gel-Al Hazır Olduğunda Müşteriye Bildir" 
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
                                        Donanım & Çevre Birimleri
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <InputField label="Çekmece Açma Kodu (ASCII)" value={settings.integrations.hardware.drawerOpenCommand} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, hardware: { ...s.integrations.hardware, drawerOpenCommand: v } } }))} />
                                        <InputField label="Ana Yazıcı Portu / Adı" value={settings.integrations.hardware.primaryPrinter} onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, hardware: { ...s.integrations.hardware, primaryPrinter: v } } }))} />
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
                                        Online Sipariş & QR Altyapısı
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="col-span-2">
                                            <ToggleOption 
                                                label="Online Sipariş Alma Sistemini Aktifleştir" 
                                                active={settings.integrations.onlineOrder?.enabled ?? false}
                                                onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), enabled: v } } }))}
                                            />
                                        </div>
                                        <ToggleOption 
                                            label="Misafir (Üyeliksiz) Alışverişe İzin Ver" 
                                            active={settings.integrations.onlineOrder?.allowGuestCheckout ?? true}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), allowGuestCheckout: v } } }))}
                                        />
                                        <ToggleOption 
                                            label="Müşteri Kaydını Otomatik Yap" 
                                            active={settings.integrations.onlineOrder?.autoCreateCustomer ?? true}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), autoCreateCustomer: v } } }))}
                                        />
                                    </div>
                                </section>

                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm border-l-4 border-l-rose-500">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10">ALARM & BİLDİRİM SESLERİ</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <InputField 
                                            label="QR Sipariş Bildirim Sesi" 
                                            type="select" 
                                            value={settings.integrations.onlineOrder?.qrNotificationSound ?? 'bell_ding.mp3'}
                                            options={[
                                                {v: 'bell_ding.mp3', l: 'Klasik Masa Zili'},
                                                {v: 'kitchen_order.mp3', l: 'Mutfak Fiş Sesi'},
                                                {v: 'digital_alert.mp3', l: 'Dijital Uyarı'},
                                                {v: 'modern_chime.mp3', l: 'Modern Melodi'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), qrNotificationSound: v } } }))}
                                        />
                                        <InputField 
                                            label="WhatsApp Sipariş Bildirim Sesi" 
                                            type="select" 
                                            value={settings.integrations.onlineOrder?.whatsappNotificationSound ?? 'whatsapp_alert.mp3'}
                                            options={[
                                                {v: 'whatsapp_alert.mp3', l: 'Standart WhatsApp'},
                                                {v: 'bird_tweet.mp3', l: 'Kuş Sesi (Soft)'},
                                                {v: 'pulse_echo.mp3', l: 'Darbeli Yankı'},
                                                {v: 'radar_ping.mp3', l: 'Radar Ping'}
                                            ]}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), whatsappNotificationSound: v } } }))}
                                        />
                                        <InputField 
                                            label="Alarm Hatırlatma Aralığı (Saniye)" 
                                            type="number"
                                            value={String(settings.integrations.onlineOrder?.alertInterval ?? 30)}
                                            onChange={v => setSettings(s => ({ ...s, integrations: { ...s.integrations, onlineOrder: { ...(s.integrations.onlineOrder || {}), alertInterval: Number(v) } } }))}
                                        />
                                        <div className="flex flex-col justify-end pb-2">
                                            <p className="text-[10px] text-slate-400 font-bold italic leading-relaxed">
                                                * Sipariş onaylanana kadar alarm belirlenen saniyede bir çalmaya devam eder.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'receipt' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
                                <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10">FİŞ METİNLERİ</h3>
                                    <div className="space-y-6">
                                        <InputField label="Fiş Üst Slogan" value={settings.receipt.header} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, header: v } }))} />
                                        <InputField label="Fiş Alt Bilgi" value={settings.receipt.footer} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, footer: v } }))} />
                                        <div className="space-y-3 pt-4">
                                            <ToggleOption label="Logo Göster" active={settings.receipt.showLogo} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, showLogo: v } }))} />
                                            <ToggleOption label="Adres Göster" active={settings.receipt.showAddress} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, showAddress: v } }))} />
                                            <ToggleOption label="Telefon Göster" active={settings.receipt.showPhone} onChange={v => setSettings(s => ({ ...s, receipt: { ...s.receipt, showPhone: v } }))} />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'tax' && (
                            <section className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm max-w-2xl">
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-10">KDV YAPILANDIRMASI</h3>
                                <div className="space-y-4">
                                    {settings.vat.map((v, i) => (
                                        <div key={i} className="flex gap-4 items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                            <input className="flex-1 bg-transparent border-none text-xs font-black text-slate-700 outline-none uppercase" value={v.label} onChange={e => updateVat(i, 'label', e.target.value)} />
                                            <div className="w-20"><input type="number" className="w-full bg-white border rounded-xl px-4 py-2 text-sm font-black" value={v.value} onChange={e => updateVat(i, 'value', Number(e.target.value))} /></div>
                                            <button onClick={() => setSettings(s => ({...s, vat: s.vat.filter((_, idx)=>idx!==i)}))} className="text-rose-400 p-2" aria-label="Vergi satırını sil" title="Vergi satırını sil"><FiTrash2/></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setSettings(s => ({...s, vat: [...s.vat, {label:'YENİ', value:0}]}))} className="w-full py-4 border-2 border-dashed border-slate-100 rounded-2xl text-[10px] font-black text-slate-400 uppercase">+ VERGİ EKLE</button>
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
                                        Masa tableti (kiosk) — ilk kurulum ve eşleştirme
                                    </h3>
                                    <p className="mb-8 text-[11px] font-bold leading-relaxed text-slate-400">
                                        Tablet tarayıcıda <code className="rounded bg-black/30 px-2 py-0.5 text-emerald-300">/kiosk</code> adresini açın. İlk açılışta kurum lisans numarası ve masa bilgisi istenir; bu cihazda saklanır.
                                        İsteğe bağlı eşleştirme kodu ile sadece sizin verdiğiniz cihazlar kayıt olabilir.
                                    </p>
                                    <div className="space-y-6">
                                        <ToggleOption
                                            label="Kiosk menü özelliğini kullan (masa tabletleri)"
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
                                            label="Tabletin kendi kendine kuruluma izin ver (ilk açılış sihirbazı)"
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
                                            label="Eşleştirme kodu (opsiyonel — tablette de girilir)"
                                            value={settings.integrations.kiosk?.pairingSecret ?? ''}
                                            placeholder="Boş bırakılırsa kod istenmez"
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
                                                Cihaz / kurulum notları (iç kullanım)
                                            </label>
                                            <textarea
                                                className="min-h-[100px] w-full rounded-2xl border-2 border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/40"
                                                placeholder="Örn. Bahçe 3 numaralı tablet, seri no …"
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
                                                Kayıtlı cihaz kodları (kurulumda üretilir)
                                            </p>
                                            <div className="max-h-[240px] space-y-2 overflow-y-auto">
                                                {(settings.integrations.kiosk?.linkedDevices ?? []).length === 0 ? (
                                                    <p className="text-xs font-bold text-slate-500">Henüz kiosk kurulumu yok.</p>
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
                                                                        {d.tableName || d.label || 'Masa'}
                                                                        {d.sectionName ? (
                                                                            <span className="font-bold text-slate-500"> · {d.sectionName}</span>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                                                                        {d.deviceCode || '— (eski kayıt)'}
                                                                    </div>
                                                                    {d.lastSeenAt ? (
                                                                        <div className="mt-1 text-[9px] text-slate-600">
                                                                            Son görülme: {new Date(d.lastSeenAt).toLocaleString('tr-TR')}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                {d.deviceCode ? (
                                                                    <button
                                                                        type="button"
                                                                        className="shrink-0 rounded-lg border border-white/15 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                                                                        title="Kodu kopyala"
                                                                        onClick={() => {
                                                                            void navigator.clipboard.writeText(d.deviceCode!);
                                                                            toast.success('Cihaz kodu kopyalandı');
                                                                        }}
                                                                    >
                                                                        <FiCopy size={14} />
                                                                    </button>
                                                                ) : null}
                                                            </div>
                                                        ))
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-[10px] font-bold text-slate-400">
                                            <p className="mb-2 text-emerald-400">Bağlı cihazları kodla ilişkilendirme</p>
                                            Yukarıdaki eşleştirme kodunu doldurduğunuzda, tablet sihirbazında aynı kodu girmek zorunludur. Kodu değiştirdiğinizde eski tabletler yeniden kayıt olmalıdır.
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
                                        Mutfak & adisyon yazdırma
                                    </h3>
                                    <p className="mb-6 text-[11px] font-bold leading-relaxed text-slate-400">
                                        Yazdırma <code className="rounded bg-black/30 px-1">window.print</code> ile yapılır. Aşağıdaki listede Windows/Linux’ta kurulu yazıcılar görünür; bunun için kasa bilgisayarında yerel{' '}
                                        <code className="rounded bg-black/30 px-1">npm run printer-agent</code> süreci çalışmalıdır (ağdaki paylaşımlı yazıcılar sistemde tanımlıysa listede çıkar).
                                    </p>
                                    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
                                        <button
                                            type="button"
                                            onClick={() => void loadAgentPrinters()}
                                            disabled={agentLoading}
                                            className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-600/30 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-sky-100 hover:bg-sky-600/50 disabled:opacity-50"
                                        >
                                            <FiRefreshCw size={14} className={agentLoading ? 'animate-spin' : ''} />
                                            Sistem yazıcılarını yenile
                                        </button>
                                        <span className="text-[10px] font-bold text-slate-500">
                                            {agentPrinters.length > 0 ? `${agentPrinters.length} yazıcı bulundu` : 'Liste boş'}
                                        </span>
                                    </div>
                                    {agentHint ? (
                                        <p className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[10px] font-bold text-amber-200/90">{agentHint}</p>
                                    ) : null}
                                    <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-[11px] font-bold text-slate-300">
                                        <p className="mb-1 text-amber-400/90">Abonelik — yazıcı istasyonu kotası</p>
                                        <p className="leading-relaxed text-slate-400">
                                            Pakette{' '}
                                            <span className="text-white">{settings.billingLimits?.basePrinters ?? 2}</span> istasyon dahil (mutfak + adisyon). Ek
                                            satırlar için SaaS panelinden{' '}
                                            <span className="text-white">«Ek Yazıcı İstasyonu»</span> modülü satın alınır (ek kullanıcı / ek cihaz gibi
                                            faturalanır).
                                        </p>
                                        <p className="mt-2 font-mono text-[10px] text-slate-500">
                                            Kullanılan: {(settings.integrations.printStations?.printers?.length ?? 0) + ' / '}
                                            {settings.billingLimits?.maxPrinters ?? 2} · Ek modül adedi:{' '}
                                            {settings.billingLimits?.extraPrintersPurchased ?? 0}
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400/90">Mutfak istasyonu</div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Sistem / ağ yazıcısı</label>
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
                                                            name: v || cur?.name || 'Mutfak',
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
                                                <option value="">— Listeden seçin —</option>
                                                {agentPrinters.map((pn) => (
                                                    <option key={pn} value={pn}>
                                                        {pn}
                                                    </option>
                                                ))}
                                            </select>
                                            <InputField
                                                label="Etiket (fiş üstünde)"
                                                value={settings.integrations.printStations?.printers?.[0]?.name || 'Mutfak'}
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
                                            <div className="text-[10px] font-black uppercase tracking-widest text-violet-400/90">Adisyon / makbuz</div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Sistem / ağ yazıcısı</label>
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
                                                                name: v || 'Adisyon / Fiş',
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
                                                <option value="">— Listeden seçin —</option>
                                                {agentPrinters.map((pn) => (
                                                    <option key={`r-${pn}`} value={pn}>
                                                        {pn}
                                                    </option>
                                                ))}
                                            </select>
                                            <InputField
                                                label="Etiket (fiş üstünde)"
                                                value={
                                                    settings.integrations.printStations?.printers?.find((p) => p.role === 'receipt')?.name ||
                                                    'Adisyon / Fiş'
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
                                            label="Mutfağa gönderilince mutfak fişini otomatik yazdır"
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
                                            label="Hızlı ödeme (sipariş + ödeme) sonunda adisyonu otomatik yazdır"
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
                                            label="Masa oturumu kapatılınca (toplu ödeme) adisyonu otomatik yazdır"
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
                                            label="POS’ta “Mutfak fişini tekrar yazdır” göster"
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
                                            label="POS’ta “Makbuzu tekrar yazdır” göster"
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
                                                        Ek istasyon {idx + 1}
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                                                            Sistem / ağ yazıcısı
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
                                                            <option value="">— Listeden seçin —</option>
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
                                                            label={`Etiket (${idx + 1}. istasyon)`}
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
                                                            label="Rol"
                                                            value={p.role}
                                                            options={[
                                                                { v: 'kitchen', l: 'Mutfak' },
                                                                { v: 'receipt', l: 'Adisyon / fiş' },
                                                                { v: 'bar', l: 'Bar / ek' },
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
                                                        Sil
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
                                                                name: 'Bar / ek',
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
                                                    + Ek yazıcı istasyonu ekle
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
                                        Demo içerik yükleme (restoran + kurye)
                                    </h3>
                                    <p className="mb-6 text-[11px] font-bold leading-relaxed text-slate-300">
                                        Bu işlem onaylı reset yapar ve örnek veri seti kurar: salon/bölge, masalar, menü kategorileri, ürünler, varyantlar,
                                        modifikatörler ve ürün-modifikatör eşleşmeleri.
                                    </p>
                                    <div className="mb-6 grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-wider text-slate-300">
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">Ana Salon + Teras + Paket</div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">Masa planı + QR kodlar</div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">Pizza/Burger/İçecek/Tatlı</div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">Varyant + sos/ekstralar</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-[10px] font-bold text-rose-100">
                                        Uyarı: Mevcut masa/menü demo reset kapsamında silinir. Aktif masa oturumu veya bekleyen sipariş varken işlem engellenir.
                                    </div>
                                    <div className="mt-6 space-y-4">
                                        <label className="flex items-center gap-3 text-[11px] font-bold text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={demoConfirmed}
                                                onChange={(e) => setDemoConfirmed(e.target.checked)}
                                                className="h-4 w-4 rounded border-white/20 bg-transparent"
                                            />
                                            Demo reset işlemini onaylıyorum.
                                        </label>
                                        <InputField
                                            label='Onay için yazın: "DEMO YÜKLE"'
                                            value={demoConfirmText}
                                            onChange={setDemoConfirmText}
                                            placeholder="DEMO YÜKLE"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSeedDemo}
                                            disabled={seedingDemo}
                                            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/30 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-amber-100 hover:bg-amber-600/50 disabled:opacity-50"
                                        >
                                            <FiRefreshCw size={14} className={seedingDemo ? 'animate-spin' : ''} />
                                            {seedingDemo ? 'Demo veri yükleniyor...' : 'Demo veriyi şimdi yükle'}
                                        </button>
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
                                        Ek Modüller & Abonelik
                                    </h3>
                                    <p className="mb-6 text-[11px] font-bold leading-relaxed text-slate-400">
                                        Restoranınız için ek modül satın alabilir veya mevcut modüllerinizi görüntüleyebilirsiniz. Seçilen modüller aylık servis ücretinize eklenir.
                                    </p>
                                    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6">
                                        <div className="mb-5 flex items-center justify-between">
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Restoran</div>
                                                <div className="text-sm font-black text-white">{settings.registration.name || 'Restoran'}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowModulesModal(true)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-600/30 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-violet-100 hover:bg-violet-600/50 transition-all"
                                            >
                                                <FiPackage size={15} />
                                                Modülleri Yönet
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                {
                                                    label: 'Plan',
                                                    value: (() => {
                                                        if (billingLoading) return '…';
                                                        const planCode = billingStatus?.planCode ? String(billingStatus.planCode).toLowerCase() : '';
                                                        const plan = subscriptionPlans.find((p) => String(p?.code || '').toLowerCase() === planCode);
                                                        return plan?.name || (planCode ? planCode.toUpperCase() : '—');
                                                    })(),
                                                    accent: 'text-blue-400',
                                                },
                                                {
                                                    label: 'Aylık Servis',
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
                                                    label: 'Ek Cihaz',
                                                    value: (() => {
                                                        if (billingLoading) return '…';
                                                        const md = billingStatus?.maxDevices;
                                                        if (!md) return '—';
                                                        return `${md.extra} (Toplam ${md.total})`;
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
                    <div className="p-10 flex flex-col items-center">
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
                             <div className="flex justify-between font-black text-[14px]"><span>TOPLAM</span><span>{settings.currency} 16.50</span></div>
                             <div className="border-t border-dashed border-slate-400 my-6" />
                             {settings.receipt.footer && <div className="text-center italic uppercase leading-tight font-black">{settings.receipt.footer}</div>}
                             <div className="pt-10 text-center opacity-30 text-[9px]">{new Date().toLocaleString()}</div>
                         </div>
                    </div>
                </div>
            </div>

            {showModulesModal && (
                <SaaSLocaleProvider initialLang="tr">
                    <TenantModulesModal
                        tenantId={tenantId || ''}
                        tenantName={settings.registration.name || 'Restoran'}
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

const ReadOnlyField: React.FC<{ label: string, val: string }> = ({ label, val }) => (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-white/10">
        <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">{label}</label>
        <p className="text-sm font-bold text-black uppercase tracking-wider truncate">{val || '-'}</p>
    </div>
);

const InputField: React.FC<{ label: string, value: string, placeholder?: string, type?: 'text' | 'select' | 'number', options?: {v:string, l:string}[], onChange: (v: string) => void }> = ({ label, value, placeholder, type = 'text', options, onChange }) => (
    <div className="group">
        <label className="block text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest group-focus-within:text-blue-400 transition-colors">{label}</label>
        {type === 'select' ? (
            <select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-black outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all">
                {options?.map(o => <option key={o.v} value={o.v} className="bg-[#0f172a] text-black">{o.l}</option>)}
            </select>
        ) : (
            <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="w-full rounded-2xl border-2 border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-black outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-slate-600" />
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
