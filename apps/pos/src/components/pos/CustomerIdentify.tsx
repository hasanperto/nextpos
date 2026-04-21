import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiUser, FiCheck, FiX, FiPhone, FiHash, FiCamera } from 'react-icons/fi';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuthStore } from '../../store/useAuthStore';
import toast from 'react-hot-toast';

export interface IdentifiedCustomer {
    id: number;
    name: string;
    phone?: string | null;
    customer_code?: string | null;
    reward_points?: number;
}

interface Props {
    onSelect: (customer: IdentifiedCustomer | null) => void;
    onClose?: () => void;
    placeholder?: string;
    isPublic?: boolean;
    tenantId?: string;
    /** Garson masa açma gibi koyu arka planlar için; kiosk = NextPOS masa tableti teması */
    variant?: 'light' | 'dark' | 'kiosk';
}

export const CustomerIdentify: React.FC<Props> = ({
    onSelect,
    onClose,
    placeholder = 'İsim, telefon veya müşteri kodu…',
    isPublic = false,
    tenantId,
    variant = 'light',
}) => {
    const { getAuthHeaders } = useAuthStore();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [results, setResults] = useState<IdentifiedCustomer[]>([]);
    const [foundCustomer, setFoundCustomer] = useState<IdentifiedCustomer | null>(null);
    const [qrOpen, setQrOpen] = useState(false);
    const qrReaderDomId = useId().replace(/:/g, '');
    const qrScannerRef = useRef<Html5Qrcode | null>(null);
    /** QR callback useEffect’inden güncel identify çağrısı için */
    const identifyByQueryRef = useRef<(raw: string, opts?: { fromQr?: boolean }) => Promise<void>>(async () => {});

    const isDark = variant === 'dark';
    const isKiosk = variant === 'kiosk';

    const inputClass = isDark
        ? 'w-full bg-white/[0.06] border border-white/10 rounded-2xl py-4 pl-14 pr-[3.75rem] text-base text-white font-bold outline-none focus:ring-2 focus:ring-[#e91e63]/40 focus:border-[#e91e63]/30 placeholder:text-slate-500 min-h-[52px]'
        : 'w-full bg-slate-100 border-none rounded-2xl py-4 pl-14 pr-[3.75rem] text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[48px]';

    /** QR / public: tek sonuç (identify). fromQr: kamera okuması — ARA’ya basmadan çalışır, başarıda kiosk’ta hoş geldin + menüye geçiş */
    const identifyByQuery = useCallback(
        async (raw: string, opts?: { fromQr?: boolean }) => {
            const q = raw.trim();
            if (!q) return;

            setLoading(true);
            setQuery(q);
            try {
                const url = isPublic
                    ? `/api/v1/qr/identify?query=${encodeURIComponent(q)}`
                    : `/api/v1/customers/identify?query=${encodeURIComponent(q)}`;

                const headers: Record<string, string> = isPublic ? { 'x-tenant-id': tenantId || '' } : getAuthHeaders();

                const res = await fetch(url, { headers });
                if (res.ok) {
                    const data = await res.json();
                    setFoundCustomer(data);
                    if (isKiosk) {
                        toast.success(`Hoş geldin, ${data.name}!`);
                    } else {
                        toast.success(`Müşteri: ${data.name}`);
                    }
                    if (isPublic && opts?.fromQr) {
                        onSelect(data);
                        if (onClose) onClose();
                    }
                } else {
                    setFoundCustomer(null);
                    toast.error('Müşteri bulunamadı');
                }
            } catch {
                toast.error('Bağlantı hatası');
            } finally {
                setLoading(false);
            }
        },
        [isPublic, tenantId, getAuthHeaders, isKiosk, onSelect, onClose],
    );

    useEffect(() => {
        identifyByQueryRef.current = identifyByQuery;
    }, [identifyByQuery]);

    const handleIdentifySubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;
        await identifyByQuery(query, { fromQr: false });
    };

    /** Kasiyer/garson: liste araması */
    const runSearch = useCallback(
        async (q: string) => {
            const t = q.trim();
            if (t.length < 1) {
                setResults([]);
                return;
            }
            setSearchLoading(true);
            try {
                const res = await fetch(`/api/v1/customers/search?q=${encodeURIComponent(t)}`, {
                    headers: getAuthHeaders(),
                });
                if (res.ok) {
                    const data = await res.json();
                    setResults(Array.isArray(data) ? data : []);
                } else {
                    setResults([]);
                }
            } catch {
                setResults([]);
            } finally {
                setSearchLoading(false);
            }
        },
        [getAuthHeaders],
    );

    useEffect(() => {
        if (isPublic) return;
        const t = setTimeout(() => {
            void runSearch(query);
        }, 320);
        return () => clearTimeout(t);
    }, [query, isPublic, runSearch]);

    /** Telefon kamerası ile QR / barkod → metin alanına */
    useEffect(() => {
        if (!qrOpen) return;

        let cancelled = false;
        const elId = `ci-qr-${qrReaderDomId}`;

        const stop = async () => {
            const s = qrScannerRef.current;
            qrScannerRef.current = null;
            if (!s) return;
            try {
                await s.stop();
                await s.clear();
            } catch {
                /* ignore */
            }
        };

        const start = async () => {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            try {
                const html5 = new Html5Qrcode(elId);
                qrScannerRef.current = html5;
                await html5.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: (w, h) => {
                            const edge = Math.min(w, h, 280);
                            return { width: edge, height: edge };
                        },
                    },
                    (decodedText) => {
                        if (cancelled) return;
                        const t = decodedText.trim();
                        if (!t) return;
                        setQrOpen(false);
                        if (isPublic) {
                            void identifyByQueryRef.current(t, { fromQr: true });
                        } else {
                            setQuery(t);
                            toast.success('Kod okundu');
                        }
                    },
                    () => {}
                );
            } catch {
                if (!cancelled) {
                    toast.error('Kamera açılamadı — izin verin veya HTTPS / localhost kullanın');
                    setQrOpen(false);
                }
            }
        };

        void start();

        return () => {
            cancelled = true;
            void stop();
        };
    }, [qrOpen, qrReaderDomId, isPublic]);

    const pickCustomer = (c: IdentifiedCustomer) => {
        onSelect(c);
        if (onClose) onClose();
    };

    const clearPick = () => {
        setFoundCustomer(null);
        setQuery('');
        setResults([]);
        onSelect(null);
    };

    const qrScanButtonClass = isDark
        ? 'min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center border border-white/15 bg-white/10 text-white hover:bg-[#e91e63]/25 hover:border-[#e91e63]/40 transition-all touch-manipulation active:scale-95'
        : 'min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center border border-slate-200 bg-white text-indigo-600 hover:bg-indigo-50 transition-all touch-manipulation active:scale-95';

    const qrModal =
        typeof document !== 'undefined'
            ? createPortal(
                  <AnimatePresence>
                      {qrOpen && (
                          <motion.div
                              key="qr"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
                              role="dialog"
                              aria-modal="true"
                              aria-label="QR kod tarama"
                          >
                              <div className="w-full max-w-md space-y-4">
                                  <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-black text-white uppercase tracking-widest">Kamera ile tara</p>
                                      <button
                                          type="button"
                                          onClick={() => setQrOpen(false)}
                                          className="min-h-[44px] min-w-[44px] rounded-xl border border-white/20 text-white hover:bg-white/10 flex items-center justify-center touch-manipulation"
                                          aria-label="Kapat"
                                      >
                                          <FiX size={22} />
                                      </button>
                                  </div>
                                  <div
                                      id={`ci-qr-${qrReaderDomId}`}
                                      className="w-full overflow-hidden rounded-2xl bg-black [&_video]:rounded-2xl"
                                  />
                                  <p className="text-center text-[11px] font-bold text-slate-500">
                                      QR veya barkodu çerçeve içine getirin; okunan metin arama alanına yazılır.
                                  </p>
                              </div>
                          </motion.div>
                      )}
                  </AnimatePresence>,
                  document.body
              )
            : null;

    const kioskInputClass =
        'w-full rounded-2xl border border-[#1E3A55] bg-[#1A2F45] py-4 pl-14 pr-[7.5rem] text-base font-bold text-[#F0F6FF] outline-none transition-all min-h-[52px] placeholder:text-[#4E6A88] focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/25';
    const kioskSearchIcon = 'absolute left-5 top-1/2 -translate-y-1/2 text-[#4E6A88] transition-colors group-focus-within:text-emerald-400';
    const kioskCamBtn =
        'min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center border border-[#1E3A55] bg-[#112035] text-emerald-400 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 touch-manipulation active:scale-95';
    const kioskSubmitBtn =
        'min-h-[40px] rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-emerald-600 disabled:opacity-50';

    if (isPublic) {
        return (
            <div className="w-full space-y-4">
                {qrModal}
                <form onSubmit={handleIdentifySubmit} className="relative group">
                    <FiSearch
                        className={
                            isKiosk
                                ? kioskSearchIcon
                                : 'absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500'
                        }
                    />
                    <input
                        type="text"
                        inputMode="search"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={placeholder}
                        className={isKiosk ? kioskInputClass : 'w-full bg-slate-100 border-none rounded-2xl py-4 pl-14 pr-[7.5rem] text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[48px]'}
                        autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setQrOpen(true)}
                            className={isKiosk ? kioskCamBtn : qrScanButtonClass}
                            title="QR / barkod tara"
                            aria-label="QR kod tara"
                        >
                            <FiCamera size={20} />
                        </button>
                        <button type="submit" disabled={loading} className={isKiosk ? kioskSubmitBtn : 'px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 min-h-[40px]'}>
                            {loading ? '…' : 'ARA'}
                        </button>
                    </div>
                </form>

                <AnimatePresence mode="wait">
                    {foundCustomer ? (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={
                                isKiosk
                                    ? 'flex items-center justify-between rounded-[28px] border border-emerald-500/25 bg-[#0f1a28] p-5 shadow-[0_0_32px_rgba(16,185,129,0.12)]'
                                    : 'flex items-center justify-between rounded-[32px] border border-indigo-100 bg-indigo-50 p-6'
                            }
                        >
                            <div className="flex min-w-0 items-center gap-4">
                                <div
                                    className={
                                        isKiosk
                                            ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                                            : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                    }
                                >
                                    <FiUser size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h4
                                        className={`truncate text-sm font-black uppercase tracking-tight ${
                                            isKiosk ? 'text-white' : 'text-slate-800'
                                        }`}
                                    >
                                        {foundCustomer.name}
                                    </h4>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span
                                            className={`flex items-center gap-1 text-[10px] font-bold ${
                                                isKiosk ? 'text-[#8BA3C0]' : 'text-slate-500'
                                            }`}
                                        >
                                            <FiPhone size={10} /> {foundCustomer.phone || '—'}
                                        </span>
                                        <span
                                            className={`flex items-center gap-1 text-[10px] font-bold ${
                                                isKiosk ? 'text-emerald-400/90' : 'text-indigo-600'
                                            }`}
                                        >
                                            <FiHash size={10} /> {foundCustomer.customer_code || '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSelect(foundCustomer);
                                        if (onClose) onClose();
                                    }}
                                    className="flex h-11 min-h-[44px] w-11 min-w-[44px] touch-manipulation items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg transition-all hover:scale-105 active:scale-95"
                                >
                                    <FiCheck size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFoundCustomer(null);
                                        setQuery('');
                                    }}
                                    className={`flex h-11 min-h-[44px] w-11 min-w-[44px] touch-manipulation items-center justify-center rounded-xl transition-all ${
                                        isKiosk
                                            ? 'border border-[#1E3A55] bg-[#1A2F45] text-[#8BA3C0] hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300'
                                            : 'bg-slate-200 text-slate-500 hover:bg-rose-500 hover:text-white'
                                    }`}
                                >
                                    <FiX size={18} />
                                </button>
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="w-full space-y-3">
            {qrModal}
            <div className="relative group">
                <FiSearch
                    className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-500 group-focus-within:text-[#e91e63]' : 'text-slate-400 group-focus-within:text-indigo-500'} transition-colors`}
                />
                <input
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className={inputClass}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {searchLoading && (
                        <span className="text-[10px] font-black text-slate-500 uppercase tabular-nums">…</span>
                    )}
                    <button
                        type="button"
                        onClick={() => setQrOpen(true)}
                        className={qrScanButtonClass}
                        title="QR / barkod tara"
                        aria-label="QR kod tara"
                    >
                        <FiCamera size={20} />
                    </button>
                </div>
            </div>

            <p className={`text-[10px] font-bold uppercase tracking-widest px-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                İsim, telefon veya müşteri kodu yazın; kamera ile QR okutun veya listeden seçin.
            </p>

            <div
                className={`max-h-[min(50vh,320px)] sm:max-h-[380px] overflow-y-auto overscroll-contain rounded-2xl border ${isDark ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50/50'} p-2 space-y-1.5 touch-pan-y`}
            >
                {results.length === 0 && !searchLoading && query.trim().length >= 1 && (
                    <div className={`py-10 text-center text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                        Sonuç yok
                    </div>
                )}
                {query.trim().length < 1 && (
                    <div className={`py-8 text-center text-[11px] font-bold ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                        Aramak için en az 1 karakter girin
                    </div>
                )}
                {results.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCustomer(c)}
                        className={`w-full text-left min-h-[52px] px-4 py-3 rounded-xl flex flex-col gap-1 transition-all touch-manipulation active:scale-[0.99] ${
                            isDark
                                ? 'bg-white/[0.04] hover:bg-[#e91e63]/15 border border-white/5 hover:border-[#e91e63]/35'
                                : 'bg-white hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200'
                        }`}
                    >
                        <span className={`font-black text-sm leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{c.name}</span>
                        <span className={`text-[11px] font-bold flex flex-wrap gap-x-3 gap-y-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <span className="inline-flex items-center gap-1">
                                <FiPhone size={12} className="opacity-70" />
                                {c.phone || '—'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <FiHash size={12} className="opacity-70" />
                                {c.customer_code || '—'}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            <button
                type="button"
                onClick={clearPick}
                className={`w-full min-h-[48px] rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all touch-manipulation active:scale-[0.99] ${
                    isDark
                        ? 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
            >
                Müşteri seçmeden devam (kayıtsız misafir)
            </button>
        </div>
    );
};
