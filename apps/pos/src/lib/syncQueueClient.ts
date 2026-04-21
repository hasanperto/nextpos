import { offlineDb } from './offlineDb';

const PENDING_EVENT = 'nextpos-sync-pending';

/** Çevrimdışı kuyruk: bu süreden eski kayıtlar senkronize edilmez ve silinir (varsayılan 48 saat). */
export function getOfflineSyncMaxAgeMs(): number {
    const raw = import.meta.env.VITE_OFFLINE_SYNC_MAX_HOURS;
    const h = raw !== undefined && raw !== '' ? Number(raw) : 48;
    const hours = Number.isFinite(h) && h > 0 ? Math.min(h, 168) : 48;
    return hours * 60 * 60 * 1000;
}

function notifyPendingChanged(): void {
    window.dispatchEvent(new CustomEvent(PENDING_EVENT));
}

export async function getPendingSyncCount(): Promise<number> {
    return offlineDb.pendingSync.count();
}

/** Kasiyer sipariş gövdesi (POST /orders veya /orders/checkout ile uyumlu JSON). */
export async function enqueuePendingSync(
    entityType: 'pos_order' | 'pos_checkout',
    payload: Record<string, unknown>
): Promise<void> {
    await purgeExpiredPendingSync();
    const offlineId = crypto.randomUUID();
    await offlineDb.pendingSync.add({
        offlineId,
        entityType,
        action: 'create',
        payload,
        createdAt: Date.now(),
    });
    notifyPendingChanged();
}

/** Süresi dolmuş (ör. 24–48 saat) bekleyen kayıtları siler; silinen satır sayısını döner. */
export async function purgeExpiredPendingSync(): Promise<number> {
    const maxAge = getOfflineSyncMaxAgeMs();
    const cutoff = Date.now() - maxAge;
    const rows = await offlineDb.pendingSync.toArray();
    const expiredIds = rows.filter((r) => r.createdAt < cutoff).map((r) => r.id).filter((id): id is number => id != null);
    if (expiredIds.length) {
        await offlineDb.pendingSync.bulkDelete(expiredIds);
        notifyPendingChanged();
    }
    return expiredIds.length;
}

function isLikelyNetworkFailure(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
    return err instanceof TypeError;
}

export function shouldQueueOfflineError(err: unknown): boolean {
    return isLikelyNetworkFailure(err);
}

export type FlushSyncResult = { flushed: number; serverFailed: number; expiredDropped: number };

/** Tüm bekleyen kayıtları tek istekte sunucu kuyruğuna iter. Sunucu işleme hatası varsa IndexedDB silinmez. */
export async function flushPendingSync(getHeaders: () => Record<string, string>): Promise<FlushSyncResult> {
    const expiredDropped = await purgeExpiredPendingSync();
    const rows = await offlineDb.pendingSync.orderBy('createdAt').toArray();
    if (rows.length === 0) return { flushed: 0, serverFailed: 0, expiredDropped };

    const items = rows.map((r) => ({
        offlineId: r.offlineId,
        entityType: r.entityType,
        action: 'create' as const,
        payload: r.payload,
    }));

    const res = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
    });

    if (res.status === 401) {
        return { flushed: 0, serverFailed: 0, expiredDropped };
    }
    if (!res.ok) {
        throw new Error(`sync push ${res.status}`);
    }

    const j = (await res.json()) as { failed?: number };
    const serverFailed = Number(j.failed ?? 0);
    if (serverFailed > 0) {
        notifyPendingChanged();
        return { flushed: 0, serverFailed, expiredDropped };
    }

    const ids = rows.map((r) => r.id).filter((id): id is number => id != null);
    if (ids.length) {
        await offlineDb.pendingSync.bulkDelete(ids);
    }
    notifyPendingChanged();
    return { flushed: rows.length, serverFailed: 0, expiredDropped };
}

/** Sunucuda failed olan sync_queue satırlarını yeniden dener (admin/kasiyer). */
export async function retryServerSyncQueue(
    getHeaders: () => Record<string, string>
): Promise<{ reset: number; processed: number; failed: number }> {
    const res = await fetch('/api/v1/sync/retry', {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
    });
    if (res.status === 401) {
        throw new Error('AUTH');
    }
    if (!res.ok) {
        throw new Error(`retry ${res.status}`);
    }
    return (await res.json()) as { reset: number; processed: number; failed: number };
}

export function subscribePendingSyncCount(onChange: (n: number) => void): () => void {
    const refresh = () => {
        void getPendingSyncCount().then(onChange);
    };
    refresh();
    window.addEventListener(PENDING_EVENT, refresh);
    window.addEventListener('online', refresh);
    const t = window.setInterval(refresh, 8000);
    return () => {
        window.removeEventListener(PENDING_EVENT, refresh);
        window.removeEventListener('online', refresh);
        window.clearInterval(t);
    };
}

const MENU_REVISION_KEY = 'nextpos_menu_revision';

export function getStoredMenuRevision(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(MENU_REVISION_KEY);
}

function setStoredMenuRevision(rev: string): void {
    localStorage.setItem(MENU_REVISION_KEY, rev);
}

/** Sunucu menü revizyonunu çeker; `since` önbellekten gelir. Yanıttaki `menuRevision` her zaman saklanır. */
export async function pullMenuRevision(
    getHeaders: () => Record<string, string>
): Promise<{ menuRevision: string; menuStale: boolean } | null> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

    const since = getStoredMenuRevision();
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    const res = await fetch(`/api/v1/sync/pull${q}`, { headers: getHeaders() });

    if (res.status === 401) return null;
    if (!res.ok) return null;

    const j = (await res.json()) as { menuRevision?: string; menuStale?: boolean };
    const menuRevision = String(j.menuRevision ?? '');
    if (menuRevision) setStoredMenuRevision(menuRevision);
    return { menuRevision, menuStale: Boolean(j.menuStale) };
}

export type MenuRevisionFetchers = {
    fetchCategories: () => void | Promise<void>;
    fetchProducts: () => void | Promise<void>;
    fetchModifiers: () => void | Promise<void>;
    fetchTables: () => void | Promise<void>;
    fetchOrders: () => void | Promise<void>;
};

/** `menuStale` ise menü+masa+siparişi yeniler. `true` = veri güncellendi. */
export async function applyMenuRevisionIfStale(
    getHeaders: () => Record<string, string>,
    actions: MenuRevisionFetchers
): Promise<boolean> {
    const r = await pullMenuRevision(getHeaders);
    if (!r?.menuStale) return false;
    await Promise.all([
        actions.fetchCategories(),
        actions.fetchProducts(),
        actions.fetchModifiers(),
        actions.fetchTables(),
        actions.fetchOrders(),
    ]);
    return true;
}
