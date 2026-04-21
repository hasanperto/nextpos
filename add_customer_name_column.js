const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

async function addCustomerNameColumn() {
  const client = await pool.connect();
  try {
    const { rows: schemas } = await client.query('SELECT schema_name FROM tenants');
    for (const { schema_name: schema } of schemas) {
      console.log(`Working on schema: ${schema}`);
      try {
        await client.query(`ALTER TABLE ${schema}.orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`);
        console.log(`✅ Success for ${schema}`);
      } catch (err) {
        console.error(`❌ Error for ${schema}:`, err.message);
      }
    }
  } finally { client.release(); pool.end(); }
}
addCustomerNameColumn();
