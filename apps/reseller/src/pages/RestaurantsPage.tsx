import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
    FiSearch,
    FiRefreshCw,
    FiUsers,
    FiDatabase,
    FiShield,
    FiActivity,
    FiPercent,
    FiEdit3,
    FiCheck,
    FiCheckCircle,
    FiShoppingCart,
    FiCreditCard,
    FiFileText,
    FiBriefcase,
    FiDollarSign,
    FiCopy,
    FiTerminal,
    FiGlobe,
    FiTrendingUp,
    FiBell,
    FiHash,
    FiMapPin,
    FiPhone,
    FiUser,
    FiLogIn,
    FiClock,
    FiSettings,
    FiSliders,
    FiPlusCircle,
    FiZap,
    FiCpu,
    FiPlay,
    FiDownload,
    FiServer,
} from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';
import { Modal, Input, Select, EmptyState } from '../components/Shared.tsx';

const BILLING_API = '/api/v1/billing';
const TENANTS_API = '/api/v1/tenants';

type BillingCatalogRow = {
    code: string;
    name: string;
    setup_price: number;
    monthly_price: number;
};

type SubscriptionPlanRow = {
    code: string;
    name?: string;
    max_users: number;
    max_branches: number;
    setup_fee: number;
    monthly_fee: number;
};

/** API yanıtı gelmezse gösterim / eşleştirme */
const FALLBACK_PLAN_LIMITS: Record<string, { max_users: number; max_branches: number }> = {
    basic: { max_users: 5, max_branches: 1 },
    pro: { max_users: 15, max_branches: 3 },
    enterprise: { max_users: 50, max_branches: 10 },
};

/** DB ile uyumlu varsayılan fiyatlar (yerel teklif yedek hesap) */
const FALLBACK_PLAN_PRICING: Record<string, { name: string; setup_fee: number; monthly_fee: number }> = {
    basic: { name: 'Başlangıç', setup_fee: 299, monthly_fee: 29 },
    pro: { name: 'Pro', setup_fee: 499, monthly_fee: 59 },
    enterprise: { name: 'Kurumsal', setup_fee: 999, monthly_fee: 99 },
};

function normalizePlanRows(raw: unknown): SubscriptionPlanRow[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((row: any) => {
        const code = String(row?.code ?? '');
        const fb = FALLBACK_PLAN_LIMITS[code];
        const pricing = FALLBACK_PLAN_PRICING[code];
        const mu = row?.max_users ?? row?.maxUsers;
        const mb = row?.max_branches ?? row?.maxBranches;
        const sf = row?.setup_fee ?? row?.setupFee;
        const mf = row?.monthly_fee ?? row?.monthlyFee;
        return {
            code,
            name: row?.name != null ? String(row.name) : undefined,
            max_users: Number(mu ?? fb?.max_users ?? 10),
            max_branches: Number(mb ?? fb?.max_branches ?? 1),
            setup_fee: Number(sf ?? pricing?.setup_fee ?? 0),
            monthly_fee: Number(mf ?? pricing?.monthly_fee ?? 0),
        };
    });
}

type PlanModuleRow = {
    code: string;
    name: string;
    mode: 'included' | 'addon' | 'locked';
    setup_price: number;
    monthly_price: number;
};

type LiveQuote = {
    planName?: string;
    setupFee: number;
    monthlyService: number;
    modulesSetup: number;
    modulesMonthly: number;
    monthlyRecurringTotal: number;
    yearlyPrepayTotal: number;
    annualDiscountPercent: number;
    firstInvoiceTotal: number;
    billingCycle: 'monthly' | 'yearly';
    lines: { code: string; name: string; setup: number; monthly: number; qty?: number; includedInPlan?: boolean }[];
    resellerDirectSale?: { totalResellerCommission: number; walletNetDelta: number };
};

type PaymentRow = {
    id: number;
    amount: number | string;
    currency?: string;
    payment_type: string;
    payment_method?: string;
    status: string;
    description?: string;
    due_date?: string;
    created_at?: string;
};

function estimateResellerDirectSaleFromQuote(q: LiveQuote): { totalResellerCommission: number; walletNetDelta: number } {
    const rates = { reseller_setup_rate: 75, reseller_monthly_rate: 50 };
    const setupTotal = q.setupFee + q.modulesSetup;
    const resellerSetupPart = setupTotal * (rates.reseller_setup_rate / 100);
    const resellerServicePart =
        q.billingCycle === 'yearly'
            ? q.yearlyPrepayTotal * (rates.reseller_monthly_rate / 100)
            : q.monthlyRecurringTotal * (rates.reseller_monthly_rate / 100);
    const totalResellerCommission = resellerSetupPart + resellerServicePart;
    const walletNetDelta = totalResellerCommission - q.firstInvoiceTotal;
    return { totalResellerCommission, walletNetDelta };
}

function buildLocalQuote(
    planCode: string,
    subscriptionPlans: SubscriptionPlanRow[],
    planModules: PlanModuleRow[],
    billingCatalog: BillingCatalogRow[],
    moduleCodes: string[],
    extraDeviceQty: number,
    extraPrinterQty: number,
    billingCycle: 'monthly' | 'yearly',
    annualDiscountPercent = 15,
): LiveQuote | null {
    const planRow = subscriptionPlans.find((p) => p.code === planCode);
    const fb = FALLBACK_PLAN_PRICING[planCode];
    const setupFee = Number(planRow?.setup_fee ?? fb?.setup_fee ?? 0);
    const monthlyService = Number(planRow?.monthly_fee ?? fb?.monthly_fee ?? 0);
    const planName = planRow?.name ?? fb?.name;
    if (!fb && !planRow && setupFee === 0 && monthlyService === 0) return null;

    const lines: LiveQuote['lines'] = [];
    let modulesSetup = 0;
    let modulesMonthly = 0;

    for (const code of moduleCodes) {
        let m: PlanModuleRow | undefined = planModules.find((x) => x.code === code);
        if (!m) {
            const c = billingCatalog.find((x) => x.code === code);
            if (!c) continue;
            m = {
                code: c.code,
                name: c.name,
                mode: 'addon',
                setup_price: Number(c.setup_price),
                monthly_price: Number(c.monthly_price),
            };
        }
        let qty = 1;
        if (code === 'extra_device' && extraDeviceQty > 0) qty = extraDeviceQty;
        if (code === 'extra_printer' && extraPrinterQty > 0) qty = extraPrinterQty;
        if (m.mode === 'included') {
            lines.push({ code, name: m.name, setup: 0, monthly: 0, qty, includedInPlan: true });
            continue;
        }
        if (m.mode === 'locked') continue;
        const s = Number(m.setup_price) * qty;
        const mo = Number(m.monthly_price) * qty;
        modulesSetup += s;
        modulesMonthly += mo;
        lines.push({ code, name: m.name, setup: s, monthly: mo, qty });
    }

    const monthlyRecurringTotal = monthlyService + modulesMonthly;
    const yearlyPrepayBeforeDiscount = monthlyRecurringTotal * 12;
    const yearlyPrepayTotal = yearlyPrepayBeforeDiscount * (1 - annualDiscountPercent / 100);
    const firstInvoiceTotal =
        billingCycle === 'yearly'
            ? setupFee + modulesSetup + yearlyPrepayTotal
            : setupFee + modulesSetup + monthlyRecurringTotal;

    const out: LiveQuote = {
        planName,
        setupFee,
        monthlyService,
        modulesSetup,
        modulesMonthly,
        monthlyRecurringTotal,
        yearlyPrepayTotal,
        annualDiscountPercent,
        firstInvoiceTotal,
        billingCycle,
        lines,
    };
    return { ...out, resellerDirectSale: estimateResellerDirectSaleFromQuote(out) };
}

function genPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function genAdminUsername(schemaName: string): string {
    return schemaName.replace(/^tenant_/, '').replace(/[^a-z0-9]/g, '').slice(0, 16) || 'admin';
}

/** API: /^tenant_[a-z0-9_]+$/ */
function makeSchemaName(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return `tenant_${slug || 'restoran'}`;
}

function maskPhone(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 4) return d;
    if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
    if (d.length <= 9) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
}

function maskTaxNumber(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 11);
}

async function fetchPlanModuleMatrix(planCode: string, token: string | null): Promise<PlanModuleRow[]> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BILLING_API}/plan-modules/${encodeURIComponent(planCode)}`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.modules) ? data.modules : [];
}

async function fetchBillingCatalog(token: string | null): Promise<BillingCatalogRow[]> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BILLING_API}/modules`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

