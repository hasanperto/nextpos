const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function getDeliveriesColumns() {
  try {
    const { rows } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'deliveries' AND table_schema = 'tenant_demo'`);
    console.log('COLUMNS:', rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
getDeliveriesColumns();
