const pg = require('pg');

async function run() {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            const tablesRes = await client.query('SELECT id, name, status, current_session_id, active_staff_id FROM "tenant_demo".tables');
            console.log('--- TABLES ---');
            console.log(tablesRes.rows);

            const sessionsRes = await client.query('SELECT id, table_id, waiter_id, status FROM "tenant_demo".table_sessions');
            console.log('--- SESSIONS ---');
            console.log(sessionsRes.rows);
            
            const usersRes = await client.query('SELECT id, username, name, role FROM "tenant_demo".users');
            console.log('--- USERS ---');
            console.log(usersRes.rows);
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
