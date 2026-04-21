import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiCreditCard, FiLink, FiCopy, FiCheck, FiSend } from 'react-icons/fi';
import { Modal, InputGroup } from './SaaSShared';
import { useSaaSStore } from '../../store/useSaaSStore';
import { motion } from 'framer-motion';

interface Props {
    tenantId: string;
    tenantName: string;
    onClose: () => void;
}

export const PaymentLinkModal: React.FC<Props> = ({ tenantId, tenantName, onClose }) => {
    const { generatePaymentLink } = useSaaSStore();
    const [amount, setAmount] = useState('0');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ url: string; gateway: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        const res = await generatePaymentLink({
            tenantId,
            amount: Number(amount),
            currency: 'EUR',
            description,
        });
        setLoading(false);
        if (res.ok && res.paymentUrl) {
            setResult({ url: res.paymentUrl, gateway: res.gateway || '' });
        }
    };

    const copyToClipboard = () => {
        if (!result) return;
        void navigator.clipboard.writeText(result.url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal show={true} onClose={onClose} title="Dinamik Ödeme Linki" maxWidth="max-w-xl">
            <div className="space-y-8">
                <div className="p-6 bg-blue-600/10 border border-blue-500/20 rounded-[32px] flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400">
                        <FiCreditCard size={24} />
                    </div>
                    <div>
                        <h4 className="text-white font-black text-sm uppercase tracking-tighter italic">{tenantName}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Virtual POS Checkout v2</p>
                    </div>
                </div>

                {!result ? (
                    <>
                        <div className="grid grid-cols-1 gap-6">
                            <InputGroup 
                                label="Tutar" 
                                value={amount} 
                                onChange={setAmount} 
                                type="number" 
                                placeholder="0.00" 
                            />
                            <InputGroup 
                                label="Açıklama" 
                                value={description} 
                                onChange={setDescription} 
                                placeholder="Örn: 2024 Mart Ayı Abonelik Ödemesi" 
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={loading || Number(amount) <= 0 || !description}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black py-4 rounded-[24px] shadow-2xl shadow-blue-900/40 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <><FiLink /> LİNK OLUŞTUR</>
                            )}
                        </button>
                    </>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-[32px] flex items-center justify-center text-emerald-400 mx-auto mb-4 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                <FiCheck size={32} />
                            </div>
                            <h5 className="text-white font-black text-lg uppercase tracking-tighter italic">Ödeme linkiniz hazır:</h5>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">{result.gateway.toUpperCase()} GATEWAY ACTIVE</p>
                        </div>

                        <div className="bg-black/40 border border-white/5 p-6 rounded-[32px] relative group overflow-hidden">
                            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 px-1">GÜVENLİ ÖDEME URL</div>
                            <div className="text-xs font-mono text-blue-400 break-all bg-white/5 p-4 rounded-2xl border border-white/5 mb-6 group-hover:border-blue-500/30 transition-all font-bold">
                                {result.url}
                            </div>
                            
                            <div className="flex gap-3 relative z-10">
                                <button
                                    type="button"
                                    onClick={copyToClipboard}
                                    className="flex-1 bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-[20px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] border border-white/10"
                                >
                                    {copied ? <><FiCheck /> KOPYALANDI</> : <><FiCopy /> KOPYALA</>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const opened = window.open(result.url, '_blank');
                                        if (!opened) {
                                            toast.error('Ödeme linki açılamadı — tarayıcı açılır pencere engelini kaldırın', { icon: '🔒', duration: 6000 });
                                        }
                                    }}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-[20px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] shadow-lg shadow-blue-900/40"
                                >
                                    <FiSend /> ŞİMDİ GİT
                                </button>
                            </div>
                        </div>

                        <button 
                            type="button"
                            onClick={() => setResult(null)}
                            className="w-full text-slate-500 hover:text-white font-black text-[10px] uppercase tracking-widest py-2 transition-all mt-4"
                        >
                            YENİ LİNK OLUŞTUR
                        </button>
                    </motion.div>
                )}
            </div>
        </Modal>
    );
};
