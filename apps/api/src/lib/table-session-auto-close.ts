/**
 * Masa oturumunda iptal / tamamlanmış dışında sipariş kalmadıysa oturumu kapatır ve masayı boşaltır.
 * (Örn. mutfakta bekleyen tek sipariş iptal edildiğinde.)
 */
export async function closeTableSessionIfNoActiveOrders(
    connection: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    sessionId: number | null | undefined
): Promise<{ closed: boolean; tableId?: number }> {
    const sid = sessionId != null && Number.isFinite(Number(sessionId)) ? Number(sessionId) : null;
    if (sid == null || sid <= 0) {
        return { closed: false };
    }

    const [cntRows]: any = await connection.query(
        `SELECT COUNT(*)::int AS c FROM orders 
         WHERE session_id = ? AND status NOT IN ('cancelled', 'completed')`,
        [sid]
    );
    const remaining = Number(cntRows?.[0]?.c ?? 0);
    if (remaining > 0) {
        return { closed: false };
    }

    const [sessRows]: any = await connection.query(
        `SELECT id, table_id, status FROM table_sessions WHERE id = ? LIMIT 1`,
        [sid]
    );
    if (!sessRows?.length) {
        return { closed: false };
    }

    const tableIdRaw = sessRows[0]?.table_id;
    const tableId = tableIdRaw != null ? Number(tableIdRaw) : null;

    await connection.query(
        `UPDATE table_sessions SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [sid]
    );

    await connection.query(
        `UPDATE tables SET status = 'available', current_session_id = NULL WHERE current_session_id = ?`,
        [sid]
    );

    return { closed: true, tableId: tableId ?? undefined };
}
