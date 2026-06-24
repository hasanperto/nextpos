import React from 'react';
import { FiLogOut } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';
import { usePosStore } from '../../store/usePosStore';
import { usePosLocale } from '../../contexts/PosLocaleContext';
import { POS_LANGS } from '../../i18n/posMessages';

type Props = { variant: 'header' | 'sidebar' };

export const TerminalLangAndUser: React.FC<Props> = ({ variant }) => {
    const { user, logout } = useAuthStore();
    const { lang } = usePosLocale();
    const { setLang } = usePosStore();

    const handleLangToggle = () => {
        const currentIndex = POS_LANGS.findIndex((l) => l.code === lang);
        const nextIndex = (currentIndex + 1) % POS_LANGS.length;
        setLang(POS_LANGS[nextIndex].code);
    };

    const activeLang = POS_LANGS.find((l) => l.code === lang) || POS_LANGS[0];

    const langButton = (
        <button
            type="button"
            onClick={handleLangToggle}
            className={
                variant === 'header'
                    ? 'h-9 md:h-10 shrink-0 px-2 md:px-3 bg-white/5 border border-white/5 rounded-xl flex items-center gap-1 md:gap-2 text-[10px] font-black text-slate-400 hover:text-white transition-all active:scale-95 shadow-sm'
                    : 'w-full h-10 px-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 hover:text-white transition-all active:scale-95 shadow-sm'
            }
        >
            <span className="leading-none">{activeLang.emoji}</span>
            <span className={`tracking-widest ${variant === 'header' ? 'hidden sm:inline' : ''}`}>
                {activeLang.code.toUpperCase()}
            </span>
        </button>
    );

    if (variant === 'sidebar') {
        return (
            <div className="flex flex-col gap-2">
                {langButton}
                <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex flex-col items-start leading-none min-w-0">
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 opacity-50">
                            STATION_STAFF
                        </span>
                        <span className="text-xs font-black text-white uppercase italic tracking-tight truncate max-w-[120px]">
                            {user?.name || 'OFFLINE'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => logout()}
                        className="shrink-0 w-10 h-10 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all active:scale-90 border border-transparent hover:border-rose-400/20 flex items-center justify-center p-0"
                        aria-label="Çıkış"
                    >
                        <FiLogOut size={16} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {langButton}
            <div className="hidden md:flex items-center gap-3">
                <div className="flex flex-col items-end leading-none">
                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 opacity-50">
                        STATION_STAFF
                    </span>
                    <span className="text-xs font-black text-white uppercase italic tracking-tight">
                        {user?.name || 'OFFLINE'}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => logout()}
                    className="w-9 h-9 md:w-10 md:h-10 shrink-0 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all active:scale-90 border border-transparent hover:border-rose-400/20 flex items-center justify-center p-0"
                    aria-label="Çıkış"
                >
                    <FiLogOut size={16} />
                </button>
            </div>
        </>
    );
};
