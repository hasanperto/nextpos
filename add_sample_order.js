const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

async function addSampleOrderWithName() {
  const client = await pool.connect();
  try {
    const { rows: schemas } = await client.query('SELECT schema_name FROM tenants WHERE schema_name = $1', ['tenant_demo']);
    if (schemas.length === 0) return;
    const schema = schemas[0].schema_name;
    await client.query(`SET search_path TO ${schema}, public`);
    const { rows: products } = await client.query('SELECT id, name, base_price FROM products LIMIT 1');
    if (products.length > 0) {
        const product = products[0];
        const { rows: orderRows } = await client.query(`
          INSERT INTO orders (order_type, source, status, total_amount, subtotal, tax_amount, customer_name, delivery_address, delivery_phone, notes)
          VALUES ('delivery', 'customer_qr', 'ready', ${product.base_price}, ${product.base_price * 0.81}, ${product.base_price * 0.19}, 'Mehmet Demir', 'Beşiktaş, İstanbul', '05553332211', 'Lütfen hızlı gelsin.')
          RETURNING id
        `);
        console.log(`✅ Created Order #${orderRows[0].id} with name 'Mehmet Demir'`);
    }
  } finally { client.release(); pool.end(); }
}
addSampleOrderWithName();