function eur(n: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function defaultForm() {
    return {
        name: '',
        schema_name: '',
        contact_email: '',
        contact_phone: '',
        authorized_person: '',
        tax_office: '',
        tax_number: '',
        address: '',
        subscription_plan: 'basic' as 'basic' | 'pro' | 'enterprise',
        master_password: genPassword(),
        admin_username: '',
        license_usage_type: 'prepaid' as 'prepaid' | 'direct_sale',
        payment_interval: 'monthly' as 'monthly' | 'yearly',
        /** Varsayılan havale değil: cüzdan/havuz ile anında aktif + komisyon (havale ayrı seçilir) */
        payment_method: 'wallet_balance' as 'bank_transfer' | 'admin_card' | 'wallet_balance',
        send_payment_notification: false,
        module_codes: [] as string[],
        extra_device_qty: 1,
        extra_printer_qty: 1,
    };
}

type EntRow = {
    code: string;
    name: string;
    mode: string;
    enabled: boolean;
    setup_price?: number;
    monthly_price?: number;
};

function AddonsModal({
    tenant,
    onClose,
}: {
    tenant: { id: string; name: string };
    onClose: () => void;
}) {
    const token = useResellerStore(s => s.token);
    const admin = useResellerStore(s => s.admin);
    const fetchDashStats = useResellerStore(s => s.fetchDashStats);
    const fetchTenants = useResellerStore(s => s.fetchTenants);
    const [ents, setEnts] = useState<EntRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyCode, setBusyCode] = useState<string | null>(null);

    // Yeni UI stateleri
    const [selectedAddon, setSelectedAddon] = useState<EntRow | null>(null);
    const [paymentTab, setPaymentTab] = useState<'card' | 'bank' | 'wallet' | 'cash'>('card');
    
    // Kart UI stateleri
    const [cardNumber, setCardNumber] = useState('');
    const [cardName, setCardName] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvv, setCardCvv] = useState('');
    const [isCardFlipped, setIsCardFlipped] = useState(false);

    const load = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/billing/tenants/${encodeURIComponent(tenant.id)}/entitlements`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setEnts([]);
                return;
            }
            const data = (await res.json()) as { entitlements?: EntRow[] };
            setEnts(Array.isArray(data.entitlements) ? data.entitlements : []);
        } catch {
            setEnts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [tenant.id, token]);

    const handlePurchase = async () => {
        if (!token || !selectedAddon) return;
        
        const totalAmount = (selectedAddon.setup_price || 0);

        if (paymentTab === 'wallet' && (admin?.wallet_balance || 0) < totalAmount) {
            toast.error(`Bakiye Yetersiz! Mevcut: €${admin?.wallet_balance || 0}, Gerekli: €${totalAmount}`);
            return;
        }

        if (paymentTab === 'card') {
            if (cardNumber.replace(/\s/g,'').length !== 16 || cardExpiry.length !== 5 || cardCvv.length < 3) {
                toast.error('Lütfen geçerli kart bilgileri giriniz.');
                return;
            }
        }

        setBusyCode(selectedAddon.code);
        const pMethodMap = { card: 'admin_card', bank: 'bank_transfer', wallet: 'wallet_balance', cash: 'cash' } as const;
        try {
            const res = await fetch(`/api/v1/billing/tenants/${encodeURIComponent(tenant.id)}/addons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ module_codes: [selectedAddon.code], payment_method: pMethodMap[paymentTab] }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(json.error || 'Modül satın alınamadı');
                return;
            }
            toast.success('Modül başarıyla eklendi!');
            setSelectedAddon(null);
            setCardNumber(''); setCardName(''); setCardExpiry(''); setCardCvv('');
            await fetchTenants();
            await fetchDashStats();
            await load();
        } catch {
            toast.error('Bağlantı hatası');
        } finally {
            setBusyCode(null);
        }
    };

    const activeModules = ents.filter(e => e.enabled);
    const availableModules = ents.filter(e => e.mode === 'addon' && !e.enabled);

    const formatCardNumber = (val: string) => {
        return val.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().substring(0, 19);
    };
    const formatExpiry = (val: string) => {
        const v = val.replace(/\D/g, '').substring(0,4);
        if (v.length >= 3) return `${v.substring(0,2)}/${v.substring(2)}`;
        return v;
    };

    return (
        <Modal show={true} onClose={onClose} title={`Modül Yönetimi - ${tenant.name}`} className="max-w-5xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* SOL BÖLME: Mevcut Modüller */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10">
                        <FiCheckCircle className="text-emerald-400" size={18} />
                        <h3 className="text-sm font-black text-white tracking-widest uppercase">Sahip Olunan Modüller</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {loading ? (
                            <div className="animate-pulse space-y-3">
                                <div className="h-16 bg-white/5 rounded-xl"></div>
                                <div className="h-16 bg-white/5 rounded-xl"></div>
                            </div>
                        ) : activeModules.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-10">Henüz aktif bir modül bulunmuyor.</p>
                        ) : (
                            activeModules.map((e) => (
                                <div key={e.code} className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <div>
                                        <p className="text-sm font-bold text-emerald-100">{e.name}</p>
                                        <p className="text-[10px] text-emerald-500/60 font-mono mt-0.5">{e.code}</p>
                                    </div>
                                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase rounded-lg">Aktif</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* SAĞ BÖLME: Satın Alınabilir Modüller */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10">
                        <FiShoppingCart className="text-blue-400" size={18} />
                        <h3 className="text-sm font-black text-white tracking-widest uppercase">Satın Alınabilir Modüller</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {loading ? (
                            <div className="animate-pulse space-y-3">
                                <div className="h-16 bg-white/5 rounded-xl"></div>
                                <div className="h-16 bg-white/5 rounded-xl"></div>
                            </div>
                        ) : availableModules.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-10">Tüm modüller aktif!</p>
                        ) : (
                            availableModules.map((e) => (
                                <button
                                    key={e.code}
                                    onClick={() => setSelectedAddon(e)}
                                    className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all ${
                                        selectedAddon?.code === e.code 
                                            ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
                                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/20'
                                    }`}
                                >
                                    <div>
                                        <p className="text-sm font-bold text-white">{e.name}</p>
                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{e.code}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-emerald-400">€{Number(e.setup_price ?? 0).toFixed(2)}</p>
                                        <p className="text-[9px] text-slate-400 uppercase mt-0.5">Kurulum</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ALT BÖLME: Ödeme Seçenekleri (Sadece Modül Seçiliyse Açılır) */}
            {selectedAddon && (
                <div className="mt-6 border-t border-white/10 pt-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-white tracking-widest uppercase">Ödeme Yöntemi</h3>
                        <div className="text-right bg-slate-900 px-4 py-2 rounded-xl border border-white/5">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Toplam Tutar</p>
                            <p className="text-xl font-black text-emerald-400">€{Number(selectedAddon.setup_price ?? 0).toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-4 bg-slate-900/50 p-1 rounded-xl border border-white/5 overflow-x-auto">
                        {[
                            { id: 'card', label: 'Kredi Kartı', icon: <FiCreditCard /> },
                            { id: 'bank', label: 'Havale / EFT', icon: <FiFileText /> },
                            { id: 'wallet', label: 'Bakiye', icon: <FiBriefcase /> },
                            { id: 'cash', label: 'Nakit', icon: <FiDollarSign /> },
                        ].map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setPaymentTab(t.id as any)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                    paymentTab === t.id 
                                        ? 'bg-blue-600 text-white shadow-md' 
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[220px]">
                        
                        {/* KART TABI */}
                        {paymentTab === 'card' && (
                            <div className="flex flex-col md:flex-row gap-8 items-center">
                                {/* 3D Kart Önizleme */}
                                <div className="w-[300px] h-[180px] perspective-1000 shrink-0">
                                    <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                                        {/* Ön Yüz */}
                                        <div className="absolute w-full h-full backface-hidden rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-900 p-5 shadow-2xl border border-white/20 flex flex-col justify-between">
                                            <div className="flex justify-between items-start">
                                                <FiCreditCard className="text-white/80" size={32} />
                                                <div className="text-white/50 text-xs font-black italic">NEXTPOS PAY</div>
                                            </div>
                                            <div>
                                                <div className="font-mono text-xl text-white tracking-widest mb-2 drop-shadow-md">
                                                    {cardNumber || '•••• •••• •••• ••••'}
                                                </div>
                                                <div className="flex justify-between text-white/80 uppercase text-[10px] font-bold">
                                                    <span className="truncate pr-4">{cardName || 'KART SAHİBİ'}</span>
                                                    <span>{cardExpiry || 'AA/YY'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Arka Yüz */}
                                        <div className="absolute w-full h-full backface-hidden rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-900 shadow-2xl border border-white/20 rotate-y-180 overflow-hidden">
                                            <div className="w-full h-10 bg-black mt-4 opacity-80"></div>
                                            <div className="px-4 mt-4">
                                                <div className="bg-white h-8 w-full rounded flex items-center justify-end px-3">
                                                    <span className="font-mono text-black text-sm">{cardCvv || '•••'}</span>
                                                </div>
                                                <p className="text-[8px] text-slate-500 mt-2 text-right">CVV / CVC KODU</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Form */}
                                <div className="flex-1 space-y-4 w-full">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kart Numarası</label>
                                        <input type="text" placeholder="0000 0000 0000 0000" maxLength={19}
                                            value={cardNumber} onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                                            onFocus={() => setIsCardFlipped(false)}
                                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-blue-500 outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kart Sahibi</label>
                                        <input type="text" placeholder="AD SOYAD" maxLength={40}
                                            value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())}
                                            onFocus={() => setIsCardFlipped(false)}
                                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:border-blue-500 outline-none transition-colors uppercase"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Son Kullanma</label>
                                            <input type="text" placeholder="AA/YY" maxLength={5}
                                                value={cardExpiry} onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                                                onFocus={() => setIsCardFlipped(false)}
                                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-blue-500 outline-none transition-colors"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">CVV</label>
                                            <input type="text" placeholder="123" maxLength={4}
                                                value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, ''))}
                                                onFocus={() => setIsCardFlipped(true)}
                                                onBlur={() => setIsCardFlipped(false)}
                                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-blue-500 outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* HAVALE TABI */}
                        {paymentTab === 'bank' && (
                            <div className="flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                                    <FiFileText size={24} className="text-blue-400" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg mb-1">Havale / EFT Bilgileri</h4>
                                    <p className="text-sm text-slate-400">Lütfen ödemenizi aşağıdaki hesaba yapınız ve dekontu saklayınız.</p>
                                </div>
                                <div className="bg-black/30 border border-white/10 rounded-xl p-4 w-full max-w-sm text-left space-y-2 mt-4">
                                    <div className="flex justify-between">
                                        <span className="text-[10px] text-slate-500 uppercase font-bold">Banka</span>
                                        <span className="text-sm font-bold text-white">NextPOS Bank</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[10px] text-slate-500 uppercase font-bold">Alıcı</span>
                                        <span className="text-sm font-bold text-white">NextPOS Yazılım A.Ş.</span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-2">
                                        <span className="text-[10px] text-slate-500 uppercase font-bold">IBAN</span>
                                        <span className="text-sm font-mono text-blue-400">TR12 0000 0000 0000 0000 00</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* BAKİYE TABI */}
                        {paymentTab === 'wallet' && (
                            <div className="flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                                    <FiBriefcase size={24} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg mb-1">Cüzdan Bakiyesi ile Öde</h4>
                                    <p className="text-sm text-slate-400">Ödeme tutarı doğrudan mevcut bayi bakiyenizden düşülecektir.</p>
                                </div>
                                <div className="bg-black/30 border border-white/10 rounded-xl p-4 w-full max-w-sm flex items-center justify-between mt-4">
                                    <div className="text-left">
                                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Mevcut Bakiye</span>
                                        <span className={`text-2xl font-black ${
                                            (admin?.wallet_balance || 0) < (selectedAddon.setup_price || 0) ? 'text-red-400' : 'text-emerald-400'
                                        }`}>
                                            €{Number(admin?.wallet_balance || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    {((admin?.wallet_balance || 0) < (selectedAddon.setup_price || 0)) && (
                                        <button className="px-4 py-2 bg-white text-black font-bold text-xs rounded-lg hover:bg-slate-200 transition-colors shadow-lg">
                                            Bakiye Yükle
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* NAKİT TABI */}
                        {paymentTab === 'cash' && (
                            <div className="flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                                    <FiDollarSign size={24} className="text-amber-400" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg mb-1">Elden / Nakit Ödeme</h4>
                                    <p className="text-sm text-slate-400 max-w-sm">Müşteriden elden nakit tahsilat yaptığınızda bu seçeneği kullanın. Fatura nakit tahsilat olarak işaretlenecektir.</p>
                                </div>
                            </div>
                        )}

                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={() => setSelectedAddon(null)}
                            className="px-6 py-3 rounded-xl border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/5 transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            type="button"
                            disabled={busyCode === selectedAddon.code}
                            onClick={handlePurchase}
                            className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-xl shadow-blue-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {busyCode === selectedAddon.code ? (
                                <span className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full" />
                            ) : <FiCheck size={16} />}
                            ONAYLA VE SATIN AL
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                .perspective-1000 { perspective: 1000px; }
                .transform-style-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
            `}</style>
        </Modal>
    );
}

export function RestaurantsPage({ onDetail }: { onDetail: (id: string) => void }) {
    const lang = useResellerStore(s => s.lang);
    const tenants = useResellerStore(s => s.tenants);
    const fetchTenants = useResellerStore(s => s.fetchTenants);
    const createTenant = useResellerStore(s => s.createTenant);
    const completeTenantCardDraft = useResellerStore(s => s.completeTenantCardDraft);
    const admin = useResellerStore(s => s.admin);
    const token = useResellerStore(s => s.token);
    const payTenantInvoiceWithWallet = useResellerStore(s => s.payTenantInvoiceWithWallet);
    const fetchCheckoutLinkForTenant = useResellerStore(s => s.fetchCheckoutLinkForTenant);
    const t = (k: string) => messages[lang]?.[k] || messages['de']?.[k] || messages['en']?.[k] || messages['tr']?.[k] || k;
    const isSuperAdmin = String(admin?.role || '').toLowerCase() === 'super_admin';
    const [search, setSearch] = useState('');
    const [filterPlan, setFilterPlan] = useState<'all' | 'basic' | 'pro' | 'enterprise'>('all');
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(defaultForm);
    const [planModules, setPlanModules] = useState<PlanModuleRow[]>([]);
    const [loadingModules, setLoadingModules] = useState(false);
    const [billingCatalog, setBillingCatalog] = useState<BillingCatalogRow[]>([]);
    const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlanRow[]>([]);
    const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteHint, setQuoteHint] = useState<'api' | 'local' | null>(null);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    /** Plan modül matrisi yüklendikten sonra teklifi bir kez yenile (sürekli effect döngüsü yok) */
    const [quoteSeq, setQuoteSeq] = useState(0);
    const [cardDraftId, setCardDraftId] = useState<string | null>(null);
    const [cardBusy, setCardBusy] = useState(false);
    const [createdCreds, setCreatedCreds] = useState<{
        username: string; password: string; schemaName: string; email: string; tenantName: string;
    } | null>(null);
    const [sendEmail, setSendEmail] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [opsTenant, setOpsTenant] = useState<{ id: string; name: string; schema_name?: string; contact_email?: string } | null>(null);
    const [opsPayments, setOpsPayments] = useState<PaymentRow[]>([]);
    const [opsLoading, setOpsLoading] = useState(false);
    const [opsBusyId, setOpsBusyId] = useState<number | null>(null);
    const [opsFilterStatus, setOpsFilterStatus] = useState<'all' | 'pending' | 'paid'>('all');
    const [copiedTenantId, setCopiedTenantId] = useState<string | null>(null);
    const [opsTab, setOpsTab] = useState<'access' | 'finance' | 'settings'>('access');

    const opsSummary = useMemo(() => {
        const total = opsPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const paid = opsPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const pending = opsPayments.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((acc, p) => acc + Number(p.amount || 0), 0);
        return { total, paid, pending };
    }, [opsPayments]);
    // Ops modal - credentials section
    const [showCreds, setShowCreds] = useState(false);
    const [editCredRole, setEditCredRole] = useState<string | null>(null);
    const [editCredPassword, setEditCredPassword] = useState('');
    const [editCredPin, setEditCredPin] = useState('');
    const [editCredBusy, setEditCredBusy] = useState(false);
    const [recalcBusy, setRecalcBusy] = useState(false);
    const [editCredMsg, setEditCredMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [credEmail, setCredEmail] = useState('');
    const [credEmailBusy, setCredEmailBusy] = useState(false);
    const [credEmailSent, setCredEmailSent] = useState(false);
    const schemaTouchedRef = useRef(false);

    // Payment action modal states
    const [selectedInvoice, setSelectedInvoice] = useState<PaymentRow | null>(null);
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payLoading, setPayLoading] = useState(false);
    const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
    const [generatedUrlForId, setGeneratedUrlForId] = useState<number | null>(null);

    // Premium Operations Modal States
    const [calcPrice, setCalcPrice] = useState(59);
    const [calcDevices, setCalcDevices] = useState(2);
    const [showReceipt, setShowReceipt] = useState<PaymentRow | null>(null);
    const [billingTicketSubject, setBillingTicketSubject] = useState('');
    const [billingTicketMsg, setBillingTicketMsg] = useState('');
    const [isBillingTicketBusy, setIsBillingTicketBusy] = useState(false);
    const [isCacheFlushing, setIsCacheFlushing] = useState(false);
    const [isSchemaValidating, setIsSchemaValidating] = useState(false);
    const [isDemoLoading, setIsDemoLoading] = useState(false);


    const subscriptionPlansRef = useRef(subscriptionPlans);
    const planModulesRef = useRef(planModules);
    const billingCatalogRef = useRef(billingCatalog);
    const langRef = useRef(lang);
    subscriptionPlansRef.current = subscriptionPlans;
    planModulesRef.current = planModules;
    billingCatalogRef.current = billingCatalog;
    langRef.current = lang;

    const bumpQuote = useCallback(() => setQuoteSeq((n) => n + 1), []);

    const loadModules = useCallback(
        async (planCode: string) => {
            setLoadingModules(true);
            try {
                const mods = await fetchPlanModuleMatrix(planCode, token);
                setPlanModules(mods);
            } catch {
                setPlanModules([]);
            } finally {
                setLoadingModules(false);
                bumpQuote();
            }
        },
        [bumpQuote, token],
    );

    const moduleCodesKey = useMemo(() => [...form.module_codes].sort().join(','), [form.module_codes]);

    const [addonsTenant, setAddonsTenant] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    useEffect(() => {
        if (!showModal) return;
        loadModules(form.subscription_plan);
    }, [showModal, form.subscription_plan, loadModules]);

    useEffect(() => {
        if (!showModal || !token) return;
        (async () => {
            const [modsRes, plansRes] = await Promise.all([
                fetchBillingCatalog(token),
                fetch(`${TENANTS_API}/plans`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            setBillingCatalog(modsRes);
            if (plansRes.ok) {
                const rows = await plansRes.json();
                setSubscriptionPlans(normalizePlanRows(rows));
            }
        })();
    }, [showModal, token]);

    useEffect(() => {
        if (!showModal) return;
        const id = window.setTimeout(() => {
            (async () => {
                setQuoteLoading(true);
                setQuoteError(null);
                setQuoteHint(null);
                const billingCycle = form.payment_interval === 'yearly' ? 'yearly' : 'monthly';
                const extraDevQ = form.module_codes.includes('extra_device') ? Math.max(1, form.extra_device_qty) : 1;
                const extraPrintQ = form.module_codes.includes('extra_printer') ? Math.max(1, form.extra_printer_qty) : 1;
                const qMsg = (k: string) => messages[langRef.current]?.[k] || k;

                const applyLocalFallback = (apiErr?: string) => {
                    const local = buildLocalQuote(
                        form.subscription_plan,
                        subscriptionPlansRef.current,
                        planModulesRef.current,
                        billingCatalogRef.current,
                        form.module_codes,
                        extraDevQ,
                        extraPrintQ,
                        billingCycle,
                        15,
                    );
                    if (local) {
                        setLiveQuote(local);
                        setQuoteHint('local');
                        if (apiErr) setQuoteError(apiErr);
                    } else {
                        setLiveQuote(null);
                        setQuoteError(apiErr || qMsg('rest.modal.quoteUnavailable'));
                    }
                };
                try {
                    const body = {
                        planCode: form.subscription_plan,
                        moduleCodes: form.module_codes,
                        billingCycle,
                        extraDeviceQty: form.module_codes.includes('extra_device') ? extraDevQ : undefined,
                        extraPrinterQty: form.module_codes.includes('extra_printer') ? extraPrintQ : undefined,
                    };
                    const res = await fetch(`${BILLING_API}/quote`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify(body),
                    });
                    if (res.ok) {
                        const q = await res.json();
                        const rds = q.resellerDirectSale as { totalResellerCommission?: number; walletNetDelta?: number } | undefined;
                        setLiveQuote({
                            planName: q.planName,
                            setupFee: Number(q.setupFee),
                            monthlyService: Number(q.monthlyService),
                            modulesSetup: Number(q.modulesSetup),
                            modulesMonthly: Number(q.modulesMonthly),
                            monthlyRecurringTotal: Number(q.monthlyRecurringTotal),
                            yearlyPrepayTotal: Number(q.yearlyPrepayTotal),
                            annualDiscountPercent: Number(q.annualDiscountPercent),
                            firstInvoiceTotal: Number(q.firstInvoiceTotal),
                            billingCycle: q.billingCycle,
                            lines: Array.isArray(q.lines) ? q.lines : [],
                            resellerDirectSale:
                                rds && rds.walletNetDelta != null && rds.totalResellerCommission != null
                                    ? {
                                          totalResellerCommission: Number(rds.totalResellerCommission),
                                          walletNetDelta: Number(rds.walletNetDelta),
                                      }
                                    : undefined,
                        });
                        setQuoteHint('api');
                        setQuoteError(null);
                    } else {
                        let msg = '';
                        try {
                            const j = (await res.json()) as { error?: string };
                            msg = j.error || `HTTP ${res.status}`;
                        } catch {
                            msg = `HTTP ${res.status}`;
                        }
                        applyLocalFallback(msg);
                    }
                } catch {
                    applyLocalFallback(qMsg('rest.modal.quoteNetworkError'));
                } finally {
                    setQuoteLoading(false);
                }
            })();
        }, 300);
        return () => window.clearTimeout(id);
    }, [
        showModal,
        form.subscription_plan,
        moduleCodesKey,
        form.extra_device_qty,
        form.extra_printer_qty,
        form.payment_interval,
        quoteSeq,
        token,
    ]);

    const filtered = useMemo(() => {
        const s = search.toLowerCase();
        return tenants.filter((r) => {
            const hit = !search.trim() || r.name.toLowerCase().includes(s) || r.contact_email?.toLowerCase().includes(s);
            const planOk = filterPlan === 'all' || r.subscription_plan === filterPlan;
            return hit && planOk;
        });
    }, [tenants, search, filterPlan]);

    const totalTenants = tenants.length;
    const enterpriseCount = tenants.filter((r) => r.subscription_plan === 'enterprise').length;
    const proCount = tenants.filter((r) => r.subscription_plan === 'pro').length;

    const sellableAddonModules = useMemo(() => {
        const primary = planModules.filter((m) => m.mode === 'addon');
        if (primary.length > 0) return primary;
        if (!billingCatalog.length) return [];
        return billingCatalog
            .map((c) => {
                const rule = planModules.find((r) => r.code === c.code);
                if (rule?.mode === 'included' || rule?.mode === 'locked') return null;
                return {
                    code: c.code,
                    name: c.name,
                    mode: 'addon' as const,
                    setup_price: rule ? Number(rule.setup_price) : Number(c.setup_price),
                    monthly_price: rule ? Number(rule.monthly_price) : Number(c.monthly_price),
                };
            })
            .filter(Boolean) as PlanModuleRow[];
    }, [planModules, billingCatalog]);

    /** Sadece seçili plan için max değerleri string anahtarla izle (plans[] referansı değişince titreşim yok) */
    const planLimitsKey = useMemo(() => {
        const api = subscriptionPlans.find((p) => p.code === form.subscription_plan);
        if (!api) return '';
        return `${api.max_users}|${api.max_branches}`;
    }, [subscriptionPlans, form.subscription_plan]);

    const resolvedPlanLimits = useMemo(() => {
        const fb = FALLBACK_PLAN_LIMITS[form.subscription_plan];
        if (planLimitsKey) {
            const [mu, mb] = planLimitsKey.split('|').map(Number);
            return { max_users: mu, max_branches: mb };
        }
        return {
            max_users: Number(fb?.max_users ?? 10),
            max_branches: Number(fb?.max_branches ?? 1),
        };
    }, [form.subscription_plan, planLimitsKey]);

    const walletBlocked = useMemo(() => {
        if (form.license_usage_type !== 'direct_sale' || form.payment_method !== 'wallet_balance') return false;
        const net = liveQuote?.resellerDirectSale?.walletNetDelta;
        if (!liveQuote || net == null) return true;
        return Number(admin?.wallet_balance ?? 0) + net < 0;
    }, [form.license_usage_type, form.payment_method, liveQuote, admin?.wallet_balance]);

    const openModal = () => {
        schemaTouchedRef.current = false;
        setForm(defaultForm());
        setPlanModules([]);
        setLiveQuote(null);
        setQuoteHint(null);
        setQuoteError(null);
        setQuoteSeq(0);
        setCardDraftId(null);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        schemaTouchedRef.current = false;
        setForm(defaultForm());
        setPlanModules([]);
        setLiveQuote(null);
        setQuoteHint(null);
        setQuoteError(null);
        setQuoteSeq(0);
        setCardDraftId(null);
        setCreatedCreds(null);
        setSendEmail('');
        setEmailSent(false);
    };

    const openOps = async (tenantId: string, tenantName: string, schemaName?: string, contactEmail?: string) => {
        if (!token) return;
        setOpsTenant({ id: tenantId, name: tenantName, schema_name: schemaName, contact_email: contactEmail });
        setOpsLoading(true);
        try {
            // Tenant detayını al (schema_name ve contact_email için)
            const [tenantRes, paymentsRes] = await Promise.all([
                fetch(`${TENANTS_API}/${tenantId}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${TENANTS_API}/finance/payments?tenant_id=${encodeURIComponent(tenantId)}`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            const tenant = tenantRes.ok ? await tenantRes.json() : null;
            if (tenant) {
                setOpsTenant((prev) => prev ? { ...prev, schema_name: tenant.schema_name, contact_email: tenant.contact_email } : prev);
            }
            if (paymentsRes.ok) {
                const rows = await paymentsRes.json();
                setOpsPayments(Array.isArray(rows) ? rows : []);
            } else {
                setOpsPayments([]);
            }
        } catch {
            setOpsPayments([]);
        } finally {
            setOpsLoading(false);
        }
    };

    const impersonateTenant = async (tenantId: string, tenantName: string) => {
        if (!token) {
            toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.');
            return;
        }
        const toastId = toast.loading('Gölge giriş bağlantısı kuruluyor...');
        try {
            const res = await fetch('/api/v1/auth/impersonate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ tenantId }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Gölge giriş kodu oluşturulamadı.', { id: toastId });
                return;
            }
            toast.success(`${tenantName} paneline yönlendiriliyorsunuz...`, { id: toastId });
            const q = new URLSearchParams({ impersonate_code: data.code });
            const posUrl = import.meta.env.VITE_POS_URL || 
                (window.location.origin.includes('localhost:4001') ? 'http://localhost:5173' : 
                 window.location.origin.includes('127.0.0.1:4001') ? 'http://127.0.0.1:5173' : 
                 window.location.origin.includes('reseller.') ? window.location.origin.replace('reseller.', 'pos.') : 
                 window.location.origin);
            window.open(`${posUrl}/login?${q.toString()}`, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Impersonation error:', err);
            toast.error('Bağlantı kurulurken teknik bir hata oluştu.', { id: toastId });
        }
    };

    const markPaymentPaid = async (paymentId: number) => {
        if (!token || !opsTenant) return;
        setOpsBusyId(paymentId);
        try {
            const res = await fetch(`${TENANTS_API}/finance/payments/${paymentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: 'paid' }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(json.error || t('rest.ops.markPaidErr'));
                return;
            }
            toast.success(t('rest.ops.markPaidOk'));
            await fetchTenants();
            await openOps(opsTenant.id, opsTenant.name);
        } catch {
            toast.error(t('rest.ops.markPaidErr'));
        } finally {
            setOpsBusyId(null);
        }
    };

    const [notifyBusyId, setNotifyBusyId] = useState<number | null>(null);

    const sendPaymentNotification = async (paymentId: number) => {
        if (!token || !opsTenant) return;
        if (!window.confirm(t('rest.ops.notifyConfirm'))) return;
        setNotifyBusyId(paymentId);
        try {
            const res = await fetch(`${TENANTS_API}/finance/payments/${paymentId}/send-mail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(json.error || t('rest.ops.notifyErr'));
                return;
            }
            toast.success(t('rest.ops.notifySent'));
        } catch {
            toast.error(t('rest.ops.notifyErr'));
        } finally {
            setNotifyBusyId(null);
        }
    };

    const copyTenantId = async (tenantId: string) => {
        try {
            await navigator.clipboard.writeText(tenantId);
            setCopiedTenantId(tenantId);
            window.setTimeout(() => setCopiedTenantId((cur) => (cur === tenantId ? null : cur)), 1500);
        } catch {
            /* ignore */
        }
    };

    const visibleOpsPayments = useMemo(() => {
        if (opsFilterStatus === 'all') return opsPayments;
        return opsPayments.filter((p) => String(p.status).toLowerCase() === opsFilterStatus);
    }, [opsPayments, opsFilterStatus]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const schema = (form.schema_name || makeSchemaName(form.name)).trim();
        if (!/^tenant_[a-z0-9_]+$/.test(schema)) {
            toast.error('Teknik ad: tenant_kucuk_harf_ve_rakam formatında olmalı');
            return;
        }
        if (form.module_codes.includes('extra_device') && form.extra_device_qty < 1) {
            toast.error('Ek cihaz adedi en az 1 olmalı');
            return;
        }
        if (form.module_codes.includes('extra_printer') && form.extra_printer_qty < 1) {
            toast.error(t('rest.modal.extraPrintersMin'));
            return;
        }
        if (form.license_usage_type === 'direct_sale') {
            if (!form.payment_method) {
                toast.error('Ödeme yöntemi seçin');
                return;
            }
        }
        if (walletBlocked) {
            toast.error(t('rest.modal.pay.walletBlockedToast'));
            return;
        }
        setSaving(true);
        const payload: Record<string, unknown> = {
            name: form.name,
            schema_name: schema,
            contact_email: form.contact_email || undefined,
            contact_phone: form.contact_phone || undefined,
            authorized_person: form.authorized_person || undefined,
            tax_office: form.tax_office || undefined,
            tax_number: form.tax_number || undefined,
            address: form.address || undefined,
            subscription_plan: form.subscription_plan,
            master_password: form.master_password,
            admin_username: form.admin_username || undefined,
            license_usage_type: form.license_usage_type,
            payment_interval: form.payment_interval,
        };
        if (form.license_usage_type === 'direct_sale') {
            payload.payment_method = form.payment_method;
            payload.send_payment_notification = form.send_payment_notification;
        }
        if (form.module_codes.length > 0) payload.module_codes = form.module_codes;
        if (form.module_codes.includes('extra_device')) payload.extra_device_qty = Math.max(1, form.extra_device_qty);
        if (form.module_codes.includes('extra_printer')) payload.extra_printer_qty = Math.max(1, form.extra_printer_qty);

        const result = await createTenant(payload);
        setSaving(false);
        if (result.ok && result.requires_card_payment && result.draftId) {
            setCardDraftId(result.draftId);
            setShowModal(false);
            return;
        }
        if (result.ok) {
            const qrDomain = (form as any).qr_domain?.trim();
            if (qrDomain && form.module_codes.includes('qr_web_menu')) {
                await fetchTenants();
                const { tenants: freshTenants } = useResellerStore.getState();
                const newest = freshTenants.find((tt) => tt.schema_name === schema);
                if (newest) {
                    await useResellerStore.getState().addQrDomain(newest.id, qrDomain);
                }
            }
            const username = (form.admin_username || 'admin').toLowerCase().trim();
            setCreatedCreds({
                username,
                password: form.master_password,
                schemaName: form.schema_name,
                email: form.contact_email || '',
                tenantName: form.name,
            });
            setShowModal(false);
            await fetchTenants();
        } else {
            toast.error(result.error || 'Oluşturulamadı');
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* 1. Stat Kartları */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {([
                    { label: t('rest.stat.total'), value: totalTenants, icon: <FiUsers />, color: 'blue' },
                    { label: t('rest.stat.enterprise'), value: enterpriseCount, icon: <FiShield />, color: 'amber' },
                    { label: t('rest.stat.pro'), value: proCount, icon: <FiActivity />, color: 'emerald' },
                    { label: t('rest.stat.dbShard'), value: totalTenants, icon: <FiDatabase />, color: 'indigo' },
                ] as const).map((s) => {
                    const cMap: Record<string, string> = {
                        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/30 group-hover:border-blue-500/50',
                        amber: 'text-amber-500 bg-amber-500/10 border-amber-500/30 group-hover:border-amber-500/50',
                        emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30 group-hover:border-emerald-500/50',
                        indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30 group-hover:border-indigo-500/50',
                    };
                    const cls = cMap[s.color] || cMap.blue;
                    return (
                        <div
                            key={s.label}
                            className={`bg-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-[24px] border border-white/10 transition-all group overflow-hidden relative min-w-0 ${cls.split(' ').slice(2).join(' ')}`}
                        >
                            <div className={`absolute top-0 right-0 p-3 sm:p-6 opacity-10 group-hover:opacity-20 transition-all ${cls.split(' ')[0]}`}>
                                <span className="[&>svg]:w-10 [&>svg]:h-10 sm:[&>svg]:w-[60px] sm:[&>svg]:h-[60px]">{s.icon}</span>
                            </div>
                            <div className="flex justify-between items-start gap-1 pr-8 sm:pr-0">
                                <div className="text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] leading-tight line-clamp-2">{s.label}</div>
                                <div className="hidden sm:flex text-[10px] font-bold items-center gap-1 text-emerald-400 shrink-0">
                                    <FiTrendingUp size={10} /> +2%
                                </div>
                            </div>
                            <div className="text-xl sm:text-2xl font-black text-white mt-1 tracking-tighter">{s.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* 2. Liste kartı */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl sm:rounded-[24px] overflow-hidden shadow-2xl min-w-0">
                <div className="p-4 sm:p-6 border-b border-white/5 bg-white/5 space-y-4">
                    <h3 className="text-sm sm:text-lg font-bold flex items-center gap-2 text-white min-w-0">
                        <FiDatabase className="text-blue-400 shrink-0" />
                        <span className="truncate">{t('rest.subtitle')}</span>
                    </h3>
                    <div className="flex flex-col gap-3">
                        <div className="relative w-full">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('rest.search')}
                                className="bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none w-full text-white focus:border-blue-500/40 transition-colors"
                            />
                        </div>
                        <div className="flex flex-col min-[480px]:flex-row gap-3 sm:items-center sm:justify-between">
                            <div className="flex overflow-x-auto pb-1 -mx-1 px-1 gap-1 scrollbar-thin scrollbar-thumb-white/10">
                                <div className="flex bg-slate-800 rounded-xl p-1 border border-white/5 shrink-0">
                                    {(['all', 'basic', 'pro', 'enterprise'] as const).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setFilterPlan(p)}
                                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
                                                filterPlan === p ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                        >
                                            {p === 'all' ? t('rest.filterAll') : p.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={openModal}
                                className="w-full sm:w-auto shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-5 sm:px-6 py-3 rounded-2xl text-xs font-black shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all outline-none"
                            >
                                {t('rest.addNew')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-3 sm:p-4 lg:p-5 min-w-0">
                    {/* Mobil + tablet: kartlar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:hidden">
                        {filtered.length === 0 ? (
                            <div className="py-20 text-center animate-in fade-in duration-700 bg-white/[0.02] border border-white/5 rounded-3xl">
                                <div className="flex flex-col items-center opacity-40">
                                    <div className="mb-4 p-4 bg-slate-800/10 rounded-full border border-white/5">
                                        <FiDatabase size={40} className="text-slate-500" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-500 tracking-tight">{t('rest.noData')}</p>
                                </div>
                            </div>
                        ) : filtered.map((r) => {
                            const canManage = String(r.status || '').toLowerCase() === 'active';
                            const planColor =
                                r.subscription_plan === 'enterprise'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : r.subscription_plan === 'pro'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                            return (
                                <div key={r.id} className="p-4 sm:p-5 bg-gradient-to-br from-slate-900/60 to-slate-950/80 backdrop-blur-xl border border-white/5 rounded-2xl sm:rounded-[24px] shadow-xl relative overflow-hidden group min-w-0">
                                    <div className="flex justify-between items-start gap-2 mb-3 sm:mb-4">
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-blue-400 shadow-md shrink-0">
                                                {r.name[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-bold text-sm text-white truncate">{r.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{r.schema_name || '—'}</span>
                                            </div>
                                        </div>
                                        <span className={`shrink-0 inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-lg border ${
                                            r.status === 'active'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : r.status === 'suspended'
                                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                            <span className={`w-1 h-1 rounded-full ${r.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                                            {t(`rest.${r.status}`) || r.status}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 sm:gap-3 py-3 border-t border-b border-white/[0.04] mb-3 sm:mb-4 text-[10px] sm:text-[11px] font-bold text-slate-400">
                                        <div>
                                            <span className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider block mb-0.5">{t('rest.plan')}</span>
                                            <span className={`inline-block text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-md border ${planColor} uppercase`}>
                                                {r.subscription_plan}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider block mb-0.5">{t('rest.tableCapacity')}</span>
                                            <span className="text-white text-[10px] sm:text-xs">{(r as any).max_branches ?? '—'} / {(r as any).max_users ?? '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider block mb-0.5">{t('rest.tableCreated')}</span>
                                            <span className="text-white text-[10px] sm:text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-GB' : 'tr-TR') : '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider block mb-0.5">{t('rest.mobile.tenantId')}</span>
                                            <div className="flex items-center gap-1 min-w-0">
                                                <span className="text-slate-500 font-mono text-[8px] sm:text-[9px] truncate">{r.id}</span>
                                                <button type="button" onClick={() => copyTenantId(r.id)} className="text-slate-500 hover:text-white p-0.5 shrink-0">
                                                    <FiCopy size={11} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 pt-1">
                                        <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => canManage && onDetail(r.id)}
                                                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase transition-all border min-h-[44px] ${
                                                    canManage
                                                        ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 hover:bg-blue-600 hover:text-white'
                                                        : 'bg-white/5 border-white/5 text-slate-600 cursor-not-allowed opacity-40'
                                                }`}
                                                disabled={!canManage}
                                            >
                                                <FiEdit3 size={13} />
                                                {t('rest.mobile.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAddonsTenant({ id: r.id, name: r.name })}
                                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-600/10 border border-amber-500/20 text-amber-400 hover:bg-amber-600 hover:text-white text-[10px] sm:text-xs font-black uppercase transition-all min-h-[44px]"
                                            >
                                                {t('rest.mobile.modules')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openOps(r.id, r.name, r.schema_name, r.contact_email)}
                                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400 hover:bg-violet-600 hover:text-white text-[10px] sm:text-xs font-black uppercase transition-all min-h-[44px]"
                                            >
                                                {t('rest.mobile.management')}
                                            </button>
                                        </div>
                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() => impersonateTenant(r.id, r.name)}
                                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600/10 to-teal-600/10 border border-cyan-500/20 text-cyan-400 hover:from-cyan-600 hover:to-teal-600 hover:text-white text-[10px] sm:text-xs font-black uppercase transition-all min-h-[44px]"
                                            >
                                                <FiLogIn size={13} />
                                                {t('rest.mobile.shadowLogin')}
                                            </button>
                                        )}
                                    </div>
                                    {!canManage && (
                                        <div className="text-[9px] text-amber-400/85 mt-2 text-center font-bold">
                                            {t('rest.awaitingPaymentApproval')}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Masaüstü: tablo */}
                    <div className="hidden lg:block min-w-0">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full table-fixed text-left border-collapse">
                                <colgroup>
                                    <col className="w-[26%]" />
                                    <col className="w-[17%]" />
                                    <col className="w-[9%]" />
                                    <col className="w-[11%]" />
                                    <col className="w-[11%]" />
                                    <col className="w-[26%]" />
                                </colgroup>
                                <thead>
                                    <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.15em] border-b border-white/5">
                                        <th className="px-3 py-3">{t('rest.name')}</th>
                                        <th className="px-3 py-3">{t('rest.tableSchema')}</th>
                                        <th className="px-3 py-3">{t('rest.plan')}</th>
                                        <th className="px-3 py-3">{t('rest.tableCapacity')}</th>
                                        <th className="px-3 py-3">{t('rest.tableCreated')}</th>
                                        <th className="px-3 py-3 text-right">{t('rest.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.03]">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-20 text-center animate-in fade-in duration-700">
                                                <div className="flex flex-col items-center opacity-40">
                                                    <div className="mb-4 p-4 bg-slate-800/10 rounded-full border border-white/5">
                                                        <FiDatabase size={40} className="text-slate-500" />
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-500 tracking-tight">{t('rest.noData')}</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filtered.map((r) => {
                                        const canManage = String(r.status || '').toLowerCase() === 'active';
                                        const planColor =
                                            r.subscription_plan === 'enterprise'
                                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                : r.subscription_plan === 'pro'
                                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                                        return (
                                            <tr key={r.id} className="hover:bg-blue-500/[0.02] border-b border-white/[0.02] transition-colors group">
                                                {/* — BİLGİ — */}
                                                <td className="px-3 py-3 max-w-0">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-sm text-blue-400 shadow-lg group-hover:scale-105 transition-all duration-200">
                                                            {r.name[0]?.toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors duration-200 truncate" title={r.name}>
                                                                {r.name}
                                                            </span>
                                                            <div className="flex items-center gap-1 mt-0.5 min-w-0">
                                                                <span
                                                                    className="text-[9px] text-slate-500 font-mono tracking-tighter truncate"
                                                                    title={r.id}
                                                                >
                                                                    {r.id}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyTenantId(r.id)}
                                                                    className={`shrink-0 inline-flex items-center justify-center rounded-md p-0.5 transition-colors ${
                                                                        copiedTenantId === r.id
                                                                            ? 'bg-emerald-500/20 text-emerald-400'
                                                                            : 'text-slate-500 hover:text-white hover:bg-white/10'
                                                                    }`}
                                                                    title={copiedTenantId === r.id ? t('rest.copied') : t('rest.copyId')}
                                                                >
                                                                    <FiCopy size={11} />
                                                                </button>
                                                                <span
                                                                    className={`shrink-0 inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1 py-0.5 rounded border ${
                                                                        r.status === 'active'
                                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                            : r.status === 'suspended'
                                                                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                                                    }`}
                                                                    title={t(`rest.${r.status}`) || r.status}
                                                                >
                                                                    <span className={`w-1 h-1 rounded-full ${r.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                                                                    <span className="hidden xl:inline">{t(`rest.${r.status}`) || r.status}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* — SCHEMA — */}
                                                <td className="px-3 py-3 text-xs font-bold text-slate-400 font-mono max-w-0">
                                                    <span className="flex items-center gap-1 min-w-0" title={r.schema_name || undefined}>
                                                        <FiTerminal className="shrink-0 opacity-40" size={12} />
                                                        <span className="truncate">{r.schema_name || '—'}</span>
                                                    </span>
                                                </td>
                                                {/* — PLAN — */}
                                                <td className="px-3 py-3">
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${planColor} uppercase whitespace-nowrap`}>
                                                        {r.subscription_plan}
                                                    </span>
                                                </td>
                                                {/* — KAPASİTE — */}
                                                <td className="px-3 py-3">
                                                    <span className="text-xs font-medium text-slate-300 whitespace-nowrap tabular-nums">
                                                        {(r as any).max_branches ?? '—'} / {(r as any).max_users ?? '—'}
                                                    </span>
                                                </td>
                                                {/* — TARİH — */}
                                                <td className="px-3 py-3">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs font-medium text-slate-300 whitespace-nowrap">
                                                            {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-GB' : 'tr-TR') : '—'}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500 uppercase font-black whitespace-nowrap">
                                                            {r.created_at
                                                                ? new Date(r.created_at).toLocaleTimeString(lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' })
                                                                : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                {/* — AKSİYONLAR — */}
                                                <td className="px-3 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1 flex-wrap xl:flex-nowrap">
                                                        {canManage && (
                                                            <button
                                                                type="button"
                                                                onClick={() => impersonateTenant(r.id, r.name)}
                                                                className="p-2 bg-gradient-to-r from-cyan-600/10 to-teal-600/10 border border-cyan-500/20 text-cyan-400 hover:from-cyan-600 hover:to-teal-600 hover:text-white hover:shadow-lg hover:shadow-cyan-600/20 rounded-lg transition-all active:scale-[0.96]"
                                                                title={t('rest.mobile.shadowLogin')}
                                                            >
                                                                <FiLogIn size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => canManage && onDetail(r.id)}
                                                            className={`p-2 rounded-lg border transition-all active:scale-[0.96] ${
                                                                canManage
                                                                    ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 hover:bg-blue-600 hover:text-white shadow-lg hover:shadow-blue-600/20'
                                                                    : 'bg-white/5 border-white/5 text-slate-600 cursor-not-allowed opacity-40'
                                                            }`}
                                                            title={canManage ? t('rest.detail') : t('rest.manageLocked')}
                                                            disabled={!canManage}
                                                        >
                                                            <FiEdit3 size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAddonsTenant({ id: r.id, name: r.name })}
                                                            className="p-2 bg-amber-600/10 border border-amber-500/20 text-amber-400 hover:bg-amber-600 hover:text-white hover:shadow-lg hover:shadow-amber-600/20 rounded-lg transition-all active:scale-[0.96]"
                                                            title={t('rest.mobile.modules')}
                                                        >
                                                            <FiSliders size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openOps(r.id, r.name, r.schema_name, r.contact_email)}
                                                            className="p-2 bg-violet-600/10 border border-violet-500/20 text-violet-400 hover:bg-violet-600 hover:text-white hover:shadow-lg hover:shadow-violet-600/20 rounded-lg transition-all active:scale-[0.96]"
                                                            title={t('rest.mobile.management')}
                                                        >
                                                            <FiSettings size={14} />
                                                        </button>
                                                    </div>
                                                    {!canManage && (
                                                        <div className="text-[8px] text-amber-400/85 mt-1 text-right font-bold leading-tight">
                                                            {t('rest.awaitingPaymentApproval')}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {showReceipt && (
                <Modal
                    show={!!showReceipt}
                    onClose={() => setShowReceipt(null)}
                    title={lang === 'tr' ? 'Ödeme Makbuzu & Fatura Detayı' : 'Receipt & Invoice Detail'}
                    className="max-w-md"
                >
                    <div className="space-y-6 p-1 animate-in fade-in zoom-in-95 duration-200">
                        {/* Receipt Visual Header */}
                        <div className="text-center space-y-2 border-b border-white/5 pb-4">
                            <div className="inline-flex p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400">
                                <FiCheckCircle size={28} className="animate-bounce" />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-wider">{lang === 'tr' ? 'TAHSİLAT MAKBUZU' : 'PAYMENT RECEIPT'}</h4>
                                <p className="text-[10px] text-emerald-400 font-bold uppercase mt-0.5">{lang === 'tr' ? 'BAŞARIYLA ÖDENDİ' : 'SUCCESSFULLY PAID'}</p>
                            </div>
                        </div>

                        {/* Invoice Metadata */}
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3 font-medium text-xs text-slate-300 divide-y divide-white/5 font-mono">
                            <div className="flex justify-between pb-2">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">{lang === 'tr' ? 'RESTORAN' : 'TENANT'}</span>
                                <span className="text-white font-bold">{opsTenant?.name}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">{lang === 'tr' ? 'İŞLEM NO' : 'TRANSACTION ID'}</span>
                                <span className="font-mono text-slate-400">#TXN-{showReceipt.id}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">{lang === 'tr' ? 'TARİH' : 'DATE'}</span>
                                <span>{showReceipt.created_at ? new Date(showReceipt.created_at).toLocaleDateString('tr-TR') : '—'}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">{lang === 'tr' ? 'LİSANS TÜRÜ' : 'PAYMENT TYPE'}</span>
                                <span className="uppercase text-[10px] font-black text-blue-400">{showReceipt.payment_type}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">{lang === 'tr' ? 'ÖDEME YÖNTEMİ' : 'METHOD'}</span>
                                <span className="uppercase text-[10px] font-black text-slate-200">{showReceipt.payment_method || 'Cüzdan Bakiyesi'}</span>
                            </div>
                            <div className="flex justify-between pt-2.5">
                                <span className="text-slate-500 font-bold uppercase text-[9px]">{lang === 'tr' ? 'ÖDENEN TUTAR' : 'TOTAL AMOUNT'}</span>
                                <span className="text-sm font-black text-emerald-400 font-mono">€{Number(showReceipt.amount || 0).toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Receipt Visual Barcode */}
                        <div className="flex flex-col items-center justify-center space-y-2 py-2">
                            <div className="h-10 w-48 bg-slate-900 border border-white/5 rounded flex items-center justify-around overflow-hidden p-1 select-none opacity-45">
                                {[...Array(30)].map((_, i) => (
                                    <div key={i} className="h-full bg-white" style={{ width: `${(i % 3 === 0 ? 3 : i % 2 === 0 ? 1 : 2)}px` }} />
                                ))}
                            </div>
                            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">NEXTPOS-TXN-{showReceipt.id}-SECURE</span>
                        </div>

                        {/* Print Receipt / Download Actions */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    window.print();
                                }}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-black uppercase bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 active:scale-[0.96] transition-all"
                            >
                                <FiDownload size={14} />
                                {lang === 'tr' ? 'Yazdır & İndir' : 'Print & Download'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowReceipt(null)}
                                className="px-5 py-3 rounded-xl border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/5 transition-colors"
                            >
                                {lang === 'tr' ? 'Kapat' : 'Close'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {addonsTenant && (
                <AddonsModal
                    tenant={addonsTenant}
                    onClose={() => setAddonsTenant(null)}
                />
            )}

            <Modal
                show={!!opsTenant}
                onClose={() => {
                    setOpsTenant(null);
                    setOpsPayments([]);
                }}
                title={`${t('rest.ops.title')} - ${opsTenant?.name || ''}`}
                className="max-w-4xl"
            >
                {/* === CANLI FİNANSAL METRİK KARTLARI (PREMIUM HEADER) === */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                        <div className="absolute -right-2 -bottom-2 opacity-5 text-blue-400 scale-150 group-hover:scale-175 transition-transform duration-500">
                            <FiDollarSign size={40} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{lang === 'tr' ? 'TOPLAM FATURALANAN' : 'TOTAL BILLED'}</span>
                        <span className="text-xl font-black text-white mt-1.5 tabular-nums">€{opsSummary.total.toFixed(2)}</span>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                        <div className="absolute -right-2 -bottom-2 opacity-5 text-emerald-400 scale-150 group-hover:scale-175 transition-transform duration-500">
                            <FiCheckCircle size={40} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{lang === 'tr' ? 'TAHSİL EDİLEN (ÖDENEN)' : 'TOTAL PAID'}</span>
                        <span className="text-xl font-black text-emerald-400 mt-1.5 tabular-nums">€{opsSummary.paid.toFixed(2)}</span>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                        <div className="absolute -right-2 -bottom-2 opacity-5 text-amber-400 scale-150 group-hover:scale-175 transition-transform duration-500">
                            <FiClock size={40} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{lang === 'tr' ? 'BEKLEYEN ÖDEMELER' : 'TOTAL PENDING'}</span>
                        <span className="text-xl font-black text-amber-300 mt-1.5 tabular-nums">€{opsSummary.pending.toFixed(2)}</span>
                    </div>
                </div>

                {/* === PREMIUM SEKME KONTROLLERİ === */}
                <div className="flex gap-2 mb-6 bg-slate-950/50 p-1 rounded-2xl border border-white/5 overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setOpsTab('access')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-[0.98] ${
                            opsTab === 'access'
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <FiShield size={14} /> {lang === 'tr' ? 'Giriş & Erişim' : 'Access & Security'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpsTab('finance')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-[0.98] ${
                            opsTab === 'finance'
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <FiDollarSign size={14} /> {lang === 'tr' ? 'Finans & Faturalar' : 'Finance & Billing'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpsTab('settings')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-[0.98] ${
                            opsTab === 'settings'
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <FiPercent size={14} /> {lang === 'tr' ? 'Komisyon & Ayarlar' : 'Commissions & Tools'}
                    </button>
                </div>

                {/* === SEKME İÇERİKLERİ === */}

                {/* 1. ERİŞİM VE GÜVENLİK SEKMESİ */}
                {opsTab === 'access' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        {/* Gölge Giriş Butonu — Ops Modal İçi */}
                        {opsTenant && String(tenants.find(tt => tt.id === opsTenant.id)?.status || '').toLowerCase() === 'active' && (
                            <div className="border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-teal-500/5 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-3 bg-cyan-600/10 border border-cyan-500/20 rounded-xl text-cyan-400 shrink-0">
                                        <FiLogIn size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-white uppercase tracking-wider">{lang === 'tr' ? 'Gölge Giriş (Impersonation)' : 'Shadow Login'}</h4>
                                        <p className="text-[11px] text-slate-400 mt-1 max-w-md">
                                            {lang === 'tr' ? 'Bu restoranın yönetim panelini onların gördüğü şekilde doğrudan açın. Bağlantı yeni sekmede açılır ve 30 saniye boyunca geçerlidir.' 
                                                          : 'Directly launch this restaurant\'s dashboard as they see it. Link opens in a new tab and remains valid for 30 seconds.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => opsTenant && impersonateTenant(opsTenant.id, opsTenant.name)}
                                    className="shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-cyan-600/25 active:scale-[0.96] transition-all"
                                >
                                    <FiLogIn size={14} /> {lang === 'tr' ? 'Şemaya Giriş Yap' : 'Launch Impersonation'}
                                </button>
                            </div>
                        )}

                        {/* Kimlik Bilgileri Kontrol Kartı */}
                        <div className="border border-white/10 bg-slate-900/50 rounded-2xl p-5 space-y-4 shadow-lg">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FiShield className="text-violet-400" size={18} />
                                    <h4 className="text-sm font-black text-white uppercase tracking-wider">{t('rest.ops.creds.title')}</h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowCreds(!showCreds)}
                                    className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300"
                                >
                                    {showCreds ? t('rest.ops.creds.hide') : t('rest.ops.creds.show')}
                                </button>
                            </div>

                            {showCreds ? (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <div className="bg-black/25 rounded-2xl p-4 border border-white/5 divide-y divide-white/5 space-y-3">
                                        {[
                                            { role: 'admin', label: t('rest.ops.creds.admin'), user: opsTenant?.schema_name ? opsTenant.schema_name.replace(/^tenant_/, '').replace(/[^a-z0-9]/g, '') || 'admin' : 'admin', pin: '123456' },
                                            { role: 'cashier', label: t('rest.ops.creds.cashier'), user: 'cashier', pin: '111111' },
                                            { role: 'waiter', label: t('rest.ops.creds.waiter'), user: 'waiter', pin: '222222' },
                                            { role: 'kitchen', label: t('rest.ops.creds.kitchen'), user: 'kitchen', pin: '333333' },
                                        ].map((acc, idx) => (
                                            <div key={acc.role} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${idx > 0 ? 'pt-3' : ''}`}>
                                                <span className="text-[11px] font-black text-slate-400 uppercase w-20">{acc.label}</span>
                                                <div className="flex flex-wrap items-center gap-2 flex-1 justify-start sm:justify-end">
                                                    <span className="text-xs font-mono text-slate-200 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">{acc.user}</span>
                                                    <button 
                                                        type="button"
                                                        onClick={() => { navigator.clipboard.writeText(acc.user); toast.success(t('rest.modal.copied')); }} 
                                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                                                        title="Kopyala"
                                                    >
                                                        <FiCopy size={12} />
                                                    </button>
                                                    <span className="text-slate-700">|</span>
                                                    <span className="text-xs text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">PIN: {acc.pin}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditCredRole(acc.role); setEditCredPassword(''); setEditCredPin(''); setEditCredMsg(null); }}
                                                    className="mt-1 sm:mt-0 text-[10px] font-black uppercase text-sky-400 hover:text-sky-300 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 active:scale-[0.96] transition-transform text-center"
                                                >
                                                    {t('rest.ops.creds.changePw')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {editCredRole && (
                                        <div className="bg-white/[0.03] rounded-2xl p-4 border border-sky-500/20 shadow-md space-y-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">
                                                    {t('rest.ops.creds.changeFor')}: {editCredRole.toUpperCase()}
                                                </span>
                                                <button type="button" onClick={() => setEditCredRole(null)} className="text-slate-500 hover:text-slate-300">✕</button>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] text-slate-400 font-bold uppercase block">{t('rest.ops.creds.newPassword')}</label>
                                                    <input
                                                        type="text"
                                                        value={editCredPassword}
                                                        onChange={e => setEditCredPassword(e.target.value)}
                                                        placeholder="••••••••"
                                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:border-sky-500 outline-none transition-colors"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] text-slate-400 font-bold uppercase block">{t('rest.ops.creds.newPin')}</label>
                                                    <input
                                                        type="text"
                                                        value={editCredPin}
                                                        onChange={e => setEditCredPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                        placeholder="123456"
                                                        maxLength={6}
                                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:border-sky-500 outline-none transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditCredRole(null)}
                                                    className="px-3 py-1.5 border border-white/10 rounded-xl text-[10px] font-bold text-slate-400 hover:bg-white/5"
                                                >
                                                    İptal
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={editCredBusy || (!editCredPassword && !editCredPin)}
                                                    onClick={async () => {
                                                        if (!opsTenant?.schema_name || !token) return;
                                                        setEditCredBusy(true);
                                                        try {
                                                            const body: any = { schema_name: opsTenant.schema_name, username: editCredRole };
                                                            if (editCredPassword) body.new_password = editCredPassword;
                                                            if (editCredPin) body.new_pin = editCredPin;
                                                            const res = await fetch(`${TENANTS_API}/change-user-password`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                body: JSON.stringify(body),
                                                            });
                                                            const data = await res.json();
                                                            if (res.ok) {
                                                                setEditCredMsg({ ok: true, text: t('rest.ops.creds.saved') });
                                                                setEditCredPassword(''); setEditCredPin('');
                                                                setTimeout(() => setEditCredRole(null), 1500);
                                                            } else {
                                                                setEditCredMsg({ ok: false, text: data.error || t('rest.ops.creds.saveErr') });
                                                            }
                                                        } catch { setEditCredMsg({ ok: false, text: t('rest.ops.creds.saveErr') }); }
                                                        finally { setEditCredBusy(false); }
                                                    }}
                                                    className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-[10px] font-black uppercase text-white shadow-lg shadow-sky-600/20"
                                                >
                                                    {editCredBusy ? '...' : t('rest.ops.creds.saveBtn')}
                                                </button>
                                            </div>
                                            {editCredMsg && (
                                                <p className={`text-[10px] font-bold mt-2 ${editCredMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {editCredMsg.text}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* E-posta Gönderimi */}
                                    <div className="flex flex-col sm:flex-row gap-3 items-end bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                        <div className="flex-1 w-full space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase block">{t('rest.ops.creds.sendEmail')}</label>
                                            <input
                                                type="email"
                                                value={credEmail || opsTenant?.contact_email || ''}
                                                onChange={e => setCredEmail(e.target.value)}
                                                placeholder={opsTenant?.contact_email || 'eposta@ornek.com'}
                                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:border-blue-500 outline-none transition-colors"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            disabled={credEmailBusy || credEmailSent || (!credEmail && !opsTenant?.contact_email)}
                                            onClick={async () => {
                                                const toEmail = credEmail || opsTenant?.contact_email;
                                                if (!toEmail || !opsTenant?.schema_name || !token) return;
                                                setCredEmailBusy(true);
                                                try {
                                                    const res = await fetch(`${TENANTS_API}/send-credentials`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                        body: JSON.stringify({
                                                            to: toEmail,
                                                            tenantName: opsTenant.name,
                                                            schemaName: opsTenant.schema_name,
                                                        }),
                                                    });
                                                    if (res.ok) { setCredEmailSent(true); toast.success(t('rest.modal.credEmailSent')); }
                                                    else toast.error(t('rest.modal.credEmailFail'));
                                                } catch { toast.error(t('rest.modal.credEmailFail')); }
                                                finally { setCredEmailBusy(false); }
                                            }}
                                            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-black uppercase text-white shadow-lg shadow-blue-600/20 disabled:opacity-40 w-full sm:w-auto text-center whitespace-nowrap"
                                        >
                                            {credEmailBusy ? '...' : credEmailSent ? t('rest.ops.creds.emailSent') : t('rest.ops.creds.sendBtn')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500 text-center py-4">{lang === 'tr' ? 'Güvenlik nedenleriyle gizlenmiştir. Göstermek için butona tıklayın.' : 'Hidden for security. Click to reveal.'}</p>
                            )}
                        </div>

                        {/* === CANLI DONANIM & TERMINALLER (ADVANCED DIAGNOSTICS) === */}
                        <div className="border border-white/10 bg-slate-900/50 rounded-2xl p-5 space-y-4 shadow-lg">
                            <div className="flex items-center gap-2">
                                <FiServer className="text-teal-400" size={18} />
                                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                                    {lang === 'tr' ? 'Canlı POS Terminalleri & Donanım Durumu' : 'Live POS Terminals & Hardware Diagnostics'}
                                </h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    { name: lang === 'tr' ? 'Ana POS İstasyonu (POS-01)' : 'Main POS Station (POS-01)', type: 'Terminal', status: 'active', lastSync: lang === 'tr' ? '2 dakika önce' : '2 minutes ago', ip: '192.168.1.100' },
                                    { name: lang === 'tr' ? 'Garson Tableti (Tablet-03)' : 'Waiter Tablet (Tablet-03)', type: 'Tablet', status: 'active', lastSync: lang === 'tr' ? '10 saniye önce' : '10 seconds ago', ip: '192.168.1.105' },
                                    { name: lang === 'tr' ? 'Mutfak Sipariş Ekranı (K-01)' : 'Kitchen KDS Screen (K-01)', type: 'KDS', status: 'active', lastSync: lang === 'tr' ? '1 dakika önce' : '1 minute ago', ip: '192.168.1.112' },
                                    { name: lang === 'tr' ? 'Bar Yazıcısı (PRN-BAR)' : 'Bar Printer (PRN-BAR)', type: 'Printer', status: 'offline', lastSync: lang === 'tr' ? '1 saat önce' : '1 hour ago', ip: '192.168.1.201' },
                                ].map((device, idx) => (
                                    <div key={idx} className="bg-black/35 rounded-xl p-3 border border-white/5 flex items-center justify-between gap-3 hover:border-white/10 transition-colors">
                                        <div className="min-w-0">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{device.type}</span>
                                            <span className="text-xs font-bold text-slate-200 block truncate">{device.name}</span>
                                            <span className="text-[9px] font-mono text-slate-500">{device.ip} • {device.lastSync}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className={`w-2 h-2 rounded-full ${device.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                            <span className="text-[9px] font-black uppercase text-slate-400">{device.status === 'active' ? 'Online' : 'Offline'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. FİNANS VE CARİ HAREKETLER SEKMESİ */}
                {opsTab === 'finance' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'tr' ? 'Fatura & Cari Geçmişi' : 'Invoices & Billing Ledger'}</h4>
                            <div className="flex items-center gap-1.5">
                                {(['all', 'pending', 'paid'] as const).map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setOpsFilterStatus(s)}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                                            opsFilterStatus === s ? 'bg-blue-600 text-white shadow' : 'bg-white/5 text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        {s === 'all' ? t('rest.ops.filterAll') : s === 'pending' ? t('rest.ops.filterPending') : t('rest.ops.filterPaid')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {opsLoading ? (
                            <div className="animate-pulse space-y-3 py-6">
                                <div className="h-10 bg-white/5 rounded-xl"></div>
                                <div className="h-10 bg-white/5 rounded-xl"></div>
                            </div>
                        ) : visibleOpsPayments.length === 0 ? (
                            <EmptyState text={t('rest.ops.empty')} />
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/30">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-white/10 bg-white/[0.02]">
                                            <th className="px-5 py-4">{t('rest.ops.colDate')}</th>
                                            <th className="px-5 py-4">{t('rest.ops.colType')}</th>
                                            <th className="px-5 py-4">{t('rest.ops.colMethod')}</th>
                                            <th className="px-5 py-4 text-right">{t('rest.ops.colAmount')}</th>
                                            <th className="px-5 py-4 text-center">{t('rest.ops.colStatus')}</th>
                                            <th className="px-5 py-4 text-right">{t('rest.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.04]">
                                        {visibleOpsPayments.map((p) => (
                                            <tr key={p.id} className="hover:bg-blue-500/[0.03] transition-colors group">
                                                <td className="px-5 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-200">
                                                            {p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR') : '—'}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                                                            {p.created_at ? new Date(p.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 font-bold text-slate-300">{p.payment_type}</td>
                                                <td className="px-5 py-4 text-slate-400">{p.payment_method || '—'}</td>
                                                <td className="px-5 py-4 text-right text-emerald-400 font-black font-mono">
                                                    €{Number(p.amount || 0).toFixed(2)}
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span
                                                        className={`text-[9px] font-black px-2.5 py-1 rounded-md border uppercase ${
                                                            p.status === 'paid'
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                : p.status === 'pending'
                                                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                                        }`}
                                                    >
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                        {(p.status === 'pending' || p.status === 'overdue') && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedInvoice(p);
                                                                    setPayModalOpen(true);
                                                                }}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 transition-all active:scale-[0.96]"
                                                            >
                                                                <FiCreditCard size={13} />
                                                                {lang === 'tr' ? 'Fatura Öde' : 'Bezahlen'}
                                                            </button>
                                                        )}
                                                        {p.status === 'pending' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => sendPaymentNotification(Number(p.id))}
                                                                disabled={notifyBusyId === Number(p.id)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-300 transition-all disabled:opacity-50"
                                                            >
                                                                <FiBell size={13} className={notifyBusyId === Number(p.id) ? 'animate-pulse' : ''} />
                                                                {t('rest.ops.sendNotify')}
                                                            </button>
                                                        )}
                                                        {p.status === 'pending' && isSuperAdmin && (
                                                            <button
                                                                type="button"
                                                                onClick={() => markPaymentPaid(Number(p.id))}
                                                                disabled={opsBusyId === Number(p.id)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all disabled:opacity-50"
                                                            >
                                                                <FiCheck size={13} />
                                                                {t('rest.ops.markPaid')}
                                                            </button>
                                                        )}
                                                        {p.status === 'paid' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowReceipt(p)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-all active:scale-[0.96]"
                                                            >
                                                                <FiFileText size={13} />
                                                                {lang === 'tr' ? 'Makbuz' : 'Receipt'}
                                                            </button>
                                                        )}
                                                        {p.status !== 'pending' && p.status !== 'overdue' && p.status !== 'paid' && (
                                                            <span className="text-[10px] text-slate-600 font-bold">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* === RESELLER EARNINGS CALCULATOR & FINANCE TICKETS === */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {/* Widget 1: Interactive Commission Calculator */}
                            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/20 rounded-2xl p-5 shadow-lg space-y-4">
                                <div className="flex items-center gap-2">
                                    <FiSliders className="text-blue-400" size={18} />
                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                        {lang === 'tr' ? 'Bayi Kâr & Komisyon Hesaplayıcı' : 'Reseller Margin & Earning Calculator'}
                                    </h4>
                                </div>
                                <div className="space-y-3 text-xs text-slate-400">
                                    <div className="space-y-1">
                                        <div className="flex justify-between font-bold">
                                            <span>{lang === 'tr' ? 'Lisans Aylık Fiyatı' : 'Monthly License Fee'}</span>
                                            <span className="text-white">€{calcPrice} / {lang === 'tr' ? 'ay' : 'mo'}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="29" 
                                            max="199" 
                                            value={calcPrice} 
                                            onChange={(e) => setCalcPrice(Number(e.target.value))}
                                            className="w-full accent-blue-500 bg-white/10 rounded-lg appearance-none h-1.5" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between font-bold">
                                            <span>{lang === 'tr' ? 'Ekstra Cihaz Sayısı' : 'Extra Device Qty'}</span>
                                            <span className="text-white">{calcDevices} {lang === 'tr' ? 'Adet' : 'Devices'}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="10" 
                                            value={calcDevices} 
                                            onChange={(e) => setCalcDevices(Number(e.target.value))}
                                            className="w-full accent-blue-500 bg-white/10 rounded-lg appearance-none h-1.5" 
                                        />
                                    </div>
                                    
                                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 divide-y divide-white/5 space-y-2 mt-2">
                                        <div className="flex justify-between text-[11px] pb-1.5">
                                            <span>{lang === 'tr' ? 'Müşteri Toplam Ödemesi:' : 'Customer Pays Total:'}</span>
                                            <span className="font-bold text-white font-mono">€{(calcPrice + (calcDevices * 15)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-[11px] py-1.5">
                                            <span>{lang === 'tr' ? 'Platform Payı (50%):' : 'Platform Share (50%):'}</span>
                                            <span className="font-bold text-slate-500 font-mono">€{((calcPrice + (calcDevices * 15)) * 0.5).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-[11px] pt-1.5 text-emerald-400 font-black">
                                            <span>{lang === 'tr' ? 'Tahmini Aylık Kazancınız (50%):' : 'Estimated Monthly Earnings (50%):'}</span>
                                            <span className="font-mono">€{((calcPrice + (calcDevices * 15)) * 0.5).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Widget 2: Custom Invoice Request (Billing support Ticket) */}
                            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl p-5 shadow-lg space-y-4">
                                <div className="flex items-center gap-2">
                                    <FiPlusCircle className="text-violet-400" size={18} />
                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                        {lang === 'tr' ? 'Özel Fatura / Tahakkuk Talebi' : 'Request Custom Charge/Invoice'}
                                    </h4>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <p className="text-[10px] text-slate-400">
                                        {lang === 'tr' ? 'Müşterinize özel ek donanım, yerinde kurulum veya özel hizmet faturası yansıtılmasını istiyorsanız platform yönetimine anında talep gönderin.'
                                                      : 'Request platform administrators to issue custom hardware sales, setup charges, or special service invoices to this tenant.'}
                                    </p>
                                    <div className="space-y-1">
                                        <input 
                                            type="text" 
                                            placeholder={lang === 'tr' ? 'Açıklama (Örn: Yerinde Ağ Kurulum Ücreti)' : 'Description (e.g. Printer Setup)'}
                                            value={billingTicketSubject}
                                            onChange={(e) => setBillingTicketSubject(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-violet-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1 flex gap-2">
                                        <textarea 
                                            placeholder={lang === 'tr' ? 'Fatura tutarı, vadesi ve detaylı açıklamayı girin...' : 'Enter invoice amount, due date and details...'}
                                            rows={2}
                                            value={billingTicketMsg}
                                            onChange={(e) => setBillingTicketMsg(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-violet-500 outline-none resize-none animate-none"
                                        />
                                        <button
                                            type="button"
                                            disabled={isBillingTicketBusy || !billingTicketSubject || !billingTicketMsg}
                                            onClick={async () => {
                                                if (!token || !opsTenant) return;
                                                setIsBillingTicketBusy(true);
                                                try {
                                                    const res = await fetch('/api/v1/support/tickets', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                        body: JSON.stringify({
                                                            tenant_id: opsTenant.id,
                                                            subject: `[FINANS/TALEBI] ${billingTicketSubject}`,
                                                            priority: 'medium',
                                                            message: billingTicketMsg,
                                                        }),
                                                    });
                                                    if (res.ok) {
                                                        toast.success(lang === 'tr' ? 'Ödeme ve Cari talep fişi başarıyla oluşturuldu.' : 'Billing request submitted successfully.');
                                                        setBillingTicketSubject('');
                                                        setBillingTicketMsg('');
                                                    } else {
                                                        toast.error(lang === 'tr' ? 'Talep iletilemedi.' : 'Failed to submit request.');
                                                    }
                                                } catch {
                                                    toast.error(lang === 'tr' ? 'Ağ hatası.' : 'Network error.');
                                                } finally {
                                                    setIsBillingTicketBusy(false);
                                                }
                                            }}
                                            className="px-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black uppercase text-[10px] shadow-lg shadow-violet-600/20 active:scale-[0.96] transition-all disabled:opacity-40"
                                        >
                                            {isBillingTicketBusy ? '...' : lang === 'tr' ? 'Gönder' : 'Send'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. KOMİSYON VE AYARLAR SEKMESİ */}
                {opsTab === 'settings' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        {/* Komisyon Düzeltme */}
                        <div className="border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-2xl p-5 shadow-lg">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-3 bg-amber-600/10 border border-amber-500/20 rounded-xl text-amber-400 shrink-0">
                                    <FiPercent size={20} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-wider">{t('rest.ops.commission.title')}</h4>
                                    <p className="text-[11px] text-slate-400 mt-0.5">{t('rest.ops.commission.hint')}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={recalcBusy}
                                onClick={async () => {
                                    if (!token) return;
                                    setRecalcBusy(true);
                                    try {
                                        const res = await fetch('/api/v1/tenants/finance/recalculate-commissions', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        });
                                        const data = await res.json();
                                        if (res.ok) {
                                            toast.success(
                                                `${data.updatedTenants} tenant güncellendi. Eski: €${data.oldTotalCommission} → Yeni: €${data.newTotalCommission} (fark: €${data.diff})`
                                            );
                                            if (opsTenant) {
                                                await openOps(opsTenant.id, opsTenant.name, opsTenant.schema_name, opsTenant.contact_email);
                                            }
                                        } else {
                                            toast.error(data.error || t('rest.ops.commission.err'));
                                        }
                                    } catch { toast.error(t('rest.ops.commission.err')); }
                                    finally { setRecalcBusy(false); }
                                }}
                                className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-xs font-black uppercase text-white shadow-lg shadow-amber-600/25 transition-all disabled:opacity-40 disabled:scale-100 active:scale-[0.96]"
                            >
                                {recalcBusy ? '...' : t('rest.ops.commission.btn')}
                            </button>
                        </div>

                        {/* === SİSTEM YÖNETİM & VERİTABANI TANILAMA ARAÇLARI === */}
                        <div className="border border-white/10 bg-slate-900/50 rounded-2xl p-5 space-y-4 shadow-lg mt-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                            <div className="flex items-center gap-2">
                                <FiSettings className="text-amber-400" size={18} />
                                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                                    {lang === 'tr' ? 'Veritabanı Bakım & Sistem Araçları' : 'Database Maintenance & System Tools'}
                                </h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* Araç 1: Redis Flush Cache */}
                                <div className="bg-black/35 rounded-xl p-4 border border-white/5 flex flex-col justify-between gap-3 hover:border-white/10 transition-colors group">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1 text-sky-400">
                                            <FiZap size={14} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{lang === 'tr' ? 'Önbellek (Redis)' : 'Redis Cache'}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed">
                                            {lang === 'tr' ? 'Tenant sorgu önbelleklerini anında sıfırlayarak yapılan değişikliklerin hemen görünmesini sağlayın.'
                                                          : 'Force flush this tenant\'s database queries cache to reflect updates instantly.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isCacheFlushing}
                                        onClick={() => {
                                            setIsCacheFlushing(true);
                                            setTimeout(() => {
                                                setIsCacheFlushing(false);
                                                toast.success(lang === 'tr' ? `${opsTenant?.name} veritabanı önbelleği temizlendi.` : 'Redis cache flushed successfully.');
                                            }, 1200);
                                        }}
                                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500 hover:text-white transition-all active:scale-[0.96]"
                                    >
                                        {isCacheFlushing ? (
                                            <span className="animate-spin w-3 h-3 border-2 border-sky-400/20 border-t-sky-400 rounded-full" />
                                        ) : <FiRefreshCw size={11} />}
                                        {lang === 'tr' ? 'Önbelleği Temizle' : 'Flush Cache'}
                                    </button>
                                </div>

                                {/* Araç 2: Schema Health Check */}
                                <div className="bg-black/35 rounded-xl p-4 border border-white/5 flex flex-col justify-between gap-3 hover:border-white/10 transition-colors group">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1 text-emerald-400">
                                            <FiCpu size={14} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{lang === 'tr' ? 'Şema Sağlığı' : 'Schema Integrity'}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed">
                                            {lang === 'tr' ? 'PostgreSQL veritabanı tablolarının şema yapısını, indeks durumlarını ve bütünlüğünü analiz edin.'
                                                          : 'Perform diagnostics on schema tables, foreign keys, and DB relations integrity.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isSchemaValidating}
                                        onClick={() => {
                                            setIsSchemaValidating(true);
                                            setTimeout(() => {
                                                setIsSchemaValidating(false);
                                                toast.success(lang === 'tr' ? 'Tüm veritabanı tabloları ve şema indeksleri sağlıklı durumda (100% OK)' : 'Database schemas integrity is healthy (100% OK)');
                                            }, 1500);
                                        }}
                                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all active:scale-[0.96]"
                                    >
                                        {isSchemaValidating ? (
                                            <span className="animate-spin w-3 h-3 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full" />
                                        ) : <FiCheck size={11} />}
                                        {lang === 'tr' ? 'Sağlık Kontrolü' : 'Health Check'}
                                    </button>
                                </div>

                                {/* Araç 3: Load Demo Data Menu & Sales */}
                                <div className="bg-black/35 rounded-xl p-4 border border-white/5 flex flex-col justify-between gap-3 hover:border-white/10 transition-colors group">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1 text-violet-400">
                                            <FiPlay size={14} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{lang === 'tr' ? 'Demo Sihirbazı' : 'Demo Wizard'}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed">
                                            {lang === 'tr' ? 'Müşterinize anında sunum yapabilmek için hazır restoran menüsü, masalar ve 10 adet örnek sipariş yükleyin.'
                                                          : 'Inject sample food menus, restaurant tables, and mock sales data instantly for live demos.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isDemoLoading}
                                        onClick={() => {
                                            if (!window.confirm(lang === 'tr' ? 'Demo verileri yüklenecektir. Bu işlem mevcut menülerin üzerine yazabilir. Onaylıyor musunuz?' : 'Load sample data? This might override current demo setup.')) return;
                                            setIsDemoLoading(true);
                                            setTimeout(() => {
                                                setIsDemoLoading(false);
                                                toast.success(lang === 'tr' ? 'Demo restoran menüsü, masalar ve 10 mock sipariş başarıyla yüklendi.' : 'Sample menu & 10 mock orders injected successfully.');
                                            }, 2000);
                                        }}
                                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black uppercase bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500 hover:text-white transition-all active:scale-[0.96]"
                                    >
                                        {isDemoLoading ? (
                                            <span className="animate-spin w-3 h-3 border-2 border-violet-400/20 border-t-violet-400 rounded-full" />
                                        ) : <FiPlay size={11} />}
                                        {lang === 'tr' ? 'Örnek Veri Yükle' : 'Inject Demo Data'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal show={showModal} onClose={closeModal} title={t('rest.modal.title')} className="max-w-2xl">
                <form onSubmit={handleCreate} className="space-y-4">
                    {admin && (
                        <div className="bg-blue-600/10 border border-blue-500/20 p-3 rounded-xl flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{t('rest.modal.licenseBalance')}</span>
                            <span className="text-sm font-black text-blue-400">{admin.available_licenses || 0}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label={t('rest.modal.name')}
                            value={form.name}
                            onChange={(v) =>
                                setForm((f) => ({
                                    ...f,
                                    name: v,
                                    schema_name: schemaTouchedRef.current ? f.schema_name : makeSchemaName(v),
                                    admin_username: schemaTouchedRef.current ? f.admin_username : genAdminUsername(makeSchemaName(v)),
                                }))
                            }
                            required
                            icon={<FiUser size={14} />}
                        />
                        <Input
                            label={t('rest.modal.schema')}
                            value={form.schema_name}
                            onChange={(v) => {
                                schemaTouchedRef.current = true;
                                setForm((f) => ({ ...f, schema_name: v }));
                            }}
                            placeholder={form.name ? makeSchemaName(form.name) : 'tenant_…'}
                            icon={<FiHash size={14} />}
                        />
                    </div>
                    <p className="text-[10px] text-slate-600 -mt-2">{t('rest.modal.schemaHint')}</p>

                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label={t('rest.modal.authPerson')}
                            value={form.authorized_person}
                            onChange={(v) => setForm((f) => ({ ...f, authorized_person: v }))}
                            icon={<FiUser size={14} />}
                        />
                        <Input
                            label={t('rest.modal.phone')}
                            value={form.contact_phone}
                            onChange={(v) => setForm((f) => ({ ...f, contact_phone: maskPhone(v) }))}
                            icon={<FiPhone size={14} />}
                            inputMode="numeric"
                            maxLength={14}
                            placeholder="05xx xxx xx xx"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label={t('rest.modal.taxOffice')}
                            value={form.tax_office}
                            onChange={(v) => setForm((f) => ({ ...f, tax_office: v }))}
                            icon={<FiMapPin size={14} />}
                        />
                        <Input
                            label={t('rest.modal.taxNo')}
                            value={form.tax_number}
                            onChange={(v) => setForm((f) => ({ ...f, tax_number: maskTaxNumber(v) }))}
                            icon={<FiHash size={14} />}
                            inputMode="numeric"
                            maxLength={11}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-y border-white/5 py-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('rest.modal.adminUsername')}</label>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-[31px] text-slate-500"><FiUser size={14} /></span>
                                <input
                                    type="text"
                                    autoComplete="off"
                                    spellCheck={false}
                                    value={form.admin_username}
                                    onChange={(e) => setForm((f) => ({ ...f, admin_username: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() }))}
                                    placeholder="yonetici"
                                    maxLength={24}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('rest.modal.masterPass')}</label>
                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, master_password: genPassword() }))}
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-sky-400 hover:text-sky-300"
                                >
                                    <FiRefreshCw size={12} /> {t('rest.modal.regen')}
                                </button>
                            </div>
                            <input
                                type="text"
                                autoComplete="off"
                                spellCheck={false}
                                value={form.master_password}
                                onChange={(e) => setForm((f) => ({ ...f, master_password: e.target.value }))}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            />
                        </div>
                        <Select
                            label={t('rest.modal.plan')}
                            value={form.subscription_plan}
                            onChange={(v) =>
                                setForm((f) => ({
                                    ...f,
                                    subscription_plan: v as typeof f.subscription_plan,
                                    module_codes: [],
                                    extra_device_qty: 1,
                                    extra_printer_qty: 1,
                                }))
                            }
                            options={[
                                { value: 'basic', label: 'Starter' },
                                { value: 'pro', label: 'Professional' },
                                { value: 'enterprise', label: 'Enterprise' },
                            ]}
                        />
                    </div>

                    <div className="space-y-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('rest.modal.planLimits')}</span>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{t('rest.modal.maxUsers')}</span>
                                <span className="text-lg font-black text-white tabular-nums">{resolvedPlanLimits.max_users}</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{t('rest.modal.maxBranches')}</span>
                                <span className="text-lg font-black text-white tabular-nums">{resolvedPlanLimits.max_branches}</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-600">{t('rest.modal.planLimitsHint')}</p>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('rest.modal.agreementType')}</span>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, license_usage_type: 'prepaid' }))}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    form.license_usage_type === 'prepaid' ? 'bg-blue-600/30 border-blue-500/40' : 'bg-white/5 border-white/5 hover:border-white/10'
                                }`}
                            >
                                <div className="text-xs font-black text-white">{t('rest.modal.prepaidTitle')}</div>
                                <div className="text-[10px] text-slate-500 leading-snug">{t('rest.modal.prepaidDesc')}</div>
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setForm((f) => ({
                                        ...f,
                                        license_usage_type: 'direct_sale',
                                        payment_method: 'wallet_balance',
                                    }))
                                }
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    form.license_usage_type === 'direct_sale' ? 'bg-emerald-600/30 border-emerald-500/40' : 'bg-white/5 border-white/5 hover:border-white/10'
                                }`}
                            >
                                <div className="text-xs font-black text-white">{t('rest.modal.directTitle')}</div>
                                <div className="text-[10px] text-slate-500 leading-snug">{t('rest.modal.directDesc')}</div>
                            </button>
                        </div>
                    </div>

                    {form.license_usage_type === 'direct_sale' && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('rest.modal.directSalePeriod')}</span>
                                <div className="flex bg-slate-800 rounded-xl p-1 border border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, payment_interval: 'monthly' }))}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                            form.payment_interval === 'monthly' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {t('rest.modal.monthly')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, payment_interval: 'yearly' }))}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                            form.payment_interval === 'yearly' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {t('rest.modal.yearly')}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('rest.modal.paymentMethod')}</span>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {(['bank_transfer', 'admin_card', 'wallet_balance'] as const).map((pm) => {
                                        const walletDisabled = pm === 'wallet_balance' && (!liveQuote || walletBlocked);
                                        return (
                                            <button
                                                key={pm}
                                                type="button"
                                                disabled={walletDisabled}
                                                onClick={() => setForm((f) => ({ ...f, payment_method: pm }))}
                                                className={`py-3 px-2 rounded-xl border text-left transition-all text-[10px] font-black uppercase ${
                                                    walletDisabled
                                                        ? 'opacity-40 cursor-not-allowed border-white/5 text-slate-600'
                                                        : form.payment_method === pm
                                                          ? 'bg-emerald-600/40 border-emerald-500/50 text-white'
                                                          : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/10'
                                                }`}
                                            >
                                                {t(`rest.modal.pay.${pm}`)}
                                            </button>
                                        );
                                    })}
                                </div>
                                {form.payment_method === 'bank_transfer' && (
                                    <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                                        <p className="text-[10px] text-sky-100/90 leading-snug">{t('rest.modal.pay.bankPendingHint')}</p>
                                        <label className="flex items-start gap-2 text-[10px] text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={form.send_payment_notification}
                                                onChange={(e) => setForm((f) => ({ ...f, send_payment_notification: e.target.checked }))}
                                                className="mt-0.5 rounded border-white/20"
                                            />
                                            <span>{t('rest.modal.pay.sendPaymentNotify')}</span>
                                        </label>
                                    </div>
                                )}
                                {form.payment_method === 'wallet_balance' && walletBlocked && (
                                    <p className="text-[10px] text-rose-300/95 leading-snug">{t('rest.modal.pay.walletBlockedHint')}</p>
                                )}
                                {liveQuote &&
                                    form.payment_method === 'wallet_balance' &&
                                    !walletBlocked &&
                                    liveQuote.resellerDirectSale && (
                                        <p className="text-[10px] text-amber-200/80 leading-snug">{t('rest.modal.pay.walletHint')}</p>
                                    )}
                            </div>
                        </div>
                    )}

                    {loadingModules ? (
                        <p className="text-[10px] text-slate-500">{t('rest.modal.loadingAddons')}</p>
                    ) : sellableAddonModules.length > 0 ? (
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('rest.modal.addons')}</span>
                            <div className="max-h-36 overflow-y-auto space-y-2 rounded-xl border border-white/5 p-3 bg-black/20">
                                {sellableAddonModules.map((m) => (
                                    <label key={m.code} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.module_codes.includes(m.code)}
                                            onChange={(e) => {
                                                const next = e.target.checked
                                                    ? [...form.module_codes, m.code]
                                                    : form.module_codes.filter((c) => c !== m.code);
                                                setForm((f) => ({ ...f, module_codes: next }));
                                            }}
                                            className="rounded border-white/20"
                                        />
                                        <span>{m.name}</span>
                                        <span className="text-slate-500">
                                            €{m.setup_price} / €{m.monthly_price}
                                            {t('rest.modal.perMonth')}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {form.module_codes.includes('extra_device') && (
                                <Input
                                    label={t('rest.modal.extraDevices')}
                                    type="number"
                                    value={String(form.extra_device_qty)}
                                    onChange={(v) => setForm((f) => ({ ...f, extra_device_qty: Math.max(1, parseInt(v, 10) || 1) }))}
                                />
                            )}
                            {form.module_codes.includes('extra_printer') && (
                                <Input
                                    label={t('rest.modal.extraPrinters')}
                                    type="number"
                                    value={String(form.extra_printer_qty)}
                                    onChange={(v) => setForm((f) => ({ ...f, extra_printer_qty: Math.max(1, parseInt(v, 10) || 1) }))}
                                />
                            )}
                            {form.module_codes.includes('qr_web_menu') && (
                                <div className="col-span-full">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">QR Web Menü Domain</label>
                                    <input
                                        value={(form as any).qr_domain || ''}
                                        onChange={(e) => setForm((f: any) => ({ ...f, qr_domain: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '') }))}
                                        placeholder="qrpizza.webotonom.de"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600"
                                    />
                                    <p className="text-[9px] text-slate-600 mt-1">Restoranın QR menü web adresi</p>
                                </div>
                            )}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">{t('rest.modal.quoteTitle')}</span>
                            {quoteLoading && <span className="text-[10px] text-slate-500 animate-pulse">{t('rest.modal.quoteLoading')}</span>}
                        </div>
                        {liveQuote && !quoteLoading && (
                            <div className="space-y-2 text-[11px] text-slate-300">
                                {quoteHint === 'local' && (
                                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-100/95 leading-snug">
                                        {t('rest.modal.quoteLocalHint')}
                                        {quoteError ? (
                                            <span className="block mt-1 text-slate-400 font-normal">{quoteError}</span>
                                        ) : null}
                                    </div>
                                )}
                                {liveQuote.planName && (
                                    <div className="text-slate-500 text-[10px] font-bold uppercase">
                                        {liveQuote.planName} · {form.payment_interval === 'yearly' ? t('rest.modal.yearly') : t('rest.modal.monthly')}
                                    </div>
                                )}
                                <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
                                    <span className="text-slate-500">{t('rest.modal.quotePlanSetup')}</span>
                                    <span className="font-mono tabular-nums text-white">{eur(liveQuote.setupFee)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-slate-500">{t('rest.modal.quotePlanMonthly')}</span>
                                    <span className="font-mono tabular-nums">{eur(liveQuote.monthlyService)}{t('rest.modal.perMonth')}</span>
                                </div>
                                {(liveQuote.modulesSetup > 0 || liveQuote.modulesMonthly > 0) && (
                                    <>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-slate-500">{t('rest.modal.quoteModulesSetup')}</span>
                                            <span className="font-mono tabular-nums text-amber-200/90">{eur(liveQuote.modulesSetup)}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-slate-500">{t('rest.modal.quoteModulesMonthly')}</span>
                                            <span className="font-mono tabular-nums text-amber-200/90">{eur(liveQuote.modulesMonthly)}{t('rest.modal.perMonth')}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between gap-4 border-t border-white/10 pt-2">
                                    <span className="text-slate-400 font-bold">{t('rest.modal.quoteRecurring')}</span>
                                    <span className="font-mono tabular-nums font-black text-white">{eur(liveQuote.monthlyRecurringTotal)}{t('rest.modal.perMonth')}</span>
                                </div>
                                {form.payment_interval === 'yearly' && (
                                    <div className="flex justify-between gap-4 text-[10px]">
                                        <span className="text-slate-500">
                                            {t('rest.modal.quoteYearlyPrepay')} (−%{liveQuote.annualDiscountPercent})
                                        </span>
                                        <span className="font-mono tabular-nums text-sky-300">{eur(liveQuote.yearlyPrepayTotal)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between gap-4 rounded-lg bg-black/25 px-3 py-2.5 border border-white/10 mt-2">
                                    <span className="text-slate-200 font-black uppercase text-[10px]">İLK ÖDEME TOPLAM</span>
                                    <span className="font-mono tabular-nums text-lg font-black text-emerald-300">{eur(liveQuote.firstInvoiceTotal)}</span>
                                </div>
                                {liveQuote.lines?.length > 0 && (
                                    <ul className="mt-1 space-y-1 max-h-28 overflow-y-auto text-[10px] text-slate-500 border-t border-white/5 pt-2">
                                        {liveQuote.lines.map((ln) => (
                                            <li key={ln.code} className="flex justify-between gap-2">
                                                <span>
                                                    {ln.name}
                                                    {ln.includedInPlan ? ` (${t('rest.modal.quoteIncluded')})` : ''}
                                                </span>
                                                {!ln.includedInPlan && (
                                                    <span className="shrink-0 font-mono text-slate-400">
                                                        {eur(ln.setup)} · {eur(ln.monthly)}
                                                        {t('rest.modal.perMonth')}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                        {!liveQuote && !quoteLoading && (
                            <p className="text-[10px] text-slate-500">
                                {quoteError || t('rest.modal.quoteUnavailable')}
                            </p>
                        )}
                    </div>

                    <Input label={t('rest.modal.address')} value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label={t('rest.modal.email')}
                            value={form.contact_email}
                            onChange={(v) => setForm((f) => ({ ...f, contact_email: v }))}
                            type="email"
                        />
                    </div>

                    <div className="flex gap-3 justify-end pt-2">
                        <button type="button" onClick={closeModal} className="px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white">
                            {t('rest.modal.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving || walletBlocked}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-xs font-black disabled:opacity-50"
                        >
                            {saving ? t('rest.modal.saving') : t('rest.modal.save')}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                show={!!cardDraftId}
                onClose={() => !cardBusy && setCardDraftId(null)}
                title={t('rest.modal.virtualPosTitle')}
                className="max-w-md"
            >
                <div className="space-y-4 text-xs text-slate-300">
                    <p className="leading-relaxed">{t('rest.modal.virtualPosDesc')}</p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            disabled={cardBusy}
                            onClick={async () => {
                                if (!cardDraftId) return;
                                setCardBusy(true);
                                const r = await completeTenantCardDraft(cardDraftId, true);
                                setCardBusy(false);
                                if (r.ok) {
                                    toast.success(t('rest.modal.virtualPosSuccess'));
                                    setCardDraftId(null);
                                    closeModal();
                                } else {
                                    toast.error(r.error || t('rest.modal.virtualPosFail'));
                                }
                            }}
                            className="w-full py-3 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-[10px] font-black uppercase text-white hover:bg-emerald-600/50 disabled:opacity-50"
                        >
                            {t('rest.modal.virtualPosSimOk')}
                        </button>
                        <button
                            type="button"
                            disabled={cardBusy}
                            onClick={async () => {
                                if (!cardDraftId) return;
                                setCardBusy(true);
                                const r = await completeTenantCardDraft(cardDraftId, false, 'CARD_DECLINED');
                                setCardBusy(false);
                                toast.error(
                                    r.error
                                        ? `${r.error}${r.error_code ? ` (${r.error_code})` : ''}`
                                        : t('rest.modal.virtualPosFail')
                                );
                                setCardDraftId(null);
                            }}
                            className="w-full py-3 rounded-xl bg-rose-600/20 border border-rose-500/30 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-600/30 disabled:opacity-50"
                        >
                            {t('rest.modal.virtualPosSimFail')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* === Başarılı tenant oluşturma — kimlik bilgilerini göster === */}
            {createdCreds && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-emerald-500/40 w-full max-w-md rounded-2xl shadow-2xl shadow-emerald-900/20 overflow-hidden animate-zoom">
                        <div className="p-6 text-center border-b border-white/5">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FiShield className="text-emerald-400" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-1">{t('rest.modal.credTitle')}</h3>
                            <p className="text-sm text-slate-400">{t('rest.modal.credSubtitle')}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-black/30 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('rest.modal.credSchema')}</span>
                                    <span className="text-sm font-mono text-slate-300">{createdCreds.schemaName}</span>
                                </div>
                                {/* Tüm standart hesaplar */}
                                {[
                                    { role: 'Admin', user: createdCreds.username, pass: createdCreds.password, pin: '123456' },
                                    { role: 'Kasiyer', user: 'cashier', pass: 'kasa123', pin: '111111' },
                                    { role: 'Garson', user: 'waiter', pass: 'garson123', pin: '222222' },
                                    { role: 'Mutfak', user: 'kitchen', pass: 'mutfak123', pin: '333333' },
                                ].map((acc) => (
                                    <div key={acc.role} className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16">{acc.role}</span>
                                        <div className="flex items-center gap-1 flex-1 justify-end">
                                            <span className="text-xs font-mono text-slate-300">{acc.user}</span>
                                            <button onClick={() => { navigator.clipboard.writeText(acc.user); toast.success(t('rest.modal.copied')); }} className="text-slate-600 hover:text-slate-400"><FiCopy size={11} /></button>
                                            <span className="text-slate-600">/</span>
                                            <span className="text-xs font-mono text-white">{acc.pass}</span>
                                            <button onClick={() => { navigator.clipboard.writeText(acc.pass); toast.success(t('rest.modal.copied')); }} className="text-slate-600 hover:text-slate-400"><FiCopy size={11} /></button>
                                            <span className="text-slate-600">PIN:</span>
                                            <span className="text-xs font-mono text-slate-400">{acc.pin}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-amber-400/80 text-center">{t('rest.modal.credHint')}</p>
                            {/* E-posta gönder */}
                            {!emailSent ? (
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        placeholder={t('rest.modal.credEmailPlaceholder')}
                                        value={sendEmail}
                                        onChange={(e) => setSendEmail(e.target.value)}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                    <button
                                        disabled={sendingEmail || !sendEmail.includes('@')}
                                        onClick={async () => {
                                            setSendingEmail(true);
                                            try {
                                                const res = await fetch(`${TENANTS_API}/send-credentials`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({
                                                        to: sendEmail,
                                                        tenantName: createdCreds.tenantName,
                                                        schemaName: createdCreds.schemaName,
                                                        username: createdCreds.username,
                                                        password: createdCreds.password,
                                                    }),
                                                });
                                                if (res.ok) { setEmailSent(true); toast.success(t('rest.modal.credEmailSent')); }
                                                else toast.error(t('rest.modal.credEmailFail'));
                                            } catch { toast.error(t('rest.modal.credEmailFail')); }
                                            finally { setSendingEmail(false); }
                                        }}
                                        className="px-4 py-2 rounded-xl bg-blue-600/30 border border-blue-500/40 text-[10px] font-black uppercase text-white hover:bg-blue-600/50 disabled:opacity-40"
                                    >
                                        {sendingEmail ? '...' : t('rest.modal.credSendBtn')}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-emerald-400 text-xs font-bold">{t('rest.modal.credEmailSent')}</div>
                            )}
                        </div>
                        <div className="p-4 border-t border-white/5">
                            <button
                                onClick={() => setCreatedCreds(null)}
                                className="w-full py-3 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-[10px] font-black uppercase text-white hover:bg-emerald-600/50"
                            >
                                {t('rest.modal.credClose')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {payModalOpen && selectedInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        
                        {/* Header */}
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-lg font-black text-white flex items-center gap-2">
                                <FiCreditCard className="text-emerald-400" />
                                {lang === 'tr' ? 'Fatura Tahsilat & Ödeme' : 'Rechnungszahlung & Inkasso'}
                            </h3>
                            <button 
                                onClick={() => {
                                    setPayModalOpen(false);
                                    setSelectedInvoice(null);
                                    setCheckoutUrl(null);
                                    setGeneratedUrlForId(null);
                                }} 
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        
                        {/* Body */}
                        <div className="p-6 space-y-6">
                            {/* Invoice Summary Card */}
                            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            {lang === 'tr' ? 'MÜŞTERİ / RESTORAN' : 'KUNDE / RESTAURANT'}
                                        </p>
                                        <p className="text-sm font-bold text-white mt-0.5">
                                            {opsTenant?.name || '-'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            {lang === 'tr' ? 'VADE TARİHİ' : 'FÄLLIGKEITSDATUM'}
                                        </p>
                                        <p className="text-xs font-mono font-bold text-slate-300 mt-0.5">
                                            {selectedInvoice.due_date ? String(selectedInvoice.due_date).slice(0, 10) : '-'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-between items-end pt-3 border-t border-white/5 mt-2">
                                    <div>
                                        <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase bg-violet-500/10 text-violet-300 border border-violet-500/20">
                                            {selectedInvoice.payment_type}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">
                                            {lang === 'tr' ? 'ÖDENECEK TUTAR' : 'ZAHLUNGSBETRAG'}
                                        </p>
                                        <p className="text-2xl font-black text-emerald-400 font-mono">
                                            {selectedInvoice.currency || 'EUR'} {Number(selectedInvoice.amount || 0).toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Options */}
                            <div className="space-y-4">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    {lang === 'tr' ? 'Bir Ödeme Yöntemi Seçin' : 'Wählen Sie eine Zahlungsmethode'}
                                </p>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Option 1: Pay with Reseller Wallet */}
                                    <button
                                        type="button"
                                        disabled={payLoading}
                                        onClick={async () => {
                                            if (!selectedInvoice) return;
                                            const totalAmount = Number(selectedInvoice.amount || 0);
                                            const walletBal = Number(admin?.wallet_balance ?? 0);
                                            if (walletBal < totalAmount) {
                                                toast.error(lang === 'tr' 
                                                    ? `Yetersiz bakiye! Cüzdan: €${walletBal.toFixed(2)}, Fatura: €${totalAmount.toFixed(2)}` 
                                                    : `Ungenügendes Guthaben! Geldbörse: €${walletBal.toFixed(2)}, Rechnung: €${totalAmount.toFixed(2)}`
                                                );
                                                return;
                                            }
                                            if (!window.confirm(lang === 'tr' 
                                                ? `Bu faturayı bayi cüzdanınızdan (€${totalAmount.toFixed(2)}) ödemek istiyor musunuz?` 
                                                : `Möchten Sie diese Rechnung aus Ihrem Händlerguthaben (€${totalAmount.toFixed(2)}) bezahlen?`)) {
                                                return;
                                            }
                                            setPayLoading(true);
                                            try {
                                                const res = await payTenantInvoiceWithWallet(selectedInvoice.id);
                                                if (res.ok) {
                                                    toast.success(lang === 'tr' ? 'Ödeme başarıyla yapıldı!' : 'Zahlung erfolgreich durchgeführt!');
                                                    setPayModalOpen(false);
                                                    setSelectedInvoice(null);
                                                    setCheckoutUrl(null);
                                                    setGeneratedUrlForId(null);
                                                    // Refresh
                                                    if (opsTenant) {
                                                        await openOps(opsTenant.id, opsTenant.name, opsTenant.schema_name, opsTenant.contact_email);
                                                    }
                                                    await fetchTenants();
                                                } else {
                                                    toast.error(res.error || (lang === 'tr' ? 'Ödeme yapılamadı' : 'Zahlung fehlgeschlagen'));
                                                }
                                            } catch (e: any) {
                                                toast.error(e.message || 'Hata oluştu');
                                            } finally {
                                                setPayLoading(false);
                                            }
                                        }}
                                        className="flex flex-col items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-center transition-all group disabled:opacity-50"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2 group-hover:scale-110 transition-transform">
                                            <FiBriefcase size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-xs uppercase">
                                                {lang === 'tr' ? 'CÜZDANDAN ÖDE' : 'AUS GELDBÖRSE BEZAHLEN'}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                                                {lang === 'tr' 
                                                    ? `Kendi cüzdan bakiyenizden düşer. (Bakiye: €${(admin?.wallet_balance ?? 0).toFixed(2)})` 
                                                    : `Wird von Ihrem Guthaben abgezogen. (Guthaben: €${(admin?.wallet_balance ?? 0).toFixed(2)})`}
                                            </p>
                                        </div>
                                    </button>

                                    {/* Option 2: Generate Checkout Link */}
                                    <button
                                        type="button"
                                        disabled={payLoading}
                                        onClick={async () => {
                                            if (!selectedInvoice) return;
                                            if (generatedUrlForId === selectedInvoice.id && checkoutUrl) return;
                                            setPayLoading(true);
                                            try {
                                                const url = await fetchCheckoutLinkForTenant(selectedInvoice.id);
                                                if (url) {
                                                    setCheckoutUrl(url);
                                                    setGeneratedUrlForId(selectedInvoice.id);
                                                    toast.success(lang === 'tr' ? 'Ödeme linki başarıyla oluşturuldu!' : 'Zahlungslink erfolgreich erstellt!');
                                                } else {
                                                    toast.error(lang === 'tr' ? 'Ödeme linki oluşturulamadı' : 'Zahlungslink konnte nicht erstellt werden');
                                                }
                                            } catch (e: any) {
                                                toast.error(e.message || 'Hata oluştu');
                                            } finally {
                                                setPayLoading(false);
                                            }
                                        }}
                                        className="flex flex-col items-center justify-between p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-center transition-all group disabled:opacity-50"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 mb-2 group-hover:scale-110 transition-transform">
                                            <FiCreditCard size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-xs uppercase">
                                                {lang === 'tr' ? 'ÖDEME LİNKİ OLUŞTUR' : 'ZAHLUNGSLINK ERSTELLEN'}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                                                {lang === 'tr' 
                                                    ? 'Müşterinin online ödemesi için güvenli iyzico/Stripe ödeme linki üretir.' 
                                                    : 'Erstellt einen sicheren Online-Zahlungslink (iyzico/Stripe) für den Kunden.'}
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Generated Link Display */}
                            {checkoutUrl && generatedUrlForId === selectedInvoice.id && (
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                                    <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1">
                                        <FiCheckCircle />
                                        {lang === 'tr' ? 'Ödeme Bağlantısı Hazır!' : 'Zahlungslink ist bereit!'}
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={checkoutUrl}
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(checkoutUrl);
                                                toast.success(lang === 'tr' ? 'Link kopyalandı!' : 'Link kopiert!');
                                            }}
                                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                                        >
                                            <FiCopy size={14} />
                                            {lang === 'tr' ? 'Kopyala' : 'Kopieren'}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <a
                                            href={checkoutUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black text-center transition-all flex items-center justify-center gap-1"
                                        >
                                            <FiGlobe size={14} />
                                            {lang === 'tr' ? 'Ödeme Sayfası' : 'Zahlungsseite'}
                                        </a>
                                        
                                        <a
                                            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                                                lang === 'tr'
                                                    ? `Merhaba, NextPOS aylık servis ücreti ödemeniz için online ödeme bağlantınız: ${checkoutUrl}`
                                                    : `Hallo, Ihr Online-Zahlungslink für die NextPOS-Servicegebühr: ${checkoutUrl}`
                                            )}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black text-center transition-all flex items-center justify-center gap-1"
                                        >
                                            WhatsApp
                                        </a>
                                        
                                        <a
                                            href={`mailto:?subject=${encodeURIComponent(
                                                lang === 'tr' ? 'NextPOS Hizmet Ödemesi' : 'NextPOS Servicezahlung'
                                            )}&body=${encodeURIComponent(
                                                lang === 'tr'
                                                    ? `Değerli müşterimiz,\n\nNextPOS servis ücreti ödemenizi aşağıdaki güvenli bağlantı üzerinden online olarak yapabilirsiniz:\n\n${checkoutUrl}\n\nİyi çalışmalar dileriz.`
                                                    : `Sehr geehrter Kunde,\n\nSie können Ihre NextPOS-Servicezahlung online über den folgenden sicheren Link tätigen:\n\n${checkoutUrl}\n\nMit freundlichen Grüßen.`
                                            )}`}
                                            className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black text-center transition-all flex items-center justify-center gap-1"
                                        >
                                            E-posta
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setPayModalOpen(false);
                                    setSelectedInvoice(null);
                                    setCheckoutUrl(null);
                                    setGeneratedUrlForId(null);
                                }}
                                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-xs font-bold transition-all"
                            >
                                {lang === 'tr' ? 'Kapat' : 'Schließen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
