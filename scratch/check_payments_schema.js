const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=tenant_demo'
});

async function main() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM "tenant_demo".payments LIMIT 1');
        if (res.rows.length > 0) {
            console.log('Columns in payments table:', Object.keys(res.rows[0]));
            console.log('Sample payment:', res.rows[0]);
        } else {
            console.log('No payments found in payments table.');
            // Get columns metadata
            const cols = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'tenant_demo' AND table_name = 'payments'
            `);
            console.log(cols.rows);
        }
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
