import { create } from 'zustand';

interface UIState {
    isMenuOpen: boolean;
    isCartOpen: boolean;
    showKitchenStatus: boolean;
    showCallerId: boolean;
    showCustomerModal: boolean;
    showWaOrder: boolean;
    activeModal: 'product' | 'checkout' | 'kitchen' | 'caller' | 'customer' | 'wa' | null;

    // Product Modal State
    modalProduct: any;
    modalVariant: any;
    modalMods: any[];
    editingCartId: string | null;
    activeCustomer: any;
    selectedCourier: string;

    setMenuOpen: (isOpen: boolean) => void;
    setCartOpen: (isOpen: boolean) => void;
    setKitchenStatus: (isOpen: boolean) => void;
    setCallerId: (isOpen: boolean) => void;
    setCustomerModal: (isOpen: boolean) => void;
    setWaOrder: (isOpen: boolean) => void;
    setActiveModal: (modal: UIState['activeModal']) => void;
    setActiveCustomer: (customer: any) => void;
    setSelectedCourier: (courierId: string) => void;

    // Product Modal Actions
    openProductModal: (product: any) => void;
    closeProductModal: () => void;
    setModalVariant: (variant: any) => void;
    setModalMods: (mods: any[]) => void;
    toggleModalMod: (mod: any) => void;
    setEditingCartId: (id: string | null) => void;

    closeAllModals: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    isMenuOpen: true,
    isCartOpen: false,
    showKitchenStatus: false,
    showCallerId: false,
    showCustomerModal: false,
    showWaOrder: false,
    activeModal: null,

    // Product Modal Initial State
    modalProduct: null,
    modalVariant: null,
    modalMods: [],
    editingCartId: null,
    activeCustomer: null,
    selectedCourier: '',

    setMenuOpen: (isOpen) => set({ isMenuOpen: isOpen }),
    setCartOpen: (isOpen) => set({ isCartOpen: isOpen }),
    setKitchenStatus: (isOpen) => set({ showKitchenStatus: isOpen, activeModal: isOpen ? 'kitchen' : null }),
    setCallerId: (isOpen) => set({ showCallerId: isOpen, activeModal: isOpen ? 'caller' : null }),
    setCustomerModal: (isOpen) => set({ showCustomerModal: isOpen, activeModal: isOpen ? 'customer' : null }),
    setWaOrder: (isOpen) => set({ showWaOrder: isOpen, activeModal: isOpen ? 'wa' : null }),
    setActiveModal: (modal) => set({ activeModal: modal }),
    setActiveCustomer: (customer) => set({ activeCustomer: customer }),
    setSelectedCourier: (courierId) => set({ selectedCourier: courierId }),

    // Product Modal Actions
    openProductModal: (product) => {
        let variant = null;
        if (product.variants && product.variants.length > 0) {
            variant = product.variants.find((v: any) => v.isDefault) || product.variants[0];
        }
        set({
            modalProduct: product,
            modalVariant: variant,
            modalMods: [],
            activeModal: 'product'
        });
    },
    closeProductModal: () => set({
        modalProduct: null,
        modalVariant: null,
        modalMods: [],
        editingCartId: null,
        activeModal: null
    }),
    setModalVariant: (variant) => set({ modalVariant: variant }),
    setModalMods: (mods) => set({ modalMods: mods }),
    toggleModalMod: (mod) => {
        const mods = get().modalMods;
        const isSelected = mods.find((m) => m.id === mod.id);
        if (isSelected) {
            set({ modalMods: mods.filter((m) => m.id !== mod.id) });
        } else {
            set({ modalMods: [...mods, mod] });
        }
    },
    setEditingCartId: (id) => set({ editingCartId: id }),

    closeAllModals: () => set({
        isCartOpen: false,
        showKitchenStatus: false,
        showCallerId: false,
        showCustomerModal: false,
        showWaOrder: false,
        activeModal: null,
        modalProduct: null,
        modalVariant: null,
        modalMods: [],
        editingCartId: null,
    }),
}));
