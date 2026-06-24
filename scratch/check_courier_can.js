const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function checkCourier() {
  try {
    const res = await pool.query('SELECT * FROM tenant_demo.users WHERE username = $1', ['courier_can']);
    console.log('RESULT:', JSON.stringify(res.rows));
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await pool.end();
  }
}

checkCourier();
