import pool from '../lib/db.js';

async function run() {
  try {
    const res = await pool.query(`SELECT id, customer_name, order_type, source, status, payment_status, total_amount, notes FROM "tenant_demo"."orders" ORDER BY id ASC`);
    console.log('--- Orders in tenant_demo ---');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err: any) {
    console.log('ERROR:', err.message);
  }
  pool.end();
}

run();
