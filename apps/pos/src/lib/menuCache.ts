import toast from 'react-hot-toast';
import { offlineDb, type SnapRow } from './offlineDb';

const catKey = (lang: string) => `menu:cat:${lang}`;
const prodKey = (lang: string) => `menu:prod:${lang}`;
const modKey = (lang: string) => `menu:mod:${lang}`;
const TABLES_KEY = 'tables';

let offlineHintShown = false;

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        offlineHintShown = false;
    });
}

export function isOfflineNow(): boolean {
    // Yerel geliştirmede (localhost/127.0.0.1) her zaman online varsayalım veya navigator'a güvenelim
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return false; 
    }
    return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** Çevrimdışı önbellek kullanıldığında bir kez toast */
export function notifyOfflineCacheOnce(): void {
    if (offlineHintShown) return;
    offlineHintShown = true;
    toast('Çevrimdışı — son senkron menü gösteriliyor', { duration: 3500 });
}

async function putSnap(key: string, payload: unknown): Promise<void> {
    const row: SnapRow = { key, payload, savedAt: Date.now() };
    await offlineDb.snap.put(row);
}

export async function saveCategoriesCache(lang: string, categories: unknown[]): Promise<void> {
    await putSnap(catKey(lang), categories);
}

export async function saveProductsCache(lang: string, products: unknown[]): Promise<void> {
    await putSnap(prodKey(lang), products);
}

export async function saveModifiersCache(lang: string, modifiers: unknown[]): Promise<void> {
    await putSnap(modKey(lang), modifiers);
}

export async function saveTablesCache(tables: unknown[]): Promise<void> {
    await putSnap(TABLES_KEY, tables);
}

export async function loadCategoriesCache(lang: string): Promise<unknown[] | null> {
    const row = await offlineDb.snap.get(catKey(lang));
    if (row === undefined) return null;
    const p = row.payload;
    return Array.isArray(p) ? p : null;
}

export async function loadProductsCache(lang: string): Promise<unknown[] | null> {
    const row = await offlineDb.snap.get(prodKey(lang));
    if (row === undefined) return null;
    const p = row.payload;
    return Array.isArray(p) ? p : null;
}

export async function loadModifiersCache(lang: string): Promise<unknown[] | null> {
    const row = await offlineDb.snap.get(modKey(lang));
    if (row === undefined) return null;
    const p = row.payload;
    return Array.isArray(p) ? p : null;
}

export async function loadTablesCache(): Promise<unknown[] | null> {
    const row = await offlineDb.snap.get(TABLES_KEY);
    if (row === undefined) return null;
    const p = row.payload;
    return Array.isArray(p) ? p : null;
}

