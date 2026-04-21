import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiArrowRight } from 'react-icons/fi';
import { usePosStore } from '../../../store/usePosStore';
import toast from 'react-hot-toast';

interface TransferItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: {
        id: number;
        productName: string;
        quantity: number;
        price: number;
    };
    tables: any[];
}

export const TransferItemModal: React.FC<TransferItemModalProps> = ({
    isOpen,
    onClose,
    item,
    tables
}) => {
    const { transferTableItem } = usePosStore();
    const [quantity, setQuantity] = useState(item.quantity);
    const [targetTableId, setTargetTableId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleTransfer = async () => {
        if (!targetTableId) {
            toast.error('Lütfen hedef masa seçin');
            return;
        }

        setLoading(true);
        try {
            const r = await transferTableItem(item.id, quantity, targetTableId);
            if (r.ok) {
                toast.success(`${quantity}x ${item.productName} başarıyla taşındı`);
                onClose();
            } else {
                toast.error(r.error || 'Transfer başarısız');
            }
        } catch (e) {
            toast.error('İşlem hatası');
        } finally {
            setLoading(false);
        }
    };


    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-[36px] overflow-hidden shadow-2xl"
                >
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-lg font-black text-white italic tracking-tighter uppercase font-display">ÜRÜN <span className="text-orange-500">TRANSFERİ</span></h2>
                        <button onClick={onClose} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-white/40 hover:text-white transition-all">
                            <FiX size={20} />
                        </button>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Summary */}
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">TAŞINACAK ÜRÜN</p>
                            <p className="text-sm font-black text-white uppercase">{item.productName}</p>
                            <p className="text-[10px] font-bold text-orange-500 mt-1 tracking-tight">Mevcut Adet: {item.quantity}</p>
                        </div>

                        {/* Quantity Selector */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">MİKTAR</label>
                            <div className="flex items-center gap-4 bg-black/40 p-2 rounded-2xl border border-white/5">
                                <button 
                                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                    className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white text-xl font-bold hover:bg-white/10 transition-all"
                                >-</button>
                                <span className="flex-1 text-center text-2xl font-black text-white font-display">{quantity}</span>
                                <button 
                                    onClick={() => setQuantity(q => Math.min(item.quantity, q + 1))}
                                    className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white text-xl font-bold hover:bg-white/10 transition-all"
                                >+</button>
                            </div>
                        </div>

                        {/* Target Table */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">HEDEF MASA</label>
                            <div className="grid grid-cols-3 gap-3 max-h-[160px] overflow-y-auto no-scrollbar pr-1">
                                {tables.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTargetTableId(t.id)}
                                        className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 ${
                                            targetTableId === t.id 
                                                ? 'bg-orange-500 border-white/20 text-white shadow-lg' 
                                                : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                                        }`}
                                    >
                                        <span className="text-xs font-black italic">{t.name}</span>
                                        {t.active_session_id ? (
                                            <span className="text-[10px] font-bold opacity-50 uppercase mt-0.5">DOLU</span>
                                        ) : (
                                            <span className="text-[10px] font-bold opacity-50 uppercase mt-0.5">BOŞ</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Confirm */}
                        <button
                            disabled={loading || !targetTableId}
                            onClick={handleTransfer}
                            className="w-full py-5 bg-orange-600 hover:bg-orange-500 disabled:opacity-20 rounded-3xl text-sm font-black uppercase tracking-[0.3em] text-white shadow-xl shadow-orange-900/40 flex items-center justify-center gap-3 transition-all"
                        >
                            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>TRANSFER ET <FiArrowRight /></>}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
