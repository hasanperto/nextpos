const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

async function getColumns() {
  const client = await pool.connect();
  try {
    const { rows: schemas } = await client.query('SELECT schema_name FROM tenants LIMIT 1');
    const sc = schemas[0].schema_name;
    const { rows } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND table_schema = $1`, [sc]);
    rows.forEach(r => console.log(r.column_name));
  } finally { client.release(); pool.end(); }
}
getColumns();
