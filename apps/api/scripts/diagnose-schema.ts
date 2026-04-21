
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        const res = await pool.query("SELECT schema_name FROM public.tenants WHERE id = 'ea941b08-16d8-4924-aae4-c362752b0895'");
        const schema = res.rows[0].schema_name;
        console.log(`\n### TENANT: tenant_test1 ###`);
        const tables = ['order_items', 'deliveries'];
        for (const table of tables) {
            const cols = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = $1 AND table_name = $2
            `, [schema, table]);
            console.log(`- TABLE: ${table}`);
            for(const col of cols.rows) {
                console.log(`  - ${col.column_name}`);
            }
        }
    } catch (e: any) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
