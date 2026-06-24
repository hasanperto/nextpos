import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env configuration
dotenv.config();

async function main() {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos';
    console.log(`Connecting to database: ${databaseUrl}`);

    const pool = new pg.Pool({ connectionString: databaseUrl });
    const client = await pool.connect();

    try {
        // Find all tenant schemas
        const res = await client.query(`
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name LIKE 'tenant_%'
        `);
        const schemas = res.rows.map((r: any) => r.schema_name);
        console.log('Found tenant schemas:', schemas);

        for (const schema of schemas) {
            console.log(`Clearing order data in schema: ${schema}`);
            
            // Set search path
            await client.query(`SET search_path TO "${schema}", public`);

            // Execute deletes in safe dependency order
            const tablesToClear = [
                'order_items_modifiers',
                'order_items',
                'payments',
                'order_couriers',
                'kitchen_ticket_items',
                'kitchen_tickets',
                'deliveries',
                'orders'
            ];

            for (const table of tablesToClear) {
                try {
                    const checkTable = await client.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_schema = $1 AND table_name = $2
                        )
                    `, [schema, table]);
                    
                    if (checkTable.rows[0].exists) {
                        const delRes = await client.query(`DELETE FROM "${table}"`);
                        console.log(`  - Cleared "${table}" (${delRes.rowCount} rows affected)`);
                    } else {
                        console.log(`  - Table "${table}" does not exist in schema, skipping.`);
                    }
                } catch (tableErr: any) {
                    console.error(`  - Error clearing table "${table}":`, tableErr.message);
                }
            }

            // Reset search path to public
            await client.query('SET search_path TO public');
        }

        console.log('✅ All order data cleared successfully across all schemas.');
    } catch (err: any) {
        console.error('Fatal Database Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
