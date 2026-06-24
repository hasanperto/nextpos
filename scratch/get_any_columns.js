const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

async function getColumns(tableName, schemaName) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = $2 ORDER BY ordinal_position`, [tableName, schemaName]);
    rows.forEach(r => console.log(r.column_name));
  } catch (e) {
      console.error(e);
  } finally { client.release(); pool.end(); }
}

const args = process.argv.slice(2);
getColumns(args[0], args[1]);
