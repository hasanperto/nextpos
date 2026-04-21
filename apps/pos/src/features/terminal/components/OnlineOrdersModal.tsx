
import React, { useEffect, useState } from 'react';
import {
    FiX,
    FiCheck,
    FiInfo,
    FiTrash2,
    FiClock,
    FiMapPin,
    FiPhone,
    FiBell,
    FiUserPlus,
    FiAlertTriangle,
    FiShoppingCart,
} from 'react-icons/fi';
import { FaWhatsapp, FaGlobe } from 'react-icons/fa6';
import { useUIStore } from '../../../store/useUIStore';
import { usePosStore } from '../../../store/usePosStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';

function isDeliveryOrder(order: { order_type?: string } | null | undefined): boolean {
    return String(order?.order_type ?? '').toLowerCase() === 'delivery';
}

const CancelReasonModal = ({
    title,
    description,
    reason,
    setReason,
    onClose,
    onConfirm,
}: {
    title: string;
    description: string;
    reason: string;
    setReason: (v: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}) => {
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-2xl" onClick={onClose} />
            <div className="w-full max-w-lg rounded-[32px] bg-[var(--color-pos-bg-secondary)] border border-[var(--color-pos-border-default)] p-8 shadow-2xl relative">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
                        <p className="mt-2 text-sm font-bold text-white/60 leading-relaxed">{description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Kapat"
                        className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-all shrink-0"
                    >
                        <FiX size={18} className="mx-auto" />
                    </button>
                </div>

                <div className="space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/30">İptal nedeni</div>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={4}
                        placeholder="Örn: müşteri iptal etti / adres eksik / ürün yok"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white outline-none focus:border-rose-500/40 placeholder:text-white/20"
                    />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-14 rounded-2xl bg-white/5 text-white/80 font-black text-xs uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all"
                    >
                        Vazgeç
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-900/30 transition-all"
                    >
                        İptal et
                    </button>
                </div>
            </div>
        </div>
    );
};

export const OnlineOrdersModal: React.FC = () => {
    const {
        showOnlineOrders,
        setOnlineOrders,
        setPendingOnlineOrders,
        externalOrders,
        removeExternalOrder,
        setActiveCustomer,
        setCustomerModal,
        setCartOpen,
    } = useUIStore();

    const { t } = usePosLocale();

    
    const [orders, setOrders] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [provisionalSaving, setProvisionalSaving] = useState(false);
    const [provisionalPreview, setProvisionalPreview] = useState<{
        orderId: number;
        customer_code: string;
        memberQrPayload: string;
        pendingUntilConfirmed: boolean;
        alreadyActive: boolean;
    } | null>(null);
    const [pendingCourierId, setPendingCourierId] = useState<string>('');
    const [cancelModal, setCancelModal] = useState<null | { order: any; mode: 'cancel' | 'return' }>(null);
    const [cancelReason, setCancelReason] = useState('');

    function qrCodeImageUrl(payload: string): string {
        const enc = encodeURIComponent(payload);
        return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${enc}`;
    }

    const fetchOrders = async () => {
        setLoading(true);
        try {
            // Fetch multiple statuses to track lifecycle
            const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'shipped'];
            const resp = await fetch(`http://localhost:3001/api/v1/qr/external-orders?statuses=${statuses.join(',')}`, {
                headers: { 'x-tenant-id': 'a1111111-1111-4111-8111-111111111111' }
            });
            const dbOrders = await resp.json();
            // Merge with simulated orders from store, avoiding duplicates by id
            const combined = [...externalOrders];
            dbOrders.forEach((dbO: any) => {
                if (!combined.find(o => String(o.id) === String(dbO.id))) {
                    combined.push(dbO);
                }
            });

            setOrders(combined);

            if (combined.length > 0 && !selectedOrder) {
                setSelectedOrder(combined[0]);
            } else if (selectedOrder) {
                // Update currently selected order to see status changes
                const updatedSelected = combined.find((o: any) => o.id === selectedOrder.id);
                if (updatedSelected) setSelectedOrder(updatedSelected);
            }
            // Bekleyen sayısını toplam (simülasyon + DB) üzerinden canli tutmak onemli
            // Ancak useUIStore'daki pendingOnlineOrders zaten addExternalOrder ile artiyor.
            // Bu uyumsuzluğu gidermek için fetchOrders sonucunda store'u da sync edebiliriz.
            const pendingCount = combined.filter((o: any) => o.status === 'pending').length;
            setPendingOnlineOrders(pendingCount);

        } catch (err) {
            toast.error(t('b2b.toast.fetch_error'));
        } finally {
            setLoading(false);
        }

    };

    const { couriers, loadOrderToCart, fetchCouriers } = usePosStore();

    const handleAssignCourier = async (orderId: number, courierId: number) => {
        if (!Number.isFinite(courierId) || courierId < 1) return;

        setActionLoading(true);
        try {
            const resp = await fetch(`http://localhost:3001/api/v1/orders/${orderId}/assign-courier`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tenant-id': 'a1111111-1111-4111-8111-111111111111' 
                },
                body: JSON.stringify({ courierId })
            });
            if (resp.ok) {
                toast.success(t('b2b.toast.assign_success'));
                setPendingCourierId('');
                fetchOrders();
            }
        } catch (err) {
            toast.error(t('b2b.toast.assign_error'));
        } finally {
            setActionLoading(false);
        }

    };

    const handleUpdateStatus = async (orderId: number, status: string) => {
        setActionLoading(true);
        try {
            const resp = await fetch(`http://localhost:3001/api/v1/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tenant-id': 'a1111111-1111-4111-8111-111111111111' 
                },
                body: JSON.stringify({ status })
            });
            if (resp.ok) {
                if (status === 'ready') toast.success(t('b2b.toast.courier_notified'), { icon: '📢' });
                else toast.success(t('b2b.toast.status_updated'));
                fetchOrders();
            }
        } catch (err) {
            toast.error(t('kitchen.toast.error'));
        } finally {
            setActionLoading(false);
        }

    };

    const handleDeliveryComplete = async (orderId: number, status: 'completed' | 'cancelled', reason?: string) => {
        setActionLoading(true);
        try {
            const resp = await fetch(`http://localhost:3001/api/v1/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tenant-id': 'a1111111-1111-4111-8111-111111111111' 
                },
                body: JSON.stringify({ status, payment_status: status === 'completed' ? 'paid' : undefined, notes: reason })
            });
            if (resp.ok) {
                toast.success(status === 'completed' ? t('b2b.toast.delivery_success') : t('b2b.toast.cancelled'));
                fetchOrders();
            }
        } catch (err) {
            toast.error(t('b2b.toast.update_error'));
        } finally {
            setActionLoading(false);
        }

    };

    useEffect(() => {
        if (showOnlineOrders) {
            fetchOrders();
            void fetchCouriers();
        }
    }, [showOnlineOrders]);

    useEffect(() => {
        setPendingCourierId('');
    }, [selectedOrder?.id]);

    useEffect(() => {
        if (!provisionalPreview || !selectedOrder) return;
        if (Number(provisionalPreview.orderId) !== Number(selectedOrder.id)) {
            setProvisionalPreview(null);
        }
    }, [selectedOrder?.id, provisionalPreview?.orderId]);

    const handleConfirm = async (order: any) => {
        const isSim = String(order.id).includes('web-sim') || String(order.id).includes('ext-');
        
        if (isSim) {
            toast.success(t('b2b.toast.confirmed'));
            removeExternalOrder(order.id);
            fetchOrders();
            return;
        }

        setActionLoading(true);
        try {
            const resp = await fetch(`http://localhost:3001/api/v1/qr/external-orders/${order.id}/confirm`, {
                method: 'POST',
                headers: { 'x-tenant-id': 'a1111111-1111-4111-8111-111111111111' }
            });

            
            if (resp.ok) {
                toast.success(t('b2b.toast.confirmed'), { id: `ext-order-confirm-${order.id}` });
                // Eğer simülasyon siparişi ise store'dan kaldır
                if (String(order.id).includes('web-sim') || String(order.id).includes('ext-')) {
                    removeExternalOrder(order.id);
                }
                fetchOrders();

                // Opsiyonel: Kasiyer ekranında siparişi aktif yap
                // setOrderType(order.order_type);
                // setActiveCustomer({ name: order.customer_name, phone: order.customer_phone, address: order.delivery_address });
            }
        } catch (err) {
            toast.error(t('b2b.toast.confirm_error'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleAddCustomerFromOrder = async (order: any) => {
        const name = String(order.customer_name || '').trim() || t('b2b.customer_guest');
        const phone = String(order.customer_phone || '').trim();
        const address = String(order.delivery_address || '').trim();
        const isSim = String(order.id).includes('web-sim') || String(order.id).includes('ext-');

        if (isDeliveryOrder(order) && !address) {
            toast.error(t('b2b.provisional_address_required'));
            return;
        }

        if (isSim) {
            setActiveCustomer({
                name,
                phone,
                address,
                customerId: order.customer_id ?? undefined,
            });
            setOnlineOrders(false);
            setCustomerModal(true);
            toast.success(t('b2b.toast.customer_modal_opened'), { duration: 3500 });
            return;
        }

        setProvisionalSaving(true);
        try {
            const body =
                isDeliveryOrder(order) && address
                    ? { deliveryAddress: address }
                    : {};
            const resp = await fetch(`http://localhost:3001/api/v1/qr/external-orders/${order.id}/provisional-membership`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant-id': 'a1111111-1111-4111-8111-111111111111',
                },
                body: JSON.stringify(body),
            });
            let data: Record<string, unknown> = {};
            try {
                data = (await resp.json()) as Record<string, unknown>;
            } catch {
                /* ignore */
            }
            if (!resp.ok) {
                const errMsg = typeof data.error === 'string' ? data.error : t('b2b.toast.provisional_error');
                toast.error(errMsg);
                return;
            }

            const code = String(data.customer_code ?? '').trim();
            const payload = String(data.memberQrPayload ?? '').trim();
            const resName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : name;
            const resPhone = typeof data.phone === 'string' ? data.phone.trim() : phone;

            setActiveCustomer({
                name: resName,
                phone: resPhone,
                address,
                customerId: order.customer_id != null ? Number(order.customer_id) : undefined,
            });
            setProvisionalPreview({
                orderId: Number(order.id),
                customer_code: code,
                memberQrPayload: payload,
                pendingUntilConfirmed: Boolean(data.pendingUntilConfirmed),
                alreadyActive: Boolean(data.alreadyActive),
            });

            if (data.alreadyActive) {
                toast.success(t('b2b.toast.provisional_already_active'), { duration: 4000 });
            } else {
                toast.success(t('b2b.toast.provisional_saved'), { duration: 4500 });
            }
            void fetchOrders();
        } catch {
            toast.error(t('b2b.toast.provisional_error'));
        } finally {
            setProvisionalSaving(false);
        }
    };

    /** Paket siparişi kasa sepetine yükler; ödeme / tamamlama adisyonda yapılır */
    const handleDeliverToCart = async (order: any) => {
        const isSim = String(order.id).includes('web-sim') || String(order.id).includes('ext-');
        if (isSim) {
            toast.error(t('b2b.toast.deliver_cart_sim_unavailable'));
            return;
        }
        if (isDeliveryOrder(order) && !String(order.delivery_address || '').trim()) {
            toast.error(t('b2b.provisional_address_required'));
            return;
        }

        setActionLoading(true);
        try {
            const ok = await loadOrderToCart(String(order.id));
            if (!ok) {
                toast.error(t('b2b.toast.order_not_in_register'));
                return;
            }
            setActiveCustomer({
                name: String(order.customer_name || '').trim() || t('b2b.customer_guest'),
                phone: String(order.customer_phone || '').trim(),
                address: String(order.delivery_address || '').trim(),
                customerId: order.customer_id != null ? Number(order.customer_id) : undefined,
            });
            setOnlineOrders(false);
            setCartOpen(true);
            toast.success(t('b2b.toast.order_loaded_to_cart'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async (order: any, reason?: string) => {
        if (reason === undefined) {
            setCancelModal({ order, mode: 'cancel' });
            setCancelReason(t('b2b.cancel_default_reason'));
            return;
        }
        const cleanReason = String(reason).trim();
        if (!cleanReason) {
            toast.error(t('b2b.cancel_reason'));
            return;
        }

        const isSim = String(order.id).includes('web-sim') || String(order.id).includes('ext-');
        if (isSim) {
            toast.success(t('b2b.toast.cancelled'));
            removeExternalOrder(order.id);
            fetchOrders();
            return;
        }

        setActionLoading(true);
        try {
            await fetch(`http://localhost:3001/api/v1/qr/external-orders/${order.id}/cancel`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tenant-id': 'a1111111-1111-4111-8111-111111111111' 
                },
                body: JSON.stringify({ reason: cleanReason })
            });

            toast.success(t('b2b.toast.cancelled'));
            // Eğer simülasyon siparişi ise store'dan kaldır
            if (String(order.id).includes('web-sim') || String(order.id).includes('ext-')) {
                removeExternalOrder(order.id);
            }
            fetchOrders();

        } catch (err) {
            toast.error(t('b2b.toast.cancel_error'));
        } finally {
            setActionLoading(false);
        }
    };


    if (!showOnlineOrders) return null;

    const detailAddrRaw = String(selectedOrder?.delivery_address ?? '').trim();
    const detailIsDelivery = isDeliveryOrder(selectedOrder);
    const detailMissingDeliveryAddress = selectedOrder != null && detailIsDelivery && !detailAddrRaw;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <div className="bg-[var(--color-pos-bg-secondary)] rounded-[32px] border border-[var(--color-pos-border-default)] shadow-2xl w-full max-w-6xl h-[85vh] flex overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* SOL: Sipariş Listesi */}
                <div className="w-1/3 border-r border-[var(--color-pos-border-default)] flex flex-col bg-black/20">
                    <div className="p-6 border-b border-[var(--color-pos-border-default)] flex justify-between items-center bg-[var(--color-pos-bg-tertiary)]/50">
                        <h2 className="text-xl font-black text-white flex items-center gap-2">
                            <FiClock className="text-blue-500" /> {t('b2b.title')}
                        </h2>

                        {loading && <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {orders.length === 0 && !loading && (
                            <div className="text-center py-20 opacity-30">
                                <FiInfo size={48} className="mx-auto mb-4" />
                                <p className="font-bold">{t('b2b.empty')}</p>
                            </div>
                        )}

                        {orders.map((order) => (
                            <div 
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className={`p-4 rounded-2xl cursor-pointer transition-all border-2 ${
                                    selectedOrder?.id === order.id 
                                        ? 'bg-blue-600/20 border-blue-500 shadow-lg' 
                                        : 'bg-[var(--color-pos-bg-primary)] border-transparent hover:border-white/10'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="min-w-0 flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            {order.source === 'whatsapp' ? <FaWhatsapp className="text-[#25D366]" /> : <FaGlobe className="text-blue-400" />}
                                            <span className="truncate font-black text-white">{order.customer_name || 'Misafir'}</span>
                                        </div>
                                        <span
                                            className={`w-fit rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                                                isDeliveryOrder(order)
                                                    ? 'border border-violet-500/40 bg-violet-500/15 text-violet-300'
                                                    : 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                                            }`}
                                        >
                                            {isDeliveryOrder(order) ? t('cart.delivery') : t('cart.takeaway')}
                                        </span>
                                        {order.customer_membership_pending_pos ? (
                                            <span className="w-fit rounded-lg border border-fuchsia-500/45 bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-200">
                                                {t('b2b.membership_pending_badge')}
                                            </span>
                                        ) : null}
                                    </div>
                                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                                        order.status === 'pending' ? 'bg-amber-500 text-black' : 
                                        order.status === 'confirmed' ? 'bg-blue-500 text-white' :
                                        order.status === 'preparing' ? 'bg-teal-500 text-white' :
                                        order.status === 'ready' ? 'bg-emerald-500 text-white' :
                                        order.status === 'shipped' ? 'bg-purple-500 text-white' :
                                        'bg-slate-500 text-white'
                                    }`}>
                                        {order.status === 'pending' ? t('b2b.status.new') : 
                                         order.status === 'confirmed' ? t('b2b.status.confirmed') :
                                         order.status === 'preparing' ? t('b2b.status.preparing') :
                                         order.status === 'ready' ? t('b2b.status.ready') :
                                         order.status === 'shipped' ? t('b2b.status.shipped') :
                                         order.status}
                                    </span>

                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-[var(--color-pos-text-secondary)] font-bold">
                                    <span className="font-mono text-white/90">#{order.id}</span>
                                    <span>{order.items?.length || 0} {t('kitchen.items_count')}</span>
                                    <span>€{Number(order.total_amount).toFixed(2)}</span>
                                </div>

                            </div>
                        ))}
                    </div>
                </div>

                {/* SAĞ: Sipariş Detayı */}
                <div className="flex-1 flex flex-col relative">
                    <button 
                        onClick={() => setOnlineOrders(false)} 
                        className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all z-10"
                        type="button"
                        aria-label="Kapat"
                        title="Kapat"
                    >
                        <FiX size={24} />
                    </button>

                    {selectedOrder ? (
                        <div className="flex-1 flex flex-col p-8 overflow-y-auto">
                            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">{t('b2b.order_number')}</p>
                                        <p className="font-mono text-2xl font-black text-white">#{selectedOrder.id}</p>
                                    </div>
                                    <div
                                        className={`rounded-2xl border px-4 py-2.5 ${
                                            detailIsDelivery
                                                ? 'border-violet-500/35 bg-violet-500/10'
                                                : 'border-cyan-500/35 bg-cyan-500/10'
                                        }`}
                                    >
                                        <p
                                            className={`text-[10px] font-black uppercase tracking-widest ${
                                                detailIsDelivery ? 'text-violet-300/90' : 'text-cyan-300/90'
                                            }`}
                                        >
                                            {t('b2b.service_type')}
                                        </p>
                                        <p className={`text-lg font-black ${detailIsDelivery ? 'text-violet-200' : 'text-cyan-200'}`}>
                                            {detailIsDelivery ? t('cart.delivery') : t('cart.takeaway')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleAddCustomerFromOrder(selectedOrder)}
                                        disabled={
                                            provisionalSaving ||
                                            (detailIsDelivery && !detailAddrRaw)
                                        }
                                        title={
                                            detailIsDelivery && !detailAddrRaw
                                                ? t('b2b.provisional_address_required')
                                                : undefined
                                        }
                                        className="flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-black uppercase tracking-wide text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {provisionalSaving ? (
                                            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                                        ) : (
                                            <FiUserPlus size={20} />
                                        )}
                                        {t('b2b.add_new_customer')}
                                    </button>
                                </div>
                            </div>

                            {provisionalPreview &&
                                selectedOrder &&
                                Number(provisionalPreview.orderId) === Number(selectedOrder.id) && (
                                    <div className="mb-6 rounded-2xl border border-fuchsia-500/35 bg-fuchsia-950/25 p-5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-300/90">
                                            {t('b2b.provisional_title')}
                                        </p>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-fuchsia-100/95">
                                            {provisionalPreview.alreadyActive
                                                ? t('b2b.provisional_hint_active')
                                                : t('b2b.provisional_hint')}
                                        </p>
                                        <div className="mt-4 flex flex-wrap items-center gap-6">
                                            {provisionalPreview.memberQrPayload ? (
                                                <div className="rounded-xl border border-white/10 bg-white p-2">
                                                    <img
                                                        src={qrCodeImageUrl(provisionalPreview.memberQrPayload)}
                                                        alt=""
                                                        width={220}
                                                        height={220}
                                                        className="rounded-lg"
                                                    />
                                                </div>
                                            ) : null}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-black uppercase text-white/50">{t('b2b.order_number')}</p>
                                                <p className="font-mono text-xl font-black text-white">#{provisionalPreview.orderId}</p>
                                                <p className="mt-3 text-[10px] font-black uppercase text-white/50">
                                                    {t('b2b.provisional_code_label')}
                                                </p>
                                                <p className="break-all font-mono text-lg font-black text-emerald-300">
                                                    {provisionalPreview.customer_code || '—'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setCustomerModal(true)}
                                                className="rounded-xl border border-blue-500/40 bg-blue-600/20 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-blue-200 transition hover:bg-blue-600/35"
                                            >
                                                {t('b2b.open_customer_window')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setProvisionalPreview(null)}
                                                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10"
                                            >
                                                {t('b2b.provisional_dismiss')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`p-3 rounded-2xl ${selectedOrder.source === 'whatsapp' ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-blue-500/20 text-blue-500'}`}>
                                            {selectedOrder.source === 'whatsapp' ? <FaWhatsapp size={32} /> : <FaGlobe size={32} />}
                                        </div>
                                        <div>
                                            <h1 className="text-3xl font-black text-white">{selectedOrder.customer_name}</h1>
                                            <div className="flex gap-4 text-[var(--color-pos-text-secondary)] font-bold text-sm">
                                                <span className="flex items-center gap-1"><FiPhone /> {selectedOrder.customer_phone}</span>
                                                <span className="flex items-center gap-1 lowercase"><FiClock /> {new Date(selectedOrder.created_at).toLocaleTimeString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[var(--color-pos-text-secondary)] font-bold text-sm uppercase tracking-widest mb-1">{t('b2b.payment_status')}</p>
                                    <p className={`text-xl font-black ${selectedOrder.payment_status === 'paid' ? 'text-[var(--color-pos-success)]' : 'text-amber-500'}`}>
                                        {selectedOrder.payment_status === 'paid' ? t('b2b.payment.paid') : t('b2b.payment.at_door')}
                                    </p>
                                </div>

                            </div>

                            {detailMissingDeliveryAddress ? (
                                <div className="mb-6 flex gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                                    <FiAlertTriangle className="mt-0.5 shrink-0 text-2xl text-amber-400" />
                                    <div>
                                        <p className="font-black text-amber-200">{t('b2b.address_missing_title')}</p>
                                        <p className="mt-1 text-sm font-bold leading-relaxed text-amber-100/90">{t('b2b.address_missing_hint')}</p>
                                        <p className="mt-2 text-sm font-black text-white">{t('b2b.address_call_verify')}</p>
                                    </div>
                                </div>
                            ) : null}

                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div
                                    className={`rounded-2xl border p-5 ${
                                        detailMissingDeliveryAddress
                                            ? 'border-rose-500/40 bg-rose-500/10'
                                            : 'border-blue-500/20 bg-blue-600/10'
                                    }`}
                                >
                                    <p
                                        className={`font-black text-xs uppercase mb-3 flex items-center gap-2 ${
                                            detailMissingDeliveryAddress ? 'text-rose-400' : 'text-blue-400'
                                        }`}
                                    >
                                        <FiMapPin />{' '}
                                        {detailIsDelivery ? t('b2b.delivery_address') : t('b2b.takeaway_address_label')}
                                    </p>
                                    <p className="text-white font-bold leading-relaxed">
                                        {detailIsDelivery
                                            ? detailAddrRaw || t('b2b.address_empty')
                                            : detailAddrRaw || t('b2b.takeaway_address_na')}
                                    </p>
                                </div>
                                <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl">
                                    <p className="text-amber-500 font-black text-xs uppercase mb-3 flex items-center gap-2"><FiInfo /> {t('b2b.customer_note')}</p>
                                    <p className="text-white font-medium italic opacity-80">
                                        "{selectedOrder.notes || t('b2b.note_empty')}"
                                    </p>
                                </div>
                            </div>


                            <div className="bg-white/5 rounded-3xl p-6 border border-white/5 mb-8">
                                <h3 className="text-lg font-black text-white mb-4 border-b border-white/10 pb-4">{t('b2b.order_content')} ({selectedOrder.items?.length})</h3>

                                <div className="space-y-4">
                                    {selectedOrder.items?.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center">
                                            <div className="flex gap-4 items-center">
                                                <div className="bg-white/10 w-10 h-10 flex items-center justify-center rounded-xl font-black text-blue-400">{item.quantity}x</div>
                                                <div>
                                                    <p className="font-black text-white">{item.product_name}</p>
                                                    {item.modifiers && (
                                                        <p className="text-[12px] text-[var(--color-pos-text-secondary)]">
                                                            {(() => {
                                                                try {
                                                                    const parsed = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers;
                                                                    return Array.isArray(parsed) ? parsed.map((m: any) => m.name).join(', ') : '';
                                                                } catch (e) {
                                                                    return '';
                                                                }
                                                            })()}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="font-mono font-black text-lg text-white">€{Number(item.total_price).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
                                    <span className="text-xl font-black text-white">{t('b2b.total')}:</span>
                                    <span className="text-4xl font-mono font-black text-[var(--color-pos-success)]">€{Number(selectedOrder.total_amount).toFixed(2)}</span>
                                </div>

                            </div>

                            <div className="mt-auto flex flex-col gap-4">
                                {/* KURYE ATAMA (Eger siparis READY ve DELIVERY ise) */}
                                {selectedOrder.status === 'ready' && detailIsDelivery && (
                                    <div className="flex flex-col gap-4 rounded-2xl border border-blue-500/20 bg-blue-600/10 p-5 sm:flex-row sm:items-end">
                                        <div className="min-w-0 flex-1">
                                            <p className="mb-2 text-xs font-black uppercase text-blue-400">{t('b2b.courier_assign')}</p>
                                            <select
                                                className="w-full rounded-xl border border-white/10 bg-[var(--color-pos-bg-primary)] px-4 py-3 font-bold text-white"
                                                value={pendingCourierId}
                                                onChange={(e) => setPendingCourierId(e.target.value)}
                                            >
                                                <option value="">{t('b2b.courier_placeholder')}</option>
                                                {couriers.map((c) => (
                                                    <option key={c.id} value={String(c.id)}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {couriers.length === 0 ? (
                                                <p className="mt-2 text-xs font-bold text-amber-300/90">{t('b2b.courier_list_empty')}</p>
                                            ) : null}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={
                                                actionLoading || pendingCourierId === '' || couriers.length === 0
                                            }
                                            onClick={() =>
                                                void handleAssignCourier(selectedOrder.id, Number(pendingCourierId))
                                            }
                                            className="shrink-0 rounded-xl border border-blue-500/40 bg-blue-600 px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {t('b2b.courier_assign_btn')}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => void handleDeliverToCart(selectedOrder)}
                                            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/25 px-6 py-3 text-sm font-black uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <FiShoppingCart size={20} />
                                            {t('b2b.deliver_to_cart')}
                                        </button>
                                    </div>
                                )}

                                {/* TESLIMAT SONLANDIRMA (Eger siparis SHIPPED ise) */}
                                {selectedOrder.status === 'shipped' && detailIsDelivery && (
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => {
                                                setCancelModal({ order: selectedOrder, mode: 'return' });
                                                setCancelReason(t('b2b.return_default_reason'));
                                            }}
                                            className="px-8 py-5 rounded-2xl bg-rose-600/10 text-rose-500 border border-rose-500/20 font-bold hover:bg-rose-600 hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <FiTrash2 size={24} /> {t('b2b.return_cancel')}
                                        </button>
                                        <button 
                                            onClick={() => handleDeliveryComplete(selectedOrder.id, 'completed')}
                                            className="flex-1 py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xl transition-all flex justify-center items-center gap-3 shadow-xl shadow-emerald-500/20"
                                        >
                                            <FiCheck size={28} /> {t('b2b.delivered_paid')}
                                        </button>
                                    </div>
                                )}


                                {/* TEMEL AKSIYONLAR (Pending/Confirmed/Preparing) */}
                                {['pending', 'confirmed', 'preparing', 'ready'].includes(selectedOrder.status) && selectedOrder.status !== 'shipped' && (
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => handleCancel(selectedOrder)}
                                            disabled={actionLoading}
                                            className="px-8 py-5 rounded-2xl bg-white/5 hover:bg-rose-600/20 text-rose-500 border border-white/10 font-bold transition-all flex items-center gap-2"
                                        >
                                            <FiTrash2 size={24} /> {t('b2b.cancel')}
                                        </button>

                                        <button 
                                            onClick={() => handleConfirm(selectedOrder)}
                                            disabled={actionLoading || selectedOrder.status !== 'pending'}
                                            className={`flex-1 py-5 rounded-2xl font-black text-xl transition-all flex justify-center items-center gap-3 shadow-xl ${
                                                selectedOrder.status !== 'pending' 
                                                    ? 'bg-blue-600/20 text-blue-500 border border-blue-500/30'
                                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                                            }`}
                                        >
                                            <FiCheck size={28} /> 
                                            {selectedOrder.status === 'pending' && t('b2b.confirm_send')}
                                            {selectedOrder.status === 'confirmed' && t('b2b.status.at_kitchen_queue')}
                                            {selectedOrder.status === 'preparing' && t('b2b.status.at_kitchen_prep')}
                                            {selectedOrder.status === 'ready' && t('b2b.status.order_ready')}
                                        </button>

                                        {selectedOrder.status === 'ready' && detailIsDelivery && (
                                            <button 
                                                onClick={() => handleUpdateStatus(selectedOrder.id, 'ready')}
                                                className="px-10 py-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xl transition-all flex items-center gap-3 shadow-xl shadow-blue-500/20 animate-pulse"
                                            >
                                                <FiBell size={28} /> {t('b2b.call_courier')}
                                            </button>

                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center opacity-20">
                            <h2 className="text-2xl font-black italic">{t('b2b.select_detail')}</h2>
                        </div>

                    )}
                </div>
            </div>
            {cancelModal && (
                <CancelReasonModal
                    title={cancelModal.mode === 'return' ? t('b2b.return_cancel') : t('b2b.cancel')}
                    description={t('b2b.cancel_reason')}
                    reason={cancelReason}
                    setReason={setCancelReason}
                    onClose={() => {
                        setCancelModal(null);
                        setCancelReason('');
                    }}
                    onConfirm={() => {
                        const r = cancelReason.trim();
                        if (!r) {
                            toast.error(t('b2b.cancel_reason'));
                            return;
                        }
                        if (cancelModal.mode === 'return') {
                            void handleDeliveryComplete(cancelModal.order.id, 'cancelled', r);
                        } else {
                            void handleCancel(cancelModal.order, r);
                        }
                        setCancelModal(null);
                        setCancelReason('');
                    }}
                />
            )}
        </div>
    );
};
