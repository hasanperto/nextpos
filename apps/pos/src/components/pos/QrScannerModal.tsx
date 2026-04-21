import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { FiX, FiMaximize } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

interface QrScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (decodedText: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ isOpen, onClose, onScan }) => {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Delay initialization for modal animation
            const timer = setTimeout(() => {
                scannerRef.current = new Html5QrcodeScanner(
                    "qr-reader",
                    { 
                        fps: 10, 
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    },
                    /* verbose= */ false
                );
                
                scannerRef.current.render((decodedText) => {
                    onScan(decodedText);
                    onClose();
                }, () => {
                    // tarama hatası (sessiz)
                });
            }, 300);

            return () => {
                clearTimeout(timer);
                if (scannerRef.current) {
                    scannerRef.current.clear().catch(e => console.error("Scanner clear error", e));
                }
            };
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />
                    
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-lg bg-[#1a1c1e] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-br from-emerald-500/10 to-transparent">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                    <FiMaximize size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-white italic tracking-tight uppercase">QR Tara</h3>
                                    <p className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest">Müşteri Kartı veya QR Menü</p>
                                </div>
                            </div>
                            <button 
                                onClick={onClose}
                                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        {/* Scanner Area */}
                        <div className="p-8">
                            <div id="qr-reader" className="w-full overflow-hidden rounded-3xl border-4 border-emerald-500/20 bg-black/40 shadow-inner" />
                            
                            <div className="mt-8 flex flex-col items-center gap-4 text-center">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 max-w-xs transition-all hover:bg-white/10">
                                    <p className="text-xs font-medium text-white/40 leading-relaxed italic">
                                        Müşteri numarasını içeren QR kodu kameraya yaklaştırın.
                                    </p>
                                </div>
                                
                                <button 
                                    onClick={onClose}
                                    className="px-8 py-2.5 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30 transition-all"
                                >
                                    Vazgeç
                                </button>
                            </div>
                        </div>

                        {/* Progress Bar Animation */}
                        <motion.div 
                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                        />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
