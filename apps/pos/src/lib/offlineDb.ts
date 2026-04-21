import Dexie, { type Table } from 'dexie';

export type PendingSyncRow = {
    id?: number;
    offlineId: string;
    entityType: string;
    action: 'create';
    payload: Record<string, unknown>;
    createdAt: number;
};

/** Anahtar: `menu:cat:tr`, `menu:prod:tr`, `menu:mod:tr`, `tables` */
export type SnapRow = {
    key: string;
    payload: unknown;
    savedAt: number;
};

class OfflineDB extends Dexie {
    pendingSync!: Table<PendingSyncRow, number>;
    snap!: Table<SnapRow, string>;

    constructor() {
        super('nextpos-offline');
        this.version(1).stores({
            pendingSync: '++id, offlineId, createdAt',
        });
        this.version(2).stores({
            pendingSync: '++id, offlineId, createdAt',
            snap: 'key',
        });
    }
}

export const offlineDb = new OfflineDB();
