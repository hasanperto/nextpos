const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function checkEnums() {
  try {
    const res = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'tenant_demo' AND t.typname = 'order_status'
      ORDER BY e.enumsortorder
    `);
    console.log('tenant_demo order_status enums:', res.rows.map(r => r.enumlabel).join(', '));

    const res2 = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'tenant_demo' AND t.typname = 'delivery_status'
      ORDER BY e.enumsortorder
    `);
    console.log('tenant_demo delivery_status enums:', res2.rows.map(r => r.enumlabel).join(', '));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkEnums();
