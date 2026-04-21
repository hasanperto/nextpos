
import pool from './apps/api/src/lib/db.js';

async function check() {
    try {
        // Get first tenant to check its schema
        const [tenants]: any = await pool.query('SELECT schema_name FROM tenants LIMIT 1');
        if (!tenants || tenants.length === 0) {
            console.log('No tenants found');
            process.exit(0);
        }
        const schema = tenants[0].schema_name;
        console.log(`Checking schema: ${schema}`);

        const [cols]: any = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = 'kitchen_tickets'
        `, [schema]);
        
        console.table(cols);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
