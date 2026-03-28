import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
    id: number | string;
    username: string;
    name: string;
    role: string;
    preferredLanguage?: string;
    branchId?: number;
    branchName?: string;
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    user: AuthUser | null;
    tenantId: string | null;
    isAuthenticated: boolean;

    login: (username: string, password: string, tenantId: string) => Promise<boolean>;
    loginWithPin: (pin: string, tenantId: string) => Promise<boolean>;
    logout: () => void;
    setTenantId: (id: string) => void;
    getAuthHeaders: () => Record<string, string>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            user: null,
            tenantId: null,
            isAuthenticated: false,

            login: async (username, password, tenantId) => {
                try {
                    const res = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, tenantId }),
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
                        isAuthenticated: true,
                    });
                    return true;
                } catch (error: any) {
                    console.error('Login error:', error.message);
                    return false;
                }
            },

            loginWithPin: async (pin, tenantId) => {
                try {
                    const res = await fetch('/api/v1/auth/login/pin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pinCode: pin, tenantId }),
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
                        isAuthenticated: true,
                    });
                    return true;
                } catch (error: any) {
                    console.error('PIN Login error:', error.message);
                    return false;
                }
            },

            logout: () => {
                set({
                    token: null,
                    refreshToken: null,
                    user: null,
                    isAuthenticated: false,
                });
            },

            setTenantId: (id) => set({ tenantId: id }),

            getAuthHeaders: () => {
                const { token, tenantId } = get();
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                if (tenantId) headers['x-tenant-id'] = tenantId;
                return headers;
            },
        }),
        { name: 'nextpos-auth-storage' }
    )
);
