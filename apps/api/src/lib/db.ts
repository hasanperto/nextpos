/**
 * NextPOS — PostgreSQL + Prisma (Faz 1)
 * Ham mysql2 kaldırıldı; merkezi okumalar Prisma, ham sorgular pg + ?→$n dönüşümü.
 */
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { prisma } from './prisma.js';

dotenv.config();

const { Pool, types } = pg;

/** BIGINT → string (JS güvenli) */
types.setTypeParser(20, (val: string) => val);

function quoteIdent(s: string): string {
    return '"' + String(s).replace(/"/g, '""') + '"';
}

/** DATABASE_URL: postgresql://user:pass@host:5432/dbname */
export function getPublicDatabaseName(): string {
    return 'public';
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
});

// ═══════════════════════════════════════
// SQL: MySQL tarzı ? → PostgreSQL $1..$n
// ═══════════════════════════════════════

export function mysqlParamsToPg(sql: string, params: any[] = []): { text: string; values: any[] } {
    let i = 0;
    let text = sql
        .replace(/\bpublic\./g, '"public".')
        .replace(/`public`/g, '"public"')
        .replace(/`([^`]+)`\.`([^`]+)`/g, '"$1"."$2"')
        .replace(/`([^`]+)`/g, '"$1"');
    text = text.replace(/\?/g, () => `$${++i}`);

    if (/^\s*INSERT\s+INTO\s+([^\s(]+)/i.test(text) && !/\bRETURNING\b/i.test(text)) {
        const tableName = RegExp.$1.replace(/["`]/g, '').toLowerCase().split('.').pop();
        const noIdTables = ['product_modifiers', 'order_items_modifiers', 'table_sessions_guests']; // join tables with composite PK
        const skip = noIdTables.includes(tableName || '') || /\bON\s+CONFLICT\b/i.test(text);
        
        if (!skip) {
            text = text.trim().replace(/;?\s*$/, '') + ' RETURNING id';
        }
    }
    return { text, values: params };
}

/** mysql2 ResultSetHeader benzeri: INSERT/UPDATE/DELETE için ilk eleman nesne */
function normalizeQueryResult(res: pg.QueryResult): [any, any] {
    if (res.command === 'INSERT') {
        const insertId =
            res.rows?.[0]?.id ??
            res.rows?.[0]?.ID ??
            (res.rows?.[0] && (Object.values(res.rows[0])[0] as any)) ??
            null;
        return [{ insertId, affectedRows: res.rowCount ?? 0 }, res.fields];
    }
    if (res.command === 'UPDATE' || res.command === 'DELETE') {
        return [{ affectedRows: res.rowCount ?? 0 }, res.fields];
    }
    return [res.rows, res.fields];
}

