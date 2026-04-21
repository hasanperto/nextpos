import React, { useState } from 'react';
import { FiMove, FiGitMerge, FiX, FiCheck, FiArrowRight, FiSettings, FiShoppingCart } from 'react-icons/fi';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosStore, type CashierTableInfo } from '../../../store/usePosStore';
import toast from 'react-hot-toast';
import { SplitBillModal } from './SplitBillModal';
import { usePosLocale } from '../../../contexts/PosLocaleContext';

interface TableActionModalProps {
    sourceTable: CashierTableInfo;
    onClose: () => void;
}

export const TableActionModal: React.FC<TableActionModalProps> = ({ sourceTable, onClose }) => {
    const { tables, fetchTables } = usePosStore();
    const [action, setAction] = useState<'transfer' | 'merge' | 'split' | null>(null);
    const [targetTableId, setTargetTableId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const { token, tenantId } = useAuthStore();
    const { t } = usePosLocale();

    if (action === 'split' && sourceTable.active_session_id) {
        return (
            <SplitBillModal 
                sessionId={Number(sourceTable.active_session_id)}
                tableName={sourceTable.name}
                onClose={() => setAction(null)}
            />
        );
    }

    const handleConfirm = async () => {
        if (!targetTableId || !action) return;
        setLoading(true);
        try {
            const endpoint = action === 'transfer' ? 'transfer' : 'merge';
            const res = await fetch(`/api/v1/tables/${sourceTable.id}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-tenant-id': tenantId || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ targetTableId })
            });

            if (res.ok) {
                toast.success(action === 'transfer' ? t('floor.transferTable') : t('floor.mergeTable'));
                await fetchTables();
                onClose();
            } else {
                const err = await res.json();
                toast.error(err.error || t('toast.orderFailed'));
            }
        } catch (e) {
            toast.error(t('toast.orderFailed'));
        } finally {
            setLoading(false);
        }
    };

    const targetCandidates = action === 'transfer' 
        ? tables.filter(t => t.id !== sourceTable.id && (t.active_session_id === null || Number(t.active_session_id) === 0))
        : tables.filter(t => t.id !== sourceTable.id && (t.active_session_id !== null && Number(t.active_session_id) !== 0));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
            <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-300 rounded-[3rem] bg-[#141517] border border-white/5 shadow-2xl overflow-hidden">
                
                {/* Header */}
                <div className="p-10 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
                            <FiSettings size={28} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tighter">{t('floor.actionsTitle')}: {sourceTable.name}</h3>
                            <p className="text-xs font-bold text-white/20 uppercase tracking-[0.3em] mt-1">{t('floor.actionsDesc')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-colors">
                        <FiX size={24} />
                    </button>
                </div>

                <div className="p-10 grid grid-cols-2 gap-10">
                    {/* Left: Action Selection */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">{t('floor.selectAction')}</label>
                        <div className="grid grid-cols-1 gap-4">
                            <ActionButton 
                                active={action === 'split'} 
                                onClick={() => setAction('split')}
                                icon={<FiShoppingCart />} 
                                title={t('floor.splitBill')} 
                                desc={t('floor.splitBillDesc')}
                                color="emerald"
                            />
                            <ActionButton 
                                active={action === 'transfer'} 
                                onClick={() => { setAction('transfer'); setTargetTableId(null); }}
                                icon={<FiMove />} 
                                title={t('floor.transferTable')} 
                                desc={t('floor.transferTableDesc')}
                                color="blue"
                            />
                            <ActionButton 
                                active={action === 'merge'} 
                                onClick={() => { setAction('merge'); setTargetTableId(null); }}
                                icon={<FiGitMerge />} 
                                title={t('floor.mergeTable')} 
                                desc={t('floor.mergeTableDesc')}
                                color="amber"
                            />
                        </div>
                    </div>

                    {/* Right: Target Table Selection */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">
                            {action ? (action === 'split' ? t('floor.splitBillActive') : (action === 'transfer' ? t('floor.selectTargetTable') : t('floor.selectTargetOccupied'))) : t('floor.selectAction')}
                        </label>
                        <div className="bg-white/5 rounded-[2rem] border border-white/5 min-h-[350px] max-h-[350px] overflow-y-auto p-4 pos-scrollbar grid grid-cols-3 gap-3 content-start">
                            {action ? (
                                action === 'split' ? (
                                    <div className="col-span-3 h-full flex flex-col items-center justify-center text-center p-10 text-emerald-400/40 animate-pulse">
                                        <FiShoppingCart size={64} className="mb-4" />
                                        <p className="text-sm font-black uppercase tracking-widest">{t('floor.openingSplitBill')}</p>
                                    </div>
                                ) : (
                                    targetCandidates.length > 0 ? (
                                        targetCandidates.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => setTargetTableId(t.id)}
                                                className={`h-22 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                                                    targetTableId === t.id 
                                                        ? 'border-emerald-500/50 bg-emerald-500/10 text-white' 
                                                        : 'border-white/5 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                                                }`}
                                            >
                                                <span className="font-black text-lg">{t.name}</span>
                                                <span className="text-[10px] font-bold uppercase tracking-tight opacity-50">{t.section_name}</span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="col-span-3 h-full flex items-center justify-center text-center p-10 text-white/20">
                                            <p className="text-sm font-bold uppercase tracking-widest">{t('floor.noSuitableTable')}</p>
                                        </div>
                                    )
                                )
                            ) : (
                                <div className="col-span-3 h-full flex flex-col items-center justify-center text-center p-10 text-white/10">
                                    <FiArrowRight size={48} className="mb-4 opacity-10" />
                                    <p className="text-sm font-bold uppercase tracking-widest">{t('floor.selectAction')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-10 bg-black/20 border-t border-white/5 flex gap-4">
                    <button 
                        disabled={!targetTableId || loading || action === 'split'}
                        onClick={handleConfirm}
                        className={`flex-1 h-16 rounded-[1.5rem] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
                            targetTableId && action !== 'split'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/20 active:scale-95' 
                                : 'bg-white/5 text-white/10 cursor-not-allowed'
                        }`}
                    >
                        {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><FiCheck size={20} /> {t('floor.confirmAction')}</>}
                    </button>
                    <button 
                        onClick={onClose}
                        className="px-8 h-16 rounded-[1.5rem] bg-white/5 hover:bg-white/10 text-white/40 font-black text-sm uppercase tracking-widest transition-all"
                    >
                        {t('floor.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ActionButton: React.FC<{ active: boolean, onClick: any, icon: any, title: string, desc: string, color: 'blue' | 'amber' | 'emerald' }> = ({ active, onClick, icon, title, desc, color }) => {
    const colors = {
        blue: active ? 'border-blue-500/50 bg-blue-500/10 text-white' : 'border-white/5 bg-white/5 text-white/40 hover:bg-white/10',
        amber: active ? 'border-amber-500/50 bg-amber-500/10 text-white' : 'border-white/5 bg-white/5 text-white/40 hover:bg-white/10',
        emerald: active ? 'border-emerald-500/50 bg-emerald-500/10 text-white' : 'border-white/5 bg-white/5 text-white/40 hover:bg-white/10'
    };
    return (
                <button type="button" onClick={onClick} className={`p-5 rounded-[1.5rem] border-2 text-left flex items-start gap-4 transition-all ${colors[color]}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-current/10 text-current' : 'bg-white/5 text-white/20'}`}>
                {React.cloneElement(icon, { size: 20 })}
            </div>
            <div>
                <p className="font-black tracking-tight text-sm">{title}</p>
                        <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-0.5 leading-relaxed">{desc}</p>
            </div>
        </button>
    );
};
