import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    FiBriefcase,
    FiDatabase,
    FiDollarSign,
    FiMessageSquare,
    FiMenu,
    FiPower,
    FiShield,
    FiAlertTriangle,
    FiBox,
    FiPieChart,
    FiShoppingCart,
    FiSettings,
    FiX,
} from 'react-icons/fi';
import { useResellerStore } from './store/useResellerStore.ts';
import { messages, type Lang } from './i18n/messages.ts';
import { MenuItem } from './components/Shared.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { RestaurantsPage } from './pages/RestaurantsPage.tsx';
import { RestaurantDetailPage } from './pages/RestaurantDetailPage.tsx';
import { CommissionsPage } from './pages/CommissionsPage.tsx';
import { SupportPage } from './pages/SupportPage.tsx';
import { FinancePage } from './pages/FinancePage.tsx';
import { ShopPage } from './pages/ShopPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

type Tab = 'dashboard' | 'restaurants' | 'commissions' | 'support' | 'finance' | 'shop' | 'settings';

function LangSwitcher() {
    const { lang, setLang } = useResellerStore();
    const flags: Record<Lang, string> = { tr: '🇹🇷', de: '🇩🇪', en: '🇬🇧' };
    const langs: Lang[] = ['tr', 'de', 'en'];
    return (
        <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/5">
            {langs.map((l) => (
                <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${lang === l ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                    {flags[l]}
                </button>
            ))}
        </div>
    );
}

export function App() {
    const { token, admin, isLoading, error, login, verifyLogin2fa, resendLogin2fa, logout, lang, login2faRequired, login2faMethod } = useResellerStore();
    const t = (k: string) => messages[lang][k] || k;

    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [twofaCode, setTwofaCode] = useState('');
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [detailTenantId, setDetailTenantId] = useState<string | null>(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onMq = () => {
            if (mq.matches) setMobileNavOpen(false);
        };
        mq.addEventListener('change', onMq);
        return () => mq.removeEventListener('change', onMq);
    }, []);

    useEffect(() => {
        if (!token) return;
        const sp = new URLSearchParams(window.location.search);
        const top = sp.get('topup');
        if (top === 'stripe_ok') {
            setActiveTab('shop');
            toast.success(messages[lang]['shop.walletStripeSuccess'] || 'OK');
            window.history.replaceState({}, '', window.location.pathname || '/');
        } else if (top === 'stripe_cancel') {
            setActiveTab('shop');
            toast.error(messages[lang]['shop.walletStripeCancel'] || '');
            window.history.replaceState({}, '', window.location.pathname || '/');
        }
    }, [token, lang]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (login2faRequired) {
            await verifyLogin2fa(twofaCode.trim());
            return;
        }
        await login(loginForm.username, loginForm.password);
    };

    if (!token || !admin) {
        return (
            <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-900 relative">
                <div className="absolute top-4 right-4">
                    <LangSwitcher />
                </div>
                <div className="w-full max-w-md animate-in">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-4 rounded-3xl bg-blue-600/10 mb-4 border border-blue-500/20 shadow-2xl shadow-blue-500/10">
                            <FiShield className="text-blue-500" size={40} />
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tighter">
                            NEXTPOS <span className="text-blue-500">BAYİ</span>
                        </h1>
                        <p className="text-slate-500 mt-2 font-medium uppercase tracking-[0.2em] text-[10px]">{t('login.subtitle')}</p>
                    </div>

                    <form onSubmit={handleLogin} className="bg-slate-900/50 backdrop-blur-2xl p-8 rounded-[32px] border border-white/5 shadow-2xl space-y-6">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">{t('login.username')}</label>
                            <input
                                type="text"
                                value={loginForm.username}
                                onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600"
                                placeholder={t('login.usernamePlaceholder')}
                            />
                        </div>
                        {!login2faRequired ? (
                            <div>
                                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">{t('login.password')}</label>
                                <input
                                    type="password"
                                    value={loginForm.password}
                                    onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600"
                                    placeholder={t('login.passwordPlaceholder')}
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">
                                    2FA Kodu ({login2faMethod || 'email'})
                                </label>
                                <input
                                    type="text"
                                    value={twofaCode}
                                    onChange={(e) => setTwofaCode(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder-slate-600 tracking-[0.3em] font-mono"
                                    placeholder={t('login.twofaPlaceholder')}
                                />
                                <button
                                    type="button"
                                    onClick={() => void resendLogin2fa()}
                                    className="mt-2 text-xs text-blue-300 hover:text-blue-200"
                                >
                                    Kodu yeniden gonder
                                </button>
                            </div>
                        )}
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold flex items-center gap-2">
                                <FiAlertTriangle /> {error}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-white font-black hover:shadow-2xl hover:shadow-blue-600/40 active:scale-[0.98] transition-all disabled:opacity-50 text-sm tracking-widest uppercase"
                        >
                            {isLoading ? t('login.loading') : login2faRequired ? '2FA Doğrula' : t('login.submit')}
                        </button>
                    </form>

                    <div className="text-center mt-10">
                        <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <span className="w-8 h-[1px] bg-white/10" />
                            {t('login.footer')}
                            <span className="w-8 h-[1px] bg-white/10" />
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const openDetail = (id: string) => {
        setDetailTenantId(id);
        setActiveTab('restaurants');
    };
    const closeDetail = () => setDetailTenantId(null);

    const goTab = (tab: Tab) => {
        setActiveTab(tab);
        closeDetail();
        setMobileNavOpen(false);
    };

    const tabLabel = (k: Tab) => t(`nav.${k}`);

    return (
        <div className="min-h-screen bg-[#0a0f1d] text-slate-200 flex font-sans selection:bg-blue-500/30">
            {mobileNavOpen ? (
                <button
                    type="button"
                    aria-label={t('nav.closeMenu')}
                    className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
                    onClick={() => setMobileNavOpen(false)}
                />
            ) : null}

            <aside
                className={[
                    'w-64 sm:w-72 shrink-0 bg-slate-900/50 border-r border-white/5 flex flex-col backdrop-blur-3xl h-screen z-50',
                    'fixed lg:sticky top-0 left-0 max-w-[85vw] shadow-2xl shadow-black/40 lg:shadow-none',
                    'transition-transform duration-300 ease-out lg:translate-x-0',
                    mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
                ].join(' ')}
            >
                <div className="p-6 pb-4 flex-1 flex flex-col min-h-0 relative">
                    <button
                        type="button"
                        aria-label={t('nav.closeMenu')}
                        className="lg:hidden absolute top-5 right-4 p-2 rounded-xl bg-white/10 text-white hover:bg-white/15 border border-white/10"
                        onClick={() => setMobileNavOpen(false)}
                    >
                        <FiX size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-8 pr-10 lg:pr-0">
                        <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/40">
                            <FiShield className="text-white" size={20} />
                        </div>
                        <div>
                            <span className="text-lg font-black text-white tracking-tighter block">NEXTPOS</span>
                            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{t('app.title')}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5 custom-scrollbar overflow-y-auto flex-1 min-h-0 max-h-[calc(100dvh-320px)] lg:max-h-[calc(100vh-300px)]">
                        <MenuItem
                            icon={<FiBriefcase size={16} />}
                            label={tabLabel('dashboard')}
                            active={activeTab === 'dashboard' && !detailTenantId}
                            onClick={() => goTab('dashboard')}
                        />
                        <MenuItem
                            icon={<FiDatabase size={16} />}
                            label={tabLabel('restaurants')}
                            active={activeTab === 'restaurants'}
                            onClick={() => goTab('restaurants')}
                        />
                        <MenuItem
                            icon={<FiShoppingCart size={16} />}
                            label={tabLabel('shop')}
                            active={activeTab === 'shop'}
                            onClick={() => goTab('shop')}
                        />
                        <MenuItem
                            icon={<FiPieChart size={16} />}
                            label={tabLabel('commissions')}
                            active={activeTab === 'commissions'}
                            onClick={() => goTab('commissions')}
                        />
                        <MenuItem
                            icon={<FiMessageSquare size={16} />}
                            label={tabLabel('support')}
                            active={activeTab === 'support'}
                            onClick={() => goTab('support')}
                        />
                        <MenuItem
                            icon={<FiDollarSign size={16} />}
                            label={tabLabel('finance')}
                            active={activeTab === 'finance'}
                            onClick={() => goTab('finance')}
                        />
                        <MenuItem
                            icon={<FiSettings size={16} />}
                            label={tabLabel('settings')}
                            active={activeTab === 'settings'}
                            onClick={() => goTab('settings')}
                        />
                    </div>

                    <div className="mt-6 px-4 py-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12">
                            <FiBox size={50} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t('sidebar.licenses')}</span>
                        <span className="text-xl font-black text-blue-400">
                            {admin.available_licenses || 0} <span className="text-xs text-slate-500">{t('sidebar.units')}</span>
                        </span>
                    </div>
                </div>

                <div className="mt-auto p-6 space-y-4">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg">
                                {(admin.name || admin.username)?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-black text-white truncate">{admin.name || admin.username}</span>
                                <span className="text-[9px] text-blue-400 font-bold uppercase truncate">{admin.email || 'Bayi'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <LangSwitcher />
                        <button
                            type="button"
                            onClick={logout}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-all font-bold text-xs"
                        >
                            <FiPower size={14} /> {t('logout')}
                        </button>
                    </div>
                </div>
            </aside>

            <main className="flex-1 min-h-0 min-w-0 p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto w-full overflow-x-hidden custom-scrollbar overflow-y-auto h-[100dvh] lg:h-screen">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-8">
                    <div className="flex items-start gap-3 min-w-0">
                        <button
                            type="button"
                            aria-label={t('nav.openMenu')}
                            aria-expanded={mobileNavOpen}
                            className="lg:hidden shrink-0 mt-1 p-2.5 rounded-xl bg-white/10 border border-white/10 text-white hover:bg-white/15"
                            onClick={() => setMobileNavOpen(true)}
                        >
                            <FiMenu size={22} />
                        </button>
                        <div className="min-w-0">
                            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tighter">
                                {detailTenantId ? t('detail.title') : tabLabel(activeTab)}
                            </h2>
                            <p className="text-slate-500 text-xs font-medium mt-1">{t('app.subtitle')}</p>
                        </div>
                    </div>
                </header>

                <div className="animate-in">
                    {detailTenantId ? (
                        <RestaurantDetailPage tenantId={detailTenantId} onBack={closeDetail} />
                    ) : (
                        <>
                            {activeTab === 'dashboard' && <DashboardPage />}
                            {activeTab === 'restaurants' && <RestaurantsPage onDetail={openDetail} />}
                            {activeTab === 'shop' && <ShopPage />}
                            {activeTab === 'commissions' && <CommissionsPage />}
                            {activeTab === 'support' && <SupportPage />}
                            {activeTab === 'finance' && <FinancePage />}
                            {activeTab === 'settings' && <SettingsPage />}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
