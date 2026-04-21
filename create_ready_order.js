const { Pool } = require('pg');

async function createReadyOrder() {
  const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
  const SCHEMA = 'tenant_demo';

  try {
    await pool.query(`SET search_path TO "${SCHEMA}", public`);
    
    // Create customer simply
    const phone = '5001234567';
    let customerId;
    const existing = await pool.query("SELECT id FROM customers WHERE phone = $1", [phone]);
    if (existing.rows.length > 0) {
      customerId = existing.rows[0].id;
    } else {
      const cRes = await pool.query("INSERT INTO customers (name, phone) VALUES ('Mustafa Test', $1) RETURNING id", [phone]);
      customerId = cRes.rows[0].id;
    }

    // Create a 'ready' order
    const oRes = await pool.query(
      `INSERT INTO orders (
         customer_id, order_type, source, subtotal, tax_amount, total_amount, 
         notes, delivery_address, delivery_phone, 
         payment_status, status, branch_id, created_at
       ) VALUES ($1, 'delivery'::order_type, 'pos'::order_source, 20.00, 3.60, 23.60, 'Kurye Test Siparis', 'Test Cd. No:1, Istanbul', $2, 'unpaid'::payment_status, 'ready'::order_status, 1, NOW())
       RETURNING id`,
      [customerId, phone]
    );
    const orderId = oRes.rows[0].id;

    // Create a delivery record
    await pool.query(
      `INSERT INTO deliveries (order_id, status, created_at)
       VALUES ($1, 'pending'::delivery_status, NOW())`,
      [orderId]
    );

    console.log(`✅ Order ${orderId} created as 'ready' and awaiting delivery assignment.`);
    return orderId;
  } catch (e) {
    console.error('❌ Error creating ready order:', e);
  } finally {
    await pool.end();
  }
}

createReadyOrder();
