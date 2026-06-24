import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { io, type Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiBell, FiCreditCard, FiMinus, FiPlus, FiShoppingBag, FiX,
    FiSearch, FiChevronLeft, FiChevronDown, FiMapPin, FiPhone,
    FiDroplet, FiTrash2, FiCheck,
} from 'react-icons/fi';
import * as FaIcons from 'react-icons/fa';
import { TRANSLATIONS, LANG_OPTIONS, type LangCode } from './i18n.ts';

/* ═══════════ TYPES ═══════════ */

type RestaurantConfig = {
    tenantId: string;
    restaurantName: string;
    phone: string | null;
    address: string | null;
    currency: string;
    logo: string | null;
    themeColor: string;
    languages: string[];
    defaultLang: string;
};

type Category = { id: number; displayName: string; name: string; icon?: string };
type Variant = { id: number; name: string; price: string | number; isDefault?: boolean };
type Modifier = { id: number; name: string; price: string | number; categoryName?: string };
type Product = {
    id: number;
    categoryId?: number;
    displayName: string;
    description?: string;
    image?: string;
    basePrice: string | number;
    variants: Variant[];
    modifiers: Modifier[];
};

type CartLine = {
    key: string;
    productId: number;
    productName: string;
    variantId?: number;
    variantName?: string;
    quantity: number;
    modifierIds: number[];
    modifierLabel: string;
    unitPrice: number;
};

type CustomerAddress = {
    id: number;
    label?: string;
    address: string;
    district?: string;
    city?: string;
    is_default?: boolean;
};

type LinkedCustomer = {
    id: number;
    name: string;
    phone: string | null;
    customer_code: string | null;
    reward_points?: number | null;
    addresses?: CustomerAddress[];
};

type QrMemberRegistration = {
    completed: boolean;
    name: string;
    phone: string | null;
    address: string | null;
    customer_code: string;
    memberQrPayload: string;
    orderId: number;
};

type View =
    | 'loading'
    | 'error'
    | 'idle'
    | 'web_idle'
    | 'web_service'
    | 'login_local'
    | 'order_type'
    | 'menu'
    | 'checkout'
    | 'order_receipt'
    | 'order_status'
    | 'service'
    | 'desktop_intro';
type ServiceType = 'dine_in' | 'delivery' | 'takeaway';
type CheckoutPaymentMethod = 'cash' | 'card' | 'paypal' | 'google_pay';

/* ═══════════ HELPERS ═══════════ */

const CategoryIcon = ({ iconName, className }: { iconName?: string; className?: string }) => {
    if (!iconName) return <span className={className}>🍽️</span>;
    if (/\p{Emoji}/u.test(iconName)) return <span className={className}>{iconName}</span>;
    const name = iconName.startsWith('Fa') ? iconName : `Fa${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`;
    const Comp = (FaIcons as Record<string, any>)[name];
    return Comp ? <Comp className={className} /> : <span className={className}>🍽️</span>;
};

/** localhost:4003 vb. için domain yerine x-tenant-id (plan + yerel geliştirme) */
function useLocalQrWebHeaders(): Record<string, string> {
    return useMemo((): Record<string, string> => {
        if (typeof window === 'undefined') return {};
        const h = window.location.hostname.replace(/^::ffff:/i, '');
        const isLocal =
            h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
        if (!isLocal) return {};
        const fromQuery = new URLSearchParams(window.location.search).get('tenant')?.trim();
        const fromEnv = (import.meta.env.VITE_QR_WEB_TENANT_ID as string | undefined)?.trim();
        const tenantId =
            fromQuery ||
            fromEnv ||
            'a1111111-1111-4111-8111-111111111111';
        return { 'x-tenant-id': tenantId };
    }, []);
}

/** nextpos_qrmenu_v2(1).html idle-qr dekor (8×8) */
const IDLE_QR_CELLS =
    '1011010110100101101001011010100110100101101001011010100110100101'.split('').map((c) => c === '1');

type Tx = (typeof TRANSLATIONS)['tr'];

function normalizeTrackStatus(s: string): string {
    if (s === 'completed') return 'delivered';
    return s;
}

function orderStatusLabel(s: string, t: Tx): string {
    const n = normalizeTrackStatus(s);
    const map: Record<string, string> = {
        pending: t.pending,
        confirmed: t.statusConfirmed,
        preparing: t.preparing,
        ready: t.ready,
        delivered: t.delivered,
        cancelled: t.statusCancelled,
    };
    return map[n] ?? n;
}

