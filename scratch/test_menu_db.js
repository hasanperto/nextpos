const pg = require('pg');
const { Client } = pg;

async function checkMenuTables() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        console.log('Connected to NextPOS PG database!');

        // 1. Let's test categories query
        try {
            console.log('--- Querying categories ---');
            const resCat = await client.query('SELECT * FROM "tenant_demo".categories WHERE is_active = true ORDER BY sort_order ASC');
            console.log(`Success: Found ${resCat.rows.length} categories.`);
            if (resCat.rows.length > 0) {
                console.log('First Category sample:', resCat.rows[0]);
            }
        } catch (errCat) {
            console.error('❌ Error querying categories:', errCat.message);
            console.error(errCat.stack);
        }

        // 2. Let's test products query
        try {
            console.log('--- Querying products ---');
            const resProd = await client.query(`
                SELECT p.*, c.name as category_name
                FROM "tenant_demo".products p
                LEFT JOIN "tenant_demo".categories c ON p.category_id = c.id
                WHERE p.is_active = true
                ORDER BY p.sort_order ASC
            `);
            console.log(`Success: Found ${resProd.rows.length} products.`);
            if (resProd.rows.length > 0) {
                console.log('First Product sample:', resProd.rows[0]);
                
                const firstId = resProd.rows[0].id;
                
                // Let's test product_variants
                console.log(`--- Querying product_variants for product ${firstId} ---`);
                const resVariants = await client.query(
                    'SELECT id, product_id, name, price, sort_order, is_default FROM "tenant_demo".product_variants WHERE product_id = $1 ORDER BY sort_order ASC',
                    [firstId]
                );
                console.log(`Success: Found ${resVariants.rows.length} variants.`);
                
                // Let's test product_modifiers
                console.log(`--- Querying modifiers for product ${firstId} ---`);
                const resMods = await client.query(
                    `SELECT m.id, m.name, m.price, m.category
                     FROM "tenant_demo".product_modifiers pm
                     JOIN "tenant_demo".modifiers m ON pm.modifier_id = m.id
                     WHERE pm.product_id = $1 AND m.is_active = true`,
                    [firstId]
                );
                console.log(`Success: Found ${resMods.rows.length} modifiers.`);
            }
        } catch (errProd) {
            console.error('❌ Error querying products:', errProd.message);
            console.error(errProd.stack);
        }

    } catch (err) {
        console.error('Database connection failed:', err);
    } finally {
        await client.end();
    }
}

checkMenuTables();
