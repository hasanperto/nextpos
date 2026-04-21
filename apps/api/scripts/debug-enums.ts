import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
    try {
        const client = await pool.connect();
        const { rows: schemas } = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'");
        
        for (const s of schemas) {
            const schema = s.schema_name;
            const res = await client.query(`
                SELECT t.typname, e.enumlabel 
                FROM pg_enum e 
                JOIN pg_type t ON e.enumtypid = t.oid 
                JOIN pg_namespace n ON t.typnamespace = n.oid 
                WHERE n.nspname = $1 AND t.typname IN ('order_status', 'delivery_status')
            `, [schema]);
            
            const grouped: any = {};
            res.rows.forEach(r => {
                if (!grouped[r.typname]) grouped[r.typname] = [];
                grouped[r.typname].push(r.enumlabel);
            });
            
            console.log(`\n--- Schema: ${schema} ---`);
            console.log(`Order Status: ${grouped.order_status?.join(', ')}`);
            console.log(`Delivery Status: ${grouped.delivery_status?.join(', ')}`);
        }
        client.release();
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
