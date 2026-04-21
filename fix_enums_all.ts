
import pg from 'pg';
const { Client } = pg;

async function fixAllEnums() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        console.log('Connected.');
        
        const res = await client.query('SELECT schema_name FROM public.tenants');
        const schemas = res.rows.map(r => r.schema_name);

        for (const s of schemas) {
            console.log(`Fixing schema: ${s}`);
            // Add qr_portal
            try {
                await client.query(`ALTER TYPE "${s}".order_source ADD VALUE 'qr_portal'`);
                console.log(`- Added qr_portal to ${s}`);
            } catch(e: any) { console.log(`- qr_portal in ${s}: ${e.message}`); }

            // Add whatsapp
            try {
                await client.query(`ALTER TYPE "${s}".order_source ADD VALUE 'whatsapp'`);
                console.log(`- Added whatsapp to ${s}`);
            } catch(e: any) { console.log(`- whatsapp in ${s}: ${e.message}`); }
        }
        console.log('Done!');
    } finally {
        await client.end();
    }
}

fixAllEnums();
