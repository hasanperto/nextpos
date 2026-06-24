import toast from 'react-hot-toast';
import { useResellerStore } from '../store/useResellerStore.ts';
import { translateApiError } from '../i18n/translateApiError.ts';

let installed = false;

export function setupResellerApiErrorToast(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const response = await originalFetch(input, init);

        if (response.status !== 401) return response;

        const urlStr =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (urlStr.includes('/auth/login') || urlStr.includes('/auth/2fa')) {
            return response;
        }

        try {
            const clone = response.clone();
            const json = (await clone.json().catch(() => ({}))) as { error?: string; code?: string };
            const lang = useResellerStore.getState().lang;
            const translated = translateApiError(json.error, json.code, lang);

            if (json.code === 'TOKEN_EXPIRED' || (translated && translated !== json.error)) {
                toast.error(translated || translateApiError(null, 'TOKEN_EXPIRED', lang)!);
                const { token, logout } = useResellerStore.getState();
                if (token) logout();
            }
        } catch {
            /* yoksay */
        }

        return response;
    };
}
