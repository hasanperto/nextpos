const { Client } = require('pg');

const DB_CONN = 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos';

async function run() {
    const client = new Client({ connectionString: DB_CONN });
    await client.connect();
    try {
        const schema = 'tenant_demo';
        console.log(`Checking users in schema: ${schema}...`);

        const res = await client.query(`SELECT id, username, name, role, status, device_id FROM "${schema}".users`);
        console.log('Users in tenant_demo:');
        console.table(res.rows);
    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await client.end();
    }
}

run().catch(console.error);
