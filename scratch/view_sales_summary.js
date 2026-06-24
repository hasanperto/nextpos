const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=tenant_demo'
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('--- ALL COMPLETED/SERVED PAYMENTS ---');
        const payments = await client.query(`
            SELECT p.id, p.order_id, p.amount, p.method, p.tip_amount, o.order_type, o.status, o.source 
            FROM "tenant_demo".payments p
            JOIN "tenant_demo".orders o ON p.order_id = o.id
            ORDER BY p.id ASC
        `);
        console.log(JSON.stringify(payments.rows, null, 2));

        console.log('\n--- SALES SUMMARY ---');
        const summary = await client.query(`
            SELECT 
                o.order_type,
                COUNT(DISTINCT o.id) as order_count,
                SUM(p.amount) as total_payments,
                SUM(p.tip_amount) as total_tips
            FROM "tenant_demo".orders o
            LEFT JOIN "tenant_demo".payments p ON p.order_id = o.id
            GROUP BY o.order_type
        `);
        console.log(JSON.stringify(summary.rows, null, 2));

        console.log('\n--- PAYMENT METHOD SUMMARY ---');
        const paySummary = await client.query(`
            SELECT 
                p.method,
                SUM(p.amount) as total_amount,
                SUM(p.tip_amount) as total_tips
            FROM "tenant_demo".payments p
            GROUP BY p.method
        `);
        console.log(JSON.stringify(paySummary.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
