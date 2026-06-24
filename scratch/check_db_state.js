const pg = require('pg');

async function run() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        
        console.log('--- TABLES ---');
        const tables = await client.query('SELECT id, name, status, current_session_id, active_staff_id FROM "tenant_demo".tables ORDER BY id');
        console.table(tables.rows);

        console.log('--- TABLE SESSIONS ---');
        const sessions = await client.query('SELECT id, table_id, customer_id, guest_name, waiter_id, status FROM "tenant_demo".table_sessions ORDER BY id DESC LIMIT 5');
        console.table(sessions.rows);

        console.log('--- ORDERS ---');
        const orders = await client.query('SELECT id, session_id, table_id, order_type, source, status, payment_status, total_amount FROM "tenant_demo".orders ORDER BY id DESC LIMIT 5');
        console.table(orders.rows);

        console.log('--- KITCHEN TICKETS ---');
        const tickets = await client.query('SELECT id, order_id, table_name, status, created_at FROM "tenant_demo".kitchen_tickets ORDER BY id DESC LIMIT 5');
        console.table(tickets.rows);

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
