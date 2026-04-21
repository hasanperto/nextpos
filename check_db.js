
const mysql = require('mysql2/promise');

async function checkOrdersTable() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'nextpos_master'
    });

    try {
        console.log('Checking orders table structure for tenant_a1111111_1111_4111_8111_111111111111...');
        const [columns] = await connection.query('SHOW COLUMNS FROM `tenant_a1111111_1111_4111_8111_111111111111`.orders');
        console.log('Columns:', JSON.stringify(columns, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await connection.end();
    }
}

checkOrdersTable();
