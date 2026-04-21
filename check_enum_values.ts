
import pg from 'pg';
const { Client } = pg;

async function checkEnumValues() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        const schema = 'tenant_demo';
        console.log(`Checking enum for ${schema}...`);
        
        const res = await client.query(`
            SELECT enumlabel 
            FROM pg_enum 
            WHERE enumtypid = (
                SELECT t.oid 
                FROM pg_type t 
                JOIN pg_namespace n ON t.typnamespace = n.oid 
                WHERE t.typname = 'order_source' AND n.nspname = $1
            )
        `, [schema]);
        
        console.log(`Enum values in ${schema}.order_source:`, res.rows.map(r => r.enumlabel));
    } finally {
        await client.end();
    }
}

checkEnumValues();
