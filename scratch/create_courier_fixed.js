const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
    const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
    try {
        const hash = await bcrypt.hash('kurye123', 10);
        await pool.query('SET search_path TO "tenant_demo", public');
        
        // Explicitly insert with id = 5 to avoid sequence conflicts
        await pool.query(
            `INSERT INTO users (id, username, password_hash, name, role, pin_code, branch_id) 
             VALUES (5, $1, $2, $3, $4::user_role, $5, 1) 
             ON CONFLICT (username) DO UPDATE SET role = $4::user_role, pin_code = $5`,
            ['courier', hash, 'Kurye Burak', 'courier', '000000']
        );
        console.log('✅ Courier courier/kurye123 successfully inserted!');
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await pool.end();
    }
}

main();
