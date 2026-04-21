import React, { useState, useEffect } from 'react';
import { FiPhoneCall, FiUser, FiMapPin, FiShoppingCart, FiX, FiClock, FiTrash2 } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosStore } from '../../../store/usePosStore';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';


export const CallerIdModal: React.FC = () => {
    const { setOrderType, settings, fetchSettings } = usePosStore();
    const { 
        showCallerId, 
        setCallerId, 
        setActiveCustomer, 
        setCartOpen, 
        isCartOpen, 
        recentCalls,
        removeRecentCall,
        callerIdData
    } = useUIStore();
    const { t } = usePosLocale();
    const { token, tenantId } = useAuthStore();

    const regMode = settings?.integrations?.callerId?.createCustomerMode || 'after';

    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [matchingCustomers, setMatchingCustomers] = useState<Record<string, any>>({});
    const [isSavingCustomer, setIsSavingCustomer] = useState(false);
    
    // Manual Registration Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', address: '', note: '' });

    const activeCall = recentCalls.find(c => c.number === selectedNumber) || (callerIdData ? { ...callerIdData } : recentCalls[0]);

    useEffect(() => {
        if (showCallerId) {
            void fetchSettings();
            if (!selectedNumber) {
                if (callerIdData) setSelectedNumber(callerIdData.number);
                else if (recentCalls.length > 0) setSelectedNumber(recentCalls[0].number);
            }
        }
    }, [showCallerId, callerIdData, recentCalls, selectedNumber, fetchSettings]);

    // Customer Lookup Logic for all recent calls
    useEffect(() => {
        recentCalls.forEach(call => {
            if (call.number && !matchingCustomers[call.number]) {
                const searchPhone = call.number.replace(/\D/g, '').slice(-10);
                void fetch(`/api/v1/customers/search?q=${encodeURIComponent(searchPhone)}`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'x-tenant-id': tenantId || ''
                    }
                }).then(res => res.json())
                  .then(data => {
                      if (Array.isArray(data) && data.length > 0) {
                          setMatchingCustomers(prev => ({ ...prev, [call.number]: data[0] }));
                      }
                  }).catch(() => {});
            }
        });
    }, [recentCalls, token, tenantId]);

    if (!showCallerId) return null;

    const handleAccept = (call: any) => {
        const matched = matchingCustomers[call.number];
        
        // If "Before Order" mode and no match, force registration form first
        if (regMode === 'before' && !matched && !isFormOpen) {
            setFormData({ name: call.name || '', address: call.address || '', note: '' });
            setIsFormOpen(true);
            return;
        }

        const customerData = {
            id: matched?.id || call.customerId,
            name: matched?.name || call.name || t('caller.unknown_customer'),
            phone: call.number,
            address: matched?.address || call.address || ''
        };


        setCallerId(false);
        setOrderType('delivery');
        setActiveCustomer(customerData);
        if (!isCartOpen && window.innerWidth < 1280) setCartOpen(true);
        removeRecentCall(call.number);
    };

    const handleSaveCustomer = async (call: any) => {
        setIsSavingCustomer(true);
        try {
            const res = await fetch('/api/v1/customers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: formData.name || call.name || t('wa.new_message'),
                    phone: call.number,
                    address: formData.address,
                    notes: `Aramadan kaydedildi. ${formData.note} - İlk görüşme: ${new Date().toLocaleDateString()}`
                })

            });

            if (res.ok) {
                const newCust = await res.json();
                setMatchingCustomers(prev => ({ ...prev, [call.number]: newCust }));
                setIsFormOpen(false);
                setFormData({ name: '', address: '', note: '' });
            }
        } catch (e) {
            toast.error(t('caller.toast.save_error'));
        } finally {
            setIsSavingCustomer(false);
        }

    };

    return (
        <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-[#0f172a] border border-white/10 rounded-[40px] shadow-[0_0_100px_rgba(16,185,129,0.15)] max-w-5xl w-full h-[80vh] flex overflow-hidden relative"
            >
                {/* Close Button */}
                <button 
                    onClick={() => setCallerId(false)}
                    className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500 transition-all z-20"
                >
                    <FiX size={24} />
                </button>

                {/* Left Side: Recent Calls List */}
                <div className="w-[380px] border-r border-white/5 flex flex-col bg-black/20">
                    <div className="p-8 border-b border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                <FiPhoneCall size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">{t('caller.title')}</h3>
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] leading-none">{t('caller.recent_calls')}</p>
                            </div>

                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                        {recentCalls.length === 0 && !callerIdData ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30">
                                <FiPhoneCall size={48} className="mb-4" />
                                <p className="font-bold text-sm">{t('caller.empty')}</p>
                            </div>
                        ) : (

                            recentCalls.map((call) => {
                                const matched = matchingCustomers[call.number];
                                const isActive = selectedNumber === call.number;

                                return (
                                    <button
                                        key={call.number || `call-${recentCalls.indexOf(call)}`}
                                        onClick={() => setSelectedNumber(call.number)}
                                        className={`w-full p-5 rounded-3xl border transition-all text-left relative overflow-hidden group ${
                                            isActive 
                                                ? 'bg-emerald-500 border-emerald-500 shadow-xl shadow-emerald-500/20' 
                                                : 'bg-white/5 border-white/5 hover:bg-white/10'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2 relative z-10">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'} animate-pulse`} />
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                                                    {call.receivedAt ? new Date(call.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('caller.live')}
                                                </span>
                                            </div>

                                        </div>
                                        <div className="relative z-10">
                                            <p className={`text-lg font-mono font-black leading-tight mb-1 truncate ${isActive ? 'text-white' : 'text-slate-200'}`}>
                                                {call.number}
                                            </p>
                                            <p className={`text-xs font-bold truncate ${isActive ? 'text-white/70' : 'text-slate-500'}`}>
                                                {matched?.name || call.name || t('caller.unknown_customer')}
                                            </p>

                                        </div>
                                        {isActive && (
                                            <motion.div layoutId="active-pill-call" className="absolute left-0 top-0 bottom-0 w-1 bg-white" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Side: Call Details */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/30">
                    <AnimatePresence mode="wait">
                        {activeCall ? (
                            <motion.div 
                                key={activeCall.number || 'fallback-active-call'}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 flex flex-col p-10 overflow-hidden"
                            >
                                {/* Customer Info Header */}
                                <div className="flex items-start justify-between mb-10">
                                    <div className="flex gap-6 items-center">
                                        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white relative">
                                            {matchingCustomers[activeCall.number] || activeCall.customerId ? (
                                                <FiUser size={40} className="text-emerald-500" />
                                            ) : (
                                                <FiPhoneCall size={40} className="text-white/20" />
                                            )}
                                            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg">
                                                <FiPhoneCall size={16} />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest uppercase ${
                                                    (matchingCustomers[activeCall.number] || activeCall.customerId) 
                                                        ? 'bg-emerald-500/10 text-emerald-500' 
                                                        : 'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                    {(matchingCustomers[activeCall.number] || activeCall.customerId) ? t('caller.registered') : t('caller.new_caller')}
                                                </span>
                                            </div>

                                            <h2 className="text-5xl font-mono font-black text-white tracking-tighter mb-2">
                                                {activeCall.number}
                                            </h2>
                                            <div className="flex items-center gap-4 text-slate-400 font-bold text-sm">
                                                <div className="flex items-center gap-2">
                                                    <FiUser className="text-emerald-500" />
                                                    {matchingCustomers[activeCall.number]?.name || activeCall.name || t('caller.unknown_customer')}
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-white/10" />
                                                <div className="flex items-center gap-2">
                                                    <FiClock className="text-blue-400" />
                                                    {activeCall.receivedAt ? new Date(activeCall.receivedAt).toLocaleTimeString() : t('caller.now')}
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Content Grid */}
                                <div className="flex-1 grid grid-cols-2 gap-8 overflow-hidden">
                                    {/* Left Content: Stats? / Last Orders? */}
                                    <div className="flex flex-col gap-6 overflow-hidden">
                                        <div className="flex-1 bg-white/[0.03] border border-white/[0.05] rounded-[32px] p-8 overflow-y-auto no-scrollbar">
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">{t('caller.details')}</p>
                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                                                    <span className="text-xs font-bold text-slate-500">{t('caller.score')}</span>
                                                    <span className="text-lg font-black text-amber-500">⭐ 4.8</span>
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                                                    <span className="text-xs font-bold text-slate-500">{t('caller.last_order')}</span>
                                                    <span className="text-sm font-black text-white">2 gün önce</span>
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl text-rose-500">
                                                    <span className="text-xs font-bold opacity-70">{t('caller.cancelled_orders')}</span>
                                                    <span className="text-sm font-black">0</span>
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Right Content: Address & Actions */}
                                    <div className="flex flex-col gap-6">
                                        <div className="bg-white/[0.03] border border-white/[0.05] rounded-[32px] p-8">
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">{t('caller.info')}</p>
                                            
                                            {isFormOpen ? (
                                                <div className="space-y-4">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2">{t('caller.name_label')}</label>
                                                        <input 
                                                            autoFocus
                                                            value={formData.name}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-emerald-500 transition-all"
                                                            placeholder={t('caller.name_placeholder')}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2">{t('caller.address_label')}</label>
                                                        <textarea 
                                                            value={formData.address}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-emerald-500 transition-all h-24 no-scrollbar"
                                                            placeholder={t('caller.address_placeholder')}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => setIsFormOpen(false)}
                                                            className="flex-1 h-12 bg-white/5 text-white/40 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                                                        >
                                                            {t('caller.cancel')}
                                                        </button>
                                                        <button 
                                                            disabled={isSavingCustomer || !formData.name}
                                                            onClick={() => handleSaveCustomer(activeCall)}
                                                            className="flex-[2] h-12 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:brightness-110 transition-all"
                                                        >
                                                            {isSavingCustomer ? t('caller.saving') : t('caller.save_complete')}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-4 items-start">
                                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                                                        <FiMapPin size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-white leading-tight">
                                                            {matchingCustomers[activeCall.number]?.address || activeCall.address || t('caller.address_not_found')}
                                                        </p>
                                                        <button className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-4 hover:underline">{t('caller.show_map')}</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>



                                        <div className="flex-1 flex flex-col justify-end gap-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <button 
                                                    onClick={() => removeRecentCall(activeCall.number)}
                                                    className="h-20 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-3xl font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-3"
                                                >
                                                    <FiTrash2 size={24} /> {t('caller.delete')}
                                                </button>
                                                <button 
                                                    onClick={() => handleAccept(activeCall)}
                                                    className="h-20 bg-emerald-500 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-emerald-500/30 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                                >
                                                    <FiShoppingCart size={24} /> {t('caller.open_order')}
                                                </button>
                                            </div>

                                            {!(matchingCustomers[activeCall.number] || activeCall.customerId) && !isFormOpen && (
                                                <button 
                                                    disabled={isSavingCustomer}
                                                    onClick={() => {
                                                        setFormData({ name: activeCall.name || '', address: activeCall.address || '', note: '' });
                                                        setIsFormOpen(true);
                                                    }}
                                                    className="w-full h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                                >
                                                    <FiUser /> {t('caller.register_customer')}
                                                </button>
                                            )}


                                            <p className="text-[10px] text-center text-white/20 font-bold uppercase tracking-[0.4em]">
                                                NEXTPOS CALLER ID GATEWAY ENABLED
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center opacity-10">
                                <FiPhoneCall size={120} />
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
