import React, { useCallback, useEffect, useState } from 'react';
import { PinCodeModal } from '../features/terminal/components/PinCodeModal';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { useAuthStore } from '../store/useAuthStore';
import { getDeviceId } from '../lib/deviceId';
import { validateHeartbeatResponse } from '../lib/offlineAttestation';
import {
    getOfflinePolicyState,
    markOfflinePinUnlocked,
    needsOfflinePinUnlock,
} from '../lib/offlinePolicy';
import toast from 'react-hot-toast';
import { FiShield, FiAlertTriangle } from 'react-icons/fi';

/**
 * Offline / şüpheli bağlantı durumunda yönetici PIN zorunluluğu.
 * Sahte sunucu veya kasıtlı bağlantı kesintisine karşı.
 */
export const OfflinePinGate: React.FC = () => {
    const { t } = usePosLocale();
    const { token, tenantId, isAuthenticated, getAuthHeaders } = useAuthStore();
    const [open, setOpen] = useState(false);
    const [policyTick, setPolicyTick] = useState(0);

    useEffect(() => {
        const refresh = () => setPolicyTick((n) => n + 1);
        window.addEventListener('nextpos-offline-policy', refresh);
        const iv = window.setInterval(refresh, 3000);
        return () => {
            window.removeEventListener('nextpos-offline-policy', refresh);
            window.clearInterval(iv);
        };
    }, []);

    const state = getOfflinePolicyState();
    const shouldGate = isAuthenticated && needsOfflinePinUnlock() && !state.isGraceExpired;

    useEffect(() => {
        setOpen(shouldGate);
    }, [shouldGate, policyTick]);

    const handleUnlock = useCallback(
        async (pinCode: string) => {
            if (!tenantId || !token) return;
            try {
                const res = await fetch('/api/v1/sync/offline-unlock', {
                    method: 'POST',
                    headers: {
                        ...getAuthHeaders(),
                        'Content-Type': 'application/json',
                        'x-device-id': getDeviceId(),
                    },
                    body: JSON.stringify({ pinCode }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    serverTime?: string;
                    graceExpiresAt?: number;
                    pinUnlockExpiresAt?: number | null;
                    offlineToken?: string;
                    tenantId?: string;
                };

                if (!res.ok) {
                    toast.error(data.error || t('offline.pin.invalid'));
                    return;
                }

                if (
                    !validateHeartbeatResponse(
                        {
                            ok: data.ok,
                            tenantId: data.tenantId,
                            deviceId: getDeviceId(),
                            serverTime: data.serverTime,
                            graceExpiresAt: data.graceExpiresAt,
                            pinUnlockExpiresAt: data.pinUnlockExpiresAt,
                            offlineToken: data.offlineToken,
                        },
                        tenantId,
                    )
                ) {
                    toast.error(t('offline.pin.verifyFailed'));
                    return;
                }

                markOfflinePinUnlocked(data.pinUnlockExpiresAt ?? null, Number(data.graceExpiresAt));
                toast.success(t('offline.pin.unlocked'));
                setOpen(false);
            } catch {
                toast.error(t('offline.pin.networkError'));
            }
        },
        [tenantId, token, getAuthHeaders, t],
    );

    if (!shouldGate) return null;

    return (
        <>
            <div className="fixed inset-0 z-[9998] bg-[#020617]/90 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="max-w-sm w-full rounded-[2rem] border border-rose-500/30 bg-[#0f172a] p-8 text-center shadow-2xl">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                        {state.isSuspicious ? <FiAlertTriangle size={28} /> : <FiShield size={28} />}
                    </div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight mb-2">
                        {state.isSuspicious ? t('offline.pin.suspiciousTitle') : t('offline.pin.title')}
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed mb-6">
                        {state.isSuspicious ? t('offline.pin.suspiciousDesc') : t('offline.pin.desc')}
                    </p>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest transition-colors"
                    >
                        {t('offline.pin.openModal')}
                    </button>
                </div>
            </div>

            <PinCodeModal
                isOpen={open}
                onClose={() => setOpen(false)}
                onSuccess={(pin) => void handleUnlock(pin)}
                title={t('offline.pin.modalTitle')}
                description={t('offline.pin.modalDesc')}
                skipServerVerify
            />
        </>
    );
};
