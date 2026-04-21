import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiRefreshCcw } from 'react-icons/fi';
import { HandoverCenterContent } from '../features/handover/HandoverCenterContent';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';
import { usePosLocale } from '../contexts/PosLocaleContext';

type HandoverOrderRow = {
    id?: number;
    status?: string;
    created_at?: string;
};

/** Tam ekran teslim merkezi — gel-al için «Adisyona ekle» yok; kasa mutfak modalında. */
const HandoverPanel: React.FC = () => {
    const fetchSettings = usePosStore((s) => s.fetchSettings);
    const getAuthHeaders = useAuthStore(s => s.getAuthHeaders);
    const logout = useAuthStore(s => s.logout);
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(false);
    const [readyOrders, setReadyOrders] = useState<HandoverOrderRow[]>([]);
    const [preparingOrders, setPreparingOrders] = useState<HandoverOrderRow[]>([]);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders();
            const [readyRes, preparingRes] = await Promise.all([
                fetch('/api/v1/orders?status=ready', { headers }),
                fetch('/api/v1/orders?status=preparing', { headers }),
            ]);
            if (readyRes.status === 401 || preparingRes.status === 401) {
                logout();
                return;
            }
            const readyData = readyRes.ok ? await readyRes.json() : [];
            const preparingData = preparingRes.ok ? await preparingRes.json() : [];
            setReadyOrders(Array.isArray(readyData) ? readyData : []);
            setPreparingOrders(Array.isArray(preparingData) ? preparingData : []);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders, logout]);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        void loadStats();
        const timer = setInterval(() => void loadStats(), 15_000);
        return () => clearInterval(timer);
    }, [loadStats]);

    const lateReadyCount = useMemo(() => {
        const now = Date.now();
        return readyOrders.filter((o) => {
            const created = new Date(String(o.created_at || '')).getTime();
            if (!Number.isFinite(created) || created <= 0) return false;
            return now - created > 20 * 60 * 1000;
        }).length;
    }, [readyOrders]);

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
            <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight leading-none">
                            {t('handover.title_lead')}
                        </h1>
                        <p className="text-slate-500 font-medium mt-1">
                            {t('handover.title_sub')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadStats()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                        {t('handover.refresh')}
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500">
                            <FiCheckCircle size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-emerald-600 leading-none">{readyOrders.length}</span>
                            <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-wider">{t('handover.ready_order_label')}</span>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                        <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                            <FiClock size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-amber-600 leading-none">{preparingOrders.length}</span>
                            <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider">{t('handover.preparing_label')}</span>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                        <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500">
                            <FiAlertTriangle size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-rose-600 leading-none">{lateReadyCount}</span>
                            <span className="text-[10px] font-bold text-rose-500/80 uppercase tracking-wider">{t('handover.late_label')}</span>
                        </div>
                    </div>
                </div>
            </header>
            <div className="min-h-0 flex-1">
                <HandoverCenterContent variant="standalone_page" />
            </div>
        </div>
    );
};

export default HandoverPanel;
