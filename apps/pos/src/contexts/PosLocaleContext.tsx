import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { usePosStore } from '../store/usePosStore';
import { posMessages } from '../i18n/posMessages';
import type { PosLang } from '../i18n/posMessages';

interface PosLocaleContextType {
    t: (key: string) => string;
    lang: PosLang;
}

const PosLocaleContext = createContext<PosLocaleContextType | undefined>(undefined);

export const PosLocaleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const lang = usePosStore(s => s.lang);
    
    const t = React.useCallback((key: string): string => {
        const messages = posMessages[lang as PosLang] || posMessages.tr;
        const value = messages[key];
        if (value === undefined && import.meta.env.DEV) {
            console.warn(`[i18n] eksik anahtar: "${key}" (dil=${lang})`);
        }
        return value ?? key;
    }, [lang]);

    const value = React.useMemo(() => ({ t, lang: lang as PosLang }), [t, lang]);

    return (
        <PosLocaleContext.Provider value={value}>
            {children}
        </PosLocaleContext.Provider>
    );
};

export const usePosLocale = () => {
    const context = useContext(PosLocaleContext);
    if (context === undefined) {
        throw new Error('usePosLocale must be used within a PosLocaleProvider');
    }
    return context;
};
