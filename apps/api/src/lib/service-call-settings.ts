/** Garson çağrısı: yanıt yoksa eskalasyon / devralma penceresi (saniye). Admin ayarından okunur. */
export const SERVICE_CALL_ESCALATION_SEC_MIN = 15;
export const SERVICE_CALL_ESCALATION_SEC_MAX = 600;
export const SERVICE_CALL_ESCALATION_SEC_DEFAULT = 60;

export function parseServiceCallEscalationSecondsFromIntegrations(integrations: unknown): number {
    const int = integrations && typeof integrations === 'object' ? (integrations as Record<string, unknown>) : {};
    const esc = Number(int.serviceCallEscalationSeconds);
    if (Number.isFinite(esc) && esc >= SERVICE_CALL_ESCALATION_SEC_MIN) {
        return Math.min(SERVICE_CALL_ESCALATION_SEC_MAX, Math.floor(esc));
    }
    return SERVICE_CALL_ESCALATION_SEC_DEFAULT;
}

/** Tenant bağlantısı açıkken (search_path tenant) ilk şubenin settings JSON'undan okur. */
export async function getServiceCallEscalationSecondsFromDb(
    connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    branchId?: number | null
): Promise<number> {
    const [rows]: any =
        branchId != null && Number.isFinite(Number(branchId))
            ? await connection.query('SELECT settings FROM branches WHERE id = ? LIMIT 1', [Number(branchId)])
            : await connection.query('SELECT settings FROM branches ORDER BY id ASC LIMIT 1', []);
    const raw = rows?.[0]?.settings;
    const parsed =
        typeof raw === 'string'
            ? (() => {
                  try {
                      return JSON.parse(raw) as Record<string, unknown>;
                  } catch {
                      return {};
                  }
              })()
            : raw && typeof raw === 'object'
              ? (raw as Record<string, unknown>)
              : {};
    const integrations = parsed.integrations;
    return parseServiceCallEscalationSecondsFromIntegrations(integrations);
}
