
import pg from 'pg';
const { Client } = pg;

async function listSchemas() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        console.log('Connected to PG.');
        
        try {
            const tenantsRes = await client.query('SELECT schema_name FROM public.tenants');
            console.log('Tenants in DB:', JSON.stringify(tenantsRes.rows, null, 2));
        } catch (e: any) {
            console.error('Tenants table error:', e.message);
        }

        const schemasRes = await client.query('SELECT nspname FROM pg_catalog.pg_namespace');
        console.log('Existing schemas in PG:', JSON.stringify(schemasRes.rows.map(r => r.nspname as string), null, 2));
    } finally {
        await client.end();
    }
}

listSchemas();
