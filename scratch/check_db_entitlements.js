const pg = require('pg');

async function check() {
    const pool = new pg.Pool({
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            console.log('--- TENANT INFO ---');
            const tenants = await client.query('SELECT * FROM tenants WHERE id = \'a1111111-1111-4111-8111-111111111111\'');
            console.log(tenants.rows);

            console.log('\n--- TENANT MODULES ---');
            const tmods = await client.query('SELECT * FROM tenant_modules WHERE tenant_id = \'a1111111-1111-4111-8111-111111111111\'');
            console.log(tmods.rows);

            console.log('\n--- SUBSCRIPTION PLANS ---');
            const plans = await client.query('SELECT * FROM subscription_plans');
            console.log(plans.rows);

            console.log('\n--- ALL MODULES ---');
            const mods = await client.query('SELECT * FROM billing_modules');
            console.log(mods.rows);

            console.log('\n--- PLAN MODULE RULES ---');
            const rules = await client.query('SELECT * FROM plan_module_rules');
            console.log(rules.rows);
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
