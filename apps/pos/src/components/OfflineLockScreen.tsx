import React from 'react';
import { FiWifiOff, FiAlertTriangle } from 'react-icons/fi';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { getOfflinePolicyState, formatGraceRemaining, isOfflineGraceExpired } from '../lib/offlinePolicy';

export const OfflineLockScreen: React.FC = () => {
    const { t } = usePosLocale();
    const state = getOfflinePolicyState();

    if (!isOfflineGraceExpired()) return null;

    const maxHours = Math.round(state.maxGraceMs / (60 * 60 * 1000));

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#020617] p-6">
            <div className="max-w-md w-full rounded-[2rem] border border-rose-500/30 bg-[#0f172a] p-10 text-center shadow-2xl">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                    <FiAlertTriangle size={32} />
                </div>
                <h1 className="text-xl font-black text-white uppercase tracking-tight mb-3">
                    {t('offline.lock.title')}
                </h1>
                <p className="text-sm text-slate-400 leading-relaxed mb-2">
                    {t('offline.lock.desc').replace('{{hours}}', String(maxHours))}
                </p>
                <p className="text-xs text-slate-500 mb-8">
                    {t('offline.lock.hint')}
                </p>
                <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-400/80">
                    <FiWifiOff size={14} />
                    {t('offline.lock.offlineFor').replace(
                        '{{duration}}',
                        formatGraceRemaining(state.elapsedMs),
                    )}
                </div>
            </div>
        </div>
    );
};
