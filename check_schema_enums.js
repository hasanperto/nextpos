const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function checkEnums() {
  try {
    const res = await pool.query(`
      SELECT n.nspname as schema, t.typname as enum_name, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE t.typname = 'order_status'
      ORDER BY n.nspname, e.enumsortorder
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkEnums();
