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
    const { token, tenantId, getAuthHeaders } = useAuthStore();

    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [matchingCustomers, setMatchingCustomers] = useState<Record<string, any>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSavingCustomer, setIsSavingCustomer] = useState(false);

    // Chatbot Simulator States
    const [activeTab, setActiveTab] = useState<'list' | 'chat'>('list');
    const [chatState, setChatState] = useState<number>(0);
    const [chatInput, setChatInput] = useState<string>('');
    const [isBotTyping, setIsBotTyping] = useState<boolean>(false);
    const [simulatedCustomerPhone, setSimulatedCustomerPhone] = useState<string>('+90 532 987 65 43');
    const [chatMessages, setChatMessages] = useState<Array<{ sender: 'customer' | 'bot'; text: string; time: string }>>([
        { sender: 'bot', text: '🟢 NextPOS WhatsApp Sipariş Hattına Hoş Geldiniz! 👨‍🍳\n\nSize nasıl yardımcı olabilirim? (Örn: "Sipariş vermek istiyorum")', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);

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
                    headers: getAuthHeaders()
                }).then(res => res.json())
                  .then(data => {
                      if (Array.isArray(data) && data.length > 0) {
                          setMatchingCustomers(prev => ({ ...prev, [phone]: data[0] }));
                      }
                  }).catch(() => {});
            }
        });
    }, [whatsappOrders, getAuthHeaders]);

    const resetChat = () => {
        setChatState(0);
        setSimulatedCustomerPhone('+90 532 ' + Math.floor(Math.random() * 9000000 + 1000000));
        setChatMessages([
            { sender: 'bot', text: '🟢 NextPOS WhatsApp Sipariş Hattına Hoş Geldiniz! 👨‍🍳\n\nSize nasıl yardımcı olabilirim? (Örn: "Sipariş vermek istiyorum")', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
    };

    const handleSendMessage = (text: string) => {
        if (!text.trim()) return;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setChatMessages(prev => [...prev, { sender: 'customer', text, time: timeStr }]);
        setChatInput('');
        setIsBotTyping(true);

        setTimeout(() => {
            let botText = '';
            let nextState = chatState;
            const norm = text.toLowerCase().trim();

            if (chatState === 0) {
                if (norm.includes('sipariş') || norm.includes('merhaba') || norm.includes('yemek') || norm.includes('açım')) {
                    botText = 'Harika! 🍕 Lezzetli menümüzden sipariş oluşturmaya başlayabiliriz.\n\nMenümüzde popüler olanlar:\n🍔 Özel Next Burger (12.50 €)\n🍕 Sucuklu Pizza (14.00 €)\n🥤 Soğuk Kola (2.50 €)\n\nNe sipariş etmek istersiniz?';
                    nextState = 1;
                } else {
                    botText = 'Anlayamadım. 🤖 Sipariş vermek için lütfen "Sipariş vermek istiyorum" veya "Merhaba" yazın.';
                }
            } else if (chatState === 1) {
                botText = `Nefis! "${text}" siparişinizi sepetinize ekledim. 🛍️\n\nSiparişinizi teslim edebilmemiz için lütfen güncel teslimat adresinizi yazar mısınız?`;
                nextState = 2;
            } else if (chatState === 2) {
                botText = `Adresiniz başarıyla kaydedildi: 📍 "${text}"\n\nSipariş Toplamı: 24.50 €\n\nSiparişi tamamlayıp POS terminaline iletmemi onaylıyor musunuz? (Evet / Hayır)`;
                nextState = 3;
            } else if (chatState === 3) {
                if (norm.includes('evet') || norm.includes('onay') || norm.includes('yes') || norm.includes('ok')) {
                    botText = 'Siparişiniz başarıyla alındı! 🛵 POS panelinde "WhatsApp Siparişleri" sekmesine yeni sipariş düştü. Kasiyer onayından sonra mutfağa iletilecektir.\n\nBizi tercih ettiğiniz için teşekkür ederiz! Afiyet olsun! 👨‍🍳✨';
                    nextState = 4;

                    const { addWhatsappOrder } = useUIStore.getState();
                    addWhatsappOrder({
                        id: `wa-bot-${Date.now()}`,
                        phone: simulatedCustomerPhone,
                        customerName: 'AI Chatbot (Sanal)',
                        total: 24.50,
                        receivedAt: new Date().toISOString(),
                        items: [
                            { name: 'Özel Next Burger', price: 12.50, quantity: 1, notes: 'AI Sipariş' },
                            { name: 'Soğuk Kola', price: 2.50, quantity: 1 }
                        ],
                        address: text,
                        note: 'Chatbot ile otomatik oluşturuldu.'
                    });

                    toast.success('Chatbot siparişi POS paneline gönderildi!');
                } else {
                    botText = 'Siparişiniz iptal edildi. ❌ Yeni bir sipariş başlatmak için "Merhaba" yazabilirsiniz.';
                    nextState = 0;
                }
            } else {
                botText = 'Yeni bir sipariş başlatmak için lütfen "Sipariş vermek istiyorum" veya "Merhaba" yazın. 🌟';
                nextState = 0;
            }

            setChatMessages(prev => [...prev, { sender: 'bot', text: botText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            setChatState(nextState);
            setIsBotTyping(false);
        }, 1200);
    };

    const runAutoSimulation = () => {
        setChatState(0);
        const phone = '+90 532 ' + Math.floor(Math.random() * 9000000 + 1000000);
        setSimulatedCustomerPhone(phone);
        
        const t1 = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        setChatMessages([
            { sender: 'bot', text: '🟢 NextPOS WhatsApp Sipariş Hattına Hoş Geldiniz! 👨‍🍳\n\nSize nasıl yardımcı olabilirim? (Örn: "Sipariş vermek istiyorum")', time: t1 }
        ]);

        setTimeout(() => {
            setChatMessages(prev => [...prev, { sender: 'customer', text: 'Merhaba, sipariş vermek istiyorum.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            setIsBotTyping(true);
        }, 1500);

        setTimeout(() => {
            setIsBotTyping(false);
            setChatMessages(prev => [...prev, { sender: 'bot', text: 'Harika! 🍕 Lezzetli menümüzden sipariş oluşturmaya başlayabiliriz.\n\nMenümüzde popüler olanlar:\n🍔 Özel Next Burger (12.50 €)\n🍕 Sucuklu Pizza (14.00 €)\n🥤 Soğuk Kola (2.50 €)\n\nNe sipariş etmek istersiniz?', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        }, 3000);

        setTimeout(() => {
            setChatMessages(prev => [...prev, { sender: 'customer', text: '🍔 Özel Next Burger ve 🥤 Soğuk Kola alayım.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            setIsBotTyping(true);
        }, 5000);

        setTimeout(() => {
            setIsBotTyping(false);
            setChatMessages(prev => [...prev, { sender: 'bot', text: 'Nefis! 🍔 1x Özel Next Burger ve 🥤 1x Soğuk Kola sepetinize ekledim. 🛍️\n\nSiparişinizi teslim edebilmemiz için lütfen güncel teslimat adresinizi yazar mısınız?', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        }, 6500);

        setTimeout(() => {
            setChatMessages(prev => [...prev, { sender: 'customer', text: '📍 Şişli Halaskargazi Cd. No:82, Kat:3, İstanbul', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            setIsBotTyping(true);
        }, 8500);

        setTimeout(() => {
            setIsBotTyping(false);
            setChatMessages(prev => [...prev, { sender: 'bot', text: 'Adresiniz başarıyla kaydedildi: 📍 "Şişli Halaskargazi Cd. No:82, Kat:3, İstanbul"\n\nSipariş Toplamı: 15.00 €\n\nSiparişi tamamlayıp POS terminaline iletmemi onaylıyor musunuz? (Evet / Hayır)', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        }, 10000);

        setTimeout(() => {
            setChatMessages(prev => [...prev, { sender: 'customer', text: 'Evet, onaylıyorum! Teşekkürler.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            setIsBotTyping(true);
        }, 12000);

        setTimeout(() => {
            setIsBotTyping(false);
            setChatMessages(prev => [...prev, { sender: 'bot', text: 'Siparişiniz başarıyla alındı! 🛵 POS panelinde "WhatsApp Siparişleri" sekmesine yeni sipariş düştü. Kasiyer onayından sonra mutfağa iletilecektir.\n\nBizi tercih ettiğiniz için teşekkür ederiz! Afiyet olsun! 👨‍🍳✨', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            
            const { addWhatsappOrder } = useUIStore.getState();
            addWhatsappOrder({
                id: `wa-sim-${Date.now()}`,
                phone: phone,
                customerName: 'AI Chatbot (Simülasyon)',
                total: 15.00,
                receivedAt: new Date().toISOString(),
                items: [
                    { name: 'Özel Next Burger', price: 12.50, quantity: 1, notes: 'AI Sipariş' },
                    { name: 'Soğuk Kola', price: 2.50, quantity: 1 }
                ],
                address: 'Şişli Halaskargazi Cd. No:82, Kat:3, İstanbul',
                note: 'Yapay zeka chatbot simülasyonu ile otomatik oluşturuldu.'
            });

            toast.success('AI Chatbot Siparişi POS paneline iletildi! 🛵', {
                style: { background: '#25D366', color: '#fff', fontWeight: 'bold' }
            });
        }, 13500);
    };

    if (!showWaOrder) return null;

    const handleConfirm = async (order: any) => {
        setIsProcessing(true);
        try {
            const phone = order.phone || order.sender;
            const matched = matchingCustomers[phone];
            
            const customerData = {
                name: matched?.name || order.customerName || t('wa.customer_default'),
                phone: phone,
                address: order.address || matched?.address || '',
                source: 'whatsapp'
            };

            const { loadOrderToCart } = usePosStore.getState();
            await loadOrderToCart(order.id, order);

            setActiveCustomer(customerData);
            setOrderType('delivery');
            
            removeWhatsappOrder(order.id);
            setWaOrder(false);
            if (!isCartOpen) setCartOpen(true);
            
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
                    ...getAuthHeaders(),
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
                    className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500 transition-all z-20 cursor-pointer"
                >
                    <FiX size={24} />
                </button>

                {/* Left Side: Order List / Chat List */}
                <div className="w-[380px] border-r border-white/5 flex flex-col bg-black/20 shrink-0">
                    <div className="p-8 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-[#25D366] flex items-center justify-center text-white shadow-lg shadow-[#25D366]/20">
                                <FaWhatsapp size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">{t('wa.title')}</h3>
                                <p className="text-[10px] font-bold text-[#25D366] uppercase tracking-[0.2em] leading-none">{t('wa.live_orders')}</p>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-2xl border border-white/5 mt-4">
                            <button
                                type="button"
                                onClick={() => setActiveTab('list')}
                                className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    activeTab === 'list' 
                                        ? 'bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white shadow-md shadow-[#25D366]/20'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                Siparişler
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('chat')}
                                className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    activeTab === 'chat' 
                                        ? 'bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white shadow-md shadow-[#25D366]/20'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                AI Chatbot
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        {activeTab === 'list' ? (
                            <div className="p-4 space-y-3">
                                {whatsappOrders.length === 0 ? (
                                    <div className="h-full py-20 flex flex-col items-center justify-center text-center p-8 opacity-30">
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
                                                className={`w-full p-5 rounded-3xl border transition-all text-left relative overflow-hidden group cursor-pointer ${
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
                        ) : (
                            <div className="p-4 space-y-2">
                                <button
                                    type="button"
                                    className="w-full p-4 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 text-left relative overflow-hidden group flex items-center gap-3 cursor-pointer"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center text-white relative">
                                        <FaWhatsapp size={20} />
                                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#0b0f19] animate-pulse" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-black text-white truncate">🤖 Chatbot Asistanı</span>
                                            <span className="text-[9px] font-bold text-[#25D366] uppercase tracking-wider">ONLİNE</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400 block mt-0.5 truncate">
                                            {chatMessages[chatMessages.length - 1]?.text}
                                        </span>
                                    </div>
                                </button>
                                
                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3 mt-4 text-center">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                                        SİMÜLASYON KONTROLÜ
                                    </span>
                                    <button
                                        type="button"
                                        onClick={runAutoSimulation}
                                        className="w-full py-3 bg-[#25D366] hover:brightness-110 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-[#25D366]/20 transition-all cursor-pointer"
                                    >
                                        Auto-Simülasyon Başlat
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetChat}
                                        className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/70 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                    >
                                        Sohbeti Temizle
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Order Details or Live Chat */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/30">
                    <AnimatePresence mode="wait">
                        {activeTab === 'list' ? (
                            activeOrder ? (
                                <motion.div 
                                    key={activeOrder.id || 'fallback-wa-active'}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="flex-1 flex flex-col p-10 overflow-hidden"
                                >
                                    {/* Customer Info Header */}
                                    <div className="flex items-start justify-between mb-10 shrink-0">
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

                                                <h2 className="text-4xl font-black text-white tracking-tighter mb-2 truncate max-w-[400px]">
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
                                    <div className="flex-1 grid grid-cols-2 gap-8 overflow-hidden min-h-0">
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
                                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-[24px] p-6 shrink-0">
                                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                        <FiClock /> {t('wa.customer_note')}
                                                    </p>
                                                    <p className="text-sm text-blue-100 font-medium italic">"{activeOrder.note}"</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Right Content: Address & Actions */}
                                        <div className="flex flex-col gap-6 overflow-hidden">
                                            <div className="bg-white/[0.03] border border-white/[0.05] rounded-[32px] p-8 shrink-0">
                                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">{t('wa.address')}</p>
                                                <div className="flex gap-4 items-start">
                                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                                                        <FiMapPin size={24} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-lg font-bold text-white leading-tight break-words">
                                                            {activeOrder.address || matchingCustomers[activeOrder.phone || activeOrder.sender]?.address || t('wa.address_not_found')}
                                                        </p>
                                                        <button className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-4 hover:underline cursor-pointer">{t('wa.show_map')}</button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 flex flex-col justify-end gap-4 min-h-0">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <button 
                                                        onClick={() => removeWhatsappOrder(activeOrder.id)}
                                                        className="h-20 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-3xl font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-3 cursor-pointer"
                                                    >
                                                        <FiTrash2 size={24} /> {t('wa.reject')}
                                                    </button>

                                                    <button 
                                                        disabled={isProcessing}
                                                        onClick={() => handleConfirm(activeOrder)}
                                                        className="h-20 bg-[#25D366] text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-[#25D366]/30 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
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
                                                        className="w-full h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
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

                                                <p className="text-[10px] text-center text-white/20 font-bold uppercase tracking-[0.4em] shrink-0">
                                                    {t('wa.footer_hint')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center opacity-20 h-full">
                                    <FaWhatsapp size={120} />
                                </div>
                            )
                        ) : (
                            <motion.div 
                                key="chatbot-sim-chat"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex-1 flex flex-col h-full overflow-hidden"
                            >
                                {/* Chat Header */}
                                <div className="p-6 bg-slate-900/50 border-b border-white/5 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center text-[#25D366] relative">
                                            <FaWhatsapp size={24} />
                                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#0f172a] animate-pulse" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-white uppercase tracking-wider">NextPOS AI Chatbot</h4>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mt-0.5">Sanal Telefon: {simulatedCustomerPhone}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded-md uppercase tracking-wider">MÜŞTERİ BOT SİMÜLASYONU</span>
                                    </div>
                                </div>

                                {/* Chat Messages Area */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-[size:380px] bg-slate-950/90 no-scrollbar flex flex-col min-h-0">
                                    <div className="bg-slate-900/80 border border-white/5 py-2 px-4 rounded-xl text-[10px] font-black text-slate-400 text-center uppercase tracking-widest mx-auto mb-4 backdrop-blur-sm shrink-0">
                                        🔒 Uçtan Uca Yapay Zeka Sipariş Simülatörü
                                    </div>

                                    {chatMessages.map((msg, idx) => {
                                        const isBot = msg.sender === 'bot';
                                        return (
                                            <div 
                                                key={idx} 
                                                className={`max-w-[75%] p-4 rounded-3xl text-sm leading-relaxed shadow-lg relative shrink-0 ${
                                                    isBot 
                                                        ? 'bg-slate-900/90 text-white border border-white/5 rounded-tl-none self-start backdrop-blur-sm' 
                                                        : 'bg-[#056162] text-white rounded-tr-none self-end'
                                                }`}
                                            >
                                                <p className="whitespace-pre-line font-medium leading-relaxed">{msg.text}</p>
                                                <span className={`text-[8px] font-black tracking-wider uppercase block text-right mt-2 ${isBot ? 'text-slate-500' : 'text-white/40'}`}>
                                                    {msg.time}
                                                </span>
                                            </div>
                                        );
                                    })}

                                    {isBotTyping && (
                                        <div className="bg-slate-900/90 text-white border border-white/5 p-4 rounded-3xl rounded-tl-none self-start flex items-center gap-1.5 shadow-lg backdrop-blur-sm shrink-0">
                                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                                        </div>
                                    )}
                                </div>

                                {/* Chat Input Bar */}
                                <div className="p-4 bg-slate-900/50 border-t border-white/5 flex gap-3 items-center shrink-0">
                                    <input 
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSendMessage(chatInput);
                                        }}
                                        placeholder="Müşteri olarak chatbot ile sohbet edin... (Örn: 'Burger siparişi')"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#25D366]/50 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleSendMessage(chatInput)}
                                        className="w-14 h-14 bg-[#25D366] hover:brightness-110 active:scale-95 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-[#25D366]/20 transition-all shrink-0 cursor-pointer"
                                    >
                                        <FiShoppingCart size={22} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
