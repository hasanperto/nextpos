const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=tenant_demo'
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('--- TABLES ---');
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'tenant_demo'
        `);
        console.log(tables.rows.map(r => r.table_name));

        console.log('\n--- KITCHEN TICKETS ---');
        const tickets = await client.query('SELECT * FROM "tenant_demo".kitchen_tickets');
        console.log(JSON.stringify(tickets.rows, null, 2));

        console.log('\n--- DELIVERIES ---');
        const deliveries = await client.query('SELECT * FROM "tenant_demo".deliveries');
        console.log(JSON.stringify(deliveries.rows, null, 2));

        console.log('\n--- ALL ACTIVE ORDERS ---');
        const allOrders = await client.query('SELECT id, customer_name, order_type, status, source FROM "tenant_demo".orders ORDER BY id DESC');
        console.log(JSON.stringify(allOrders.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
