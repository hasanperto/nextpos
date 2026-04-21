import { queryPublic } from '../lib/db.js';

function safeRetentionDays(raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 90;
    return Math.max(1, Math.min(3650, Math.trunc(n)));
}

export async function runAuditRetentionCleanup(): Promise<void> {
    try {
        try {
            await queryPublic('ALTER TABLE `public`.system_settings ADD COLUMN IF NOT EXISTS audit_retention_days INTEGER DEFAULT 90');
        } catch {
            /* ignore */
        }
        const [rows]: any = await queryPublic('SELECT audit_retention_days FROM `public`.system_settings WHERE id = 1 LIMIT 1');
        const retentionDays = safeRetentionDays(rows?.[0]?.audit_retention_days);
        const [result]: any = await queryPublic(
            `DELETE FROM \`public\`.audit_logs
             WHERE created_at < NOW() - (?::text || ' days')::interval`,
            [String(retentionDays)],
        );
        const deleted = Number(result?.rowCount ?? 0);
        if (deleted > 0) {
            console.log(`🧹 Audit retention cleanup: ${deleted} kayıt silindi (policy=${retentionDays} gün)`);
        }
    } catch (error) {
        console.error('❌ Audit retention cleanup hatası:', error);
    }
}

