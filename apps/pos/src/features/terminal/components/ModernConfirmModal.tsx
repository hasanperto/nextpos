import React, { useEffect, useId, useRef } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

interface ModernConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

export const ModernConfirmModal: React.FC<ModernConfirmModalProps> = ({
    isOpen, onClose, onConfirm, title, description, confirmText = 'EVET, DEVAM ET', cancelText = 'VAZGEÇ', type = 'danger'
}) => {
    const titleId = useId();
    const descId = useId();
    const cancelRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        cancelRef.current?.focus();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose, onConfirm]);

    const theme =
        type === 'warning'
            ? {
                headerBg: 'bg-gradient-to-b from-amber-500/10 to-transparent',
                iconWrap: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
                confirmBtn: 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-900/20',
            }
            : type === 'info'
                ? {
                    headerBg: 'bg-gradient-to-b from-blue-500/10 to-transparent',
                    iconWrap: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
                    confirmBtn: 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20',
                }
                : {
                    headerBg: 'bg-gradient-to-b from-rose-500/10 to-transparent',
                    iconWrap: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
                    confirmBtn: 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/20',
                };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md px-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={descId}
                        className="w-full max-w-[400px] bg-[#1a1c1e] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className={`p-8 text-center border-b border-white/5 ${theme.headerBg}`}>
                            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-4 ${theme.iconWrap}`}>
                                <FiAlertTriangle size={32} />
                            </div>
                            <h3 id={titleId} className="text-xl font-black text-white tracking-tight italic uppercase">{title}</h3>
                            <p id={descId} className="text-sm font-bold text-white/50 tracking-wide mt-2 px-4 leading-relaxed">{description}</p>
                        </div>

                        <div className="p-6 grid grid-cols-2 gap-4 bg-[#141517]">
                            <button 
                                ref={cancelRef}
                                onClick={onClose}
                                className="h-14 rounded-2xl bg-white/5 text-white/70 font-black text-xs uppercase tracking-[0.2em] hover:bg-white/10 transition-all border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                            >
                                {cancelText}
                            </button>
                            <button 
                                onClick={() => { onConfirm(); onClose(); }}
                                className={`h-14 rounded-2xl text-white font-black text-xs uppercase tracking-[0.2em] transition-all focus:outline-none focus:ring-2 focus:ring-white/20 ${theme.confirmBtn}`}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
