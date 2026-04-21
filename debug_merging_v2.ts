
import pool from './apps/api/src/lib/db.js';

async function check() {
    try {
        const tenantsRes = await pool.query('SELECT schema_name FROM tenants LIMIT 1');
        const schema = tenantsRes.rows[0].schema_name;
        console.log(`Checking schema: ${schema}`);

        const ordersRes = await pool.query(`SELECT id, session_id, table_id, status FROM ${schema}.orders ORDER BY id DESC LIMIT 5`);
        console.log('--- RECENT ORDERS ---');
        console.table(ordersRes.rows);

        const ticketsRes = await pool.query(`SELECT id, order_id, status, station, items FROM ${schema}.kitchen_tickets ORDER BY id DESC LIMIT 5`);
        console.log('--- RECENT KITCHEN TICKETS ---');
        console.table(ticketsRes.rows);

        // Check columns of categories
        const catColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = '${schema}' AND table_name = 'categories'
        `);
        console.log('--- CATEGORY COLUMNS ---');
        console.table(catColsRes.rows);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
