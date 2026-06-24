const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=tenant_demo'
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('--- ORDER 122 ---');
        const order = await client.query('SELECT * FROM "tenant_demo".orders WHERE id = 122');
        console.log(JSON.stringify(order.rows[0], null, 2));

        console.log('\n--- DELIVERY FOR ORDER 122 ---');
        const delivery = await client.query('SELECT * FROM "tenant_demo".deliveries WHERE order_id = 122');
        console.log(JSON.stringify(delivery.rows[0], null, 2));

        console.log('\n--- ALL PAYMENTS FOR ORDER 122 ---');
        const payments = await client.query('SELECT * FROM "tenant_demo".payments WHERE order_id = 122');
        console.log(payments.rows);

        console.log('\n--- ALL PAYMENTS ---');
        const allPayments = await client.query('SELECT * FROM "tenant_demo".payments');
        console.log(allPayments.rows);

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
