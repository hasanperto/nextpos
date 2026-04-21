const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

async function addGermanSampleOrders() {
  const client = await pool.connect();
  try {
    // 1. Find the target tenant schema (demo)
    const { rows: schemas } = await client.query('SELECT schema_name FROM tenants WHERE schema_name = $1', ['tenant_demo']);
    if (schemas.length === 0) {
        console.error("❌ tenant_demo not found.");
        return;
    }
    const schema = schemas[0].schema_name;
    await client.query(`SET search_path TO ${schema}, public`);
    
    // 2. Get a sample product for price estimation
    const { rows: products } = await client.query('SELECT id, name, base_price FROM products LIMIT 3');
    if (products.length === 0) {
        console.error("❌ No products found in schema.");
        return;
    }

    const sampleOrders = [
        {
            name: 'Hans Müller (Getir)',
            address: 'Sofienstraße 28, 72108 Rottenburg am Neckar, Almanya',
            phone: '+49 170 1234567',
            source: 'web',
            notes: 'Bitte an der Haustür klingeln.'
        },
        {
            name: 'Klaus Schmidt (Yemeksepeti)',
            address: 'Wilhelmstraße 1, 72074 Tübingen, Almanya',
            phone: '+49 151 9876543',
            source: 'web',
            notes: 'Vorsicht bissiger Hund!'
        },
        {
            name: 'Greta Fischer (QR Menü)',
            address: 'Marktplatz 1, 72116 Mössingen, Almanya',
            phone: '+49 160 5550099',
            source: 'customer_qr',
            notes: 'Zweiter Stock, linke Tür.'
        }
    ];

    for (const orderInfo of sampleOrders) {
        const product = products[Math.floor(Math.random() * products.length)];
        const total = product.base_price || 25.50;
        
        const { rows: orderRows } = await client.query(`
          INSERT INTO orders 
          (order_type, source, status, total_amount, subtotal, tax_amount, customer_name, delivery_address, delivery_phone, notes, created_at)
          VALUES 
          ('delivery', $1, 'ready', $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
            orderInfo.source,
            total,
            total * 0.81,
            total * 0.19,
            orderInfo.name,
            orderInfo.address,
            orderInfo.phone,
            orderInfo.notes
        ]);
        
        console.log(`✅ Created Web Order #${orderRows[0].id} for '${orderInfo.name}' at '${orderInfo.address}'`);
    }

  } catch (err) {
      console.error("❌ Error adding orders:", err);
  } finally { 
      client.release(); 
      pool.end(); 
  }
}

addGermanSampleOrders();
