import { queryPublic, withTenant } from '../src/lib/db.js';
import { prisma } from '../src/lib/prisma.js';

async function patch() {
    console.log('🚀 Starting Order Status Patch...');
    try {
        const tenants = await prisma.tenant.findMany({
            select: { schemaName: true }
        });

        for (const t of tenants) {
            console.log(`🛠️ Patching schema: ${t.schemaName}`);
            try {
                // ALTER TYPE cannot be run inside a transaction in some versions, 
                // but withTenant uses a simple client.
                await withTenantTransaction_Raw(t.schemaName, `
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'shipped') THEN
                            ALTER TYPE order_status ADD VALUE 'shipped';
                        END IF;
                    END $$;
                `);
                console.log(`✅ Success for ${t.schemaName}`);
            } catch (err: any) {
                console.log(`⚠️ Skip or failed for ${t.schemaName}: ${err.message}`);
            }
        }
        console.log('✨ All schemas processed.');
    } catch (e: any) {
        console.error('❌ Patch failed:', e.message);
    } finally {
        process.exit(0);
    }
}

// Simple raw helper since withTenant uses search_path
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function withTenantTransaction_Raw(schema: string, sql: string) {
    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO "${schema}", public`);
        await client.query(sql);
    } finally {
        client.release();
    }
}

patch();
