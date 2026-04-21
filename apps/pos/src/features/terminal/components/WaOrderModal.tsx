import React, { useState, useEffect } from 'react';
import { FiX, FiClock, FiMapPin, FiPhone, FiUser, FiShoppingCart, FiTrash2 } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa6';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';


export const WaOrderModal: React.FC = () => {
    const { setOrderType } = usePosStore();
    const { 
        showWaOrder, 
        setWaOrder, 
        setActiveCustomer, 
        setCartOpen, 
        isCartOpen, 
        whatsappOrders, 
        removeWhatsappOrder 
    } = useUIStore();
    const { t } = usePosLocale();
    const { token, tenantId } = useAuthStore();


    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [matchingCustomers, setMatchingCustomers] = useState<Record<string, any>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSavingCustomer, setIsSavingCustomer] = useState(false);

    const activeOrder = whatsappOrders.find(o => o.id === selectedOrderId) || whatsappOrders[0];

    useEffect(() => {
        if (showWaOrder && whatsappOrders.length > 0 && !selectedOrderId) {
            setSelectedOrderId(whatsappOrders[0].id);
        }
    }, [showWaOrder, whatsappOrders, selectedOrderId]);

    // Customer Lookup Logic
    useEffect(() => {
        whatsappOrders.forEach(order => {
            const phone = order.phone || order.sender;
            if (phone && !matchingCustomers[phone]) {
                const searchPhone = phone.replace(/\D/g, '').slice(-10); // Last 10 digits
                void fetch(`/api/v1/customers/search?q=${encodeURIComponent(searchPhone)}`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'x-tenant-id': tenantId || ''
                    }
                }).then(res => res.json())
                  .then(data => {
                      if (Array.isArray(data) && data.length > 0) {
                          setMatchingCustomers(prev => ({ ...prev, [phone]: data[0] }));
                      }
                  }).catch(() => {});
            }
        });
    }, [whatsappOrders, token, tenantId]);

    if (!showWaOrder) return null;

    const handleConfirm = async (order: any) => {
        setIsProcessing(true);
        try {
            const phone = order.phone || order.sender;
            const matched = matchingCustomers[phone];
            
            const customerData = {
                name: matched?.name || order.customerName || t('wa.customer_default'),
                phone: phone,
                address: order.address || matched?.address || ''
            };


            // Convert WA items to POS items
            // This assumes WA data has items in a compatible format or we need to map them
            // For now, let's assume we create a 'delivery' order directly
            
            setActiveCustomer(customerData);
            setOrderType('delivery');
            
            // If the order has items, we should ideally populate the cart
            // Since this is a "modal to cashier" flow, maybe we just set the customer and let the cashier pick items,
            // OR we auto-submit if the items are clear.
            // USER said "islemleri yapmaya basliyabilecegiz" (we can start doing the operations).
            
            // Let's remove from WA list after "confirming" (starting process)
            removeWhatsappOrder(order.id);
            setWaOrder(false);
            if (!isCartOpen) setCartOpen(true);
            
            // If there's more orders, maybe keep it open? 
            // The user said "liste modali acilacak", so maybe stay in modal?
            // But usually, you want to go to the terminal to actually punch in the items.
            
        } catch (e) {
            console.error(e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveCustomer = async (order: any) => {
        setIsSavingCustomer(true);
        try {
            const phone = order.phone || order.sender;
            const res = await fetch('/api/v1/customers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: order.customerName || t('wa.customer_default'),
                    phone: phone,
                    notes: `WhatsApp'tan otomatik kaydedildi. İlk sipariş: ${new Date().toLocaleDateString()}`
                })

            });

            if (res.ok) {
                const newCust = await res.json();
                setMatchingCustomers(prev => ({ ...prev, [phone]: newCust }));
            }
        } catch (e) {
            toast.error(t('wa.toast.save_error'));
        } finally {
            setIsSavingCustomer(false);
        }

    };

    return (
        <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-[#0f172a] border border-white/10 rounded-[40px] shadow-[0_0_100px_rgba(37,211,102,0.15)] max-w-5xl w-full h-[80vh] flex overflow-hidden relative"
            >
                {/* Close Button */}
                <button 
                    onClick={() => setWaOrder(false)}
                    className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500 transition-all z-20"
                >
                    <FiX size={24} />
                </button>

                {/* Left Side: Order List */}
                <div className="w-[380px] border-r border-white/5 flex flex-col bg-black/20">
                    <div className="p-8 border-b border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-2xl bg-[#25D366] flex items-center justify-center text-white shadow-lg shadow-[#25D366]/20">
                                <FaWhatsapp size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">{t('wa.title')}</h3>
                                <p className="text-[10px] font-bold text-[#25D366] uppercase tracking-[0.2em] leading-none">{t('wa.live_orders')}</p>
                            </div>

                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                        {whatsappOrders.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30">
                                <FaWhatsapp size={48} className="mb-4" />
                                <p className="font-bold text-sm">{t('wa.empty')}</p>
                            </div>
                        ) : (

                            whatsappOrders.map((order) => {
                                const phone = order.phone || order.sender;
                                const matched = matchingCustomers[phone];
                                const isActive = selectedOrderId === order.id;

                                return (
                                    <button
                                        key={order.id || `wa-${whatsappOrders.indexOf(order)}`}
                                        onClick={() => setSelectedOrderId(order.id)}
                                        className={`w-full p-5 rounded-3xl border transition-all text-left relative overflow-hidden group ${
                                            isActive 
                                                ? 'bg-[#25D366] border-[#25D366] shadow-xl shadow-[#25D366]/20' 
                                                : 'bg-white/5 border-white/5 hover:bg-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2 relative z-10">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-[#25D366]'} animate-pulse`} />
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                                                    {new Date(order.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {order.isEPayment && (
                                                <span className="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">E-ÖDEME</span>
                                            )}
                                        </div>
                                        <div className="relative z-10">
                                            <p className={`text-lg font-black leading-tight mb-1 truncate ${isActive ? 'text-white' : 'text-slate-200'}`}>
                                                {matched?.name || order.customerName || phone}
                                            </p>
                                            <p className={`text-xs font-bold ${isActive ? 'text-white/70' : 'text-slate-500'}`}>
                                                {matched ? t('wa.registered') : t('wa.new_message')}
                                            </p>

                                        </div>
                                        {isActive && (
                                            <motion.div layoutId="active-pill" className="absolute left-0 top-0 bottom-0 w-1 bg-white" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Side: Order Details */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/30">
                    <AnimatePresence mode="wait">
                        {activeOrder ? (
                            <motion.div 
                                key={activeOrder.id || 'fallback-wa-active'}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 flex flex-col p-10 overflow-hidden"
                            >
                                {/* Customer Info Header */}
                                <div className="flex items-start justify-between mb-10">
                                    <div className="flex gap-6 items-center">
                                        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white relative">
                                            {matchingCustomers[activeOrder.phone || activeOrder.sender] ? (
                                                <FiUser size={40} className="text-[#25D366]" />
                                            ) : (
                                                <FaWhatsapp size={40} className="text-white/20" />
                                            )}
                                            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-[#25D366] flex items-center justify-center text-white shadow-lg">
                                                <FaWhatsapp size={16} />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="px-2 py-0.5 rounded-md bg-[#25D366]/10 text-[#25D366] text-[10px] font-black tracking-widest uppercase">
                                                    {matchingCustomers[activeOrder.phone || activeOrder.sender] ? t('wa.registered_member') : t('wa.guest')}
                                                </span>
                                            </div>

                                            <h2 className="text-4xl font-black text-white tracking-tighter mb-2">
                                                {matchingCustomers[activeOrder.phone || activeOrder.sender]?.name || activeOrder.customerName || activeOrder.phone || activeOrder.sender}
                                            </h2>
                                            <div className="flex items-center gap-4 text-slate-400 font-bold text-sm">
                                                <div className="flex items-center gap-2">
                                                    <FiPhone className="text-[#25D366]" />
                                                    {activeOrder.phone || activeOrder.sender}
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-white/10" />
                                                <div className="flex items-center gap-2">
                                                    <FiClock className="text-blue-400" />
                                                    {new Date(activeOrder.receivedAt).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">{t('wa.amount')}</p>

                                        <p className="text-5xl font-black text-white tabular-nums tracking-tighter">
                                            €{activeOrder.total?.toFixed(2) || '0.00'}
                                        </p>
                                    </div>
                                </div>

                                {/* Content Grid */}
                                <div className="flex-1 grid grid-cols-2 gap-8 overflow-hidden">
                                    {/* Left Content: Items & Note */}
                                    <div className="flex flex-col gap-6 overflow-hidden">
                                        <div className="flex-1 bg-white/[0.03] border border-white/[0.05] rounded-[32px] p-8 overflow-y-auto no-scrollbar">
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">{t('wa.content')}</p>

                                            <div className="space-y-6">
                                                {activeOrder.items?.map((item: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-start">
                                                        <div className="flex gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-black text-[#25D366]">
                                                                {item.quantity}x
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-white">{item.name}</p>
                                                                {item.notes && <p className="text-xs text-slate-500 font-bold">{item.notes}</p>}
                                                            </div>
                                                        </div>
                                                        <p className="font-mono font-black text-white/60 text-sm">€{(item.price * item.quantity).toFixed(2)}</p>
                                                    </div>
                                                ))}
                                                {(!activeOrder.items || activeOrder.items.length === 0) && (
                                                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                                        <p className="text-xs font-bold text-amber-500">{t('wa.no_items_data')}</p>
                                                    </div>
                                                )}

                                            </div>
                                        </div>

                                        {activeOrder.note && (
                                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-[24px] p-6">
                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                    <FiClock /> {t('wa.customer_note')}
                                                </p>

                                                <p className="text-sm text-blue-100 font-medium italic">"{activeOrder.note}"</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Content: Address & Actions */}
                                    <div className="flex flex-col gap-6">
                                        <div className="bg-white/[0.03] border border-white/[0.05] rounded-[32px] p-8">
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">{t('wa.address')}</p>
                                            <div className="flex gap-4 items-start">
                                                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                                                    <FiMapPin size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-lg font-bold text-white leading-tight">
                                                        {activeOrder.address || matchingCustomers[activeOrder.phone || activeOrder.sender]?.address || t('wa.address_not_found')}
                                                    </p>
                                                    <button className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-4 hover:underline">{t('wa.show_map')}</button>
                                                </div>
                                            </div>
                                        </div>


                                        <div className="flex-1 flex flex-col justify-end gap-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <button 
                                                    onClick={() => removeWhatsappOrder(activeOrder.id)}
                                                    className="h-20 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-3xl font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-3"
                                                >
                                                    <FiTrash2 size={24} /> {t('wa.reject')}
                                                </button>

                                                <button 
                                                    disabled={isProcessing}
                                                    onClick={() => handleConfirm(activeOrder)}
                                                    className="h-20 bg-[#25D366] text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-[#25D366]/30 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                                >
                                                    {isProcessing ? (
                                                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <FiShoppingCart size={24} /> {t('wa.process')}
                                                        </>

                                                    )}
                                                </button>
                                            </div>
                                            
                                            {!matchingCustomers[activeOrder.phone || activeOrder.sender] && (
                                                <button 
                                                    disabled={isSavingCustomer}
                                                    onClick={() => handleSaveCustomer(activeOrder)}
                                                    className="w-full h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isSavingCustomer ? (
                                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <FiUser /> {t('wa.register_customer')}
                                                        </>
                                                    )}
                                                </button>

                                            )}

                                            <p className="text-[10px] text-center text-white/20 font-bold uppercase tracking-[0.4em]">
                                                {t('wa.footer_hint')}
                                            </p>

                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center opacity-20">
                                <FaWhatsapp size={120} />
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
