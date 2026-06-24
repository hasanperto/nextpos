/** Mutfak / kiosk çevrimdışı önbellek ve kuyruk (localStorage) */

const kitchenTicketsKey = (station: string) => `pos-kitchen-tickets-${station}`;
const KITCHEN_QUEUE_KEY = 'pos-kitchen-offline-queue';
const kioskMenuKey = (tenant: string, lang: string) => `pos-kiosk-menu-${tenant}-${lang}`;
const KIOSK_ORDER_QUEUE_KEY = 'pos-kiosk-offline-order-queue';

export type KitchenOfflineAction = { id: number; status: string };
export type KioskMenuSnapshot = {
    tableInfo: Record<string, unknown>;
    categories: unknown[];
    products: unknown[];
    savedAt: number;
};
export type KioskQueuedOrder = {
    tenant: string;
    payload: Record<string, unknown>;
    createdAt: number;
};

function safeParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function saveKitchenTicketsCache(station: string, tickets: unknown[]): void {
    try {
        localStorage.setItem(kitchenTicketsKey(station), JSON.stringify({ tickets, savedAt: Date.now() }));
    } catch {
        /* ignore */
    }
}

export function loadKitchenTicketsCache(station: string): unknown[] | null {
    const data = safeParse<{ tickets?: unknown[] }>(localStorage.getItem(kitchenTicketsKey(station)));
    return Array.isArray(data?.tickets) ? data.tickets : null;
}

export function saveKitchenOfflineQueue(items: KitchenOfflineAction[]): void {
    try {
        localStorage.setItem(KITCHEN_QUEUE_KEY, JSON.stringify(items));
    } catch {
        /* ignore */
    }
}

export function loadKitchenOfflineQueue(): KitchenOfflineAction[] {
    const data = safeParse<KitchenOfflineAction[]>(localStorage.getItem(KITCHEN_QUEUE_KEY));
    return Array.isArray(data) ? data : [];
}

export function saveKioskMenuCache(tenant: string, lang: string, snap: Omit<KioskMenuSnapshot, 'savedAt'>): void {
    try {
        localStorage.setItem(kioskMenuKey(tenant, lang), JSON.stringify({ ...snap, savedAt: Date.now() }));
    } catch {
        /* ignore */
    }
}

export function loadKioskMenuCache(tenant: string, lang: string): KioskMenuSnapshot | null {
    return safeParse<KioskMenuSnapshot>(localStorage.getItem(kioskMenuKey(tenant, lang)));
}

export function enqueueKioskOrder(tenant: string, payload: Record<string, unknown>): void {
    const queue = loadKioskOrderQueue();
    queue.push({ tenant, payload, createdAt: Date.now() });
    try {
        localStorage.setItem(KIOSK_ORDER_QUEUE_KEY, JSON.stringify(queue));
    } catch {
        /* ignore */
    }
}

export function loadKioskOrderQueue(): KioskQueuedOrder[] {
    const data = safeParse<KioskQueuedOrder[]>(localStorage.getItem(KIOSK_ORDER_QUEUE_KEY));
    return Array.isArray(data) ? data : [];
}

export function saveKioskOrderQueue(queue: KioskQueuedOrder[]): void {
    try {
        localStorage.setItem(KIOSK_ORDER_QUEUE_KEY, JSON.stringify(queue));
    } catch {
        /* ignore */
    }
}

export async function flushKioskOrderQueue(
    tenant: string,
    postOrder: (payload: Record<string, unknown>) => Promise<boolean>,
): Promise<number> {
    const all = loadKioskOrderQueue();
    const mine = all.filter((q) => q.tenant === tenant);
    const rest = all.filter((q) => q.tenant !== tenant);
    const failed: KioskQueuedOrder[] = [];
    let sent = 0;
    for (const item of mine) {
        const ok = await postOrder(item.payload);
        if (ok) sent += 1;
        else failed.push(item);
    }
    saveKioskOrderQueue([...rest, ...failed]);
    return sent;
}
