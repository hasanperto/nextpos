/**
 * Masa QR alanı boşsa kiosk / QR API için stabil yedek anahtar (masa id).
 * Tüm tenant sorgularında aynı mantık kullanılmalı.
 */
export const KIOSK_FALLBACK_QR_PREFIX = '__nextpos_tid_';

export function effectiveTableQrCode(row: { id: number; qr_code?: unknown }): string {
    const q = row.qr_code != null ? String(row.qr_code).trim() : '';
    return q || `${KIOSK_FALLBACK_QR_PREFIX}${row.id}`;
}

/** WHERE parçası: önce gerçek qr_code, yoksa yedek id anahtarı */
export function tableWhereByQrParam(qrCode: string): { clause: string; params: unknown[] } {
    const q = String(qrCode || '').trim();
    const m = new RegExp(`^${KIOSK_FALLBACK_QR_PREFIX}(\\d+)$`).exec(q);
    if (m) {
        return { clause: 't.id = ?', params: [Number(m[1])] };
    }
    return { clause: 't.qr_code = ?', params: [q] };
}
