import { create } from 'zustand';
import type { Lang } from '../i18n/messages.ts';

const API = '/api/v1/tenants';
const AUTH = '/api/v1/auth/login/saas';

async function apiTenants(path: string, token: string | null, init?: RequestInit) {
    return fetch(`${API}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
}

export type Tenant = {
    id: string;
    name: string;
    schema_name?: string;
    status: string;
    subscription_plan: string;
    license_expires_at?: string | null;
    contact_email?: string;
    contact_phone?: string;
    authorized_person?: string;
    tax_office?: string;
    tax_number?: string;
    address?: string;
    created_at?: string;
    order_count_30d?: number;
    last_login_at?: string;
};

export type ResellerAdmin = {
    id: number;
    username: string;
    role: string;
    email?: string;
    name?: string;
    wallet_balance: number;
    available_licenses: number;
    reseller_plan_id?: number | null;
    reseller_plan_name?: string | null;
    reseller_plan_code?: string | null;
    reseller_plan_license_cap?: number | null;
    reseller_plan_price?: number | null;
    commission_rate?: number;
};

export type ResellerPlan = {
    id: number;
    name: string;
    code: string;
    price: number;
    license_count: number;
    description?: string | null;
};

type MonthlyEarning = { month: string; total: string | number };
type PlanDist = { plan: string; count: string | number };

type SupportTicket = {
    id: number;
    tenant_id?: string;
    tenant_name?: string;
    subject: string;
    priority: string;
    status: string;
    created_at: string;
};

type CommissionBreakdown = {
    monthly_billing_cycle: number;
    yearly_billing_cycle: number;
    sales_with_addon_modules: number;
    setup_and_corporate: number;
};

type FinanceSummary = {
    total_earnings: number;
    total_pending: number;
    wallet_balance: number;
    monthly_earnings: MonthlyEarning[];
    plan_distribution: PlanDist[];
    commission_breakdown: CommissionBreakdown | null;
};

interface ResellerState {
    lang: Lang;
    setLang: (l: Lang) => void;

    token: string | null;
    admin: ResellerAdmin | null;
    isLoading: boolean;
    error: string | null;
    login2faRequired: boolean;
    login2faMethod: string | null;
    login2faChallengeToken: string | null;
    login: (username: string, password: string) => Promise<boolean>;
    verifyLogin2fa: (code: string) => Promise<boolean>;
    resendLogin2fa: () => Promise<boolean>;
    logout: () => void;
    fetchStats: () => Promise<void>;

    tenants: Tenant[];
    fetchTenants: () => Promise<void>;
    updateTenant: (tenantId: string, data: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
    createTenant: (data: Record<string, unknown>) => Promise<{
        ok: boolean;
        error?: string;
        requires_card_payment?: boolean;
        draftId?: string;
        message?: string;
        /** API başarı gövdesi (askıda / oluşturuldu metni) */
        serverMessage?: string;
    }>;
    completeTenantCardDraft: (
        draftId: string,
        success: boolean,
        errorCode?: string
    ) => Promise<{ ok: boolean; error?: string; error_code?: string }>;

    resellerPlans: ResellerPlan[];
    fetchResellerPlans: () => Promise<void>;
    purchaseResellerPlan: (planId: number) => Promise<{ ok: boolean; error?: string }>;

    financeSummary: FinanceSummary | null;
    fetchFinanceSummary: () => Promise<void>;

    supportTickets: SupportTicket[];
    fetchSupportTickets: () => Promise<void>;

    dashStats: {
        active: number;
        trialExpiring: number;
        pendingSupport: number;
        monthlyCommission: number;
        totalTenants: number;
    } | null;
    fetchDashStats: () => Promise<void>;

    trialExpiring: Tenant[];
    fetchTrialExpiring: () => Promise<void>;

    fetchQrDomains: (tenantId: string) => Promise<any[]>;
    addQrDomain: (tenantId: string, domain: string) => Promise<boolean>;
    deleteQrDomain: (tenantId: string, domainId: number) => Promise<boolean>;
    updateQrDomain: (tenantId: string, domainId: number, isActive: boolean) => Promise<boolean>;

    fetchTenantEntitlements: (tenantId: string) => Promise<{ tenantId: string; entitlements: any[] } | null>;
    purchaseTenantAddons: (
        tenantId: string,
        module_codes: string[],
        extra_device_qty?: number,
        payment_method?: 'wallet_balance' | 'bank_transfer' | 'admin_card' | 'cash'
    ) => Promise<{ ok: boolean; error?: string; added?: string[]; skipped?: string[]; totals?: { setup: number; monthly: number } }>;
}

function mapUserToAdmin(user: Record<string, unknown>): ResellerAdmin {
    return {
        id: Number(user.id),
        username: String(user.username ?? ''),
        role: String(user.role ?? 'reseller'),
        email: user.email != null ? String(user.email) : undefined,
        name: user.name != null ? String(user.name) : undefined,
        wallet_balance: Number(user.wallet_balance ?? 0),
        available_licenses: Number(user.available_licenses ?? 0),
        reseller_plan_id: user.reseller_plan_id != null ? Number(user.reseller_plan_id) : null,
        reseller_plan_name: user.reseller_plan_name != null ? String(user.reseller_plan_name) : null,
        reseller_plan_code: user.reseller_plan_code != null ? String(user.reseller_plan_code) : null,
        reseller_plan_license_cap:
            user.reseller_plan_license_cap != null ? Number(user.reseller_plan_license_cap) : null,
        reseller_plan_price: user.reseller_plan_price != null ? Number(user.reseller_plan_price) : null,
    };
}

export const useResellerStore = create<ResellerState>((set, get) => ({
    lang: (localStorage.getItem('reseller_lang') as Lang) || 'tr',
    setLang: (l) => {
        localStorage.setItem('reseller_lang', l);
        set({ lang: l });
    },

    token: localStorage.getItem('reseller_token'),
    admin: (() => {
        try {
            const raw = localStorage.getItem('reseller_admin');
            return raw ? (JSON.parse(raw) as ResellerAdmin) : null;
        } catch {
            return null;
        }
    })(),
    isLoading: false,
    error: null,
    login2faRequired: false,
    login2faMethod: null,
    login2faChallengeToken: null,

    login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
            const res = await fetch(AUTH, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                set({ error: String(data.error || 'Giriş başarısız'), isLoading: false });
                return false;
            }
            if (data?.requires_2fa) {
                set({
                    isLoading: false,
                    login2faRequired: true,
                    login2faMethod: String(data.two_factor_method || 'email'),
                    login2faChallengeToken: String(data.challenge_token || ''),
                    error: null,
                });
                return false;
            }
            const user = data.user as Record<string, unknown> | undefined;
            const accessToken = data.accessToken as string | undefined;
            if (!accessToken || !user) {
                set({ error: 'Sunucu yanıtı geçersiz', isLoading: false });
                return false;
            }
            if (String(user.role) !== 'reseller') {
                set({ error: 'Bu panel yalnızca bayi hesapları içindir', isLoading: false });
                return false;
            }
            const admin = mapUserToAdmin(user);
            localStorage.setItem('reseller_token', accessToken);
            localStorage.setItem('reseller_admin', JSON.stringify(admin));
            set({
                token: accessToken,
                admin,
                isLoading: false,
                login2faRequired: false,
                login2faMethod: null,
                login2faChallengeToken: null,
            });
            await get().fetchStats();
            await get().fetchTenants();
            return true;
        } catch {
            set({ error: 'Bağlantı hatası', isLoading: false });
            return false;
        }
    },

    verifyLogin2fa: async (code: string) => {
        const { login2faChallengeToken } = get();
        if (!login2faChallengeToken) {
            set({ error: '2FA oturumu bulunamadı' });
            return false;
        }
        set({ isLoading: true, error: null });
        try {
            const res = await fetch('/api/v1/auth/login/saas/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: login2faChallengeToken, code }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                set({ isLoading: false, error: String(data.error || '2FA doğrulaması başarısız') });
                return false;
            }
            const user = data.user as Record<string, unknown> | undefined;
            const accessToken = data.accessToken as string | undefined;
            if (!accessToken || !user) {
                set({ error: 'Sunucu yanıtı geçersiz', isLoading: false });
                return false;
            }
            if (String(user.role) !== 'reseller') {
                set({ error: 'Bu panel yalnızca bayi hesapları içindir', isLoading: false });
                return false;
            }
            const admin = mapUserToAdmin(user);
            localStorage.setItem('reseller_token', accessToken);
            localStorage.setItem('reseller_admin', JSON.stringify(admin));
            set({
                token: accessToken,
                admin,
                isLoading: false,
                login2faRequired: false,
                login2faMethod: null,
                login2faChallengeToken: null,
            });
            await get().fetchStats();
            await get().fetchTenants();
            return true;
        } catch {
            set({ error: 'Bağlantı hatası', isLoading: false });
            return false;
        }
    },

    resendLogin2fa: async () => {
        const { login2faChallengeToken } = get();
        if (!login2faChallengeToken) {
            set({ error: '2FA oturumu bulunamadı' });
            return false;
        }
        set({ isLoading: true, error: null });
        try {
            const res = await fetch('/api/v1/auth/login/saas/2fa/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: login2faChallengeToken }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                set({ isLoading: false, error: String(data.error || '2FA kodu yeniden gönderilemedi') });
                return false;
            }
            set({ isLoading: false, error: null });
            return true;
        } catch {
            set({ isLoading: false, error: 'Bağlantı hatası' });
            return false;
        }
    },

    logout: () => {
        localStorage.removeItem('reseller_token');
        localStorage.removeItem('reseller_admin');
        set({
            token: null,
            admin: null,
            tenants: [],
            financeSummary: null,
            dashStats: null,
            supportTickets: [],
            resellerPlans: [],
            login2faRequired: false,
            login2faMethod: null,
            login2faChallengeToken: null,
        });
    },

    fetchStats: async () => {
        const { token } = get();
        if (!token) return;
        try {
            const res = await apiTenants('/stats', token);
            if (!res.ok) return;
            const data = await res.json();
            const rd = data.resellerData as
                | {
                      wallet_balance?: number;
                      available_licenses?: number;
                      reseller_plan_id?: number | null;
                      reseller_plan_name?: string | null;
                      reseller_plan_code?: string | null;
                      reseller_plan_license_cap?: number | null;
                      reseller_plan_price?: number | null;
                  }
                | undefined;
            set((state) => ({
                admin: state.admin
                    ? {
                          ...state.admin,
                          wallet_balance: rd?.wallet_balance ?? state.admin.wallet_balance,
                          available_licenses: rd?.available_licenses ?? state.admin.available_licenses,
                          reseller_plan_id:
                              rd?.reseller_plan_id !== undefined ? rd.reseller_plan_id : state.admin.reseller_plan_id,
                          reseller_plan_name:
                              rd?.reseller_plan_name !== undefined
                                  ? rd.reseller_plan_name
                                  : state.admin.reseller_plan_name,
                          reseller_plan_code:
                              rd?.reseller_plan_code !== undefined
                                  ? rd.reseller_plan_code
                                  : state.admin.reseller_plan_code,
                          reseller_plan_license_cap:
                              rd?.reseller_plan_license_cap !== undefined
                                  ? rd.reseller_plan_license_cap
                                  : state.admin.reseller_plan_license_cap,
                          reseller_plan_price:
                              rd?.reseller_plan_price !== undefined
                                  ? rd.reseller_plan_price
                                  : state.admin.reseller_plan_price,
                      }
                    : state.admin,
            }));
        } catch {
            /* ignore */
        }
    },

    tenants: [],
    fetchTenants: async () => {
        const { token } = get();
        if (!token) return;
        try {
            const res = await apiTenants('/', token);
            if (res.ok) {
                const data = await res.json();
                set({ tenants: Array.isArray(data) ? data : [] });
            }
        } catch {
            /* ignore */
        }
    },
    updateTenant: async (tenantId, data) => {
        const { token } = get();
        if (!token) return { ok: false, error: 'Oturum yok' };
        try {
            const res = await apiTenants(`/${encodeURIComponent(tenantId)}`, token, {
                method: 'PATCH',
                body: JSON.stringify(data),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) return { ok: false, error: String(json.error || 'Guncellenemedi') };
            await get().fetchTenants();
            return { ok: true };
        } catch {
            return { ok: false, error: 'Ag hatasi' };
        }
    },

    createTenant: async (data) => {
        const { token } = get();
        if (!token) return { ok: false, error: 'Oturum yok' };
        try {
            const res = await apiTenants('/', token, { method: 'POST', body: JSON.stringify(data) });
            const json = (await res.json().catch(() => ({}))) as {
                requires_card_payment?: boolean;
                draftId?: string;
                message?: string;
                error?: string;
            };
            if (res.ok) {
                if (json.requires_card_payment && json.draftId) {
                    return {
                        ok: true,
                        requires_card_payment: true,
                        draftId: json.draftId,
                        message: json.message,
                    };
                }
                await get().fetchTenants();
                await get().fetchStats();
                return {
                    ok: true,
                    serverMessage: typeof json.message === 'string' ? json.message : undefined,
                };
            }
            return { ok: false, error: String(json.error || 'Oluşturulamadı') };
        } catch {
            return { ok: false, error: 'Ağ hatası' };
        }
    },

    completeTenantCardDraft: async (draftId, success, errorCode) => {
        const { token } = get();
        if (!token) return { ok: false, error: 'Oturum yok' };
        try {
            const res = await apiTenants(`/tenant-drafts/${encodeURIComponent(draftId)}/complete-card`, token, {
                method: 'POST',
                body: JSON.stringify({ success, error_code: errorCode }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; error_code?: string };
            if (res.ok) {
                await get().fetchTenants();
                await get().fetchStats();
                return { ok: true };
            }
            return {
                ok: false,
                error: String(json.error || 'İşlem tamamlanamadı'),
                error_code: json.error_code,
            };
        } catch {
            return { ok: false, error: 'Ağ hatası' };
        }
    },

    resellerPlans: [],
    fetchResellerPlans: async () => {
        const { token } = get();
        if (!token) return;
        try {
            const res = await apiTenants('/resellers/plans', token);
            if (res.ok) set({ resellerPlans: await res.json() });
        } catch {
            /* ignore */
        }
    },

    purchaseResellerPlan: async (planId: number) => {
        const { token } = get();
        if (!token) return { ok: false, error: 'Oturum yok' };
        set({ isLoading: true, error: null });
        try {
            const res = await apiTenants('/resellers/plans/purchase', token, {
                method: 'POST',
                body: JSON.stringify({ planId }),
            });
            if (res.ok) {
                await get().fetchStats();
                set({ isLoading: false });
                return { ok: true };
            }
            const err = await res.json().catch(() => ({}));
            const msg = String((err as { error?: string }).error || 'Satın alınamadı');
            set({ error: msg, isLoading: false });
            return { ok: false, error: msg };
        } catch {
            set({ isLoading: false });
            return { ok: false, error: 'Ağ hatası' };
        }
    },

    financeSummary: null,
    fetchFinanceSummary: async () => {
        const { token, admin } = get();
        if (!token) return;
        try {
            const res = await apiTenants('/finance/summary', token);
            if (!res.ok) return;
            const d = await res.json();
            const monthly = (d.monthlyEarnings || []) as MonthlyEarning[];
            const planDistribution = (d.planDistribution || []) as PlanDist[];
            const cb = d.commissionBreakdown;
            const commission_breakdown: CommissionBreakdown | null =
                cb && typeof cb === 'object'
                    ? {
                          monthly_billing_cycle: Number(cb.monthlyBillingCycle ?? 0),
                          yearly_billing_cycle: Number(cb.yearlyBillingCycle ?? 0),
                          sales_with_addon_modules: Number(cb.salesWithAddonModules ?? 0),
                          setup_and_corporate: Number(cb.setupAndCorporate ?? 0),
                      }
                    : null;
            set({
                financeSummary: {
                    total_earnings: Number(d.totalEarnings ?? 0),
                    total_pending: Number(d.pendingRevenue ?? 0),
                    wallet_balance: Number(d.walletBalance ?? admin?.wallet_balance ?? 0),
                    monthly_earnings: monthly,
                    plan_distribution: planDistribution,
                    commission_breakdown,
                },
                admin: admin
                    ? {
                          ...admin,
                          wallet_balance: Number(d.walletBalance ?? admin.wallet_balance ?? 0),
                      }
                    : admin,
            });
        } catch {
            /* ignore */
        }
    },

    supportTickets: [],
    fetchSupportTickets: async () => {
        const { token } = get();
        if (!token) return;
        try {
            const res = await apiTenants('/system/tickets', token);
            if (res.ok) {
                const raw = await res.json();
                set({ supportTickets: Array.isArray(raw) ? raw : [] });
            }
        } catch {
            /* ignore */
        }
    },

    dashStats: null,
    fetchDashStats: async () => {
        const { token, tenants } = get();
        if (!token) return;
        const active = tenants.filter((t) => t.status === 'active').length;
        const trialList = tenants.filter((t) => t.status === 'trial' || (t.subscription_plan || '').toLowerCase().includes('trial'));
        try {
            const supRes = await apiTenants('/support/stats', token);
            let pending = 0;
            if (supRes.ok) {
                const s = await supRes.json();
                pending = Number(s.open ?? 0);
            }
            const finRes = await apiTenants('/finance/summary', token);
            let monthly = 0;
            let totalT = tenants.length;
            if (finRes.ok) {
                const f = await finRes.json();
                const me = (f.monthlyEarnings || []) as MonthlyEarning[];
                const now = new Date();
                const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const cur = me.find((m) => String(m.month) === ym);
                monthly = cur ? Number(cur.total) : me.length ? Number(me[me.length - 1].total) : Number(f.totalEarnings ?? 0);
            }
            const stRes = await apiTenants('/stats', token);
            if (stRes.ok) {
                const st = await stRes.json();
                totalT = Number(st.totalTenants ?? totalT);
            }
            set({
                dashStats: {
                    active,
                    trialExpiring: trialList.length,
                    pendingSupport: pending,
                    monthlyCommission: monthly,
                    totalTenants: totalT,
                },
            });
        } catch {
            set({
                dashStats: {
                    active,
                    trialExpiring: trialList.length,
                    pendingSupport: 0,
                    monthlyCommission: 0,
                    totalTenants: tenants.length,
                },
            });
        }
    },

    trialExpiring: [],
    fetchTrialExpiring: async () => {
        const { tenants } = get();
        set({
            trialExpiring: tenants.filter(
                (t) => t.status === 'trial' || (t.subscription_plan || '').toLowerCase().includes('trial'),
            ),
        });
    },

    fetchQrDomains: async (tenantId: string) => {
        const { token } = get();
        try {
            const res = await apiTenants(`/${tenantId}/qr-domains`, token);
            if (res.ok) return await res.json();
        } catch { /* silent */ }
        return [];
    },
    addQrDomain: async (tenantId: string, domain: string) => {
        const { token } = get();
        try {
            const res = await apiTenants(`/${tenantId}/qr-domains`, token, {
                method: 'POST', body: JSON.stringify({ domain }),
            });
            return res.ok;
        } catch { return false; }
    },
    deleteQrDomain: async (tenantId: string, domainId: number) => {
        const { token } = get();
        try {
            const res = await apiTenants(`/${tenantId}/qr-domains/${domainId}`, token, { method: 'DELETE' });
            return res.ok;
        } catch { return false; }
    },
    updateQrDomain: async (tenantId: string, domainId: number, isActive: boolean) => {
        const { token } = get();
        try {
            const res = await apiTenants(`/${tenantId}/qr-domains/${domainId}`, token, {
                method: 'PATCH', body: JSON.stringify({ isActive }),
            });
            return res.ok;
        } catch { return false; }
    },

    fetchTenantEntitlements: async (tenantId) => {
        const { token } = get();
        if (!token) return null;
        try {
            const res = await apiTenants(`/${encodeURIComponent(tenantId)}/entitlements`, token);
            if (res.ok) return await res.json();
            return null;
        } catch {
            return null;
        }
    },
    purchaseTenantAddons: async (
        tenantId,
        module_codes,
        extra_device_qty,
        payment_method?: 'wallet_balance' | 'bank_transfer' | 'admin_card' | 'cash'
    ) => {
        const { token } = get();
        if (!token) return { ok: false, error: 'Oturum yok' };
        try {
            const res = await apiTenants(`/${encodeURIComponent(tenantId)}/addons`, token, {
                method: 'POST',
                body: JSON.stringify({
                    module_codes,
                    extra_device_qty,
                    ...(payment_method ? { payment_method } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await get().fetchStats();
                return {
                    ok: true,
                    added: data.added,
                    skipped: data.skipped,
                    totals: data.totals,
                };
            }
            return { ok: false, error: String(data.error || 'Satın alınamadı') };
        } catch {
            return { ok: false, error: 'Ağ hatası' };
        }
    },
}));
