const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'nextpos_master'
    });

    try {
        const [rows] = await connection.query('SELECT id, name, phone FROM `tenant_a1111111_1111_4111_8111_111111111111`.customers LIMIT 5');
        console.log('Customers in DB:', JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await connection.end();
    }
}

run();
