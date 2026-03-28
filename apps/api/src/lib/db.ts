import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

dotenv.config();

// ═══════════════════════════════════════
// 1. CONNECTION POOL
// ═══════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL, // e.g. mysql://user:pass@localhost:3306/public
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    multipleStatements: true
});

// ═══════════════════════════════════════
// 2. TENANT CACHE
// ═══════════════════════════════════════

interface TenantCacheEntry {
    schemaName: string;
    status: string;
    licenseExpiresAt: Date | null;
    cachedAt: number;
}

const tenantCache = new Map<string, TenantCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveTenantSchema(tenantId: string): Promise<TenantCacheEntry> {
    const cached = tenantCache.get(tenantId);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return cached;
    }

    const [rows]: any = await pool.query(
        'SELECT schema_name as schemaName, status, license_expires_at as licenseExpiresAt FROM `public`.tenants WHERE id = ?',
        [tenantId]
    );

    if (rows.length === 0) {
        throw new TenantError(`Tenant bulunamadı: ${tenantId}`, 'TENANT_NOT_FOUND');
    }

    const row = rows[0];

    if (row.status !== 'active') {
        throw new TenantError(`Tenant aktif değil: ${tenantId}`, 'TENANT_INACTIVE');
    }

    if (row.licenseExpiresAt && new Date(row.licenseExpiresAt) < new Date()) {
        throw new TenantError(`Tenant lisansı sona ermiş: ${tenantId}`, 'LICENSE_EXPIRED');
    }

    const entry: TenantCacheEntry = {
        schemaName: row.schemaName,
        status: row.status,
        licenseExpiresAt: row.licenseExpiresAt ? new Date(row.licenseExpiresAt) : null,
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
// 3. TENANT-AWARE WRAPPER (MySQL Version)
// ═══════════════════════════════════════

export async function withTenant<T>(
    tenantId: string,
    callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
    const tenant = await resolveTenantSchema(tenantId);
    const connection = await pool.getConnection();

    try {
        // MySQL'de "SET search_path" yok, "USE database" var
        await connection.query(`USE \`${tenant.schemaName}\``);

        const result = await callback(connection);
        return result;
    } finally {
        // Geri dönerken public'e dönmeyi dene ama pool connection release edildiğinde resetlenmesi daha güvenli
        try {
            await connection.query('USE `public`');
        } catch { }
        connection.release();
    }
}

export async function withTenantTransaction<T>(
    tenantId: string,
    callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
    const tenant = await resolveTenantSchema(tenantId);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await connection.query(`USE \`${tenant.schemaName}\``);

        const result = await callback(connection);

        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        try {
            await connection.query('USE `public`');
        } catch { }
        connection.release();
    }
}

// ═══════════════════════════════════════
// 4. HELPERS
// ═══════════════════════════════════════

export async function queryPublic(text: string, params?: any[]) {
    const queryStr = text.replace('public.', '`public`.');
    const [rows, fields]: any = await pool.query(queryStr, params);
    console.log(`🔍 [Public Query] ${queryStr} | Rows: ${rows.length}`);
    return [rows, fields];
}

export class TenantError extends Error {
    constructor(public message: string, public code: string) {
        super(message);
        this.name = 'TenantError';
    }
}

export async function createTenant(data: any) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const tenantId = uuidv4();
        await connection.query(`
            INSERT INTO \`public\`.tenants (
                id, name, schema_name, contact_email, contact_phone, 
                subscription_plan, license_expires_at, authorized_person, 
                tax_office, tax_number, special_license_key, address, reseller_id, master_password
            )
            VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MONTH), ?, ?, ?, ?, ?, ?, ?)
        `, [
            tenantId, data.name, data.schema_name, data.contact_email, data.contact_phone, 
            data.subscription_plan || 'basic', data.license_months || 12,
            data.authorized_person || null, data.tax_office || null, 
            data.tax_number || null, data.special_license_key || null, data.address || null,
            data.reseller_id || null, data.master_password || null
        ]);

        // 2. MySQL'de DB'yi oluştur
        await connection.query('CALL `public`.create_new_tenant_db(?)', [tenantId]);

        // 3. Şemayı (Tabloları) Oluştur
        const schemaName = data.schema_name;
        await connection.query(`USE \`${schemaName}\``);

        const templatePath = path.join(process.cwd(), 'src/lib/tenant_template.sql');
        const schemaSql = fs.readFileSync(templatePath, 'utf8');
        await connection.query(schemaSql);

        // 4. Varsayılan Şube ve Kullanıcıları Ekle
        const [branchResult]: any = await connection.query(
            "INSERT INTO branches (name, address, phone) VALUES ('Ana Şube', 'Adres Bilgisi Bekleniyor', '000-000-0000')"
        );
        const branchId = branchResult.insertId;

        const defaultUsers = [
            { username: 'admin', password: data.master_password || 'admin123', pin: '123456', name: 'Yönetici', role: 'admin' },
            { username: 'cashier', password: 'kasa123', pin: '111111', name: 'Kasiyer', role: 'cashier' },
            { username: 'waiter', password: 'garson123', pin: '222222', name: 'Garson', role: 'waiter' },
            { username: 'kitchen', password: 'mutfak123', pin: '333333', name: 'Mutfak Şefi', role: 'kitchen' }
        ];

        for (const u of defaultUsers) {
            const hash = await bcrypt.hash(u.password, 10);
            await connection.query(
                "INSERT INTO users (username, password_hash, name, role, pin_code, branch_id) VALUES (?, ?, ?, ?, ?, ?)",
                [u.username, hash, u.name, u.role, u.pin, branchId]
            );
        }

        // 5. Public'e Geri Dön
        await connection.query('USE `public`');

        await connection.commit();
        return { id: tenantId, ...data };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function listTenants(resellerId?: number | string) {
    let query = 'SELECT * FROM `public`.tenants';
    const params = [];
    if (resellerId) {
        query += ' WHERE reseller_id = ?';
        params.push(resellerId);
    }
    const [rows]: any = await pool.query(query + ' ORDER BY created_at DESC', params);
    return rows;
}

export async function testConnection() {
    try {
        const [rows]: any = await pool.query('SELECT NOW() as now');
        console.log('✅ MySQL bağlantısı başarılı:', rows[0].now);
        return true;
    } catch (error: any) {
        console.error('❌ MySQL bağlantı hatası:', error.message);
        return false;
    }
}

export async function closePool() {
    await pool.end();
}

export default pool;
