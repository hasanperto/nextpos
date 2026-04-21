/**
 * Garson–bölge ataması (kasiyer masa açınca en müsait garson seçimi).
 * Veritabanı: PostgreSQL (tenant şeması).
 */
export async function ensureUsersWaiterSectionColumns(connection: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
    await connection.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS waiter_all_sections BOOLEAN NOT NULL DEFAULT TRUE`
    );
    await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS waiter_section_id INTEGER NULL`);
    await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(20) DEFAULT 'all'`);
}

type Conn = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

const activeWaiterSql = `(
    u.status IS NULL
    OR LOWER(TRIM(COALESCE(u.status::text, ''))) IN ('active', '1')
)`;

/**
 * Masanın bölgesine göre uygun garsonları listeler, aktif oturum sayısı en az olanı döner.
 */
export async function pickLeastLoadedWaiterForSection(
    connection: Conn,
    tableSectionId: number | null
): Promise<number | null> {
    const loadSub = `(SELECT COUNT(*)::int FROM table_sessions ts WHERE ts.waiter_id = u.id AND ts.status = 'active')`;

    const run = async (sectionMode: 'match_table' | 'all_salon_only' | 'any'): Promise<number | null> => {
        const params: unknown[] = [];
        let extra = '';
        if (sectionMode === 'match_table' && tableSectionId != null && Number.isFinite(Number(tableSectionId))) {
            extra = `AND (
                COALESCE(u.waiter_all_sections, TRUE) = TRUE
                OR (u.waiter_all_sections = FALSE AND u.waiter_section_id = ?)
            )`;
            params.push(Number(tableSectionId));
        } else if (sectionMode === 'all_salon_only') {
            extra = 'AND COALESCE(u.waiter_all_sections, TRUE) = TRUE';
        } else {
            extra = '';
        }

        const [rows]: any = await connection.query(
            `SELECT u.id, ${loadSub} AS load_cnt
             FROM users u
             WHERE u.role = 'waiter'
               AND ${activeWaiterSql}
               ${extra}
             ORDER BY load_cnt ASC, u.id ASC
             LIMIT 1`,
            params
        );
        const id = rows?.[0]?.id;
        return id != null ? Number(id) : null;
    };

    if (tableSectionId != null && Number.isFinite(Number(tableSectionId))) {
        const a = await run('match_table');
        if (a != null) return a;
    }
    const b = await run('all_salon_only');
    if (b != null) return b;
    return run('any');
}
