import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resetOfflineSecurityState, markOnlineSuccess } from '../lib/offlinePolicy';
import { getDeviceId } from '../lib/deviceId';

interface AuthUser {
    id: number | string;
    username: string;
    name: string;
    role: string;
    preferredLanguage?: string;
    branchId?: number;
    branchName?: string;
    isSaaSAdmin?: boolean;
    /** Garson: tüm salon mu, tek bölge mi */
    waiter_all_sections?: boolean | number | null;
    /** Garson tek bölge: sections.id */
    waiter_section_id?: number | null;
    /** Mutfak personeli: all, hot, cold, bar */
    kitchen_station?: string | null;
}

/** /api/v1/billing/status — paket modülleri ve cihaz kotası */
export interface TenantBillingWorkspace {
    planCode: string | null;
    maxDevices: { base: number; extra: number; total: number } | null;
    entitlements: { code: string; enabled: boolean; mode: string }[];
    daysRemaining?: number | null;
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    user: AuthUser | null;
    tenantId: string | null;
    tenantName: string | null;
    isAuthenticated: boolean;
    isImpersonated: boolean;
    login2faRequired: boolean;
    login2faMethod: string | null;
    login2faChallengeToken: string | null;
    /** Abonelik modül özeti (billing/status ile doldurulur) */
    billingWorkspace: TenantBillingWorkspace | null;
    setBillingWorkspace: (w: TenantBillingWorkspace | null) => void;

    login: (username: string, password: string, tenantId: string) => Promise<boolean>;
    verifyLogin2fa: (code: string, tenantId: string) => Promise<boolean>;
    resendLogin2fa: () => Promise<boolean>;
    clearLogin2fa: () => void;
    loginWithPin: (pin: string, tenantId: string) => Promise<boolean>;
    loginWithImpersonateCode: (code: string) => Promise<boolean>;
    logout: () => void;
    setTenantId: (id: string) => void;
    clearTenant: () => void;
    getAuthHeaders: () => Record<string, string>;
    refreshTokenAction: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            user: null,
            tenantId: null,
            tenantName: null,
            isAuthenticated: false,
            isImpersonated: false,
            login2faRequired: false,
            login2faMethod: null,
            login2faChallengeToken: null,
            billingWorkspace: null,
            setBillingWorkspace: (w) => set({ billingWorkspace: w }),

            clearLogin2fa: () => set({
                login2faRequired: false,
                login2faMethod: null,
                login2faChallengeToken: null,
            }),

