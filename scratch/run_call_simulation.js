const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to trigger incoming call webhook
async function triggerIncomingCall(phone, name) {
  try {
    const res = await fetch('http://localhost:5173/api/v1/integrations/caller-id?tenant=a1111111-1111-4111-8111-111111111111&key=DEMO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, name })
    });
    const data = await res.json();
    console.log(`📡 Caller ID Webhook triggered for ${name} (${phone}):`, data);
  } catch (err) {
    console.error(`❌ Failed to trigger Caller ID Webhook for ${phone}:`, err.message);
  }
}

async function runSimulation() {
  const client = await pool.connect();
  try {
    const schema = 'tenant_demo';
    await client.query(`SET search_path TO ${schema}, public`);

    console.log('🚀 Starting Multi-Customer Caller ID & Order Lifecycle Simulation...');
    
    const phones = {
      cancelled: '05559998811',
      completed: '05559998822',
      preparing: '05559998833'
    };

    // Find our mock orders
    const { rows: orders } = await client.query(
      "SELECT id, status, delivery_phone FROM orders WHERE delivery_phone IN ($1, $2, $3) ORDER BY id ASC", 
      [phones.cancelled, phones.completed, phones.preparing]
    );
    
    if (orders.length < 3) {
      console.error('❌ Could not find the 3 test orders. Please run scratch/create_test_orders.js first!');
      return;
    }

    const cancelledOrder = orders.find(o => o.status === 'cancelled');
    const completedOrder = orders.find(o => o.status === 'completed');
    const preparingOrder = orders.find(o => o.status === 'preparing');

    // --- STEP 1: Cancelled Order Call ---
    console.log(`\n1️⃣ Preparing Cancelled Order #${cancelledOrder.id}...`);
    await client.query("UPDATE orders SET created_at = NOW() WHERE id = $1", [cancelledOrder.id]);
    await sleep(500); // let db commit
    console.log(`📞 Sending Call 1 (Cancelled) for phone: ${phones.cancelled}...`);
    await triggerIncomingCall(phones.cancelled, 'İptal Müşterisi');
    
    await sleep(2500); // wait for frontend to process

    // --- STEP 2: Completed Order Call ---
    console.log(`\n2️⃣ Preparing Completed/Delivered Order #${completedOrder.id}...`);
    await client.query("UPDATE orders SET created_at = NOW() WHERE id = $1", [completedOrder.id]);
    await sleep(500);
    console.log(`📞 Sending Call 2 (Delivered) for phone: ${phones.completed}...`);
    await triggerIncomingCall(phones.completed, 'Teslim Edilen Müşteri');
    
    await sleep(2500); // wait for frontend to process

    // --- STEP 3: Preparing (Active) Order Call ---
    console.log(`\n3️⃣ Preparing Active Order #${preparingOrder.id} (status: preparing)...`);
    await client.query("UPDATE orders SET created_at = NOW() WHERE id = $1", [preparingOrder.id]);
    await sleep(500);
    console.log(`📞 Sending Call 3 (Active) for phone: ${phones.preparing}...`);
    await triggerIncomingCall(phones.preparing, 'Bekleyen Müşteri');

    console.log('\n✅ Simulation finished. Please check http://localhost:5173/cashier Caller ID modal now!');

  } catch (err) {
    console.error('❌ Simulation Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runSimulation();
