import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhone, FiPlus, FiX, FiMapPin } from 'react-icons/fi';
import { useUIStore } from '../../../store/useUIStore';
import { usePosStore } from '../../../store/usePosStore';
import io from 'socket.io-client';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import toast from 'react-hot-toast';


export const CallerIdNotification: React.FC = () => {
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const ui = useUIStore();
    const pos = usePosStore();
    const { token, tenantId } = useAuthStore();
    const { t } = usePosLocale();


    useEffect(() => {
        if (!token || !tenantId) return;

        const socket = io(window.location.origin, {
            path: '/socket.io',
            auth: { token }
        });

        socket.emit('join:tenant', tenantId);

        socket.on('INCOMING_CALL', (data: any) => {
            console.log('📞 Gelen Çağrı:', data);
            setIncomingCall(data);
            
            // Otomatik kapanma (30 saniye)
            setTimeout(() => {
                setIncomingCall((prev: any) => (prev?.timestamp === data.timestamp ? null : prev));
            }, 30000);

            // Sesli uyarı
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
                audio.play();
            } catch (e) {
                console.warn('Ses çalınamadı');
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [token, tenantId]);

    const handleCreateOrder = () => {
        if (!incomingCall) return;

        // Müşteriyi sepet/sipariş için ayarla
        ui.setCustomerModal(false);
        if (incomingCall.customerId) {
            ui.setActiveCustomer({
                id: incomingCall.customerId,
                name: incomingCall.name,
                phone: incomingCall.number,
                address: incomingCall.address || ''
            });
        } else {
            // Yeni müşteri taslağı
            ui.setActiveCustomer({
                id: 0,
                name: incomingCall.name === t('caller.unknown_customer') ? '' : incomingCall.name,
                phone: incomingCall.number,
                address: ''
            });
        }

        pos.setOrderType('delivery');
        ui.setCartOpen(true);
        setIncomingCall(null);
        toast.success(`${t('caller.notify.toast_prefix')} ${incomingCall.number}`);
    };


    return (
        <AnimatePresence>
            {incomingCall && (
                <motion.div
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    className="fixed top-24 right-6 z-[200] w-80 bg-neutral-900/90 backdrop-blur-xl border border-emerald-500/30 rounded-[32px] overflow-hidden shadow-[0_20px_50px_rgba(16,185,129,0.2)]"
                >
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white relative">
                                <FiPhone className="text-2xl animate-tada" />
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 border-2 border-neutral-900 rounded-full animate-ping" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-lg font-black text-white italic tracking-tighter truncate leading-tight">
                                    {incomingCall.name}
                                </h4>
                                <p className="text-[10px] font-black text-emerald-400 tracking-[0.2em] font-mono">
                                    {incomingCall.number}
                                </p>
                            </div>
                            <button onClick={() => setIncomingCall(null)} className="p-2 text-white/20 hover:text-white transition-all">
                                <FiX size={20} />
                            </button>
                        </div>

                        {incomingCall.address && (
                            <div className="flex items-start gap-2 bg-white/5 p-3 rounded-2xl mb-4 border border-white/5">
                                <FiMapPin className="text-emerald-500 mt-0.5 shrink-0" size={14} />
                                <p className="text-[10px] font-medium text-slate-400 line-clamp-2 italic leading-relaxed">
                                    {incomingCall.address}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={handleCreateOrder}
                                className="col-span-2 h-14 bg-emerald-600 hover:bg-emerald-500 rounded-2xl flex items-center justify-center gap-2 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                            >
                                <FiPlus size={16} /> {t('caller.notify.create_order')}
                            </button>
                        </div>

                    </div>
                    {/* Progress bar animation for timeout */}
                    <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: 30, ease: 'linear' }}
                        className="h-1 bg-emerald-500"
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
};
