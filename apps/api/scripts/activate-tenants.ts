import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function activate() {
    try {
        const client = await pool.connect();
        const r = await client.query("UPDATE public.tenants SET status = 'active'");
        console.log(`✅ All tenants set to ACTIVE. Affected rows: ${r.rowCount}`);
        client.release();
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

activate();
