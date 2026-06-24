import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const { getAuthHeaders, logout, user, isAuthenticated } = useAuthStore();
    const userRole = user?.role;
    const navigate = useNavigate();
    const { t } = usePosLocale();
    const [loading, setLoading] = useState(false);
    const [readyOrders, setReadyOrders] = useState<HandoverOrderRow[]>([]);
    const [preparingOrders, setPreparingOrders] = useState<HandoverOrderRow[]>([]);

    // Role guard - only admin and cashier can access
    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (userRole && !['admin', 'cashier'].includes(userRole)) {
            navigate('/');
        }
    }, [userRole, navigate, isAuthenticated]);

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

    const tenantId = useAuthStore(s => s.tenantId);
    const [refreshSignal, setRefreshSignal] = useState(0);

    useEffect(() => {
        void loadStats();
        // Still keep interval as a fallback
        const timer = setInterval(() => void loadStats(), 15_000);
        return () => clearInterval(timer);
    }, [loadStats]);

    useEffect(() => {
        if (!tenantId) return;
        import('socket.io-client').then(({ io }) => {
            const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
            
            socket.on('connect', () => {
                socket.emit('join:tenant', tenantId);
            });

            const handleUpdate = () => {
                void loadStats();
                setRefreshSignal(n => n + 1);
            };

            socket.on('order:new', handleUpdate);
            socket.on('order:status_changed', handleUpdate);
            socket.on('order:ready', handleUpdate);
            socket.on('kitchen:item_ready', handleUpdate);
            socket.on('payment:received', handleUpdate);
            socket.on('tables:updated', handleUpdate);

            return () => {
                socket.disconnect();
            };
        });
    }, [tenantId, loadStats]);

    const lateReadyCount = useMemo(() => {
        const now = Date.now();
        return readyOrders.filter((o) => {
            const created = new Date(String(o.created_at || '')).getTime();
            if (!Number.isFinite(created) || created <= 0) return false;
            return now - created > 20 * 60 * 1000;
        }).length;
    }, [readyOrders]);

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#020617] text-slate-100 font-sans relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
            <header className="shrink-0 border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight leading-none">
                            {t('handover.title_lead')}
                        </h1>
                        <p className="text-slate-400 font-medium mt-1">
                            {t('handover.title_sub')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadStats()}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 font-semibold hover:bg-white/5 transition-colors"
                    >
                        <FiRefreshCcw className={loading ? 'animate-spin' : ''} />
                        {t('handover.refresh')}
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                            <FiCheckCircle size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-emerald-400 leading-none">{readyOrders.length}</span>
                            <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider">{t('handover.ready_order_label')}</span>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400">
                            <FiClock size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-amber-400 leading-none">{preparingOrders.length}</span>
                            <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">{t('handover.preparing_label')}</span>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
                            <FiAlertTriangle size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-rose-400 leading-none">{lateReadyCount}</span>
                            <span className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider">{t('handover.late_label')}</span>
                        </div>
                    </div>
                </div>
            </header>
            <div className="min-h-0 flex-1">
                <HandoverCenterContent variant="standalone_page" refreshSignal={refreshSignal} />
            </div>
        </div>
    );
};

export default HandoverPanel;
