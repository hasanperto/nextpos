import React, { useEffect, useState } from 'react';
import { FiWifiOff, FiRefreshCcw, FiAlertTriangle } from 'react-icons/fi';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { getPendingSyncCount } from '../lib/syncQueueClient';
import {
    getOfflinePolicyState,
    formatGraceRemaining,
    type OfflinePolicyState,
} from '../lib/offlinePolicy';

export const OfflineBanner: React.FC = () => {
    const { t } = usePosLocale();
    const [policy, setPolicy] = useState<OfflinePolicyState>(() => getOfflinePolicyState());
    const [pendingCount, setPendingCount] = useState(0);

    const refresh = () => {
        setPolicy(getOfflinePolicyState());
        void getPendingSyncCount().then(setPendingCount).catch(() => {});
    };

    useEffect(() => {
        refresh();
        window.addEventListener('online', refresh);
        window.addEventListener('offline', refresh);
        window.addEventListener('nextpos-offline-policy', refresh);
        window.addEventListener('nextpos-sync-pending', refresh);
        const interval = window.setInterval(refresh, 5000);
        return () => {
            window.removeEventListener('online', refresh);
            window.removeEventListener('offline', refresh);
            window.removeEventListener('nextpos-offline-policy', refresh);
            window.removeEventListener('nextpos-sync-pending', refresh);
            window.clearInterval(interval);
        };
    }, []);

    if (policy.isGraceExpired) return null;

    const showBanner = policy.isOffline || policy.isSuspicious || pendingCount > 0;
    if (!showBanner) return null;

    const maxHours = Math.round(policy.maxGraceMs / (60 * 60 * 1000));
    const warnThreshold = policy.maxGraceMs * 0.85;
    const isCritical = (policy.isOffline || policy.isSuspicious) && policy.elapsedMs > warnThreshold;
    const isSuspicious = policy.isSuspicious;

    return (
        <div className={`w-full ${isSuspicious ? 'bg-fuchsia-700' : isCritical ? 'bg-rose-600' : policy.isOffline ? 'bg-amber-600' : 'bg-indigo-600'} text-white px-4 py-2 flex items-center justify-center gap-4 shadow-md z-[100] relative`}>
            {isSuspicious ? (
                <FiAlertTriangle size={18} className="animate-pulse" />
            ) : isCritical ? (
                <FiAlertTriangle size={18} className="animate-pulse" />
            ) : policy.isOffline ? (
                <FiWifiOff size={18} />
            ) : (
                <FiRefreshCcw size={18} className="animate-spin" />
            )}
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 text-xs sm:text-sm font-bold">
                <span className="uppercase tracking-widest text-[10px] sm:text-xs">
                    {isSuspicious
                        ? t('offline.suspiciousTitle')
                        : policy.isOffline
                          ? t('offline.bannerTitle')
                          : t('offline.syncingTitle')}
                </span>
                <span className="hidden sm:inline opacity-50">•</span>
                <span className="flex items-center gap-1 opacity-90">
                    <FiRefreshCcw size={12} className="animate-spin" />
                    {policy.isOffline
                        ? t('offline.syncPendingRemaining')
                            .replace('{{remaining}}', formatGraceRemaining(policy.graceRemainingMs))
                            .replace('{{hours}}', String(maxHours))
                        : t('offline.pendingItemsCount').replace('{{count}}', String(pendingCount))}
                </span>
            </div>
            {isCritical && (
                <div className="ml-2 px-2 py-0.5 bg-white/20 rounded text-[9px] uppercase font-black tracking-widest animate-pulse border border-white/40">
                    {t('offline.limitWarning')}
                </div>
            )}
        </div>
    );
};
