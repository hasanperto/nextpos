const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function checkEnums() {
  try {
    const res = await pool.query(`
      SELECT e.enumlabel, length(e.enumlabel) as len
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'tenant_demo' AND t.typname = 'order_status'
      ORDER BY e.enumsortorder
    `);
    res.rows.forEach(r => {
      console.log(`'${r.enumlabel}' (len: ${r.len})`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkEnums();
