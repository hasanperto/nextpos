const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function getTables() {
  try {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'tenant_demo' AND table_type = 'BASE TABLE'`);
    console.log('TABLES:', rows.map(r => r.table_name).join(', '));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
getTables();
