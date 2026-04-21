import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ElementType } from './store';
import { FiMaximize, FiSquare, FiType, FiMinus } from 'react-icons/fi';

interface PaletteItemProps {
    type: ElementType;
    label: string;
    icon: React.ReactNode;
}

export const PaletteItem: React.FC<PaletteItemProps> = ({ type, label, icon }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `palette-${type}`,
        data: { type, isPaletteItem: true }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`
                group flex flex-col items-center justify-center p-4 rounded-2xl 
                border border-white/5 bg-white/5 transition-all cursor-grab active:cursor-grabbing
                hover:bg-white/10 hover:border-amber-500/30 hover:shadow-[0_0_15px_rgba(245,158,11,0.1)]
                ${isDragging ? 'opacity-50 ring-2 ring-amber-500' : 'opacity-100'}
            `}
        >
            <div className="w-10 h-10 flex items-center justify-center mb-2 text-amber-500/80 group-hover:text-amber-500 transition-colors">
                {icon}
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-amber-400">
                {label}
            </span>
        </div>
    );
};

export const Palette: React.FC = () => {
    const categories = [
        {
            title: "MASALAR",
            items: [
                { type: 'table-2' as ElementType, label: "MASA (2-KİŞİ)", icon: <FiSquare className="text-xl" /> },
                { type: 'table-4' as ElementType, label: "MASA (4-KİŞİ)", icon: <div className="grid grid-cols-2 gap-1"><FiSquare/><FiSquare/></div> },
                { type: 'table-6' as ElementType, label: "MASA (6-KİŞİ)", icon: <div className="grid grid-cols-2 gap-1 items-center"><FiSquare/><FiSquare/><FiSquare/></div> },
            ]
        },
        {
            title: "MİMARİ",
            items: [
                { type: 'wall' as ElementType, label: "DUVAR", icon: <FiMinus className="text-2xl stroke-[6]" /> },
                { type: 'window' as ElementType, label: "PENCERE", icon: <FiMaximize className="text-xl" /> },
                { type: 'door' as ElementType, label: "KAPI", icon: <div className="w-5 h-5 border-l-4 border-t-4 rounded-tl-full border-amber-500/80" /> },
            ]
        },
        {
            title: "NOTLAR",
            items: [
                { type: 'label' as ElementType, label: "ETİKET / YAZI", icon: <FiType className="text-xl" /> },
            ]
        }
    ];

    return (
        <div className="w-72 h-full flex flex-col bg-[#0f172a]/80 backdrop-blur-3xl border-r border-white/5 p-6 animate-in slide-in-from-left-4 duration-700 overflow-y-auto no-scrollbar">
            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-10 border-b border-amber-500/10 pb-4">
                TASARIM PALETİ
            </h3>
            
            <div className="space-y-12">
                {categories.map((cat, idx) => (
                    <div key={idx} className="space-y-6">
                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-2">
                           {cat.title}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            {cat.items.map((item, i) => (
                                <PaletteItem key={i} {...item} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-auto pt-10 text-[9px] font-medium text-slate-600 italic leading-relaxed text-center">
                Öğeleri tuvale sürükleyip bırakarak <br/> yerleşimi kurgulayabilirsiniz.
            </div>
        </div>
    );
};
