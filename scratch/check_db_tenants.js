import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    console.log('🔍 Checking database schemas, tenants and users...');
    const client = await pool.connect();
    try {
        // 1. Get tenants
        const tenants = await client.query('SELECT id, name, schema_name FROM public.tenants');
        console.log('\n--- Tenants in public.tenants ---');
        console.table(tenants.rows);

        // 2. Check users in tenant_demo
        console.log('\n--- Users in tenant_demo ---');
        try {
            const usersDemo = await client.query('SELECT id, username, name, role, pin_code FROM "tenant_demo".users');
            console.table(usersDemo.rows);
        } catch (e) {
            console.log('Error reading tenant_demo.users:', e.message);
        }

        // 3. Check users in tenant_a1111111_1111_4111_8111_111111111111
        console.log('\n--- Users in tenant_a1111111_1111_4111_8111_111111111111 ---');
        try {
            const usersUuid = await client.query('SELECT id, username, name, role, pin_code FROM "tenant_a1111111_1111_4111_8111_111111111111".users');
            console.table(usersUuid.rows);
        } catch (e) {
            console.log('Error reading tenant_a1111111_1111_4111_8111_111111111111.users:', e.message);
        }

    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(console.error);
