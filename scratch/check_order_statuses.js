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
    console.log('🔍 Querying enum values for order_status...');
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT enumlabel 
            FROM pg_enum 
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
            WHERE typname = 'order_status'
        `);
        console.table(res.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(console.error);
