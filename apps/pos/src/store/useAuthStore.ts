import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    user: AuthUser | null;
    tenantId: string | null;
    tenantName: string | null;
    isAuthenticated: boolean;
    /** Abonelik modül özeti (billing/status ile doldurulur) */
    billingWorkspace: TenantBillingWorkspace | null;
    setBillingWorkspace: (w: TenantBillingWorkspace | null) => void;

    login: (username: string, password: string, tenantId: string) => Promise<boolean>;
    loginWithPin: (pin: string, tenantId: string) => Promise<boolean>;
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
            billingWorkspace: null,
            setBillingWorkspace: (w) => set({ billingWorkspace: w }),

            login: async (username, password, tenantId) => {
                try {
                    const res = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, tenantId, deviceId: getDeviceId() }),
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || 'Giriş başarısız');
                    }

                    const data = await res.json();
                    set({
                        token: data.accessToken,
                        refreshToken: data.refreshToken,
                        user: data.user,
                        tenantId,
                        tenantName: data.tenantName,
                        isAuthenticated: true,
                    });
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
                    });
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

            logout: () => {
                set({
                    token: null,
                    refreshToken: null,
                    user: null,
                    isAuthenticated: false,
                    billingWorkspace: null,
                });
            },

            setTenantId: (id) => set({ tenantId: id }),
            clearTenant: () => set({ tenantId: null, tenantName: null }),

            getAuthHeaders: () => {
                const { token, tenantId } = get();
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                if (tenantId) headers['x-tenant-id'] = tenantId;
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
                    // Refresh fail -> logout
                    get().logout();
                    return false;
                } catch {
                    return false;
                }
            }
        }),
        { name: 'nextpos-auth-storage' }
    )
);
