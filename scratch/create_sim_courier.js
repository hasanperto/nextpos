const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
    const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
    try {
        const hash = await bcrypt.hash('kurye123', 10);
        await pool.query('SET search_path TO "tenant_demo", public');
        
        // Find if courier_can already exists, or insert new
        const check = await pool.query("SELECT id FROM users WHERE username = 'courier_can'");
        let courierId;
        
        if (check.rows.length > 0) {
            courierId = check.rows[0].id;
            await pool.query(
                "UPDATE users SET password_hash = $1, pin_code = $2, role = 'courier'::user_role WHERE id = $3",
                [hash, '888888', courierId]
            );
            console.log(`✅ Sim Courier courier_can updated with ID: ${courierId}`);
        } else {
            const res = await pool.query(
                `INSERT INTO users (username, password_hash, name, role, pin_code, branch_id) 
                 VALUES ($1, $2, $3, $4::user_role, $5, 1) 
                 RETURNING id`,
                ['courier_can', hash, 'Kurye Can', 'courier', '888888']
            );
            courierId = res.rows[0].id;
            console.log(`✅ Sim Courier courier_can created with ID: ${courierId}`);
        }
        
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await pool.end();
    }
}

main();
