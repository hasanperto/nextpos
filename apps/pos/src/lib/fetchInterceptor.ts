import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { posMessages, type PosLang } from '../i18n/posMessages';
import toast from 'react-hot-toast';

const originalFetch = window.fetch;

function tokenExpiredMessage(): string {
    const lang = (usePosStore.getState().lang || 'tr') as PosLang;
    return posMessages[lang]?.['auth.error.tokenExpired']
        || posMessages.tr['auth.error.tokenExpired']
        || 'Token süresi dolmuş. Lütfen tekrar giriş yapın.';
}

function isTokenExpiredPayload(error: unknown, code: unknown): boolean {
    const err = String(error || '').toLowerCase();
    return code === 'TOKEN_EXPIRED' || err.includes('token süresi dolmuş') || err.includes('token expired');
}

let isRefreshing = false;
let isLoggingOut = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
    refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
}

/** Oturumu kapat ve giriş sayfasına yönlendir */
function forceSessionEnd(): void {
    if (isLoggingOut) return;
    isLoggingOut = true;
    isRefreshing = false;
    refreshSubscribers = [];

    toast.error(tokenExpiredMessage());
    useAuthStore.getState().logout();

    const path = window.location.pathname;
    if (!path.startsWith('/login')) {
        window.location.assign('/login');
    } else {
        isLoggingOut = false;
    }
}

export const setupFetchInterceptor = () => {
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const response = await originalFetch(input, init);

        if (response.status === 401) {
            const authStore = useAuthStore.getState();
            const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);

            if (urlStr.includes('/auth/login') || urlStr.includes('/auth/refresh')) {
                return response;
            }

            let payload: { error?: string; code?: string } = {};
            try {
                const clone = response.clone();
                payload = (await clone.json().catch(() => ({}))) as { error?: string; code?: string };
            } catch {
                /* yoksay */
            }

            // Access token süresi doldu → yenileme denemeden çıkış
            if (isTokenExpiredPayload(payload.error, payload.code)) {
                if (authStore.isAuthenticated) forceSessionEnd();
                return response;
            }

            if (!authStore.refreshToken || !authStore.tenantId) {
                if (authStore.isAuthenticated) forceSessionEnd();
                return response;
            }

            if (!isRefreshing) {
                isRefreshing = true;
                try {
                    const refreshed = await authStore.refreshTokenAction();
                    if (refreshed) {
                        const newToken = useAuthStore.getState().token;
                        isRefreshing = false;
                        onRefreshed(newToken || '');
                    } else {
                        isRefreshing = false;
                        forceSessionEnd();
                        return response;
                    }
                } catch {
                    isRefreshing = false;
                    forceSessionEnd();
                    return response;
                }
            }

            return new Promise<Response>((resolve) => {
                subscribeTokenRefresh((token) => {
                    const newInit = { ...init };
                    if (newInit.headers) {
                        const headers = new Headers(newInit.headers);
                        headers.set('Authorization', `Bearer ${token}`);
                        newInit.headers = headers;
                    } else {
                        newInit.headers = {
                            Authorization: `Bearer ${token}`,
                            'x-tenant-id': authStore.tenantId || '',
                        };
                    }
                    resolve(originalFetch(input, newInit));
                });
            });
        }

        return response;
    };
};
