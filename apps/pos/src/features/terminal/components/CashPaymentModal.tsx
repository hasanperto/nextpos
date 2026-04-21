import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FiX, FiDollarSign, FiCheck, FiDelete } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import { usePosStore } from '../../../store/usePosStore';

interface CashPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalAmount: number;
    onConfirm: (receivedAmount: number) => void;
    tableName?: string;
}

const QUICK_AMOUNTS = [5, 10, 20, 50, 100, 200, 500];

const NUMPAD_KEYS = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', 'DEL'],
];

export const CashPaymentModal: React.FC<CashPaymentModalProps> = ({
    isOpen, onClose, totalAmount, onConfirm, tableName
}) => {
    const { t } = usePosLocale();
    const { settings } = usePosStore();
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const receivedAmount = parseFloat(inputValue) || 0;
    const changeAmount = receivedAmount - totalAmount;
    const isValid = receivedAmount >= totalAmount && receivedAmount > 0;

    const currencySymbol = settings?.currency || '€';
    const locale = settings?.language === 'tr' ? 'tr-TR' : (settings?.language === 'de' ? 'de-DE' : 'en-US');

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setInputValue('');
            // Auto-focus after animation
            setTimeout(() => inputRef.current?.focus(), 200);
        }
    }, [isOpen]);

    const handleNumpad = useCallback((key: string) => {
        if (key === 'DEL') {
            setInputValue(prev => prev.slice(0, -1));
        } else if (key === '.') {
            setInputValue(prev => {
                if (prev.includes('.')) return prev;
                return prev === '' ? '0.' : prev + '.';
            });
        } else {
            setInputValue(prev => {
                const newVal = prev + key;
                // Limit decimal places to 2
                const parts = newVal.split('.');
                if (parts[1] && parts[1].length > 2) return prev;
                // Limit total length
                if (newVal.replace('.', '').length > 7) return prev;
                return newVal;
            });
        }
    }, []);

    const handleQuickAmount = useCallback((amount: number) => {
        setInputValue(String(amount));
    }, []);

    const handleExact = useCallback(() => {
        setInputValue(totalAmount.toFixed(2));
    }, [totalAmount]);

    const handleConfirm = useCallback(() => {
        if (isValid) {
            onConfirm(receivedAmount);
        }
    }, [isValid, receivedAmount, onConfirm]);

    // Keyboard support
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && isValid) handleConfirm();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, isValid, handleConfirm, onClose]);

    const formatCurrency = (val: number) => `${currencySymbol}${val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-[480px] max-w-[95vw] bg-[#111827] border border-white/10 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-emerald-900/30 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <FiDollarSign size={20} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white tracking-tight">
                                        {t('cash.title') || 'Nakit Ödeme'}
                                    </h3>
                                    {tableName && (
                                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{tableName}</span>
                                    )}
                                </div>
                            </div>
                            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all">
                                <FiX size={16} />
                            </button>
                        </div>

                        {/* Total & Change Display */}
                        <div className="px-6 pt-5 pb-3 space-y-4">
                            {/* Total Amount */}
                            <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/[0.04]">
                                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">
                                    {t('cash.totalDue') || 'Toplam Tutar'}
                                </span>
                                <span className="text-2xl font-black text-white tabular-nums tracking-tight">
                                    {formatCurrency(totalAmount)}
                                </span>
                            </div>

                            {/* Received Amount Input */}
                            <div className="relative">
                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5 block">
                                    {t('cash.received') || 'Alınan Tutar'}
                                </label>
                                <div className="flex items-center gap-2 p-3 bg-white/[0.06] rounded-2xl border-2 border-emerald-500/30 focus-within:border-emerald-500/60 transition-all">
                                    <span className="text-lg font-black text-emerald-400 ml-1">{currencySymbol}</span>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        inputMode="decimal"
                                        value={inputValue}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                            setInputValue(val);
                                        }}
                                        placeholder="0.00"
                                        className="flex-1 bg-transparent text-3xl font-black text-white outline-none tabular-nums tracking-tight placeholder:text-white/10"
                                    />
                                </div>
                            </div>

                            {/* Change Amount */}
                            <motion.div 
                                animate={{ 
                                    borderColor: isValid ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.04)',
                                    backgroundColor: isValid ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)'
                                }}
                                className="flex items-center justify-between p-4 rounded-2xl border transition-colors"
                            >
                                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">
                                    {t('cash.change') || 'Para Üstü'}
                                </span>
                                <motion.span 
                                    key={changeAmount.toFixed(2)}
                                    initial={{ scale: 1.1 }}
                                    animate={{ scale: 1 }}
                                    className={`text-3xl font-black tabular-nums tracking-tight ${
                                        changeAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                >
                                    {changeAmount >= 0 ? formatCurrency(changeAmount) : `-${formatCurrency(Math.abs(changeAmount))}`}
                                </motion.span>
                            </motion.div>
                        </div>

                        {/* Quick Amount Buttons */}
                        <div className="px-6 pb-3">
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                <button
                                    onClick={handleExact}
                                    className="shrink-0 px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95"
                                >
                                    {t('cash.exact') || 'TAM'}
                                </button>
                                {QUICK_AMOUNTS.map(amt => (
                                    <button
                                        key={amt}
                                        onClick={() => handleQuickAmount(amt)}
                                        className={`shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black tracking-wider transition-all active:scale-95 ${
                                            inputValue === String(amt)
                                                ? 'bg-blue-600 text-white border border-blue-400/40 shadow-lg shadow-blue-900/30'
                                                : 'bg-white/5 text-white/50 border border-white/[0.06] hover:bg-white/10 hover:text-white/80'
                                        }`}
                                    >
                                        {currencySymbol}{amt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Numpad */}
                        <div className="px-6 pb-4">
                            <div className="grid grid-cols-3 gap-2">
                                {NUMPAD_KEYS.flat().map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => handleNumpad(key)}
                                        className={`h-14 rounded-xl text-lg font-black transition-all active:scale-95 ${
                                            key === 'DEL'
                                                ? 'bg-rose-600/15 text-rose-400 border border-rose-500/20 hover:bg-rose-600/30'
                                                : key === '.'
                                                  ? 'bg-white/5 text-white/60 border border-white/[0.06] hover:bg-white/10'
                                                  : 'bg-white/[0.06] text-white border border-white/[0.04] hover:bg-white/10'
                                        }`}
                                    >
                                        {key === 'DEL' ? <FiDelete size={20} className="mx-auto" /> : key}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Confirm Button */}
                        <div className="px-6 pb-6">
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                disabled={!isValid}
                                onClick={handleConfirm}
                                className={`w-full h-16 rounded-2xl font-black text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-3 transition-all ${
                                    isValid
                                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-xl shadow-emerald-900/40 hover:from-emerald-500 hover:to-emerald-400'
                                        : 'bg-white/5 text-white/15 cursor-not-allowed'
                                }`}
                            >
                                <FiCheck size={20} />
                                {isValid 
                                    ? `${t('cash.confirm') || 'ÖDEMEYİ ONAYLA'} — ${t('cash.change') || 'Para Üstü'}: ${formatCurrency(changeAmount)}`
                                    : t('cash.enterAmount') || 'Tutarı Giriniz'
                                }
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
