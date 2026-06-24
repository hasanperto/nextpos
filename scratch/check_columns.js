const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function verify() {
  try {
    // 1. Payments tablosu sütunları
    const colRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'tenant_demo' AND table_name = 'payments' 
       ORDER BY ordinal_position`
    );
    console.log('PAYMENTS COLUMNS:', colRes.rows.map(r => r.column_name).join(', '));

    // 2. Payments kayıtları
    const payRes = await pool.query(
      `SELECT p.* FROM tenant_demo.payments p
       JOIN tenant_demo.orders o ON p.order_id = o.id
       WHERE o.customer_name LIKE 'Mustafa Test%'`
    );
    console.log('\n--- PAYMENTS ---');
    console.table(payRes.rows);

    // 3. Deliveries tablosu sütunları
    const delColRes = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'tenant_demo' AND table_name = 'deliveries' 
       ORDER BY ordinal_position`
    );
    console.log('\nDELIVERIES COLUMNS:', delColRes.rows.map(r => r.column_name).join(', '));

    // 4. Deliveries kayıtları
    const delRes = await pool.query(
      `SELECT d.* FROM tenant_demo.deliveries d
       JOIN tenant_demo.orders o ON d.order_id = o.id
       WHERE o.customer_name LIKE 'Mustafa Test%'`
    );
    console.log('\n--- DELIVERIES ---');
    console.table(delRes.rows);

    // 5. Z-Business day locks (Kasiyer kapanış/gün sonu)
    const zRes = await pool.query(`SELECT * FROM tenant_demo.z_business_day_locks ORDER BY created_at DESC LIMIT 5`);
    console.log('\n--- Z BUSINESS DAY LOCKS ---');
    console.table(zRes.rows);

    // 6. Staff shifts (vardiya)
    const shiftsRes = await pool.query(`SELECT * FROM tenant_demo.staff_shifts ORDER BY start_time DESC LIMIT 5`);
    console.log('\n--- STAFF SHIFTS ---');
    console.table(shiftsRes.rows);

  } catch (e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
}
verify();
