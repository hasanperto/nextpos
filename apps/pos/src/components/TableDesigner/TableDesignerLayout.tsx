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
import { FiLayout, FiSave, FiRefreshCcw, FiLayers, FiActivity, FiCheckCircle } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';

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
    const { getAuthHeaders } = useAuthStore();
    const addElement = useTableDesignerStore(state => state.addElement);
    const updateElement = useTableDesignerStore(state => state.updateElement);
    const elements = useTableDesignerStore(state => state.elements);
    const gridSize = useTableDesignerStore(state => state.gridSize);
    const setElements = useTableDesignerStore(state => state.setElements);
    const activeSectionId = useTableDesignerStore(state => state.activeSectionId);
    const setActiveSectionId = useTableDesignerStore(state => state.setActiveSectionId);
    
    const [isSaving, setIsSaving] = React.useState(false);
    const [lastSaved, setLastSaved] = React.useState<Date | null>(null);

    // Initial load and sync
    useEffect(() => {
        if (initialSections.length > 0 && initialTables.length > 0) {
            const allMapped: any[] = [];

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

            // 2. Map Layout Data (Walls, Window, Doors, labels) for ALL sections
            initialSections.forEach(sec => {
                if (sec.layout_data && sec.layout_data.elements) {
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
            });

            setElements(allMapped);
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
            const nonTableElements = elements.filter(el => el.section_id === activeSectionId && !el.type.startsWith('table'));
            
            const secRes = await fetch(`/api/v1/admin/sections/${activeSectionId}`, {
                method: 'PUT',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout_data: { elements: nonTableElements } })
            });

            if (!secRes.ok) throw new Error('Section save failed');

            // 2. SAVE TABLES (Positions, Shapes)
            const sectionTables = elements.filter(el => el.section_id === activeSectionId && el.type.startsWith('table'));
            
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
            toast.success('Kat planı kaydedildi');
        } catch (err) {
            console.error('Save failed', err);
            toast.error('Kaydedilemedi. İnternet bağlantısını kontrol edip tekrar deneyin.');
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

                addElement({
                    id: `el-${Date.now()}`,
                    type,
                    section_id: activeSectionId,
                    x: Math.max(0, snapX),
                    y: Math.max(0, snapY),
                    rotation: 0,
                    width: type === 'wall' ? 200 : 80,
                    height: type === 'wall' ? 20 : 80
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
        if (confirm("Bu bölgedeki tüm tasarımı temizleyecektir. Emin misiniz?")) {
            setElements(elements.filter(el => el.section_id !== activeSectionId));
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
                             <h1 className="text-sm font-black tracking-widest text-white uppercase leading-none">KAT PLANI TASARIMCISI</h1>
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
                                <FiCheckCircle /> SON KAYIT: {lastSaved.toLocaleTimeString()}
                            </div>
                        )}
                        <button onClick={handleReset}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 text-[10px] font-black uppercase tracking-widest transition-all"
                        > <FiRefreshCcw /> TEMİZLE </button>
                        <div className="w-px h-8 bg-white/5" />
                        <button onClick={handleSave} disabled={isSaving}
                            className="group flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-amber-600/30 active:scale-95 transition-all"
                        >
                            <FiSave className={`text-sm ${isSaving ? 'animate-spin' : 'group-hover:scale-110'} transition-transform`} /> 
                            {isSaving ? 'KAYDEDİLİYOR...' : 'KAYDET VE YAYINLA'}
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    <Palette />
                    <Canvas />
                    <div className="w-16 h-full flex flex-col items-center py-10 bg-[#0f172a]/80 backdrop-blur-3xl border-l border-white/5 gap-8">
                         <div title="Toplam Öğe" className="flex flex-col items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
                             <FiLayers size={20} className="text-slate-400" />
                             <span className="text-[8px] font-bold text-slate-400 uppercase">{sectionElementsCount}</span>
                         </div>
                         <div title="Canlı İzleme" className="flex flex-col items-center gap-2 opacity-30 hover:opacity-100 transition-opacity cursor-pointer">
                             <FiActivity size={20} className="text-emerald-500 animate-pulse" />
                             <span className="text-[8px] font-bold text-emerald-500 uppercase">ON</span>
                         </div>
                    </div>
                </div>
            </div>
        </DndContext>
    );
};
