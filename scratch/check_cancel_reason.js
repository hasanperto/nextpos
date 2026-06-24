const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
async function run() {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema = 'tenant_demo' AND table_name = 'orders' 
     ORDER BY ordinal_position`
  );
  console.log('ORDERS COLUMNS:', r.rows.map(x => x.column_name).join(', '));
  
  const r2 = await pool.query(
    `SELECT id, customer_name, status, cancel_reason, notes 
     FROM tenant_demo.orders WHERE status = 'cancelled' LIMIT 5`
  );
  console.log('\nCANCELLED ORDERS:');
  console.table(r2.rows);
  await pool.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
