
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        const res = await pool.query("SELECT id, schema_name FROM public.tenants");
        for (const tenant of res.rows) {
            const schema = tenant.schema_name;
            console.log(`\n### FIXING TENANT: ${tenant.id} (${schema}) ###`);
            
            try {
                // Table Sessions
                await pool.query(`ALTER TABLE "${schema}"."table_sessions" ADD COLUMN IF NOT EXISTS "client_session_id" VARCHAR(100)`);
                console.log(`- table_sessions updated`);
                
                // Orders
                await pool.query(`ALTER TABLE "${schema}"."orders" ADD COLUMN IF NOT EXISTS "customer_name" VARCHAR(100)`);
                await pool.query(`ALTER TABLE "${schema}"."orders" ADD COLUMN IF NOT EXISTS "tss_signature" TEXT`);
                await pool.query(`ALTER TABLE "${schema}"."orders" ADD COLUMN IF NOT EXISTS "tss_transaction_no" VARCHAR(100)`);
                console.log(`- orders updated`);
                
            } catch (e: any) {
                console.error(`Error for ${schema}: ${e.message}`);
            }
        }
    } catch (e: any) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
