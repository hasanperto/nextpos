const pg = require('pg');
const { Client } = pg;

async function checkCustomerTables() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        
        console.log('--- Columns in tenant_demo.customers ---');
        try {
            const resCustomers = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'tenant_demo' AND table_name = 'customers'
            `);
            console.log(resCustomers.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));
        } catch (e) {
            console.error('Error fetching customers info:', e.message);
        }

        console.log('\n--- Columns in tenant_demo.customer_addresses ---');
        try {
            const resAddr = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'tenant_demo' AND table_name = 'customer_addresses'
            `);
            console.log(resAddr.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));
        } catch (e) {
            console.error('Error fetching customer_addresses info:', e.message);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

checkCustomerTables();
