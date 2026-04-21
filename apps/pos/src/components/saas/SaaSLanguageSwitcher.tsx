import React, { useState, useRef, useEffect } from 'react';
import { FiGlobe } from 'react-icons/fi';
import { useSaaSLocale } from '../../contexts/SaaSLocaleContext';
import type { SaaSLang } from '../../i18n/saas/messages';

/** SaaS üst çubuğu — plan: de / tr / en bayrak + dil kodu */
export const SaaSLanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { lang, setLang, languages, t } = useSaaSLocale();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, []);

    const current = languages.find((l) => l.code === lang);
    const label = current?.flagEmoji ? `${current.flagEmoji} ${lang.toUpperCase()}` : lang.toUpperCase();

    return (
        <div className={`relative ${className}`} ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/5 border border-white/5 transition-all"
                title={t('lang.label')}
            >
                <FiGlobe size={16} />
                <span className="hidden sm:inline">{label}</span>
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 min-w-[160px] py-1 rounded-xl bg-slate-900 border border-white/10 shadow-xl z-[100]">
                    {languages
                        .filter((l) => l.code === 'tr' || l.code === 'de' || l.code === 'en')
                        .map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => {
                                    setLang(l.code as SaaSLang);
                                    setOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-white/10 ${
                                    lang === l.code ? 'text-blue-400 bg-white/5' : 'text-slate-300'
                                }`}
                            >
                                <span>{l.flagEmoji ?? '🌐'}</span>
                                <span>{l.nativeName ?? l.name}</span>
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
};
