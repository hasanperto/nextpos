import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FiBell, FiGlobe, FiShield, FiUser } from 'react-icons/fi';
import { useResellerStore } from '../store/useResellerStore.ts';
import { messages } from '../i18n/messages.ts';

type Prefs = {
    mailAlerts: boolean;
    overdueAlerts: boolean;
};

const PREF_KEY = 'reseller_prefs_v1';

function readPrefs(): Prefs {
    try {
        const raw = localStorage.getItem(PREF_KEY);
        if (!raw) return { mailAlerts: true, overdueAlerts: true };
        const p = JSON.parse(raw) as Partial<Prefs>;
        return {
            mailAlerts: p.mailAlerts !== false,
            overdueAlerts: p.overdueAlerts !== false,
        };
    } catch {
        return { mailAlerts: true, overdueAlerts: true };
    }
}

export function SettingsPage() {
    const { admin, lang, setLang, token } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;
    const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState({
        name: admin?.name || '',
        email: admin?.email || '',
        phone: '',
        mobile_phone: '',
        contact_person: '',
        company_name: '',
        tax_number: '',
        tax_office: '',
        billing_address: '',
        city: '',
        district: '',
        postal_code: '',
        country: 'Türkiye',
        two_factor_enabled: false,
        two_factor_method: 'none',
        backup_codes_remaining: 0,
    });
    const [passwordForm, setPasswordForm] = useState({
        current_password: '',
        new_password: '',
        new_password_repeat: '',
    });
    const [authSetup, setAuthSetup] = useState<{ secret: string; qr_url: string; otpauth_url: string } | null>(null);
    const [authCode, setAuthCode] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    const roleLabel = useMemo(() => {
        if (!admin?.role) return 'reseller';
        return String(admin.role);
    }, [admin?.role]);

    const loadProfile = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/reseller/profile', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (!res.ok) {
                toast.error(String(json.error || 'Profil alınamadı'));
                return;
            }
            setProfile((p) => ({
                ...p,
                name: String(json.name || ''),
                email: String(json.email || ''),
                phone: String(json.phone || ''),
                mobile_phone: String(json.mobile_phone || ''),
                contact_person: String(json.contact_person || ''),
                company_name: String(json.company_name || ''),
                tax_number: String(json.tax_number || ''),
                tax_office: String(json.tax_office || ''),
                billing_address: String(json.billing_address || ''),
                city: String(json.city || ''),
                district: String(json.district || ''),
                postal_code: String(json.postal_code || ''),
                country: String(json.country || 'Türkiye'),
                two_factor_enabled: Boolean(json.two_factor_enabled),
                two_factor_method: String(json.two_factor_method || 'none'),
                backup_codes_remaining: Number(json.backup_codes_remaining || 0),
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const saveProfile = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/reseller/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(profile),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!res.ok) {
                toast.error(json.error || 'Profil kaydedilemedi');
                return;
            }
            toast.success(json.message || 'Profil güncellendi');
        } finally {
            setLoading(false);
        }
    };

    const changePassword = async () => {
        if (!token) return;
        if (passwordForm.new_password.length < 8) {
            toast.error('Yeni şifre en az 8 karakter olmalı');
            return;
        }
        if (passwordForm.new_password !== passwordForm.new_password_repeat) {
            toast.error('Yeni şifre tekrarı uyuşmuyor');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/reseller/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    current_password: passwordForm.current_password,
                    new_password: passwordForm.new_password,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!res.ok) {
                toast.error(json.error || 'Şifre güncellenemedi');
                return;
            }
            setPasswordForm({ current_password: '', new_password: '', new_password_repeat: '' });
            toast.success(json.message || 'Şifre güncellendi');
        } finally {
            setLoading(false);
        }
    };

    const savePrefs = () => {
        try {
            localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
            toast.success('Ayarlar kaydedildi');
        } catch {
            toast.error('Ayarlar kaydedilemedi');
        }
    };

    const setupAuthenticator = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/reseller/2fa/authenticator/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ issuer: 'NextPOS' }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                secret?: string;
                qr_url?: string;
                otpauth_url?: string;
            };
            if (!res.ok || !json.secret || !json.qr_url || !json.otpauth_url) {
                toast.error(json.error || 'Authenticator setup olusturulamadi');
                return;
            }
            setAuthSetup({
                secret: String(json.secret),
                qr_url: String(json.qr_url),
                otpauth_url: String(json.otpauth_url),
            });
            toast.success('Authenticator setup hazir');
        } finally {
            setLoading(false);
        }
    };

    const verifyAuthenticator = async () => {
        if (!token) return;
        if (!authCode.trim()) {
            toast.error('Authenticator kodunu girin');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/reseller/2fa/authenticator/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ code: authCode.trim() }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!res.ok) {
                toast.error(json.error || 'Authenticator dogrulanamadi');
                return;
            }
            toast.success(json.message || 'Authenticator etkin');
            setAuthCode('');
            setAuthSetup(null);
            await loadProfile();
        } finally {
            setLoading(false);
        }
    };

    const regenerateBackupCodes = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/tenants/reseller/2fa/backup-codes/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                codes?: string[];
            };
            if (!res.ok || !Array.isArray(json.codes)) {
                toast.error(json.error || 'Backup kodlar yenilenemedi');
                return;
            }
            setBackupCodes(json.codes.map(String));
            toast.success(json.message || 'Backup kodlar olusturuldu');
            await loadProfile();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in">
            <p className="text-slate-500 text-sm">{t('settings.subtitle')}</p>

            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-wider">
                    <FiUser className="text-blue-300" /> {t('settings.profile')}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.name')}</p>
                        <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.email')}</p>
                        <input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500">{t('settings.role')}</p>
                        <p className="text-white font-bold">{roleLabel}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500">{t('settings.commissionRate')}</p>
                        <p className="text-white font-bold">%{Number(admin?.commission_rate || 0).toFixed(0)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.phone')}</p>
                        <input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.mobile')}</p>
                        <input value={profile.mobile_phone} onChange={(e) => setProfile((p) => ({ ...p, mobile_phone: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.company')}</p>
                        <input value={profile.company_name} onChange={(e) => setProfile((p) => ({ ...p, company_name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.contactPerson')}</p>
                        <input value={profile.contact_person} onChange={(e) => setProfile((p) => ({ ...p, contact_person: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.taxNumber')}</p>
                        <input value={profile.tax_number} onChange={(e) => setProfile((p) => ({ ...p, tax_number: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.taxOffice')}</p>
                        <input value={profile.tax_office} onChange={(e) => setProfile((p) => ({ ...p, tax_office: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 md:col-span-2">
                        <p className="text-slate-500 mb-1">{t('settings.billingAddress')}</p>
                        <textarea value={profile.billing_address} onChange={(e) => setProfile((p) => ({ ...p, billing_address: e.target.value }))} rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.city')}</p>
                        <input value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.district')}</p>
                        <input value={profile.district} onChange={(e) => setProfile((p) => ({ ...p, district: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.postalCode')}</p>
                        <input value={profile.postal_code} onChange={(e) => setProfile((p) => ({ ...p, postal_code: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-slate-500 mb-1">{t('settings.country')}</p>
                        <input value={profile.country} onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white" />
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black disabled:opacity-50"
                >
                    {t('settings.saveProfile')}
                </button>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-wider">
                    <FiGlobe className="text-cyan-300" /> {t('settings.uiLanguage')}
                </div>
                <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as 'tr' | 'de' | 'en')}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                >
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                    <option value="tr">Türkçe</option>
                </select>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-wider">
                    <FiBell className="text-amber-300" /> {t('settings.notificationsSecurity')}
                </div>
                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="text-slate-300">{t('settings.showMailLogs')}</span>
                    <input type="checkbox" checked={prefs.mailAlerts} onChange={(e) => setPrefs((p) => ({ ...p, mailAlerts: e.target.checked }))} />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="text-slate-300">{t('settings.highlightOverdue')}</span>
                    <input type="checkbox" checked={prefs.overdueAlerts} onChange={(e) => setPrefs((p) => ({ ...p, overdueAlerts: e.target.checked }))} />
                </label>
                <button
                    type="button"
                    onClick={savePrefs}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black"
                >
                    {t('settings.save')}
                </button>
                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="text-slate-300">{t('settings.twoFactorEnabled')}</span>
                    <input
                        type="checkbox"
                        checked={profile.two_factor_enabled}
                        onChange={(e) => setProfile((p) => ({ ...p, two_factor_enabled: e.target.checked }))}
                    />
                </label>
                <select
                    value={profile.two_factor_method}
                    onChange={(e) => setProfile((p) => ({ ...p, two_factor_method: e.target.value }))}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                >
                    <option value="none">{t('settings.twoFactorNone')}</option>
                    <option value="email">{t('settings.twoFactorEmail')}</option>
                    <option value="authenticator">{t('settings.twoFactorAuthenticator')}</option>
                </select>
                <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black disabled:opacity-50"
                >
                    {t('settings.saveSecurity')}
                </button>
                {profile.two_factor_method === 'authenticator' && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                        <button
                            type="button"
                            onClick={() => void setupAuthenticator()}
                            disabled={loading}
                            className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold disabled:opacity-50"
                        >
                            Authenticator setup baslat
                        </button>
                        {authSetup && (
                            <div className="space-y-2">
                                <img src={authSetup.qr_url} alt="Authenticator QR" className="w-44 h-44 rounded-lg border border-white/10" />
                                <p className="text-[11px] text-slate-400 break-all">{authSetup.secret}</p>
                                <p className="text-[10px] text-slate-500 break-all">{authSetup.otpauth_url}</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={authCode}
                                        onChange={(e) => setAuthCode(e.target.value)}
                                        placeholder="000000"
                                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white tracking-[0.3em] font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void verifyAuthenticator()}
                                        disabled={loading}
                                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        Dogrula ve etkinlestir
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {profile.two_factor_enabled && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-300">Backup kodlar kalan: {profile.backup_codes_remaining}</p>
                            <button
                                type="button"
                                onClick={() => void regenerateBackupCodes()}
                                disabled={loading}
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold disabled:opacity-50"
                            >
                                Backup kod yenile
                            </button>
                        </div>
                        {backupCodes.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                                {backupCodes.map((c) => (
                                    <code key={c} className="px-2 py-1 rounded bg-slate-950/70 border border-white/10 text-[11px] text-amber-300">
                                        {c}
                                    </code>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-wider mb-2">
                    <FiShield className="text-emerald-300" /> {t('settings.changePassword')}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                        type="password"
                        placeholder={t('settings.currentPassword')}
                        value={passwordForm.current_password}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, current_password: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                    />
                    <input
                        type="password"
                        placeholder={t('settings.newPassword')}
                        value={passwordForm.new_password}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, new_password: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                    />
                    <input
                        type="password"
                        placeholder={t('settings.newPasswordRepeat')}
                        value={passwordForm.new_password_repeat}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, new_password_repeat: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => void changePassword()}
                    disabled={loading}
                    className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black disabled:opacity-50"
                >
                    {t('settings.updatePassword')}
                </button>
            </section>
        </div>
    );
}
