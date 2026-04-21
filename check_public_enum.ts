
import pg from 'pg';
const { Client } = pg;

async function checkPublicEnum() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        
        const res = await client.query(`
            SELECT n.nspname as schema, t.typname as type 
            FROM pg_type t 
            JOIN pg_namespace n ON t.typnamespace = n.oid 
            WHERE t.typname = 'order_source'
        `);
        
        console.log('Schemas having order_source type:', JSON.stringify(res.rows, null, 2));

        for (const row of res.rows) {
            const vals = await client.query(`
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (
                    SELECT t.oid FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid 
                    WHERE t.typname = 'order_source' AND n.nspname = $1
                )
            `, [row.schema]);
            console.log(`Values in ${row.schema}.order_source:`, vals.rows.map(r => r.enumlabel));
        }

    } finally {
        await client.end();
    }
}

checkPublicEnum();
