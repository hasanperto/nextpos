const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
async function run() {
  // Iptal edilen son 3 delivery siparişi
  const r = await pool.query(
    `SELECT id, customer_name, status, delete_reason, order_type, courier_id 
     FROM tenant_demo.orders 
     WHERE status = 'cancelled' AND order_type = 'delivery' 
     ORDER BY updated_at DESC LIMIT 3`
  );
  console.log('CANCELLED DELIVERIES:');
  console.table(r.rows);

  // customers tablosundaki recent_orders'da cancel_reason olarak gelecek mi?
  if (r.rows.length > 0) {
    const orderId = r.rows[0].id;
    const r2 = await pool.query(
      `SELECT id, customer_id, status, delete_reason as cancel_reason FROM tenant_demo.orders WHERE id = $1`,
      [orderId]
    );
    console.log('\nSAMPLE ORDER WITH cancel_reason alias:');
    console.table(r2.rows);
  }
  await pool.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