export async function queryPublic(text: string, params: any[] = []) {
    const { text: q, values } = mysqlParamsToPg(text, params);
    const res = await pool.query(q, values);
    const [rows] = normalizeQueryResult(res);
    if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 [Public Query] ${q.substring(0, 120)}… | rows: ${Array.isArray(rows) ? rows.length : 1}`);
    }
    return [rows, res.fields];
}

// ═══════════════════════════════════════
// TENANT CACHE (Prisma)
// ═══════════════════════════════════════

interface TenantCacheEntry {
    schemaName: string;
    status: string;
    licenseExpiresAt: Date | null;
    cachedAt: number;
}

const tenantCache = new Map<string, TenantCacheEntry>();
const CACHE_TTL_MS = 5 * 1000; // 5 saniye (Geliştirme için daha hassas)

async function resolveTenantSchema(tenantId: string): Promise<TenantCacheEntry> {
    const cached = tenantCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached;
    }

    const row = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!row) {
        console.warn(`❌ [db] Tenant not found: ${tenantId}`);
        throw new TenantError(`Tenant bulunamadı: ${tenantId}`, 'TENANT_NOT_FOUND');
    }

    const isDemo = tenantId === 'a1111111-1111-4111-8111-111111111111';

    if (row.status === 'suspended' && !isDemo) {
        console.warn(`⚠️ [db] Tenant suspended: ${tenantId}`);
        throw new TenantError(`Tenant ödeme nedeniyle askıya alındı: ${tenantId}`, 'TENANT_SUSPENDED');
    }
    if (row.status !== 'active' && !isDemo) {
        console.warn(`⚠️ [db] Tenant inactive: ${tenantId} (Status: ${row.status})`);
        throw new TenantError(`Tenant aktif değil: ${tenantId}`, 'TENANT_INACTIVE');
    }

    if (row.licenseExpiresAt && row.licenseExpiresAt < new Date() && !isDemo) {
        console.warn(`⚠️ [db] Tenant license expired: ${tenantId}`);
        throw new TenantError(`Tenant lisansı sona ermiş: ${tenantId}`, 'LICENSE_EXPIRED');
    }

    const entry: TenantCacheEntry = {
        schemaName: row.schemaName,
        status: row.status,
        licenseExpiresAt: row.licenseExpiresAt,
        cachedAt: Date.now(),
    };
    tenantCache.set(tenantId, entry);
    return entry;
}

export function invalidateTenantCache(tenantId?: string) {
    if (tenantId) tenantCache.delete(tenantId);
    else tenantCache.clear();
}

// ═══════════════════════════════════════
// TENANT BAĞLANTI (PostgreSQL search_path)
// ═══════════════════════════════════════

function wrapTenantClient(client: pg.PoolClient) {
    return {
        async query(text: string, params?: any[]) {
            const { text: q, values } = mysqlParamsToPg(text, params || []);
            const res = await client.query(q, values);
            return normalizeQueryResult(res) as any;
        },
        release: () => client.release(),
    };
}

export async function withTenant<T>(tenantId: string, callback: (connection: ReturnType<typeof wrapTenantClient>) => Promise<T>): Promise<T> {
    const tenant = await resolveTenantSchema(tenantId);
    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO ${quoteIdent(tenant.schemaName)}, public`);
        return await callback(wrapTenantClient(client));
    } finally {
        try {
            await client.query('SET search_path TO public');
        } catch {
            /* ignore */
        }
        client.release();
    }
}

export async function withTenantTransaction<T>(
    tenantId: string,
    callback: (connection: ReturnType<typeof wrapTenantClient>) => Promise<T>
): Promise<T> {
    const tenant = await resolveTenantSchema(tenantId);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SET search_path TO ${quoteIdent(tenant.schemaName)}, public`);
        const wrapped = wrapTenantClient(client);
        const result = await callback(wrapped);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        try {
            await client.query('SET search_path TO public');
        } catch {
            /* ignore */
        }
        client.release();
    }
}

export class TenantError extends Error {
    constructor(
        public message: string,
        public code: string
    ) {
        super(message);
        this.name = 'TenantError';
    }
}

/** API uyumu: snake_case satırlar */
export async function listTenants(resellerId?: number | string) {
    const rows = await prisma.tenant.findMany({
        where: resellerId ? { resellerId: Number(resellerId) } : undefined,
        orderBy: { createdAt: 'desc' },
    });
    return rows.map((t: typeof rows[number]) => ({
        id: t.id,
        name: t.name,
        schema_name: t.schemaName,
        status: t.status,
        subscription_plan: t.subscriptionPlan,
        license_expires_at: t.licenseExpiresAt,
        max_users: t.maxUsers,
        max_branches: t.maxBranches,
        contact_email: t.contactEmail,
        contact_phone: t.contactPhone,
        authorized_person: t.authorizedPerson,
        tax_office: t.taxOffice,
        tax_number: t.taxNumber,
        special_license_key: t.specialLicenseKey,
        address: t.address,
        reseller_id: t.resellerId,
        master_password: t.masterPassword,
        settings: t.settings,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
    }));
}

export async function updateTenantMasterPassword(tenantId: string, plainPassword: string) {
    const row = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { schemaName: true } });
    if (!row) {
        throw new TenantError(`Tenant bulunamadı: ${tenantId}`, 'TENANT_NOT_FOUND');
    }
    await prisma.tenant.update({
        where: { id: tenantId },
        data: { masterPassword: plainPassword },
    });
    const hash = await bcrypt.hash(plainPassword, 10);
    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO ${quoteIdent(row.schemaName)}, public`);
        const { text, values } = mysqlParamsToPg(`UPDATE users SET password_hash = ? WHERE username = 'admin'`, [hash]);
        await client.query(text, values);
    } finally {
        try {
            await client.query('SET search_path TO public');
        } catch {
            /* ignore */
        }
        client.release();
    }
    invalidateTenantCache(tenantId);
}

