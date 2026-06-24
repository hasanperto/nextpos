import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from apps/api/.env
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos';

async function main() {
    console.log('Connecting to database:', connectionString);
    const pool = new pg.Pool({ connectionString });
    
    try {
        // 1. Get schema name for the demo tenant
        const demoTenantId = 'a1111111-1111-4111-8111-111111111111';
        const { rows } = await pool.query('SELECT schema_name FROM public.tenants WHERE id = $1', [demoTenantId]);
        
        if (rows.length === 0) {
            console.error('Demo tenant not found in public.tenants table!');
            return;
        }
        
        const schemaName = rows[0].schema_name;
        console.log(`Resolved schema for demo tenant: "${schemaName}"`);
        
        // Helper to run query inside the schema
        const runQuery = async (queryText) => {
            const escapedSchema = `"${schemaName}"`;
            const sql = queryText.replace(/__SCHEMA__/g, escapedSchema);
            return pool.query(sql);
        };
        
        console.log('Clearing order related tables...');
        
        // Truncate or delete order-related tables (order_items, orders, payments, kitchen_tickets, deliveries, service_calls, daily_summaries, table_sessions)
        // Order of deletion matters due to foreign keys or dependencies
        await runQuery('DELETE FROM __SCHEMA__.order_items');
        await runQuery('DELETE FROM __SCHEMA__.kitchen_tickets');
        await runQuery('DELETE FROM __SCHEMA__.deliveries');
        await runQuery('DELETE FROM __SCHEMA__.payments');
        await runQuery('DELETE FROM __SCHEMA__.orders');
        await runQuery('DELETE FROM __SCHEMA__.service_calls');
        await runQuery('DELETE FROM __SCHEMA__.daily_summaries');
        await runQuery('DELETE FROM __SCHEMA__.table_sessions');
        
        console.log('Resetting table statuses to "available"...');
        await runQuery('UPDATE __SCHEMA__.tables SET status = \'available\', current_session_id = NULL');
        
        console.log('✅ Success: Demo tenant order history deleted and tables reset.');
        
    } catch (err) {
        console.error('An error occurred:', err);
    } finally {
        await pool.end();
    }
}

main();
