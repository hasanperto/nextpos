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
    const { lang } = usePosStore();
    
    const t = (key: string): string => {
        const messages = posMessages[lang as PosLang] || posMessages.tr;
        const value = messages[key];
        if (value === undefined && import.meta.env.DEV) {
            console.warn(`[i18n] eksik anahtar: "${key}" (dil=${lang})`);
        }
        return value ?? key;
    };

    return (
        <PosLocaleContext.Provider value={{ t, lang: lang as PosLang }}>
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
