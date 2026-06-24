const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function verify() {
  try {
    // 1. Check Orders
    console.log('--- ORDERS ---');
    const ordersRes = await pool.query(
      `SELECT id, customer_name, status, payment_status, total_amount 
       FROM tenant_demo.orders 
       WHERE customer_name LIKE 'Mustafa Test%' 
       ORDER BY customer_name`
    );
    console.table(ordersRes.rows);

    // 2. Check Payments
    console.log('\n--- PAYMENTS ---');
    const paymentsRes = await pool.query(
      `SELECT p.id, p.order_id, p.amount, p.payment_method, p.status, p.created_at
       FROM tenant_demo.payments p
       JOIN tenant_demo.orders o ON p.order_id = o.id
       WHERE o.customer_name LIKE 'Mustafa Test%'`
    );
    console.table(paymentsRes.rows);

    // 3. Check Deliveries
    console.log('\n--- DELIVERIES ---');
    const deliveriesRes = await pool.query(
      `SELECT d.id, d.order_id, d.status, d.payment_collected, d.delivered_at
       FROM tenant_demo.deliveries d
       JOIN tenant_demo.orders o ON d.order_id = o.id
       WHERE o.customer_name LIKE 'Mustafa Test%'`
    );
    console.table(deliveriesRes.rows);

    // 4. Check Daily Summaries
    console.log('\n--- DAILY SUMMARIES ---');
    const summariesRes = await pool.query(
      `SELECT * FROM tenant_demo.daily_summaries`
    );
    console.table(summariesRes.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
verify();
