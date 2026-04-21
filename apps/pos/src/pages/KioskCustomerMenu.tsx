/**
 * Masa tableti — kiosk dijital menü (/kiosk/:tableId?tenant=...)
 * QR müşteri API ile aynı uçlar; görünüm nextpos_qrmenu.html referanslı.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import {
    FiBell,
    FiMinus,
    FiPlus,
    FiMenu,
    FiRefreshCw,
    FiSettings,
    FiShoppingCart,
    FiShoppingBag,
    FiTrash2,
    FiX,
    FiCheck,
} from 'react-icons/fi';
import * as FaIcons from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

import { CustomerIdentify } from '../components/pos/CustomerIdentify';
import { getKioskT, type KioskLang, type KioskMessages } from '../i18n/kioskMenuMessages';

type Cat = { id: number; displayName: string; name: string; icon?: string };
type Mod = { id: number; name: string; price: string | number; categoryName?: string };
type Variant = { id: number; name: string; price: string | number; isDefault?: boolean };
type Product = {
    id: number;
    categoryId?: number;
    displayName: string;
    description?: string;
    image?: string;
    basePrice: string | number;
    variants: Variant[];
    modifiers: Mod[];
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

type View = 'idle' | 'login' | 'menu';
type LoginTab = 'qr' | 'phone' | 'guest';

const KIOSK_STORAGE_KEY = 'nextpos_kiosk_binding_v1';

/** Tablet / dokunmatik: tam ekran kabuk (mobil tarayıcı bounce’u azaltır) */
const KIOSK_SHELL_CLASS =
    'kiosk-root fixed inset-0 z-[20] flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#0A1628] font-sans antialiased text-[#F0F6FF] selection:bg-emerald-500/30 [-webkit-tap-highlight-color:transparent]';

const kioskSafeStyle = {
    touchAction: 'manipulation' as const,
    paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
    paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
};

type KioskStoredBinding = {
    tenantId: string;
    venueName: string;
    tableQrCode: string;
    tableName: string;
    sectionName?: string | null;
    /** Sunucuda üretilen kalıcı cihaz kimliği — /session ile doğrulanır */
    deviceCode?: string;
    savedAt: number;
};

const CategoryIcon = ({ iconName, className }: { iconName?: string; className?: string }) => {
    if (!iconName) return <span className={className}>🍽️</span>;
    if (/\p{Emoji}/u.test(iconName)) return <span className={className}>{iconName}</span>;
    const name = iconName.startsWith('Fa') ? iconName : `Fa${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`;
    const IconComponent = (FaIcons as Record<string, React.FC<{ className?: string }>>)[name];
    if (IconComponent) return <IconComponent className={className} />;
    return <span className={className}>🍽️</span>;
};

function vatSplit(gross: number, lang: KioskLang): { net: number; tax: number } {
    const rate = lang === 'de' ? 0.19 : lang === 'en' ? 0.2 : 0.1;
    const net = gross / (1 + rate);
    return { net, tax: gross - net };
}