function OrderLookupModal({
    open,
    onClose,
    t,
    input,
    phoneInput,
    onInputChange,
    onPhoneChange,
    onSubmit,
    loading,
    track,
    error,
}: {
    open: boolean;
    onClose: () => void;
    t: Tx;
    input: string;
    phoneInput: string;
    onInputChange: (v: string) => void;
    onPhoneChange: (v: string) => void;
    onSubmit: () => void;
    loading: boolean;
    track: { status?: string } | null;
    error: string | null;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-lookup-title"
        >
            <button type="button" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label={t.close} />
            <div
                className="relative z-[1] w-full max-w-md rounded-2xl border border-[#1e3a55] bg-[#112035] p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-2">
                    <h2 id="order-lookup-title" className="text-base font-bold text-[#f0f6ff]">
                        {t.orderLookupModalTitle}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-[#8ba3c0] transition hover:bg-[#1a2f45] hover:text-[#f0f6ff]"
                        aria-label={t.close}
                    >
                        <FiX className="text-xl" />
                    </button>
                </div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#4e6a88]" htmlFor="order-lookup-input">
                    {t.orderLookupLabel}
                </label>
                <input
                    id="order-lookup-input"
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSubmit();
                    }}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t.orderLookupPlaceholder}
                    className="w-full rounded-xl border-[1.5px] border-[#1e3a55] bg-[#1a2f45] px-4 py-3.5 text-sm text-[#f0f6ff] placeholder:text-[#4e6a88] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
                <label className="mb-1.5 mt-3 block text-[11px] font-semibold uppercase tracking-wide text-[#4e6a88]" htmlFor="order-lookup-phone">
                    {t.orderLookupPhoneLabel}
                </label>
                <input
                    id="order-lookup-phone"
                    value={phoneInput}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSubmit();
                    }}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={t.orderLookupPhonePlaceholder}
                    className="w-full rounded-xl border-[1.5px] border-[#1e3a55] bg-[#1a2f45] px-4 py-3.5 text-sm text-[#f0f6ff] placeholder:text-[#4e6a88] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => onSubmit()}
                    className="mt-4 w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? '…' : t.orderLookupSubmit}
                </button>
                {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}
                {track?.status ? (
                    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">{t.orderLookupStatusHeading}</p>
                        <p className="mt-1 text-lg font-bold text-[#f0f6ff]">{orderStatusLabel(track.status, t)}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function CustomerAddressesModal({
    open,
    onClose,
    t,
    linkedCustomer,
    onAddressesUpdated,
    onSelectAddress,
    hdr,
}: {
    open: boolean;
    onClose: () => void;
    t: any;
    linkedCustomer: LinkedCustomer | null;
    onAddressesUpdated: (updatedAddresses: CustomerAddress[]) => void;
    onSelectAddress?: (address: CustomerAddress) => void;
    hdr: (extra?: Record<string, string>) => HeadersInit;
}) {
    const [label, setLabel] = useState('');
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [locationLoading, setLocationLoading] = useState(false);

    const handleDetectLocationModal = () => {
        if (!navigator.geolocation) {
            toast.error('Tarayıcınız konum bilgisini desteklemiyor.');
            return;
        }
        setLocationLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=tr`);
                    const data = await res.json();
                    if (data && data.display_name) {
                        setAddress(data.display_name);
                        toast.success('Konumunuz başarıyla algılandı!');
                    } else {
                        toast.error('Adres çözümlenemedi.');
                    }
                } catch {
                    toast.error('Konum servisinden adres alınamadı.');
                } finally {
                    setLocationLoading(false);
                }
            },
            () => {
                toast.error('Konum izni reddedildi veya konum alınamadı.');
                setLocationLoading(false);
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    if (!open || !linkedCustomer) return null;

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!address.trim()) {
            setError('Lütfen bir adres yazın');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/qr-web/addresses', {
                method: 'POST',
                headers: hdr({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    customerId: linkedCustomer.id,
                    phone: linkedCustomer.phone,
                    label: label.trim() || undefined,
                    address: address.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Adres eklenemedi');
            
            const updated = [...(linkedCustomer.addresses || []), data];
            onAddressesUpdated(updated);
            setLabel('');
            setAddress('');
            toast.success('Adres eklendi');
        } catch (err: any) {
            setError(err.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (addressId: number) => {
        if (!window.confirm('Bu adresi silmek istediğinize emin misiniz?')) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/qr-web/addresses/${addressId}?customerId=${linkedCustomer.id}&phone=${encodeURIComponent(linkedCustomer.phone || '')}`, {
                method: 'DELETE',
                headers: hdr(),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Adres silinemedi');
            
            const fetchRes = await fetch(`/api/v1/qr-web/addresses?customerId=${linkedCustomer.id}&phone=${encodeURIComponent(linkedCustomer.phone || '')}`, {
                headers: hdr()
            });
            const fresh = await fetchRes.json();
            onAddressesUpdated(fresh);
            toast.success('Adres silindi');
        } catch (err: any) {
            setError(err.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleSetDefault = async (addressId: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/v1/qr-web/addresses/${addressId}/default`, {
                method: 'PUT',
                headers: hdr({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ customerId: linkedCustomer.id, phone: linkedCustomer.phone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Varsayılan güncellenemedi');
            
            const updated = (linkedCustomer.addresses || []).map(a => ({
                ...a,
                is_default: a.id === addressId,
            }));
            onAddressesUpdated(updated);
            toast.success('Varsayılan adres güncellendi');
        } catch (err: any) {
            setError(err.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
        >
            <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-transparent" onClick={onClose} aria-label={t.close} />
            <div
                className="relative z-[1] flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-[#1e3a55] bg-[#112035] p-5 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="shrink-0 mb-4 flex items-center justify-between border-b border-[#1e3a55]/60 pb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">📍</span>
                        <h2 className="text-base font-bold text-[#f0f6ff]">Adreslerim</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-[#8ba3c0] transition hover:bg-[#1a2f45] hover:text-[#f0f6ff]"
                        aria-label={t.close}
                    >
                        <FiX className="text-xl" />
                    </button>
                </div>

                {/* Modal Content Scrollable Area */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-4 pos-scrollbar">
                    {error && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Address List */}
                    <div className="space-y-3">
                        {(!linkedCustomer.addresses || linkedCustomer.addresses.length === 0) ? (
                            <p className="text-xs text-[#8ba3c0] italic text-center py-4 bg-[#0d1f35] rounded-xl border border-[#1e3a55]/40">
                                Kayıtlı teslimat adresiniz bulunmamaktadır.
                            </p>
                        ) : (
                            linkedCustomer.addresses.map((a) => (
                                <div
                                    key={a.id}
                                    className={`relative rounded-xl border p-3.5 transition ${
                                        a.is_default
                                            ? 'border-emerald-500 bg-emerald-500/[0.04]'
                                            : 'border-[#1e3a55] bg-[#1a2f45]/50 hover:bg-[#1a2f45]'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-[#f0f6ff]">
                                                {a.label ? `🏠 ${a.label}` : '🏠 Adres'}
                                            </span>
                                            {a.is_default && (
                                                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                                                    Varsayılan
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {!a.is_default && (
                                                <button
                                                    type="button"
                                                    disabled={loading}
                                                    onClick={() => void handleSetDefault(a.id)}
                                                    className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition"
                                                    title="Varsayılan Yap"
                                                >
                                                    ★ Varsayılan Yap
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() => void handleDelete(a.id)}
                                                className="rounded p-1 text-red-400 hover:bg-red-500/10 transition"
                                                title="Sil"
                                            >
                                                <FiTrash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-[#8ba3c0] leading-relaxed pr-8">{a.address}</p>

                                    {onSelectAddress && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSelectAddress(a);
                                                onClose();
                                            }}
                                            className="mt-3 w-full rounded-lg bg-[#10b981] py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
                                        >
                                            Seç ve Kullan
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Add Address Form */}
                    <form onSubmit={(e) => void handleAdd(e)} className="border-t border-[#1e3a55]/60 pt-4 space-y-3">
                        <h3 className="text-xs font-bold text-[#f0f6ff] uppercase tracking-wider mb-2">➕ Yeni Adres Ekle</h3>
                        <div>
                            <label className="block text-[10px] font-semibold text-[#4e6a88] uppercase tracking-wider mb-1">Adres Başlığı</label>
                            <input
                                type="text"
                                placeholder="Örn: Evim, İş Yerim, Annemin Evi..."
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                className="w-full rounded-xl border border-[#1e3a55] bg-[#1a2f45] px-3.5 py-2 text-xs text-[#f0f6ff] placeholder:text-[#4e6a88] transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
                            />
                        </div>
                        <div className="relative">
                            <label className="block text-[10px] font-semibold text-[#4e6a88] uppercase tracking-wider mb-1">Açık Adres</label>
                            <textarea
                                placeholder="Mahalle, Cadde, Sokak, No/Daire, Kat vb. tüm detayları yazınız."
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-[#1e3a55] bg-[#1a2f45] pl-3.5 pr-24 py-2 text-xs text-[#f0f6ff] placeholder:text-[#4e6a88] transition resize-none focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
                            />
                            <button
                                type="button"
                                onClick={handleDetectLocationModal}
                                disabled={locationLoading}
                                className="absolute bottom-2.5 right-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25 transition disabled:opacity-50 flex items-center gap-1 active:scale-95"
                            >
                                {locationLoading ? 'Bulunuyor...' : '📍 Konum Bul'}
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !address.trim()}
                            className="w-full rounded-xl bg-[#10b981] py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            {loading ? 'Yükleniyor...' : 'Adresi Kaydet'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function QrIdleLayout({
    mode,
    restaurantName,
    address,
    logoUrl,
    lang,
    setLang,
    onCta,
    onOrderLookup,
    tableName,
    t,
}: {
    mode: 'kiosk' | 'web';
    restaurantName: string;
    address: string | null | undefined;
    logoUrl: string | null | undefined;
    lang: LangCode;
    setLang: (c: LangCode) => void;
    onCta: () => void;
    onOrderLookup?: () => void;
    tableName?: string | null;
    t: Tx;
}) {
    const badge = mode === 'kiosk' ? t.idleBadgeKiosk : t.idleBadgeWeb;
    const ctaLabel = mode === 'kiosk' ? t.idleOpenMenu : t.idleWebNext;
    const qrHint = mode === 'kiosk' ? t.idleQrTable : t.idleQrOnline;

    return (
        <div className="qr-idle-root relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 pt-safe pb-safe">
            <div className="qr-idle-ring-wrap" aria-hidden>
                <div className="qr-idle-ring" />
                <div className="qr-idle-ring" />
                <div className="qr-idle-ring" />
            </div>
            <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
            <div className="relative z-[1] flex w-full max-w-md flex-col items-center">
                <span className="mb-2 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-400">
                    {badge}
                </span>
                <div className="qr-idle-float flex flex-col items-center">
                    <div className="qr-idle-logo overflow-hidden">
                        {logoUrl ? (
                            <img src={logoUrl} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                            <span className="leading-none">🍕</span>
                        )}
                        <div className="qr-idle-logo-ring" />
                    </div>
                </div>
                <h1 className="mb-1.5 text-center text-[clamp(22px,5vw,32px)] font-extrabold tracking-tight text-[#f0f6ff]">
                    {restaurantName}
                </h1>
                <p className="mb-1 text-center text-sm text-[#8ba3c0]">{t.idleTagline}</p>
                {address ? (
                    <p className="mb-7 flex items-center gap-1.5 text-center text-[13px] text-[#4e6a88]">
                        <FiMapPin className="shrink-0 opacity-80" size={13} />
                        <span>{address}</span>
                    </p>
                ) : (
                    <div className="mb-7" />
                )}
                {tableName ? <p className="mb-2 text-xs font-semibold text-emerald-400/90">{tableName}</p> : null}
                <p className="mb-3 text-center text-[13px] text-[#4e6a88]">{t.idleLangHint}</p>
                <div className="mb-7 flex flex-wrap justify-center gap-2.5">
                    {LANG_OPTIONS.map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => setLang(l.code)}
                            className={`flex min-w-[92px] flex-col items-center gap-1.5 rounded-2xl border-[1.5px] px-5 py-3.5 transition-all ${
                                lang === l.code
                                    ? 'border-emerald-500 bg-[#1a2f45] shadow-[0_0_0_1px_#10b981]'
                                    : 'border-[#1e3a55] bg-[#112035] hover:border-emerald-500'
                            }`}
                        >
                            <span className="text-[28px] leading-none">{l.flag}</span>
                            <span className={`text-xs font-medium ${lang === l.code ? 'text-emerald-400' : 'text-[#8ba3c0]'}`}>{l.label}</span>
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onCta}
                    className="rounded-2xl border-none bg-emerald-500 px-10 py-4 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-600 active:scale-[0.98]"
                >
                    {ctaLabel}
                </button>
                {onOrderLookup ? (
                    <button
                        type="button"
                        onClick={onOrderLookup}
                        className="mt-4 rounded-2xl border border-[#1e3a55] bg-[#112035] px-6 py-3 text-sm font-semibold text-[#8ba3c0] transition hover:border-emerald-500/45 hover:text-emerald-300"
                    >
                        {t.orderLookupBtn}
                    </button>
                ) : null}
                <div className="mt-7 flex flex-col items-center gap-2 opacity-45">
                    <div
                        className="grid gap-px rounded-lg border border-[#1e3a55] bg-[#112035] p-1.5"
                        style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}
                    >
                        {IDLE_QR_CELLS.map((on, i) => (
                            <div key={i} className={`h-1.5 w-1.5 rounded-[1px] ${on ? 'bg-[#8ba3c0]' : 'bg-transparent'}`} />
                        ))}
                    </div>
                    <span className="text-center text-[10px] text-[#4e6a88]">{qrHint}</span>
                </div>
            </div>
        </div>
    );
}

function isDesktop(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|tablet|iemobile|opera mini/i.test(ua);
    return !isMobile && window.innerWidth >= 1024;
}

/* ═══════════ APP ═══════════ */

export function App() {
    const qrWebHeaders = useLocalQrWebHeaders();
    const hdr = useCallback(
        (extra?: Record<string, string>): HeadersInit => ({ ...qrWebHeaders, ...extra }),
        [qrWebHeaders],
    );

    const [config, setConfig] = useState<RestaurantConfig | null>(null);
    const [lang, setLang] = useState<LangCode>('tr');
    const t = TRANSLATIONS[lang];
    const [view, setView] = useState<View>('loading');
    const [serviceType, setServiceType] = useState<ServiceType>('dine_in');

    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [catTab, setCatTab] = useState<number | 'all'>('all');
    const [searchQ, setSearchQ] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestAddress, setGuestAddress] = useState('');
    const [newAddressLabel, setNewAddressLabel] = useState('');
    const [selectedAddressId, setSelectedAddressId] = useState<number | 'new'>('new');
    const [linkedCustomer, setLinkedCustomer] = useState<LinkedCustomer | null>(null);
    const [lookupQuery, setLookupQuery] = useState('');
    const [identifyLoading, setIdentifyLoading] = useState(false);
    const [webServicePick, setWebServicePick] = useState<'delivery' | 'takeaway' | null>(null);
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
    const [liveStatus, setLiveStatus] = useState<string>('pending');
    const [memberReceipt, setMemberReceipt] = useState<QrMemberRegistration | null>(null);
    const [awaitingPosMembership, setAwaitingPosMembership] = useState(false);
    const [orderLookupOpen, setOrderLookupOpen] = useState(false);
    const [orderLookupInput, setOrderLookupInput] = useState('');
    const [orderLookupPhone, setOrderLookupPhone] = useState('');
    const [orderLookupTrack, setOrderLookupTrack] = useState<{ status?: string } | null>(null);
    const [orderLookupErr, setOrderLookupErr] = useState<string | null>(null);
    const [orderLookupLoading, setOrderLookupLoading] = useState(false);
    const [addressesModalOpen, setAddressesModalOpen] = useState(false);
    const [checkoutAuthMode, setCheckoutAuthMode] = useState<'login' | 'register'>('register');
    const [checkoutInfoVerified, setCheckoutInfoVerified] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
    const [checkoutPayment, setCheckoutPayment] = useState<CheckoutPaymentMethod>('cash');
    const [checkoutNewRegistration, setCheckoutNewRegistration] = useState(false);
    const [waVerified, setWaVerified] = useState(false);
    const [waVerifyModalOpen, setWaVerifyModalOpen] = useState(false);
    const [waVerificationCode, setWaVerificationCode] = useState('');
    const [waVerifyChecking, setWaVerifyChecking] = useState(false);
    const [waVerifyLoading, setWaVerifyLoading] = useState(false);
    const [waVerifiedPhone, setWaVerifiedPhone] = useState('');
    const [waVerificationLink, setWaVerificationLink] = useState('');
    const guestPhoneRef = useRef(guestPhone);
    useEffect(() => {
        guestPhoneRef.current = guestPhone;
    }, [guestPhone]);
    /** Bot honeypot — dolu gelirse gönderim yok */
    const [checkoutHoneypot, setCheckoutHoneypot] = useState('');
    const [checkoutHumanAnswer, setCheckoutHumanAnswer] = useState('');
    const [checkoutSumChallenge, setCheckoutSumChallenge] = useState<{ a: number; b: number } | null>(null);

    const [detailProduct, setDetailProduct] = useState<Product | null>(null);
    const [selVariantId, setSelVariantId] = useState<number | null>(null);
    const [selModIds, setSelModIds] = useState<Set<number>>(new Set());
    const [modalQty, setModalQty] = useState(1);

    const socketRef = useRef<Socket | null>(null);

    const tableQr = useMemo(() => {
        const path = window.location.pathname;
        const m = path.match(/^\/(?:table|t|qr)\/(.+)/);
        return m?.[1] ? decodeURIComponent(m[1]) : new URLSearchParams(window.location.search).get('table') || '';
    }, []);

    const [tableInfo, setTableInfo] = useState<{ tableId: number; tableName: string } | null>(null);

    const money = useCallback((n: number) => {
        const sym = config?.currency === 'EUR' ? '€' : config?.currency === 'USD' ? '$' : '₺';
        return `${sym}${n.toFixed(2)}`;
    }, [config]);

    const unitFor = (p: Product, variantId: number | undefined, modIds: number[]): number => {
        const v = p.variants?.find((x) => x.id === variantId);
        let u = Number(v?.price ?? p.basePrice);
        for (const id of modIds) {
            const m = p.modifiers?.find((x) => x.id === id);
            if (m) u += Number(m.price);
        }
        return Math.round(u * 100) / 100;
    };

    const lineKey = (pId: number, vId: number | undefined, mIds: number[]) =>
        `${pId}-${vId ?? 0}-${[...mIds].sort((a, b) => a - b).join(',')}`;

    const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
    const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

    /* ═══ INIT: Config ═══ */
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/v1/qr-web/config', { headers: hdr() });
                if (!res.ok) { setView('error'); return; }
                const data: RestaurantConfig = await res.json();
                setConfig(data);
                document.title = `${data.restaurantName} - Menü`;
                const meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', data.themeColor);
                if (data.defaultLang && TRANSLATIONS[data.defaultLang as LangCode]) {
                    setLang(data.defaultLang as LangCode);
                }
                const path = window.location.pathname;
                const m = path.match(/^\/(?:table|t)\/(.+)/);
                const hasTable = Boolean(m?.[1] || new URLSearchParams(window.location.search).get('table'));
                
                if (isDesktop()) {
                    setView('desktop_intro');
                } else {
                    setView(hasTable ? 'idle' : 'web_idle');
                }
            } catch {
                setView('error');
            }
        })();
    }, [hdr]);

    /* ═══ LOAD MENU ═══ */
    const loadMenu = useCallback(async () => {
        if (!config) return;
        try {
            const [cRes, pRes] = await Promise.all([
                fetch(`/api/v1/qr-web/categories?lang=${lang}`, { headers: hdr() }),
                fetch(`/api/v1/qr-web/products?lang=${lang}`, { headers: hdr() }),
            ]);
            const cData = await cRes.json();
            const pData = await pRes.json();
            setCategories(Array.isArray(cData) ? cData : []);
            setProducts(Array.isArray(pData) ? pData : []);
        } catch { /* silent */ }
    }, [config, lang, hdr]);

    useEffect(() => {
        if (config) loadMenu();
    }, [config, loadMenu]);

    useEffect(() => {
        if (view !== 'checkout') return;
        setCheckoutHoneypot('');
        setCheckoutHumanAnswer('');
        setCheckoutNewRegistration(false);
        setCheckoutSumChallenge({
            a: Math.floor(Math.random() * 7) + 2,
            b: Math.floor(Math.random() * 7) + 2,
        });
    }, [view]);

    /* ═══ TABLE RESOLVE ═══ */
    useEffect(() => {
        if (!config || !tableQr) return;
        (async () => {
            try {
                const res = await fetch(`/api/v1/qr-web/tables/${encodeURIComponent(tableQr)}`, {
                    headers: hdr(),
                });
                if (res.ok) {
                    const d = await res.json();
                    setTableInfo({ tableId: d.tableId, tableName: d.tableName });
                }
            } catch { /* silent */ }
        })();
    }, [config, tableQr, hdr]);

    /* ═══ SOCKET ═══ */
    useEffect(() => {
        if (!config) return;
        const socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        socket.on('connect', () => {
            socket.emit('join:tenant', config.tenantId);
            if (tableInfo?.tableId) socket.emit('join:table', { tenantId: config.tenantId, tableId: tableInfo.tableId });
        });
        socket.on('order:status_update', (data: { orderId: number; status: string }) => {
            if (Number(data.orderId) !== pendingOrderId) return;
            const st = data.status;
            if (st === 'cancelled') setLiveStatus('cancelled');
            else if (st === 'confirmed') setLiveStatus('confirmed');
            else if (st === 'completed') setLiveStatus('delivered');
            else if (['pending', 'preparing', 'ready', 'delivered'].includes(st)) setLiveStatus(st);
            if (st === 'ready') toast.success(t.ready, { duration: 5000 });
            if (st === 'cancelled') toast.error(t.orderRejected);
            if (st === 'confirmed') toast.success(t.orderApproved);
        });
        socket.on('order:status_changed', (data: { orderId: number; status: string }) => {
            if (Number(data.orderId) !== pendingOrderId) return;
            const st = data.status;
            if (st === 'cancelled') setLiveStatus('cancelled');
            else if (st === 'confirmed') setLiveStatus('confirmed');
            else if (st === 'completed') setLiveStatus('delivered');
            else if (['pending', 'preparing', 'ready', 'delivered'].includes(st)) setLiveStatus(st);
        });
        socket.on('customer:order_approved', (data: { orderId: number }) => {
            if (Number(data.orderId) === pendingOrderId) {
                setLiveStatus('confirmed');
                toast.success(t.orderApproved);
            }
        });
        socket.on('customer:order_rejected', (data: { orderId: number }) => {
            if (Number(data.orderId) === pendingOrderId) {
                setLiveStatus('cancelled');
                toast.error(t.orderRejected);
            }
        });
        socket.on('customer:whatsapp_verified', (data: { phone: string }) => {
            const cleanTarget = guestPhoneRef.current.replace(/\D/g, '');
            const cleanIncoming = data.phone.replace(/\D/g, '');
            if (cleanTarget && cleanIncoming && (cleanTarget.endsWith(cleanIncoming) || cleanIncoming.endsWith(cleanTarget))) {
                setWaVerified(true);
                setWaVerifiedPhone(guestPhoneRef.current);
                setWaVerifyModalOpen(false);
                toast.success(t.whatsappVerified || "Telefon numaranız doğrulandı!");
            }
        });
        socket.on('menu:catalog_stale', () => loadMenu());
        return () => { socket.disconnect(); };
    }, [config, tableInfo, pendingOrderId, t, loadMenu]);

    const refreshOrderTrack = useCallback(async () => {
        if (pendingOrderId == null || !config) return;
        try {
            const phoneQ = guestPhone.trim() ? `?phone=${encodeURIComponent(guestPhone.trim())}` : '';
            const res = await fetch(`/api/v1/qr-web/track/${pendingOrderId}${phoneQ}`, { headers: hdr() });
            if (!res.ok) return;
            const d = (await res.json()) as { status?: string };
            if (d.status) setLiveStatus(normalizeTrackStatus(d.status));
        } catch { /* silent */ }
    }, [pendingOrderId, config, hdr, guestPhone]);

    const openOrderLookup = useCallback(() => {
        setOrderLookupInput('');
        setOrderLookupPhone(guestPhone.trim());
        setOrderLookupTrack(null);
        setOrderLookupErr(null);
        setOrderLookupOpen(true);
    }, [guestPhone]);

    const runOrderLookupModal = useCallback(async () => {
        if (!config) {
            toast.error(t.error);
            return;
        }
        const raw = orderLookupInput.trim().replace(/^#/, '');
        const id = Number.parseInt(raw, 10);
        if (!Number.isFinite(id) || id < 1) {
            setOrderLookupErr(t.orderLookupInvalid);
            setOrderLookupTrack(null);
            return;
        }
        if (!orderLookupPhone.trim()) {
            setOrderLookupErr(t.orderLookupPhoneRequired);
            return;
        }
        setOrderLookupLoading(true);
        setOrderLookupErr(null);
        setOrderLookupTrack(null);
        try {
            const phoneQ = `?phone=${encodeURIComponent(orderLookupPhone.trim())}`;
            const res = await fetch(`/api/v1/qr-web/track/${id}${phoneQ}`, { headers: hdr() });
            const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
            if (!res.ok) {
                setOrderLookupErr(data.error || t.orderLookupNotFound);
                return;
            }
            if (data.status) {
                setOrderLookupTrack({ status: data.status });
            } else {
                setOrderLookupErr(t.orderLookupNotFound);
            }
        } catch {
            setOrderLookupErr(t.error);
        } finally {
            setOrderLookupLoading(false);
        }
    }, [config, orderLookupInput, orderLookupPhone, hdr, t]);

    useEffect(() => {
        if (view !== 'order_receipt' || pendingOrderId == null) return;
        void refreshOrderTrack();
        const id = window.setInterval(() => void refreshOrderTrack(), 12000);
        return () => window.clearInterval(id);
    }, [view, pendingOrderId, refreshOrderTrack]);

    /* ═══ ADD TO CART ═══ */
    const addToCart = (p: Product, variantId: number | undefined, modIds: number[], qty: number) => {
        const key = lineKey(p.id, variantId, [...modIds]);
        const unit = unitFor(p, variantId, [...modIds]);
        const vName = p.variants?.find((x) => x.id === variantId)?.name;
        const mLabel = [...modIds]
            .map((id) => p.modifiers?.find((m) => m.id === id)?.name)
            .filter(Boolean)
            .join(', ');

        setCart((prev) => {
            const idx = prev.findIndex((l) => l.key === key);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
                return next;
            }
            return [...prev, {
                key, productId: p.id, productName: p.displayName,
                variantId, variantName: vName, quantity: qty,
                modifierIds: [...modIds], modifierLabel: mLabel, unitPrice: unit,
            }];
        });
        toast.success(`${p.displayName} ${t.addToCart}`, { duration: 1500 });
    };

    useEffect(() => {
        if (guestPhone.trim() !== waVerifiedPhone) {
            setWaVerified(false);
        }
    }, [guestPhone, waVerifiedPhone]);

    const startPollingWhatsAppVerification = (phone: string) => {
        setWaVerifyChecking(true);
        const intervalId = window.setInterval(async () => {
            try {
                const res = await fetch(`/api/v1/qr-web/verify-check?phone=${encodeURIComponent(phone)}`, { headers: hdr() });
                if (res.ok) {
                    const data = await res.json();
                    if (data.verified) {
                        setWaVerified(true);
                        setWaVerifiedPhone(phone);
                        setWaVerifyModalOpen(false);
                        window.clearInterval(intervalId);
                        setWaVerifyChecking(false);
                        toast.success(t.whatsappVerified || "Telefon numaranız doğrulandı!");
                    }
                }
            } catch { /* ignore */ }
        }, 2500);

        window.setTimeout(() => {
            window.clearInterval(intervalId);
            setWaVerifyChecking(false);
        }, 180000);
    };

    const handleWhatsAppVerifyRequest = async () => {
        if (!guestPhone.trim()) {
            toast.error(t.fillAllCheckoutFields);
            return;
        }
        setWaVerifyLoading(true);
        try {
            const res = await fetch('/api/v1/qr-web/verify-request', {
                method: 'POST',
                headers: hdr({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    name: guestName || 'Misafir',
                    phone: guestPhone.trim()
                })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.alreadyVerified) {
                    setWaVerified(true);
                    setWaVerifiedPhone(guestPhone.trim());
                    toast.success(t.whatsappVerified || "Telefon numaranız doğrulandı!");
                } else {
                    setWaVerificationCode(data.code);
                    setWaVerifyModalOpen(true);
                    const msg = `NextPOS dogrulama kodum: ${data.code}`;
                    const waLink = `https://wa.me/${data.whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
                    setWaVerificationLink(waLink);
                    window.open(waLink, '_blank');
                    startPollingWhatsAppVerification(guestPhone.trim());
                }
            } else {
                toast.error(data.error || t.whatsappVerifyError || "Doğrulama kodu oluşturulurken bir hata oluştu.");
            }
        } catch {
            toast.error(t.whatsappVerifyError || "Doğrulama kodu oluşturulurken bir hata oluştu.");
        } finally {
            setWaVerifyLoading(false);
        }
    };

    /* ═══ SEND ORDER ═══ */
    const sendOrder = async () => {
        if (!config || cart.length === 0) return;
        if (checkoutHoneypot.trim()) {
            toast.error(t.botBlocked);
            return;
        }
        const phoneDigits = guestPhone.replace(/\D/g, '').length;
        const nameOk = guestName.trim().length >= 2;
        const phoneOk = phoneDigits >= 8;
        const addressOk = serviceType !== 'delivery' || guestAddress.trim().length >= 10;
        if (!nameOk || !phoneOk || !addressOk) {
            toast.error(t.fillAllCheckoutFields);
            return;
        }
        if (checkoutNewRegistration && !waVerified) {
            void handleWhatsAppVerifyRequest();
            return;
        }
        const sumExpected = checkoutSumChallenge ? checkoutSumChallenge.a + checkoutSumChallenge.b : null;
        if (sumExpected == null || Number(String(checkoutHumanAnswer).trim()) !== sumExpected) {
            toast.error(t.securityCheckFailed);
            return;
        }
        const noteParts: string[] = [];
        if (note.trim()) noteParts.push(note.trim());
        if (checkoutNewRegistration) noteParts.push(t.newRegistrationNote);
        const mergedNotes = noteParts.length ? noteParts.join(' | ') : undefined;
        setSending(true);
        try {
            if (serviceType === 'dine_in' && tableQr) {
                const res = await fetch('/api/v1/qr-web/orders', {
                    method: 'POST',
                    headers: hdr({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        qrCode: tableQr,
                        guestName: guestName || undefined,
                        guestPhone: guestPhone.trim(),
                        notes: mergedNotes,
                        customerId: linkedCustomer != null ? Number(linkedCustomer.id) : undefined,
                        paymentMethodArrival: checkoutPayment,
                        wantsRegistration: checkoutNewRegistration,
                        items: cart.map((l) => ({
                            productId: l.productId,
                            variantId: l.variantId || undefined,
                            quantity: l.quantity,
                            modifierIds: l.modifierIds,
                        })),
                    }),
                });
                const data = await res.json();
                if (res.ok) {
                    const oid = Number(data.order?.id);
                    const mr = data.memberRegistration as QrMemberRegistration | null | undefined;
                    const awaitingPos = Boolean((data as { qrMembershipAwaitingPos?: boolean }).qrMembershipAwaitingPos);
                    setPendingOrderId(Number.isFinite(oid) ? oid : null);
                    setLiveStatus('pending');
                    setCart([]);
                    setCartDrawerOpen(false);
                    setAwaitingPosMembership(awaitingPos);
                    if (mr?.completed && mr.orderId != null) {
                        setMemberReceipt(mr);
                        setView('order_receipt');
                    } else {
                        setMemberReceipt(null);
                        setView('order_status');
                    }
                    toast.success(t.orderSuccess);
                } else {
                    toast.error(data.error || t.error);
                }
            } else {
                const res = await fetch('/api/v1/qr-web/external-order', {
                    method: 'POST',
                    headers: hdr({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        customerName: guestName || 'Misafir',
                        customerPhone: guestPhone,
                        orderType: serviceType,
                        address: serviceType === 'delivery' ? guestAddress : undefined,
                        addressLabel: serviceType === 'delivery' && selectedAddressId === 'new' && newAddressLabel.trim() ? newAddressLabel.trim() : undefined,
                        paymentMethod: checkoutPayment,
                        customerId: linkedCustomer != null ? Number(linkedCustomer.id) : undefined,
                        wantsRegistration: checkoutNewRegistration,
                        notes: mergedNotes,
                        items: cart.map((l) => ({
                            productId: l.productId,
                            variantId: l.variantId || undefined,
                            quantity: l.quantity,
                            modifierIds: l.modifierIds,
                        })),
                    }),
                });
                const data = await res.json();
                if (res.ok) {
                    const mr = data.memberRegistration as QrMemberRegistration | null | undefined;
                    const awaitingPos = Boolean((data as { qrMembershipAwaitingPos?: boolean }).qrMembershipAwaitingPos);
                    setPendingOrderId(data.orderId);
                    setLiveStatus('pending');
                    setCart([]);
                    setCartDrawerOpen(false);
                    setAwaitingPosMembership(awaitingPos);
                    if (mr?.completed && mr.orderId != null) {
                        setMemberReceipt(mr);
                        setView('order_receipt');
                    } else {
                        setMemberReceipt(null);
                        setView('order_status');
                    }
                    toast.success(t.orderSuccess);
                } else {
                    toast.error(data.error || t.error);
                }
            }
        } catch {
            toast.error(t.error);
        } finally {
            setSending(false);
        }
    };

    /* ═══ SERVICE CALL ═══ */
    const sendServiceCall = async (callType: string) => {
        if (!tableQr) return;
        try {
            const res = await fetch('/api/v1/qr-web/service-call', {
                method: 'POST',
                headers: hdr({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ qrCode: tableQr, callType }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error || t.noWaiterAvailable || t.error);
                return;
            }
            toast.success(t.serviceSent, { duration: 3000 });
            setView('menu');
        } catch {
            toast.error(t.error);
        }
    };

    const resetLoginForm = useCallback(() => {
        setLookupQuery('');
    }, []);

    /** Tek alan: telefon, isim veya müşteri kodu — API ?query= */
    const runUnifiedLookup = useCallback(async () => {
        const q = lookupQuery.trim();
        if (!q) {
            toast.error(t.lookupEmpty);
            return;
        }
        setIdentifyLoading(true);
        try {
            const res = await fetch(`/api/v1/qr-web/identify?query=${encodeURIComponent(q)}`, { headers: hdr() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error || t.customerNotFound);
                return;
            }
            const row = data as LinkedCustomer;
            setLinkedCustomer(row);
            setGuestName(String(row.name || '').trim());
            setGuestPhone(String(row.phone || '').trim());
            if (row.addresses && row.addresses.length > 0) {
                const defaultAddr = row.addresses.find(a => a.is_default) || row.addresses[0];
                setSelectedAddressId(defaultAddr.id);
                setGuestAddress(defaultAddr.address);
            } else {
                setSelectedAddressId('new');
                setGuestAddress('');
            }
            toast.success(row.name ? `${t.loggedInAs}, ${row.name}` : t.loggedInAs);
            setView(tableQr ? 'order_type' : 'menu');
        } catch {
            toast.error(t.error);
        } finally {
            setIdentifyLoading(false);
        }
    }, [lookupQuery, hdr, t, tableQr]);

    /* ═══ FILTERED PRODUCTS ═══ */
    const filtered = useMemo(() => {
        let list = products;
        if (catTab !== 'all') list = list.filter((p) => p.categoryId === catTab);
        if (searchQ.trim()) {
            const q = searchQ.toLowerCase();
            list = list.filter((p) => p.displayName.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
        }
        return list;
    }, [products, catTab, searchQ]);

    const serviceBadge = () => {
        if (serviceType === 'delivery') return `📦 ${t.delivery}`;
        if (serviceType === 'takeaway') return `🏃 ${t.takeaway}`;
        return `🍽️ ${t.dineIn}`;
    };

    const orderLookupModalNode = (
        <OrderLookupModal
            open={orderLookupOpen}
            onClose={() => setOrderLookupOpen(false)}
            t={t}
            input={orderLookupInput}
            phoneInput={orderLookupPhone}
            onInputChange={(v) => {
                setOrderLookupInput(v);
                setOrderLookupTrack(null);
                setOrderLookupErr(null);
            }}
            onPhoneChange={(v) => {
                setOrderLookupPhone(v);
                setOrderLookupTrack(null);
                setOrderLookupErr(null);
            }}
            onSubmit={() => void runOrderLookupModal()}
            loading={orderLookupLoading}
            track={orderLookupTrack}
            error={orderLookupErr}
        />
    );

    const updateLinkedCustomerAddresses = (updatedAddresses: CustomerAddress[]) => {
        if (linkedCustomer) {
            setLinkedCustomer({
                ...linkedCustomer,
                addresses: updatedAddresses,
            });
            if (updatedAddresses.length > 0) {
                const def = updatedAddresses.find(a => a.is_default) || updatedAddresses[0];
                setSelectedAddressId(def.id);
                setGuestAddress(def.address);
            } else {
                setSelectedAddressId('new');
                setGuestAddress('');
            }
        }
    };

    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Tarayıcınız konum bilgisini desteklemiyor.');
            return;
        }
        setLocationLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=tr`);
                    const data = await res.json();
                    if (data && data.display_name) {
                        setGuestAddress(data.display_name);
                        toast.success('Konumunuz başarıyla algılandı!');
                    } else {
                        toast.error('Adres çözümlenemedi.');
                    }
                } catch {
                    toast.error('Konum servisinden adres alınamadı.');
                } finally {
                    setLocationLoading(false);
                }
            },
            () => {
                toast.error('Konum izni reddedildi veya konum alınamadı.');
                setLocationLoading(false);
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    const addressesModalNode = (
        <CustomerAddressesModal
            open={addressesModalOpen}
            onClose={() => setAddressesModalOpen(false)}
            t={t}
            linkedCustomer={linkedCustomer}
            onAddressesUpdated={updateLinkedCustomerAddresses}
            onSelectAddress={(addr) => {
                setSelectedAddressId(addr.id);
                setGuestAddress(addr.address);
            }}
            hdr={hdr}
        />
    );

    const waVerifyModalNode = waVerifyModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setWaVerifyModalOpen(false)} />
            <div className="relative w-full max-w-md rounded-3xl border border-emerald-500/20 bg-[#0b1329] p-6 text-center shadow-[0_0_50px_rgba(16,185,129,0.15)] animate-in zoom-in-95 duration-200">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                    <span className="text-2xl">💬</span>
                </div>
                <h3 className="text-lg font-black text-white">{t.whatsappVerifyTitle || "WhatsApp ile Doğrula"}</h3>
                <p className="mt-3 text-xs text-[#8ba3c0] leading-relaxed">
                    {t.whatsappVerifyHint || "Güvenliğiniz için lütfen telefon numaranızı WhatsApp üzerinden ücretsiz doğrulayın. Aşağıdaki butona tıkladığınızda otomatik olarak bir doğrulama mesajı oluşturulacaktır."}
                </p>

                <div className="mt-6 space-y-3">
                    <button
                        type="button"
                        onClick={() => window.open(waVerificationLink, '_blank')}
                        className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-bold text-white transition hover:bg-emerald-600 shadow-lg shadow-emerald-950/20 active:scale-[0.98]"
                    >
                        {t.whatsappVerifyButton || "WhatsApp ile Doğrula (Ücretsiz)"}
                    </button>
                    
                    <div className="flex items-center justify-center gap-2 text-[11px] text-[#4e6a88] pt-2">
                        <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <span>{t.whatsappVerifyAwaiting || "Doğrulama bekleniyor... Lütfen WhatsApp üzerinden mesajı gönderip bu sayfaya geri dönün."}</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setWaVerifyModalOpen(false)}
                        className="w-full rounded-xl border border-[#1e3a55] bg-[#0d1f35] py-3 text-xs font-bold text-[#8ba3c0] transition hover:bg-[#1a2f45] active:scale-[0.98]"
                    >
                        {t.close || "Kapat"}
                    </button>
                </div>
            </div>
        </div>
    );

    /* ═══════════ RENDER ═══════════ */

    if (view === 'loading') {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8F9FA]">
                <div className="flex flex-col items-center gap-4">
                    <div className="qr-skeleton h-2 w-28" />
                    <p className="text-xs font-semibold text-dark-400">{t.loading}</p>
                </div>
            </div>
        );
    }

    if (view === 'error') {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8F9FA] px-4">
                <div className="w-full max-w-sm space-y-4 rounded-2xl border-2 border-gray-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-dark-600">{t.error}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="w-full rounded-xl bg-primary-400 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary-500 active:scale-[0.98]"
                    >
                        {t.retry}
                    </button>
                </div>
            </div>
        );
    }

    if (view === 'desktop_intro' && config) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.href)}`;
        return (
            <div className="min-h-[100dvh] bg-[#0a1628] text-[#f0f6ff] flex flex-col justify-between overflow-hidden relative font-sans">
                {/* Background decorative glowing rings */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-emerald-500/5 pointer-events-none animate-pulse" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-teal-500/5 pointer-events-none" />

                {/* Header */}
                <header className="w-full max-w-7xl mx-auto px-8 py-6 flex items-center justify-between shrink-0 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/10">
                            {config.logo ? <img src={config.logo} alt="" className="w-8 h-8 rounded-full object-cover" /> : '🍕'}
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">PREMIUM MENU SYSTEM</span>
                            <h2 className="text-lg font-black text-white leading-tight mt-0.5">{config.restaurantName}</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {LANG_OPTIONS.map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => setLang(l.code)}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    lang === l.code
                                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                                        : 'border-[#1e3a55] bg-[#112035] text-[#8ba3c0] hover:border-emerald-500/50'
                                }`}
                            >
                                {l.flag} {l.label}
                            </button>
                        ))}
                    </div>
                </header>

                {/* Main Hero Content */}
                <main className="w-full max-w-7xl mx-auto px-8 flex-1 grid grid-cols-1 lg:grid-cols-12 items-center gap-12 relative z-10 py-12 lg:py-0">
                    {/* Left text column */}
                    <div className="lg:col-span-7 space-y-6 text-left">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-400">
                            ✨ {t.welcome}
                        </span>
                        <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                            Lezzet Dolu Menümüzü <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                                Şimdi Keşfedin
                            </span>
                        </h1>
                        <p className="text-base text-[#8ba3c0] max-w-xl leading-relaxed">
                            Masaüstünüzden zengin içerikli menümüzü, ürün detaylarını ve seçenekleri inceleyebilirsiniz. 
                            Hızlı ve temassız sipariş vermek için akıllı telefonunuzun kamerası ile sağdaki QR kodu okutabilirsiniz.
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-4 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    const path = window.location.pathname;
                                    const m = path.match(/^\/(?:table|t)\/(.+)/);
                                    const hasTable = Boolean(m?.[1] || new URLSearchParams(window.location.search).get('table'));
                                    setView(hasTable ? 'idle' : 'web_idle');
                                }}
                                className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
                            >
                                {t.idleOpenMenu || 'Menüyü İncele'}
                            </button>
                            <div className="text-xs text-[#4e6a88] flex items-center gap-2 font-medium">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Mobil cihazlarla tam uyumludur
                            </div>
                        </div>
                    </div>

                    {/* Right QR card column */}
                    <div className="lg:col-span-5 flex justify-center">
                        <div className="w-full max-w-[380px] bg-gradient-to-b from-[#112035] to-[#0d1726] border border-[#1e3a55] rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex flex-col items-center">
                            {/* Glow accent */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                            
                            <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest mb-6">
                                TELEFONUNDAN TARA
                            </span>
                            
                            <div className="bg-white p-4 rounded-3xl shadow-inner border-4 border-[#1e3a55] mb-6 relative group">
                                <img src={qrUrl} alt="Masa QR" className="w-[180px] h-[180px] select-none" />
                                <div className="absolute inset-0 bg-[#0a1628]/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl pointer-events-none" />
                            </div>

                            <h3 className="text-sm font-bold text-white text-center mb-1">Kameranı Aç ve Okut</h3>
                            <p className="text-[11px] text-[#8ba3c0] text-center max-w-[240px] leading-relaxed">
                                Telefonunun kamerası ile QR kodu okutarak doğrudan masandan siparişini verebilirsin.
                            </p>
                        </div>
                    </div>
                </main>

                {/* Footer */}
                <footer className="w-full max-w-7xl mx-auto px-8 py-6 text-center text-xs text-[#4e6a88] border-t border-[#1e3a55]/20 shrink-0 relative z-10">
                    <p>{t.poweredBy || 'Powered by NextPOS'}</p>
                </footer>
            </div>
        );
    }

    /* ═══ KIOSK IDLE — nextpos_qrmenu_v2(1) #s-kiosk-idle ═══ */
    if (view === 'idle' && config) {
        return (
            <>
                <QrIdleLayout
                    mode="kiosk"
                    restaurantName={config.restaurantName}
                    address={config.address}
                    logoUrl={config.logo}
                    lang={lang}
                    setLang={setLang}
                    onCta={() => {
                        resetLoginForm();
                        setView('login_local');
                    }}
                    onOrderLookup={openOrderLookup}
                    tableName={tableInfo?.tableName}
                    t={t}
                />
                {orderLookupModalNode}
                {addressesModalNode}
            </>
        );
    }

    /* ═══ WEB IDLE — nextpos_qrmenu_v2(1) #s-web-idle ═══ */
    if (view === 'web_idle' && config) {
        return (
            <>
                <QrIdleLayout
                    mode="web"
                    restaurantName={config.restaurantName}
                    address={config.address}
                    logoUrl={config.logo}
                    lang={lang}
                    setLang={setLang}
                    onCta={() => { setWebServicePick(null); setView('web_service'); }}
                    onOrderLookup={openOrderLookup}
                    t={t}
                />
                {orderLookupModalNode}
                {addressesModalNode}
            </>
        );
    }

    /* ═══ WEB SERVİS — nextpos_qrmenu_v2(1) #s-web-service ═══ */
    if (view === 'web_service' && config) {
        return (
            <>
            <div className="qr-web-svc-root flex min-h-[100dvh] flex-col overflow-y-auto px-[18px] pb-7 pt-[max(16px,env(safe-area-inset-top))]">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <div className="mb-1 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setView('web_idle')}
                        className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#112035] text-lg text-[#8ba3c0] transition hover:bg-[#1a2f45]"
                        aria-label={t.back}
                    >
                        ←
                    </button>
                    <span className="flex-1 pr-10 text-center text-sm font-semibold text-teal-400">{t.webSvcTitle}</span>
                </div>
                <div className="py-2 text-center">
                    <div className="text-[clamp(22px,5vw,28px)] font-extrabold tracking-tight text-[#f0f6ff]">{config.restaurantName}</div>
                    <p className="mt-1.5 px-2 text-[13px] leading-snug text-[#8ba3c0]">{t.webSvcSub}</p>
                </div>
                <div className="mt-2 flex flex-col gap-3" role="radiogroup" aria-label={t.webSvcTitle}>
                    <button
                        type="button"
                        onClick={() => setWebServicePick('delivery')}
                        className={`flex items-center gap-3.5 rounded-2xl border-[1.5px] p-4 text-left transition ${
                            webServicePick === 'delivery'
                                ? 'border-emerald-500 bg-emerald-500/15 shadow-[0_0_0_1px_#10b981]'
                                : 'border-[#1e3a55] bg-[#112035] hover:border-emerald-500 hover:bg-[#1a2f45]'
                        }`}
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1a2f45] text-2xl">🛵</div>
                        <div>
                            <div className="text-base font-bold text-[#f0f6ff]">{t.webDeliveryLine}</div>
                            <div className="mt-0.5 text-xs leading-snug text-[#4e6a88]">{t.webDeliverySub}</div>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setWebServicePick('takeaway')}
                        className={`flex items-center gap-3.5 rounded-2xl border-[1.5px] p-4 text-left transition ${
                            webServicePick === 'takeaway'
                                ? 'border-emerald-500 bg-emerald-500/15 shadow-[0_0_0_1px_#10b981]'
                                : 'border-[#1e3a55] bg-[#112035] hover:border-emerald-500 hover:bg-[#1a2f45]'
                        }`}
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1a2f45] text-2xl">🏪</div>
                        <div>
                            <div className="text-base font-bold text-[#f0f6ff]">{t.webTakeLine}</div>
                            <div className="mt-0.5 text-xs leading-snug text-[#4e6a88]">{t.webTakeSub}</div>
                        </div>
                    </button>
                </div>
                <button
                    type="button"
                    disabled={!webServicePick}
                    onClick={() => {
                        if (!webServicePick) {
                            toast.error(t.webPickFirst);
                            return;
                        }
                        setServiceType(webServicePick);
                        resetLoginForm();
                        setView('login_local');
                    }}
                    className="mt-2 w-full rounded-2xl border-none bg-emerald-500 py-4 text-[15px] font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {t.webGo}
                </button>
                <button
                    type="button"
                    onClick={openOrderLookup}
                    className="mt-3 w-full rounded-2xl border border-[#1e3a55] bg-[#112035] py-3 text-sm font-semibold text-[#8ba3c0] transition hover:border-emerald-500/45 hover:text-emerald-300"
                >
                    {t.orderLookupBtn}
                </button>
                <div className="mt-3 flex justify-center gap-2">
                    {LANG_OPTIONS.map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => setLang(l.code)}
                            className={`rounded-lg border px-3.5 py-1.5 text-xs ${
                                lang === l.code
                                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                                    : 'border-[#1e3a55] bg-[#1a2f45] text-[#4e6a88]'
                            }`}
                        >
                            {l.flag} {l.code.toUpperCase()}
                        </button>
                    ))}
                </div>
                <p className="mt-3.5 text-center text-[11px] leading-relaxed text-[#4e6a88] opacity-85">{t.webDemoFoot}</p>
            </div>
            {orderLookupModalNode}
            {addressesModalNode}
            </>
        );
    }

    /* ═══ LOGIN — tek alan: telefon / isim / müşteri no (API ?query=) ═══ */
    if (view === 'login_local') {
        const inputCls =
            'w-full rounded-xl border-[1.5px] border-[#1e3a55] bg-[#1a2f45] px-4 py-3.5 text-sm text-[#f0f6ff] placeholder:text-[#4e6a88] transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25';
        return (
            <>
            <div className="qr-web-svc-root flex min-h-[100dvh] flex-col overflow-y-auto px-[18px] pb-7 pt-[max(16px,env(safe-area-inset-top))]">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <div className="mb-1 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setView(tableQr ? 'idle' : 'web_service')}
                        className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#112035] text-lg text-[#8ba3c0] transition hover:bg-[#1a2f45]"
                        aria-label={t.back}
                    >
                        ←
                    </button>
                    <h2 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-teal-400">{t.loginTitle}</h2>
                    <button
                        type="button"
                        onClick={openOrderLookup}
                        className="flex h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#112035] px-2.5 text-[11px] font-semibold text-[#8ba3c0] transition hover:border-emerald-500/45 hover:text-emerald-300"
                    >
                        {t.orderLookupBtnShort}
                    </button>
                </div>
                <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto py-4">
                    <div className="mb-6 text-center">
                        <div className="mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-emerald-500/35 bg-emerald-500/15 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
                            <FiSearch className="text-3xl text-emerald-400" strokeWidth={2.2} />
                        </div>
                        <h3 className="text-[clamp(18px,4.5vw,22px)] font-extrabold leading-tight tracking-tight text-[#f0f6ff]">
                            <span className="text-emerald-400">{t.loginHeroAccent}</span>
                            <span className="mt-1.5 block text-base font-bold text-[#8ba3c0]">{t.loginHeroRest}</span>
                        </h3>
                        <p className="mt-2 px-1 text-[13px] leading-relaxed text-[#4e6a88]">{t.loginLookupHint}</p>
                    </div>

                    <div className="rounded-2xl border-[1.5px] border-[#1e3a55] bg-[#112035] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#4e6a88]">{t.lookupFieldLabel}</label>
                        <input
                            value={lookupQuery}
                            onChange={(e) => setLookupQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void runUnifiedLookup();
                            }}
                            type="text"
                            autoComplete="off"
                            placeholder={t.lookupPlaceholder}
                            className={inputCls}
                        />
                        <button
                            type="button"
                            disabled={identifyLoading}
                            onClick={() => void runUnifiedLookup()}
                            className="mt-4 w-full rounded-2xl border-none bg-emerald-500 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                        >
                            {identifyLoading ? '…' : t.lookupBtn}
                        </button>
                    </div>

                    <div className="my-6 flex items-center gap-3">
                        <div className="h-px flex-1 bg-[#1e3a55]" />
                        <span className="text-xs font-medium text-[#4e6a88]">{t.orWord}</span>
                        <div className="h-px flex-1 bg-[#1e3a55]" />
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setLinkedCustomer(null);
                            setGuestName('');
                            setGuestPhone('');
                            setGuestAddress('');
                            setSelectedAddressId('new');
                            setNewAddressLabel('');
                            resetLoginForm();
                            setView(tableQr ? 'order_type' : 'menu');
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[#1e3a55] bg-[#112035] py-3.5 text-sm font-semibold text-[#8ba3c0] transition hover:border-emerald-500 hover:bg-[#1a2f45] hover:text-emerald-300 active:scale-[0.98]"
                    >
                        👤 <span>{t.guestContinue}</span>
                    </button>
                </div>
            </div>
            {orderLookupModalNode}
            {addressesModalNode}
            </>
        );
    }

    /* ═══ SİPARİŞ TİPİ — masa/kiosk login sonrası (#s-ordertype) ═══ */
    if (view === 'order_type' && config) {
        return (
            <>
            <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-white to-gray-50 pt-safe">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <div className="flex items-center border-b border-gray-100 px-4 py-3">
                    <button
                        type="button"
                        onClick={() => setView(tableQr ? 'login_local' : 'web_idle')}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-dark-400 transition hover:bg-gray-200"
                        aria-label={t.back}
                    >
                        <FiChevronLeft />
                    </button>
                    <h2 className="min-w-0 flex-1 truncate text-center font-bold text-dark-900">{t.orderTypeTitle}</h2>
                    <button
                        type="button"
                        onClick={openOrderLookup}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg text-primary-600 transition hover:border-primary-300 hover:bg-primary-50"
                        aria-label={t.orderLookupBtn}
                    >
                        <FiShoppingBag />
                    </button>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-6">
                    <h3 className="mb-1 text-center text-xl font-bold text-dark-900">{t.orderTypeQ}</h3>
                    {linkedCustomer ? (
                        <div className="w-full max-w-sm rounded-2xl border-2 border-teal-200 bg-teal-50/90 px-4 py-3 text-left shadow-sm">
                            <p className="text-sm font-bold text-teal-900">
                                {t.memberBadge}: {linkedCustomer.name}
                            </p>
                            {linkedCustomer.phone ? <p className="mt-0.5 text-xs text-teal-800">{linkedCustomer.phone}</p> : null}
                            {linkedCustomer.reward_points != null ? (
                                <p className="mt-1 text-xs font-semibold text-teal-700">
                                    {linkedCustomer.reward_points} {t.rewardPoints}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="flex w-full max-w-sm flex-col gap-5">
                        {tableQr ? (
                            <button
                                type="button"
                                onClick={() => { setServiceType('dine_in'); setView('menu'); }}
                                className="w-full rounded-2xl border-2 border-gray-200 bg-white p-6 text-left transition-all hover:border-primary-400 hover:shadow-lg active:scale-[0.98]"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-3xl">🍽️</div>
                                    <div>
                                        <h4 className="text-lg font-bold text-dark-900">{t.dineIn}</h4>
                                        <p className="mt-1 text-sm text-dark-400">{tableInfo ? tableInfo.tableName : t.menu}</p>
                                    </div>
                                </div>
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => { setServiceType('delivery'); setView('menu'); }}
                            className="w-full rounded-2xl border-2 border-gray-200 bg-white p-6 text-left transition-all hover:border-primary-400 hover:shadow-lg active:scale-[0.98]"
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-3xl">📦</div>
                                <div>
                                    <h4 className="text-lg font-bold text-dark-900">{t.delivery}</h4>
                                    <p className="mt-1 text-sm text-dark-400">{t.deliveryMeta}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-600">🕐 30–45 dk</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setServiceType('takeaway'); setView('menu'); }}
                            className="w-full rounded-2xl border-2 border-gray-200 bg-white p-6 text-left transition-all hover:border-teal-400 hover:shadow-lg active:scale-[0.98]"
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-3xl">🏃</div>
                                <div>
                                    <h4 className="text-lg font-bold text-dark-900">{t.takeaway}</h4>
                                    <p className="mt-1 text-sm text-dark-400">{t.takeawayMeta}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-600">🕐 15–20 dk</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
            {orderLookupModalNode}
            {addressesModalNode}
            </>
        );
    }

    /* ═══ ÜYE MAKBUZU + SİPARİŞ TAKİBİ ═══ */
    if (view === 'order_receipt' && memberReceipt && config) {
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(memberReceipt.memberQrPayload)}`;
        return (
            <div className="flex min-h-[100dvh] flex-col bg-[#0a1628] px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <div className="mx-auto w-full max-w-md flex-1 space-y-4">
                    <div className="text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">
                            <FiCheck className="text-emerald-400" size={28} />
                        </div>
                        <h2 className="text-lg font-bold text-[#f0f6ff]">{t.receiptTitle}</h2>
                        <p className="mt-1 text-xs text-[#8ba3c0]">{t.receiptSubtitle}</p>
                    </div>

                    <div className="rounded-2xl border border-[#1e3a55] bg-[#112035] p-4">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">{t.memberYourData}</p>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between gap-2">
                                <dt className="text-[#4e6a88]">{t.yourName}</dt>
                                <dd className="max-w-[60%] text-right font-semibold text-[#f0f6ff]">{memberReceipt.name}</dd>
                            </div>
                            {memberReceipt.phone ? (
                                <div className="flex justify-between gap-2">
                                    <dt className="text-[#4e6a88]">{t.phone}</dt>
                                    <dd className="font-mono text-[#f0f6ff]">{memberReceipt.phone}</dd>
                                </div>
                            ) : null}
                            {memberReceipt.address ? (
                                <div className="flex justify-between gap-2">
                                    <dt className="shrink-0 text-[#4e6a88]">{t.address}</dt>
                                    <dd className="text-right text-xs leading-snug text-[#8ba3c0]">{memberReceipt.address}</dd>
                                </div>
                            ) : null}
                            <div className="flex justify-between gap-2 border-t border-[#1e3a55] pt-2">
                                <dt className="text-[#4e6a88]">{t.customerCodeShort}</dt>
                                <dd className="font-mono font-bold text-emerald-300">{memberReceipt.customer_code}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="flex flex-col items-center rounded-2xl border border-[#1e3a55] bg-[#112035] p-4">
                        <img src={qrImg} alt="" width={180} height={180} className="rounded-xl bg-white p-2" />
                        <p className="mt-2 text-center text-[11px] text-[#8ba3c0]">{t.qrScanHint}</p>
                    </div>

                    <div className="rounded-2xl border border-[#1e3a55] bg-[#112035] p-4 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4e6a88]">{t.trackOrder}</p>
                        <p className="mt-2 font-mono text-xl font-bold text-primary-300">#{memberReceipt.orderId}</p>
                        <p className="mt-3 text-sm font-semibold text-[#f0f6ff]">{orderStatusLabel(liveStatus, t)}</p>
                        <button
                            type="button"
                            onClick={() => void refreshOrderTrack()}
                            className="mt-3 rounded-xl border border-[#1e3a55] bg-[#1a2f45] px-4 py-2 text-xs font-semibold text-[#8ba3c0] transition hover:border-emerald-500/40 hover:text-emerald-300"
                        >
                            {t.refreshStatus}
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setLiveStatus('pending');
                            setPendingOrderId(null);
                            setMemberReceipt(null);
                            setAwaitingPosMembership(false);
                            setView(tableQr ? 'order_type' : 'login_local');
                        }}
                        className="w-full rounded-2xl bg-primary-400 py-4 text-sm font-bold text-white transition-all hover:bg-primary-500 active:scale-[0.98]"
                    >
                        {t.back}
                    </button>
                </div>
            </div>
        );
    }

    /* ═══ ORDER STATUS ═══ */
    if (view === 'order_status') {
        return (
            <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F8F9FA] px-4">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <div className="w-full max-w-sm rounded-2xl border-2 border-gray-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-3xl">
                        <FiCheck className="text-teal-500" size={32} />
                    </div>
                    <p className="text-lg font-bold text-dark-900">{orderStatusLabel(liveStatus, t)}</p>
                    <p className="mt-2 text-sm text-dark-400">{t.orderSent}</p>
                    {pendingOrderId != null ? <p className="mt-3 font-mono text-sm font-semibold text-primary-500">#{pendingOrderId}</p> : null}
                    {awaitingPosMembership ? (
                        <p className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-left text-xs font-semibold leading-snug text-cyan-900">
                            {t.membershipAwaitingPosHint}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => {
                            setLiveStatus('pending');
                            setPendingOrderId(null);
                            setMemberReceipt(null);
                            setAwaitingPosMembership(false);
                            setView(tableQr ? 'order_type' : 'login_local');
                        }}
                        className="mt-8 w-full rounded-2xl bg-primary-400 py-4 text-sm font-bold text-white transition-all hover:bg-primary-500 active:scale-[0.98] qr-cart-glow"
                    >
                        {t.back}
                    </button>
                </div>
            </div>
        );
    }

    /* ═══ SERVICE CALLS ═══ */
    if (view === 'service') {
        const calls = [
            { type: 'call_waiter', icon: <FiBell className="text-base" />, label: t.waiter },
            { type: 'request_bill_cash', icon: <FiCreditCard className="text-base" />, label: t.billCash },
            { type: 'request_bill_card', icon: <FiCreditCard className="text-base" />, label: t.billCard },
            { type: 'water', icon: <FiDroplet className="text-base" />, label: t.water },
            { type: 'clear_table', icon: <FiTrash2 className="text-base" />, label: t.clean },
        ];
        return (
            <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-white to-gray-50">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <div className="flex items-center border-b border-gray-100 px-4 py-3 pt-safe">
                    <button
                        type="button"
                        onClick={() => setView('menu')}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-dark-400 transition hover:bg-gray-200"
                        aria-label={t.back}
                    >
                        <FiChevronLeft />
                    </button>
                    <h2 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-dark-900">{config?.restaurantName}</h2>
                    <div className="w-10 shrink-0" />
                </div>
                <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {calls.map((c) => (
                            <button
                                key={c.type}
                                type="button"
                                onClick={() => sendServiceCall(c.type)}
                                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-5 text-center text-xs font-semibold text-dark-700 transition-all hover:border-primary-300 hover:shadow-md active:scale-[0.98] sm:text-sm"
                            >
                                <span className="text-dark-500">{c.icon}</span>
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const cartInputCls =
        'w-full rounded-xl border-[1.5px] border-[#1e3a55] bg-[#1a2f45] px-4 py-3 text-sm text-[#f0f6ff] placeholder:text-[#4e6a88] transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

    const payMethodBtn = (active: boolean) =>
        `flex flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] px-3 py-3 text-center text-xs font-bold transition sm:py-4 ${
            active
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                : 'border-[#1e3a55] bg-[#1a2f45] text-[#8ba3c0] hover:border-emerald-500/40'
        }`;

    /* ═══ CHECKOUT / ÖDEME ═══ */
    if (view === 'checkout' && config) {
        const payOptions: { id: CheckoutPaymentMethod; label: string; icon?: string }[] = [
            { id: 'cash', label: t.payCash, icon: '💵' },
            { id: 'card', label: t.payCard, icon: '💳' },
            { id: 'paypal', label: t.payPaypal },
            { id: 'google_pay', label: t.payGooglePay, icon: 'G' },
        ];
        const onlineSelected = checkoutPayment === 'card' || checkoutPayment === 'paypal' || checkoutPayment === 'google_pay';
        const phoneDigits = guestPhone.replace(/\D/g, '').length;
        const nameOk = guestName.trim().length >= 2;
        const phoneOk = phoneDigits >= 8;
        const addressOk = serviceType !== 'delivery' || guestAddress.trim().length >= 10;
        const sumExpected = checkoutSumChallenge ? checkoutSumChallenge.a + checkoutSumChallenge.b : null;
        const sumOk =
            checkoutSumChallenge != null && Number(String(checkoutHumanAnswer).trim()) === sumExpected;
        const honeypotOk = checkoutHoneypot.trim().length === 0;
        const canSubmit = Boolean(nameOk && phoneOk && addressOk && sumOk && honeypotOk && checkoutSumChallenge && checkoutInfoVerified);
        return (
            <>
            <div className="qr-web-svc-root flex min-h-[100dvh] flex-col">
                <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />
                <header className="flex shrink-0 items-center gap-2 border-b border-[#1e3a55] bg-[#112035] px-4 py-3 pt-safe">
                    <button
                        type="button"
                        onClick={() => setView('menu')}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#0d1f35] text-sm text-[#8ba3c0] transition hover:bg-[#1a2f45]"
                        aria-label={t.back}
                    >
                        ←
                    </button>
                    <h2 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-teal-400">{t.checkoutTitle}</h2>
                    <button
                        type="button"
                        onClick={openOrderLookup}
                        className="flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#0d1f35] px-2.5 text-[11px] font-semibold text-[#8ba3c0] transition hover:border-emerald-500/45 hover:text-emerald-300"
                    >
                        {t.orderLookupBtnShort}
                    </button>
                </header>
                <div className="relative mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 py-4 pb-safe">
                    {cart.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-[#8ba3c0]">{t.emptyCart}</p>
                            <button
                                type="button"
                                onClick={() => setView('menu')}
                                className="mt-4 rounded-xl bg-primary-400 px-6 py-3 text-sm font-bold text-white"
                            >
                                {t.menu}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 rounded-2xl border border-[#1e3a55] bg-[#112035] p-4">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#4e6a88]">{t.cart}</p>
                                <ul className="max-h-40 space-y-2 overflow-y-auto">
                                    {cart.map((line) => (
                                        <li key={line.key} className="flex justify-between gap-2 text-sm">
                                            <span className="min-w-0 truncate text-[#f0f6ff]">
                                                {line.quantity}× {line.productName}
                                            </span>
                                            <span className="shrink-0 font-semibold tabular-nums text-primary-400">{money(line.unitPrice * line.quantity)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-3 flex justify-between border-t border-[#1e3a55] pt-3 text-sm">
                                    <span className="text-[#8ba3c0]">{t.total}</span>
                                    <span className="font-bold tabular-nums text-primary-400">{money(cartTotal)}</span>
                                </div>
                            </div>

                            {linkedCustomer ? (
                                <div className="mb-4 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400/90">{t.memberYourData}</p>
                                    <p className="text-sm font-bold text-[#f0f6ff]">{linkedCustomer.name}</p>
                                    {linkedCustomer.phone ? <p className="mt-1 text-sm text-[#8ba3c0]">{linkedCustomer.phone}</p> : null}
                                    {linkedCustomer.customer_code ? (
                                        <p className="mt-1 text-xs text-[#4e6a88]">
                                            {t.customerCodeShort}: {linkedCustomer.customer_code}
                                        </p>
                                    ) : null}
                                    {linkedCustomer.reward_points != null ? (
                                        <p className="mt-2 text-sm font-semibold text-emerald-300">
                                            {linkedCustomer.reward_points} {t.rewardPoints}
                                        </p>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="mb-4 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCheckoutAuthMode('register');
                                            setCheckoutNewRegistration(true);
                                        }}
                                        className={`rounded-xl border-[1.5px] py-3 text-xs font-bold transition-all ${
                                            checkoutAuthMode === 'register'
                                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                                                : 'border-[#1e3a55] bg-[#112035] text-[#8ba3c0] hover:border-emerald-500/40'
                                        }`}
                                    >
                                        ➕ Yeni Kullanıcı Oluştur
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCheckoutAuthMode('login');
                                        }}
                                        className={`rounded-xl border-[1.5px] py-3 text-xs font-bold transition-all ${
                                            checkoutAuthMode === 'login'
                                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                                                : 'border-[#1e3a55] bg-[#112035] text-[#8ba3c0] hover:border-emerald-500/40'
                                        }`}
                                    >
                                        🔑 Giriş Yap
                                    </button>
                                </div>
                            )}

                            {/* Eksik Bilgi Uyarıları */}
                            {linkedCustomer && (
                                <div className="space-y-2 mb-4 animate-in fade-in slide-in-from-bottom-2">
                                    {(!guestName.trim() || guestName.trim().length < 2) && (
                                        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300 flex items-center gap-2">
                                            <span>⚠️</span>
                                            <span>Ad soyad bilginiz eksik, lütfen aşağıdan tanımlayın.</span>
                                        </div>
                                    )}
                                    {(!guestPhone.trim() || guestPhone.replace(/\D/g, '').length < 8) && (
                                        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300 flex items-center gap-2">
                                            <span>⚠️</span>
                                            <span>Telefon numaranız eksik, lütfen aşağıdan tanımlayın.</span>
                                        </div>
                                    )}
                                    {serviceType === 'delivery' && !guestAddress.trim() && (
                                        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300 flex items-center gap-2">
                                            <span>⚠️</span>
                                            <span>Kayıtlı teslimat adresiniz bulunmuyor, lütfen teslimat adresi tanımlayın.</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!linkedCustomer && checkoutAuthMode === 'login' && (
                                <div className="mb-4 rounded-2xl border border-[#1e3a55] bg-[#112035] p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="text-center">
                                        <h3 className="text-sm font-bold text-[#f0f6ff]">🔑 Kayıtlı Müşteri Girişi</h3>
                                        <p className="mt-1 text-[11px] text-[#8ba3c0]">Telefon, isim veya müşteri kodunuzu girerek hızlıca sorgulayın.</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            value={lookupQuery}
                                            onChange={(e) => setLookupQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void runUnifiedLookup();
                                            }}
                                            type="text"
                                            autoComplete="off"
                                            placeholder={t.lookupPlaceholder}
                                            className={`${cartInputCls}`}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        disabled={identifyLoading}
                                        onClick={() => void runUnifiedLookup()}
                                        className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                                    >
                                        {identifyLoading ? '…' : t.lookupBtn}
                                    </button>
                                </div>
                            )}

                            {(linkedCustomer || checkoutAuthMode === 'register') && (
                                <div className="mb-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                    {!linkedCustomer ? (
                                        <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 text-xs text-emerald-400 font-medium">
                                            ✨ Siparişinizle birlikte yeni bir müşteri hesabı oluşturulacaktır.
                                        </div>
                                    ) : null}

                                    {!linkedCustomer ? (
                                        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t.guestName} className={cartInputCls} />
                                    ) : (
                                        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t.yourName} className={cartInputCls} />
                                    )}
                                    
                                    <div className="relative">
                                        <FiPhone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#4e6a88]" size={16} />
                                        <input
                                            value={guestPhone}
                                            onChange={(e) => setGuestPhone(e.target.value)}
                                            placeholder={t.phone}
                                            inputMode="tel"
                                            autoComplete="tel"
                                            className={`${cartInputCls} pl-9`}
                                        />
                                    </div>

                                    {checkoutNewRegistration && guestPhone.replace(/\D/g, '').length >= 8 && (
                                        <div className="mt-1 animate-in fade-in duration-200">
                                            {waVerified ? (
                                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-400">
                                                    <span className="text-sm">✅</span>
                                                    <span>{t.whatsappVerified || "Telefon numaranız doğrulandı!"}</span>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={waVerifyLoading}
                                                    onClick={() => void handleWhatsAppVerifyRequest()}
                                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md shadow-emerald-950/20"
                                                >
                                                    {waVerifyLoading ? (
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <span>💬</span>
                                                    )}
                                                    <span>{t.whatsappVerifyButton || "WhatsApp ile Doğrula (Ücretsiz)"}</span>
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {serviceType === 'delivery' ? (
                                        <div className="space-y-2">
                                            {linkedCustomer && linkedCustomer.addresses && linkedCustomer.addresses.length > 0 && (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between px-1">
                                                        <label className="block text-[10px] font-bold text-[#8ba3c0] uppercase tracking-wider">Kayıtlı Adreslerim</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAddressesModalOpen(true)}
                                                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition uppercase tracking-wider"
                                                        >
                                                            ⚙️ Yönet
                                                        </button>
                                                    </div>
                                                    <select
                                                        className={`${cartInputCls} appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238BA3C0%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1.25rem] bg-[right_1rem_center] bg-no-repeat`}
                                                        value={selectedAddressId}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === 'new') {
                                                                setSelectedAddressId('new');
                                                                setGuestAddress('');
                                                                setNewAddressLabel('');
                                                            } else {
                                                                const idNum = Number(val);
                                                                setSelectedAddressId(idNum);
                                                                const matched = linkedCustomer.addresses?.find(a => a.id === idNum);
                                                                if (matched) {
                                                                    setGuestAddress(matched.address);
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        {linkedCustomer.addresses.map(a => (
                                                            <option key={a.id} value={a.id}>
                                                                {a.label ? `🏠 ${a.label}` : '🏠 Adres'} : {a.address.slice(0, 35)}...
                                                            </option>
                                                        ))}
                                                        <option value="new">➕ Yeni Adres Ekle...</option>
                                                    </select>
                                                </div>
                                            )}

                                            {selectedAddressId === 'new' ? (
                                                <div className="space-y-2">
                                                    {linkedCustomer && (
                                                        <input
                                                            type="text"
                                                            placeholder="Adres Başlığı (Örn: Evim, İş Adresim)"
                                                            value={newAddressLabel}
                                                            onChange={(e) => setNewAddressLabel(e.target.value)}
                                                            className={cartInputCls}
                                                        />
                                                    )}
                                                    <div className="relative">
                                                        <FiMapPin className="pointer-events-none absolute left-3 top-3 text-[#4e6a88]" size={16} />
                                                        <textarea
                                                            value={guestAddress}
                                                            onChange={(e) => setGuestAddress(e.target.value)}
                                                            placeholder={t.address}
                                                            rows={2}
                                                            autoComplete="street-address"
                                                            className={`${cartInputCls} resize-none pl-9 pr-24`}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={handleDetectLocation}
                                                            disabled={locationLoading}
                                                            className="absolute bottom-2 right-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25 transition disabled:opacity-50 flex items-center gap-1 active:scale-95"
                                                        >
                                                            {locationLoading ? 'Bulunuyor...' : '📍 Konum Bul'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-[#f0f6ff] leading-relaxed flex items-start gap-2">
                                                    <span className="text-base leading-none">📍</span>
                                                    <div>
                                                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider mr-2 mb-1 inline-block">
                                                            {linkedCustomer?.addresses?.find(a => a.id === selectedAddressId)?.label || 'Seçili Adres'}
                                                        </span>
                                                        <p className="text-xs text-[#8ba3c0] italic mt-1 leading-snug">
                                                            {guestAddress}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.note} rows={2} className={`${cartInputCls} resize-none`} />
                                </div>
                            )}

                            {/* Bilgilerimi Doğrula Adımı */}
                            <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">📋</span>
                                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Bilgi Doğrulama</h4>
                                </div>
                                <div className="text-xs space-y-2 text-[#8ba3c0] bg-[#0d1f35]/60 p-3 rounded-xl border border-[#1e3a55]/40 leading-relaxed">
                                    <div>
                                        <span className="font-semibold text-[#f0f6ff]">Ad Soyad:</span> {guestName.trim() || <span className="text-red-400 font-bold">Girilmedi ⚠️</span>}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-[#f0f6ff]">Telefon:</span> {guestPhone.trim() || <span className="text-red-400 font-bold">Girilmedi ⚠️</span>}
                                    </div>
                                    {serviceType === 'delivery' && (
                                        <div>
                                            <span className="font-semibold text-[#f0f6ff]">Teslimat Adresi:</span> {guestAddress.trim() || <span className="text-red-400 font-bold">Girilmedi ⚠️</span>}
                                        </div>
                                    )}
                                </div>
                                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-3 py-3 transition hover:bg-amber-500/[0.12]">
                                    <input
                                        type="checkbox"
                                        checked={checkoutInfoVerified}
                                        onChange={(e) => setCheckoutInfoVerified(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-500/40 accent-amber-500 focus:ring-0 focus:ring-offset-0"
                                    />
                                    <span className="text-xs font-bold text-[#f0f6ff]">Yukarıdaki bilgilerimin doğru olduğunu onaylıyorum.</span>
                                </label>
                            </div>

                            {/* Honeypot: botlar doldurur; görünmez tutulur */}
                            <div className="pointer-events-none absolute -left-[9999px] top-0 opacity-0" aria-hidden="true">
                                <label htmlFor="qr-hp-url">Website</label>
                                <input
                                    id="qr-hp-url"
                                    type="text"
                                    name="website"
                                    tabIndex={-1}
                                    value={checkoutHoneypot}
                                    onChange={(e) => setCheckoutHoneypot(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>

                            {checkoutSumChallenge ? (
                                <div className="mb-4 rounded-2xl border border-[#1e3a55] bg-[#112035] p-4">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4e6a88]">{t.securityCheckLabel}</p>
                                    <label className="mb-2 block text-sm text-[#8ba3c0]">
                                        {t.securitySumPrompt
                                            .replace('{a}', String(checkoutSumChallenge.a))
                                            .replace('{b}', String(checkoutSumChallenge.b))}
                                    </label>
                                    <input
                                        value={checkoutHumanAnswer}
                                        onChange={(e) => setCheckoutHumanAnswer(e.target.value)}
                                        inputMode="numeric"
                                        autoComplete="off"
                                        className={cartInputCls}
                                        placeholder="?"
                                    />
                                </div>
                            ) : null}

                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4e6a88]">{t.paymentChoose}</p>
                            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {payOptions.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setCheckoutPayment(p.id)}
                                        className={payMethodBtn(checkoutPayment === p.id)}
                                    >
                                        {p.icon ? <span className="text-lg leading-none">{p.icon}</span> : null}
                                        <span className="leading-tight">{p.label}</span>
                                    </button>
                                ))}
                            </div>
                            {onlineSelected ? (
                                <p className="mb-4 rounded-xl border border-[#1e3a55] bg-[#1a2f45] px-3 py-2 text-[11px] leading-relaxed text-[#8ba3c0]">{t.paymentOnlineNote}</p>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => void sendOrder()}
                                disabled={sending || !canSubmit}
                                className="flex w-full items-center justify-between rounded-2xl bg-primary-400 px-5 py-4 text-sm font-bold text-white transition-all hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] qr-cart-glow"
                            >
                                <span>{sending ? '…' : t.placeOrder}</span>
                                <span className="tabular-nums">{money(cartTotal)}</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
            {orderLookupModalNode}
            {addressesModalNode}
            </>
        );
    }

    /* ═══ MENU VIEW — nextpos_qrmenu_v2 #s-menu + karanlık tema ═══ */
    const openProduct = (p: Product) => {
        setDetailProduct(p);
        setSelVariantId(p.variants?.find((v) => v.isDefault)?.id ?? p.variants?.[0]?.id ?? null);
        setSelModIds(new Set());
        setModalQty(1);
    };

    const catChipCls = (active: boolean) =>
        `flex shrink-0 items-center gap-1 rounded-full border-[1.5px] px-3 py-1.5 text-xs font-semibold transition ${
            active
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                : 'border-[#1e3a55] bg-[#0d1f35] text-[#8ba3c0] hover:border-emerald-500/40'
        }`;

    return (
        <>
        <div className="qr-web-svc-root flex min-h-[100dvh] flex-col">
            <Toaster position="top-center" toastOptions={{ duration: 2200, style: { fontSize: '13px' } }} />

            <header className="sticky top-0 z-30 shrink-0 border-b border-[#1e3a55] bg-[#112035] pt-safe">
                <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
                    <button
                        type="button"
                        onClick={() => setView(tableQr ? 'order_type' : 'login_local')}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#0d1f35] text-sm text-[#8ba3c0] transition hover:bg-[#1a2f45]"
                        aria-label={t.back}
                    >
                        ←
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-sm font-bold text-[#f0f6ff]">{config?.restaurantName}</h1>
                        <p className="truncate text-xs text-[#4e6a88]" id="menu-order-type-badge">
                            {tableInfo ? `${serviceBadge()} · ${tableInfo.tableName}` : serviceBadge()}
                            {linkedCustomer ? ` · ${t.memberBadge}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openOrderLookup}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#1e3a55] bg-[#0d1f35] text-emerald-400/90 transition hover:bg-[#1a2f45]"
                        aria-label={t.orderLookupBtn}
                    >
                        <FiShoppingBag className="text-lg" />
                    </button>
                    <div className="flex shrink-0 gap-1">
                        {LANG_OPTIONS.map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => setLang(l.code)}
                                className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                                    lang === l.code
                                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                                        : 'border-[#1e3a55] bg-[#1a2f45] text-[#4e6a88]'
                                }`}
                            >
                                {l.code.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    {tableQr ? (
                        <button
                            type="button"
                            onClick={() => setView('service')}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 transition hover:bg-emerald-500/20"
                            aria-label={t.waiter}
                        >
                            <FiBell className="text-lg" />
                        </button>
                    ) : null}
                </div>
                <div className="mx-auto max-w-6xl px-4 pb-2">
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#4e6a88]">🔍</span>
                        <input
                            value={searchQ}
                            onChange={(e) => setSearchQ(e.target.value)}
                            placeholder={t.search}
                            className="w-full rounded-xl border-[1.5px] border-[#1e3a55] bg-[#1a2f45] py-2.5 pl-9 pr-4 text-sm text-[#f0f6ff] placeholder:text-[#4e6a88] transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>
                </div>
                <div className="mx-auto max-w-6xl px-4 pb-2">
                    {linkedCustomer ? (
                        <div className="relative rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-3 py-2.5">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">{t.memberBadge}</p>
                                    <p className="mt-1 truncate text-sm font-bold text-[#f0f6ff]">{linkedCustomer.name}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAddressesModalOpen(true)}
                                        className="rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition"
                                    >
                                        📍 Adreslerim
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLinkedCustomer(null);
                                            setGuestName('');
                                            setGuestPhone('');
                                            setGuestAddress('');
                                            setSelectedAddressId('new');
                                            setNewAddressLabel('');
                                            resetLoginForm();
                                            toast.success('Çıkış yapıldı');
                                        }}
                                        className="rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 px-2.5 py-1 text-xs font-semibold text-red-400 transition"
                                    >
                                        🚪 Çıkış
                                    </button>
                                </div>
                            </div>
                            {linkedCustomer.phone ? (
                                <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-[#8ba3c0]">
                                    <FiPhone size={12} className="shrink-0 opacity-70" />
                                    {linkedCustomer.phone}
                                </p>
                            ) : null}
                            {guestAddress.trim() ? (
                                <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-[#8ba3c0]">
                                    <FiMapPin size={12} className="mt-0.5 shrink-0 opacity-70" />
                                    <span className="line-clamp-2">{guestAddress.trim()}</span>
                                </p>
                            ) : null}
                        </div>
                    ) : (
                        <p className="rounded-xl border border-[#1e3a55] bg-[#0d1f35] px-3 py-2.5 text-center text-sm font-medium text-[#8ba3c0]">{t.menuGuestWelcome}</p>
                    )}
                </div>
                <div className="mx-auto w-full max-w-6xl px-4 pb-2 md:hidden">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#4e6a88]" htmlFor="qr-mobile-cat">
                        {t.menuPickCategory}
                    </label>
                    <div className="relative">
                        <select
                            id="qr-mobile-cat"
                            value={catTab === 'all' ? 'all' : String(catTab)}
                            onChange={(e) => {
                                const v = e.target.value;
                                setCatTab(v === 'all' ? 'all' : Number(v));
                            }}
                            className="w-full cursor-pointer appearance-none rounded-xl border-[1.5px] border-[#1e3a55] bg-[#1a2f45] py-3 pl-3 pr-10 text-sm font-semibold text-[#f0f6ff] transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            aria-label={t.categories}
                        >
                            <option value="all">{t.allItems}</option>
                            {categories.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                    {c.displayName}
                                </option>
                            ))}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ba3c0]" aria-hidden />
                    </div>
                </div>
                <nav
                    className="no-scrollbar mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:flex"
                    aria-label={t.categories}
                >
                    <button type="button" onClick={() => setCatTab('all')} className={catChipCls(catTab === 'all')}>
                        {t.allItems}
                    </button>
                    {categories.map((c) => (
                        <button key={c.id} type="button" onClick={() => setCatTab(c.id)} className={catChipCls(catTab === c.id)}>
                            <CategoryIcon iconName={c.icon} className="text-[10px] opacity-80" />
                            {c.displayName}
                        </button>
                    ))}
                </nav>
            </header>

            <main className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-4 pb-28 pt-3">
                {filtered.length === 0 ? (
                    <p className="py-12 text-center text-sm font-medium text-[#4e6a88]">{t.noProducts}</p>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                        {filtered.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => openProduct(p)}
                                className="group flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-[#1e3a55] bg-[#112035] text-left shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all hover:border-emerald-500/45 hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
                            >
                                <div className="aspect-[4/3] w-full overflow-hidden bg-[#1a2f45]">
                                    {p.image ? (
                                        <img src={p.image} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-3xl text-[#4e6a88]">🍽️</div>
                                    )}
                                </div>
                                <div className="flex flex-1 flex-col p-3">
                                    <p className="line-clamp-2 text-sm font-bold leading-snug text-[#f0f6ff]">{p.displayName}</p>
                                    {p.description ? <p className="mt-1 line-clamp-2 text-xs text-[#4e6a88]">{p.description}</p> : null}
                                    <p className="mt-auto pt-2 text-sm font-bold tabular-nums text-primary-400">{money(Number(p.basePrice))}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </main>

            {cartCount > 0 && !cartDrawerOpen ? (
                <div className="pointer-events-none fixed bottom-5 left-4 right-4 z-40 pb-safe sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2">
                    <button
                        type="button"
                        onClick={() => setCartDrawerOpen(true)}
                        className="pointer-events-auto flex w-full items-center justify-between rounded-2xl bg-primary-400 px-5 py-4 text-sm font-bold text-white shadow-xl transition-all hover:bg-primary-500 active:scale-[0.98] qr-cart-glow"
                    >
                        <span className="flex items-center gap-3">
                            <span className="relative text-xl leading-none">
                                🛒
                                <span className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-0.5 text-[10px] font-bold text-primary-500">
                                    {cartCount > 9 ? '9+' : cartCount}
                                </span>
                            </span>
                            {t.viewCart}
                        </span>
                        <span className="text-lg font-bold tabular-nums">{money(cartTotal)}</span>
                    </button>
                </div>
            ) : null}

            <AnimatePresence>
                {detailProduct ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                        onClick={() => setDetailProduct(null)}
                        role="presentation"
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#1e3a55] border-b-0 bg-[#112035] sm:max-h-[85vh] sm:max-w-xl sm:rounded-2xl sm:border-b sm:shadow-2xl md:max-w-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1e3a55] bg-[#112035] px-5 pb-2 pt-4">
                                <h3 className="min-w-0 flex-1 truncate text-lg font-bold text-[#f0f6ff]">{detailProduct.displayName}</h3>
                                <button
                                    type="button"
                                    onClick={() => setDetailProduct(null)}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a2f45] text-[#8ba3c0] transition hover:bg-[#243d52]"
                                    aria-label={t.close}
                                >
                                    <FiX size={18} />
                                </button>
                            </div>

                            <div className="aspect-video max-h-52 w-full shrink-0 bg-[#1a2f45]">
                                {detailProduct.image ? (
                                    <img src={detailProduct.image} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-5xl text-[#4e6a88]">🍽️</div>
                                )}
                            </div>

                            <div className="space-y-4 px-4 pb-8 pt-2 sm:px-5">
                                {detailProduct.description ? <p className="text-sm text-[#8ba3c0]">{detailProduct.description}</p> : null}

                                {detailProduct.variants && detailProduct.variants.length > 0 ? (
                                    <div>
                                        <p className="mb-2 text-xs font-semibold text-[#4e6a88]">{t.variants}</p>
                                        <div
                                            className={`grid gap-2 ${
                                                detailProduct.variants.length === 1
                                                    ? 'grid-cols-1 sm:max-w-[240px]'
                                                    : detailProduct.variants.length === 2
                                                      ? 'grid-cols-2'
                                                      : 'grid-cols-2 sm:grid-cols-3'
                                            }`}
                                        >
                                            {detailProduct.variants.map((v) => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => setSelVariantId(v.id)}
                                                    className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-center text-xs font-semibold leading-snug transition sm:min-h-[3.5rem] sm:text-sm ${
                                                        selVariantId === v.id
                                                            ? 'border-primary-400 bg-primary-400/15 text-primary-300'
                                                            : 'border-[#1e3a55] bg-[#1a2f45] text-[#f0f6ff] hover:border-emerald-500/50'
                                                    }`}
                                                >
                                                    <span className="line-clamp-2">{v.name}</span>
                                                    <span className="tabular-nums text-[11px] font-bold text-primary-400/95 sm:text-xs">{money(Number(v.price))}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {detailProduct.modifiers && detailProduct.modifiers.length > 0 ? (
                                    <div>
                                        <p className="mb-2 text-xs font-semibold text-[#4e6a88]">{t.extras}</p>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                            {detailProduct.modifiers.map((m) => {
                                                const sel = selModIds.has(m.id);
                                                return (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        onClick={() =>
                                                            setSelModIds((prev) => {
                                                                const n = new Set(prev);
                                                                if (n.has(m.id)) n.delete(m.id);
                                                                else n.add(m.id);
                                                                return n;
                                                            })
                                                        }
                                                        className={`flex min-h-[4rem] flex-col items-center justify-between gap-1 rounded-xl border-2 p-2 text-center transition sm:min-h-[4.25rem] sm:p-2.5 ${
                                                            sel ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-[#1e3a55] bg-[#1a2f45] hover:border-[#2a4a6a]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                                                                sel ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[#4e6a88] bg-[#112035]'
                                                            }`}
                                                        >
                                                            {sel ? <FiCheck size={12} /> : null}
                                                        </span>
                                                        <span className="line-clamp-3 flex-1 text-[11px] font-medium leading-snug text-[#f0f6ff] sm:text-xs">
                                                            {m.name}
                                                        </span>
                                                        <span className="min-h-[14px] shrink-0 text-[10px] font-semibold tabular-nums text-[#8ba3c0] sm:text-xs">
                                                            {Number(m.price) > 0 ? `+${money(Number(m.price))}` : '\u00a0'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="flex flex-col gap-3 border-t border-[#1e3a55] pt-4 sm:flex-row sm:items-center">
                                    <div className="flex items-center justify-center gap-3 rounded-xl border border-[#1e3a55] bg-[#1a2f45] px-2 py-2 sm:justify-start">
                                        <button
                                            type="button"
                                            onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e3a55] bg-[#112035] text-[#f0f6ff]"
                                        >
                                            <FiMinus size={16} />
                                        </button>
                                        <span className="w-8 text-center text-base font-bold tabular-nums text-[#f0f6ff]">{modalQty}</span>
                                        <button
                                            type="button"
                                            onClick={() => setModalQty((q) => q + 1)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-400 text-white hover:bg-primary-500"
                                        >
                                            <FiPlus size={16} />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            addToCart(detailProduct, selVariantId ?? undefined, [...selModIds], modalQty);
                                            setDetailProduct(null);
                                        }}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-400 py-4 text-sm font-bold text-white transition hover:bg-primary-500 active:scale-[0.98] qr-cart-glow"
                                    >
                                        {t.addToCart} · {money(unitFor(detailProduct, selVariantId ?? undefined, [...selModIds]) * modalQty)}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {cartDrawerOpen ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex flex-col justify-end"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t.cart}
                    >
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            aria-label={t.close}
                            onClick={() => setCartDrawerOpen(false)}
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="relative mx-auto flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl border border-[#1e3a55] border-b-0 bg-[#112035] sm:rounded-2xl sm:border-b"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 items-center justify-between border-b border-[#1e3a55] px-5 pb-3 pt-5">
                                <h3 className="flex items-center gap-2 text-lg font-bold text-[#f0f6ff]">
                                    <span className="text-xl" aria-hidden>
                                        🛒
                                    </span>
                                    {t.cart}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setCartDrawerOpen(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a2f45] text-[#8ba3c0] transition hover:bg-[#243d52]"
                                    aria-label={t.close}
                                >
                                    <FiX size={18} />
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                                {cart.length === 0 ? (
                                    <p className="py-12 text-center text-sm font-medium text-[#4e6a88]">{t.emptyCart}</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {cart.map((line) => (
                                            <li
                                                key={line.key}
                                                className="flex items-center gap-3 rounded-2xl border border-[#1e3a55] bg-[#1a2f45] p-3 sm:gap-4"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-bold text-[#f0f6ff]">{line.productName}</p>
                                                    {(line.variantName || line.modifierLabel) ? (
                                                        <p className="truncate text-xs text-[#8ba3c0]">{[line.variantName, line.modifierLabel].filter(Boolean).join(' · ')}</p>
                                                    ) : null}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setCart((p) =>
                                                                p
                                                                    .map((l) => (l.key === line.key ? { ...l, quantity: Math.max(0, l.quantity - 1) } : l))
                                                                    .filter((l) => l.quantity > 0),
                                                            )
                                                        }
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e3a55] bg-[#112035] text-[#f0f6ff]"
                                                    >
                                                        <FiMinus size={14} />
                                                    </button>
                                                    <span className="w-7 text-center text-sm font-bold tabular-nums text-[#f0f6ff]">{line.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setCart((p) => p.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l)))}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-400 text-white transition hover:bg-primary-500"
                                                    >
                                                        <FiPlus size={14} />
                                                    </button>
                                                </div>
                                                <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-primary-400">
                                                    {money(line.unitPrice * line.quantity)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            {cart.length > 0 ? (
                                <div className="shrink-0 border-t border-[#1e3a55] px-5 py-4 pb-safe">
                                    <div className="mb-3 flex items-center justify-between text-sm">
                                        <span className="font-semibold text-[#8ba3c0]">{t.total}</span>
                                        <span className="text-lg font-bold tabular-nums text-primary-400">{money(cartTotal)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCartDrawerOpen(false);
                                            setCheckoutInfoVerified(false);
                                            setView('checkout');
                                        }}
                                        className="flex w-full items-center justify-between rounded-2xl bg-primary-400 px-5 py-4 text-sm font-bold text-white transition-all hover:bg-primary-500 active:scale-[0.98] qr-cart-glow"
                                    >
                                        <span>{t.goToPayment}</span>
                                        <span className="tabular-nums">{money(cartTotal)}</span>
                                    </button>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
        {orderLookupModalNode}
        {addressesModalNode}
        {waVerifyModalNode}
        </>
    );
}
