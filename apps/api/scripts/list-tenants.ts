import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function list() {
    try {
        const client = await pool.connect();
        const { rows } = await client.query("SELECT id, name, schema_name, status FROM public.tenants");
        console.log(JSON.stringify(rows, null, 2));
        client.release();
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

list();
