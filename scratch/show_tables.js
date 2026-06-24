const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'nextpos_master'
    });

    try {
        const [dbs] = await connection.query('SHOW DATABASES');
        console.log('Databases:', dbs.map(d => d.Database));

        const tenantDb = dbs.find(d => d.Database.startsWith('tenant_'));
        if (tenantDb) {
            console.log(`Listing tables for: ${tenantDb.Database}`);
            const [tables] = await connection.query(`SHOW TABLES FROM \`${tenantDb.Database}\``);
            console.log('Tables:', tables.map(t => Object.values(t)[0]));
        } else {
            console.log('No tenant database found.');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await connection.end();
    }
}

main();
