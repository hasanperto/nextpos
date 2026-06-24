import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiShoppingBag, FiBell, FiAlertTriangle, FiCheckCircle, FiGlobe } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa6';
import { useNotificationStore, type PosNotification, type NotificationKind } from '../../store/useNotificationStore';

/* ═══════════ Stil Haritası ═══════════ */

const KIND_STYLES: Record<NotificationKind, {
    gradient: string;
    border: string;
    icon: React.ReactNode;
    iconBg: string;
    progressColor: string;
    label: string;
}> = {
    qr_order: {
        gradient: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
        border: 'border-emerald-500/40',
        icon: <FiShoppingBag size={20} />,
        iconBg: 'bg-emerald-500/25 text-emerald-300',
        progressColor: 'bg-emerald-400',
        label: '📱 QR Sipariş',
    },
    service_call: {
        gradient: 'from-amber-500/20 via-amber-600/10 to-transparent',
        border: 'border-amber-500/40',
        icon: <FiBell size={20} />,
        iconBg: 'bg-amber-500/25 text-amber-300',
        progressColor: 'bg-amber-400',
        label: '🔔 Garson Çağrısı',
    },
    service_call_urgent: {
        gradient: 'from-red-500/25 via-red-600/15 to-transparent',
        border: 'border-red-500/50',
        icon: <FiAlertTriangle size={20} />,
        iconBg: 'bg-red-500/25 text-red-300',
        progressColor: 'bg-red-400',
        label: '⚠️ Acil Çağrı',
    },
    external_order: {
        gradient: 'from-blue-500/20 via-blue-600/10 to-transparent',
        border: 'border-blue-500/40',
        icon: <FiGlobe size={20} />,
        iconBg: 'bg-blue-500/25 text-blue-300',
        progressColor: 'bg-blue-400',
        label: '🌐 Online Sipariş',
    },
    item_ready: {
        gradient: 'from-cyan-500/20 via-cyan-600/10 to-transparent',
        border: 'border-cyan-500/40',
        icon: <FiCheckCircle size={20} />,
        iconBg: 'bg-cyan-500/25 text-cyan-300',
        progressColor: 'bg-cyan-400',
        label: '🍳 Sipariş Hazır',
    },
    whatsapp_order: {
        gradient: 'from-green-500/20 via-green-600/10 to-transparent',
        border: 'border-green-500/40',
        icon: <FaWhatsapp size={20} />,
        iconBg: 'bg-green-500/25 text-green-300',
        progressColor: 'bg-green-400',
        label: 'WhatsApp Siparişi',
    },
};

/* ═══════════ Countdown Progress Bar ═══════════ */

function CountdownBar({ createdAt, ttl, color }: { createdAt: number; ttl: number; color: string }) {
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        const interval = setInterval(() => {
            const elapsed = Date.now() - createdAt;
            const pct = Math.max(0, 100 - (elapsed / ttl) * 100);
            setProgress(pct);
            if (pct <= 0) clearInterval(interval);
        }, 50);
        return () => clearInterval(interval);
    }, [createdAt, ttl]);

    return (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden rounded-b-2xl bg-white/5">
            <motion.div
                className={`h-full ${color}`}
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
            />
        </div>
    );
}

/* ═══════════ Tek Bildirim Kartı ═══════════ */

function NotificationCard({ notification, onDismiss }: { notification: PosNotification; onDismiss: () => void }) {
    const style = KIND_STYLES[notification.kind];

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 120, scale: 0.85 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => {
                if (info.offset.x > 100) onDismiss();
            }}
            className={`
                relative w-[360px] overflow-hidden rounded-2xl
                border ${style.border}
                bg-gradient-to-r ${style.gradient}
                backdrop-blur-2xl backdrop-saturate-[1.8]
                shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]
                cursor-pointer select-none
                hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]
                transition-shadow duration-200
            `}
            onClick={onDismiss}
        >
            {/* Glassmorphism background layer */}
            <div className="absolute inset-0 bg-[#0d1f35]/85 -z-10" />

            <div className="flex items-start gap-3 px-4 py-3.5">
                {/* Icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
                    {style.icon}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                            {style.label}
                        </span>
                        {notification.tableName && (
                            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70">
                                {notification.tableName}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-bold text-white/95">
                        {notification.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/50">
                        {notification.body}
                    </p>
                    {notification.totalAmount != null && notification.totalAmount > 0 && (
                        <p className="mt-1 text-xs font-bold tabular-nums text-emerald-300/90">
                            €{Number(notification.totalAmount).toFixed(2)}
                        </p>
                    )}
                </div>

                {/* Dismiss */}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/40 transition hover:bg-white/15 hover:text-white/80"
                    aria-label="Kapat"
                >
                    <FiX size={14} />
                </button>
            </div>

            {/* Progress Bar */}
            <CountdownBar
                createdAt={notification.createdAt}
                ttl={notification.ttl}
                color={style.progressColor}
            />
        </motion.div>
    );
}

/* ═══════════ Overlay Container ═══════════ */

export const NotificationOverlay: React.FC = () => {
    const { notifications, dismissNotification } = useNotificationStore();

    return (
        <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
                {notifications.map((n) => (
                    <div key={n.id} className="pointer-events-auto">
                        <NotificationCard
                            notification={n}
                            onDismiss={() => dismissNotification(n.id)}
                        />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
};
