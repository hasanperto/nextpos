import { messages, type Lang } from './messages.ts';

const TOKEN_EXPIRED_MARKERS = [
    'token süresi dolmuş',
    'token expired',
    'token abgelaufen',
];

function t(lang: Lang, key: string): string {
    return messages[lang]?.[key] || messages.de?.[key] || messages.en?.[key] || messages.tr?.[key] || key;
}

/** API hata metnini veya kodunu aktif dile çevirir. */
export function translateApiError(
    error: string | undefined | null,
    code: string | undefined | null,
    lang: Lang,
): string | undefined {
    const err = String(error || '').trim();
    const errLower = err.toLowerCase();

    if (code === 'TOKEN_EXPIRED' || TOKEN_EXPIRED_MARKERS.some((m) => errLower.includes(m))) {
        return t(lang, 'auth.tokenExpired');
    }

    return err || undefined;
}
