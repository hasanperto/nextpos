const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function findCourier() {
    try {
        const schemas = await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'");
        for (const s of schemas.rows) {
            const schema = s.schema_name;
            try {
                const users = await pool.query(`SELECT username, pin_code, role FROM ${schema}.users WHERE role = 'courier' LIMIT 1`);
                if (users.rows.length > 0) {
                    console.log(`SCHEMA: ${schema}, PIN: ${users.rows[0].pin_code}`);
                }
            } catch (e) {}
        }
    } finally {
        await pool.end();
    }
}

findCourier();
