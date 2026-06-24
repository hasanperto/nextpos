import React, { useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { FiGrid, FiRefreshCcw, FiClock, FiSettings, FiUser, FiMap } from 'react-icons/fi';
import { usePosStore, type CashierTableInfo } from '../../../store/usePosStore';
import { TableOpenModal } from './TableOpenModal';
import { TableActionModal } from './TableActionModal';
import { useUIStore } from '../../../store/useUIStore';
import { useSocketStore } from '../../../store/useSocketStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePosLocale } from '../../../contexts/PosLocaleContext';
import { useNotificationStore, type NotificationKind } from '../../../store/useNotificationStore';

interface DBSection {
    id: number;
    name: string;
    floor?: number;
    sort_order?: number;
    is_active?: boolean;
    layout_data?: {
        bg?: {
            url?: string;
            x?: number;
            y?: number;
            scale?: number;
            opacity?: number;
        };
        elements?: Array<{
            id: string | number;
            type: string;
            x: number;
            y: number;
            width: number;
            height: number;
            rotation?: number;
            label?: string;
        }>;
    };
}

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
    const { user, tenantId, getAuthHeaders } = useAuthStore();

    const [sectionTab, setSectionTab] = useState<string>('all');
    const [openingTable, setOpeningTable] = useState<CashierTableInfo | null>(null);
    const [actionTable, setActionTable] = useState<CashierTableInfo | null>(null);
    const { t } = usePosLocale();
    const [tick, setTick] = useState(0);

    const [dbSections, setDbSections] = useState<DBSection[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState<number>(1);
    const [offsets, setOffsets] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    // Bildirim pulse animasyonları
    const glowingTables = useNotificationStore((s) => s.glowingTables);

    // Kasiyer aktif kat planı görünüm modu tercihi: 'grid' | 'visual'
    const [viewMode, setViewMode] = useState<'grid' | 'visual'>(() => {
        const saved = localStorage.getItem('nextpos-floor-viewmode');
        if (saved === 'grid' || saved === 'visual') return saved;
        return (settings?.integrations?.floorPlanMode === 'visual') ? 'visual' : 'grid';
    });

    useEffect(() => {
        if (settings?.integrations?.floorPlanMode) {
            const saved = localStorage.getItem('nextpos-floor-viewmode');
            if (!saved) {
                setViewMode(settings.integrations.floorPlanMode === 'visual' ? 'visual' : 'grid');
            }
        }
    }, [settings?.integrations?.floorPlanMode]);

    const handleViewModeChange = (mode: 'grid' | 'visual') => {
        setViewMode(mode);
        localStorage.setItem('nextpos-floor-viewmode', mode);
    };

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

        // Sort names based on their order in dbSections (which is ordered by sort_order ASC, id ASC)
        const sortedNames = Array.from(names).sort((a, b) => {
            const idxA = dbSections.findIndex(sec => sec.name === a);
            const idxB = dbSections.findIndex(sec => sec.name === b);

            if (idxA !== -1 && idxB !== -1) {
                return idxA - idxB;
            }
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;

            return a.localeCompare(b);
        });

        return ['all', ...sortedNames];
    }, [tables, dbSections, t]);

    const filtered = useMemo(() => {
        if (sectionTab === 'all') return tables;
        return tables.filter((table) => (table.section_name || t('floor.general')) === sectionTab);
    }, [tables, sectionTab, t]);

    // Fetch sections
    useEffect(() => {
        const fetchSections = async () => {
            try {
                const res = await fetch('/api/v1/tables/sections', { headers: getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setDbSections(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('Failed to load sections:', err);
            }
        };
        void fetchSections();
    }, [getAuthHeaders]);

    // find active DbSection from sectionTab
    const activeDbSection = useMemo(() => {
        return dbSections.find(s => s.name === sectionTab);
    }, [dbSections, sectionTab]);

    // Calculate bounding box of active section elements (tables + layout elements)
    const bounds = useMemo(() => {
        let minX = 2000;
        let maxX = 0;
        let minY = 2000;
        let maxY = 0;
        let hasElements = false;

        // Active tables bounds
        filtered.forEach((table) => {
            const tx = table.position_x ?? 100;
            const ty = table.position_y ?? 100;
            const tw = table.shape === 'rect' ? 160 : 80;
            const th = 80;

            // Include margin for chairs
            const margin = 30;
            minX = Math.min(minX, tx - margin);
            maxX = Math.max(maxX, tx + tw + margin);
            minY = Math.min(minY, ty - margin);
            maxY = Math.max(maxY, ty + th + margin);
            hasElements = true;
        });

        // Architectural obstacles bounds
        if (activeDbSection?.layout_data?.elements) {
            activeDbSection.layout_data.elements.forEach((el: any) => {
                const ex = el.x ?? 0;
                const ey = el.y ?? 0;
                const ew = el.width ?? 0;
                const eh = el.height ?? 0;

                minX = Math.min(minX, ex);
                maxX = Math.max(maxX, ex + ew);
                minY = Math.min(minY, ey);
                maxY = Math.max(maxY, ey + eh);
                hasElements = true;
            });
        }

        // Background image bounds if exists
        if (activeDbSection?.layout_data?.bg) {
            const bg = activeDbSection.layout_data.bg;
            const bgX = bg.x ?? 0;
            const bgY = bg.y ?? 0;
            minX = Math.min(minX, bgX);
            minY = Math.min(minY, bgY);
            // Default 1200x800 background bounding box
            maxX = Math.max(maxX, bgX + 1200 * (bg.scale ?? 1));
            maxY = Math.max(maxY, bgY + 800 * (bg.scale ?? 1));
            hasElements = true;
        }

        if (!hasElements) {
            // Default fallback
            return { minX: 0, maxX: 2000, minY: 0, maxY: 2000, width: 2000, height: 2000 };
        }

        // Add some safety padding
        const padding = 50;
        const finalMinX = Math.max(0, minX - padding);
        const finalMaxX = Math.min(2000, maxX + padding);
        const finalMinY = Math.max(0, minY - padding);
        const finalMaxY = Math.min(2000, maxY + padding);

        return {
            minX: finalMinX,
            maxX: finalMaxX,
            minY: finalMinY,
            maxY: finalMaxY,
            width: finalMaxX - finalMinX,
            height: finalMaxY - finalMinY
        };
    }, [filtered, activeDbSection]);

    // auto-selection of first salon/section when viewMode is visual and sectionTab is all
    useEffect(() => {
        if (viewMode === 'visual' && sectionTab === 'all' && sections.length > 1) {
            const firstSec = sections.find(s => s !== 'all');
            if (firstSec) {
                setSectionTab(firstSec);
            }
        }
    }, [viewMode, sectionTab, sections]);

    // auto-scaling calculation based on active bounds
    useEffect(() => {
        if (viewMode !== 'visual') return;

        const updateScale = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const containerW = rect.width || 800;
            const containerH = rect.height || 600;

            const contentW = bounds.width;
            const contentH = bounds.height;

            // Calculate scale to fit the bounds perfectly inside the container
            const s = Math.min(containerW / contentW, containerH / contentH);
            setScale(s);

            // Compute offsets to center the active bounds inside the container
            const ox = (containerW - contentW * s) / 2 - bounds.minX * s;
            const oy = (containerH - contentH * s) / 2 - bounds.minY * s;
            
            setOffsets({ x: ox, y: oy });
        };

        updateScale();

        const observer = new ResizeObserver(() => {
            updateScale();
        });
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        window.addEventListener('resize', updateScale);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateScale);
        };
    }, [viewMode, sectionTab, bounds]);

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

    const renderVisualChairs = (shape: string) => {
        const chairClass = "absolute bg-[#111827] border border-[#374151]/50 rounded shadow-md z-0";
        if (shape === 'round') {
            return (
                <>
                    <div className={`${chairClass} w-5 h-4 -top-3 left-1/2 -translate-x-1/2 rounded-t`} />
                    <div className={`${chairClass} w-5 h-4 -bottom-3 left-1/2 -translate-x-1/2 rounded-b`} />
                </>
            );
        } else if (shape === 'rect') {
            return (
                <>
                    <div className={`${chairClass} w-5 h-4 -top-3 left-[20%] -translate-x-1/2 rounded-t`} />
                    <div className={`${chairClass} w-5 h-4 -top-3 left-1/2 -translate-x-1/2 rounded-t`} />
                    <div className={`${chairClass} w-5 h-4 -top-3 left-[80%] -translate-x-1/2 rounded-t`} />
                    <div className={`${chairClass} w-5 h-4 -bottom-3 left-[20%] -translate-x-1/2 rounded-b`} />
                    <div className={`${chairClass} w-5 h-4 -bottom-3 left-1/2 -translate-x-1/2 rounded-b`} />
                    <div className={`${chairClass} w-5 h-4 -bottom-3 left-[80%] -translate-x-1/2 rounded-b`} />
                </>
            );
        } else {
            // square or standard
            return (
                <>
                    <div className={`${chairClass} w-5 h-4 -top-3 left-1/2 -translate-x-1/2 rounded-t`} />
                    <div className={`${chairClass} w-5 h-4 -bottom-3 left-1/2 -translate-x-1/2 rounded-b`} />
                    <div className={`${chairClass} w-4 h-5 -left-3 top-1/2 -translate-y-1/2 rounded-l`} />
                    <div className={`${chairClass} w-4 h-5 -right-3 top-1/2 -translate-y-1/2 rounded-r`} />
                </>
            );
        }
    };

    type FloorTableStatus = 'empty' | 'occupied' | 'bill_requested' | 'pending_qr' | 'ready' | 'reserved';

    const resolveTableStatus = (table: CashierTableInfo): FloorTableStatus => {
        const raw = String(table.status || '').toLowerCase();
        if (raw === 'reserved') return 'reserved';
        if (raw === 'bill_requested') return 'bill_requested';
        if (raw === 'waiting_order' || raw === 'pending_qr') return 'pending_qr';
        if (glowingTables.get(table.id) === 'item_ready' || raw === 'ready') return 'ready';
        const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
        if (busy || raw === 'occupied') return 'occupied';
        return 'empty';
    };

    const getTableColors = (table: CashierTableInfo) => {
        switch (resolveTableStatus(table)) {
            case 'reserved':
                return 'border-violet-500 bg-violet-950/45 text-violet-100 shadow-[0_0_15px_rgba(139,92,246,0.3)]';
            case 'bill_requested':
                return 'border-blue-500 bg-blue-950/45 text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.3)]';
            case 'pending_qr':
                return 'border-amber-400 bg-amber-950/45 text-amber-100 shadow-[0_0_15px_rgba(251,191,36,0.3)]';
            case 'ready':
                return 'border-orange-500 bg-orange-950/45 text-orange-100 shadow-[0_0_15px_rgba(249,115,22,0.3)]';
            case 'occupied':
                return 'border-red-500 bg-red-950/50 text-red-50 shadow-[0_0_15px_rgba(239,68,68,0.35)]';
            default:
                return 'border-emerald-500 bg-emerald-950/45 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:border-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-200';
        }
    };

    const getTableStatusLabel = (table: CashierTableInfo) => {
        switch (resolveTableStatus(table)) {
            case 'reserved': return t('floor.reserved');
            case 'bill_requested': return t('waiter.status_bill_requested');
            case 'pending_qr': return t('waiter.qr_tablet_order_badge');
            case 'ready': return t('waiter.status_kitchen_ready');
            case 'occupied': return t('floor.busy');
            default: return t('floor.empty');
        }
    };

    const renderPresenceOverlay = (tableId: number) => {
        const presence = tablePresence[tableId];
        if (!presence) return null;
        const isBeingEditedByOthers = String(presence.waiterId) !== String(user?.id);
        return (
            <div className={`absolute -top-1 left-1/2 -translate-x-1/2 z-40 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg border whitespace-nowrap ${
                isBeingEditedByOthers
                    ? 'bg-rose-600/90 text-white border-rose-400/50'
                    : 'bg-indigo-600/90 text-white border-indigo-400/50'
            }`}>
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    {isBeingEditedByOthers ? `${presence.waiterName} ${t('floor.viewing')}` : t('floor.youAreViewing')}
                </div>
            </div>
        );
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
                <div className="flex items-center gap-4">
                    {/* Görünüm Seçici (View Switcher Switcher) */}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                        <button
                            onClick={() => handleViewModeChange('grid')}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${
                                viewMode === 'grid'
                                    ? 'bg-white text-black shadow-lg font-black'
                                    : 'text-white/40 hover:text-white/80'
                            }`}
                        >
                            <FiGrid size={12} /> GRİD LİSTE
                        </button>
                        <button
                            onClick={() => handleViewModeChange('visual')}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${
                                viewMode === 'visual'
                                    ? 'bg-white text-black shadow-lg font-black'
                                    : 'text-white/40 hover:text-white/80'
                            }`}
                        >
                            <FiMap size={12} /> GÖRSEL PLAN
                        </button>
                    </div>

                    <button
                        onClick={() => void fetchTables()}
                        className="group flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <FiRefreshCcw size={12} className="group-hover:rotate-180 transition-transform duration-500" /> {t('floor.refresh')}
                    </button>
                </div>
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
            <div className="flex-1 overflow-auto bg-gradient-to-b from-transparent to-black/20 p-6 pos-scrollbar flex flex-col">
                {viewMode === 'visual' ? (
                    /* Visual Floor Plan Mode with Auto-Scaling & Background layout drawings */
                    <div 
                        ref={containerRef} 
                        className="flex-1 w-full min-h-[500px] xl:min-h-[600px] relative bg-[#040815] border border-white/5 rounded-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200"
                        style={{
                            boxShadow: 'inset 0 0 100px rgba(0,0,0,0.9)'
                        }}
                    >
                        {/* Scaled Canvas wrapper */}
                        <div 
                            className="absolute origin-top-left transition-all duration-300"
                            style={{
                                transform: `scale(${scale})`,
                                left: `${offsets.x}px`,
                                top: `${offsets.y}px`,
                                width: '2000px',
                                height: '2000px',
                                backgroundImage: `
                                    linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                                    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                                `,
                                backgroundSize: '40px 40px',
                            }}
                        >
                            {/* Background drawings / image */}
                            {activeDbSection?.layout_data?.bg?.url && (
                                <div 
                                    className="absolute pointer-events-none transition-all duration-75 select-none"
                                    style={{
                                        left: `${activeDbSection.layout_data.bg.x ?? 0}px`,
                                        top: `${activeDbSection.layout_data.bg.y ?? 0}px`,
                                        width: 'auto',
                                        height: 'auto',
                                        maxWidth: 'none',
                                        transform: `scale(${activeDbSection.layout_data.bg.scale ?? 1})`,
                                        transformOrigin: 'top left',
                                        opacity: activeDbSection.layout_data.bg.opacity ?? 0.4,
                                        zIndex: 5
                                    }}
                                >
                                    <img 
                                        src={activeDbSection.layout_data.bg.url} 
                                        alt="Kat Planı Arkaplanı" 
                                        className="select-none pointer-events-none"
                                        draggable={false}
                                    />
                                </div>
                            )}

                            {/* Architectural elements (walls, doors, plants etc.) */}
                            {activeDbSection?.layout_data?.elements?.map((el: any) => {
                                const style: React.CSSProperties = {
                                    position: 'absolute',
                                    top: el.y,
                                    left: el.x,
                                    width: el.width,
                                    height: el.height,
                                    transform: `rotate(${el.rotation || 0}deg)`,
                                    pointerEvents: 'none',
                                    zIndex: 10,
                                };
                                return (
                                    <div key={el.id} style={style} className="flex items-center justify-center">
                                        {el.type === 'wall' && <div className="w-full h-full bg-[#1e293b]/70 border-y border-white/5 shadow-md" />}
                                        {el.type === 'wall-corner' && <div className="w-full h-full border-l-[8px] border-t-[8px] border-[#1e293b]/70" />}
                                        {el.type === 'pillar' && <div className="w-full h-full bg-[#111827] border-2 border-slate-700/50 shadow-md flex items-center justify-center text-[7px] text-slate-500 font-bold">KOLON</div>}
                                        {el.type === 'stairs' && (
                                            <div className="w-full h-full bg-slate-800/20 border border-white/5 flex flex-col justify-between p-0.5">
                                                <div className="h-[1px] bg-slate-700/30 w-full" />
                                                <div className="h-[1px] bg-slate-700/30 w-full" />
                                                <div className="h-[1px] bg-slate-700/30 w-full" />
                                            </div>
                                        )}
                                        {el.type === 'sofa' && (
                                            <div className="w-full h-full p-0.5">
                                                <div className="w-full h-full rounded border border-amber-500/10 bg-amber-500/5 relative flex items-center justify-center">
                                                    <div className="absolute inset-x-1 top-0.5 h-2 bg-amber-500/10 border-b border-amber-500/20 rounded-t-sm" />
                                                    <span className="text-[6px] font-black text-amber-500/30 uppercase tracking-widest">SEDİR</span>
                                                </div>
                                            </div>
                                        )}
                                        {el.type === 'plant' && (
                                            <div className="w-full h-full rounded-full border-2 border-emerald-500/20 flex items-center justify-center">
                                                <div className="w-[50%] h-[50%] rounded-full bg-emerald-500/10 border border-emerald-400/20" />
                                            </div>
                                        )}
                                        {el.type === 'bar-counter' && (
                                             <div className="w-full h-full p-0.5">
                                                 <div className="w-full h-full rounded border border-amber-600/20 bg-amber-600/5 flex items-center justify-center">
                                                     <span className="text-[6px] font-black text-amber-500/40 uppercase tracking-widest">BAR</span>
                                                 </div>
                                             </div>
                                         )}
                                         {el.type === 'kitchen' && (
                                             <div className="w-full h-full p-0.5">
                                                 <div className="w-full h-full rounded border border-slate-500/25 bg-[#334155]/10 flex flex-col items-center justify-center gap-0.5">
                                                     <span className="text-[5px] font-black text-slate-400/50 uppercase tracking-widest">MUTFAK</span>
                                                 </div>
                                             </div>
                                         )}
                                         {el.type === 'checkout' && (
                                             <div className="w-full h-full p-0.5">
                                                 <div className="w-full h-full rounded border border-amber-500/25 bg-amber-500/5 flex flex-col items-center justify-center gap-0.5">
                                                     <span className="text-[5px] font-black text-amber-500/50 uppercase tracking-widest">KASA</span>
                                                 </div>
                                             </div>
                                         )}
                                        {el.type === 'window' && <div className="w-full h-full bg-sky-500/10 border-2 border-sky-400/20 backdrop-blur-sm flex items-center justify-center"><div className="w-full h-[1px] bg-sky-300/10" /></div>}
                                        {el.type === 'door' && <div className="w-full h-full border-l-2 border-t-2 rounded-tl-full border-amber-500/20" />}
                                        {el.type === 'label' && (
                                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap bg-black/40 px-1 border border-white/5 rounded">{el.label || 'BÖLGE'}</span>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Dynamic Interactive Tables with Chairs */}
                            {filtered.map((table) => {
                                const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
                                const width = table.shape === 'rect' ? 160 : 80;
                                const height = 80;
                                const style: React.CSSProperties = {
                                    position: 'absolute',
                                    left: table.position_x || 100,
                                    top: table.position_y || 100,
                                    width,
                                    height,
                                    zIndex: 30,
                                };

                                return (
                                    <div key={table.id} style={style} className="relative group/tbl">
                                        {/* NOTIFICATION PULSE GLOW */}
                                        {glowingTables.has(table.id) && (
                                            <>
                                                <div className={`absolute -inset-3 rounded-full animate-[notif-pulse_1.5s_ease-in-out_infinite] z-20 pointer-events-none ${
                                                    glowingTables.get(table.id) === 'service_call' || glowingTables.get(table.id) === 'service_call_urgent'
                                                        ? 'bg-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.4)]'
                                                        : 'bg-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                                                }`} />
                                                <div className={`absolute -top-6 left-1/2 -translate-x-1/2 z-40 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider border shadow-lg animate-bounce ${
                                                    glowingTables.get(table.id) === 'service_call' || glowingTables.get(table.id) === 'service_call_urgent'
                                                        ? 'bg-amber-500 text-white border-amber-400'
                                                        : 'bg-emerald-500 text-white border-emerald-400'
                                                }`}>
                                                    {glowingTables.get(table.id) === 'service_call' || glowingTables.get(table.id) === 'service_call_urgent' ? '🔔 Çağrı' : '📱 Online'}
                                                </div>
                                            </>
                                        )}
                                        {/* CHAIRS RENDER LAYER */}
                                        {renderVisualChairs(table.shape || 'square')}

                                        {/* INTERACTIVE TABLE TOP */}
                                        <button
                                            type="button"
                                            onClick={() => selectTable(table)}
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
                                            className={`
                                                w-full h-full p-2 relative flex flex-col items-center justify-center transition-all duration-300 border-2 active:scale-95 shadow-xl
                                                ${getTableColors(table)}
                                                ${table.shape === 'round' ? 'rounded-full' : 'rounded-2xl'}
                                            `}
                                        >
                                            <span className="text-sm font-black tracking-tighter leading-none">{getTableName(table)}</span>
                                            
                                            {busy && (table.customer_name || table.guest_name) && (
                                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-tight mt-0.5 line-clamp-1 max-w-[90%]">
                                                    {table.customer_name || table.guest_name}
                                                </span>
                                            )}
                                            {busy && table.waiter_name?.trim() && (
                                                <span className="text-[8px] font-black text-sky-300/90 uppercase tracking-tight mt-0.5 line-clamp-1 flex items-center gap-0.5 justify-center max-w-[90%]">
                                                    <FiUser size={8} className="shrink-0 opacity-80" aria-hidden />
                                                    {table.waiter_name.trim()}
                                                </span>
                                            )}
                                            {busy && table.total_amount != null && Number(table.total_amount) > 0 && (
                                                <span className="text-[9px] font-black opacity-75 mt-0.5 bg-black/40 px-1 rounded border border-white/5">
                                                    {settings?.currency || '€'}{Number(table.total_amount).toFixed(2)}
                                                </span>
                                            )}
                                            
                                            {renderPresenceOverlay(table.id)}
                                        </button>
                                        
                                        {/* Settings cog for busy table */}
                                        {busy && (
                                            <button 
                                                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-emerald-500 hover:border-emerald-400 transition-all shadow-xl z-50 scale-0 group-hover/tbl:scale-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActionTable(table);
                                                }}
                                            >
                                                <FiSettings size={12} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    /* Default Grid Mode */
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {filtered.map((table) => {
                            const busy = table.active_session_id != null && Number(table.active_session_id) !== 0;
                            const tObj = table as any;
                            const floorStatus = resolveTableStatus(table);

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
                                    {/* NOTIFICATION PULSE GLOW — GRID MODE */}
                                    {glowingTables.has(table.id) && (
                                        <>
                                            <div className={`absolute -inset-2 rounded-[2.5rem] animate-[notif-pulse_1.5s_ease-in-out_infinite] z-0 pointer-events-none ${
                                                glowingTables.get(table.id) === 'service_call' || glowingTables.get(table.id) === 'service_call_urgent'
                                                    ? 'bg-amber-500/15 shadow-[0_0_25px_rgba(245,158,11,0.35)]'
                                                    : 'bg-emerald-500/15 shadow-[0_0_25px_rgba(16,185,129,0.35)]'
                                            }`} />
                                            <div className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border shadow-lg animate-bounce ${
                                                glowingTables.get(table.id) === 'service_call' || glowingTables.get(table.id) === 'service_call_urgent'
                                                    ? 'bg-amber-500 text-white border-amber-400'
                                                    : 'bg-emerald-500 text-white border-emerald-400'
                                            }`}>
                                                {glowingTables.get(table.id) === 'service_call' || glowingTables.get(table.id) === 'service_call_urgent' ? '🔔 Çağrı' : '📱 Online'}
                                            </div>
                                        </>
                                    )}
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
                                        {busy && table.waiter_name?.trim() && (
                                            <span className="text-[9px] font-black text-sky-300/90 uppercase tracking-tight px-2 line-clamp-1 text-center flex items-center justify-center gap-0.5 max-w-full">
                                                <FiUser size={10} className="shrink-0 opacity-80" aria-hidden />
                                                {table.waiter_name.trim()}
                                            </span>
                                        )}
                                        {busy && table.total_amount != null && Number(table.total_amount) > 0 && (
                                            <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-black text-white shadow-lg border border-white/10">
                                                {settings?.currency || '€'}{Number(table.total_amount).toFixed(2)}
                                            </div>
                                        )}

                                        {renderPresenceOverlay(table.id)}

                                        <div className="flex flex-col items-center">
                                            <span
                                                className={`text-[10px] font-black uppercase tracking-widest ${
                                                    floorStatus === 'reserved' ? 'text-violet-400'
                                                    : floorStatus === 'bill_requested' ? 'text-blue-400'
                                                    : floorStatus === 'pending_qr' ? 'text-amber-400'
                                                    : floorStatus === 'ready' ? 'text-orange-400'
                                                    : floorStatus === 'occupied' ? 'text-red-400'
                                                    : 'text-emerald-400/40'
                                                }`}
                                            >
                                                {getTableStatusLabel(table)}
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
                                                        floorStatus === 'occupied' ? 'bg-red-400/55'
                                                        : floorStatus === 'bill_requested' ? 'bg-blue-400/55'
                                                        : floorStatus === 'pending_qr' ? 'bg-amber-400/55'
                                                        : floorStatus === 'ready' ? 'bg-orange-400/55'
                                                        : floorStatus === 'reserved' ? 'bg-violet-400/55'
                                                        : 'bg-white/10'
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
