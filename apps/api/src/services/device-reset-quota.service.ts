import pool, { queryPublic } from '../lib/db.js';

type QuotaSummary = {
    tenantId: string;
    quota: number;
    override: number | null;
    used: number;
    remaining: number;
    month: string;
};

let _quotaSchemaReady = false;

function monthKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function fallbackQuotaByPlan(planCode: string | null | undefined): number {
    const p = String(planCode || '').toLowerCase();
    if (['basic', 'starter', 'baslangic'].includes(p)) return 3;
    if (['pro', 'professional'].includes(p)) return 6;
    if (['enterprise', 'kurumsal'].includes(p)) return 9;
    return 3;
}

export async function ensureDeviceResetQuotaSchema(): Promise<void> {
    if (_quotaSchemaReady) return;
    await queryPublic(
        'ALTER TABLE `public`.subscription_plans ADD COLUMN IF NOT EXISTS device_reset_quota_monthly INTEGER'
    );
    await queryPublic(
        'ALTER TABLE `public`.tenants ADD COLUMN IF NOT EXISTS device_reset_quota_override INTEGER'
    );
    await queryPublic(
        `CREATE TABLE IF NOT EXISTS "public"."tenant_device_reset_logs" (
            id BIGSERIAL PRIMARY KEY,
            tenant_id UUID NOT NULL,
            actor_role VARCHAR(30) NOT NULL,
            actor_user_id VARCHAR(80),
            source VARCHAR(40),
            reset_month VARCHAR(7) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
    );
    await queryPublic(
        'CREATE INDEX IF NOT EXISTS idx_tenant_device_reset_logs_tenant_month ON `public`.tenant_device_reset_logs(tenant_id, reset_month)'
    );

    await queryPublic(
        `UPDATE \`public\`.subscription_plans
         SET device_reset_quota_monthly = 3
         WHERE (device_reset_quota_monthly IS NULL OR device_reset_quota_monthly <= 0)
           AND LOWER(COALESCE(code, '')) IN ('basic','starter','baslangic')`
    );
    await queryPublic(
        `UPDATE \`public\`.subscription_plans
         SET device_reset_quota_monthly = 6
         WHERE (device_reset_quota_monthly IS NULL OR device_reset_quota_monthly <= 0)
           AND LOWER(COALESCE(code, '')) IN ('pro','professional')`
    );
    await queryPublic(
        `UPDATE \`public\`.subscription_plans
         SET device_reset_quota_monthly = 9
         WHERE (device_reset_quota_monthly IS NULL OR device_reset_quota_monthly <= 0)
           AND LOWER(COALESCE(code, '')) IN ('enterprise','kurumsal')`
    );

    _quotaSchemaReady = true;
}

async function getSummaryWithClient(client: any, tenantId: string, month: string): Promise<QuotaSummary> {
    const q = await client.query(
        `
        SELECT
          t.id::text AS tenant_id,
          t.subscription_plan,
          t.device_reset_quota_override,
          sp.device_reset_quota_monthly,
          COALESCE((
              SELECT COUNT(*)::int
              FROM "public"."tenant_device_reset_logs" l
              WHERE l.tenant_id = t.id
                AND l.reset_month = $2
          ), 0) AS used
        FROM "public"."tenants" t
        LEFT JOIN "public"."subscription_plans" sp
          ON LOWER(COALESCE(sp.code, '')) = LOWER(COALESCE(t.subscription_plan, ''))
        WHERE t.id = $1
        LIMIT 1
        `,
        [tenantId, month]
    );
    const row = q.rows?.[0];
    if (!row) throw new Error('TENANT_NOT_FOUND');
    const planFallback = fallbackQuotaByPlan(row.subscription_plan);
    const override = row.device_reset_quota_override == null ? null : Number(row.device_reset_quota_override);
    const quota = Number(override ?? row.device_reset_quota_monthly ?? planFallback);
    const used = Number(row.used || 0);
    const remaining = Math.max(0, quota - used);
    return { tenantId, quota, override, used, remaining, month };
}

export async function getTenantDeviceResetSummary(tenantId: string): Promise<QuotaSummary> {
    await ensureDeviceResetQuotaSchema();
    const client = await pool.connect();
    try {
        const month = monthKey();
        return await getSummaryWithClient(client, tenantId, month);
    } finally {
        client.release();
    }
}

export async function getTenantDeviceResetSummaries(tenantIds: string[]): Promise<Record<string, QuotaSummary>> {
    await ensureDeviceResetQuotaSchema();
    const ids = Array.from(new Set((tenantIds || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (ids.length === 0) return {};
    const month = monthKey();
    const [rows]: any = await queryPublic(
        `
        SELECT
          t.id::text AS tenant_id,
          t.subscription_plan,
          t.device_reset_quota_override,
          sp.device_reset_quota_monthly,
          COALESCE(u.used_count, 0) AS used
        FROM \`public\`.tenants t
        LEFT JOIN \`public\`.subscription_plans sp
          ON LOWER(COALESCE(sp.code, '')) = LOWER(COALESCE(t.subscription_plan, ''))
        LEFT JOIN (
          SELECT tenant_id::text AS tenant_id, COUNT(*)::int AS used_count
          FROM \`public\`.tenant_device_reset_logs
          WHERE reset_month = ?
          GROUP BY tenant_id::text
        ) u ON trim(u.tenant_id) = trim(t.id::text)
        WHERE t.id::text = ANY(?::text[])
        `,
        [month, ids]
    );
    const out: Record<string, QuotaSummary> = {};
    for (const r of rows || []) {
        const tenantId = String(r.tenant_id);
        const override = r.device_reset_quota_override == null ? null : Number(r.device_reset_quota_override);
        const quota = Number(override ?? r.device_reset_quota_monthly ?? fallbackQuotaByPlan(r.subscription_plan));
        const used = Number(r.used || 0);
        out[tenantId] = { tenantId, quota, override, used, remaining: Math.max(0, quota - used), month };
    }
    return out;
}

export async function consumeTenantDeviceResetQuota(params: {
    tenantId: string;
    actorRole: string;
    actorUserId?: string | number | null;
    source?: string | null;
}): Promise<QuotaSummary & { logId: number }> {
    await ensureDeviceResetQuotaSchema();
    const month = monthKey();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const lock = await client.query('SELECT id FROM "public"."tenants" WHERE id = $1 FOR UPDATE', [params.tenantId]);
        if (!lock.rows?.length) throw new Error('TENANT_NOT_FOUND');

        const summary = await getSummaryWithClient(client, params.tenantId, month);
        if (summary.remaining <= 0) {
            await client.query('ROLLBACK');
            throw new Error('DEVICE_RESET_QUOTA_EXCEEDED');
        }

        const ins = await client.query(
            `INSERT INTO "public"."tenant_device_reset_logs"
                (tenant_id, actor_role, actor_user_id, source, reset_month)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [params.tenantId, params.actorRole, params.actorUserId != null ? String(params.actorUserId) : null, params.source || null, month]
        );
        const logId = Number(ins.rows?.[0]?.id);
        await client.query('COMMIT');
        return {
            ...summary,
            used: summary.used + 1,
            remaining: Math.max(0, summary.remaining - 1),
            logId,
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function releaseConsumedTenantDeviceResetQuota(logId: number): Promise<void> {
    if (!Number.isFinite(logId)) return;
    await ensureDeviceResetQuotaSchema();
    await queryPublic('DELETE FROM `public`.tenant_device_reset_logs WHERE id = ?', [logId]);
}
