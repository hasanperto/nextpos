const pg = require('pg');
const { Client } = pg;

async function checkColumns() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        
        console.log('--- Columns in tenant_demo.orders ---');
        const resOrders = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'tenant_demo' AND table_name = 'orders'
        `);
        console.log(resOrders.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));

        console.log('\n--- Columns in tenant_demo.payments ---');
        const resPayments = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'tenant_demo' AND table_name = 'payments'
        `);
        console.log(resPayments.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

checkColumns();