            login: async (username, password, tenantId) => {
                try {
                    const res = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, tenantId, deviceId: getDeviceId() }),
                    });

                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        throw new Error(data.error || 'Giriş başarısız');
                    }

                    const needs2fa = Boolean(
                        data.requires2FA || data.requires_2fa || data.twoFactorRequired,
                    );
                    if (needs2fa) {
                        set({
                            login2faRequired: true,
                            login2faMethod: String(data.two_factor_method || data.twoFactorMethod || 'authenticator'),
                            login2faChallengeToken: String(data.challenge_token || data.challengeToken || ''),
                            tenantId,
                            isAuthenticated: false,
                        });
                        return false;
                    }

                    set({
                        token: data.accessToken,
                        refreshToken: data.refreshToken,
                        user: data.user,
                        tenantId,
                        tenantName: data.tenantName,
                        isAuthenticated: true,
                        isImpersonated: false,
                        login2faRequired: false,
                        login2faMethod: null,
                        login2faChallengeToken: null,
                    });
                    markOnlineSuccess();
                    try {
                        const headers = get().getAuthHeaders();
                        const br = await fetch('/api/v1/billing/status', { headers });
                        if (br.ok) {
                            const b = await br.json();
                            set({
                                billingWorkspace: {
                                    planCode: b.planCode ?? null,
                                    maxDevices: b.maxDevices ?? null,
                                    entitlements: Array.isArray(b.entitlements) ? b.entitlements : [],
                                    daysRemaining: b.daysRemaining ?? null,
                                },
                            });
                        }
                    } catch {
                    }
                    return true;
                } catch (error: any) {
                    console.error('Login error:', error.message);
                    throw error;
                }
            },

            verifyLogin2fa: async (code, tenantId) => {
                const { login2faChallengeToken } = get();
                if (!login2faChallengeToken) {
                    throw new Error('2FA oturumu bulunamadı');
                }
                try {
                    const res = await fetch('/api/v1/auth/login/2fa/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            token: login2faChallengeToken,
                            challengeToken: login2faChallengeToken,
                            code: code.trim(),
                            tenantId,
                            deviceId: getDeviceId(),
                        }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        throw new Error(data.error || '2FA doğrulaması başarısız');
                    }
                    set({
                        token: data.accessToken,
                        refreshToken: data.refreshToken,
                        user: data.user,
                        tenantId,
                        tenantName: data.tenantName,
                        isAuthenticated: true,
                        isImpersonated: false,
                        login2faRequired: false,
                        login2faMethod: null,
                        login2faChallengeToken: null,
                    });
                    markOnlineSuccess();
                    try {
                        const headers = get().getAuthHeaders();
                        const br = await fetch('/api/v1/billing/status', { headers });
                        if (br.ok) {
                            const b = await br.json();
                            set({
                                billingWorkspace: {
                                    planCode: b.planCode ?? null,
                                    maxDevices: b.maxDevices ?? null,
                                    entitlements: Array.isArray(b.entitlements) ? b.entitlements : [],
                                    daysRemaining: b.daysRemaining ?? null,
                                },
                            });
                        }
                    } catch {
                    }
                    return true;
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : '2FA doğrulaması başarısız';
                    throw new Error(msg);
                }
            },

            resendLogin2fa: async () => {
                const { login2faChallengeToken } = get();
                if (!login2faChallengeToken) {
                    throw new Error('2FA oturumu bulunamadı');
                }
                const res = await fetch('/api/v1/auth/login/2fa/resend', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: login2faChallengeToken, challengeToken: login2faChallengeToken }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || '2FA kodu yeniden gönderilemedi');
                }
                return true;
            },

            loginWithPin: async (pin, tenantId) => {
                try {
                    const res = await fetch('/api/v1/auth/login/pin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pinCode: pin, tenantId, deviceId: getDeviceId() }),
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || 'PIN geçersiz');
                    }

                    const data = await res.json();
                    set({
                        token: data.accessToken,
                        refreshToken: data.refreshToken,
                        user: data.user,
                        tenantId,
                        tenantName: data.tenantName,
                        isAuthenticated: true,
                        isImpersonated: false,
                    });
                    markOnlineSuccess();
                    try {
                        const headers = get().getAuthHeaders();
                        const br = await fetch('/api/v1/billing/status', { headers });
                        if (br.ok) {
                            const b = await br.json();
                            set({
                                billingWorkspace: {
                                    planCode: b.planCode ?? null,
                                    maxDevices: b.maxDevices ?? null,
                                    entitlements: Array.isArray(b.entitlements) ? b.entitlements : [],
                                    daysRemaining: b.daysRemaining ?? null,
                                },
                            });
                        }
                    } catch {
                    }
                    return true;
                } catch (error: any) {
                    console.error('PIN Login error:', error.message);
                    throw error;
                }
            },

            loginWithImpersonateCode: async (code) => {
                try {
                    const res = await fetch('/api/v1/auth/login/impersonate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || 'Gölge giriş başarısız');
                    }

                    const data = await res.json();
                    set({
                        token: data.accessToken,
                        refreshToken: data.refreshToken,
                        user: data.user,
                        tenantId: data.user.tenantId || data.tenantId || get().tenantId,
                        tenantName: data.tenantName,
                        isAuthenticated: true,
                        isImpersonated: true,
                    });
                    markOnlineSuccess();
                    try {
                        const headers = get().getAuthHeaders();
                        const br = await fetch('/api/v1/billing/status', { headers });
                        if (br.ok) {
                            const b = await br.json();
                            set({
                                billingWorkspace: {
                                    planCode: b.planCode ?? null,
                                    maxDevices: b.maxDevices ?? null,
                                    entitlements: Array.isArray(b.entitlements) ? b.entitlements : [],
                                    daysRemaining: b.daysRemaining ?? null,
                                },
                            });
                        }
                    } catch {
                    }
                    return true;
                } catch (error: any) {
                    console.error('Impersonate Login error:', error.message);
                    throw error;
                }
            },

            logout: () => {
                resetOfflineSecurityState();
                set({
                    token: null,
                    refreshToken: null,
                    user: null,
                    isAuthenticated: false,
                    billingWorkspace: null,
                    isImpersonated: false,
                    login2faRequired: false,
                    login2faMethod: null,
                    login2faChallengeToken: null,
                });
            },

            setTenantId: (id) => set({ tenantId: id }),
            clearTenant: () => set({ tenantId: null, tenantName: null }),

            getAuthHeaders: () => {
                const { token, tenantId } = get();
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                if (tenantId) headers['x-tenant-id'] = tenantId;
                try {
                    headers['x-device-id'] = getDeviceId();
                } catch {
                    // Ignore if failing (e.g. storage not initialized)
                }
                return headers;
            },
            
            refreshTokenAction: async () => {
                const { refreshToken, tenantId } = get();
                if (!refreshToken || !tenantId) return false;
                
                try {
                    const res = await fetch('/api/v1/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken, tenantId }),
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        set({ token: data.accessToken });
                        return true;
                    }
                    get().logout();
                    return false;
                } catch {
                    get().logout();
                    return false;
                }
            }
        }),
        { name: 'nextpos-auth-storage' }
    )
);
