import { create } from 'zustand';

/* ═══════════ Types ═══════════ */

export type NotificationKind =
    | 'qr_order'
    | 'service_call'
    | 'service_call_urgent'
    | 'external_order'
    | 'item_ready'
    | 'whatsapp_order';

export interface PosNotification {
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    /** İlgili masa ID'si (kat planında pulse animasyonu için) */
    tableId?: number;
    tableName?: string;
    orderId?: number | string;
    customerName?: string;
    totalAmount?: number;
    createdAt: number; // Date.now()
    /** TTL ms cinsinden — default 15000 */
    ttl: number;
}

interface NotificationStore {
    notifications: PosNotification[];
    /** Kat planında animasyonlu masalar: tableId → kind */
    glowingTables: Map<number, NotificationKind>;

    addNotification: (n: Omit<PosNotification, 'id' | 'createdAt'>) => void;
    dismissNotification: (id: string) => void;
    clearAll: () => void;
    /** Expire olmuş bildirimleri temizle */
    pruneExpired: () => void;

    addGlowingTable: (tableId: number, kind: NotificationKind) => void;
    removeGlowingTable: (tableId: number) => void;
}

let _counter = 0;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
    notifications: [],
    glowingTables: new Map(),

    addNotification: (n) => {
        const id = `notif-${Date.now()}-${++_counter}`;
        const notification: PosNotification = {
            ...n,
            id,
            createdAt: Date.now(),
        };

        set((s) => {
            // Max 5 bildirim — en eski silinir
            const next = [...s.notifications, notification];
            if (next.length > 5) next.shift();
            return { notifications: next };
        });

        // Masa pulse animasyonu ekle
        if (n.tableId != null && Number.isFinite(n.tableId)) {
            get().addGlowingTable(n.tableId, n.kind);
        }

        // Otomatik expire
        setTimeout(() => {
            get().dismissNotification(id);
        }, n.ttl || 15000);
    },

    dismissNotification: (id) => {
        set((s) => ({
            notifications: s.notifications.filter((n) => n.id !== id),
        }));
    },

    clearAll: () => set({ notifications: [] }),

    pruneExpired: () => {
        const now = Date.now();
        set((s) => ({
            notifications: s.notifications.filter((n) => now - n.createdAt < n.ttl),
        }));
    },

    addGlowingTable: (tableId, kind) => {
        set((s) => {
            const next = new Map(s.glowingTables);
            next.set(tableId, kind);
            return { glowingTables: next };
        });

        // 20 saniye sonra otomatik kaldır
        setTimeout(() => {
            get().removeGlowingTable(tableId);
        }, 20000);
    },

    removeGlowingTable: (tableId) => {
        set((s) => {
            const next = new Map(s.glowingTables);
            next.delete(tableId);
            return { glowingTables: next };
        });
    },
}));
