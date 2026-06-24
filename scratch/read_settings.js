const pg = require('pg');
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
});

async function main() {
    try {
        const res = await pool.query('SELECT settings FROM "tenant_demo".branches WHERE id = 1');
        console.log(JSON.stringify(res.rows[0], null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
