const pg = require('pg');
const client = new pg.Client('postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos');

async function main() {
    await client.connect();
    const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'tenant_demo'
        ORDER BY table_name
    `);
    console.log('Tables in tenant_demo:', res.rows.map(r => r.table_name).join(', '));
    await client.end();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
