import { create } from 'zustand';

interface UIState {
    isMenuOpen: boolean;
    isCartOpen: boolean;
    showKitchenStatus: boolean;
    showCallerId: boolean;
    showCustomerModal: boolean;
    showWaOrder: boolean;
    showOnlineOrders: boolean;
    showStaffMenu: boolean;
    activeModal: 'product' | 'checkout' | 'kitchen' | 'caller' | 'customer' | 'wa' | 'online_orders' | 'staff_menu' | 'staff_panel' | null;
    staffPanelTab: 'profile' | 'stats' | 'report' | null;

    callerIdData: { number: string; name: string; address?: string; customerId?: number } | null;
    pendingOnlineOrders: number;
    externalOrders: any[];
    pendingWaOrders: number;
    whatsappOrders: any[];
    pendingCalls: number;
    recentCalls: any[];

    isOnlineOrderAlertActive: boolean;
    onlineOrderType: 'qr' | 'whatsapp' | null;
    tablePresence: Record<number, { waiterId: number; waiterName: string }>;
    setTablePresence: (tableId: number, presence: { waiterId: number; waiterName: string } | null) => void;

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
    setCallerId: (isOpen: boolean, data?: UIState['callerIdData']) => void;
    setCustomerModal: (isOpen: boolean) => void;
    setWaOrder: (isOpen: boolean) => void;
    setOnlineOrders: (isOpen: boolean) => void;
    setStaffMenu: (isOpen: boolean) => void;
    setStaffPanelTab: (tab: UIState['staffPanelTab']) => void;
    setActiveModal: (modal: UIState['activeModal']) => void;


    setActiveCustomer: (customer: any) => void;
    setSelectedCourier: (courierId: string) => void;
    setPendingOnlineOrders: (count: number | ((prev: number) => number)) => void;
    addExternalOrder: (order: any) => void;
    removeExternalOrder: (id: string) => void;
    setPendingWaOrders: (count: number | ((prev: number) => number)) => void;

    setPendingCalls: (count: number | ((prev: number) => number)) => void;
    addWhatsappOrder: (order: any) => void;
    removeWhatsappOrder: (id: string) => void;
    addRecentCall: (call: any) => void;
    removeRecentCall: (number: string) => void;
    setOnlineOrderAlert: (isActive: boolean, type?: 'qr' | 'whatsapp' | null) => void;

    // Product Modal Actions
    openProductModal: (product: any) => void;
    closeProductModal: () => void;
    setModalVariant: (variant: any) => void;
    setModalMods: (mods: any[]) => void;
    toggleModalMod: (mod: any) => void;
    setEditingCartId: (id: string | null) => void;

    closeAllModals: () => void;

    // Payment Simulation
    paymentSimulation: {
        isOpen: boolean;
        amount: number;
        method: string;
        status: 'connecting' | 'waiting_card' | 'processing' | 'success' | 'error';
        onComplete?: () => void;
    };
    setPaymentSimulation: (sim: Partial<UIState['paymentSimulation']>) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    isMenuOpen: true,
    isCartOpen: false,
    showKitchenStatus: false,
    showCallerId: false,
    showCustomerModal: false,
    showWaOrder: false,
    showOnlineOrders: false,
    showStaffMenu: false,
    staffPanelTab: null,
    activeModal: null,


    callerIdData: null,
    pendingOnlineOrders: 0,
    externalOrders: [],
    pendingWaOrders: 0,
    whatsappOrders: [],
    pendingCalls: 0,
    recentCalls: [],

    isOnlineOrderAlertActive: false,
    onlineOrderType: null,
    tablePresence: {},

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
    setCallerId: (isOpen, data = null) => set({ showCallerId: isOpen, callerIdData: data, activeModal: isOpen ? 'caller' : null }),
    setCustomerModal: (isOpen) => set({ showCustomerModal: isOpen, activeModal: isOpen ? 'customer' : null }),
    setWaOrder: (isOpen) => set({ showWaOrder: isOpen, activeModal: isOpen ? 'wa' : null }),
    setOnlineOrders: (isOpen) => set({ showOnlineOrders: isOpen, activeModal: isOpen ? 'online_orders' : null }),
    setStaffMenu: (isOpen) => set({ showStaffMenu: isOpen, activeModal: isOpen ? 'staff_menu' : null }),
    setStaffPanelTab: (tab) => set({ staffPanelTab: tab, activeModal: tab ? 'staff_panel' : null }),
    setActiveModal: (modal) => set({ activeModal: modal }),


    setActiveCustomer: (customer) => set({ activeCustomer: customer }),
    setSelectedCourier: (courierId) => set({ selectedCourier: courierId }),
    setPendingOnlineOrders: (count) => set((s) => ({ 
        pendingOnlineOrders: typeof count === 'function' ? (count as any)(s.pendingOnlineOrders) : count 
    })),
    addExternalOrder: (order) => set((s) => ({ 
        externalOrders: [order, ...s.externalOrders],
        pendingOnlineOrders: s.pendingOnlineOrders + 1 
    })),
    removeExternalOrder: (id) => set((s) => ({ 
        externalOrders: s.externalOrders.filter(o => o.id !== id),
        pendingOnlineOrders: Math.max(0, s.pendingOnlineOrders - 1)
    })),
    setPendingWaOrders: (count) => set((s) => {

        const nextCount = typeof count === 'function' ? (count as any)(s.pendingWaOrders) : count;
        return { pendingWaOrders: nextCount };
    }),
    setPendingCalls: (count) => set((s) => ({
        pendingCalls: typeof count === 'function' ? (count as any)(s.pendingCalls) : count
    })),
    addWhatsappOrder: (order) => set((s) => ({ 
        whatsappOrders: [order, ...s.whatsappOrders],
        pendingWaOrders: s.pendingWaOrders + 1 
    })),
    removeWhatsappOrder: (id) => set((s) => ({ 
        whatsappOrders: s.whatsappOrders.filter(o => o.id !== id),
        pendingWaOrders: Math.max(0, s.pendingWaOrders - 1)
    })),
    addRecentCall: (call) => set((s) => ({ 
        recentCalls: [call, ...s.recentCalls.filter(c => c.number !== call.number)].slice(0, 20),
        pendingCalls: s.pendingCalls + 1 
    })),
    removeRecentCall: (number) => set((s) => ({ 
        recentCalls: s.recentCalls.filter(c => c.number !== number),
        pendingCalls: Math.max(0, s.pendingCalls - 1)
    })),
    setOnlineOrderAlert: (isActive, type = null) => set({ 
        isOnlineOrderAlertActive: isActive, 
        onlineOrderType: type 
    }),
    setTablePresence: (tableId, presence) => set((s) => {
        const next = { ...s.tablePresence };
        if (presence) {
            next[tableId] = presence;
        } else {
            delete next[tableId];
        }
        return { tablePresence: next };
    }),

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
        showWaOrder: false,
        showStaffMenu: false,
        staffPanelTab: null,
        callerIdData: null,


        activeModal: null,
        modalProduct: null,
        modalVariant: null,
        modalMods: [],
        editingCartId: null,
    }),

    paymentSimulation: {
        isOpen: false,
        amount: 0,
        method: '',
        status: 'connecting',
    },
    setPaymentSimulation: (sim) => set((state) => ({
        paymentSimulation: { ...state.paymentSimulation, ...sim }
    })),
}));
