import React, { useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { 
    DndContext, 
    type DragEndEvent, 
    MouseSensor, 
    TouchSensor, 
    useSensor, 
    useSensors, 
    PointerSensor
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { Palette } from './Palette';
import { Canvas } from './Canvas';
import { useTableDesignerStore } from './store';
import type { ElementType } from './store';
import { FiLayout, FiSave, FiRefreshCcw, FiLayers, FiActivity, FiCheckCircle, FiImage } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';
import { usePosLocale } from '../../contexts/PosLocaleContext';

const PRESET_BISTRO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect x="20" y="20" width="1160" height="760" fill="none" stroke="%23334155" stroke-width="6" stroke-dasharray="15 5"/>
  <path d="M500 780 A 80 80 0 0 1 580 700" fill="none" stroke="%23f59e0b" stroke-width="4"/>
  <line x1="500" y1="780" x2="500" y2="700" stroke="%23f59e0b" stroke-width="4"/>
  <rect x="800" y="100" width="300" height="120" fill="%231e293b" fill-opacity="0.2" stroke="%23475569" stroke-width="3"/>
  <line x1="800" y1="20" x2="800" y2="300" stroke="%23334155" stroke-width="5"/>
  <line x1="800" y1="300" x2="1180" y2="300" stroke="%23334155" stroke-width="5"/>
  <text x="860" y="170" fill="%23475569" font-family="sans-serif" font-size="16" font-weight="bold" letter-spacing="4">BAR BÖLGESİ</text>
  <text x="940" y="65" fill="%23475569" font-family="sans-serif" font-size="16" font-weight="bold" letter-spacing="4">MUTFAK</text>
  <circle cx="300" cy="200" r="12" fill="%231e293b" stroke="%23475569" stroke-width="2"/>
  <circle cx="300" cy="600" r="12" fill="%231e293b" stroke="%23475569" stroke-width="2"/>
  <circle cx="700" cy="200" r="12" fill="%231e293b" stroke="%23475569" stroke-width="2"/>
  <circle cx="700" cy="600" r="12" fill="%231e293b" stroke="%23475569" stroke-width="2"/>
</svg>`)}`;

const PRESET_VIP_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect x="20" y="20" width="1160" height="760" fill="none" stroke="%23334155" stroke-width="6"/>
  <line x1="20" y1="300" x2="350" y2="300" stroke="%23334155" stroke-width="4" stroke-dasharray="10 5"/>
  <line x1="350" y1="300" x2="350" y2="20" stroke="%23334155" stroke-width="4"/>
  <text x="100" y="160" fill="%23475569" font-family="sans-serif" font-size="16" font-weight="bold" letter-spacing="4">VIP SALON</text>
  <path d="M 500 20 Q 600 120 700 20" fill="none" stroke="%23f59e0b" stroke-width="3"/>
  <text x="560" y="55" fill="%23f59e0b" font-family="sans-serif" font-size="12" font-weight="bold" letter-spacing="3">SAHNE</text>
  <rect x="400" y="400" width="30" height="30" fill="%231e293b" stroke="%23475569" stroke-width="3"/>
  <rect x="800" y="400" width="30" height="30" fill="%231e293b" stroke="%23475569" stroke-width="3"/>
</svg>`)}`;

const PRESET_TERRACE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect x="20" y="20" width="1160" height="760" fill="none" stroke="%2310b981" stroke-width="4" stroke-opacity="0.3"/>
  <rect x="100" y="100" width="1000" height="600" fill="none" stroke="%231e293b" stroke-width="2"/>
  <rect x="20" y="20" width="1160" height="60" fill="%23064e3b" fill-opacity="0.1" stroke="%2310b981" stroke-width="2" stroke-opacity="0.2"/>
  <text x="440" y="55" fill="%2310b981" fill-opacity="0.5" font-family="sans-serif" font-size="14" font-weight="bold" letter-spacing="4">BİTKİ PEYZAJ ALANI</text>
  <circle cx="600" cy="400" r="100" fill="%230c4a6e" fill-opacity="0.1" stroke="%230284c7" stroke-width="3" stroke-dasharray="5 5"/>
  <text x="530" y="405" fill="%230284c7" fill-opacity="0.6" font-family="sans-serif" font-size="12" font-weight="bold" letter-spacing="3">SÜS HAVUZU</text>
</svg>`)}`;

interface Section {
    id: number;
    name: string;
    layout_data?: any;
}

interface TableDesignerLayoutProps {
    initialSections?: Section[];
    initialTables?: any[];
}

export const TableDesignerLayout: React.FC<TableDesignerLayoutProps> = ({ initialSections = [], initialTables = [] }) => {
    const { t } = usePosLocale();
    const { getAuthHeaders } = useAuthStore();
    const addElement = useTableDesignerStore(state => state.addElement);
    const updateElement = useTableDesignerStore(state => state.updateElement);
    const elements = useTableDesignerStore(state => state.elements);
    const gridSize = useTableDesignerStore(state => state.gridSize);
    const setElements = useTableDesignerStore(state => state.setElements);
    const activeSectionId = useTableDesignerStore(state => state.activeSectionId);
    const setActiveSectionId = useTableDesignerStore(state => state.setActiveSectionId);
    
    // Background store state
    const bgImages = useTableDesignerStore(state => state.bgImages);
    const setSectionBg = useTableDesignerStore(state => state.setSectionBg);
    const setAllBgs = useTableDesignerStore(state => state.setAllBgs);
    const activeBg = activeSectionId ? bgImages[activeSectionId] : null;

    const [isSaving, setIsSaving] = React.useState(false);
    const [lastSaved, setLastSaved] = React.useState<Date | null>(null);
    const [bgModal, setBgModal] = React.useState(false);

    // Initial load and sync
    useEffect(() => {
        if (initialSections.length > 0 && initialTables.length > 0) {
            const allMapped: any[] = [];
            const bgs: Record<number, any> = {};

            // 1. Map Tables
            initialTables.forEach(t => {
                allMapped.push({
                    id: String(t.id),
                    type: (t.shape === 'round' ? 'table-2' : (t.shape === 'rect' ? 'table-6' : 'table-4')) as ElementType,
                    section_id: t.section_id,
                    x: t.position_x || 100,
                    y: t.position_y || 100,
                    rotation: 0,
                    label: t.name,
                    width: t.shape === 'rect' ? 160 : 80,
                    height: 80
                });
            });

            // 2. Map Layout Data (Walls, Window, Doors, labels, Background) for ALL sections
            initialSections.forEach(sec => {
                if (sec.layout_data) {
                    if (sec.layout_data.bg) {
                        bgs[sec.id] = sec.layout_data.bg;
                    }
                    if (sec.layout_data.elements) {
                        sec.layout_data.elements.forEach((el: any) => {
                            // Ensure we don't duplicate tables if they were accidentally saved in layout_data
                            if (!el.type.startsWith('table')) {
                                allMapped.push({
                                    ...el,
                                    section_id: sec.id // Force section context
                                });
                            }
                        });
                    }
                }
            });

            setElements(allMapped);
            setAllBgs(bgs);
        }
        
        if (initialSections.length > 0 && !activeSectionId) {
            setActiveSectionId(initialSections[0].id);
        }
    }, [initialSections, initialTables]);

    const handleSave = async () => {
        if (!activeSectionId) return;
        setIsSaving(true);
        
        try {
            // 1. SAVE NON-TABLE ITEMS (Walls, Labels, etc) to Section Layout Data
            const nonTableElements = elements.filter(el => String(el.section_id) === String(activeSectionId) && (!el.type || !el.type.startsWith('table')));
            const bgData = bgImages[activeSectionId] || null;
            
            const secRes = await fetch(`/api/v1/admin/sections/${activeSectionId}`, {
                method: 'PUT',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    layout_data: { 
                        elements: nonTableElements,
                        bg: bgData
                    } 
                })
            });

            if (!secRes.ok) throw new Error('Section save failed');

            // 2. SAVE TABLES (Positions, Shapes)
            const sectionTables = elements.filter(el => String(el.section_id) === String(activeSectionId) && el.type && el.type.startsWith('table'));
            
            const tablePromises = sectionTables.map(tbl => {
                let shape = 'square';
                if (tbl.type === 'table-2') shape = 'round';
                if (tbl.type === 'table-6') shape = 'rect';

                return fetch(`/api/v1/admin/tables/${tbl.id}`, {
                    method: 'PUT',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        position_x: Math.round(tbl.x),
                        position_y: Math.round(tbl.y),
                        shape: shape
                    })
                });
            });

            const tableResults = await Promise.all(tablePromises);
            const tableFailed = tableResults.some(r => !r.ok);
            if (tableFailed) throw new Error('Some tables failed to save');

            setLastSaved(new Date());
            toast.success(t('admin.designer.saved'));
        } catch (err) {
            console.error('Save failed', err);
            toast.error(t('admin.designer.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    // SENSORS
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(MouseSensor),
        useSensor(TouchSensor)
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over, delta } = event;
        if (over && over.id === 'canvas' && activeSectionId) {
            if (active.data.current?.isPaletteItem) {
                const type = active.data.current.type as ElementType;
                const rawX = (active.rect.current.translated?.left || 0) - 288;
                const rawY = (active.rect.current.translated?.top || 0) - 80;
                const snapX = Math.round(rawX / gridSize) * gridSize;
                const snapY = Math.round(rawY / gridSize) * gridSize;

                let w = 80;
                let h = 80;
                switch (type) {
                    case 'table-2': w = 80; h = 80; break;
                    case 'table-4': w = 80; h = 80; break;
                    case 'table-6': w = 160; h = 80; break;
                    case 'table-8': w = 200; h = 80; break;
                    case 'wall': w = 200; h = 20; break;
                    case 'wall-corner': w = 100; h = 100; break;
                    case 'pillar': w = 40; h = 40; break;
                    case 'stairs': w = 120; h = 60; break;
                    case 'sofa': w = 160; h = 60; break;
                    case 'plant': w = 40; h = 40; break;
                    case 'bar-counter': w = 200; h = 60; break;
                    case 'kitchen': w = 200; h = 80; break;
                    case 'checkout': w = 120; h = 80; break;
                    case 'door': w = 80; h = 80; break;
                    case 'window': w = 120; h = 20; break;
                    case 'label': w = 120; h = 40; break;
                }

                addElement({
                    id: `el-${Date.now()}`,
                    type,
                    section_id: activeSectionId,
                    x: Math.max(0, snapX),
                    y: Math.max(0, snapY),
                    rotation: 0,
                    width: w,
                    height: h,
                    label: type.startsWith('table')
                        ? t('admin.designer.defaultTableLabel').replace('{{n}}', String(Math.floor(Math.random() * 90 + 10)))
                        : undefined
                });
            }
            
            if (active.data.current?.isCanvasItem) {
                const id = active.id as string;
                const element = elements.find(el => el.id === id);
                if (element) {
                    const snapX = Math.round((element.x + delta.x) / gridSize) * gridSize;
                    const snapY = Math.round((element.y + delta.y) / gridSize) * gridSize;
                    updateElement(id, { x: Math.max(0, snapX), y: Math.max(0, snapY) });
                }
            }
        }
    };

    const handleReset = () => {
        if (!activeSectionId) return;
        if (confirm(t('admin.designer.resetConfirm'))) {
            // Clear background
            setSectionBg(activeSectionId, { url: '', opacity: 0.5, scale: 1.0, x: 0, y: 0 });
            
            // Keep other sections intact, and only keep tables in the active section
            const nextElements = elements.filter(el => 
                String(el.section_id) !== String(activeSectionId) || (el.type && el.type.startsWith('table'))
            );
            setElements(nextElements);
            toast.success(t('admin.designer.resetDone'));
        }
    };

    const sectionElementsCount = useMemo(() => 
        elements.filter(e => e.section_id === activeSectionId).length,
    [elements, activeSectionId]);

    return (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToWindowEdges]}>
            <div className="flex flex-col h-full overflow-hidden bg-[#020617] text-white font-sans selection:bg-amber-500/30">
                <header className="h-20 shrink-0 flex items-center justify-between border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-3xl px-8 shadow-2xl relative z-40">
                    <div className="flex items-center gap-6">
                         <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                             <FiLayout className="text-amber-500 text-xl" />
                         </div>
                         <div className="flex flex-col">
                             <h1 className="text-sm font-black tracking-widest text-white uppercase leading-none">{t('admin.designer.title')}</h1>
                             <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar max-w-sm">
                                  {initialSections.map(s => (
                                      <button key={s.id} onClick={() => setActiveSectionId(s.id)}
                                         className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all truncate min-w-[80px]
                                             ${activeSectionId === s.id ? 'bg-amber-600 border-amber-500 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-300'}`}
                                      > {s.name} </button>
                                  ))}
                             </div>
                         </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {lastSaved && (
                            <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-emerald-500/60 uppercase">
                                <FiCheckCircle /> {t('admin.designer.lastSaved').replace('{{time}}', lastSaved.toLocaleTimeString())}
                            </div>
                        )}
                        <button onClick={() => setBgModal(true)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${activeBg?.url ? 'bg-amber-600/20 border-amber-500/30 text-amber-400 hover:bg-amber-600/30' : 'bg-white/5 border-white/5 text-slate-400 hover:text-slate-200'}`}
                        >
                            <FiImage /> {activeBg?.url ? t('admin.designer.bgEdit') : t('admin.designer.bgAdd')}
                        </button>
                        <button onClick={handleReset}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 text-[10px] font-black uppercase tracking-widest transition-all"
                        > <FiRefreshCcw /> {t('admin.designer.clear')} </button>
                        <div className="w-px h-8 bg-white/5" />
                        <button onClick={handleSave} disabled={isSaving}
                            className="group flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-amber-600/30 active:scale-95 transition-all"
                        >
                            <FiSave className={`text-sm ${isSaving ? 'animate-spin' : 'group-hover:scale-110'} transition-transform`} /> 
                            {isSaving ? t('admin.designer.saving') : t('admin.designer.save')}
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    <Palette />
                    <Canvas />
                    <div className="w-16 h-full flex flex-col items-center py-10 bg-[#0f172a]/80 backdrop-blur-3xl border-l border-white/5 gap-8">
                         <div title={t('admin.designer.totalElements')} className="flex flex-col items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
                             <FiLayers size={20} className="text-slate-400" />
                             <span className="text-[8px] font-bold text-slate-400 uppercase">{sectionElementsCount}</span>
                         </div>
                         <div title={t('admin.designer.livePreview')} className="flex flex-col items-center gap-2 opacity-30 hover:opacity-100 transition-opacity cursor-pointer">
                             <FiActivity size={20} className="text-emerald-500 animate-pulse" />
                             <span className="text-[8px] font-bold text-emerald-500 uppercase">{t('admin.designer.on')}</span>
                         </div>
                    </div>
                </div>
            </div>

            {bgModal && activeSectionId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
                    <div className="w-full max-w-md rounded-3xl bg-[#0f172a] border border-white/10 p-8 shadow-2xl text-white">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-black tracking-widest uppercase text-amber-500">{t('admin.designer.bgModal.title')}</h3>
                            <button onClick={() => setBgModal(false)} className="text-slate-400 hover:text-white font-bold text-xs uppercase">
                                {t('admin.designer.bgModal.close')}
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* PRESET ARCHITECTURAL TEMPLATES */}
                            <div className="border-b border-white/5 pb-6 mb-2">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{t('admin.designer.bgModal.presets')}</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSectionBg(activeSectionId, { url: PRESET_BISTRO_SVG, scale: 1.0, opacity: 0.6 });
                                            toast.success(t('admin.designer.bgModal.presetBistroApplied'));
                                        }}
                                        className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-amber-500/30 transition-all text-center gap-1 group"
                                    >
                                        <div className="w-full h-10 rounded bg-[#070b13] border border-white/10 flex items-center justify-center overflow-hidden">
                                            <div className="w-5 h-5 border-l border-t rounded-tl-full border-amber-500/40" />
                                        </div>
                                        <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-400 group-hover:text-amber-500 truncate w-full">{t('admin.designer.bgModal.presetBistro')}</span>
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSectionBg(activeSectionId, { url: PRESET_VIP_SVG, scale: 1.0, opacity: 0.6 });
                                            toast.success(t('admin.designer.bgModal.presetVipApplied'));
                                        }}
                                        className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-amber-500/30 transition-all text-center gap-1 group"
                                    >
                                        <div className="w-full h-10 rounded bg-[#070b13] border border-white/10 flex items-center justify-center overflow-hidden">
                                            <div className="w-8 h-4 border border-dashed border-amber-500/40 text-[6px] font-black flex items-center justify-center leading-none">VIP</div>
                                        </div>
                                        <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-400 group-hover:text-amber-500 truncate w-full">{t('admin.designer.bgModal.presetVip')}</span>
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSectionBg(activeSectionId, { url: PRESET_TERRACE_SVG, scale: 1.0, opacity: 0.6 });
                                            toast.success(t('admin.designer.bgModal.presetTerraceApplied'));
                                        }}
                                        className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-amber-500/30 transition-all text-center gap-1 group"
                                    >
                                        <div className="w-full h-10 rounded bg-[#070b13] border border-white/10 flex items-center justify-center overflow-hidden">
                                            <div className="w-5 h-5 rounded-full border border-dashed border-emerald-500/40" />
                                        </div>
                                        <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-400 group-hover:text-amber-500 truncate w-full">{t('admin.designer.bgModal.presetTerrace')}</span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('admin.designer.bgModal.upload')}</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                if (typeof reader.result === 'string') {
                                                    setSectionBg(activeSectionId, { url: reader.result });
                                                    toast.success(t('admin.designer.bgModal.imageUploaded'));
                                                }
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-white/5 file:text-white hover:file:bg-white/10 file:cursor-pointer"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('admin.designer.bgModal.url')}</label>
                                <input
                                    type="text"
                                    placeholder="https://example.com/map.png"
                                    value={activeBg?.url?.startsWith('data:') ? '' : (activeBg?.url || '')}
                                    onChange={(e) => setSectionBg(activeSectionId, { url: e.target.value })}
                                    className="w-full rounded-xl bg-white/5 border border-white/5 p-3 text-xs outline-none focus:border-amber-500/50"
                                />
                            </div>

                            {activeBg?.url && (
                                <div className="space-y-4 pt-4 border-t border-white/5 animate-fade-in">
                                    <div>
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                            <span>{t('admin.designer.bgModal.opacity')}</span>
                                            <span className="text-amber-500">{Math.round((activeBg.opacity ?? 0.5) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="1"
                                            step="0.05"
                                            value={activeBg.opacity ?? 0.5}
                                            onChange={(e) => setSectionBg(activeSectionId, { opacity: parseFloat(e.target.value) })}
                                            className="w-full accent-amber-500 bg-white/5 h-1 rounded-lg cursor-pointer"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                            <span>{t('admin.designer.bgModal.scale')}</span>
                                            <span className="text-amber-500">{Math.round((activeBg.scale ?? 1) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="3"
                                            step="0.05"
                                            value={activeBg.scale ?? 1}
                                            onChange={(e) => setSectionBg(activeSectionId, { scale: parseFloat(e.target.value) })}
                                            className="w-full accent-amber-500 bg-white/5 h-1 rounded-lg cursor-pointer"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('admin.designer.bgModal.posX')}</label>
                                            <input
                                                type="number"
                                                value={activeBg.x ?? 0}
                                                onChange={(e) => setSectionBg(activeSectionId, { x: parseInt(e.target.value) || 0 })}
                                                className="w-full rounded-xl bg-white/5 border border-white/5 p-3 text-xs outline-none focus:border-amber-500/50 text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('admin.designer.bgModal.posY')}</label>
                                            <input
                                                type="number"
                                                value={activeBg.y ?? 0}
                                                onChange={(e) => setSectionBg(activeSectionId, { y: parseInt(e.target.value) || 0 })}
                                                className="w-full rounded-xl bg-white/5 border border-white/5 p-3 text-xs outline-none focus:border-amber-500/50 text-white"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setSectionBg(activeSectionId, { url: '', opacity: 0.5, scale: 1.0, x: 0, y: 0 })}
                                        className="w-full py-3 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        {t('admin.designer.bgModal.remove')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DndContext>
    );
};
