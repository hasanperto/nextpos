const STORAGE_KEY = 'nextpos_device_id_v1';

export function getDeviceId(): string {
    try {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing && existing.trim()) return existing.trim();
        const created =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
        localStorage.setItem(STORAGE_KEY, String(created));
        return String(created);
    } catch {
        const created = `${Date.now()}-${Math.random()}`;
        return created;
    }
}

