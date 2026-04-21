import dotenv from 'dotenv';
import { queryPublic } from '../src/lib/db.js';

dotenv.config();

type Row = {
    tenant_id: string;
    tenant_name: string;
    reseller_id: number;
    payment_method: string;
    commission_amount: string | number;
};

async function preview() {
    const [rows]: any = await queryPublic(
        `
        WITH settings AS (
            SELECT
                COALESCE(reseller_setup_rate, 75) AS setup_rate,
                COALESCE(reseller_monthly_rate, 50) AS monthly_rate
            FROM "public".system_settings
            ORDER BY id DESC
            LIMIT 1
        ),
        candidates AS (
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.reseller_id,
                'wallet_balance'::text AS payment_method,
                COALESCE(
                    NULLIF(t.settings->>'reseller_commission_amount', '')::numeric,
                    ROUND(
                        (
                            COALESCE(tb.setup_fee_total, 0) * ((SELECT setup_rate FROM settings) / 100.0)
                            +
                            (CASE
                                WHEN tb.billing_cycle = 'yearly' THEN COALESCE(tb.yearly_prepay_total, 0)
                                ELSE COALESCE(tb.monthly_recurring_total, 0)
                             END) * ((SELECT monthly_rate FROM settings) / 100.0)
                        )::numeric,
                        2
                    )
                ) AS commission_amount
            FROM "public".tenants t
            LEFT JOIN "public".tenant_billing tb ON trim(tb.tenant_id::text) = trim(t.id::text)
            WHERE t.reseller_id IS NOT NULL
              AND (
                  COALESCE(tb.setup_fee_total, 0) > 0
                  OR COALESCE(tb.monthly_recurring_total, 0) > 0
                  OR COALESCE(tb.yearly_prepay_total, 0) > 0
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM "public".payment_history pi
                  WHERE trim(pi.tenant_id::text) = trim(t.id::text)
                    AND pi.payment_type = 'reseller_income'
                    AND pi.status = 'paid'
              )
        )
        SELECT tenant_id, tenant_name, reseller_id, payment_method, commission_amount
        FROM candidates
        WHERE commission_amount > 0
        ORDER BY tenant_name ASC
        `,
        []
    );

    const list = (rows || []) as Row[];
    const total = list.reduce((sum, r) => sum + Number(r.commission_amount || 0), 0);

    console.log(`Aday kayit: ${list.length}`);
    console.log(`Toplam backfill komisyon: €${total.toFixed(2)}`);
    if (list.length) {
        console.table(
            list.map((r) => ({
                tenant_id: r.tenant_id,
                tenant_name: r.tenant_name,
                reseller_id: r.reseller_id,
                payment_method: r.payment_method,
                commission_amount: Number(r.commission_amount),
            }))
        );
    }
}

async function applyBackfill() {
    const [result]: any = await queryPublic(
        `
        WITH settings AS (
            SELECT
                COALESCE(reseller_setup_rate, 75) AS setup_rate,
                COALESCE(reseller_monthly_rate, 50) AS monthly_rate
            FROM "public".system_settings
            ORDER BY id DESC
            LIMIT 1
        ),
        candidates AS (
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                t.reseller_id,
                COALESCE(
                    NULLIF(t.settings->>'reseller_commission_amount', '')::numeric,
                    ROUND(
                        (
                            COALESCE(tb.setup_fee_total, 0) * ((SELECT setup_rate FROM settings) / 100.0)
                            +
                            (CASE
                                WHEN tb.billing_cycle = 'yearly' THEN COALESCE(tb.yearly_prepay_total, 0)
                                ELSE COALESCE(tb.monthly_recurring_total, 0)
                             END) * ((SELECT monthly_rate FROM settings) / 100.0)
                        )::numeric,
                        2
                    )
                ) AS commission_amount,
                CASE
                    WHEN tb.billing_cycle = 'yearly' THEN 'yearly'
                    ELSE 'monthly'
                END AS billing_cycle
            FROM "public".tenants t
            LEFT JOIN "public".tenant_billing tb ON trim(tb.tenant_id::text) = trim(t.id::text)
            WHERE t.reseller_id IS NOT NULL
              AND (
                  COALESCE(tb.setup_fee_total, 0) > 0
                  OR COALESCE(tb.monthly_recurring_total, 0) > 0
                  OR COALESCE(tb.yearly_prepay_total, 0) > 0
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM "public".payment_history pi
                  WHERE trim(pi.tenant_id::text) = trim(t.id::text)
                    AND pi.payment_type = 'reseller_income'
                    AND pi.status = 'paid'
              )
        ),
        inserted AS (
            INSERT INTO "public".payment_history
                (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at)
            SELECT
                c.tenant_id::uuid,
                c.reseller_id,
                c.commission_amount,
                'EUR',
                'reseller_income',
                'wallet_balance',
                'paid',
                'Komisyon (' || c.billing_cycle || ') — Eski satis backfill',
                NOW()
            FROM candidates c
            WHERE c.commission_amount > 0
            RETURNING id, amount
        )
        SELECT COUNT(*)::int AS inserted_count, COALESCE(SUM(amount), 0) AS inserted_total
        FROM inserted
        `,
        []
    );

    const out = result?.[0] || { inserted_count: 0, inserted_total: 0 };
    console.log(`Eklendi: ${Number(out.inserted_count || 0)} kayit`);
    console.log(`Toplam: €${Number(out.inserted_total || 0).toFixed(2)}`);
}

async function main() {
    const apply = process.argv.includes('--apply');
    if (!apply) {
        await preview();
        return;
    }
    await applyBackfill();
}

main()
    .catch((e) => {
        console.error('Backfill hata:', e);
        process.exit(1);
    })
    .finally(() => process.exit(0));

