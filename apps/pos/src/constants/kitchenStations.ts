/** API / DB ile aynı kodlar: sıcak mutfak, bar, soğuk */
export const KITCHEN_STATION_IDS = ['hot', 'bar', 'cold'] as const;
export type KitchenStationId = (typeof KITCHEN_STATION_IDS)[number];

export const KITCHEN_STATIONS: { id: KitchenStationId; label: string; shortLabel: string }[] = [
    { id: 'hot', label: 'Ana mutfak', shortLabel: 'Sıcak' },
    { id: 'bar', label: 'Bar', shortLabel: 'Bar' },
    { id: 'cold', label: 'Soğuk', shortLabel: 'Soğuk' },
];

export function isKitchenStationId(s: string | undefined): s is KitchenStationId {
    return s != null && (KITCHEN_STATION_IDS as readonly string[]).includes(s);
}

export function normalizeKitchenStation(raw: string | null | undefined): KitchenStationId {
    const x = String(raw || 'hot').toLowerCase().trim();
    if (x === 'bar' || x === 'cold') return x;
    return 'hot';
}
