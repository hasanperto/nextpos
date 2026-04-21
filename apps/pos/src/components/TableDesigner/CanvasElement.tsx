import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { CanvasElement } from './store';
import { useTableDesignerStore } from './store';
import { FiRotateCw, FiX, FiCornerRightDown } from 'react-icons/fi';

interface CanvasElementProps {
    element: CanvasElement;
}

export const CanvasElementComponent: React.FC<CanvasElementProps> = ({ element }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: element.id,
        data: { id: element.id, isCanvasItem: true }
    });

    const setSelectedId = useTableDesignerStore(state => state.setSelectedId);
    const selectedId = useTableDesignerStore(state => state.selectedId);
    const removeElement = useTableDesignerStore(state => state.removeElement);
    const updateElement = useTableDesignerStore(state => state.updateElement);
    const gridSize = useTableDesignerStore(state => state.gridSize);

    const isSelected = selectedId === element.id;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: element.y,
        left: element.x,
        width: element.width,
        height: element.height,
        touchAction: 'none',
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${element.rotation}deg)` : `rotate(${element.rotation}deg)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isSelected ? 50 : 10,
        pointerEvents: isDragging ? 'none' : 'auto'
    };

    const isTable = element.type.startsWith('table');

    const handleRotation = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateElement(element.id, { rotation: (element.rotation + 90) % 360 });
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        removeElement(element.id);
    };

    const handleResize = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.width;
        const startHeight = element.height;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            const newWidth = Math.max(gridSize, Math.round((startWidth + deltaX) / gridSize) * gridSize);
            const newHeight = Math.max(gridSize, Math.round((startHeight + deltaY) / gridSize) * gridSize);
            updateElement(element.id, { width: newWidth, height: newHeight });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => { e.stopPropagation(); setSelectedId(element.id); }}
            className={`
                group relative flex items-center justify-center 
                transition-all cursor-move
                ${isSelected ? 'ring-2 ring-amber-500 ring-offset-4 ring-offset-transparent' : ''}
                ${isDragging ? 'grabbing scale-105 z-50 shadow-2xl ring-2 ring-amber-500/50' : 'grab'}
            `}
            {...attributes}
            {...listeners}
        >
            {/* TABLE DESIGN (BASED ON IMAGE) */}
            {isTable ? (
                <div className="relative w-full h-full flex items-center justify-center p-3 animate-in fade-in zoom-in-90 duration-300">
                    {/* LEFT CHAIRS */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 h-3/4 justify-center">
                        <div className="w-2 h-4 bg-[#1e293b] rounded-l-sm border border-black/20 opacity-40 shadow-inner" />
                        {element.height > 60 && <div className="w-2 h-4 bg-[#1e293b] rounded-l-sm border border-black/20 opacity-40 shadow-inner" />}
                    </div>

                    {/* RIGHT CHAIRS */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 h-3/4 justify-center">
                        <div className="w-2 h-4 bg-[#1e293b] rounded-r-sm border border-black/20 opacity-40 shadow-inner" />
                        {element.height > 60 && <div className="w-2 h-4 bg-[#1e293b] rounded-r-sm border border-black/20 opacity-40 shadow-inner" />}
                    </div>

                    {/* MAIN TABLE TOP */}
                    <div className={`
                        w-full h-full rounded-lg relative overflow-hidden transition-all duration-300
                        bg-gradient-to-br from-emerald-800 to-emerald-950
                        border border-emerald-500/30 shadow-[inset_0_2px_10px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.5)]
                        group-hover:from-emerald-700 group-hover:to-emerald-900 group-hover:shadow-emerald-500/10
                    `}>
                        {/* TABLE REFLECTION / GLASS EFFECT */}
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                        
                        {/* TABLE CONTENT */}
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                            <span className="text-[10px] font-black text-emerald-400/80 tracking-tighter uppercase drop-shadow-md">
                                {element.label || `M-${element.id.slice(-2)}`}
                            </span>
                            {element.width > 60 && element.height > 40 && (
                                <div className="px-1.5 py-0.5 rounded bg-black/30 border border-white/5">
                                    <span className="text-[7px] font-black text-emerald-500/50 uppercase leading-none">BOŞ</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* NON-TABLE ELEMENTS */
                <div className={`
                    w-full h-full flex items-center justify-center overflow-hidden transition-all
                    ${element.type === 'wall' ? 'bg-[#334155] border-y border-white/10 shadow-xl' : ''}
                    ${element.type === 'window' ? 'bg-sky-500/20 border-2 border-sky-400/40 backdrop-blur-sm' : ''}
                    ${element.type === 'door' ? 'border-l-4 border-t-4 rounded-tl-full border-amber-500/40' : ''}
                    ${element.type === 'label' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2' : ''}
                `}>
                    {element.type === 'label' && (
                        <span className="text-[10px] font-black uppercase tracking-widest truncate">{element.label || 'BÖLGE'}</span>
                    )}
                    {element.type === 'window' && <div className="w-full h-[1px] bg-sky-200/20" />}
                </div>
            )}

            {/* RESIZE HANDLE */}
            {isSelected && (
                <div 
                    onMouseDown={handleResize}
                    className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-md flex items-center justify-center cursor-nwse-resize z-50 shadow-xl border border-white/20 hover:scale-110 transition-transform"
                >
                    <FiCornerRightDown size={10} className="text-white" />
                </div>
            )}

            {/* CONTROLS (VISIBLE ON SELECT) */}
            {isSelected && !isDragging && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 bg-[#0f172a] border border-white/10 rounded-full shadow-2xl animate-in fade-in zoom-in-50 duration-200">
                    <button onClick={handleRotation} className="p-2 text-slate-400 hover:text-amber-500 transition-colors" title="Döndür">
                        <FiRotateCw size={14}/>
                    </button>
                    <div className="w-px h-4 bg-white/5" />
                    <button onClick={handleRemove} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title="Sil">
                        <FiX size={14}/>
                    </button>
                </div>
            )}
        </div>
    );
};
