const pg = require('pg');

async function run() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            // Check products
            const productsRes = await client.query('SELECT id, name, base_price FROM "tenant_demo".products');
            console.log('--- PRODUCTS ---');
            console.log(productsRes.rows);

            // Check variants
            const variantsRes = await client.query('SELECT * FROM "tenant_demo".product_variants');
            console.log('--- VARIANTS ---');
            console.log(variantsRes.rows);

            // Check modifiers
            const modifiersRes = await client.query('SELECT * FROM "tenant_demo".product_modifiers');
            console.log('--- PRODUCT MODIFIERS ---');
            console.log(modifiersRes.rows);
        } finally {
            client.release();
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
