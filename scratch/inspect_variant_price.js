const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=tenant_demo'
});

async function main() {
    const client = await pool.connect();
    try {
        const variant = await client.query('SELECT * FROM "tenant_demo".product_variants WHERE id = 469');
        console.log('Variant 469 Details:', variant.rows[0]);

        const product = await client.query('SELECT * FROM "tenant_demo".products WHERE id = 274');
        console.log('Product 274 Details:', product.rows[0]);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
