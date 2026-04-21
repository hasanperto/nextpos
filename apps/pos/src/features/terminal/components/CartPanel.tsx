import React, { useState, useEffect } from 'react';
import { FiPlus, FiMinus, FiTrash2, FiX, FiSmartphone, FiNavigation, FiSend, FiCreditCard, FiDollarSign, FiShoppingBag, FiActivity, FiArrowRight, FiMaximize, FiPrinter, FiTag } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { PartialPaymentModal } from './PartialPaymentModal';
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
    const { t } = usePosLocale();
    
    const {
        cart, updateQty, clearCart, orderType, setOrderType,
        getCartTotal, submitRemoteOrder, submitOrderAndPay, selectedTable,
        fetchTables, couriers, orders, fetchOrders, tables, cancelTableSession,
        settings,
        lastKitchenSnapshot,
        lastReceiptSnapshot,
        reprintLastKitchenTicket,
        reprintLastReceipt,
        appliedCoupon, couponInput, setCouponInput, applyCoupon, removeCoupon,
        loyaltyRedeemPoints, setLoyaltyRedeemPoints,
    } = usePosStore();

    const { getAuthHeaders } = useAuthStore();
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
        ? orders.filter(o => Number(o.sessionId) === Number(selectedTable.sessionId) && o.status !== 'cancelled')
        : [];

    const sessionTotal = activeSessionOrders.reduce((sum, o) => sum + (o.total || 0), 0);
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

    const startEditCartItem = (item: any) => {
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
                            className={`flex-1 py-1.5 text-[10px] font-bold tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${orderType === type.id ? 'bg-white/10 text-white shadow-xl' : 'text-white/30 hover:text-white/60'}`}>
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
                            className="space-y-4"
                        >
                            <div className="relative mt-2">
                                <FiSmartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                                <input
                                    type="text"
                                    value={takeawayPhone}
                                    onFocus={() => !takeawayPhone && handleCustomerSearch('')}
                                    onChange={(e) => handleCustomerSearch(e.target.value)}
                                    placeholder={t('cart.searchPlaceholder')}
                                    className="w-full rounded-xl bg-white/5 border border-white/[0.05] pl-10 pr-12 py-2.5 text-[10px] font-bold text-white focus:border-blue-500/40 outline-none transition-all placeholder:text-white/10"
                                />
                                <button 
                                    type="button"
                                    onClick={() => setIsQrModalOpen(true)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-lg active:scale-90"
                                    aria-label="QR ile müşteri seç"
                                    title="QR ile müşteri seç"
                                >
                                    <FiMaximize size={14} />
                                </button>
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

                            {orderType === 'delivery' && (
                                <div className="space-y-3">
                                    {activeCustomer && (
                                        <div className="bg-white/5 p-3 rounded-xl border border-white/[0.05] flex flex-col relative group">
                                            <button 
                                                type="button"
                                                onClick={() => setActiveCustomer(null)}
                                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Müşteriyi kaldır"
                                                title="Müşteriyi kaldır"
                                            >
                                                <FiX size={12} className="text-white/30 hover:text-rose-500" />
                                            </button>
                                            <p className="text-[10px] font-black text-white uppercase mb-0.5">{activeCustomer.name}</p>
                                            <p className="text-[10px] font-medium text-white/40 line-clamp-1 italic">{activeCustomer.address}</p>
                                        </div>
                                    )}
                                    <div className="relative">
                                        <select
                                            className="w-full bg-white/5 border border-white/[0.05] text-white/40 text-[10px] px-4 py-2.5 rounded-xl outline-none font-bold uppercase tracking-wider appearance-none"
                                            value={selectedCourier}
                                            onChange={(e) => setSelectedCourier(e.target.value)}
                                        >
                                            <option value="">{t('cart.courierAuto')}</option>
                                            {couriers.map((c) => (
                                                <option key={c.id} value={String(c.id)}>🛵 {c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <span className="text-[10px] font-bold text-white/20 tracking-widest uppercase ml-1">{t('cart.paymentAtDoor')}</span>
                                        <div className="flex bg-white/5 p-1 rounded-xl gap-1">
                                            {(['cash', 'card', 'online'] as const).map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setArrivalPayment(m)}
                                                    className={`flex-1 py-1.5 text-[10px] font-black tracking-tighter rounded-lg transition-all uppercase ${arrivalPayment === m ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' : 'text-white/20 border border-transparent hover:text-white/40'}`}
                                                >
                                                    {m === 'cash' ? t('cart.paymentMethod.cash') : m === 'card' ? t('cart.paymentMethod.card') : t('cart.paymentMethod.online')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="relative mt-2">
                                <input
                                    type="text"
                                    value={orderNote}
                                    onChange={(e) => setOrderNote(e.target.value)}
                                    placeholder={t('cart.notePlaceholder')}
                                    className="w-full rounded-xl bg-white/5 border border-white/[0.05] px-4 py-2 text-[10px] font-bold text-white focus:border-orange-500/40 outline-none transition-all placeholder:text-white/10 italic"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Cart Items Area - List Style */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-8 pt-0 space-y-6">
                {/* Session Items */}
                <AnimatePresence>
                    {activeSessionOrders.length > 0 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
                            <div className="text-[10px] font-bold text-white/10 uppercase tracking-[0.3em] mb-3">{t('cart.history')}</div>
                            {activeSessionOrders.flatMap(order => order.items).map((item: any, idx) => (
                                <div key={`hist-${idx}`} className="flex py-3 border-b border-white/[0.04] items-baseline opacity-70 hover:opacity-100 transition-opacity gap-3 group">
                                    <span className="text-[13px] font-black text-slate-500">{item.qty}×</span>
                                    <div className="flex-1 min-w-0 flex flex-col pt-[1px]">
                                        <p className="text-[12px] font-bold text-slate-300 uppercase truncate tracking-tight">{item.product.displayName}</p>
                                    </div>
                                    <div className="text-[13px] font-black text-slate-400 tabular-nums">
                                        {formatPrice(item.price * item.qty)}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTransferTarget({ id: Number(item.cartId.replace('api-', '')), productName: item.product.displayName, quantity: item.qty, price: item.price });
                                            setIsTransferModalOpen(true);
                                        }}
                                        className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-white/20 hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
                                        aria-label="Aktar"
                                        title="Aktar"
                                    >
                                        <FiArrowRight size={12} />
                                    </button>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* New Items */}
                <div className="space-y-1">
                    {cart.length > 0 && (
                        <div className="text-[10px] font-bold text-blue-500/40 uppercase tracking-[0.3em] mb-4">{t('cart.newItems')}</div>
                    )}
                    
                    <AnimatePresence mode="popLayout" initial={false}>
                        {!selectedTable ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-40">
                                <FiSmartphone size={40} className="mb-4 text-blue-400/50" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-center">{t('cart.selectTable') || 'Masa seçin'}</p>
                            </div>
                        ) : cart.length === 0 && activeSessionOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-5">
                                <FiShoppingBag size={40} className="mb-4" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">{t('cart.empty')}</p>
                            </div>
                        ) : (
                            cart.map((item) => (
                                <motion.div 
                                    layout
                                    key={item.cartId}
                                    initial={{ opacity: 0, filter: 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.95 }}
                                    className="group relative border-b border-white/[0.03] last:border-0 py-4 transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Inline Static Controls */}
                                        <div className="flex items-center gap-1 shrink-0 bg-[#0d1220]/50 border border-white/[0.05] p-0.5 rounded-lg">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); updateQty(item.cartId, item.qty - 1); }} 
                                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-500/20 text-white/40 hover:text-rose-400 transition-colors"
                                            >
                                                {item.qty === 1 ? <FiTrash2 size={12} /> : <FiMinus size={12} />}
                                            </button>
                                            <span className="text-[12px] font-black tabular-nums text-white w-4 text-center">{item.qty}</span>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); updateQty(item.cartId, item.qty + 1); }} 
                                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                <FiPlus size={12} />
                                            </button>
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col pt-[1px] cursor-pointer" onClick={() => startEditCartItem(item)}>
                                            <p className="text-[13px] font-black text-slate-100 uppercase tracking-tight group-hover:text-blue-400 transition-colors truncate">
                                                {item.product.displayName}
                                            </p>
                                            {item.notes && <div className="text-[10px] text-amber-500 font-bold mt-0.5 uppercase tracking-wider truncate">✦ {item.notes}</div>}
                                        </div>

                                        <div className="text-right pl-2 shrink-0">
                                            <p className="text-[14px] font-black text-white tabular-nums tracking-tighter">{formatPrice(item.price * item.qty)}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Billing Section - Premium Minimal */}
            <div className="px-8 py-10 bg-[#04091a]/80 backdrop-blur-3xl border-t border-white/[0.03] space-y-8">
                <div className="space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/20">
                        <span>{t('cart.subtotal')}</span>
                        <span className="tabular-nums font-medium text-white/40">{formatPrice(subtotal + sessionTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/20">
                        <span>{t('cart.tax')} ({(settings?.taxRate || 19)}%)</span>
                        <span className="tabular-nums font-medium text-white/40">{formatPrice(tax)}</span>
                    </div>

                    {/* Kupon indirimi */}
                    {appliedCoupon ? (
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-green-400">
                            <span className="flex items-center gap-1"><FiTag size={10} /> {appliedCoupon.description || 'Kupon'}</span>
                            <button type="button" onClick={() => removeCoupon()} className="text-white/30 hover:text-red-400 ml-2" aria-label="Kuponu kaldır" title="Kuponu kaldır"><FiX size={12} /></button>
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
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 uppercase"
                                maxLength={20}
                            />
                            <button
                                onClick={() => { if (couponInput.trim()) void applyCoupon(couponInput.trim()); }}
                                className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 rounded-lg text-[10px] font-bold text-blue-400 flex items-center gap-1"
                            >
                                <FiTag size={10} /> Uygula
                            </button>
                        </div>
                    )}

                    {activeCustomer?.id != null && maxLoyaltyPoints > 0 && cart.length > 0 && (
                        <div className="flex flex-col gap-2 mt-2">
                            <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">
                                {t('cart.loyaltyRedeem')} (★{activeCustomer.reward_points})
                            </span>
                            <div className="flex gap-2 items-center">
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
                                    placeholder={t('cart.loyaltyPointsPlaceholder')}
                                    className="flex-1 bg-white/5 border border-amber-500/20 rounded-lg px-3 py-2 text-[11px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50"
                                />
                                <span className="text-[10px] font-bold text-white/30 whitespace-nowrap">max {maxLoyaltyPoints}</span>
                            </div>
                        </div>
                    )}

                    {loyalty_discount > 0 && (
                        <div className="flex justify-between items-center text-[10px] font-bold tracking-widest text-amber-400">
                            <span>{t('cart.loyaltyDiscount')}</span>
                            <span className="tabular-nums">-{formatPrice(loyalty_discount)}</span>
                        </div>
                    )}

                    <div className="pt-4 flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.3em] mb-1">{t('cart.payable')}</span>
                            <span className="text-4xl font-black text-white italic tracking-tighter tabular-nums">
                                {formatPrice(grandTotal)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        <motion.button
                            disabled={grandTotal === 0} whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                setIsCardConfirmOpen(true);
                            }}
                            aria-label={t('cart.payCard')}
                            className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group border shadow-lg ${
                                grandTotal > 0 
                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-400 hover:bg-blue-500/25 shadow-blue-500/10' 
                                    : 'bg-white/5 border-white/5 text-white/20'
                            }`}
                        >
                            <FiCreditCard size={18} className="mb-0.5" />
                            <span className="text-xs font-black uppercase tracking-widest">{t('cart.payCard')}</span>
                        </motion.button>
                        
                        <motion.button
                            disabled={grandTotal === 0} whileTap={{ scale: 0.95 }}
                            onClick={() => setIsCashModalOpen(true)}
                            aria-label={t('cart.payCash')}
                            className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group border shadow-lg ${
                                grandTotal > 0 
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 shadow-emerald-500/10' 
                                    : 'bg-white/5 border-white/5 text-white/20'
                            }`}
                        >
                            <FiDollarSign size={18} className="mb-0.5" />
                            <span className="text-xs font-black uppercase tracking-widest">{t('cart.payCash')}</span>
                        </motion.button>
                        
                        <motion.button 
                            disabled={grandTotal === 0 || !selectedTable?.sessionId} whileTap={{ scale: 0.95 }}
                            onClick={() => setIsPartialModalOpen(true)}
                            aria-label={t('cart.partial')}
                            className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group border shadow-lg ${
                                grandTotal > 0 && selectedTable?.sessionId
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25 shadow-amber-500/10' 
                                    : 'bg-white/5 border-white/5 text-white/20'
                            }`}
                        >
                            <FiActivity size={18} className="mb-0.5" />
                            <span className="text-xs font-black uppercase tracking-widest">{t('cart.partial')}</span>
                        </motion.button>
                    </div>

                    <motion.button
                        disabled={cart.length === 0} whileTap={{ scale: 0.98 }}
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
                                    const tid = r.sessionId ? `order-sent-sess-${r.sessionId}` : (`order-notif-${r.orderId || 'generic'}`);
                                    toast.success(t('toast.orderSent'), { id: tid });
                                    setCartOpen(false);
                                    setTakeawayPhone('');
                                    setOrderNote('');
                                    // submitRemoteOrder already sets cart:[], selectedTable:null, cashierView:'floor'
                                    // but also explicitly fetch fresh data
                                    void fetchTables();
                                } else {
                                    toast.error(r.error || t('toast.orderFailed'));
                                }
                            })();
                        }}
                        className={`w-full h-14 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl text-white flex items-center justify-center gap-3 transition-all
                            ${cart.length > 0 ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40' : 'bg-white/5 text-white/10 pointer-events-none'}
                        `}
                    >
                        <FiSend className="rotate-45" size={16} /> {t('cart.sendToKitchen')}
                    </motion.button>

                    {(lastKitchenSnapshot || lastReceiptSnapshot) && (
                        <div className="flex gap-2">
                            {lastKitchenSnapshot && settings?.integrations?.printStations?.reprintKitchenEnabled !== false && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        reprintLastKitchenTicket();
                                        toast.success(t('cart.reprintKitchen'), { duration: 2000 });
                                    }}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 transition hover:bg-white/10"
                                >
                                    <FiPrinter size={14} /> {t('cart.reprintKitchen')}
                                </button>
                            )}
                            {lastReceiptSnapshot && settings?.integrations?.printStations?.reprintReceiptEnabled !== false && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        reprintLastReceipt();
                                        toast.success(t('cart.reprintReceipt'), { duration: 2000 });
                                    }}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 transition hover:bg-white/10"
                                >
                                    <FiPrinter size={14} /> {t('cart.reprintReceipt')}
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
                            className="w-full h-12 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] text-rose-500 border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
                        >
                            <FiX size={16} /> {t('cart.cancelFull')}
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Modals */}
            <PinCodeModal
                isOpen={isPinModalOpen}
                onClose={() => setIsPinModalOpen(false)}
                title={t('cart.adminPinTitle')}
                description={t('cart.adminPinDesc')}
                showNotes={true}
                onSuccess={(notes) => {
                    setIsPinModalOpen(false);
                    if (selectedTable) {
                        void (async () => {
                            // İleride backend'e notes da gönderilebilir
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
                }}
            />
            {selectedTable?.sessionId && isPartialModalOpen && (
                <PartialPaymentModal isOpen={isPartialModalOpen} onClose={() => setIsPartialModalOpen(false)} sessionId={selectedTable.sessionId!} totalAmount={grandTotal} tableName={selectedTable.name} />
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
                            toast.success(`${t('toast.paymentSuccess')} ${change > 0 ? `— ${t('cash.change')}: ₺${change.toFixed(2)}` : ''}`, { id: pid });
                            setCartOpen(false);
                            setTakeawayPhone('');
                            void fetchTables();
                        } else {
                            toast.error(r.error || t('toast.paymentFailed'));
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
                            toast.success(t('toast.paymentSuccess'));
                            setCartOpen(false);
                            setTakeawayPhone('');
                            void fetchTables();
                        } else {
                            toast.error(r.error || t('toast.paymentFailed'));
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
        </motion.aside>
    );
};
