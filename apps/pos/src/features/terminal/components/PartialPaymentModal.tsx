import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCheck, FiDollarSign, FiCreditCard, FiSmartphone } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import toast from 'react-hot-toast';

interface PartialPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: number;
    totalAmount: number;
    tableName: string;
}

export const PartialPaymentModal: React.FC<PartialPaymentModalProps> = ({
    isOpen,
    onClose,
    sessionId,
    totalAmount,
    tableName
}) => {
    const { submitSessionPayment, settings } = usePosStore();
    const currency = settings?.currency || '€';
    const [amount, setAmount] = useState<string>(Math.round(totalAmount).toString());
    const [method, setMethod] = useState<'cash' | 'card' | 'online'>('cash');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) {
            toast.error('Geçerli bir tutar girin');
            return;
        }

        setLoading(true);
        try {
            const r = await submitSessionPayment(sessionId, val, method);
            if (r.ok) {
                toast.success(`${currency}${val} tutarında ${method === 'cash' ? 'nakit' : 'kart'} ödemesi alındı`, { id: `payment-succ-sess-${sessionId}` });
                if (r.sessionClosed) {
                    toast.success('Masa hesabı tamamen kapandı', { id: `payment-session-closed-${sessionId}` });
                }
                onClose();
            } else {
                toast.error(r.error || 'Ödeme alınamadı');
            }
        } catch (e) {
            toast.error('İşlem hatası');
        } finally {
            setLoading(false);
        }
    };

    const quickAmounts = [10, 20, 50, 100, 200, 500];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-[40px] overflow-hidden shadow-2xl"
                >
                    <div className="p-8 border-b border-white/5 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-white italic tracking-tighter">PARÇALI <span className="text-emerald-500">ÖDEME</span></h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Masa: {tableName}</p>
                        </div>
                        <button onClick={onClose} className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-white/40 hover:text-white transition-all">
                            <FiX size={24} />
                        </button>
                    </div>

                    <div className="p-10 space-y-10">
                        {/* Summary */}
                        <div className="bg-white/5 rounded-3xl p-6 flex justify-between items-center">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">KALAN BAKİYE</span>
                            <span className="text-3xl font-black text-white italic tracking-tighter">{currency}{Math.round(totalAmount)}</span>
                        </div>

                        {/* Amount Input */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">ÖDENECEK TUTAR</label>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-emerald-500">{currency}</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-3xl py-6 pl-14 pr-8 text-3xl font-black text-white outline-none focus:border-emerald-500/50 transition-all font-display"
                                />
                            </div>
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                {quickAmounts.map(v => (
                                    <button 
                                        key={v}
                                        onClick={() => setAmount(v.toString())}
                                        className="shrink-0 glass px-4 py-2 rounded-xl text-xs font-black hover:bg-emerald-500 hover:text-white transition-all"
                                    >
                                        +{v}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Payment Method */}
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { id: 'cash', label: 'NAKİT', icon: <FiDollarSign />, color: 'bg-emerald-500' },
                                { id: 'card', label: 'KART', icon: <FiCreditCard />, color: 'bg-blue-500' },
                                { id: 'online', label: 'DİĞER', icon: <FiSmartphone />, color: 'bg-purple-500' },
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id as any)}
                                    className={`relative h-28 rounded-3xl border transition-all flex flex-col items-center justify-center gap-2 ${
                                        method === m.id 
                                            ? `border-white/20 ${m.color} text-white shadow-xl` 
                                            : 'border-white/5 bg-white/5 text-slate-500 hover:bg-white/10'
                                    }`}
                                >
                                    <span className="text-2xl">{m.icon}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">{m.label}</span>
                                    {method === m.id && (
                                        <div className="absolute top-2 right-2 bg-white text-black rounded-full p-1">
                                            <FiCheck size={10} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Submit Button */}
                        <button
                            disabled={loading || !amount || parseFloat(amount) <= 0}
                            onClick={handleSubmit}
                            className="w-full h-20 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 rounded-[28px] text-white font-black text-lg uppercase tracking-[0.3em] shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-4 transition-all"
                        >
                            {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'ÖDEMEYİ TAMAMLA'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
