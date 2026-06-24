const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=tenant_demo'
});

async function main() {
    const client = await pool.connect();
    try {
        const order = await client.query('SELECT * FROM "tenant_demo".orders WHERE id = 113');
        console.log('Order 113 Details:', order.rows[0]);

        const orderItems = await client.query('SELECT * FROM "tenant_demo".order_items WHERE order_id = 113');
        console.log('Order 102 Items:', orderItems.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
