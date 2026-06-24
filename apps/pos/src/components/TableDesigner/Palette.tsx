import React, { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ElementType } from './store';
import { useTableDesignerStore } from './store';
import toast from 'react-hot-toast';
import { usePosLocale } from '../../contexts/PosLocaleContext';
import { 
    FiMaximize, 
    FiSquare, 
    FiType, 
    FiMinus, 
    FiCornerDownRight, 
    FiBox, 
    FiTrendingUp, 
    FiSun 
} from 'react-icons/fi';

interface PaletteItemProps {
    type: ElementType;
    label: string;
    icon: React.ReactNode;
}

export const PaletteItem: React.FC<PaletteItemProps> = ({ type, label, icon }) => {
    const { t } = usePosLocale();
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `palette-${type}`,
        data: { type, isPaletteItem: true }
    });

    const addElement = useTableDesignerStore(state => state.addElement);
    const activeSectionId = useTableDesignerStore(state => state.activeSectionId);

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    const handleClick = (e: React.MouseEvent) => {
        if (!activeSectionId) return;

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
            case 'door': w = 80; h = 80; break;
            case 'window': w = 120; h = 20; break;
            case 'label': w = 120; h = 40; break;
            case 'kitchen': w = 200; h = 80; break;
            case 'checkout': w = 120; h = 80; break;
        }

        const tableNum = Math.floor(Math.random() * 90 + 10);
        addElement({
            id: `el-${Date.now()}`,
            type,
            section_id: activeSectionId,
            x: 160,
            y: 160,
            rotation: 0,
            width: w,
            height: h,
            label: type.startsWith('table')
                ? t('admin.designer.defaultTableLabel').replace('{{n}}', String(tableNum))
                : undefined
        });
        toast.success(t('admin.designer.itemAdded'));
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={handleClick}
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
            <span className="text-[9px] font-black text-slate-450 uppercase text-center tracking-wider group-hover:text-amber-450 leading-tight">
                {label}
            </span>
        </div>
    );
};

export const Palette: React.FC = () => {
    const { t } = usePosLocale();

    const categories = useMemo(() => [
        {
            title: t('admin.designer.palette.cat.tables'),
            items: [
                { type: 'table-2' as ElementType, label: t('admin.designer.palette.table2'), icon: <FiSquare className="text-xl" /> },
                { type: 'table-4' as ElementType, label: t('admin.designer.palette.table4'), icon: <div className="grid grid-cols-2 gap-1"><FiSquare/><FiSquare/></div> },
                { type: 'table-6' as ElementType, label: t('admin.designer.palette.table6'), icon: <div className="grid grid-cols-2 gap-1 items-center"><FiSquare/><FiSquare/><FiSquare/></div> },
                { type: 'table-8' as ElementType, label: t('admin.designer.palette.table8'), icon: <div className="grid grid-cols-2 gap-1 items-center"><FiSquare/><FiSquare/><FiSquare/><FiSquare/></div> },
            ]
        },
        {
            title: t('admin.designer.palette.cat.architecture'),
            items: [
                { type: 'wall' as ElementType, label: t('admin.designer.palette.wall'), icon: <FiMinus className="text-2xl stroke-[6]" /> },
                { type: 'wall-corner' as ElementType, label: t('admin.designer.palette.wallCorner'), icon: <FiCornerDownRight className="text-xl" /> },
                { type: 'pillar' as ElementType, label: t('admin.designer.palette.pillar'), icon: <FiBox className="text-xl" /> },
                { type: 'door' as ElementType, label: t('admin.designer.palette.door'), icon: <div className="w-5 h-5 border-l-4 border-t-4 rounded-tl-full border-amber-500/80" /> },
                { type: 'window' as ElementType, label: t('admin.designer.palette.window'), icon: <FiMaximize className="text-xl" /> },
                { type: 'stairs' as ElementType, label: t('admin.designer.palette.stairs'), icon: <FiTrendingUp className="text-xl" /> },
            ]
        },
        {
            title: t('admin.designer.palette.cat.furniture'),
            items: [
                { type: 'sofa' as ElementType, label: t('admin.designer.palette.sofa'), icon: <div className="w-8 h-4 rounded bg-amber-500/20 border border-amber-500/40 relative"><div className="absolute inset-x-1 bottom-0.5 h-1 bg-amber-500/40 rounded-sm"></div></div> },
                { type: 'plant' as ElementType, label: t('admin.designer.palette.plant'), icon: <FiSun className="text-xl animate-spin duration-10000" /> },
                { type: 'bar-counter' as ElementType, label: t('admin.designer.palette.barCounter'), icon: <div className="w-8 h-3 bg-amber-500/30 rounded border border-amber-500/50 flex items-center justify-center text-[6px] font-bold">BAR</div> },
                { type: 'kitchen' as ElementType, label: t('admin.designer.palette.kitchen'), icon: <div className="w-8 h-4 bg-slate-500/30 rounded border border-slate-500/50 flex items-center justify-center text-[6px] font-bold">MUTFAK</div> },
                { type: 'checkout' as ElementType, label: t('admin.designer.palette.checkout'), icon: <div className="w-8 h-4 bg-amber-600/30 rounded border border-amber-500/50 flex items-center justify-center text-[6px] font-bold">KASA</div> },
            ]
        },
        {
            title: t('admin.designer.palette.cat.notes'),
            items: [
                { type: 'label' as ElementType, label: t('admin.designer.palette.label'), icon: <FiType className="text-xl" /> },
            ]
        }
    ], [t]);

    return (
        <div className="w-72 h-full flex flex-col bg-[#0f172a]/80 backdrop-blur-3xl border-r border-white/5 p-6 animate-in slide-in-from-left-4 duration-700 overflow-y-auto no-scrollbar">
            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-10 border-b border-amber-500/10 pb-4 text-center">
                {t('admin.designer.palette.title')}
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
                {t('admin.designer.palette.hint')}
            </div>
        </div>
    );
};
