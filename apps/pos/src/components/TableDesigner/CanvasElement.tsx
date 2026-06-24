import React, { useRef } from 'react';
import type { CanvasElement } from './store';
import { useTableDesignerStore } from './store';
import { FiRotateCw, FiX, FiCornerRightDown } from 'react-icons/fi';
import { usePosLocale } from '../../contexts/PosLocaleContext';

interface CanvasElementProps {
    element: CanvasElement;
}

export const CanvasElementComponent: React.FC<CanvasElementProps> = ({ element }) => {
    const { t } = usePosLocale();
    const setSelectedId = useTableDesignerStore(state => state.setSelectedId);
    const selectedId = useTableDesignerStore(state => state.selectedId);
    const removeElement = useTableDesignerStore(state => state.removeElement);
    const updateElement = useTableDesignerStore(state => state.updateElement);
    const gridSize = useTableDesignerStore(state => state.gridSize);

    const isSelected = selectedId === element.id;
    const elementRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const isTable = element.type.startsWith('table');

    const handleRotation = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateElement(element.id, { rotation: (element.rotation + 90) % 360 });
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        removeElement(element.id);
    };

    const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
        // Only left click
        if (e.button !== 0) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        setSelectedId(element.id);
        setIsDragging(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const initX = element.x;
        const initY = element.y;

        let finalX = initX;
        let finalY = initY;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            // Snap to grid
            const rawX = initX + deltaX;
            const rawY = initY + deltaY;
            const snapX = Math.round(rawX / gridSize) * gridSize;
            const snapY = Math.round(rawY / gridSize) * gridSize;

            finalX = Math.max(0, snapX);
            finalY = Math.max(0, snapY);

            // Direct DOM manipulation for buttery smooth rendering (no state thrashing)
            if (elementRef.current) {
                elementRef.current.style.left = `${finalX}px`;
                elementRef.current.style.top = `${finalY}px`;
            }
        };

        const onMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // Persist snap position to store once
            updateElement(element.id, { x: finalX, y: finalY });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // Full support for touch devices
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation();
        setSelectedId(element.id);
        setIsDragging(true);

        const touch = e.touches[0];
        const startX = touch.clientX;
        const startY = touch.clientY;
        const initX = element.x;
        const initY = element.y;

        let finalX = initX;
        let finalY = initY;

        const onTouchMove = (moveEvent: TouchEvent) => {
            const currentTouch = moveEvent.touches[0];
            const deltaX = currentTouch.clientX - startX;
            const deltaY = currentTouch.clientY - startY;

            const rawX = initX + deltaX;
            const rawY = initY + deltaY;
            const snapX = Math.round(rawX / gridSize) * gridSize;
            const snapY = Math.round(rawY / gridSize) * gridSize;

            finalX = Math.max(0, snapX);
            finalY = Math.max(0, snapY);

            if (elementRef.current) {
                elementRef.current.style.left = `${finalX}px`;
                elementRef.current.style.top = `${finalY}px`;
            }
        };

        const onTouchEnd = () => {
            setIsDragging(false);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
            
            updateElement(element.id, { x: finalX, y: finalY });
        };

        document.addEventListener('touchmove', onTouchMove, { passive: true });
        document.addEventListener('touchend', onTouchEnd);
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
            
            // Direct DOM update for high-performance resize
            if (elementRef.current) {
                elementRef.current.style.width = `${newWidth}px`;
                elementRef.current.style.height = `${newHeight}px`;
            }
        };

        const onMouseUp = (moveEvent: MouseEvent) => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            const finalWidth = Math.max(gridSize, Math.round((startWidth + deltaX) / gridSize) * gridSize);
            const finalHeight = Math.max(gridSize, Math.round((startHeight + deltaY) / gridSize) * gridSize);

            updateElement(element.id, { width: finalWidth, height: finalHeight });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const style: React.CSSProperties = {
        position: 'absolute',
        top: element.y,
        left: element.x,
        width: element.width,
        height: element.height,
        touchAction: 'none',
        transform: `rotate(${element.rotation}deg)`,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isSelected ? 50 : 10,
    };

    const renderChairs = () => {
        const chairClass = "absolute bg-[#1e293b] border border-[#334155]/60 rounded-md shadow-md z-0 transition-colors";
        
        switch (element.type) {
            case 'table-2':
                return (
                    <>
                        <div className={`${chairClass} w-6 h-5 -top-4 left-1/2 -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-1/2 -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                    </>
                );
            case 'table-4':
                return (
                    <>
                        <div className={`${chairClass} w-6 h-5 -top-4 left-1/2 -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-1/2 -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                        <div className={`${chairClass} w-5 h-6 -left-4 top-1/2 -translate-y-1/2 border-r-2 border-r-amber-500/40 rounded-l-md`} />
                        <div className={`${chairClass} w-5 h-6 -right-4 top-1/2 -translate-y-1/2 border-l-2 border-l-amber-500/40 rounded-r-md`} />
                    </>
                );
            case 'table-6':
                return (
                    <>
                        <div className={`${chairClass} w-6 h-5 -top-4 left-[20%] -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        <div className={`${chairClass} w-6 h-5 -top-4 left-1/2 -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        <div className={`${chairClass} w-6 h-5 -top-4 left-[80%] -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-[20%] -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-1/2 -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-[80%] -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                    </>
                );
            case 'table-8':
                return (
                    <>
                        <div className={`${chairClass} w-6 h-5 -top-4 left-[20%] -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        <div className={`${chairClass} w-6 h-5 -top-4 left-1/2 -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        <div className={`${chairClass} w-6 h-5 -top-4 left-[80%] -translate-x-1/2 border-b-2 border-b-amber-500/40 rounded-t-md`} />
                        
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-[20%] -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-1/2 -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                        <div className={`${chairClass} w-6 h-5 -bottom-4 left-[80%] -translate-x-1/2 border-t-2 border-t-amber-500/40 rounded-b-md`} />
                        
                        <div className={`${chairClass} w-5 h-6 -left-4 top-1/2 -translate-y-1/2 border-r-2 border-r-amber-500/40 rounded-l-md`} />
                        <div className={`${chairClass} w-5 h-6 -right-4 top-1/2 -translate-y-1/2 border-l-2 border-l-amber-500/40 rounded-r-md`} />
                    </>
                );
            default:
                return null;
        }
    };

    return (
        <div
            ref={elementRef}
            style={style}
            onMouseDown={handleDragStart}
            onTouchStart={handleTouchStart}
            onClick={(e) => { e.stopPropagation(); setSelectedId(element.id); }}
            className={`
                group relative flex items-center justify-center 
                transition-all cursor-move select-none
                ${isSelected ? 'ring-2 ring-amber-500 ring-offset-4 ring-offset-transparent' : ''}
                ${isDragging ? 'grabbing scale-[1.02] z-50 shadow-2xl ring-2 ring-amber-500/50' : 'grab'}
            `}
        >
            {/* CHAIRS RENDER LAYER FOR TABLES */}
            {isTable && renderChairs()}

            {/* TABLE DESIGN (BASED ON IMAGE) */}
            {isTable ? (
                <div className="relative w-full h-full flex items-center justify-center p-3 animate-in fade-in zoom-in-90 duration-300 z-10">
                    {/* MAIN TABLE TOP */}
                    <div className={`
                        w-full h-full rounded-lg relative overflow-hidden transition-all duration-300
                        bg-gradient-to-br from-emerald-800 to-emerald-950
                        border border-emerald-500/30 shadow-[inset_0_2px_10px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.5)]
                        group-hover:from-emerald-700 group-hover:to-emerald-900 group-hover:shadow-emerald-500/10
                    `}>
                        {/* TABLE REFLECTION / GLASS EFFECT */}
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent pointer-events-none" />
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                        
                        {/* TABLE CONTENT */}
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                            <span className="text-[10px] font-black text-emerald-400/80 tracking-tighter uppercase drop-shadow-md">
                                {element.label || `M-${element.id.slice(-2)}`}
                            </span>
                            {element.width > 60 && element.height > 40 && (
                                <div className="px-1.5 py-0.5 rounded bg-black/30 border border-white/5">
                                    <span className="text-[7px] font-black text-emerald-500/50 uppercase leading-none">{t('admin.designer.element.empty')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* NON-TABLE ELEMENTS */
                <div className={`
                    w-full h-full flex items-center justify-center overflow-hidden transition-all z-10
                    ${element.type === 'wall' ? 'bg-[#334155] border-y border-white/10 shadow-xl' : ''}
                    ${element.type === 'wall-corner' ? 'border-l-[12px] border-t-[12px] border-[#334155]' : ''}
                    ${element.type === 'pillar' ? 'bg-[#1e293b] border-2 border-slate-500/50 shadow-2xl flex items-center justify-center text-[7px] text-slate-500 font-bold' : ''}
                    ${element.type === 'stairs' ? 'bg-slate-800/40 border border-white/5 flex flex-col justify-between p-0.5' : ''}
                    ${element.type === 'sofa' ? 'bg-amber-600/10 border border-amber-500/30 rounded-lg' : ''}
                    ${element.type === 'plant' ? 'bg-emerald-950/20 border border-emerald-500/30 rounded-full flex items-center justify-center' : ''}
                    ${element.type === 'bar-counter' ? 'bg-amber-800/10 border border-amber-600/30 rounded-lg' : ''}
                    ${element.type === 'kitchen' ? 'bg-slate-700/10 border border-slate-500/30 rounded-lg' : ''}
                    ${element.type === 'checkout' ? 'bg-amber-700/10 border border-amber-500/30 rounded-lg' : ''}
                    ${element.type === 'window' ? 'bg-sky-500/20 border-2 border-sky-400/40 backdrop-blur-sm' : ''}
                    ${element.type === 'door' ? 'border-l-4 border-t-4 rounded-tl-full border-amber-500/40' : ''}
                    ${element.type === 'label' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2' : ''}
                `}>
                    {element.type === 'label' && (
                        <span className="text-[10px] font-black uppercase tracking-widest truncate">{element.label || t('admin.designer.element.zone')}</span>
                    )}
                    {element.type === 'window' && <div className="w-full h-[1px] bg-sky-200/20" />}
                    {element.type === 'pillar' && <span>{t('admin.designer.element.pillar')}</span>}
                    {element.type === 'stairs' && (
                        <div className="w-full h-full flex flex-col justify-between">
                            <div className="h-[2px] bg-slate-650/40 w-full" />
                            <div className="h-[2px] bg-slate-650/40 w-full" />
                            <div className="h-[2px] bg-slate-650/40 w-full" />
                            <div className="h-[2px] bg-slate-650/40 w-full" />
                            <div className="h-[2px] bg-slate-650/40 w-full" />
                        </div>
                    )}
                    {element.type === 'sofa' && (
                        <div className="w-full h-full flex items-center justify-center p-1">
                            <div className="w-full h-full rounded border border-amber-500/20 bg-amber-500/5 relative flex items-center justify-center">
                                <div className="absolute inset-x-1.5 top-1 h-3 bg-amber-500/20 border-b border-amber-500/30 rounded-t-sm" />
                                <span className="text-[7px] font-black text-amber-500/50 tracking-widest uppercase">{t('admin.designer.element.sofa')}</span>
                            </div>
                        </div>
                    )}
                    {element.type === 'plant' && (
                        <div className="w-full h-full rounded-full border-2 border-emerald-500/30 flex items-center justify-center animate-pulse duration-3000">
                            <div className="w-[60%] h-[60%] rounded-full bg-emerald-500/20 border border-emerald-400/30" />
                        </div>
                    )}
                    {element.type === 'bar-counter' && (
                        <div className="w-full h-full flex items-center justify-center p-1">
                            <div className="w-full h-full rounded border border-amber-600/30 bg-amber-600/5 flex items-center justify-center">
                                <span className="text-[7px] font-black text-amber-500/60 tracking-[0.2em] uppercase">{t('admin.designer.element.bar')}</span>
                            </div>
                        </div>
                    )}
                    {element.type === 'kitchen' && (
                        <div className="w-full h-full flex items-center justify-center p-1">
                            <div className="w-full h-full rounded border border-slate-500/30 bg-slate-500/5 flex flex-col items-center justify-center gap-1">
                                <span className="text-[7px] font-black text-slate-400 tracking-[0.2em] uppercase">{t('admin.designer.element.kitchen')}</span>
                                <div className="flex gap-1.5 mt-0.5">
                                    <div className="w-4 h-4 rounded-full bg-slate-600/40 border border-slate-500/30" />
                                    <div className="w-8 h-4 rounded-sm bg-slate-600/40 border border-slate-500/30" />
                                </div>
                            </div>
                        </div>
                    )}
                    {element.type === 'checkout' && (
                        <div className="w-full h-full flex items-center justify-center p-1">
                            <div className="w-full h-full rounded border border-amber-500/30 bg-amber-500/5 flex flex-col items-center justify-center gap-1">
                                <span className="text-[7px] font-black text-amber-500/70 tracking-[0.2em] uppercase">{t('admin.designer.element.checkout')}</span>
                                <div className="w-6 h-4 bg-amber-500/20 border border-amber-400/30 rounded flex items-center justify-center text-[5px] font-black">TL</div>
                            </div>
                        </div>
                    )}
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
                <div 
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 bg-[#0f172a] border border-white/10 rounded-full shadow-2xl z-50 animate-in fade-in zoom-in-50 duration-200"
                >
                    <button onClick={handleRotation} className="p-2 text-slate-400 hover:text-amber-500 transition-colors" title={t('admin.designer.element.rotate')}>
                        <FiRotateCw size={14}/>
                    </button>
                    <div className="w-px h-4 bg-white/5" />
                    <button onClick={handleRemove} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title={t('admin.designer.element.delete')}>
                        <FiX size={14}/>
                    </button>
                </div>
            )}
        </div>
    );
};
