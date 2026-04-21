import React, { useState, useCallback, useEffect } from 'react';
import { FiDelete, FiShield } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../store/useAuthStore';

interface PinCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (notes?: string) => void;
    title?: string;
    description?: string;
    showNotes?: boolean;
}

const NUMPAD_KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', 'DEL'],
];

export const PinCodeModal: React.FC<PinCodeModalProps> = ({
    isOpen, onClose, onSuccess, title = 'GÜVENLİK ONAYI', description = 'Bu işlem için yönetici şifresi gereklidir.', showNotes = false
}) => {
    const [pin, setPin] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const { token, tenantId } = useAuthStore();

    const handleKey = useCallback((key: string) => {
        if (key === 'DEL') {
            setPin(prev => prev.slice(0, -1));
        } else if (key === 'C') {
            setPin('');
        } else {
            setPin(prev => (prev.length < 6 ? prev + key : prev));
        }
    }, []);

    const verify = useCallback(async () => {
        if (pin.length !== 6) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/auth/verify-admin', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pinCode: pin })
            });

            if (res.ok) {
                onSuccess(notes);
                setPin('');
                setNotes('');
            } else {
                toast.error('Geçersiz admin şifresi');
                setPin('');
            }
        } catch (e) {
            toast.error('Bağlantı hatası');
        } finally {
            setLoading(false);
        }
    }, [pin, token, tenantId, onSuccess, notes]);

    useEffect(() => {
        if (pin.length === 6) {
            void verify();
        }
    }, [pin, verify]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        className="w-[360px] bg-[#1a1c1e] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden shadow-rose-500/5"
                    >
                        <div className="p-8 text-center border-b border-white/5 bg-gradient-to-b from-rose-500/10 to-transparent">
                            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-500 mx-auto mb-4">
                                <FiShield size={32} />
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight italic uppercase">{title}</h3>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2 px-4 leading-relaxed">{description}</p>
                        </div>

                        <div className="p-8">
                            {/* Pin Display */}
                            <div className="flex justify-center gap-3 mb-8">
                                {[...Array(6)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-10 h-10 rounded-xl border-2 transition-all flex items-center justify-center ${
                                            pin.length > i 
                                                ? 'bg-rose-500 border-rose-400 shadow-lg shadow-rose-500/20' 
                                                : 'bg-white/5 border-white/10'
                                        }`}
                                    >
                                        {pin.length > i && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                ))}
                            </div>

                            {/* Numpad */}
                            <div className="grid grid-cols-3 gap-3">
                                {NUMPAD_KEYS.flat().map(key => (
                                    <button
                                        key={key}
                                        disabled={loading}
                                        onClick={() => handleKey(key)}
                                        className={`h-14 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center ${
                                            key === 'DEL' 
                                                ? 'bg-white/5 text-rose-500' 
                                                : key === 'C' 
                                                    ? 'bg-white/5 text-white/40 text-sm'
                                                    : 'bg-white/10 text-white hover:bg-white/20'
                                        }`}
                                    >
                                        {key === 'DEL' ? <FiDelete size={20} /> : key}
                                    </button>
                                ))}
                            </div>

                            {showNotes && (
                                <div className="mt-8 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <label className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1 italic">İPTAL SEBEBİ (OPSİYONEL)</label>
                                    <textarea 
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Neden iptal ediliyor?..."
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold text-white outline-none focus:border-rose-500/50 transition-all placeholder:text-white/10 resize-none h-24 shadow-inner"
                                    />
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={onClose}
                            className="w-full py-6 bg-white/5 text-white/30 font-black text-[10px] uppercase tracking-[0.3em] hover:text-white transition-all border-t border-white/5"
                        >
                            İPTAL ET VE DÖN
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
