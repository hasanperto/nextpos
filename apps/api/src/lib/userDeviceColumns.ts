export async function ensureUsersDeviceIdColumn(conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await conn.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id VARCHAR(64)`);
}

