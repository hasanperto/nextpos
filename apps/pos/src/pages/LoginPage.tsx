import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiLock, FiUser, FiHash, FiDatabase, FiArrowRight, FiDelete, FiShield, FiExternalLink, FiMail, FiGlobe } from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { usePosStore } from '../store/usePosStore';
import { POS_LANGS } from '../i18n/posMessages';

const PWA_PREFERRED_PATH_KEY = 'nextpos_pwa_preferred_path';

// Language Switcher Component
const LangSwitcher: React.FC = () => {
    const { lang, setLang } = usePosStore();
    return (
        <div className="flex items-center gap-1.5 bg-white/[0.03] p-1 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl">
            {POS_LANGS.map((l) => (
                <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        lang === l.code 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/10' 
                            : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                    }`}
                    title={l.label}
                >
                    <span className="text-lg filter grayscale-[0.2] hover:grayscale-0 transition-all">{l.emoji}</span>
                </button>
            ))}
        </div>
    );
};

function defaultPathForRole(role?: string): string {
    switch (role) {
        case 'admin':
            return '/admin';
        case 'cashier':
            return '/cashier';
        case 'waiter':
            return '/waiter';
        case 'kitchen':
            return '/kitchen/hot';
        case 'courier':
            return '/courier';
        default:
            return '/';
    }
}

function allowedPathForRole(path: string, role?: string): boolean {
    const p = path.replace(/\/$/, '') || '/';
    if (!role) return false;
    if (role === 'admin') {
        return ['/admin', '/cashier', '/waiter', '/kitchen', '/courier', '/handover', '/queue'].some(
            (x) => p === x || p.startsWith(`${x}/`),
        );
    }
    if (role === 'cashier') {
        return ['/cashier', '/handover', '/kitchen', '/queue'].some((x) => p === x || p.startsWith(`${x}/`));
    }
    if (role === 'waiter') return p === '/waiter' || p.startsWith('/waiter/');
    if (role === 'kitchen') return p === '/kitchen' || p.startsWith('/kitchen/');
    if (role === 'courier') return p === '/courier' || p.startsWith('/courier/');
    return false;
}

/** PWA “girişten sonra” tercihi; role uygun değilse varsayılan panele düşer. */
export function resolvePostLoginPath(role?: string): string {
    const fallback = defaultPathForRole(role);
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(PWA_PREFERRED_PATH_KEY);
    if (!raw || raw === 'auto') return fallback;
    const pref = raw.trim();
    if (!pref) return fallback;
    const norm = pref.replace(/\/$/, '') || '/';
    if (!allowedPathForRole(norm, role)) return fallback;
    return pref.startsWith('/') ? pref : `/${pref}`;
}

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { t } = usePosLocale();
    const [searchParams] = useSearchParams();
    const { login, loginWithPin, tenantId, setTenantId, logout, isAuthenticated, tenantName, clearTenant } = useAuthStore();
    const [mode, setMode] = useState<'credentials' | 'pin'>('credentials');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [localTenantId, setLocalTenantId] = useState(tenantId || '');
    const [linkedName, setLinkedName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    useLayoutEffect(() => {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(PWA_PREFERRED_PATH_KEY) ?? 'auto';
        if (raw === 'auto') localStorage.removeItem(PWA_PREFERRED_PATH_KEY);
        else localStorage.setItem(PWA_PREFERRED_PATH_KEY, raw);
    }, []);

    useLayoutEffect(() => {
        const deviceHint = searchParams.get('device')?.trim() || searchParams.get('deviceId')?.trim();
        if (!deviceHint) return;
        try {
            localStorage.setItem('nextpos_device_id_v1', deviceHint);
        } catch {
        }
    }, [searchParams]);

    /** SaaS / derin bağlantı: ?tenant=UUID&name=...&user=admin — önceki POS oturumunu kapatıp hedef kiracıya kilitlenir */
    useLayoutEffect(() => {
        const tid = searchParams.get('tenant')?.trim();
        if (!tid) return;
        const nameRaw = searchParams.get('name');
        const userHint = searchParams.get('user')?.trim();
        logout();
        setTenantId(tid);
        setLocalTenantId(tid);
        setLinkedName(nameRaw ? decodeURIComponent(nameRaw) : null);
        if (userHint) setUsername(userHint);
        else setUsername('admin');
        setPassword('');
        setPin('');
        setError('');
    }, [searchParams, logout, setTenantId]);

    // Zaten giriş yapılmışsa, role göre yönlendir (URL'de tenant= yoksa — derin bağlantıda önce logout ile temizlenir)
    useEffect(() => {
        if (isAuthenticated && !searchParams.get('tenant')?.trim()) {
            const currentRole = useAuthStore.getState().user?.role;
            navigate(resolvePostLoginPath(currentRole), { replace: true });
        }
    }, [isAuthenticated, navigate, searchParams]);

    /** Kurumsal/Kurye Cihazı Hafızası: Uygulama açılışında son restoran kimliğini yükle */
    useEffect(() => {
        if (!tenantId) {
            const lastId = localStorage.getItem('last_tenant_id');
            if (lastId) setLocalTenantId(lastId);
        }
    }, [tenantId]);

    const saveTenantId = (tid: string) => {
        localStorage.setItem('last_tenant_id', tid);
    };

    const handleCredentialLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!localTenantId.trim()) { setError(t('auth.error.tenantRequired')); return; }
        if (!username.trim()) { setError(t('auth.error.usernameRequired')); return; }
        if (!password) { setError(t('auth.error.passwordRequired')); return; }

        setError('');
        setIsLoading(true);
        const tid = localTenantId.trim();
        setTenantId(tid);

        try {
            await login(username.trim(), password, tid);
            saveTenantId(tid);
            const currentUserRole = useAuthStore.getState().user?.role;
            navigate(resolvePostLoginPath(currentUserRole), { replace: true });
        } catch (err: any) {
            console.error('Login error:', err);
            let msg = err.message || t('auth.error.invalidCredentials');
            if (msg.includes('pasif')) {
                msg = t('auth.error.tenantInactive');
            } else if (msg.includes('bulunamadı')) {
                msg = t('auth.error.tenantNotFound');
            } else if (msg.includes('Invalid credentials') || msg.includes('Giriş başarısız')) {
                msg = t('auth.error.invalidCredentials');
            }
            setError(msg);
        }
        setIsLoading(false);
    };

    const doPinLogin = useCallback(async (pinCode: string) => {
        if (pinCode.length !== 6) return;
        const tid = localTenantId.trim();
        if (!tid) { setError(t('auth.error.tenantRequired')); return; }

        setError('');
        setIsLoading(true);
        setTenantId(tid);

        try {
            await loginWithPin(pinCode, tid);
            saveTenantId(tid);
            const currentUserRole = useAuthStore.getState().user?.role;
            navigate(resolvePostLoginPath(currentUserRole), { replace: true });
        } catch (err: any) {
            console.error('PIN error:', err);
            let msg = err.message || t('auth.error.invalidPin');
            if (msg.includes('pasif')) {
                msg = t('auth.error.tenantInactive');
            } else if (msg.includes('bulunamadı')) {
                msg = t('auth.error.tenantNotFound');
            } else if (msg.includes('PIN geçersiz') || msg.includes('Invalid credentials')) {
                msg = t('auth.error.invalidPin');
            }
            setError(msg);
            setPin('');
        }
        setIsLoading(false);
    }, [localTenantId, loginWithPin, navigate, setTenantId, t]);

    const handlePinPad = (digit: string) => {
        if (pin.length >= 6) return;
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 6) {
            // Pass newPin directly to avoid closure issue
            setTimeout(() => doPinLogin(newPin), 200);
        }
    };

    const handlePinDelete = () => setPin(pin.slice(0, -1));

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-[-20%] left-[-15%] w-[50vw] h-[50vw] bg-emerald-600/8 rounded-full blur-[150px] animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-15%] w-[45vw] h-[45vw] bg-teal-500/8 rounded-full blur-[150px]" style={{ animationDelay: '1s', animationDuration: '4s' }} />
                <div className="absolute top-[30%] right-[10%] w-[30vw] h-[30vw] bg-cyan-500/5 rounded-full blur-[120px]" style={{ animationDelay: '2s', animationDuration: '6s' }} />
            </div>

            {/* Language Switcher - Floats at top right */}
            <div className="absolute top-6 right-6 z-50">
                <LangSwitcher />
            </div>

            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                backgroundSize: '60px 60px'
            }} />

            <div className="w-full max-w-[480px] relative z-10">
                {/* Logo Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-2xl shadow-emerald-500/20 mb-5 relative">
                        <FiShield size={36} className="text-white" />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-2 border-[#0a0f1a] animate-pulse" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">
                        Next<span className="text-emerald-400">POS</span>
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm font-medium">
                        {t('auth.tagline')}
                    </p>
                </div>

                {/* Main Card */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden shadow-2xl">

                    {linkedName && (
                        <div className="mx-8 mt-6 mb-0 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300/95 text-xs font-semibold flex items-start gap-2">
                            <FiExternalLink className="shrink-0 mt-0.5 opacity-80" size={14} />
                            <span>
                                <span className="text-[10px] uppercase tracking-wider text-emerald-500/80 block mb-0.5">{t('auth.linkedSchema')}</span>
                                {t('auth.linkedHint').replace('{{name}}', linkedName)}
                            </span>
                        </div>
                    )}

                    {/* Tenant ID Section */}
                    <div className="px-8 pt-8 pb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[2px] mb-2 flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1.5"><FiDatabase size={10} /> {t('auth.tenantLabel')}</span>
                            {tenantName && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearTenant();
                                        setLocalTenantId('');
                                    }}
                                    className="text-[9px] text-emerald-500 hover:text-emerald-400 font-bold underline cursor-pointer bg-transparent border-none p-0"
                                >
                                    {t('auth.changeTenant')}
                                </button>
                            )}
                        </label>
                        {tenantName ? (
                            <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 font-bold text-sm flex items-center shadow-inner">
                                🍕 {tenantName}
                            </div>
                        ) : (
                            <input
                                id="tenant-id-input"
                                type="text"
                                value={localTenantId}
                                onChange={(e) => setLocalTenantId(e.target.value)}
                                placeholder={t('auth.tenantPlaceholder')}
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white/90 text-xs font-mono outline-none focus:border-emerald-500/40 focus:bg-white/[0.06] transition-all placeholder:text-white/20"
                            />
                        )}
                    </div>

                    {/* Mode Tabs */}
                    <div className="flex mx-8 mt-2 mb-4 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
                        <button
                            onClick={() => { setMode('credentials'); setError(''); }}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mode === 'credentials' ? 'bg-emerald-500/15 text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <FiUser size={13} /> {t('auth.usernameLabel')}
                        </button>
                        <button
                            onClick={() => { setMode('pin'); setError(''); }}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mode === 'pin' ? 'bg-emerald-500/15 text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <FiHash size={13} /> {t('auth.pinLogin')}
                        </button>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="mx-8 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex flex-col items-center gap-2 text-center shadow-inner">
                            <span className="leading-relaxed">{error}</span>
                            {(error.includes('pasif') || error.includes('yönetimle') || error.includes('Sistem kaydı bulunamadı')) && (
                                <a 
                                    href={`mailto:destek@nextpos.com?subject=NextPOS%20Giriş%20Desteği%20Talebi&body=${t('auth.supportMsg')}%0A%0ATenant%20ID:%20${localTenantId}%0AHata:%20${error}`}
                                    className="mt-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                    <FiMail size={14} /> {t('auth.contactSupport')}
                                </a>
                            )}
                        </div>
                    )}

                    {/* Credentials Form */}
                    {mode === 'credentials' && (
                        <form onSubmit={handleCredentialLogin} className="px-8 pb-8 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[2px] mb-2 block">{t('auth.usernameLabel')}</label>
                                <div className="relative">
                                    <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                    <input
                                        id="username-input"
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-11 pr-4 py-3.5 text-white outline-none focus:border-emerald-500/40 focus:bg-white/[0.06] transition-all font-medium"
                                        placeholder={t('auth.usernamePlaceholder')}
                                        autoComplete="username"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[2px] mb-2 block">{t('auth.passwordLabel')}</label>
                                <div className="relative">
                                    <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                    <input
                                        id="password-input"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-11 pr-4 py-3.5 text-white outline-none focus:border-emerald-500/40 focus:bg-white/[0.06] transition-all font-medium"
                                        placeholder={t('auth.passwordPlaceholder')}
                                        autoComplete="current-password"
                                    />
                                </div>
                            </div>

                            <button
                                id="login-button"
                                type="submit"
                                disabled={isLoading || !username || !password}
                                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed py-4 rounded-xl text-white font-black text-sm shadow-xl shadow-emerald-600/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>{t('auth.loginBtn')} <FiArrowRight /></>
                                )}
                            </button>
                        </form>
                    )}

                    {/* PIN Form */}
                    {mode === 'pin' && (
                        <div className="px-8 pb-8">
                            {/* PIN Display */}
                            <div className="flex justify-center gap-3 mb-6">
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div
                                        key={i}
                                        className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all duration-200 ${
                                            pin[i]
                                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400 scale-105'
                                                : i === pin.length
                                                    ? 'border-white/20 bg-white/[0.04] animate-pulse'
                                                    : 'border-white/[0.06] bg-white/[0.02]'
                                        }`}
                                    >
                                        {pin[i] ? '•' : ''}
                                    </div>
                                ))}
                            </div>

                            {/* Number Pad */}
                            <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => handlePinPad(String(n))}
                                        className="h-14 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-xl font-bold hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-95 active:bg-emerald-500/10 transition-all"
                                    >
                                        {n}
                                    </button>
                                ))}
                                <div /> {/* Empty space */}
                                <button
                                    onClick={() => handlePinPad('0')}
                                    className="h-14 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-xl font-bold hover:bg-white/[0.08] active:scale-95 transition-all"
                                >
                                    0
                                </button>
                                <button
                                    onClick={handlePinDelete}
                                    className="h-14 rounded-xl bg-white/[0.04] border border-white/[0.06] text-red-400 flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/20 active:scale-95 transition-all"
                                >
                                    <FiDelete size={22} />
                                </button>
                            </div>

                            {isLoading && (
                                <div className="flex justify-center mt-4">
                                    <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Updated Footer Styling */}
                <div className="text-center mt-10">
                    <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <span className="w-8 h-[1px] bg-white/10" />
                        {t('auth.footer')}
                        <span className="w-8 h-[1px] bg-white/10" />
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-4 text-[9px] text-slate-700 font-bold">
                        <span className="flex items-center gap-1"><FiGlobe size={10} /> MULTI-TENANT</span>
                        <span className="flex items-center gap-1"><FiShield size={10} /> SECURE</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
