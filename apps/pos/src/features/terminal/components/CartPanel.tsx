import React, { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiMinus, FiTrash2, FiX, FiSmartphone, FiNavigation, FiSend, FiCreditCard, FiDollarSign, FiShoppingBag, FiActivity, FiArrowRight, FiMaximize, FiPrinter, FiTag } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { SplitBillModal } from './SplitBillModal';
import { TransferItemModal } from './TransferItemModal';
import { CashPaymentModal } from './CashPaymentModal';
import { PinCodeModal } from './PinCodeModal';
import { ModernConfirmModal } from './ModernConfirmModal';
import { QrScannerModal } from '../../../components/pos/QrScannerModal';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

export const CartPanel: React.FC = () => {
    const [takeawayPhone, setTakeawayPhone] = useState('');
    const [orderNote, setOrderNote] = useState('');
    const [arrivalPayment, setArrivalPayment] = useState<'cash' | 'card' | 'online'>('cash');
    const [isPartialModalOpen, setIsPartialModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferTarget, setTransferTarget] = useState<any>(null);
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [isCardConfirmOpen, setIsCardConfirmOpen] = useState(false);
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [updateForm, setUpdateForm] = useState({ name: '', phone: '', email: '', address: '' });
    const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);
    const { t } = usePosLocale();
    
    const {
        cart, updateQty, clearCart, orderType, setOrderType,
        getCartTotal, submitRemoteOrder, submitOrderAndPay, selectedTable,
        fetchTables, couriers, orders, fetchOrders, tables, cancelTableSession,
        updateOrderStatus, checkoutTargetRemoteId,
        settings,
        lastKitchenSnapshot,
        lastReceiptSnapshot,
        reprintLastKitchenTicket,
        reprintLastReceipt,
        appliedCoupon, couponInput, setCouponInput, applyCoupon, removeCoupon,
        loyaltyRedeemPoints, setLoyaltyRedeemPoints,
    } = usePosStore();

    const { getAuthHeaders, billingWorkspace } = useAuthStore();
    const entitlementMap = useMemo(() => {
        const out: Record<string, boolean> = {};
        const list = billingWorkspace?.entitlements;
        if (Array.isArray(list)) {
            for (const e of list) {
                if (e?.code) out[String(e.code)] = Boolean(e.enabled);
            }
        }
        return out;
    }, [billingWorkspace]);
    const canUseCRM = entitlementMap.customer_crm !== false;

    const ui = useUIStore();
    const { 
        isCartOpen, setCartOpen, activeCustomer, setActiveCustomer,
        selectedCourier, setSelectedCourier, setEditingCartId, openProductModal 
    } = ui;

    const { lang } = usePosStore();
    const localizedTableName = selectedTable ? (selectedTable.translations?.[lang] || selectedTable.name) : '';

    const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);

    // Müşteri Arama Mantığı (Hızlı Satış)
    const handleCustomerSearch = async (term: string) => {
        setTakeawayPhone(term);
        if (!canUseCRM) {
            setCustomerSearchResults([]);
            return;
        }
        // Focus durumunda (boşken) veya 2 karakter ve üstünde ara
        if (term !== '' && term.length < 2) {
            setCustomerSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const res = await fetch(`/api/v1/customers/search?q=${term}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setCustomerSearchResults(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            toast.error('Müşteri araması yapılamadı. İnternet bağlantısını kontrol edin ve tekrar deneyin.');
        } finally {
            setIsSearching(false);
        }
    };

    const selectCustomer = (c: any) => {
        setActiveCustomer(c);
        setLoyaltyRedeemPoints(0);
        setTakeawayPhone(c.phone || c.name);
        setCustomerSearchResults([]);
    };

    const activeSessionOrders = selectedTable?.sessionId 
        ? orders.filter(o => Number(o.sessionId) === Number(selectedTable.sessionId) && o.status !== 'cancelled' && o.paymentStatus !== 'paid')
        : [];

    const currentTableObj = tables?.find(t => t.id === selectedTable?.id);
    const sessionTotal = currentTableObj && currentTableObj.total_amount != null
        ? Number(currentTableObj.total_amount)
        : activeSessionOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const cartTotals = getCartTotal();
    const { subtotal, tax, coupon_discount, loyalty_discount, final_total: cartPayable, total: cartGross } = cartTotals;
    const grandTotal = sessionTotal + cartPayable;
    const afterCouponForCap = Math.max(0, cartGross - (coupon_discount || 0));
    const maxLoyaltyPoints =
        activeCustomer?.id != null && Number(activeCustomer.reward_points) > 0
            ? Math.min(
                  Math.floor(Number(activeCustomer.reward_points)),
                  Math.ceil(afterCouponForCap * 10)
              )
            : 0;

    const currencySymbol = settings?.currency || '₺';
    const formatPrice = (price: number) => `${currencySymbol}${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const isPreparedTakeawayCartLocked = checkoutTargetRemoteId != null;
    const loadedOrder = orders.find(o => o.remoteId === checkoutTargetRemoteId);
    const isLoadedOrderPaid = checkoutTargetRemoteId != null && String(loadedOrder?.paymentStatus || '').toLowerCase() === 'paid';

    const startEditCartItem = (item: any) => {
        if (isPreparedTakeawayCartLocked) return;
        if (item.qty > 1) {
            updateQty(item.cartId, item.qty - 1);
            setEditingCartId(null);
        } else {
            setEditingCartId(item.cartId);
        }
        openProductModal(item.product);
    };

    useEffect(() => {
        if (selectedTable?.sessionId) {
            void fetchOrders();
        }
    }, [selectedTable?.sessionId, fetchOrders]);

    // Güncelleme modalı açıldığında form alanlarını mevcut aktif müşteri bilgileriyle doldur
    useEffect(() => {
        if (isUpdateModalOpen && activeCustomer) {
            setUpdateForm({
                name: activeCustomer.name || '',
                phone: activeCustomer.phone || '',
                email: activeCustomer.email || '',
                address: activeCustomer.address || '',
            });
        }
    }, [isUpdateModalOpen, activeCustomer]);

    const callerPaymentMethod = useUIStore(s => s.callerPaymentMethod);
    const setCallerPaymentMethod = useUIStore(s => s.setCallerPaymentMethod);

    useEffect(() => {
        if (callerPaymentMethod) {
            setArrivalPayment(callerPaymentMethod);
            setCallerPaymentMethod(null);
        }
    }, [callerPaymentMethod, setCallerPaymentMethod]);

    useEffect(() => {
        if (activeCustomer) {
            setTakeawayPhone(activeCustomer.phone || activeCustomer.name || '');
        } else {
            setTakeawayPhone('');
        }
    }, [activeCustomer]);

    return (
        <motion.aside 
            initial={false}
            animate={{ x: 0 }}
            className={`w-[90%] md:w-[400px] flex flex-col bg-[#020611] border-l border-white/[0.05] overflow-hidden transition-all duration-500 z-50 font-sans relative
            ${isCartOpen ? 'fixed inset-y-0 right-0 shadow-[0_0_100px_rgba(0,0,0,0.8)]' : 'hidden xl:flex relative'}
        `}>
            {/* Header Area - Ultra Minimal */}
            <div className="p-8 pb-4 flex flex-col gap-6 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                             <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">{t('cart.title')}</span>
                        </div>
                        <h2 className="text-xl font-black text-white italic tracking-tighter mt-1">
                            {selectedTable ? (
                                <div className="flex flex-col">
                                    <span>{localizedTableName}</span>
                                    {(selectedTable.customerName || selectedTable.guestName) && (
                                        <span className="text-xs text-emerald-500 not-italic font-bold uppercase tracking-widest leading-none mt-1">
                                            {selectedTable.customerName || selectedTable.guestName}
                                            {selectedTable.guestCount ? ` (${selectedTable.guestCount} ${t('cart.guestCount')})` : ''}
                                        </span>
                                    )}
                                </div>
                            ) : activeCustomer ? (
                                activeCustomer.name
                            ) : (
                                t('terminal.quickTerminal')
                            )}
                        </h2>
                    </div>
                    <div className="flex gap-2">
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                clearCart();
                                setActiveCustomer(null);
                                setTakeawayPhone('');
                            }} 
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/10 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                            type="button"
                            aria-label={t('cart.clear') || 'Sepeti temizle'}
                            title={t('cart.clear') || 'Sepeti temizle'}
                        >
                            <FiTrash2 size={16} />
                        </motion.button>
                        <motion.button 
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setCartOpen(false)} 
                            className="xl:hidden w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-white"
                            type="button"
                            aria-label={t('cart.close') || 'Kapat'}
                            title={t('cart.close') || 'Kapat'}
                        >
                            <FiX size={18} />
                        </motion.button>
                    </div>
                </div>

                {/* Order Type Switcher - Slimmed */}
                <div className="flex bg-white/5 p-1 rounded-xl">
                    {[
                        { id: 'dine_in', label: t('cart.dineIn'), icon: <FiShoppingBag size={12} /> },
                        { id: 'takeaway', label: t('cart.takeaway'), icon: <FiSmartphone size={12} /> },
                        { id: 'delivery', label: t('cart.delivery'), icon: <FiNavigation size={12} /> },
                    ].map((type) => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => setOrderType(type.id as any)}
                            className={`flex-1 py-1 text-[10px] font-bold tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${orderType === type.id ? 'bg-white/10 text-white shadow-xl' : 'text-white/30 hover:text-white/60'}`}>
                            {type.icon} <span>{type.label}</span>
                        </button>
                    ))}
                </div>

                {/* Contextual Fields */}
                <AnimatePresence mode="wait">
                    {(orderType === 'takeaway' || orderType === 'delivery') && (
                         <motion.div 
                            key={`${orderType}-fields`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3"
                        >
                            <div className="relative mt-2">
                                <FiSmartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                                <input
                                    type="text"
                                    value={takeawayPhone}
                                    onFocus={() => !takeawayPhone && handleCustomerSearch('')}
                                    onChange={(e) => handleCustomerSearch(e.target.value)}
                                    placeholder={canUseCRM ? t('cart.searchPlaceholder') : t('cart.customerPhone')}
                                    className={`w-full rounded-xl bg-white/5 border border-white/[0.05] pl-10 py-2.5 text-[10px] font-bold text-white focus:border-blue-500/40 outline-none transition-all placeholder:text-white/10 ${canUseCRM ? 'pr-12' : 'pr-4'}`}
                                />
                                {canUseCRM && (
                                    <button 
                                        type="button"
                                        onClick={() => setIsQrModalOpen(true)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-lg active:scale-90"
                                        aria-label="QR ile müşteri seç"
                                        title="QR ile müşteri seç"
                                    >
                                        <FiMaximize size={14} />
                                    </button>
                                )}
                                {isSearching && <div className="absolute right-12 top-1/2 -translate-y-1/2 w-3 h-3 border border-white/20 border-t-white rounded-full animate-spin" />}
                                
                                {/* Search Results Dropdown */}
                                {customerSearchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1220] border border-white/10 rounded-xl shadow-2xl z-[100] max-h-48 overflow-y-auto no-scrollbar py-2">
                                        {customerSearchResults.map(c => (
                                            <button 
                                                key={c.id} 
                                                type="button"
                                                onClick={() => selectCustomer(c)}
                                                className="w-full px-4 py-3 hover:bg-emerald-500/10 text-left flex flex-col gap-1 border-b border-white/[0.02] last:border-0 transition-colors"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-black text-white uppercase tracking-tight">{c.name}</span>
                                                    {c.customer_code && (
                                                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                            {c.customer_code}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-white/40">{c.phone}</span>
                                                    {c.reward_points > 0 && (
                                                        <span className="text-[10px] font-bold text-amber-500">★ {c.reward_points} {t('cart.rewardPoints')}</span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Seçili Müşteri ve Uyarı Banner'ları */}
                            {canUseCRM && activeCustomer && (
                                <div className="mt-3 space-y-2 animate-in slide-in-from-top duration-350">
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/[0.05] flex flex-col relative group">
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setActiveCustomer(null);
                                                setTakeawayPhone('');
                                            }}
                                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity animate-in fade-in"
                                            aria-label="Müşteriyi kaldır"
                                            title="Müşteriyi kaldır"
                                        >
                                            <FiX size={12} className="text-white/30 hover:text-rose-500" />
                                        </button>
                                        <p className="text-[10px] font-black text-white uppercase tracking-wider">{activeCustomer.name}</p>
                                        {activeCustomer.phone && <p className="text-[9px] font-bold text-white/50 mt-0.5">{activeCustomer.phone}</p>}
                                        {activeCustomer.email && <p className="text-[9px] font-bold text-white/50">{activeCustomer.email}</p>}
                                        {activeCustomer.address ? (
                                            <p className="text-[9px] font-medium text-white/40 line-clamp-2 italic mt-1 leading-snug">Adres: {activeCustomer.address}</p>
                                        ) : (
                                            <p className="text-[9px] font-bold text-rose-500 mt-1 uppercase tracking-wider">Adres Tanımlanmamış</p>
                                        )}
                                    </div>

                                    {/* Müşteri Onay Bekliyor Banner'ı */}
                                    {activeCustomer.status === 'pending' && (
                                        <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl flex items-center justify-between text-amber-400 animate-pulse">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-50 shrink-0" />
                                                <span className="text-[9px] font-black uppercase tracking-widest truncate">Müşteri Onay Bekliyor</span>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch(`/api/v1/customers/${activeCustomer.id}`, {
                                                            method: 'PATCH',
                                                            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ status: 'active' })
                                                        });
                                                        if (res.ok) {
                                                            const updated = await res.json();
                                                            setActiveCustomer(updated);
                                                            toast.success('Müşteri başarıyla onaylandı!');
                                                        }
                                                    } catch (err) {
                                                        toast.error('Onaylama hatası');
                                                    }
                                                }}
                                                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shrink-0"
                                            >
                                                Onayla
                                            </button>
                                        </div>
                                    )}

                                    {/* Eksik Bilgi Banner'ı (Sadece isim, telefon ve adres alanlarını kritik kabul ediyoruz; e-posta zorunlu değildir) */}
                                    {activeCustomer.status !== 'pending' && (!activeCustomer.phone || !activeCustomer.address) && (
                                        <div className="bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl flex items-center justify-between text-rose-400 animate-in slide-in-from-top duration-300">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                                                <span className="text-[9px] font-black uppercase tracking-widest truncate">
                                                    Eksik Bilgi: {[
                                                        !activeCustomer.phone && 'Telefon',
                                                        !activeCustomer.address && 'Adres'
                                                    ].filter(Boolean).join(', ')}
                                                </span>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => setIsUpdateModalOpen(true)}
                                                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shrink-0"
                                            >
                                                Güncelle
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {orderType === 'delivery' && (
                                <div className="space-y-3">
                                    <div className="relative">
                                        <select
                                            className="w-full bg-white/5 border border-white/[0.05] text-white/40 text-[9px] px-3 py-2 rounded-lg outline-none font-bold uppercase tracking-wider appearance-none"
                                            value={selectedCourier}
                                            onChange={(e) => setSelectedCourier(e.target.value)}
                                        >
                                            <option value="">{t('cart.courierAuto')}</option>
                                            {couriers.map((c) => (
                                                <option key={c.id} value={String(c.id)}>🛵 {c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold text-white/20 tracking-widest uppercase ml-1">{t('cart.paymentAtDoor')}</span>
                                        <div className="flex bg-white/5 p-0.5 rounded-lg gap-0.5">
                                            {(['cash', 'card', 'online'] as const).map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setArrivalPayment(m)}
                                                    className={`flex-1 py-1 text-[9px] font-black tracking-tighter rounded-md transition-all uppercase ${arrivalPayment === m ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' : 'text-white/20 border border-transparent hover:text-white/40'}`}
                                                >
                                                    {m === 'cash' ? t('cart.paymentMethod.cash') : m === 'card' ? t('cart.paymentMethod.card') : t('cart.paymentMethod.online')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="relative">
                                <input
                                    type="text"
                                    value={orderNote}
                                    onChange={(e) => setOrderNote(e.target.value)}
                                    placeholder={t('cart.notePlaceholder')}
                                    className="w-full rounded-lg bg-white/5 border border-white/[0.05] px-3 py-2 text-[9px] font-bold text-white focus:border-orange-500/40 outline-none transition-all placeholder:text-white/10 italic"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {checkoutTargetRemoteId != null && (
                    <div className={`p-4 rounded-2xl border backdrop-blur-md flex flex-col gap-1.5 mt-2 ${
                        isLoadedOrderPaid 
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 animate-pulse' 
                            : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                    }`}>
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Sipariş Durumu</span>
                            <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/10">
                                {isLoadedOrderPaid ? 'ÖDENDİ' : 'ÖDENMEDİ'}
                            </span>
                        </div>
                        <p className="text-[10px] font-bold">
                            {isLoadedOrderPaid 
                                ? 'Bu siparişin ödemesi daha önce alınmıştır. Sadece siparişi teslim edin.' 
                                : 'Bu sipariş henüz ödenmemiştir. Lütfen aşağıdan ödeme tipini seçerek adisyonu kapatın.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Cart Items Area - List Style */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-5 pt-0 space-y-4">
                {/* Session Items */}
                <AnimatePresence>
                    {activeSessionOrders.length > 0 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
                            <div className="text-[9px] font-bold text-white/10 uppercase tracking-[0.3em] mb-2">{t('cart.history')}</div>
                            {activeSessionOrders.flatMap(order => order.items).map((item: any, idx) => (
                                <div key={`hist-${idx}`} className="flex py-2 border-b border-white/[0.04] items-baseline opacity-70 hover:opacity-100 transition-opacity gap-2 group">
                                    <span className="text-[11px] font-black text-slate-500">{item.qty}×</span>
                                    <div className="flex-1 min-w-0 flex flex-col pt-[1px]">
                                        <p className="text-[10px] font-bold text-slate-300 uppercase truncate tracking-tight">{item.product.displayName}</p>
                                    </div>
                                    <div className="text-[11px] font-black text-slate-400 tabular-nums">
                                        {formatPrice(item.price * item.qty)}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTransferTarget({ id: Number(item.cartId.replace('api-', '')), productName: item.product.displayName, quantity: item.qty, price: item.price });
                                            setIsTransferModalOpen(true);
                                        }}
                                        className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center text-white/20 hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <FiArrowRight size={10} />
                                    </button>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* New Items */}
                <div className="space-y-1">
                    {cart.length > 0 && (
                        <div className="text-[9px] font-bold text-blue-500/40 uppercase tracking-[0.3em] mb-2">
                            {checkoutTargetRemoteId != null ? t('cart.loadedReadyItems') : t('cart.newItems')}
                        </div>
                    )}
                    
                    <AnimatePresence mode="popLayout" initial={false}>
                        {(cart.length === 0 && activeSessionOrders.length === 0) ? (
                            (orderType === 'dine_in' && !selectedTable) ? (
                                <div className="flex flex-col items-center justify-center py-10 opacity-40">
                                    <FiSmartphone size={30} className="mb-2 text-blue-400/50" />
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-center">{t('cart.selectTable') || 'Masa seçin'}</p>
                                </div>
                            ) : (orderType === 'dine_in' && selectedTable && !selectedTable.sessionId) ? (
                                <div className="flex flex-col items-center justify-center py-10 opacity-60">
                                    <FiShoppingBag size={30} className="mb-2 text-amber-500/50 animate-pulse" />
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-center text-amber-500/80">{t('cart.noActiveSession') || 'Masa Açılmamış'}</p>
                                    <p className="text-[8px] font-bold text-white/35 text-center mt-1 px-4 leading-normal">{t('cart.noActiveSessionDesc') || 'Lütfen sepeti doldurup siparişi göndererek masayı açın veya masa planından masayı başlatın.'}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 opacity-5">
                                    <FiShoppingBag size={30} className="mb-2" />
                                    <p className="text-[9px] font-bold uppercase tracking-widest">{t('cart.empty')}</p>
                                </div>
                            )
                        ) : (
                            cart.map((item) => (
                                <motion.div 
                                    layout
                                    key={item.cartId}
                                    initial={{ opacity: 0, filter: 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.95 }}
                                    className="group relative border-b border-white/[0.01] last:border-0 py-2 transition-all"
                                >
                                    <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-0.5 shrink-0 bg-[#0d1220]/50 border border-white/[0.05] p-0.5 rounded-md">
                                            <button 
                                            disabled={isPreparedTakeawayCartLocked}
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (isPreparedTakeawayCartLocked) return;
                                                updateQty(item.cartId, item.qty - 1); 
                                            }} 
                                            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                                isPreparedTakeawayCartLocked
                                                    ? 'text-white/10 cursor-not-allowed'
                                                    : 'hover:bg-rose-500/20 text-white/40 hover:text-rose-400'
                                            }`}
                                            >
                                                {item.qty === 1 ? <FiTrash2 size={10} /> : <FiMinus size={10} />}
                                            </button>
                                            <span className="text-[10px] font-black tabular-nums text-white w-4 text-center">{item.qty}</span>
                                            <button 
                                            disabled={isPreparedTakeawayCartLocked}
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (isPreparedTakeawayCartLocked) return;
                                                updateQty(item.cartId, item.qty + 1); 
                                            }} 
                                            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                                isPreparedTakeawayCartLocked
                                                    ? 'text-white/10 cursor-not-allowed'
                                                    : 'hover:bg-blue-500/20 text-blue-400 hover:text-blue-300'
                                            }`}
                                            >
                                                <FiPlus size={10} />
                                            </button>
                                        </div>

                                    <div
                                        className={`flex-1 min-w-0 flex flex-col pt-[1px] ${
                                            isPreparedTakeawayCartLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                        }`}
                                        onClick={() => startEditCartItem(item)}
                                        title={isPreparedTakeawayCartLocked ? t('cart.lockedPreparedHint') : undefined}
                                    >
                                            <p className="text-[11px] font-black text-slate-100 uppercase tracking-tight group-hover:text-blue-400 transition-colors truncate">
                                                {item.product.displayName}
                                            </p>
                                            {item.notes && <div className="text-[9px] text-amber-500 font-bold mt-0.5 uppercase tracking-wider truncate">✦ {item.notes}</div>}
                                        </div>

                                        <div className="text-right pl-2 shrink-0">
                                            <p className="text-[11px] font-black text-white tabular-nums tracking-tighter">{formatPrice(item.price * item.qty)}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Billing Section - Premium Minimal */}
            <div className="px-3 py-3 bg-[#04091a]/95 backdrop-blur-3xl border-t border-white/[0.05] space-y-2">
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-white/20">
                        <span>{t('cart.subtotal')}</span>
                        <span className="tabular-nums font-medium text-white/40">{formatPrice(subtotal + sessionTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-white/20">
                        <span>{t('cart.tax')} ({(settings?.taxRate || 19)}%)</span>
                        <span className="tabular-nums font-medium text-white/40">{formatPrice(tax)}</span>
                    </div>

                    {/* Kupon indirimi */}
                    {appliedCoupon ? (
                        <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-green-400">
                            <span className="flex items-center gap-1"><FiTag size={9} /> {appliedCoupon.description || 'Kupon'}</span>
                            <button type="button" onClick={() => removeCoupon()} className="text-white/30 hover:text-red-400 ml-2" aria-label="Kuponu kaldır" title="Kuponu kaldır"><FiX size={10} /></button>
                            <span className="tabular-nums font-medium text-green-400">-{formatPrice(appliedCoupon.discount_amount)}</span>
                        </div>
                    ) : (
                        <div className="flex gap-1 mt-1">
                            <input
                                type="text"
                                placeholder="Kupon kodu"
                                value={couponInput}
                                onChange={e => setCouponInput(e.target.value.toUpperCase())}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && couponInput.trim()) {
                                        void applyCoupon(couponInput.trim());
                                    }
                                }}
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[9px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 uppercase"
                                maxLength={20}
                            />
                            <button
                                onClick={() => { if (couponInput.trim()) void applyCoupon(couponInput.trim()); }}
                                className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 rounded-lg text-[9px] font-bold text-blue-400 flex items-center gap-1"
                            >
                                <FiTag size={9} /> Uygula
                            </button>
                        </div>
                    )}

                    {canUseCRM && activeCustomer?.id != null && maxLoyaltyPoints > 0 && cart.length > 0 && (
                        <div className="bg-gradient-to-br from-[#121824]/80 to-[#0e131f]/90 border border-amber-500/15 rounded-2xl p-4.5 space-y-3.5 backdrop-blur-md shadow-lg shadow-amber-950/5 mt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    {t('cart.loyaltyRedeem')}
                                </span>
                                <span className="text-[10px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                    ★ {activeCustomer.reward_points}
                                </span>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-wide">Kullanılacak Puan</span>
                                    <span className="text-sm font-black font-mono text-amber-400 flex items-baseline gap-1">
                                        {loyaltyRedeemPoints || 0}
                                        <span className="text-[9px] text-white/30 font-medium">/ {maxLoyaltyPoints}</span>
                                    </span>
                                </div>

                                <input
                                    type="range"
                                    min={0}
                                    max={maxLoyaltyPoints}
                                    value={loyaltyRedeemPoints || 0}
                                    onChange={(e) => {
                                        setLoyaltyRedeemPoints(Math.floor(Number(e.target.value)));
                                    }}
                                    className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 focus:outline-none transition-all"
                                />
                            </div>

                            <div className="flex justify-between items-center gap-2">
                                <div className="flex gap-1.5 flex-1">
                                    <button
                                        type="button"
                                        onClick={() => setLoyaltyRedeemPoints(Math.floor(maxLoyaltyPoints * 0.25))}
                                        className="flex-1 py-1.5 bg-amber-500/5 hover:bg-amber-500/10 active:scale-95 transition-all text-[9px] font-black text-amber-400 rounded-lg border border-amber-500/10 hover:border-amber-500/25"
                                    >
                                        %25
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLoyaltyRedeemPoints(Math.floor(maxLoyaltyPoints * 0.5))}
                                        className="flex-1 py-1.5 bg-amber-500/5 hover:bg-amber-500/10 active:scale-95 transition-all text-[9px] font-black text-amber-400 rounded-lg border border-amber-500/10 hover:border-amber-500/25"
                                    >
                                        %50
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLoyaltyRedeemPoints(maxLoyaltyPoints)}
                                        className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all text-[9px] font-black text-amber-300 rounded-lg border border-amber-500/20 hover:border-amber-500/40"
                                    >
                                        TAMAMI
                                    </button>
                                </div>

                                <div className="relative w-20">
                                    <input
                                        type="number"
                                        min={0}
                                        max={maxLoyaltyPoints}
                                        value={loyaltyRedeemPoints || ''}
                                        onChange={(e) => {
                                            const raw = Number(e.target.value);
                                            if (!Number.isFinite(raw) || raw <= 0) {
                                                setLoyaltyRedeemPoints(0);
                                                return;
                                            }
                                            setLoyaltyRedeemPoints(Math.min(maxLoyaltyPoints, Math.floor(raw)));
                                        }}
                                        placeholder="0"
                                        className="w-full bg-white/5 border border-white/10 focus:border-amber-500/45 focus:outline-none rounded-lg px-2 py-1.5 text-center text-[10px] font-bold font-mono text-white placeholder:text-white/20 transition-all"
                                    />
                                    {loyaltyRedeemPoints > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setLoyaltyRedeemPoints(0)}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-white/30 hover:text-red-400"
                                        >
                                            <FiX size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {loyalty_discount > 0 && (
                                <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[9px] font-extrabold uppercase tracking-widest text-amber-400 animate-fade-in">
                                    <span className="flex items-center gap-1">
                                        <FiTag size={9} /> {t('cart.loyaltyDiscount')}
                                    </span>
                                    <span className="tabular-nums font-mono text-[10px]">
                                        -{formatPrice(loyalty_discount)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-2 flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.3em] mb-0.5">{t('cart.payable')}</span>
                            <span className="text-3xl font-black text-white italic tracking-tighter tabular-nums">
                                {formatPrice(grandTotal)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    {isLoadedOrderPaid ? (
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={async () => {
                                const r = await updateOrderStatus(`ORD-${checkoutTargetRemoteId}`, 'delivered');
                                if (r.ok) {
                                    toast.success('Sipariş teslim edildi ve kapatıldı!');
                                    clearCart();
                                    setActiveCustomer(null);
                                    setCartOpen(false);
                                    void fetchTables();
                                } else {
                                    toast.error(r.error || 'İşlem başarısız oldu.');
                                }
                            }}
                            className="w-full h-12 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] shadow-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-all shadow-emerald-900/30"
                        >
                            SİPARİŞİ TESLİM ET & ADİSYONU KAPAT ✓
                        </motion.button>
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-1">
                                <motion.button
                                    disabled={grandTotal === 0} whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsCardConfirmOpen(true)}
                                    className={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group border shadow-lg ${
                                        grandTotal > 0 
                                            ? 'bg-blue-500/15 border-blue-500/40 text-blue-400 hover:bg-blue-500/25 shadow-blue-500/10' 
                                            : 'bg-white/5 border-white/5 text-white/20'
                                    }`}
                                >
                                    <FiCreditCard size={12} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">{t('cart.payCard')}</span>
                                </motion.button>
                                
                                <motion.button
                                    disabled={grandTotal === 0} whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsCashModalOpen(true)}
                                    className={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group border shadow-lg ${
                                        grandTotal > 0 
                                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 shadow-emerald-500/10' 
                                            : 'bg-white/5 border-white/5 text-white/20'
                                    }`}
                                >
                                    <FiDollarSign size={12} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">{t('cart.payCash')}</span>
                                </motion.button>
                                
                                <motion.button 
                                    disabled={(grandTotal === 0 && activeSessionOrders.length === 0) || !selectedTable?.sessionId} whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsPartialModalOpen(true)}
                                    className={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group border shadow-lg ${
                                        (grandTotal > 0 || activeSessionOrders.length > 0) && selectedTable?.sessionId
                                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25 shadow-amber-500/10' 
                                            : 'bg-white/5 border-white/5 text-white/20'
                                    }`}
                                >
                                    <FiActivity size={12} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">{t('cart.partial')}</span>
                                </motion.button>
                            </div>

                            <motion.button
                                disabled={cart.length === 0 || isPreparedTakeawayCartLocked}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    void (async () => {
                                        const r = await submitRemoteOrder({ 
                                            activeCustomer, 
                                            takeawayPhone: takeawayPhone || undefined, 
                                            courierId: orderType === 'delivery' && selectedCourier ? Number(selectedCourier) : undefined,
                                            paymentMethodArrival: orderType !== 'dine_in' ? arrivalPayment : undefined,
                                            notes: orderNote || undefined
                                        });
                                        if (r.ok) {
                                            if (r.queuedOffline) {
                                                toast.success(t('offline.toast.orderQueued'), { id: 'offline-order-queued' });
                                            } else {
                                                const tid = r.sessionId ? `order-sent-sess-${r.sessionId}` : (`order-notif-${r.orderId || 'generic'}`);
                                                toast.success(t('toast.orderSent'), { id: tid });
                                            }
                                            setCartOpen(false);
                                            setTakeawayPhone('');
                                            setOrderNote('');
                                            setActiveCustomer(null);
                                            void fetchTables();
                                        } else {
                                            toast.error(r.error === 'OFFLINE_LOCKED' ? t('offline.lock.blocked') : (r.error || t('toast.orderFailed')));
                                        }
                                    })();
                                }}
                                className={`w-full h-11 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-2xl text-white flex items-center justify-center gap-2 transition-all
                                    ${
                                        cart.length > 0 && !isPreparedTakeawayCartLocked
                                            ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'
                                            : 'bg-white/5 text-white/10 pointer-events-none'
                                    }
                                `}
                            >
                                <FiSend className="rotate-45" size={12} /> {t('cart.sendToKitchen')}
                            </motion.button>
                        </>
                    )}

                    {(lastKitchenSnapshot || lastReceiptSnapshot) && (
                        <div className="flex gap-2">
                            {lastKitchenSnapshot && settings?.integrations?.printStations?.reprintKitchenEnabled !== false && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        reprintLastKitchenTicket();
                                        toast.success(t('cart.reprintKitchen'), { duration: 2000 });
                                    }}
                                    disabled={isPreparedTakeawayCartLocked}
                                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-300 transition hover:bg-white/10
                                        ${
                                            isPreparedTakeawayCartLocked
                                                ? 'opacity-50 cursor-not-allowed pointer-events-none'
                                                : ''
                                        }`}
                                >
                                    <FiPrinter size={12} /> {t('cart.reprintKitchen')}
                                </button>
                            )}
                            {lastReceiptSnapshot && settings?.integrations?.printStations?.reprintReceiptEnabled !== false && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        reprintLastReceipt();
                                        toast.success(t('cart.reprintReceipt'), { duration: 2000 });
                                    }}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-300 transition hover:bg-white/10"
                                >
                                    <FiPrinter size={12} /> {t('cart.reprintReceipt')}
                                </button>
                            )}
                        </div>
                    )}

                    {selectedTable?.sessionId && (
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                                const hasItems = cart.length > 0 || activeSessionOrders.length > 0;
                                if (hasItems) {
                                    setIsPinModalOpen(true);
                                } else {
                                    setIsConfirmModalOpen(true);
                                }
                            }}
                            className="w-full h-10 rounded-lg font-black text-[9px] uppercase tracking-[0.2em] text-rose-500 border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
                        >
                            <FiX size={12} /> {t('cart.cancelFull')}
                        </motion.button>
                    )}
                    {!selectedTable?.sessionId && checkoutTargetRemoteId != null && (
                        <div className="flex gap-2 w-full">
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    clearCart();
                                    setActiveCustomer(null);
                                    setTakeawayPhone('');
                                    setOrderNote('');
                                    setCartOpen(false);
                                    toast.success('Yüklenen sipariş sepetten çıkarıldı.');
                                }}
                                className="flex-1 h-10 rounded-lg font-black text-[9px] uppercase tracking-[0.2em] text-slate-300 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                                <FiX size={12} /> VAZGEÇ (ADİSYONDAN ÇIK)
                            </motion.button>
                            
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setIsPinModalOpen(true)}
                                className="flex-1 h-10 rounded-lg font-black text-[9px] uppercase tracking-[0.2em] text-rose-500 border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                                <FiTrash2 size={12} /> {t('cart.cancelTakeawayOrder')}
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <PinCodeModal
                isOpen={isPinModalOpen}
                onClose={() => setIsPinModalOpen(false)}
                title={t('cart.adminPinTitle')}
                description={selectedTable?.sessionId ? t('cart.adminPinDesc') : t('cart.adminPinDescTakeaway')}
                showNotes={true}
                onSuccess={(pinCode, notes) => {
                    setIsPinModalOpen(false);
                    if (selectedTable?.id) {
                        void (async () => {
                            console.log('İptal Notu:', notes);
                            const r = await cancelTableSession(selectedTable.id);
                            if (r.ok) {
                                toast.success(t('cart.cancelSuccess'));
                                setCartOpen(false);
                            } else {
                                toast.error(r.error || 'İptal işlemi tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.');
                            }
                        })();
                    }
                    if (!selectedTable?.sessionId && checkoutTargetRemoteId != null) {
                        void (async () => {
                            const r = await updateOrderStatus(`ORD-${checkoutTargetRemoteId}`, 'cancelled', pinCode);
                            if (r.ok) {
                                toast.success(t('cart.cancelSuccess'));
                                clearCart();
                                setCartOpen(false);
                                setTakeawayPhone('');
                                setOrderNote('');
                                void fetchTables();
                                await fetchOrders();
                                return;
                            }
                            if (r.needsPin) {
                                toast.error(t('cart.adminPinDescTakeaway'));
                                return;
                            }
                            toast.error(r.error || 'İptal işlemi tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.');
                        })();
                    }
                }}
            />
            {selectedTable?.sessionId && isPartialModalOpen && (
                <SplitBillModal 
                    sessionId={selectedTable.sessionId!}
                    tableName={selectedTable.name}
                    onClose={() => setIsPartialModalOpen(false)}
                />
            )}
            {isTransferModalOpen && transferTarget && (
                <TransferItemModal isOpen={isTransferModalOpen} onClose={() => { setIsTransferModalOpen(false); setTransferTarget(null); }} item={transferTarget} tables={tables} />
            )}
            <CashPaymentModal
                isOpen={isCashModalOpen}
                onClose={() => setIsCashModalOpen(false)}
                totalAmount={grandTotal}
                tableName={selectedTable?.name}
                onConfirm={(receivedAmount) => {
                    setIsCashModalOpen(false);
                    void (async () => {
                        const r = await submitOrderAndPay('cash', { 
                            activeCustomer, 
                            takeawayPhone: takeawayPhone || undefined, 
                            courierId: orderType === 'delivery' && selectedCourier ? Number(selectedCourier) : undefined,
                            receivedAmount
                        });
                        if (r.ok) {
                            const change = receivedAmount - grandTotal;
                            const pid = r.sessionId ? `payment-succ-sess-${r.sessionId}` : (`payment-succ-${r.orderId || 'generic'}`);
                            if (r.queuedOffline) {
                                toast.success(t('offline.toast.paymentQueued'), { id: pid });
                            } else {
                                toast.success(`${t('toast.paymentSuccess')} ${change > 0 ? `— ${t('cash.change')}: ₺${change.toFixed(2)}` : ''}`, { id: pid });
                            }
                            setCartOpen(false);
                            setTakeawayPhone('');
                            void fetchTables();

                            const regMode = settings?.integrations?.callerId?.createCustomerMode;
                            const isNewCust = activeCustomer && (activeCustomer.id === 0 || !activeCustomer.id);
                            if (regMode === 'after_order' && isNewCust) {
                                setIsUpdateModalOpen(true);
                            }
                        } else {
                            toast.error(r.error === 'OFFLINE_LOCKED' ? t('offline.lock.blocked') : (r.error || t('toast.paymentFailed')));
                        }
                    })();
                }}
            />
            <ModernConfirmModal
                isOpen={isCardConfirmOpen}
                onClose={() => setIsCardConfirmOpen(false)}
                title={t('cart.payCardConfirmTitle')}
                description={t('cart.payCardConfirmDesc').replace('{{amount}}', formatPrice(grandTotal))}
                type="info"
                confirmText={t('cash.confirm')}
                cancelText="VAZGEÇ"
                onConfirm={() => {
                    void (async () => {
                        const r = await submitOrderAndPay('card', {
                            activeCustomer,
                            takeawayPhone: takeawayPhone || undefined,
                            courierId: orderType === 'delivery' && selectedCourier ? Number(selectedCourier) : undefined,
                        });
                        if (r.ok) {
                            if (r.queuedOffline) {
                                toast.success(t('offline.toast.paymentQueued'));
                            } else {
                                toast.success(t('toast.paymentSuccess'));
                            }
                            setCartOpen(false);
                            setTakeawayPhone('');
                            void fetchTables();

                            const regMode = settings?.integrations?.callerId?.createCustomerMode;
                            const isNewCust = activeCustomer && (activeCustomer.id === 0 || !activeCustomer.id);
                            if (regMode === 'after_order' && isNewCust) {
                                setIsUpdateModalOpen(true);
                            }
                        } else {
                            toast.error(r.error === 'OFFLINE_LOCKED' ? t('offline.lock.blocked') : (r.error || t('toast.paymentFailed')));
                        }
                    })();
                }}
            />
            <ModernConfirmModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                title={t('cart.cancelConfirmTitle')}
                description={t('cart.cancelConfirmDesc')}
                type="warning"
                onConfirm={() => {
                    if (selectedTable) {
                        void (async () => {
                            const r = await cancelTableSession(selectedTable.id);
                            if (r.ok) {
                                toast.success(t('cart.cancelSuccess'));
                                setCartOpen(false);
                            } else {
                                toast.error(r.error || 'Oturum kapatılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.');
                            }
                        })();
                    }
                }}
            />
            <QrScannerModal 
                isOpen={isQrModalOpen}
                onClose={() => setIsQrModalOpen(false)}
                onScan={(code) => handleCustomerSearch(code)}
            />

            {/* Eksik Bilgi Güncelleme Modalı */}
            {isUpdateModalOpen && activeCustomer && (
                <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-2xl z-[150] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#0f172a] border border-white/10 p-8 rounded-[32px] max-w-md w-full shadow-2xl relative"
                    >
                        <button 
                            type="button"
                            onClick={() => {
                                setIsUpdateModalOpen(false);
                                if (activeCustomer.id === 0) {
                                    setActiveCustomer(null);
                                }
                            }} 
                            className="absolute top-4 right-4 text-white/40 hover:text-white p-2 bg-white/5 rounded-full"
                        >
                            <FiX size={18} />
                        </button>
                        
                        <h3 className="text-lg font-black text-white mb-6 uppercase tracking-tight">
                            {activeCustomer.id === 0 ? 'YENİ MÜŞTERİ KAYDI' : 'MÜŞTERİ BİLGİLERİNİ GÜNCELLE'}
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Müşteri Adı</label>
                                <input 
                                    type="text" 
                                    value={updateForm.name} 
                                    onChange={(e) => setUpdateForm({ ...updateForm, name: e.target.value })}
                                    className="w-full mt-1 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl focus:border-blue-500 outline-none font-bold" 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Telefon Numarası</label>
                                <input 
                                    type="text" 
                                    value={updateForm.phone} 
                                    onChange={(e) => setUpdateForm({ ...updateForm, phone: e.target.value })}
                                    className="w-full mt-1 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl focus:border-blue-500 outline-none font-bold" 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">E-Posta Adresi</label>
                                <input 
                                    type="text" 
                                    value={updateForm.email} 
                                    onChange={(e) => setUpdateForm({ ...updateForm, email: e.target.value })}
                                    className="w-full mt-1 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl focus:border-blue-500 outline-none font-bold" 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Teslimat Adresi</label>
                                <textarea 
                                    value={updateForm.address} 
                                    onChange={(e) => setUpdateForm({ ...updateForm, address: e.target.value })}
                                    className="w-full mt-1 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl focus:border-blue-500 outline-none font-bold h-24 no-scrollbar resize-none" 
                                />
                            </div>
                            
                            <button
                                type="button"
                                disabled={isUpdatingCustomer || !updateForm.name}
                                onClick={async () => {
                                    setIsUpdatingCustomer(true);
                                    try {
                                        const isNew = activeCustomer.id === 0;
                                        const url = isNew ? '/api/v1/customers' : `/api/v1/customers/${activeCustomer.id}`;
                                        const method = isNew ? 'POST' : 'PATCH';
                                        const res = await fetch(url, {
                                            method,
                                            headers: {
                                                ...getAuthHeaders(),
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify(updateForm)
                                        });
                                        if (res.ok) {
                                            const updated = await res.json();
                                            if (isNew && cart.length === 0) {
                                                setActiveCustomer(null);
                                            } else {
                                                setActiveCustomer(updated);
                                            }
                                            toast.success(isNew ? 'Müşteri başarıyla kaydedildi!' : 'Müşteri bilgileri güncellendi!');
                                            setIsUpdateModalOpen(false);
                                        } else {
                                            toast.error(isNew ? 'Kayıt yapılamadı.' : 'Güncelleme yapılamadı.');
                                        }
                                    } catch {
                                        toast.error('Bağlantı hatası.');
                                    } finally {
                                        setIsUpdatingCustomer(false);
                                    }
                                }}
                                className="w-full h-12 mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                            >
                                {isUpdatingCustomer 
                                    ? (activeCustomer.id === 0 ? 'KAYDEDİLİYOR...' : 'GÜNCELLENİYOR...') 
                                    : (activeCustomer.id === 0 ? 'MÜŞTERİYİ KAYDET' : 'DEĞİŞİKLİKLERİ KAYDET')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.aside>
    );
};