export const KioskCustomerMenu: React.FC = () => {
    const { tableId: tableIdFromRoute } = useParams();
    const [search] = useSearchParams();
    const [lang, setLang] = useState<KioskLang>('tr');
    const km: KioskMessages = useMemo(() => getKioskT(lang), [lang]);

    const tenantFromUrl = search.get('tenant')?.trim() || '';

    /** Kurulum tamamlandıysa dolu (URL veya localStorage veya sihirbaz) */
    const [tenant, setTenant] = useState('');
    const [tableQr, setTableQr] = useState('');
    const [venueName, setVenueName] = useState('');
    /** tableInfo gelene kadar gösterim (depolanan masa adı) */
    const [boundTableName, setBoundTableName] = useState('');
    const [setupReady, setSetupReady] = useState(false);
    const [initDone, setInitDone] = useState(false);

    const [wizLicense, setWizLicense] = useState('');
    const [wizTable, setWizTable] = useState('');
    const [wizPairing, setWizPairing] = useState('');
    const [wizBusy, setWizBusy] = useState(false);

    const [view, setView] = useState<View>('idle');
    const [loginTab, setLoginTab] = useState<LoginTab>('qr');

    const [tableInfo, setTableInfo] = useState<{
        tableId: number;
        tableName: string;
        sectionName?: string;
        qrCode?: string;
    } | null>(null);
    const [categories, setCategories] = useState<Cat[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [catTab, setCatTab] = useState<number | 'all'>('all');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [guestName, setGuestName] = useState('');
    const [guestCount, setGuestCount] = useState(2);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [, setPendingOrderId] = useState<number | null>(null);

    const [detailProduct, setDetailProduct] = useState<Product | null>(null);
    const [selVariantId, setSelVariantId] = useState<number | null>(null);
    const [selModIds, setSelModIds] = useState<Set<number>>(new Set());
    const [modalQty, setModalQty] = useState(1);
    const [identifiedCustomer, setIdentifiedCustomer] = useState<{ id?: number; name?: string } | null>(null);
    /** Menü şeridi: üye → son sipariş ürünleri; misafir → çok satanlar (API `/qr/menu/spotlight`) */
    const [menuSpotlight, setMenuSpotlight] = useState<{
        mode: 'recent' | 'popular';
        productIds: number[];
    } | null>(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);
    /** Sepet paneli (açılır / kapanır) */
    const [cartOpen, setCartOpen] = useState(false);
    /** Üst bar: dil + ayarlar açılır menü */
    const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
    const headerMenuRef = useRef<HTMLDivElement>(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [adminPin, setAdminPin] = useState('');
    const [settingsPinBusy, setSettingsPinBusy] = useState(false);
    const [settingsPinErr, setSettingsPinErr] = useState<string | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const menuSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Sayfa yeniden açıldığında (kayıtlı cihaz) menüye doğrudan geç */
    const openMenuAfterRestoreRef = useRef(false);

    const qrHeaders = useMemo(
        () => ({
            'Content-Type': 'application/json',
            'x-tenant-id': tenant,
        }),
        [tenant],
    );

    /** Tam ekran tablet deneyimi: scroll bounce azaltma, tema rengi */
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyH = body.style.height;
        const prevBodyPos = body.style.position;
        const prevBodyW = body.style.width;
        html.classList.add('kiosk-fullscreen');
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.height = '100%';
        body.style.position = 'fixed';
        body.style.width = '100%';
        body.style.overscrollBehavior = 'none';
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        const prevTheme = metaTheme?.getAttribute('content');
        if (metaTheme) metaTheme.setAttribute('content', '#0A1628');
        return () => {
            html.classList.remove('kiosk-fullscreen');
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
            body.style.height = prevBodyH;
            body.style.position = prevBodyPos;
            body.style.width = prevBodyW;
            body.style.overscrollBehavior = '';
            if (metaTheme && prevTheme != null) metaTheme.setAttribute('content', prevTheme);
        };
    }, []);

    /** Ürün detayı açılınca sepet panelini kapat */
    useEffect(() => {
        if (detailProduct) setCartOpen(false);
    }, [detailProduct]);

    /** Ürün detayı açılınca üst menüyü kapat */
    useEffect(() => {
        if (detailProduct) setHeaderMenuOpen(false);
    }, [detailProduct]);

    /** Menü görünümünden çıkınca açılır paneli kapat */
    useEffect(() => {
        if (view !== 'menu') setHeaderMenuOpen(false);
    }, [view]);

    /** Dışarı tıklanınca dil/ayarlar panelini kapat */
    useEffect(() => {
        if (!headerMenuOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const el = headerMenuRef.current;
            if (el && !el.contains(e.target as Node)) setHeaderMenuOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [headerMenuOpen]);

    const displayTableName = tableInfo?.tableName || boundTableName || '';
    const displayVenueName = venueName.trim();

    const openSettingsModal = () => {
        setAdminPin('');
        setSettingsPinErr(null);
        setSettingsOpen(true);
    };

    /** İlk açılış: URL → cihaz kodu (session) → eski kayıt (lisans+masa, deviceCode yok) */
    useEffect(() => {
        let cancelled = false;
        const routeTable = tableIdFromRoute?.trim();

        async function init() {
            if (tenantFromUrl && routeTable) {
                setTenant(tenantFromUrl);
                setTableQr(routeTable);
                setBoundTableName('');
                setSetupReady(true);
                openMenuAfterRestoreRef.current = false;
                setInitDone(true);
                return;
            }
            try {
                const raw = localStorage.getItem(KIOSK_STORAGE_KEY);
                if (!raw) {
                    setInitDone(true);
                    return;
                }
                const b = JSON.parse(raw) as KioskStoredBinding;

                if (b.deviceCode && b.tenantId) {
                    const res = await fetch('/api/v1/public/kiosk/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tenantId: b.tenantId, deviceCode: b.deviceCode }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (cancelled) return;
                    const tableQrResolved =
                        (typeof data.tableQrCode === 'string' && data.tableQrCode.trim()) ||
                        (data.tableId != null ? `__nextpos_tid_${data.tableId}` : '');
                    if (res.ok && data.tenantId && tableQrResolved) {
                        const payload: KioskStoredBinding = {
                            tenantId: data.tenantId,
                            venueName: data.venueName || '',
                            tableQrCode: tableQrResolved,
                            tableName: data.tableName,
                            sectionName: data.sectionName ?? null,
                            deviceCode: data.deviceCode || b.deviceCode,
                            savedAt: Date.now(),
                        };
                        localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(payload));
                        setTenant(data.tenantId);
                        setTableQr(tableQrResolved);
                        setVenueName(data.venueName || '');
                        setBoundTableName(String(data.tableName || ''));
                        setSetupReady(true);
                        openMenuAfterRestoreRef.current = true;
                        setInitDone(true);
                        return;
                    }
                    try {
                        localStorage.removeItem(KIOSK_STORAGE_KEY);
                    } catch {
                        /* ignore */
                    }
                    setInitDone(true);
                    return;
                }

                if (b.tenantId && b.tableQrCode) {
                    setTenant(b.tenantId);
                    setTableQr(b.tableQrCode);
                    setVenueName(b.venueName || '');
                    setBoundTableName(String(b.tableName || ''));
                    setSetupReady(true);
                    openMenuAfterRestoreRef.current = true;
                }
            } catch {
                /* ignore */
            }
            if (!cancelled) setInitDone(true);
        }

        void init();
        return () => {
            cancelled = true;
        };
    }, [tenantFromUrl, tableIdFromRoute]);

    useEffect(() => {
        document.title = `${km.metaTitle} · NextPOS`;
    }, [km.metaTitle]);

    /** POS ile uyumlu: fiyat birimi backend/tenant ile ileride bağlanabilir */
    const money = (n: number) => {
        const loc = lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US';
        return `₺${n.toLocaleString(loc, { maximumFractionDigits: 0 })}`;
    };

    const unitFor = (p: Product, variantId: number | undefined, modIds: number[]): number => {
        const v = p.variants?.find((x) => x.id === variantId);
        let u = Number(v?.price ?? p.basePrice);
        for (const id of modIds) {
            const m = p.modifiers?.find((x) => x.id === id);
            if (m) u += Number(m.price);
        }
        return Math.round(u * 100) / 100;
    };

    const lineKey = (productId: number, variantId: number | undefined, ids: number[]) =>
        `${productId}-${variantId ?? 0}-${[...ids].sort((a, b) => a - b).join(',')}`;

    const loadMenu = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!tenant || !tableQr || !setupReady) return;
            if (!opts?.silent) setLoading(true);
            try {
                const [tRes, cRes, pRes] = await Promise.all([
                    fetch(`/api/v1/qr/tables/${encodeURIComponent(tableQr)}`, { headers: { 'x-tenant-id': tenant } }),
                    fetch(`/api/v1/qr/menu/categories?lang=${lang}`, { headers: { 'x-tenant-id': tenant } }),
                    fetch(`/api/v1/qr/menu/products?lang=${lang}`, { headers: { 'x-tenant-id': tenant } }),
                ]);
                if (!tRes.ok) {
                    setLoading(false);
                    return;
                }
                const tData = await tRes.json();
                const cData = await cRes.json();
                const pData = await pRes.json();
                setTableInfo({
                    tableId: tData.tableId,
                    tableName: tData.tableName,
                    sectionName: tData.sectionName,
                    qrCode: tData.qrCode,
                });
                setCategories(Array.isArray(cData) ? cData : []);
                setProducts(Array.isArray(pData) ? pData : []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        },
        [tenant, tableQr, lang, setupReady],
    );

    const fetchMenuSpotlight = useCallback(async () => {
        if (!tenant || !setupReady) return;
        const cid = identifiedCustomer?.id;
        const q = cid != null && cid > 0 ? `?customerId=${cid}` : '';
        try {
            const res = await fetch(`/api/v1/qr/menu/spotlight${q}`, {
                headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant },
            });
            const data = (await res.json().catch(() => ({}))) as { mode?: string; productIds?: unknown[] };
            if (res.ok && Array.isArray(data.productIds)) {
                const productIds = data.productIds
                    .map((x) => Number(x))
                    .filter((n) => Number.isFinite(n) && n > 0);
                setMenuSpotlight({
                    mode: data.mode === 'recent' ? 'recent' : 'popular',
                    productIds,
                });
            } else {
                setMenuSpotlight({ mode: 'popular', productIds: [] });
            }
        } catch {
            setMenuSpotlight({ mode: 'popular', productIds: [] });
        }
    }, [tenant, setupReady, identifiedCustomer?.id]);

    useEffect(() => {
        void loadMenu();
    }, [loadMenu]);

    useEffect(() => {
        if (view !== 'menu' || !tenant || !setupReady) return;
        void fetchMenuSpotlight();
    }, [view, tenant, setupReady, fetchMenuSpotlight]);

    /** Kayıtlı oturumla /kiosk/ yeniden açılınca menüye geç (masa adı header’da) */
    useEffect(() => {
        if (!openMenuAfterRestoreRef.current || !tableInfo?.tableId) return;
        openMenuAfterRestoreRef.current = false;
        setView('menu');
    }, [tableInfo?.tableId]);

    useEffect(() => {
        if (!tenant || !tableInfo?.tableId) return;
        const socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        const scheduleMenuReload = () => {
            if (menuSyncRef.current) clearTimeout(menuSyncRef.current);
            menuSyncRef.current = setTimeout(() => {
                void loadMenu({ silent: true });
                menuSyncRef.current = null;
            }, 450);
        };

        socket.on('connect', () => {
            socket.emit('join:tenant', tenant);
            socket.emit('join:table', { tenantId: tenant, tableId: tableInfo.tableId });
        });

        socket.on('sync:menu_revision', scheduleMenuReload);
        socket.on('sync:tables_changed', scheduleMenuReload);

        const onServiceCallAccepted = () => {
            const m = getKioskT(lang);
            toast.success(m.waiterOnWayToast, {
                icon: '👋',
                duration: 6000,
                style: { background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
            });
        };
        socket.on('customer:service_call_accepted', onServiceCallAccepted);

        return () => {
            socketRef.current = null;
            if (menuSyncRef.current) clearTimeout(menuSyncRef.current);
            socket.off('customer:service_call_accepted', onServiceCallAccepted);
            socket.disconnect();
        };
    }, [tenant, tableInfo?.tableId, loadMenu, lang]);

    const handleServiceRequest = async (type: string) => {
        const qc = tableInfo?.qrCode || tableQr;
        if (!tableInfo || !qc) return;
        const callMap: Record<string, string> = {
            waiter: 'call_waiter',
            bill: 'request_bill',
            water: 'water',
            clean: 'clear_table',
        };
        const callType = callMap[type] || 'custom';
        try {
            const res = await fetch('/api/v1/qr/service-call', {
                method: 'POST',
                headers: qrHeaders,
                body: JSON.stringify({
                    qrCode: qc,
                    callType,
                }),
            });
            if (!res.ok) {
                toast.error(km.networkError);
                return;
            }
            toast.success(km.serviceSent, {
                icon: type === 'waiter' ? '🔔' : type === 'bill' ? '💳' : '💧',
                style: { background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
            });
        } catch {
            toast.error(km.networkError);
        }
    };

    const placeOrder = async () => {
        if (cart.length === 0 || !tableInfo) return;
        setLoading(true);
        try {
            const notesCombined = [note, guestCount > 0 ? `👥 ${guestCount}` : ''].filter(Boolean).join(' · ');
            const qc = tableInfo.qrCode || tableQr;
            const orderPayload: Record<string, unknown> = {
                qrCode: qc,
                guestName: guestName || 'Guest',
                notes: notesCombined,
                items: cart.map((c) => ({
                    productId: c.productId,
                    ...(c.variantId != null && c.variantId > 0 ? { variantId: c.variantId } : {}),
                    modifierIds: c.modifierIds,
                    quantity: c.quantity,
                })),
            };
            const cid = identifiedCustomer?.id;
            if (cid != null && cid > 0) {
                orderPayload.customerId = cid;
            }
            const res = await fetch('/api/v1/qr/orders', {
                method: 'POST',
                headers: qrHeaders,
                body: JSON.stringify(orderPayload),
            });
            const data = await res.json();
            if (res.ok && data.order) {
                setPendingOrderId(Number(data.order.id));
                setCart([]);
                setConfirmOpen(false);
                setCartOpen(false);
                setSuccessOpen(true);
                setTimeout(() => setSuccessOpen(false), 4500);
                if (identifiedCustomer?.id) void fetchMenuSpotlight();
            } else {
                toast.error(km.orderFailed);
            }
        } catch {
            toast.error(km.orderFailed);
        } finally {
            setLoading(false);
        }
    };

    const addToCart = (p: Product, varId?: number, modIds: number[] = [], qty: number = 1) => {
        const key = lineKey(p.id, varId, modIds);
        const unit = unitFor(p, varId, modIds);
        const v = p.variants.find((x) => x.id === varId);
        const modsLabels = modIds.map((id) => p.modifiers.find((m) => m.id === id)?.name).filter(Boolean).join(', ');

        setCart((prev) => {
            const existing = prev.find((x) => x.key === key);
            if (existing) {
                return prev.map((x) => (x.key === key ? { ...x, quantity: x.quantity + qty } : x));
            }
            return [
                ...prev,
                {
                    key,
                    productId: p.id,
                    productName: p.displayName,
                    variantId: varId,
                    variantName: v?.name,
                    quantity: qty,
                    modifierIds: modIds,
                    modifierLabel: modsLabels,
                    unitPrice: unit,
                },
            ];
        });
        toast.success(km.addedToast, { icon: '🛒' });
    };

    const cartTotal = cart.reduce((acc, c) => acc + c.unitPrice * c.quantity, 0);
    const { net: netTotal, tax: taxAmount } = vatSplit(cartTotal, lang);

    const filteredProducts = products.filter((p) => catTab === 'all' || p.categoryId === catTab);
    const ribbonProducts = useMemo(() => {
        const ids = menuSpotlight?.productIds ?? [];
        if (ids.length === 0) return products.slice(0, 6);
        const byId = new Map(products.map((p) => [p.id, p]));
        const out: Product[] = [];
        const seen = new Set<number>();
        for (const raw of ids) {
            const p = byId.get(raw);
            if (p && !seen.has(p.id)) {
                seen.add(p.id);
                out.push(p);
                if (out.length >= 6) break;
            }
        }
        return out.length > 0 ? out : products.slice(0, 6);
    }, [products, menuSpotlight]);
    const ribbonTitle =
        menuSpotlight?.mode === 'recent' ? km.ribbonRecentOrders : km.ribbonPopular;

    const resetKioskBinding = () => {
        try {
            localStorage.removeItem(KIOSK_STORAGE_KEY);
        } catch {
            /* ignore */
        }
        openMenuAfterRestoreRef.current = false;
        setTenant('');
        setTableQr('');
        setVenueName('');
        setBoundTableName('');
        setSetupReady(false);
        setTableInfo(null);
        setView('idle');
        setCart([]);
    };

    const verifyPinAndReset = async () => {
        const p = adminPin.replace(/\D/g, '').slice(0, 6);
        if (p.length !== 6) {
            setSettingsPinErr(km.settingsPinError);
            return;
        }
        setSettingsPinBusy(true);
        setSettingsPinErr(null);
        try {
            const res = await fetch('/api/v1/public/kiosk/verify-admin-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: tenant, pinCode: p }),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                setSettingsPinErr(data.error || km.settingsPinWrong);
                return;
            }
            setSettingsOpen(false);
            setAdminPin('');
            resetKioskBinding();
            toast.success(km.settingsResetOk);
        } catch {
            setSettingsPinErr(km.wizardErrNetwork);
        } finally {
            setSettingsPinBusy(false);
        }
    };

    const submitWizard = async () => {
        const licenseKey = wizLicense.trim();
        const tableId = wizTable.trim();
        if (!licenseKey || !tableId) {
            toast.error(km.wizardErrGeneric);
            return;
        }
        setWizBusy(true);
        try {
            const res = await fetch('/api/v1/public/kiosk/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    licenseKey,
                    tableNameOrQr: tableId,
                    pairingSecret: wizPairing.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || km.wizardErrGeneric);
                return;
            }
            const qrResolved =
                (typeof data.tableQrCode === 'string' && data.tableQrCode.trim()) ||
                (data.tableId != null ? `__nextpos_tid_${data.tableId}` : '');
            if (!qrResolved) {
                toast.error(km.wizardErrGeneric);
                return;
            }
            const payload: KioskStoredBinding = {
                tenantId: data.tenantId,
                venueName: data.venueName || '',
                tableQrCode: qrResolved,
                tableName: data.tableName,
                sectionName: data.sectionName,
                deviceCode: typeof data.deviceCode === 'string' ? data.deviceCode : undefined,
                savedAt: Date.now(),
            };
            localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(payload));
            setTenant(data.tenantId);
            setTableQr(qrResolved);
            setVenueName(data.venueName || '');
            setBoundTableName(String(data.tableName || ''));
            setSetupReady(true);
            setView('idle');
            toast.success('✓', { duration: 2000 });
        } catch {
            toast.error(km.wizardErrNetwork);
        } finally {
            setWizBusy(false);
        }
    };

    const goIdle = () => {
        setView('idle');
        setCart([]);
        setGuestName('');
        setNote('');
        setIdentifiedCustomer(null);
        setConfirmOpen(false);
        setCartOpen(false);
        setHeaderMenuOpen(false);
    };

    const demoPhoneLogin = () => {
        setGuestName('Demo');
        setView('menu');
    };

    if (!initDone) {
        return (
            <div className={KIOSK_SHELL_CLASS} style={kioskSafeStyle}>
                <div className="flex flex-1 items-center justify-center">
                    <FiRefreshCw className="animate-spin text-emerald-500" size={48} />
                </div>
            </div>
        );
    }

    if (!setupReady) {
        return (
            <div className={`${KIOSK_SHELL_CLASS} text-center`} style={kioskSafeStyle}>
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
                <div className="mb-6 text-5xl">🍽️</div>
                <h1 className="mb-2 text-2xl font-bold md:text-3xl">{km.wizardTitle}</h1>
                <p className="mb-8 max-w-md text-sm text-[#8BA3C0]">{km.wizardSubtitle}</p>
                <div className="mb-6 flex flex-wrap justify-center gap-2">
                    {(['de', 'tr', 'en'] as KioskLang[]).map((l) => (
                        <button
                            key={l}
                            type="button"
                            onClick={() => setLang(l)}
                            className={`min-h-[48px] min-w-[52px] rounded-xl border px-4 py-2 text-sm font-bold active:scale-[0.98] ${
                                lang === l ? 'border-emerald-500 text-emerald-400' : 'border-[#1E3A55] text-[#4E6A88]'
                            }`}
                        >
                            {l.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div className="w-full max-w-md space-y-4 text-left">
                    <div>
                        <label className="mb-1 block text-[11px] font-bold text-[#8BA3C0]">{km.licenseLabel}</label>
                        <input
                            className="min-h-[52px] w-full rounded-xl border border-[#1E3A55] bg-[#112035] px-4 py-3 text-base text-[#F0F6FF] outline-none focus:border-emerald-500"
                            value={wizLicense}
                            onChange={(e) => setWizLicense(e.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            autoComplete="off"
                        />
                        <p className="mt-1 text-[10px] text-[#4E6A88]">{km.licenseHint}</p>
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-bold text-[#8BA3C0]">{km.tableIdLabel}</label>
                        <input
                            className="min-h-[52px] w-full rounded-xl border border-[#1E3A55] bg-[#112035] px-4 py-3 text-base text-[#F0F6FF] outline-none focus:border-emerald-500"
                            value={wizTable}
                            onChange={(e) => setWizTable(e.target.value)}
                            placeholder="Masa 5"
                            autoComplete="off"
                        />
                        <p className="mt-1 text-[10px] text-[#4E6A88]">{km.tableIdHint}</p>
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-bold text-[#8BA3C0]">{km.pairingLabel}</label>
                        <input
                            className="min-h-[52px] w-full rounded-xl border border-[#1E3A55] bg-[#112035] px-4 py-3 text-base text-[#F0F6FF] outline-none focus:border-emerald-500"
                            value={wizPairing}
                            onChange={(e) => setWizPairing(e.target.value)}
                            placeholder="—"
                            autoComplete="off"
                        />
                        <p className="mt-1 text-[10px] text-[#4E6A88]">{km.pairingHint}</p>
                    </div>
                    <button
                        type="button"
                        disabled={wizBusy}
                        onClick={() => void submitWizard()}
                        className="min-h-[56px] w-full rounded-2xl bg-emerald-500 py-4 text-base font-bold text-white hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-50"
                    >
                        {wizBusy ? km.wizardSaving : km.wizardSave}
                    </button>
                </div>
                </div>
            </div>
        );
    }

    if (!tenant || !tableQr) {
        return (
            <div className={`${KIOSK_SHELL_CLASS} flex flex-col items-center justify-center p-8 text-center`} style={kioskSafeStyle}>
                <div className="max-w-md rounded-3xl border border-[#1E3A55] bg-[#112035] p-10">
                    <div className="text-6xl mb-6">🍽️</div>
                    <h1 className="text-2xl font-bold mb-4">{km.invalidQr}</h1>
                    <p className="text-[#8BA3C0] text-sm leading-relaxed">{km.invalidQrHelp}</p>
                </div>
            </div>
        );
    }

    const langBtn = (code: KioskLang, flag: string, label: string) => (
        <button
            type="button"
            key={code}
            onClick={() => setLang(code)}
            className={`flex min-h-[100px] min-w-[108px] flex-col items-center justify-center gap-2 rounded-2xl border px-5 py-5 transition-all active:scale-[0.98] ${
                lang === code
                    ? 'border-emerald-500 bg-emerald-500/15 -translate-y-0.5 shadow-lg'
                    : 'border-[#1E3A55] bg-[#112035] hover:border-[#2A4A6A]'
            }`}
        >
            <span className="text-3xl">{flag}</span>
            <span className={`text-[13px] font-medium ${lang === code ? 'text-emerald-400' : 'text-[#8BA3C0]'}`}>{label}</span>
        </button>
    );

    return (
        <div
            className={`${KIOSK_SHELL_CLASS} font-[Inter,system-ui,sans-serif]`}
            style={{
                ...kioskSafeStyle,
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            <style>{`
        html.kiosk-fullscreen { height: 100%; }
        .kiosk-root { user-select: none; -webkit-user-select: none; }
        .kiosk-root input, .kiosk-root textarea { user-select: text; -webkit-user-select: text; }
        /* 10–12" tablet dikey: kategori sütunu kaydırma */
        @media (orientation: portrait) and (min-width: 600px) {
          .kiosk-cat-scroll { scrollbar-width: thin; scrollbar-color: rgba(16,185,129,0.35) transparent; }
          .kiosk-cat-scroll::-webkit-scrollbar { width: 6px; }
          .kiosk-cat-scroll::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.25); border-radius: 999px; }
        }
      `}</style>
            <AnimatePresence mode="wait">
                {loading && products.length === 0 && view !== 'idle' ? (
                    <motion.div
                        key="ld"
                        className="fixed inset-0 z-[300] flex flex-col items-center justify-center"
                        style={{ background: '#0A1628' }}
                    >
                        <FiRefreshCw className="animate-spin text-emerald-500" size={56} />
                        <p className="mt-6 text-sm font-semibold tracking-widest text-[#8BA3C0]">{km.loading}</p>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {/* —— IDLE —— */}
            {view === 'idle' && (
                <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8 sm:px-8">
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        <div
                            className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/10"
                            style={{ animation: 'kioskRing 3s ease-out infinite' }}
                        />
                        <div
                            className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/10"
                            style={{ animation: 'kioskRing 3s ease-out 0.8s infinite' }}
                        />
                    </div>
                    <style>{`
            @keyframes kioskRing { 0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(1);} 50%{opacity:.08;transform:translate(-50%,-50%) scale(1.02);} }
            @keyframes kioskTableGlow {
              0%, 100% { opacity: 1; transform: scale(1); filter: brightness(1); text-shadow: 0 0 28px rgba(16,185,129,0.45), 0 0 2px rgba(255,255,255,0.15); }
              50% { opacity: 0.82; transform: scale(1.03); filter: brightness(1.12); text-shadow: 0 0 48px rgba(52,211,153,0.9), 0 0 80px rgba(16,185,129,0.35); }
            }
          `}</style>

                    <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
                        <div className="mb-8 flex h-[88px] w-[88px] items-center justify-center rounded-full border-2 border-emerald-500/80 bg-[#112035] text-4xl shadow-[0_0_48px_rgba(16,185,129,0.35)]">
                            🍽️
                        </div>
                        {displayVenueName ? (
                            <h1 className="mb-3 max-w-[95vw] bg-gradient-to-br from-emerald-300 via-cyan-200 to-white bg-clip-text px-2 text-3xl font-black leading-tight tracking-tight text-transparent sm:text-4xl md:text-5xl">
                                {displayVenueName}
                            </h1>
                        ) : (
                            <h1 className="mb-3 text-2xl font-black tracking-tight text-white/90">NextPOS</h1>
                        )}
                        {displayTableName ? (
                            <p
                                className="mb-8 max-w-[95vw] px-2 text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
                                style={{ animation: 'kioskTableGlow 2.4s ease-in-out infinite' }}
                            >
                                {displayTableName}
                            </p>
                        ) : null}
                        <p className="mb-1 text-sm text-[#8BA3C0]">{km.idleTagline}</p>
                        <p className="mb-4 text-sm text-[#4E6A88]">{km.idleChooseLang}</p>
                        <div className="mb-8 flex flex-wrap justify-center gap-3">
                            {langBtn('de', '🇩🇪', 'Deutsch')}
                            {langBtn('tr', '🇹🇷', 'Türkçe')}
                            {langBtn('en', '🇬🇧', 'English')}
                        </div>
                        <button
                            type="button"
                            onClick={() => setView('login')}
                            className="min-h-[56px] rounded-2xl bg-emerald-500 px-14 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-emerald-600 active:scale-[0.98] sm:min-h-[60px] sm:px-16 sm:text-xl"
                        >
                            {km.idleOpenMenu}
                        </button>
                        <p className="mt-8 max-w-xs text-[11px] text-[#4E6A88]">{km.idleQrHint}</p>
                        <button
                            type="button"
                            onClick={openSettingsModal}
                            className="mt-8 flex items-center gap-2 rounded-2xl border border-slate-600/80 bg-[#1A2F45] px-5 py-2.5 text-[13px] font-bold text-[#8BA3C0] transition hover:border-emerald-500/40 hover:text-emerald-300"
                        >
                            <FiSettings className="text-emerald-400/90" size={18} />
                            {km.settings}
                        </button>
                    </div>
                </div>
            )}

            {/* —— LOGIN —— */}
            {view === 'login' && (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
                    <div className="w-full max-w-[460px]">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500 bg-[#112035] text-lg">
                                🍽️
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-lg font-bold">{km.loginTitle}</h2>
                                <p className="text-sm text-[#8BA3C0]">{km.loginSubtitle}</p>
                            </div>
                            {tableInfo && (
                                <span className="shrink-0 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                                    {km.tableBadge} {tableInfo.tableName}
                                </span>
                            )}
                        </div>

                        <div className="overflow-hidden rounded-[20px] border border-[#1E3A55] bg-[#112035]">
                            <div className="flex border-b border-[#1E3A55] bg-[#1A2F45]">
                                {(
                                    [
                                        ['qr', km.tabQr],
                                        ['phone', km.tabPhone],
                                        ['guest', km.tabGuest],
                                    ] as const
                                ).map(([id, label]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setLoginTab(id)}
                                        className={`flex-1 py-3.5 text-center text-[13px] font-medium transition ${
                                            loginTab === id
                                                ? 'border-b-2 border-emerald-500 text-emerald-400'
                                                : 'text-[#4E6A88] hover:text-[#F0F6FF]'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="p-6">
                                {loginTab === 'qr' && (
                                    <div>
                                        <CustomerIdentify
                                            isPublic
                                            variant="kiosk"
                                            tenantId={tenant}
                                            placeholder={km.qrScanTitle}
                                            onSelect={(c) => {
                                                setIdentifiedCustomer(c);
                                                if (c?.name) setGuestName(c.name);
                                                if (c) setView('menu');
                                            }}
                                        />
                                        <p className="mt-3 text-center text-xs text-[#4E6A88]">{km.qrScanSub}</p>
                                    </div>
                                )}
                                {loginTab === 'phone' && (
                                    <div className="space-y-4">
                                        <p className="text-sm text-[#8BA3C0]">{km.phoneLabel}</p>
                                        <input
                                            type="tel"
                                            className="w-full rounded-lg border border-[#1E3A55] bg-[#1A2F45] px-4 py-3 text-[#F0F6FF] outline-none focus:border-emerald-500"
                                            placeholder={km.phonePlaceholder}
                                        />
                                        <button
                                            type="button"
                                            onClick={demoPhoneLogin}
                                            className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-600"
                                        >
                                            {km.phoneContinue}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={demoPhoneLogin}
                                            className="w-full rounded-lg border border-[#1E3A55] py-3 text-sm text-[#8BA3C0] hover:bg-[#1A2F45]"
                                        >
                                            {km.demoPhone}
                                        </button>
                                    </div>
                                )}
                                {loginTab === 'guest' && (
                                    <div className="space-y-4">
                                        <p className="text-sm text-[#8BA3C0]">{km.guestNameLabel}</p>
                                        <input
                                            className="w-full rounded-lg border border-[#1E3A55] bg-[#1A2F45] px-4 py-3 outline-none focus:border-emerald-500"
                                            placeholder={km.guestNamePlaceholder}
                                            value={guestName}
                                            onChange={(e) => setGuestName(e.target.value)}
                                        />
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-sm text-[#8BA3C0]">{km.guestCountLabel}</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E3A55] bg-[#1A2F45] text-lg"
                                                    onClick={() => setGuestCount((n) => Math.max(1, n - 1))}
                                                >
                                                    −
                                                </button>
                                                <span className="min-w-[2ch] text-center font-bold">{guestCount}</span>
                                                <button
                                                    type="button"
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E3A55] bg-[#1A2F45] text-lg"
                                                    onClick={() => setGuestCount((n) => Math.min(20, n + 1))}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setView('menu')}
                                            className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-600"
                                        >
                                            {km.guestContinue}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-center gap-2">
                            {(['de', 'tr', 'en'] as KioskLang[]).map((l) => (
                                <button
                                    key={l}
                                    type="button"
                                    onClick={() => setLang(l)}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                                        lang === l
                                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                            : 'border-[#1E3A55] text-[#4E6A88]'
                                    }`}
                                >
                                    {l.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => setView('idle')} className="mt-6 w-full text-center text-sm text-[#4E6A88] hover:text-[#8BA3C0]">
                            {km.back}
                        </button>
                    </div>
                </div>
            )}

            {/* —— MENU —— */}
            {view === 'menu' && tableInfo && (
                <>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* header — tablet dikeyde daha ferah */}
                    <header
                        className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-3 md:portrait:px-6 md:portrait:py-4"
                        style={{ background: 'linear-gradient(180deg, #0E1B2E 0%, #0A1628 100%)' }}
                    >
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[17px] font-black leading-[1.15] tracking-tight text-white [text-shadow:0_1px_24px_rgba(255,255,255,0.12)] md:portrait:text-[22px] md:portrait:leading-tight">
                                {venueName || 'NextPOS'}
                            </p>
                            <p className="truncate text-[15px] font-black leading-tight tracking-tight text-emerald-300 [text-shadow:0_0_22px_rgba(52,211,153,0.45)] md:portrait:text-[19px] md:portrait:tracking-wide">
                                {tableInfo.tableName}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 md:portrait:gap-3">
                            <div ref={headerMenuRef} className="relative">
                                <button
                                    type="button"
                                    aria-expanded={headerMenuOpen}
                                    aria-haspopup="menu"
                                    aria-label={km.headerOptionsMenu}
                                    onClick={() => setHeaderMenuOpen((o) => !o)}
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.05] text-white/85 transition active:scale-95 md:portrait:h-11 md:portrait:w-11 ${
                                        headerMenuOpen ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'hover:bg-white/[0.08]'
                                    }`}
                                >
                                    <FiMenu size={22} strokeWidth={2} />
                                </button>
                                <AnimatePresence>
                                    {headerMenuOpen && (
                                        <motion.div
                                            role="menu"
                                            aria-label={km.headerOptionsMenu}
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 z-[85] mt-2 w-[min(288px,calc(100vw-2rem))] rounded-2xl border border-white/[0.1] bg-[#0E1B2E] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06]"
                                        >
                                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4E6A88]">{km.idleChooseLang}</p>
                                            <div className="mb-3 flex flex-wrap gap-2">
                                                {(['de', 'tr', 'en'] as KioskLang[]).map((l) => (
                                                    <button
                                                        key={l}
                                                        type="button"
                                                        role="menuitem"
                                                        onClick={() => {
                                                            setLang(l);
                                                            setHeaderMenuOpen(false);
                                                        }}
                                                        className={`min-h-[44px] min-w-[52px] rounded-xl px-3 text-[12px] font-bold uppercase transition active:scale-95 ${
                                                            lang === l
                                                                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                                                                : 'bg-white/[0.06] text-[#8BA3C0] ring-1 ring-white/[0.06] hover:bg-white/[0.1]'
                                                        }`}
                                                    >
                                                        {l}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    openSettingsModal();
                                                    setHeaderMenuOpen(false);
                                                }}
                                                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-3 text-[13px] font-semibold text-[#F0F6FF] ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] active:scale-[0.99]"
                                            >
                                                <FiSettings size={18} className="text-emerald-400" />
                                                {km.settings}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <button
                                type="button"
                                onClick={goIdle}
                                title={km.exitSessionTitle}
                                aria-label={km.exitSessionTitle}
                                className="flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border-2 border-red-500/55 bg-red-500/[0.18] text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.2)] transition active:scale-95 hover:border-red-400/80 hover:bg-red-500/25 md:portrait:h-12 md:portrait:min-h-[48px] md:portrait:min-w-[48px]"
                            >
                                <FiX size={24} strokeWidth={2.5} />
                            </button>
                        </div>
                    </header>

                    {/* portrait tablet: sol kategori sütunu + ürün; yatay/telefon: üstte şerit */}
                    <div className="flex min-h-0 flex-1 flex-col md:portrait:flex-row md:portrait:items-stretch">
                        <div
                            className="hide-scrollbar kiosk-cat-scroll flex shrink-0 flex-row gap-2.5 overflow-x-auto overflow-y-hidden border-b border-white/[0.06] px-4 py-3 md:portrait:w-[min(220px,30vw)] md:portrait:min-w-[180px] md:portrait:max-w-[260px] md:portrait:flex-col md:portrait:gap-2.5 md:portrait:overflow-y-auto md:portrait:overflow-x-hidden md:portrait:border-b-0 md:portrait:border-r md:portrait:px-3 md:portrait:py-4"
                            style={{ background: 'linear-gradient(180deg, rgba(14,27,46,0.95) 0%, rgba(10,22,40,0.85) 100%)' }}
                        >
                            <p className="hidden shrink-0 md:portrait:block md:portrait:px-1 md:portrait:pb-1 md:portrait:text-[10px] md:portrait:font-bold md:portrait:uppercase md:portrait:tracking-[0.14em] md:portrait:text-[#4E6A88]">
                                {km.menuBrand}
                            </p>
                            <button
                                type="button"
                                onClick={() => setCatTab('all')}
                                className={`flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-semibold transition active:scale-[0.98] md:portrait:min-h-[88px] md:portrait:w-full md:portrait:flex-col md:portrait:gap-1.5 md:portrait:px-2 md:portrait:py-3 md:portrait:text-[13px] ${
                                    catTab === 'all'
                                        ? 'bg-emerald-500/[0.18] text-emerald-200 shadow-[inset_0_0_0_1.5px_rgba(16,185,129,0.45)]'
                                        : 'bg-white/[0.05] text-[#8BA3C0] ring-1 ring-white/[0.06] hover:bg-white/[0.08]'
                                }`}
                            >
                                <FiShoppingBag className="shrink-0 text-xl md:portrait:text-3xl" />
                                <span className="whitespace-nowrap md:portrait:text-center md:portrait:leading-snug md:portrait:line-clamp-2">
                                    {km.categoryAll}
                                </span>
                            </button>
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setCatTab(cat.id)}
                                    className={`flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-semibold transition active:scale-[0.98] md:portrait:min-h-[88px] md:portrait:w-full md:portrait:flex-col md:portrait:gap-1.5 md:portrait:px-2 md:portrait:py-3 md:portrait:text-[13px] ${
                                        catTab === cat.id
                                            ? 'bg-emerald-500/[0.18] text-emerald-200 shadow-[inset_0_0_0_1.5px_rgba(16,185,129,0.45)]'
                                            : 'bg-white/[0.05] text-[#8BA3C0] ring-1 ring-white/[0.06] hover:bg-white/[0.08]'
                                    }`}
                                >
                                    <CategoryIcon iconName={cat.icon} className="shrink-0 text-xl md:portrait:text-3xl" />
                                    <span className="whitespace-nowrap md:portrait:text-center md:portrait:leading-snug md:portrait:line-clamp-2">
                                        {cat.displayName}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* products — alt sabit menü + sepet paneli için boşluk */}
                        <main className="hide-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(4.25rem+max(0.5rem,env(safe-area-inset-bottom)))] md:portrait:px-6 md:portrait:py-4">
                            {ribbonProducts.length > 0 && catTab === 'all' && (
                                <div className="mb-5">
                                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                        {ribbonTitle}
                                    </p>
                                    <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:portrait:gap-2.5">
                                        {ribbonProducts.map((p) => (
                                            <button
                                                key={`s-${p.id}`}
                                                type="button"
                                                onClick={() => {
                                                    setDetailProduct(p);
                                                    setSelVariantId(p.variants[0]?.id ?? null);
                                                    setSelModIds(new Set());
                                                    setModalQty(1);
                                                }}
                                                className="group flex w-[118px] shrink-0 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] text-left transition active:scale-[0.98] hover:border-emerald-500/25 md:portrait:w-[132px]"
                                            >
                                                <div className="flex h-11 items-center justify-center bg-white/[0.02] text-lg md:portrait:h-12">
                                                    {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : '🍕'}
                                                </div>
                                                <div className="px-2 py-2">
                                                    <div className="line-clamp-2 text-[10px] font-medium leading-tight text-white/55">
                                                        {p.displayName}
                                                    </div>
                                                    <div className="mt-1.5 font-mono text-[13px] font-bold tabular-nums tracking-tight text-emerald-400 md:portrait:text-[15px]">
                                                        {money(Number(p.basePrice))}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2.5 md:portrait:grid-cols-2 md:portrait:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {filteredProducts.map((product) => {
                                    const price = Number(product.variants[0]?.price ?? product.basePrice);
                                    return (
                                        <div
                                            key={product.id}
                                            className="group flex w-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition hover:border-emerald-500/20"
                                        >
                                            <button
                                                type="button"
                                                className="relative flex h-[76px] w-full shrink-0 items-center justify-center overflow-hidden bg-white/[0.02] text-xl active:opacity-90 md:portrait:h-[84px]"
                                                onClick={() => {
                                                    setDetailProduct(product);
                                                    setSelVariantId(product.variants[0]?.id ?? null);
                                                    setSelModIds(new Set());
                                                    setModalQty(1);
                                                }}
                                            >
                                                {product.image ? (
                                                    <img
                                                        src={product.image}
                                                        alt=""
                                                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                                                    />
                                                ) : (
                                                    <span className="text-2xl opacity-25">🍕</span>
                                                )}
                                            </button>
                                            <div className="flex min-h-0 flex-1 flex-col items-center gap-0.5 px-2.5 pb-2.5 pt-2 text-center md:portrait:px-3 md:portrait:pb-3 md:portrait:pt-2.5">
                                                <h3 className="line-clamp-2 min-h-0 w-full text-[11px] font-medium leading-snug text-white/70 md:portrait:text-[12px]">
                                                    {product.displayName}
                                                </h3>
                                                {product.description && (
                                                    <p className="line-clamp-1 w-full text-[9px] leading-tight text-white/25">
                                                        {product.description}
                                                    </p>
                                                )}
                                                <div className="mt-2 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-white/[0.04] pt-2.5">
                                                    <span className="col-start-2 justify-self-center font-mono text-[20px] font-bold tabular-nums tracking-tight text-emerald-400 md:portrait:text-[24px]">
                                                        {money(price)}
                                                    </span>
                                                    <div className="col-start-3 flex justify-end">
                                                        <button
                                                            type="button"
                                                            className="flex h-9 min-h-[36px] w-9 min-w-[36px] shrink-0 items-center justify-center rounded-lg bg-emerald-500/85 text-lg font-semibold text-white transition active:scale-90 hover:bg-emerald-500 md:portrait:h-10 md:portrait:w-10 md:portrait:min-h-[40px] md:portrait:min-w-[40px]"
                                                            onClick={() => addToCart(product, product.variants[0]?.id, [])}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </main>
                    </div>
                </div>

                <AnimatePresence>
                    {cartOpen && (
                        <>
                            <motion.div
                                key="kiosk-cart-dim"
                                role="presentation"
                                className="fixed inset-0 z-[55] bg-black/55"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setCartOpen(false)}
                            />
                            <motion.div
                                key="kiosk-cart-sheet"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="kiosk-cart-title"
                                className="fixed left-0 right-0 z-[58] flex max-h-[min(78vh,560px)] flex-col overflow-hidden rounded-t-3xl border border-[#1E3A55] bg-[#112035] shadow-2xl"
                                style={{
                                    bottom: 'calc(3.5rem + max(0.5rem, env(safe-area-inset-bottom, 0px)))',
                                }}
                                initial={{ y: '105%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '105%' }}
                                transition={{ type: 'spring', damping: 30, stiffness: 340 }}
                            >
                                <div className="flex shrink-0 items-center gap-2 border-b border-[#1E3A55] px-4 py-3">
                                    <span id="kiosk-cart-title" className="flex-1 text-base font-bold">
                                        {km.cartTitle}
                                    </span>
                                    <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-emerald-500 px-2 text-xs font-bold text-white">
                                        {cart.reduce((s, l) => s + l.quantity, 0)}
                                    </span>
                                    <button
                                        type="button"
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A2F45] text-[#8BA3C0] active:scale-95"
                                        onClick={() => setCartOpen(false)}
                                    >
                                        <FiX size={22} />
                                    </button>
                                </div>
                                <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2">
                                    {cart.length === 0 ? (
                                        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 opacity-40">
                                            <FiShoppingBag size={40} />
                                            <span className="text-center text-xs text-[#8BA3C0]">{km.cartEmpty}</span>
                                        </div>
                                    ) : (
                                        cart.map((line) => (
                                            <div key={line.key} className="mb-2 flex gap-2 border-b border-[#1E3A55]/60 py-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[13px] font-semibold leading-tight">{line.productName}</div>
                                                    {(line.variantName || line.modifierLabel) && (
                                                        <div className="text-[10px] text-[#4E6A88]">
                                                            {[line.variantName, line.modifierLabel].filter(Boolean).join(' · ')}
                                                        </div>
                                                    )}
                                                    <div className="mt-1 font-mono text-xs font-bold text-emerald-400">
                                                        {money(line.unitPrice * line.quantity)}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <button
                                                        type="button"
                                                        className="flex h-10 min-h-[40px] w-10 min-w-[40px] items-center justify-center rounded-lg border border-[#1E3A55] bg-[#1A2F45] text-base font-bold active:scale-95"
                                                        onClick={() =>
                                                            setCart((prev) =>
                                                                prev
                                                                    .map((x) => (x.key === line.key ? { ...x, quantity: x.quantity + 1 } : x))
                                                                    .filter((x) => x.quantity > 0),
                                                            )
                                                        }
                                                    >
                                                        +
                                                    </button>
                                                    <span className="text-xs font-bold tabular-nums">{line.quantity}</span>
                                                    <button
                                                        type="button"
                                                        className="flex h-10 min-h-[40px] w-10 min-w-[40px] items-center justify-center rounded-lg border border-[#1E3A55] bg-[#1A2F45] text-base font-bold active:scale-95"
                                                        onClick={() =>
                                                            setCart((prev) =>
                                                                prev
                                                                    .map((x) => (x.key === line.key ? { ...x, quantity: x.quantity - 1 } : x))
                                                                    .filter((x) => x.quantity > 0),
                                                            )
                                                        }
                                                    >
                                                        −
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="shrink-0 border-t border-[#1E3A55] p-3">
                                    {cart.length > 0 && (
                                        <div className="mb-3 space-y-1 text-[12px] text-[#8BA3C0]">
                                            <div className="flex justify-between">
                                                <span>{km.subtotal}</span>
                                                <span className="font-mono text-[#F0F6FF]">{money(netTotal)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>{km.taxLine}</span>
                                                <span className="font-mono">{money(taxAmount)}</span>
                                            </div>
                                            <div className="flex justify-between border-t border-[#1E3A55] pt-2 text-sm font-bold text-[#F0F6FF]">
                                                <span>{km.total}</span>
                                                <span className="font-mono text-emerald-400">{money(cartTotal)}</span>
                                            </div>
                                        </div>
                                    )}
                                    <input
                                        className="mb-2 w-full rounded-lg border border-[#1E3A55] bg-[#1A2F45] px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                                        placeholder={km.guestNameShort}
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                    />
                                    <input
                                        className="mb-3 w-full rounded-lg border border-[#1E3A55] bg-[#1A2F45] px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                                        placeholder={km.notePlaceholder}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        disabled={cart.length === 0 || loading}
                                        onClick={() => {
                                            setCartOpen(false);
                                            setConfirmOpen(true);
                                        }}
                                        className="flex min-h-[52px] w-full items-center justify-between rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-bold text-white active:scale-[0.99] disabled:opacity-40"
                                    >
                                        <span>{km.sendToWaiterBtn}</span>
                                        <span className="font-mono">{money(cartTotal)}</span>
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                <nav
                    className="fixed bottom-0 left-0 right-0 z-[70] flex border-t border-[#1E3A55] bg-[#112035]/98 backdrop-blur-sm"
                    style={{
                        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                        paddingTop: '0.5rem',
                    }}
                >
                    <div className="mx-auto flex w-full max-w-2xl items-stretch gap-2 px-2 pb-0.5">
                        <button
                            type="button"
                            onClick={() => setCartOpen((o) => !o)}
                            className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-1 text-[11px] font-bold transition active:scale-[0.98] ${
                                cartOpen ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-[#1E3A55] bg-[#1A2F45] text-[#8BA3C0]'
                            }`}
                        >
                            <FiShoppingCart className="text-xl text-emerald-400" />
                            <span className="leading-tight">{km.cartTitle}</span>
                            {cart.reduce((s, l) => s + l.quantity, 0) > 0 && (
                                <span className="absolute right-2 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                                    {cart.reduce((s, l) => s + l.quantity, 0)}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleServiceRequest('waiter')}
                            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1E3A55] bg-[#1A2F45] px-2 py-1 text-[11px] font-bold text-[#8BA3C0] transition active:scale-[0.98] hover:border-emerald-500/40"
                        >
                            <FiBell className="text-xl text-emerald-500" />
                            <span className="text-center leading-tight">{km.bottomCallWaiter}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleServiceRequest('clean')}
                            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#1E3A55] bg-[#1A2F45] px-2 py-1 text-[11px] font-bold text-[#8BA3C0] transition active:scale-[0.98] hover:border-emerald-500/40"
                        >
                            <FiTrash2 className="text-xl text-emerald-500" />
                            <span className="text-center leading-tight">{km.bottomClean}</span>
                        </button>
                    </div>
                </nav>
                </>
            )}

            {/* Product detail modal */}
            <AnimatePresence>
                {detailProduct && (
                    <motion.div
                        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[3px] sm:items-center sm:p-4 md:p-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setDetailProduct(null)}
                    >
                        <motion.div
                            className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-[#0E1B2E] ring-1 ring-white/[0.08] sm:max-w-lg sm:rounded-[1.75rem] md:max-w-xl md:portrait:max-w-[min(94vw,42rem)] lg:max-w-2xl"
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* görsel */}
                            <div className="relative flex h-[clamp(88px,15vh,150px)] w-full shrink-0 items-center justify-center overflow-hidden bg-white/[0.03] sm:h-[clamp(96px,16vh,170px)] md:h-[clamp(100px,17vh,190px)] md:portrait:h-[clamp(92px,14vh,160px)]">
                                {detailProduct.image ? (
                                    <img src={detailProduct.image} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-4xl opacity-30 sm:text-5xl md:text-5xl">🍕</span>
                                )}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0E1B2E] to-transparent sm:h-12" />
                                <button
                                    type="button"
                                    onClick={() => setDetailProduct(null)}
                                    className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md active:scale-90 hover:text-white md:right-4 md:top-4 md:h-12 md:w-12"
                                >
                                    <FiX size={22} />
                                </button>
                            </div>

                            <div className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-1 md:px-7 md:pb-6 md:pt-2 md:portrait:px-8 md:portrait:pb-8">
                                {/* başlık + açıklama */}
                                <h3 className="-mt-2 text-lg font-bold leading-tight text-white md:text-xl md:portrait:text-2xl md:portrait:leading-snug">
                                    {detailProduct.displayName}
                                </h3>
                                {detailProduct.description && (
                                    <p className="mt-2 text-[12px] leading-relaxed text-white/45 md:text-[13px] md:portrait:text-[14px]">
                                        {detailProduct.description}
                                    </p>
                                )}

                                {/* boyut */}
                                {detailProduct.variants.length > 1 && (
                                    <div className="mt-4 md:mt-5">
                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4E6A88] md:portrait:text-[11px]">
                                            {km.sizeSelect}
                                        </p>
                                        <div className="grid grid-cols-3 gap-2 max-[560px]:grid-cols-1 sm:gap-2 md:gap-2.5 md:portrait:gap-3">
                                            {detailProduct.variants.map((v) => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => setSelVariantId(v.id)}
                                                    className={`flex min-h-[52px] flex-col items-start justify-center rounded-2xl px-4 py-3 text-left ring-2 transition active:scale-[0.98] md:min-h-[56px] md:px-5 md:py-3.5 md:portrait:min-h-[60px] md:portrait:py-4 ${
                                                        selVariantId === v.id
                                                            ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                                                            : 'bg-white/[0.05] text-white/75 ring-white/[0.08] hover:ring-white/15'
                                                    }`}
                                                >
                                                    <span className="text-[14px] font-semibold leading-snug md:text-[15px] md:portrait:text-[16px]">{v.name}</span>
                                                    <span className="mt-0.5 font-mono text-[13px] text-emerald-400 md:text-[14px] md:portrait:text-[15px]">
                                                        {money(Number(v.price))}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ekstralar */}
                                {detailProduct.modifiers.length > 0 && (
                                    <div className="mt-4 md:mt-5">
                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4E6A88] md:portrait:text-[11px]">
                                            {km.extras}
                                        </p>
                                        <div className="grid grid-cols-3 gap-2 max-[560px]:grid-cols-1 sm:gap-2 md:gap-2.5 md:portrait:gap-2.5">
                                            {detailProduct.modifiers.map((m) => (
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
                                                    className={`flex min-h-[48px] items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-left text-[13px] font-medium leading-snug ring-2 transition active:scale-[0.98] md:min-h-[52px] md:text-[14px] md:portrait:min-h-[54px] md:portrait:px-5 md:portrait:text-[15px] ${
                                                        selModIds.has(m.id)
                                                            ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/45'
                                                            : 'bg-white/[0.05] text-white/70 ring-white/[0.08] hover:ring-white/12'
                                                    }`}
                                                >
                                                    <span className="min-w-0 flex-1">{m.name}</span>
                                                    <span className="shrink-0 font-mono text-emerald-400/90">+{money(Number(m.price))}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* adet */}
                                <div className="mt-5 flex items-center justify-between md:mt-6">
                                    <span className="text-[13px] font-semibold text-white/50 md:text-[14px] md:portrait:text-[15px]">{km.qty}</span>
                                    <div className="flex items-center gap-4 md:gap-5">
                                        <button
                                            type="button"
                                            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-white/70 ring-2 ring-white/[0.1] active:scale-90 md:h-13 md:w-13 md:portrait:h-14 md:portrait:w-14"
                                            onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                                        >
                                            <FiMinus size={22} strokeWidth={2.5} />
                                        </button>
                                        <span className="min-w-[2.5ch] text-center text-2xl font-bold tabular-nums text-white md:text-3xl md:portrait:text-[2rem]">
                                            {modalQty}
                                        </span>
                                        <button
                                            type="button"
                                            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 active:scale-90 md:h-13 md:w-13 md:portrait:h-14 md:portrait:w-14"
                                            onClick={() => setModalQty((q) => q + 1)}
                                        >
                                            <FiPlus size={22} strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </div>

                                {/* CTA */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        addToCart(detailProduct, selVariantId ?? undefined, Array.from(selModIds), modalQty);
                                        setDetailProduct(null);
                                    }}
                                    className="mt-5 flex min-h-[54px] w-full items-center justify-between rounded-2xl bg-emerald-500 px-6 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_28px_rgba(16,185,129,0.35)] active:scale-[0.99] hover:bg-emerald-400 md:mt-6 md:min-h-[58px] md:text-[16px] md:portrait:min-h-[62px] md:portrait:py-4 md:portrait:text-[17px]"
                                >
                                    <span>{km.confirmAdd}</span>
                                    <span className="font-mono text-[15px] md:portrait:text-[17px]">
                                        {money(unitFor(detailProduct, selVariantId ?? undefined, Array.from(selModIds)) * modalQty)}
                                    </span>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirm */}
            <AnimatePresence>
                {confirmOpen && (
                    <motion.div
                        className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-5 backdrop-blur-[3px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-sm rounded-[1.5rem] bg-[#0E1B2E] p-5 text-center ring-1 ring-white/[0.08]"
                            initial={{ scale: 0.92, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.92, opacity: 0 }}
                        >
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">📋</div>
                            <h3 className="mb-1 text-[15px] font-bold text-white">{km.confTitle}</h3>
                            <p className="mb-3 text-[11px] text-white/40">{km.confSub}</p>
                            <div className="mb-4 max-h-36 overflow-y-auto rounded-xl bg-white/[0.04] p-2.5 text-left text-[11px] ring-1 ring-white/[0.05]">
                                {cart.map((c) => (
                                    <div key={c.key} className="flex justify-between gap-2 py-0.5 text-white/70">
                                        <span className="truncate">{c.productName} <span className="text-white/35">×{c.quantity}</span></span>
                                        <span className="shrink-0 font-mono text-white/50">{money(c.unitPrice * c.quantity)}</span>
                                    </div>
                                ))}
                                <div className="mt-1.5 flex justify-between border-t border-white/[0.06] pt-1.5 text-[12px] font-bold text-white">
                                    <span>{km.total}</span>
                                    <span className="font-mono text-emerald-400">{money(cartTotal)}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="flex-1 rounded-xl bg-white/[0.05] py-2.5 text-[12px] font-semibold text-white/50 ring-1 ring-white/[0.06] active:scale-[0.98]"
                                    onClick={() => setConfirmOpen(false)}
                                >
                                    {km.confCancel}
                                </button>
                                <button
                                    type="button"
                                    className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-[12px] font-bold text-white shadow-[0_4px_16px_rgba(16,185,129,0.25)] active:scale-[0.98] disabled:opacity-50"
                                    disabled={loading}
                                    onClick={() => void placeOrder()}
                                >
                                    {loading ? '…' : km.confOk}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Success */}
            <AnimatePresence>
                {successOpen && (
                    <motion.div
                        className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-5 backdrop-blur-[3px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-xs rounded-[1.5rem] bg-[#0E1B2E] p-8 text-center ring-1 ring-emerald-500/20"
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                        >
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                                <FiCheck className="text-3xl text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-bold text-emerald-400">{km.succTitle}</h3>
                            <p className="mt-1.5 text-[11px] text-white/40">{km.succSub}</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {settingsOpen && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]">
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-md rounded-3xl border border-[#1E3A55] bg-[#112035] p-6 shadow-2xl"
                    >
                        <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10">
                                <FiSettings className="text-emerald-400" size={22} />
                            </div>
                            <h3 className="text-lg font-bold text-white">{km.settingsModalTitle}</h3>
                        </div>
                        <p className="mb-5 text-sm leading-relaxed text-[#8BA3C0]">{km.settingsModalHint}</p>
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#4E6A88]">
                            {km.adminPinLabel}
                        </label>
                        <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            className="mb-2 w-full rounded-xl border border-[#1E3A55] bg-[#1A2F45] px-4 py-3 text-center text-2xl font-black tracking-[0.35em] text-[#F0F6FF] outline-none focus:border-emerald-500"
                            value={adminPin}
                            onChange={(e) => {
                                setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                                setSettingsPinErr(null);
                            }}
                            placeholder="••••••"
                        />
                        {settingsPinErr ? <p className="mb-2 text-sm font-semibold text-rose-400">{settingsPinErr}</p> : null}
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setSettingsOpen(false)}
                                className="rounded-xl border border-[#1E3A55] px-4 py-3 text-sm font-bold text-[#8BA3C0] hover:bg-[#1A2F45] sm:order-1"
                                disabled={settingsPinBusy}
                            >
                                {km.settingsCancel}
                            </button>
                            <button
                                type="button"
                                onClick={() => void verifyPinAndReset()}
                                disabled={settingsPinBusy}
                                className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50 sm:order-2"
                            >
                                {settingsPinBusy ? km.settingsPinBusy : km.settingsResetBtn}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
        </div>
    );
};

