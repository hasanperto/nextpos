const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function main() {
  try {
    const res = await pool.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'tenant_demo'
      ORDER BY t.typname, e.enumsortorder
    `);
    
    const enums = {};
    res.rows.forEach(r => {
      if (!enums[r.typname]) enums[r.typname] = [];
      enums[r.typname].push(r.enumlabel);
    });
    
    console.log(JSON.stringify(enums, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();
