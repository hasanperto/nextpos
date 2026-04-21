/**
 * Bayi cüzdan kart ödemesi sonrası tek noktadan bakiye + payment_history + audit.
 */
import pool, { queryPublic } from '../lib/db.js';

export async function creditResellerTopupAfterCardPayment(params: {
    topupId: number;
    amountPaid: number;
    externalRef: string | null;
    paymentHistoryMethod: string;
    auditAction: string;
    createdBy: string;
    description: string;
}): Promise<{ ok: boolean; alreadyDone?: boolean }> {
    const { topupId, amountPaid, externalRef, paymentHistoryMethod, auditAction, createdBy, description } = params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const sel = await client.query(
            `
            SELECT id, reseller_id, amount, status, payment_method, stripe_checkout_session_id
            FROM "public"."reseller_wallet_topup_requests"
            WHERE id = $1
            FOR UPDATE
            `,
            [topupId]
        );
        const row = sel.rows[0] as
            | {
                  id: number;
                  reseller_id: number;
                  amount: string;
                  status: string;
                  payment_method: string;
                  stripe_checkout_session_id: string | null;
              }
            | undefined;
        if (!row) {
            await client.query('ROLLBACK');
            return { ok: false };
        }
        if (row.status === 'approved') {
            await client.query('COMMIT');
            return { ok: true, alreadyDone: true };
        }
        if (row.status !== 'awaiting_card' || String(row.payment_method).toLowerCase() !== 'admin_card') {
            await client.query('ROLLBACK');
            return { ok: false };
        }
        const expected = Number(row.amount);
        if (!Number.isFinite(expected) || expected <= 0 || Math.abs(expected - amountPaid) > 0.02) {
            await client.query('ROLLBACK');
            return { ok: false };
        }
        if (externalRef && row.stripe_checkout_session_id && row.stripe_checkout_session_id !== externalRef) {
            await client.query('ROLLBACK');
            return { ok: false };
        }

        await client.query(
            `
            UPDATE "public"."reseller_wallet_topup_requests"
            SET status = 'approved',
                stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $2)
            WHERE id = $1
            `,
            [topupId, externalRef]
        );
        await client.query(
            `UPDATE "public"."saas_admins" SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2`,
            [amountPaid, row.reseller_id]
        );
        const phIns = await client.query(
            `
            INSERT INTO "public"."payment_history"
                (tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, paid_at, created_by)
            VALUES (NULL, $1, $2, 'EUR', 'reseller_wallet_topup', $3, 'paid', $4, NOW(), $5)
            RETURNING id
            `,
            [row.reseller_id, amountPaid, paymentHistoryMethod, description, createdBy]
        );
        const paymentHistoryId = phIns.rows[0]?.id as number | undefined;
        await client.query('COMMIT');

        try {
            await queryPublic(
                `
                INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    createdBy,
                    auditAction,
                    'reseller_wallet_topup_request',
                    String(topupId),
                    null,
                    JSON.stringify({
                        reseller_id: row.reseller_id,
                        amount: amountPaid,
                        external_ref: externalRef,
                        payment_history_id: paymentHistoryId ?? null,
                    }),
                    '',
                    '',
                ]
            );
        } catch {
            /* ignore */
        }
        return { ok: true };
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw e;
    } finally {
        client.release();
    }
}
