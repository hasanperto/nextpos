import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('apps/api/.env') });

async function run() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL
    });

    const client = await pool.connect();
    try {
        const resTables = await client.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        `);
        console.log('Tables in DB:', resTables.rows);
    } catch (err: any) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
