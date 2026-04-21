/** Admin ayarı yoksa veya geçersizse kullanılan varsayılan (dakika) */
export const LONG_OCCUPIED_DEFAULT_MINUTES = 45;

/**
 * Masa planında “uzun süre dolu” (kırmızı) eşiği — Admin → Ayarlar → Operasyonel.
 * Aralık: 5–720 dakika.
 */
export function getLongOccupiedThresholdMinutes(
    settings: { integrations?: { longOccupiedMinutes?: number } } | null | undefined,
): number {
    const raw = settings?.integrations?.longOccupiedMinutes;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return LONG_OCCUPIED_DEFAULT_MINUTES;
    return Math.min(720, Math.max(5, Math.floor(n)));
}
