const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
  const SCHEMA = 'tenant_demo';

  try {
    await pool.query(`SET search_path TO "${SCHEMA}", public`);

    // Let's clear previous orders for clean test
    console.log('Clearing previous test orders...');
    await pool.query("DELETE FROM deliveries WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'Mustafa Test%')");
    await pool.query("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'Mustafa Test%')");
    await pool.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'Mustafa Test%')");
    await pool.query("DELETE FROM orders WHERE customer_name LIKE 'Mustafa Test%'");

    // Courier user id is 6
    const courierId = 6;
    
    // Create 3 orders
    const orders = [
      { name: 'Mustafa Test 1', amount: 35.40, subtotal: 30.00, tax: 5.40 },
      { name: 'Mustafa Test 2', amount: 17.70, subtotal: 15.00, tax: 2.70 },
      { name: 'Mustafa Test 3', amount: 59.00, subtotal: 50.00, tax: 9.00 },
    ];

    for (const o of orders) {
      const oRes = await pool.query(
        `INSERT INTO orders (
           customer_name, order_type, source, subtotal, tax_amount, total_amount, 
           notes, delivery_address, delivery_phone, 
           payment_status, status, branch_id, courier_id, created_at, updated_at
         ) VALUES ($1, 'delivery'::order_type, 'cashier'::order_source, $2, $3, $4, 
                  'Kurye Test Siparis', 'Test Cd. No:1, Istanbul', '5001234567', 
                  'unpaid'::payment_status, 'ready'::order_status, 1, $5, NOW(), NOW())
         RETURNING id`,
        [o.name, o.subtotal, o.tax, o.amount, courierId]
      );
      const orderId = oRes.rows[0].id;

      // Create a delivery record
      await pool.query(
        `INSERT INTO deliveries (order_id, status, created_at)
         VALUES ($1, 'pending'::delivery_status, NOW())`,
        [orderId]
      );
      console.log(`✅ Order ${orderId} (${o.name}) created as 'ready' and assigned to courier ${courierId}.`);
    }

  } catch (err) {
    console.error('❌ Error creating mock orders:', err);
  } finally {
    await pool.end();
  }
}

main();
