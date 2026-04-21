import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiRefreshCcw } from 'react-icons/fi';
import { HandoverCenterContent } from '../features/handover/HandoverCenterContent';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';

type HandoverOrderRow = {
    id?: number;
    status?: string;
    created_at?: string;
};

/** Tam ekran teslim merkezi — gel-al için «Adisyona ekle» yok; kasa mutfak modalında. */
const HandoverPanel: React.FC = () => {
    const fetchSettings = usePosStore((s) => s.fetchSettings);
    const { getAuthHeaders, logout } = useAuthStore();
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
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-950">
            <header className="shrink-0 border-b border-white/10 bg-slate-900/80 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-wider text-white">Teslim Merkezi</h2>
                        <p className="text-xs text-slate-400">Canli durum ozeti + hizli teslim operasyonu</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadStats()}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                        Yenile
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                        <div className="flex items-center gap-2 text-blue-300">
                            <FiCheckCircle />
                            <span className="text-[11px] font-bold uppercase">Hazir Siparis</span>
                        </div>
                        <p className="mt-1 text-2xl font-black text-white">{readyOrders.length}</p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <div className="flex items-center gap-2 text-amber-300">
                            <FiClock />
                            <span className="text-[11px] font-bold uppercase">Hazirlaniyor</span>
                        </div>
                        <p className="mt-1 text-2xl font-black text-white">{preparingOrders.length}</p>
                    </div>
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                        <div className="flex items-center gap-2 text-rose-300">
                            <FiAlertTriangle />
                            <span className="text-[11px] font-bold uppercase">20+ dk Bekleyen</span>
                        </div>
                        <p className="mt-1 text-2xl font-black text-white">{lateReadyCount}</p>
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
