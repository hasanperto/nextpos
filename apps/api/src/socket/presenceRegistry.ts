/**
 * Kiracı başına, Socket.io ile bağlı POS personeli (admin, kasiyer, mutfak vb.)
 * — SaaS panelinden "kim çevrimiçi" görünümü için.
 */

export type PresenceStaffEntry = {
    socketId: string;
    userId: string | number;
    username: string;
    role: string;
    location?: { lat: number; lng: number };
    lastSeen?: number;
};

const byTenant = new Map<string, Map<string, PresenceStaffEntry>>();

export function presenceRegister(tenantId: string, socketId: string, entry: Omit<PresenceStaffEntry, 'socketId'>): PresenceStaffEntry[] {
    let m = byTenant.get(tenantId);
    if (!m) {
        m = new Map();
        byTenant.set(tenantId, m);
    }
    m.set(socketId, { ...entry, socketId, lastSeen: Date.now() });
    return presenceSnapshot(tenantId);
}

export function presenceUpdateLocation(tenantId: string, socketId: string, location: { lat: number, lng: number }): PresenceStaffEntry[] {
    const m = byTenant.get(tenantId);
    if (!m) return [];
    const entry = m.get(socketId);
    if (entry) {
        entry.location = location;
        entry.lastSeen = Date.now();
    }
    return presenceSnapshot(tenantId);
}

export function presenceUnregister(tenantId: string, socketId: string): PresenceStaffEntry[] {
    const m = byTenant.get(tenantId);
    if (!m) return [];
    m.delete(socketId);
    if (m.size === 0) byTenant.delete(tenantId);
    return presenceSnapshot(tenantId);
}

export function presenceSnapshot(tenantId: string): PresenceStaffEntry[] {
    const m = byTenant.get(tenantId);
    if (!m) return [];
    return [...m.values()];
}

/** Süper admin: tüm kiracıların anlık listesi */
export function presenceSnapshotAll(): Record<string, PresenceStaffEntry[]> {
    const out: Record<string, PresenceStaffEntry[]> = {};
    for (const [tid, m] of byTenant) {
        out[tid] = [...m.values()];
    }
    return out;
}
