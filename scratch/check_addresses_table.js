const pg = require('pg');

async function check() {
    const pool = new pg.Pool({
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            const tables = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'tenant_demo' AND table_name = 'customer_addresses'
            `);
            console.log('Exists:', tables.rows);
            
            if (tables.rows.length > 0) {
                const cols = await client.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema = 'tenant_demo' AND table_name = 'customer_addresses'
                `);
                console.log('Columns:', cols.rows);
            }
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
