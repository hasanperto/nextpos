import { create } from 'zustand';

export type ElementType = 
    | 'table-2' | 'table-4' | 'table-6' | 'table-8' 
    | 'wall' | 'wall-corner' | 'pillar' | 'stairs' | 'sofa' | 'plant' | 'bar-counter' | 'door' | 'window' | 'label'
    | 'kitchen' | 'checkout';

export interface CanvasElement {
    id: string;
    type: ElementType;
    section_id: number;
    x: number;
    y: number;
    rotation: number;
    label?: string;
    width: number;
    height: number;
}

export interface BgSettings {
    url: string;
    opacity: number;
    scale: number;
    x: number;
    y: number;
}

interface TableDesignerState {
    elements: CanvasElement[];
    selectedId: string | null;
    activeSectionId: number | null;
    gridSize: number;
    bgImages: Record<number, BgSettings>;
    setElements: (elements: CanvasElement[]) => void;
    setActiveSectionId: (id: number | null) => void;
    addElement: (element: CanvasElement) => void;
    updateElement: (id: string, updates: Partial<CanvasElement>) => void;
    removeElement: (id: string) => void;
    setSelectedId: (id: string | null) => void;
    setSectionBg: (sectionId: number, bg: Partial<BgSettings>) => void;
    setAllBgs: (bgs: Record<number, BgSettings>) => void;
}

export const useTableDesignerStore = create<TableDesignerState>((set) => ({
    elements: [],
    selectedId: null,
    activeSectionId: null,
    gridSize: 20,
    bgImages: {},
    setElements: (elements) => set({ elements }),
    setActiveSectionId: (id) => set({ activeSectionId: id }),
    addElement: (element) => set((state) => ({ elements: [...state.elements, element] })),
    updateElement: (id, updates) => set((state) => ({
        elements: state.elements.map((el) => (el.id === id ? { ...el, ...updates } : el))
    })),
    removeElement: (id) => set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
    })),
    setSelectedId: (id) => set({ selectedId: id }),
    setSectionBg: (sectionId, bg) => set((state) => {
        const current = state.bgImages[sectionId] || { url: '', opacity: 0.5, scale: 1.0, x: 0, y: 0 };
        return {
            bgImages: {
                ...state.bgImages,
                [sectionId]: { ...current, ...bg }
            }
        };
    }),
    setAllBgs: (bgs) => set({ bgImages: bgs }),
}));
