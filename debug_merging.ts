
import pool from './apps/api/src/lib/db.js';

async function check() {
    try {
        const [tenants]: any = await pool.query('SELECT schema_name FROM tenants LIMIT 1');
        const schema = tenants[0].schema_name;
        console.log(`Checking schema: ${schema}`);

        console.log('--- RECENT ORDERS ---');
        const [orders]: any = await pool.query(`SELECT id, session_id, table_id, status FROM ${schema}.orders ORDER BY id DESC LIMIT 5`);
        console.table(orders);

        console.log('--- RECENT KITCHEN TICKETS ---');
        const [tickets]: any = await pool.query(`SELECT id, order_id, status, station FROM ${schema}.kitchen_tickets ORDER BY id DESC LIMIT 5`);
        console.table(tickets);

        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
}

check();
