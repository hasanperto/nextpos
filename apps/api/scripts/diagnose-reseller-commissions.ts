import dotenv from 'dotenv';
import { queryPublic } from '../src/lib/db.js';

dotenv.config();

async function main() {
    const [byType]: any = await queryPublic(
        `
        SELECT payment_type, status, COUNT(*)::int AS c, COALESCE(SUM(amount),0) AS total
        FROM "public".payment_history
        GROUP BY payment_type, status
        ORDER BY payment_type, status
        `,
        []
    );

    const [resellerNoIncome]: any = await queryPublic(
        `
        SELECT
            t.id,
            t.name,
            t.status,
            t.reseller_id,
            t.settings,
            COALESCE(tb.billing_cycle, 'monthly') AS billing_cycle,
            COALESCE(tb.setup_fee_total, 0) AS setup_fee_total,
            COALESCE(tb.monthly_recurring_total, 0) AS monthly_recurring_total,
            COALESCE(tb.yearly_prepay_total, 0) AS yearly_prepay_total
        FROM "public".tenants t
        LEFT JOIN "public".tenant_billing tb ON trim(tb.tenant_id::text) = trim(t.id::text)
        WHERE t.reseller_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM "public".payment_history ph
              WHERE trim(ph.tenant_id::text) = trim(t.id::text)
                AND ph.payment_type = 'reseller_income'
                AND ph.status = 'paid'
          )
        ORDER BY t.created_at DESC
        LIMIT 50
        `,
        []
    );

    const [bankPending]: any = await queryPublic(
        `
        SELECT
            t.id AS tenant_id,
            t.name,
            t.status AS tenant_status,
            ph.status AS payment_status,
            ph.amount,
            ph.description
        FROM "public".payment_history ph
        JOIN "public".tenants t ON trim(ph.tenant_id::text) = trim(t.id::text)
        WHERE ph.payment_type = 'subscription'
          AND ph.payment_method = 'bank_transfer'
          AND ph.description ILIKE 'İlk dönem — Havale bekleniyor:%'
        ORDER BY ph.created_at DESC
        LIMIT 50
        `,
        []
    );

    console.log('\n=== payment_history dagilim ===');
    console.table(byType || []);

    console.log('\n=== reseller tenant ama paid reseller_income yok (ilk 50) ===');
    console.table(resellerNoIncome || []);

    console.log('\n=== direct sale havale kayitlari (ilk 50) ===');
    console.table(bankPending || []);
}

main()
    .catch((e) => {
        console.error('Tani hatasi:', e);
        process.exit(1);
    })
    .finally(() => process.exit(0));

