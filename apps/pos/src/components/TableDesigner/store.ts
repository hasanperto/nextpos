import { create } from 'zustand';

export type ElementType = 'table-2' | 'table-4' | 'table-6' | 'wall' | 'window' | 'door' | 'label';

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

interface TableDesignerState {
    elements: CanvasElement[];
    selectedId: string | null;
    activeSectionId: number | null;
    gridSize: number;
    setElements: (elements: CanvasElement[]) => void;
    setActiveSectionId: (id: number | null) => void;
    addElement: (element: CanvasElement) => void;
    updateElement: (id: string, updates: Partial<CanvasElement>) => void;
    removeElement: (id: string) => void;
    setSelectedId: (id: string | null) => void;
}

export const useTableDesignerStore = create<TableDesignerState>((set) => ({
    elements: [],
    selectedId: null,
    activeSectionId: null,
    gridSize: 20,
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
}));
