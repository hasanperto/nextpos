import { useEffect, useMemo, useState } from 'react';
import {
    FiShoppingBag, FiDollarSign, FiUsers, FiClock,
    FiArrowLeft, FiEdit3, FiCopy, FiRefreshCw,
    FiTerminal, FiShield, FiMail, FiPhone, FiUser,
    FiMapPin, FiLock, FiSave, FiAlertTriangle,
} from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages, type Lang } from '../i18n/messages.ts';
import toast from 'react-hot-toast';

function genPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function RestaurantDetailPage({ tenantId, onBack }: { tenantId: string; onBack: () => void }) {
    const { lang, tenants, fetchTenants, updateTenant, token } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;

    useEffect(() => { fetchTenants(); }, [fetchTenants]);

    const tenant = useMemo(() => tenants.find((r) => r.id === tenantId), [tenants, tenantId]);

    const [form, setForm] = useState({
        contact_email: '',
        contact_phone: '',
        authorized_person: '',
        tax_office: '',
        tax_number: '',
        address: '',
        masterPassword: '',
    });
    const [saving, setSaving] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        if (!tenant) return;
        setForm({
            contact_email: tenant.contact_email || '',
            contact_phone: tenant.contact_phone || '',
            authorized_person: tenant.authorized_person || '',
            tax_office: tenant.tax_office || '',
            tax_number: tenant.tax_number || '',
            address: tenant.address || '',
            masterPassword: '',
        });
    }, [tenant]);

    const copyToClipboard = async (text: string, fieldKey: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(fieldKey);
            window.setTimeout(() => setCopiedField((k) => (k === fieldKey ? null : k)), 2000);
        } catch { /* yut */ }
    };

    if (!tenant) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-pulse flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10" />
                    <div className="h-3 w-32 bg-white/5 rounded-full" />
                </div>
            </div>
        );
    }

    const canManage = String(tenant.status || '').toLowerCase() === 'active';

    const statusColor: Record<string, string> = {
        active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        suspended: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        trial: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        inactive: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };

    const planColor =
        tenant.subscription_plan === 'enterprise'
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            : tenant.subscription_plan === 'pro'
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) { toast.error(t('detail.lockedPending')); return; }
        setSaving(true);
        const payload: Record<string, unknown> = {
            contactEmail: form.contact_email || null,
            contactPhone: form.contact_phone || null,
            authorizedPerson: form.authorized_person || null,
            taxOffice: form.tax_office || null,
            taxNumber: form.tax_number || null,
            address: form.address || null,
        };
        if (form.masterPassword.trim()) payload.masterPassword = form.masterPassword.trim();
        const result = await updateTenant(tenant.id, payload);
        setSaving(false);
        if (!result.ok) { toast.error(result.error || t('detail.saveError')); return; }
        setForm((f) => ({ ...f, masterPassword: '' }));
        toast.success(t('detail.saved'));
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* Geri Butonu */}
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors group"
            >
                <FiArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                {t('detail.back')}
            </button>

            {/* Üst Başlık Kartı */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] overflow-hidden shadow-2xl">
                <div className="p-6 sm:p-8 bg-gradient-to-br from-blue-600/10 via-transparent to-indigo-600/5">
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center font-black text-2xl text-blue-400 shadow-2xl shrink-0">
                            {tenant.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-black text-white tracking-tight">{tenant.name}</h2>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-md border uppercase ${statusColor[tenant.status] || statusColor.trial}`}>
                                    {t(`rest.${tenant.status}`) || tenant.status}
                                </span>
                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-md border uppercase ${planColor}`}>
                                    {tenant.subscription_plan}
                                </span>
                                {tenant.contact_email && (
                                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                        <FiMail size={10} /> {tenant.contact_email}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-2 min-w-0">
                                <FiTerminal size={12} className="text-slate-600 shrink-0" />
                                <span className="text-[10px] text-slate-500 font-mono tracking-tight">{tenant.schema_name}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Performans Stat Kartları */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {([
                    { label: t('detail.orders30d'), value: tenant.order_count_30d ?? '—', icon: <FiShoppingBag />, color: 'blue' },
                    { label: t('detail.avgOrder'), value: '—', icon: <FiDollarSign />, color: 'emerald' },
                    { label: t('detail.activeUsers'), value: '—', icon: <FiUsers />, color: 'indigo' },
                    { label: t('detail.lastLogin'), value: tenant.last_login_at ? new Date(tenant.last_login_at).toLocaleDateString('tr-TR') : '—', icon: <FiClock />, color: 'amber' },
                ] as const).map((s) => {
                    const cMap: Record<string, string> = {
                        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/30 group-hover:border-blue-500/50',
                        emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30 group-hover:border-emerald-500/50',
                        indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30 group-hover:border-indigo-500/50',
                        amber: 'text-amber-500 bg-amber-500/10 border-amber-500/30 group-hover:border-amber-500/50',
                    };
                    const cls = cMap[s.color] || cMap.blue;
                    return (
                        <div
                            key={s.label}
                            className={`bg-white/5 p-6 rounded-[24px] border border-white/10 transition-all group overflow-hidden relative ${cls.split(' ').slice(2).join(' ')}`}
                        >
                            <div className={`absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-all ${cls.split(' ')[0]}`}>
                                <span className="[&>svg]:w-[60px] [&>svg]:h-[60px]">{s.icon}</span>
                            </div>
                            <div className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{s.label}</div>
                            <div className="text-2xl font-black text-white mt-1 tracking-tighter">{s.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* Lisans & Teknik Bilgi Paneli */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] overflow-hidden shadow-2xl">
                <div className="p-4 sm:p-6 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <FiShield className="text-blue-400" size={18} />
                    <h3 className="text-base font-bold text-white">{t('detail.licenseInfo') || 'Lisans & Teknik Bilgi'}</h3>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-3">
                        <div className="flex items-start gap-3">
                            <FiEdit3 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                            <div className="min-w-0 flex-1">
                                <span className="font-mono text-slate-400 block text-sm">{tenant.schema_name}</span>
                                <span className="text-[10px] text-slate-500">{t('detail.schemaReadonly') || 'Schema adı değiştirilemez'}</span>
                            </div>
                        </div>

                        <div className="space-y-3 pl-0 sm:pl-8 border-t border-blue-500/20 pt-3">
                            {/* UUID */}
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tenant UUID</span>
                                <div className="flex items-start gap-2">
                                    <span className="font-mono text-[11px] text-slate-200 break-all flex-1 min-w-0">{tenant.id}</span>
                                    <button
                                        type="button"
                                        onClick={() => void copyToClipboard(tenant.id, 'uuid')}
                                        className={`shrink-0 p-1 rounded-md transition-colors ${
                                            copiedField === 'uuid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white hover:bg-white/10'
                                        }`}
                                        title={copiedField === 'uuid' ? t('rest.copied') : t('rest.copyId')}
                                    >
                                        <FiCopy size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Master Password */}
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('detail.masterPassword')}</span>
                                <div className="flex flex-wrap items-start gap-2">
                                    <span className="font-mono text-[11px] text-amber-200/90 break-all flex-1 min-w-0">
                                        {(tenant as any).master_password?.trim() || '••••••••'}
                                    </span>
                                    {(tenant as any).master_password?.trim() ? (
                                        <button
                                            type="button"
                                            onClick={() => void copyToClipboard((tenant as any).master_password!.trim(), 'master')}
                                            className={`shrink-0 p-1 rounded-md transition-colors ${
                                                copiedField === 'master' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white hover:bg-white/10'
                                            }`}
                                        >
                                            <FiCopy size={14} />
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            {/* Kapasite */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('rest.tableCapacity') || 'Kapasite'}</span>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-sm font-black text-white tabular-nums">{(tenant as any).max_branches ?? '—'}</span>
                                        <span className="text-[10px] text-slate-500">şube</span>
                                        <span className="text-slate-600 mx-1">/</span>
                                        <span className="text-sm font-black text-white tabular-nums">{(tenant as any).max_users ?? '—'}</span>
                                        <span className="text-[10px] text-slate-500">kullanıcı</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('rest.tableCreated') || 'Oluşturma'}</span>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-slate-300">
                                            {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString('tr-TR') : '—'}
                                        </span>
                                        <span className="text-[9px] text-slate-500 uppercase font-black">
                                            {tenant.created_at ? new Date(tenant.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-500 pt-1">{t('detail.manageHint')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Yönetim Formu */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[24px] overflow-hidden shadow-2xl">
                <div className="p-4 sm:p-6 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <FiEdit3 className="text-blue-400" size={18} />
                    <h3 className="text-base font-bold text-white">{t('detail.manageTitle')}</h3>
                </div>

                <div className="p-4 sm:p-6">
                    {!canManage && (
                        <div className="mb-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-start gap-3">
                            <FiAlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-bold text-amber-200">{t('detail.lockedPending')}</p>
                                <p className="text-[10px] text-amber-300/70 mt-0.5">{t('rest.awaitingPaymentApproval')}</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-5">
                        {/* İletişim */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                    <FiMail size={12} className="text-blue-400" />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('detail.sectionContact') || 'İletişim Bilgileri'}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FieldInput
                                    icon={<FiMail size={14} />}
                                    label={t('detail.contactEmail')}
                                    value={form.contact_email}
                                    onChange={(v) => setForm((f) => ({ ...f, contact_email: v }))}
                                    type="email"
                                    disabled={!canManage}
                                />
                                <FieldInput
                                    icon={<FiPhone size={14} />}
                                    label={t('detail.contactPhone')}
                                    value={form.contact_phone}
                                    onChange={(v) => setForm((f) => ({ ...f, contact_phone: v }))}
                                    disabled={!canManage}
                                />
                            </div>
                        </div>

                        {/* Yetkili & Vergi */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                    <FiUser size={12} className="text-emerald-400" />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('detail.sectionLegal') || 'Yetkili & Vergi'}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FieldInput
                                    icon={<FiUser size={14} />}
                                    label={t('detail.authorizedPerson')}
                                    value={form.authorized_person}
                                    onChange={(v) => setForm((f) => ({ ...f, authorized_person: v }))}
                                    disabled={!canManage}
                                />
                                <FieldInput
                                    label={t('detail.taxOffice')}
                                    value={form.tax_office}
                                    onChange={(v) => setForm((f) => ({ ...f, tax_office: v }))}
                                    disabled={!canManage}
                                />
                                <FieldInput
                                    label={t('detail.taxNumber')}
                                    value={form.tax_number}
                                    onChange={(v) => setForm((f) => ({ ...f, tax_number: v }))}
                                    disabled={!canManage}
                                />
                            </div>
                        </div>

                        {/* Güvenlik */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                    <FiLock size={12} className="text-amber-400" />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('detail.sectionSecurity') || 'Güvenlik'}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                                        {t('detail.masterPassword')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={form.masterPassword}
                                            onChange={(e) => setForm((f) => ({ ...f, masterPassword: e.target.value }))}
                                            placeholder="Yeni şifre girin (opsiyonel)"
                                            disabled={!canManage}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => canManage && setForm((f) => ({ ...f, masterPassword: genPassword() }))}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 disabled:opacity-40"
                                            disabled={!canManage}
                                        >
                                            <FiRefreshCw size={12} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-1">{t('detail.masterPasswordHint') || 'Boş bırakırsanız mevcut şifre korunur'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Adres */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                    <FiMapPin size={12} className="text-indigo-400" />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('detail.sectionAddress') || 'Adres'}</span>
                            </div>
                            <textarea
                                value={form.address}
                                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                                rows={3}
                                disabled={!canManage}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder-slate-600 resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                                placeholder={t('detail.addressPlaceholder') || 'Tam adres…'}
                            />
                        </div>

                        <TenantAddonsSection tenantId={tenantId} canManage={canManage} token={token} lang={lang} />

                        {/* QR Web Menu Domain */}
                        <QrDomainSection tenantId={tenantId} canManage={canManage} />

                        {/* Uyarı */}
                        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 flex items-start gap-3">
                            <FiAlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                            <p className="text-[11px] text-red-200">{t('detail.backupDisabled')}</p>
                        </div>

                        {/* Kaydet */}
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onBack}
                                className="px-5 py-2.5 rounded-xl text-slate-400 hover:bg-white/10 font-bold text-sm transition-all"
                            >
                                {t('detail.back')}
                            </button>
                            <button
                                type="submit"
                                disabled={saving || !canManage}
                                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm disabled:opacity-50 shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
                            >
                                <FiSave size={16} />
                                {saving ? t('detail.saving') : t('detail.save')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

type EntRow = {
    code: string;
    name: string;
    mode: string;
    enabled: boolean;
    setup_price?: number;
    monthly_price?: number;
};

function TenantAddonsSection({
    tenantId,
    canManage,
    token,
    lang,
}: {
    tenantId: string;
    canManage: boolean;
    token: string | null;
    lang: Lang;
}) {
    const t = (k: string) => messages[lang][k] || k;
    const [ents, setEnts] = useState<EntRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyCode, setBusyCode] = useState<string | null>(null);

    const load = async () => {
        if (!token) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/billing/tenants/${encodeURIComponent(tenantId)}/entitlements`, {
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
    }, [tenantId, token]);

    const buy = async (code: string, payment_method: 'wallet_balance' | 'bank_transfer' | 'admin_card' | 'cash') => {
        if (!token || !canManage) return;
        setBusyCode(code);
        try {
            const res = await fetch(`/api/v1/billing/tenants/${encodeURIComponent(tenantId)}/addons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ module_codes: [code], payment_method }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(json.error || t('detail.addonsErr'));
                return;
            }
            toast.success(t('detail.addonsOk'));
            await load();
        } catch {
            toast.error(t('detail.addonsErr'));
        } finally {
            setBusyCode(null);
        }
    };

    const candidates = ents.filter((e) => e.mode === 'addon' && !e.enabled);

    if (!canManage) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <FiShield className="text-emerald-400" size={16} />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('detail.addonsTitle')}</span>
            </div>
            {loading ? (
                <p className="text-xs text-slate-500">{t('detail.addonsLoading')}</p>
            ) : candidates.length === 0 ? (
                <p className="text-xs text-slate-600">{t('detail.addonsNone')}</p>
            ) : (
                <div className="space-y-2">
                    {candidates.map((e) => (
                        <div
                            key={e.code}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                        >
                            <div>
                                <p className="text-sm font-bold text-white">{e.name}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{e.code}</p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 mr-2">Setup: €{Number(e.setup_price ?? 0).toFixed(2)}</span>
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Aylık: €{Number(e.monthly_price ?? 0).toFixed(2)}</span>
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2 sm:mt-0 justify-end w-full sm:w-auto">
                                <button
                                    type="button"
                                    disabled={busyCode === e.code}
                                    onClick={() => { if(window.confirm(`Modül: ${e.name}\nÖdeme Yöntemi: Bakiye\nOnaylıyor musunuz?`)) void buy(e.code, 'wallet_balance'); }}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-[10px] font-black text-white disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    Bakiye
                                </button>
                                <button
                                    type="button"
                                    disabled={busyCode === e.code}
                                    onClick={() => { if(window.confirm(`Modül: ${e.name}\nÖdeme Yöntemi: Kredi Kartı\nOnaylıyor musunuz?`)) void buy(e.code, 'admin_card'); }}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-[10px] font-black text-white disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    Kart
                                </button>
                                <button
                                    type="button"
                                    disabled={busyCode === e.code}
                                    onClick={() => { if(window.confirm(`Modül: ${e.name}\nÖdeme Yöntemi: Havale\nOnaylıyor musunuz?`)) void buy(e.code, 'bank_transfer'); }}
                                    className="px-3 py-1.5 rounded-lg border border-white/20 text-[10px] font-black text-slate-200 hover:bg-white/10 disabled:opacity-50 transition-colors"
                                >
                                    Havale
                                </button>
                                <button
                                    type="button"
                                    disabled={busyCode === e.code}
                                    onClick={() => { if(window.confirm(`Modül: ${e.name}\nÖdeme Yöntemi: Nakit\nOnaylıyor musunuz?`)) void buy(e.code, 'cash'); }}
                                    className="px-3 py-1.5 rounded-lg border border-white/20 text-[10px] font-black text-slate-200 hover:bg-white/10 disabled:opacity-50 transition-colors"
                                >
                                    Nakit
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function QrDomainSection({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
    const { fetchQrDomains, addQrDomain, deleteQrDomain, updateQrDomain } = useResellerStore();
    const [domains, setDomains] = useState<any[]>([]);
    const [newDomain, setNewDomain] = useState('');
    const [loading, setLoading] = useState(false);

    const load = async () => { setDomains(await fetchQrDomains(tenantId)); };
    useEffect(() => { load(); }, [tenantId]);

    const handleAdd = async () => {
        if (!newDomain.trim()) return;
        setLoading(true);
        const ok = await addQrDomain(tenantId, newDomain.trim().toLowerCase());
        if (ok) { toast.success('Domain eklendi'); setNewDomain(''); await load(); }
        else toast.error('Domain eklenemedi');
        setLoading(false);
    };

    const handleDelete = async (id: number) => {
        const ok = await deleteQrDomain(tenantId, id);
        if (ok) { toast.success('Domain silindi'); await load(); }
    };

    const handleToggle = async (id: number, isActive: boolean) => {
        await updateQrDomain(tenantId, id, !isActive);
        await load();
    };

    return (
        <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">QR Web Menü Domain</label>
            {domains.map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
                    <span className={`w-2 h-2 rounded-full ${d.isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="flex-1 text-sm text-white font-mono">{d.domain}</span>
                    <a href={`https://${d.domain}`} target="_blank" rel="noopener" className="text-[10px] text-blue-400 hover:underline">Aç</a>
                    {canManage && (
                        <>
                            <button type="button" onClick={() => handleToggle(d.id, d.isActive)} className="text-[10px] text-yellow-400 hover:underline">
                                {d.isActive ? 'Pasif Yap' : 'Aktif Yap'}
                            </button>
                            <button type="button" onClick={() => handleDelete(d.id)} className="text-[10px] text-red-400 hover:underline">Sil</button>
                        </>
                    )}
                </div>
            ))}
            {canManage && (
                <div className="flex gap-2">
                    <input
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
                        placeholder="qrpizza.webotonom.de"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600"
                    />
                    <button type="button" onClick={handleAdd} disabled={loading || !newDomain.trim()}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs disabled:opacity-50 hover:bg-blue-500 transition-all">
                        Ekle
                    </button>
                </div>
            )}
        </div>
    );
}

function FieldInput({ label, value, onChange, type = 'text', icon, disabled }: {
    label: string; value: string; onChange: (v: string) => void;
    type?: string; icon?: React.ReactNode; disabled?: boolean;
}) {
    return (
        <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">{label}</label>
            <div className="relative">
                {icon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
                )}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className={`w-full bg-white/5 border border-white/10 rounded-xl ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all`}
                />
            </div>
        </div>
    );
}
