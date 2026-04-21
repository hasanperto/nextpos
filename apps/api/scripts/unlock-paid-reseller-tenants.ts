import dotenv from 'dotenv';
import { queryPublic } from '../src/lib/db.js';

dotenv.config();

async function preview() {
    const [rows]: any = await queryPublic(
        `
        SELECT t.id, t.name, t.status
        FROM "public".tenants t
        WHERE t.reseller_id IS NOT NULL
          AND t.status = 'suspended'
          AND EXISTS (
              SELECT 1
              FROM "public".payment_history ph
              WHERE trim(ph.tenant_id::text) = trim(t.id::text)
                AND ph.payment_type = 'subscription'
                AND ph.status = 'paid'
          )
          AND NOT EXISTS (
              SELECT 1
              FROM "public".payment_history ph
              WHERE trim(ph.tenant_id::text) = trim(t.id::text)
                AND ph.due_date IS NOT NULL
                AND ph.due_date <= CURRENT_DATE
                AND ph.status IN ('pending','overdue')
          )
        ORDER BY t.name ASC
        `,
        []
    );
    console.log(`Acilabilir suspended tenant: ${(rows || []).length}`);
    if (rows?.length) console.table(rows);
}

async function applyUnlock() {
    const [res]: any = await queryPublic(
        `
        WITH candidates AS (
            SELECT t.id
            FROM "public".tenants t
            WHERE t.reseller_id IS NOT NULL
              AND t.status = 'suspended'
              AND EXISTS (
                  SELECT 1
                  FROM "public".payment_history ph
                  WHERE trim(ph.tenant_id::text) = trim(t.id::text)
                    AND ph.payment_type = 'subscription'
                    AND ph.status = 'paid'
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM "public".payment_history ph
                  WHERE trim(ph.tenant_id::text) = trim(t.id::text)
                    AND ph.due_date IS NOT NULL
                    AND ph.due_date <= CURRENT_DATE
                    AND ph.status IN ('pending','overdue')
              )
        ),
        updated AS (
            UPDATE "public".tenants t
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE t.id IN (SELECT id FROM candidates)
            RETURNING t.id
        )
        SELECT COUNT(*)::int AS activated FROM updated
        `,
        []
    );
    const activated = Number(res?.[0]?.activated || 0);
    console.log(`Active yapilan tenant: ${activated}`);
}

async function main() {
    const apply = process.argv.includes('--apply');
    if (!apply) return preview();
    return applyUnlock();
}

main()
    .catch((e) => {
        console.error('unlock-paid-reseller-tenants hata:', e);
        process.exit(1);
    })
    .finally(() => process.exit(0));

