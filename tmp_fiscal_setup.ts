import pkg from 'pg';
import dotenv from 'dotenv';

import path from 'path';
dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nextpos_dev',
});

async function run() {
    try {
        console.log('--- FISCAL SCHEMA INITIALIZER ---');
        const { rows: schemas } = await pool.query(`
            SELECT id, "schema_name" FROM "public"."tenants"
        `);

        for (const tenant of schemas) {
            const schema = tenant.schema_name;
            console.log(`Processing schema: ${schema} (ID: ${tenant.id})`);
            
            try {
                // Add columns if they don't exist
                await pool.query(`ALTER TABLE "${schema}"."orders" ADD COLUMN IF NOT EXISTS tss_signature TEXT`);
                await pool.query(`ALTER TABLE "${schema}"."orders" ADD COLUMN IF NOT EXISTS tss_transaction_no VARCHAR(50)`);
                await pool.query(`ALTER TABLE "${schema}"."payments" ADD COLUMN IF NOT EXISTS tss_signature TEXT`);
                
                // Z Reports might not exist yet in all schemas, but we try
                const { rows: zResult } = await pool.query(`
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = $1 AND table_name = 'z_reports'
                `, [schema]);
                
                if (zResult.length > 0) {
                    await pool.query(`ALTER TABLE "${schema}"."z_reports" ADD COLUMN IF NOT EXISTS tss_signature TEXT`);
                    console.log(`  - Added tss_signature to "${schema}"."z_reports"`);
                }
                
                console.log(`  - Successfully updated schema: ${schema}`);
            } catch (err: any) {
                console.warn(`  - [SKIP] Failed for schema ${schema}: ${err.message}`);
            }
        }
        
        console.log('--- FISCAL SCHEMA INITIALIZER COMPLETED ---');
    } catch (err: any) {
        console.error('CRITICAL ERROR:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

run();
