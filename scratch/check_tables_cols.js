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
    console.log('🔍 Listing columns in tenant_demo.tables...');
    const client = await pool.connect();
    try {
        const columns = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'tenant_demo' AND table_name = 'tables'
        `);
        console.table(columns.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(console.error);