export async function createTenant(data: any) {
    const tenantId = uuidv4();
    const months = data.license_months || 12;
    const licenseExpiresAt = new Date();
    licenseExpiresAt.setMonth(licenseExpiresAt.getMonth() + months);

    const maxU = data.max_users != null ? Number(data.max_users) : 10;
    const maxB = data.max_branches != null ? Number(data.max_branches) : 1;

    const initialStatus = typeof data.status === 'string' && data.status.length > 0 ? data.status : 'active';

    await prisma.tenant.create({
        data: {
            id: tenantId,
            name: data.name,
            schemaName: data.schema_name,
            contactEmail: data.contact_email || null,
            contactPhone: data.contact_phone || null,
            subscriptionPlan: data.subscription_plan || 'basic',
            licenseExpiresAt,
            maxUsers: Number.isFinite(maxU) && maxU > 0 ? maxU : 10,
            maxBranches: Number.isFinite(maxB) && maxB > 0 ? maxB : 1,
            authorizedPerson: data.authorized_person || null,
            taxOffice: data.tax_office || null,
            taxNumber: data.tax_number || null,
            specialLicenseKey: data.special_license_key || null,
            address: data.address || null,
            resellerId: data.reseller_id != null ? Number(data.reseller_id) : null,
            masterPassword: data.master_password || null,
            status: initialStatus,
            settings: data.settings != null ? (data.settings as object) : undefined,
        },
    });

    await prisma.$executeRawUnsafe(`SELECT public.create_new_tenant_schema($1::uuid)`, tenantId);

    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO ${quoteIdent(data.schema_name)}, public`);

        const masterPw = data.master_password || 'admin123';
        const adminUser = String(data.admin_username || 'admin').toLowerCase().trim();
        const defaultUsers = [
            { username: adminUser, password: masterPw, pin: '123456', name: 'Yönetici', role: 'admin' },
            { username: 'cashier', password: 'kasa123', pin: '111111', name: 'Kasiyer', role: 'cashier' },
            { username: 'waiter', password: 'garson123', pin: '222222', name: 'Garson', role: 'waiter' },
            { username: 'kitchen', password: 'mutfak123', pin: '333333', name: 'Mutfak Şefi', role: 'kitchen' },
        ];

        const br = await client.query(
            `INSERT INTO branches (name, address, phone) VALUES ($1, $2, $3) RETURNING id`,
            ['Ana Şube', 'Adres Bilgisi Bekleniyor', '000-000-0000']
        );
        const branchId = br.rows[0].id;

        for (const u of defaultUsers) {
            const hash = await bcrypt.hash(u.password, 10);
            await client.query(
                `INSERT INTO users (username, password_hash, name, role, pin_code, branch_id) VALUES ($1, $2, $3, $4::user_role, $5, $6)`,
                [u.username, hash, u.name, u.role, u.pin, branchId]
            );
        }
    } finally {
        await client.query('SET search_path TO public');
        client.release();
    }

    return { id: tenantId, ...data };
}

/** Tenant şemasında bir kullanıcının şifresini günceller */
export async function updateTenantUserPassword(schemaName: string, username: string, newPassword: string): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
        const hash = await bcrypt.hash(newPassword, 10);
        await client.query(
            `UPDATE users SET password_hash = $1 WHERE username = $2`,
            [hash, username]
        );
    } finally {
        await client.query('SET search_path TO public');
        client.release();
    }
}

export async function updateTenantUserPin(schemaName: string, username: string, newPin: string): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
        await client.query(
            `UPDATE users SET pin_code = $1 WHERE username = $2`,
            [newPin, username]
        );
    } finally {
        await client.query('SET search_path TO public');
        client.release();
    }
}

export async function testConnection() {
    try {
        const r = await pool.query('SELECT NOW() as now');
        console.log('✅ PostgreSQL bağlantısı başarılı:', r.rows[0]?.now);
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch (error: any) {
        console.error('❌ PostgreSQL bağlantı hatası:', error.message);
        return false;
    }
}

export async function closePool() {
    await pool.end();
    await prisma.$disconnect();
}

export default pool;
