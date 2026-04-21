const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function createCourier() {
  const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
  try {
    const hash = await bcrypt.hash('kurye123', 10);
    const SCHEMA = 'tenant_demo';
    
    await pool.query(`SET search_path TO "${SCHEMA}", public`);
    
    // Check if role 'courier' exists in user_role enum
    // Actually it's probably the schema-local enum
    // We already checked it exists.

    await pool.query(
      `INSERT INTO users (username, password_hash, name, role, pin_code, branch_id) 
       VALUES ($1, $2, $3, $4::user_role, $5, 1) 
       ON CONFLICT (username) DO UPDATE SET role = $4::user_role, pin_code = $5`,
      ['courier', hash, 'Kurye Burak', 'courier', '000000']
    );
    
    console.log('✅ Courier created: courier / kurye123 (PIN: 000000)');
  } catch (e) {
    console.error('❌ Error creating courier:', e);
  } finally {
    await pool.end();
  }
}

createCourier();
