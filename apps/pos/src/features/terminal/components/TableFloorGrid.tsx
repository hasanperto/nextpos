import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FiGrid, FiRefreshCcw, FiClock, FiSettings } from 'react-icons/fi';
import { usePosStore, type CashierTableInfo } from '../../../store/usePosStore';
import { TableOpenModal } from './TableOpenModal';
import { TableActionModal } from './TableActionModal';
import { useUIStore } from '../../../store/useUIStore';
import { useSocketStore } from '../../../store/useSocketStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import { getLongOccupiedThresholdMinutes } from '../../../lib/floorSettings';

export const TableFloorGrid: React.FC = () => {
    const {
        tables,
        fetchTables,
        openTableSession,
        setSelectedTable,
        setCashierView,
        setOrderType,
        occupiedTableCount,
        settings,
        fetchSettings,
    } = usePosStore();

    const { tablePresence } = useUIStore();
    const socket = useSocketStore((s) => s.socket);
    const { user, tenantId } = useAuthStore();

    const [sectionTab, setSectionTab] = useState<string>('all');
    const [openingTable, setOpeningTable] = useState<CashierTableInfo | null>(null);
    const [actionTable, setActionTable] = useState<CashierTableInfo | null>(null);
    const { t } = usePosLocale();
    const [tick, setTick] = useState(0);

    // Refresh duration every minute
    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        void fetchTables();
        void fetchSettings();
    }, [fetchTables, fetchSettings]);

    const formatDuration = (openedAt?: string) => {
        if (!openedAt) return `0${t('floor.minsShort')}`;
        const start = new Date(openedAt).getTime();
        const diff = Date.now() - start;
        const mins = Math.floor(diff / 60000);
        if (mins < 0) return `0${t('floor.minsShort')}`;
        const hours = Math.floor(mins / 60);
        if (hours > 0) return `${hours}${t('floor.hoursShort')} ${mins % 60}${t('floor.minsShort')}`;
        return `${mins}${t('floor.minsShort')}`;
    };

    const sections = useMemo(() => {
        const names = new Set<string>();
        tables.forEach((table) => {
            const s = table.section_name || t('floor.general');
            names.add(s);
        });
        return ['all', ...Array.from(names).sort()];
    }, [tables, t]);

    const filtered = useMemo(() => {
        if (sectionTab === 'all') return tables;
        return tables.filter((table) => (table.section_name || t('floor.general')) === sectionTab);
    }, [tables, sectionTab, t]);

    const selectTable = async (table: CashierTableInfo) => {
        const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
        
        if (!busy) {
            setOpeningTable(table);
            return;
        }

        // Dolu masaya direkt git
        setSelectedTable({
            id: table.id,
            name: table.name,
            translations: table.translations,
            sectionName: table.section_name || t('floor.general'),
            sessionId: Number(table.active_session_id),
            customerName: table.customer_name,
            guestName: table.guest_name,
            guestCount: table.guest_count
        });
        setOrderType('dine_in');
        setCashierView('menu');
    };

    const confirmOpen = async (guestCount: number, customerId: number | null) => {
        if (!openingTable) return;
        try {
            const opened = await openTableSession(openingTable.id, guestCount, customerId);
            if (opened) {
                setSelectedTable({
                    id: openingTable.id,
                    name: openingTable.name,
                    translations: openingTable.translations,
                    sectionName: openingTable.section_name || t('floor.general'),
                    sessionId: opened.sessionId,
                });
                setOrderType('dine_in');
                setCashierView('menu');
            } else {
                toast.error(t('toast.tableOpenFailed'));
            }
        } finally {
            setOpeningTable(null);
        }
    };

    const minutesOccupied = (table: CashierTableInfo) => {
        const tAny = table as CashierTableInfo & { session_opened_at?: string };
        const opened = tAny.session_opened_at || table.opened_at;
        if (!opened) return 0;
        return Math.floor((Date.now() - new Date(opened).getTime()) / 60000);
    };

    const longOccupiedThreshold = useMemo(() => getLongOccupiedThresholdMinutes(settings), [settings]);

    /** Garson paneli ile aynı: dolu = amber; Admin eşiğini aşınca kırmızı */
    const getTableColors = (table: CashierTableInfo) => {
        const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
        const status = table.status;

        if (status === 'reserved') {
            return 'border-rose-500/40 bg-gradient-to-br from-rose-600/30 to-red-600/10 text-white shadow-rose-500/10';
        }

        if (busy) {
            const long = minutesOccupied(table) > longOccupiedThreshold;
            if (long) {
                return 'border-red-500/55 bg-gradient-to-br from-red-600/35 via-rose-700/25 to-red-950/30 text-white shadow-[0_10px_36px_-10px_rgba(239,68,68,0.45)] ring-2 ring-red-500/20';
            }
            return 'border-amber-500/50 bg-gradient-to-br from-amber-500/25 to-orange-700/15 text-white shadow-[0_8px_32px_-12px_rgba(245,158,11,0.35)]';
        }

        return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/60 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-400 shadow-black/20';
    };

    const { lang } = usePosStore();
    const getTableName = (table: CashierTableInfo) => {
        if (table.translations && table.translations[lang]) {
            return table.translations[lang];
        }
        return table.name;
    };

    const occ = occupiedTableCount();
    return (
        <section key={tick} className="flex flex-1 flex-col overflow-hidden rounded-3xl bg-[var(--color-pos-bg-primary)] border border-[var(--color-pos-border-default)] shadow-2xl">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-pos-border-default)] px-6 py-4 bg-black/20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <FiGrid size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-white tracking-tight uppercase">{t('floor.title')}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {t('floor.occupancy')}: {occ}/{tables.length}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => void fetchTables()}
                    className="group flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all"
                >
                    <FiRefreshCcw size={12} className="group-hover:rotate-180 transition-transform duration-500" /> {t('floor.refresh')}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-4 border-b border-white/5 overflow-x-auto pos-scrollbar bg-black/10">
                {sections.map((s) => (
                    <button
                        key={s}
                        onClick={() => setSectionTab(s)}
                        className={`shrink-0 rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                            sectionTab === s
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white border border-white/5'
                        }`}
                    >
                        {s === 'all' ? t('floor.allSections') : s}
                    </button>
                ))}
            </div>

            {/* Master View Area */}
            <div className="flex-1 overflow-auto bg-gradient-to-b from-transparent to-black/20 p-6 pos-scrollbar">
                {settings?.integrations?.floorPlanMode === 'visual' ? (
                    /* Visual Floor Plan Mode */
                    <div className="relative min-h-[600px] w-full rounded-2xl border-2 border-dashed border-white/5 bg-black/10 overflow-hidden">
                        {filtered.map((table) => {
                            const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
                            const presence = tablePresence[table.id];

                            return (
                                <button
                                    key={table.id}
                                    onClick={() => selectTable(table)}
                                    className={`absolute flex flex-col items-center justify-center p-2 transition-all active:scale-95 shadow-xl border-2
                                        ${getTableColors(table)}
                                        ${table.shape === 'round' ? 'rounded-full' : (table.shape === 'rect' ? 'rounded-[1.5rem]' : 'rounded-2xl')}
                                    `}
                                    style={{
                                        left: `${table.position_x || 0}px`,
                                        top: `${table.position_y || 0}px`,
                                        width: table.shape === 'rect' ? (table.capacity ? table.capacity * 30 : 100) : 100,
                                        height: 100
                                    }}
                                >
                                    <span className="text-lg font-black tracking-tighter leading-none">{getTableName(table)}</span>
                                    {busy && (table.customer_name || table.guest_name) && (
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tight mt-0.5 line-clamp-1">
                                            {table.customer_name || table.guest_name}
                                        </span>
                                    )}
                                    {busy && table.guest_count != null && table.guest_count > 0 && (
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-tight">
                                            {table.guest_count} {t('cart.guestCount')}
                                        </span>
                                    )}
                                    {busy && table.total_amount != null && (
                                        <span className="text-[10px] font-black opacity-60">{settings?.currency || '€'}{Number(table.total_amount).toFixed(2)}</span>
                                    )}
                                    {presence && (
                                        <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white animate-pulse" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    /* Default Grid Mode */
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {filtered.map((table) => {
                            const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
                            const tObj = table as any;
                            const occMin = minutesOccupied(table);
                            const presence = tablePresence[table.id];
                            const isBeingEditedByOthers = presence && String(presence.waiterId) !== String(user?.id);

                            return (
                                <div 
                                    key={table.id} 
                                    className="relative group"
                                    onMouseEnter={() => {
                                        if (socket && tenantId) {
                                            socket.emit('table:focus', { 
                                                tenantId, 
                                                tableId: table.id, 
                                                waiterId: user?.id, 
                                                waiterName: user?.username 
                                            });
                                        }
                                    }}
                                    onMouseLeave={() => {
                                        if (socket && tenantId) {
                                            socket.emit('table:blur', { 
                                                tenantId, 
                                                tableId: table.id, 
                                                waiterId: user?.id 
                                            });
                                        }
                                    }}
                                >
                                    <button
                                        onClick={() => selectTable(table)}
                                        className={`relative w-full h-32 rounded-[2.2rem] border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-xl ${getTableColors(table)}`}
                                    >
                                        <span className="text-xl font-black tracking-tighter leading-none">{getTableName(table)}</span>
                                        {busy && (table.customer_name || table.guest_name) && (
                                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tight mt-0.5 px-2 line-clamp-1 text-center">
                                                {table.customer_name || table.guest_name}
                                            </span>
                                        )}
                                        {busy && table.total_amount != null && Number(table.total_amount) > 0 && (
                                            <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-black text-white shadow-lg border border-white/10">
                                                {settings?.currency || '€'}{Number(table.total_amount).toFixed(2)}
                                            </div>
                                        )}

                                        {presence && (
                                            <div className={`absolute -top-1 -left-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg border animate-in zoom-in slide-in-from-top-1 ${
                                                isBeingEditedByOthers 
                                                    ? 'bg-rose-600/90 text-white border-rose-400/50' 
                                                    : 'bg-indigo-600/90 text-white border-indigo-400/50'
                                            }`}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                    {isBeingEditedByOthers ? `${presence.waiterName} ${t('floor.viewing')}` : t('floor.youAreViewing')}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-col items-center">
                                            <span
                                                className={`text-[10px] font-black uppercase tracking-widest ${
                                                    table.status === 'reserved'
                                                        ? 'text-rose-400'
                                                        : busy && occMin > longOccupiedThreshold
                                                          ? 'text-red-400'
                                                          : busy
                                                            ? 'text-amber-400'
                                                            : 'text-emerald-400/40'
                                                }`}
                                            >
                                                {table.status === 'reserved' ? t('floor.reserved') : (busy ? t('floor.busy') : t('floor.empty'))}
                                            </span>
                                            {busy && tObj.guest_count > 0 && (
                                                <span className="text-[10px] font-black text-white/50 mt-0.5">
                                                    {tObj.guest_count} {t('cart.guestCount')}
                                                </span>
                                            )}
                                            {busy && (
                                                <div className="flex items-center gap-1 mt-1 text-white/40">
                                                    <FiClock size={10} />
                                                    <span className="text-[10px] font-bold tabular-nums">
                                                        {formatDuration(tObj.session_opened_at)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Capacity Indicator dots */}
                                        <div className="absolute bottom-3 flex gap-1">
                                            {[...Array(Math.min(4, table.capacity || 0))].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-1 h-1 rounded-full ${
                                                        busy && occMin > longOccupiedThreshold ? 'bg-red-400/55' : busy ? 'bg-amber-400/45' : 'bg-white/10'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                    </button>
                                    
                                    {busy && (
                                        <button 
                                            className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-emerald-500 hover:border-emerald-400 transition-all shadow-xl z-10 scale-0 group-hover:scale-100"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActionTable(table);
                                            }}
                                        >
                                            <FiSettings size={16} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-black/40 border-t border-white/5 text-center">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">
                    {t('floor.footerHint')}
                </p>
            </div>

            {/* Modals */}
            {openingTable && (
                <TableOpenModal 
                    tableId={openingTable.id}
                    tableName={openingTable.name}
                    onClose={() => setOpeningTable(null)}
                    onConfirm={confirmOpen}
                />
            )}

            {actionTable && (
                <TableActionModal 
                    sourceTable={actionTable}
                    onClose={() => setActionTable(null)}
                />
            )}
        </section>
    );
};
