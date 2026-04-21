import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiBell, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../store/useAuthStore';

type WaiterRow = {
    id: number;
    name: string;
    username?: string;
};

const PANEL_W = 360;
const GAP = 8;

type Props = {
    open: boolean;
    onClose: () => void;
    onAfterSubmit?: () => void;
    /** Garson çağır butonu — panel bu öğenin altında açılır */
    anchorRef: React.RefObject<HTMLElement | null>;
};

export const CashierCallWaiterModal: React.FC<Props> = ({ open, onClose, onAfterSubmit, anchorRef }) => {
    const { getAuthHeaders } = useAuthStore();
    const [waiters, setWaiters] = useState<WaiterRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [waiterId, setWaiterId] = useState<number | ''>('');
    const [note, setNote] = useState('');
    const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const updatePanelPosition = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const pad = 10;
        let left = r.left;
        if (left + PANEL_W > window.innerWidth - pad) {
            left = Math.max(pad, window.innerWidth - PANEL_W - pad);
        }
        if (left < pad) left = pad;
        let top = r.bottom + GAP;
        const maxH = Math.min(480, window.innerHeight - top - pad);
        if (maxH < 200 && r.top > 120) {
            top = Math.max(pad, r.top - GAP - Math.min(420, r.top - pad));
        }
        setPanelPos({ top, left });
    }, [anchorRef]);

    useLayoutEffect(() => {
        if (!open) return;
        updatePanelPosition();
    }, [open, updatePanelPosition]);

    useEffect(() => {
        if (!open) return;
        const onWin = () => updatePanelPosition();
        window.addEventListener('resize', onWin);
        window.addEventListener('scroll', onWin, true);
        return () => {
            window.removeEventListener('resize', onWin);
            window.removeEventListener('scroll', onWin, true);
        };
    }, [open, updatePanelPosition]);

    useEffect(() => {
        if (!open) return;
        setWaiterId('');
        setNote('');
        setLoading(true);
        void (async () => {
            try {
                const res = await fetch('/api/v1/users/waiters', { headers: getAuthHeaders() });
                const data = res.ok ? await res.json() : [];
                setWaiters(Array.isArray(data) ? data : []);
            } catch {
                setWaiters([]);
                toast.error('Garson listesi yüklenemedi');
            } finally {
                setLoading(false);
            }
        })();
    }, [open, getAuthHeaders]);

    const handleSubmit = async () => {
        const wid = waiterId === '' ? NaN : Number(waiterId);
        if (!Number.isFinite(wid) || wid <= 0) {
            toast.error('Garson seçin');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/v1/service-calls/from-cashier', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetWaiterId: wid,
                    message: note.trim() || undefined,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error((err as { error?: string }).error || 'Çağrı gönderilemedi');
                return;
            }
            toast.success('Garson çağrısı gönderildi');
            onAfterSubmit?.();
            onClose();
        } catch {
            toast.error('Bağlantı hatası');
        } finally {
            setSubmitting(false);
        }
    };

    const modal = (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[230] bg-black/50 backdrop-blur-[2px]"
                        aria-hidden
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                        style={{
                            position: 'fixed',
                            top: panelPos.top,
                            left: panelPos.left,
                            width: PANEL_W,
                            maxWidth: 'calc(100vw - 20px)',
                            zIndex: 240,
                        }}
                        className="rounded-[24px] border border-white/10 bg-[#0c121d] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cashier-call-waiter-title"
                    >
                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                                    <FiBell size={22} />
                                </div>
                                <div className="min-w-0">
                                    <h2 id="cashier-call-waiter-title" className="text-lg font-black text-white tracking-tight">
                                        Garson çağır
                                    </h2>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                        Garson seçin (masa bağlı değil)
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label="Kapat"
                            >
                                <FiX size={22} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[min(55dvh,420px)] overflow-y-auto overscroll-contain">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                                    Garson
                                </label>
                                {loading ? (
                                    <div className="text-xs text-slate-500 font-bold py-3">Yükleniyor…</div>
                                ) : (
                                    <select
                                        value={waiterId === '' ? '' : String(waiterId)}
                                        onChange={(e) => setWaiterId(e.target.value ? Number(e.target.value) : '')}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-amber-500/40"
                                    >
                                        <option value="">Garson seçin…</option>
                                        {waiters.map((w) => (
                                            <option key={w.id} value={w.id}>
                                                {w.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                                    Not (isteğe bağlı)
                                </label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    placeholder="Örn: Kasiyere gel / şef masası"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder:text-slate-600 outline-none focus:border-amber-500/40 resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 min-h-[48px] rounded-xl border border-white/10 text-slate-400 font-black text-xs uppercase tracking-wider hover:bg-white/5"
                            >
                                Vazgeç
                            </button>
                            <button
                                type="button"
                                disabled={submitting || loading}
                                onClick={() => void handleSubmit()}
                                className="flex-1 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0a0e1a] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FiUser size={18} />
                                {submitting ? 'Gönderiliyor…' : 'Çağrı gönder'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(modal, document.body);
};
