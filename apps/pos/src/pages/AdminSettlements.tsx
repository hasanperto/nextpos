import React, { useEffect, useState } from 'react';
import { 
    FiUser, FiDollarSign, FiCheck, FiRefreshCcw, 
    FiAlertCircle, FiTrendingUp, FiCreditCard, FiAward 
} from 'react-icons/fi';
import { useAuthStore } from '../store/useAuthStore';
import { usePosStore } from '../store/usePosStore';
import { usePosLocale } from '../contexts/PosLocaleContext';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface StaffBalance {
    id: number;
    name: string;
    username: string;
    role: 'waiter' | 'courier';
    cashInHand: number;
    accumulatedCardTips: number;
}

export const AdminSettlements: React.FC = () => {
    const { getAuthHeaders, user } = useAuthStore();
    const { settings } = usePosStore();
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'waiter' | 'courier'>('waiter');
    const [staffBalances, setStaffBalances] = useState<StaffBalance[]>([]);
    const [selectedStaff, setSelectedStaff] = useState<StaffBalance | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; type: 'cash' | 'tips'; staff: StaffBalance | null }>({
        isOpen: false,
        type: 'cash',
        staff: null
    });
    const [settling, setSettling] = useState(false);

    const currencySymbol = settings?.currency || '€';

    const loadBalances = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/handovers/balances', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setStaffBalances(Array.isArray(data) ? data : []);
            } else {
                toast.error(t('admin.settlements.toast.loadFailed'));
            }
        } catch {
            toast.error(t('admin.settlements.toast.connectionError'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadBalances();
    }, []);

    // Tab filtering
    const filteredStaff = staffBalances.filter(s => s.role === activeTab);

    // Consolidated calculations
    const totalCashToSettle = staffBalances.reduce((sum, s) => sum + s.cashInHand, 0);
    const totalTipsToPay = staffBalances.reduce((sum, s) => sum + s.accumulatedCardTips, 0);

    const handleSettleAction = async () => {
        const { type, staff } = confirmModal;
        if (!staff) return;
        setSettling(true);
        try {
            const endpoint = `/api/v1/admin/handovers/${staff.id}/settle/${type}`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role: staff.role })
            });

            if (res.ok) {
                const result = await res.json();
                if (type === 'cash') {
                    toast.success(t('admin.settlements.toast.cashSuccess').replace('{{name}}', staff.name));
                } else {
                    toast.success(t('admin.settlements.toast.tipsSuccess').replace('{{name}}', staff.name));
                }
                setConfirmModal({ isOpen: false, type: 'cash', staff: null });
                void loadBalances();
            } else {
                toast.error(t('admin.settlements.toast.operationFailed'));
            }
        } catch {
            toast.error(t('admin.settlements.toast.connectionError'));
        } finally {
            setSettling(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen bg-[#020617] text-white">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter leading-none flex items-center gap-3">
                        <FiDollarSign className="text-emerald-400" />
                        {t('admin.settlements.title')}
                    </h1>
                    <p className="text-slate-500 font-bold text-sm tracking-wide mt-2">
                        {t('admin.settlements.subtitle')}
                    </p>
                </div>
                <button
                    onClick={() => void loadBalances()}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-2xl text-slate-300 font-bold text-xs uppercase tracking-wider hover:bg-white/10 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                    <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                    {t('admin.settlements.refresh')}
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[24px] flex items-center gap-5 backdrop-blur-md shadow-lg shadow-black/20 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                        <FiDollarSign size={22} />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('admin.settlements.stat.totalCash')}</span>
                        <span className="text-2xl font-black text-white tabular-nums tracking-tighter block mt-1">
                            {currencySymbol}{totalCashToSettle.toFixed(2)}
                        </span>
                    </div>
                    <div className="absolute right-0 bottom-0 opacity-[0.02] text-white pointer-events-none">
                        <FiDollarSign size={80} />
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[24px] flex items-center gap-5 backdrop-blur-md shadow-lg shadow-black/20 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
                        <FiCreditCard size={22} />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('admin.settlements.stat.pendingTips')}</span>
                        <span className="text-2xl font-black text-white tabular-nums tracking-tighter block mt-1">
                            {currencySymbol}{totalTipsToPay.toFixed(2)}
                        </span>
                    </div>
                    <div className="absolute right-0 bottom-0 opacity-[0.02] text-white pointer-events-none">
                        <FiCreditCard size={80} />
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[24px] flex items-center gap-5 backdrop-blur-md shadow-lg shadow-black/20 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                        <FiUser size={22} />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('admin.settlements.stat.activeWaiters')}</span>
                        <span className="text-2xl font-black text-white tabular-nums tracking-tighter block mt-1">
                            {t('admin.settlements.staffCount').replace('{{count}}', String(staffBalances.filter(row => row.role === 'waiter').length))}
                        </span>
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[24px] flex items-center gap-5 backdrop-blur-md shadow-lg shadow-black/20 relative overflow-hidden group">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                        <FiAward size={22} />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{t('admin.settlements.stat.activeCouriers')}</span>
                        <span className="text-2xl font-black text-white tabular-nums tracking-tighter block mt-1">
                            {t('admin.settlements.staffCount').replace('{{count}}', String(staffBalances.filter(row => row.role === 'courier').length))}
                        </span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 w-fit">
                <button
                    onClick={() => setActiveTab('waiter')}
                    className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        activeTab === 'waiter' 
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20' 
                            : 'text-slate-400 hover:text-white'
                    }`}
                >
                    {t('admin.settlements.tab.waiters')}
                </button>
                <button
                    onClick={() => setActiveTab('courier')}
                    className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        activeTab === 'courier' 
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20' 
                            : 'text-slate-400 hover:text-white'
                    }`}
                >
                    {t('admin.settlements.tab.couriers')}
                </button>
            </div>

            {/* Personnel List Card */}
            <div className="bg-slate-900/40 border border-white/10 rounded-[32px] backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{t('admin.settlements.listTitle')}</span>
                    <span className="text-xs font-black text-slate-500 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                        {t('admin.settlements.recordsShowing').replace('{{count}}', String(filteredStaff.length))}
                    </span>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                    {loading ? (
                        <div className="p-20 flex flex-col items-center justify-center gap-4 text-slate-500">
                            <div className="w-10 h-10 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin" />
                            <span className="text-xs font-bold uppercase tracking-wider">{t('admin.settlements.loading')}</span>
                        </div>
                    ) : filteredStaff.length === 0 ? (
                        <div className="p-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                            <FiAlertCircle size={40} className="text-slate-600" />
                            <span className="text-sm font-bold uppercase tracking-wider">{t('admin.settlements.noStaff')}</span>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-black/10">
                                    <th className="py-5 px-8">{t('admin.settlements.col.name')}</th>
                                    <th className="py-5 px-8">{t('admin.settlements.col.username')}</th>
                                    <th className="py-5 px-8 text-right">{t('admin.settlements.col.cash')}</th>
                                    <th className="py-5 px-8 text-right">{t('admin.settlements.col.tips')}</th>
                                    <th className="py-5 px-8 text-center">{t('admin.settlements.col.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map((staff) => (
                                    <tr key={staff.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                        <td className="py-6 px-8">
                                            <div className="flex items-center gap-4">
                                                <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 font-black group-hover:scale-105 transition-transform">
                                                    {staff.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-black text-white text-base leading-none tracking-tight">{staff.name}</p>
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mt-1 inline-block">
                                                        {staff.role === 'waiter' ? t('admin.settlements.role.waiter') : t('admin.settlements.role.courier')}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-6 px-8 text-slate-400 font-mono font-bold">
                                            @{staff.username}
                                        </td>
                                        <td className="py-6 px-8 text-right">
                                            <span className={`text-lg font-black tabular-nums tracking-tighter ${
                                                staff.cashInHand > 0 
                                                    ? 'text-emerald-400 shadow-sm shadow-emerald-500/10' 
                                                    : 'text-slate-600'
                                            }`}>
                                                {currencySymbol}{staff.cashInHand.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="py-6 px-8 text-right">
                                            <span className={`text-lg font-black tabular-nums tracking-tighter ${
                                                staff.accumulatedCardTips > 0 
                                                    ? 'text-orange-400 shadow-sm shadow-orange-500/10' 
                                                    : 'text-slate-600'
                                            }`}>
                                                {currencySymbol}{staff.accumulatedCardTips.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="py-6 px-8">
                                            <div className="flex justify-center items-center gap-3">
                                                <button
                                                    onClick={() => setConfirmModal({ isOpen: true, type: 'cash', staff })}
                                                    disabled={staff.cashInHand === 0}
                                                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                                                        staff.cashInHand > 0 
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white shadow-lg shadow-emerald-500/5' 
                                                            : 'bg-white/5 text-slate-500 border border-white/5'
                                                    }`}
                                                >
                                                    {t('admin.settlements.collectCash')}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmModal({ isOpen: true, type: 'tips', staff })}
                                                    disabled={staff.accumulatedCardTips === 0}
                                                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                                                        staff.accumulatedCardTips > 0 
                                                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500 hover:text-white shadow-lg shadow-orange-500/5' 
                                                            : 'bg-white/5 text-slate-500 border border-white/5'
                                                    }`}
                                                >
                                                    {t('admin.settlements.payTips')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Settle Confirm Modal */}
            <AnimatePresence>
                {confirmModal.isOpen && confirmModal.staff && (
                    <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-2xl z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#0f172a] border border-white/10 p-8 rounded-[32px] max-w-md w-full shadow-2xl relative text-center"
                        >
                            <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center text-2xl mb-6 ${
                                confirmModal.type === 'cash' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                            }`}>
                                <FiDollarSign />
                            </div>

                            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">
                                {confirmModal.type === 'cash' ? t('admin.settlements.modal.cashTitle') : t('admin.settlements.modal.tipsTitle')}
                            </h3>
                            
                            <p className="text-sm text-slate-400 font-bold leading-relaxed mb-6">
                                {confirmModal.type === 'cash' ? (
                                    <>
                                        {t('admin.settlements.modal.cashLead').replace('{{name}}', confirmModal.staff.name)}{' '}
                                        <span className="text-emerald-400 text-lg block font-black mt-2">
                                            {currencySymbol}{confirmModal.staff.cashInHand.toFixed(2)}
                                        </span>
                                        {t('admin.settlements.modal.cashTrail')}
                                    </>
                                ) : (
                                    <>
                                        {t('admin.settlements.modal.tipsLead').replace('{{name}}', confirmModal.staff.name)}{' '}
                                        <span className="text-orange-400 text-lg block font-black mt-2">
                                            {currencySymbol}{confirmModal.staff.accumulatedCardTips.toFixed(2)}
                                        </span>
                                        {t('admin.settlements.modal.tipsTrail')}
                                    </>
                                )}
                            </p>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setConfirmModal({ isOpen: false, type: 'cash', staff: null })}
                                    disabled={settling}
                                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-black text-xs uppercase tracking-wider rounded-2xl border border-white/5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                    {t('admin.settlements.cancel')}
                                </button>
                                <button
                                    onClick={handleSettleAction}
                                    disabled={settling}
                                    className={`flex-1 py-4 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                                        confirmModal.type === 'cash' 
                                            ? 'bg-emerald-500 hover:brightness-110 shadow-lg shadow-emerald-500/20' 
                                            : 'bg-orange-500 hover:brightness-110 shadow-lg shadow-orange-500/20'
                                    }`}
                                >
                                    {settling ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <FiCheck /> {t('admin.settlements.confirm')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
