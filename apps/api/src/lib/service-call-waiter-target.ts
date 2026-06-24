import { ensureUsersWaiterSectionColumns, pickLeastLoadedWaiterForSection } from './waiterSectionColumns.js';

type Conn = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

export async function isWaiterOnBreak(connection: Conn, userId: number): Promise<boolean> {
    const [rows]: any = await connection.query(
        `SELECT COALESCE(waiter_on_break, FALSE) AS b
         FROM users
         WHERE id = ? AND role = 'waiter'
           AND (status IS NULL OR LOWER(TRIM(COALESCE(status::text, ''))) IN ('active', '1'))`,
        [userId]
    );
    return Boolean(rows?.[0]?.b);
}

/**
 * Garson çağrısı hedefi: önce kasiyer seçimi, yoksa oturum garsonu; moladaysa veya yoksa müsait garson.
 */
export async function resolveServiceCallWaiterTarget(
    connection: Conn,
    args: {
        sectionId: number | null;
        sessionWaiterId: number | null;
        explicitWaiterId: number | null;
    }
): Promise<number | null> {
    await ensureUsersWaiterSectionColumns(connection);
    const exclude: number[] = [];

    if (args.explicitWaiterId != null && Number.isFinite(Number(args.explicitWaiterId))) {
        const id = Number(args.explicitWaiterId);
        if (!(await isWaiterOnBreak(connection, id))) {
            return id;
        }
        exclude.push(id);
    }

    if (
        args.sessionWaiterId != null &&
        Number.isFinite(Number(args.sessionWaiterId)) &&
        !exclude.includes(Number(args.sessionWaiterId))
    ) {
        const id = Number(args.sessionWaiterId);
        if (!(await isWaiterOnBreak(connection, id))) {
            return id;
        }
        exclude.push(id);
    }

    return pickLeastLoadedWaiterForSection(connection, args.sectionId, { excludeUserIds: exclude });
}
