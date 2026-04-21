
import pg from 'pg';
const { Client } = pg;

async function checkTableInfo() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        console.log('Checking orders column type...');
        
        const res = await client.query(`
            SELECT column_name, udt_name, udt_schema
            FROM information_schema.columns
            WHERE table_schema = 'tenant_demo' AND table_name = 'orders' AND column_name = 'source'
        `);
        
        console.log('Column Source Info:', JSON.stringify(res.rows, null, 2));

        const resAll = await client.query(`
            SELECT table_schema, table_name, column_name, udt_name, udt_schema
            FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'source'
        `);
        console.log('All Orders Source Columns in DB:', JSON.stringify(resAll.rows, null, 2));

    } finally {
        await client.end();
    }
}

checkTableInfo();
