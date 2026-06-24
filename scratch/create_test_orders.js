const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

async function getOrCreateCustomer(client, name, phone, address) {
  let { rows: customers } = await client.query('SELECT id FROM customers WHERE phone = $1', [phone]);
  let customerId;
  
  if (customers.length === 0) {
    const { rows: newCust } = await client.query(
      'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id',
      [name, phone]
    );
    customerId = newCust[0].id;
    console.log(`👤 Created Test Customer: ${name} (${phone}) with ID: ${customerId}`);
  } else {
    customerId = customers[0].id;
    await client.query('UPDATE customers SET name = $1 WHERE id = $2', [name, customerId]);
    console.log(`👤 Existing Test Customer found: ${name} (${phone}) with ID: ${customerId}`);
  }
  
  // Add default address if missing
  const { rows: addrRows } = await client.query('SELECT id FROM customer_addresses WHERE customer_id = $1', [customerId]);
  if (addrRows.length === 0) {
    await client.query(
      'INSERT INTO customer_addresses (customer_id, label, address, is_default) VALUES ($1, $2, $3, true)',
      [customerId, 'Ev', address]
    );
  } else {
    await client.query(
      'UPDATE customer_addresses SET address = $1 WHERE customer_id = $2 AND is_default = true',
      [address, customerId]
    );
  }
  
  return customerId;
}

async function createTestOrders() {
  const client = await pool.connect();
  try {
    const schema = 'tenant_demo';
    await client.query(`SET search_path TO ${schema}, public`);
    
    // Get a sample product for order items
    const { rows: products } = await client.query('SELECT id, name, base_price FROM products LIMIT 1');
    if (products.length === 0) {
      console.error('❌ No products found in database to create order items!');
      return;
    }
    const product = products[0];
    const price = Number(product.base_price || 150);

    // Get active branch ID
    const { rows: branches } = await client.query('SELECT id FROM branches LIMIT 1');
    const branchId = branches.length > 0 ? branches[0].id : 1;
    console.log(`🏢 Active Branch ID: ${branchId}`);

    const testCases = [
      {
        phone: '05559998811',
        name: 'İptal Müşterisi',
        address: 'Kadıköy, İstanbul',
        status: 'cancelled',
        paymentStatus: 'unpaid',
        notes: 'İptal Test Siparişi',
        itemStatus: 'cancelled',
        interval: '3 hours',
        qty: 1
      },
      {
        phone: '05559998822',
        name: 'Teslim Edilen Müşteri',
        address: 'Beşiktaş, İstanbul',
        status: 'completed',
        paymentStatus: 'paid',
        notes: 'Teslim Edildi Test Siparişi',
        itemStatus: 'served',
        interval: '2 hours',
        qty: 2
      },
      {
        phone: '05559998833',
        name: 'Bekleyen Müşteri',
        address: 'Şişli, İstanbul',
        status: 'preparing',
        paymentStatus: 'unpaid',
        notes: 'Beklemede/Hazırlanıyor Test Siparişi',
        itemStatus: 'preparing',
        interval: '15 minutes',
        qty: 1
      }
    ];

    for (const tc of testCases) {
      // Clean old test orders for this phone to start fresh
      await client.query('DELETE FROM orders WHERE delivery_phone = $1', [tc.phone]);
      console.log(`🧹 Cleared old test orders for phone: ${tc.phone}`);

      const customerId = await getOrCreateCustomer(client, tc.name, tc.phone, tc.address);

      const totalPrice = price * tc.qty;

      const { rows: order } = await client.query(`
        INSERT INTO orders (order_type, source, status, payment_status, total_amount, subtotal, tax_amount, customer_id, customer_name, delivery_address, delivery_phone, notes, created_at, branch_id)
        VALUES ('delivery', 'customer_qr', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - INTERVAL '${tc.interval}', $11)
        RETURNING id
      `, [tc.status, tc.paymentStatus, totalPrice, totalPrice * 0.9, totalPrice * 0.1, customerId, tc.name, tc.address, tc.phone, tc.notes, branchId]);
      
      const orderId = order[0].id;

      // Create order items
      await client.query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [orderId, product.id, tc.qty, price, totalPrice, tc.itemStatus]);
      
      console.log(`📦 Created ${tc.status.toUpperCase()} Order #${orderId} for ${tc.name} (${tc.phone})`);
    }

    console.log('🎉 All test orders successfully created.');

  } catch (err) {
    console.error('❌ Error creating test orders:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createTestOrders();
