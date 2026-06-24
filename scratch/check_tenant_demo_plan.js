const pg = require('pg');

async function check() {
    const pool = new pg.Pool({
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            console.log('--- TENANT ---');
            const tenants = await client.query('SELECT id, name, subscription_plan FROM tenants WHERE id = \'a1111111-1111-4111-8111-111111111111\'');
            console.log(tenants.rows);

            console.log('\n--- ACTIVE MODULES IN TENANT_MODULES ---');
            const tmods = await client.query('SELECT module_code, quantity, is_active FROM tenant_modules WHERE tenant_id = \'a1111111-1111-4111-8111-111111111111\'');
            console.log(tmods.rows);
        } finally {
            client.release();
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
