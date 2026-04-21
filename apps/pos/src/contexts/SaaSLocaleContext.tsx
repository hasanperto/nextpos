import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SAAS_LANGS, type SaaSLang, saasMessages } from '../i18n/saas/messages';

const STORAGE_KEY = 'nextpos-saas-locale';

type SaaSLocaleContextValue = {
    lang: SaaSLang;
    setLang: (l: SaaSLang) => void;
    t: (key: string, fallback?: string) => string;
    languages: { code: string; name: string; nativeName?: string; flagEmoji?: string }[];
};

const SaaSLocaleContext = createContext<SaaSLocaleContextValue | null>(null);

function detectInitialLang(): SaaSLang {
    try {
        const s = localStorage.getItem(STORAGE_KEY) as SaaSLang | null;
        if (s && (s === 'tr' || s === 'de' || s === 'en')) return s;
    } catch {
        /* ignore */
    }
    // Ürün kararı: SaaS varsayılan dil Almanca.
    const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : 'de';
    if (nav === 'de' || nav === 'en' || nav === 'tr') return nav;
    return 'de';
}

export const SaaSLocaleProvider: React.FC<{ children: React.ReactNode; initialLang?: SaaSLang }> = ({
    children,
    initialLang,
}) => {
    const [lang, setLangState] = useState<SaaSLang>(() => initialLang ?? detectInitialLang());
    const [apiLangs, setApiLangs] = useState<SaaSLocaleContextValue['languages']>([]);
    const [overrides, setOverrides] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!initialLang) return;
        setLangState(initialLang);
    }, [initialLang]);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch {
            /* ignore */
        }
        document.documentElement.lang = lang;
    }, [lang]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch('/api/v1/languages');
                if (!r.ok) return;
                const rows = await r.json();
                if (!cancelled && Array.isArray(rows) && rows.length) {
                    setApiLangs(
                        rows.map((x: { code: string; name: string; native_name?: string; nativeName?: string; flag_emoji?: string; flagEmoji?: string }) => ({
                            code: x.code,
                            name: x.name,
                            nativeName: x.nativeName ?? x.native_name,
                            flagEmoji: x.flagEmoji ?? x.flag_emoji,
                        })),
                    );
                }
            } catch {
                /* API yoksa statik liste */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch(`/api/v1/languages/${encodeURIComponent(lang)}/translations?namespace=saas`);
                if (!r.ok) {
                    setOverrides({});
                    return;
                }
                const data = (await r.json()) as Record<string, Record<string, string>>;
                const flat: Record<string, string> = {};
                const ns = data.saas;
                if (ns && typeof ns === 'object') {
                    for (const [k, v] of Object.entries(ns)) {
                        flat[k] = v;
                    }
                }
                if (!cancelled) setOverrides(flat);
            } catch {
                if (!cancelled) setOverrides({});
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [lang]);

    const base = saasMessages[lang];
    const de = saasMessages.de;
    const en = saasMessages.en;
    const tr = saasMessages.tr;

    const t = useCallback(
        (key: string, fallback?: string) => {
            if (overrides[key] != null && overrides[key] !== '') return overrides[key];
            if (base[key] != null) return base[key];
            // Çeviri temizliği: aktif dilde yoksa de -> en -> tr zinciriyle dön.
            if (de[key] != null) return de[key];
            if (en[key] != null) return en[key];
            if (tr[key] != null) return tr[key];
            const fb = fallback ?? key;
            return fb;
        },
        [base, overrides, de, en, tr],
    );

    const setLang = useCallback((l: SaaSLang) => setLangState(l), []);

    const languages = useMemo(() => {
        if (apiLangs.length) return apiLangs;
        return SAAS_LANGS.map((x) => ({ code: x.code, name: x.label, nativeName: x.label, flagEmoji: x.emoji }));
    }, [apiLangs]);

    const value = useMemo(
        () => ({ lang, setLang, t, languages }),
        [lang, setLang, t, languages],
    );

    return <SaaSLocaleContext.Provider value={value}>{children}</SaaSLocaleContext.Provider>;
};

export function useSaaSLocale(): SaaSLocaleContextValue {
    const ctx = useContext(SaaSLocaleContext);
    if (!ctx) throw new Error('useSaaSLocale: SaaSLocaleProvider dışında kullanılamaz');
    return ctx;
}

/** Provider dışında güvenli (POS başka rotalar) */
export function useSaaSLocaleOptional(): SaaSLocaleContextValue | null {
    return useContext(SaaSLocaleContext);
}
