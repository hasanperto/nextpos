import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTableDesignerStore } from './store';
import { CanvasElementComponent } from './CanvasElement';

export const Canvas: React.FC = () => {
    const { setNodeRef, isOver } = useDroppable({
        id: 'canvas'
    });

    const activeSectionId = useTableDesignerStore(state => state.activeSectionId);
    
    // CACHE the elements list to avoid infinite loop warning and redundant renders
    const allElements = useTableDesignerStore(state => state.elements);
    
    const elements = useMemo(() => 
        allElements.filter(el => el.section_id === activeSectionId),
    [allElements, activeSectionId]);

    const gridSize = useTableDesignerStore(state => state.gridSize);
    const selectedId = useTableDesignerStore(state => state.selectedId);
    const setSelectedId = useTableDesignerStore(state => state.setSelectedId);

    const handleCanvasClick = () => {
        setSelectedId(null);
    };

    if (!activeSectionId) {
        return (
            <div className="flex-1 h-full flex items-center justify-center bg-[#020617] text-slate-500 font-black tracking-widest uppercase animate-pulse">
                Lütfen tasarım yapmak için bir bölge seçin
            </div>
        );
    }

    return (
        <div 
            ref={setNodeRef}
            onClick={handleCanvasClick}
            className={`
                flex-1 h-full relative cursor-crosshair overflow-hidden transition-all
                bg-[#020617] p-10 select-none
                ${isOver ? 'ring-2 ring-amber-500/30' : ''}
            `}
            style={{
                backgroundImage: `
                    linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                `,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                boxShadow: 'inset 0 0 150px rgba(0,0,0,0.8)'
            }}
        >
            {/* CANVAS ELEMENTS */}
            {elements.map((el) => (
                <CanvasElementComponent key={el.id} element={el} />
            ))}

            {/* EMPTY STATE INDICATOR */}
            {elements.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 animate-pulse duration-5000">
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-96 h-96 border-4 border-dashed border-white/50 rounded-full flex items-center justify-center p-12">
                             <div className="w-full h-full border-2 border-dashed border-white/30 rounded-full flex items-center justify-center p-8">
                                 <div className="w-full h-full border border-dashed border-white/20 rounded-full" />
                             </div>
                        </div>
                        <h2 className="text-4xl font-black tracking-[0.5em] text-white">BU BÖLGE BOŞ</h2>
                    </div>
                </div>
            )}

            {/* OVERLAY INDICATOR (WHEN SELECTING) */}
            {selectedId && (
                <div className="absolute top-8 left-8 flex items-center gap-4 bg-[#0f172a]/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/5 animate-in slide-in-from-top-4">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">ÖĞE SEÇİLDİ: {selectedId.slice(-4)}</span>
                </div>
            )}
        </div>
    );
};
