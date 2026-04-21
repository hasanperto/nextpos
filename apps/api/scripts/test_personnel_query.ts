import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function testQuery() {
    const schema = 'tenant_test1'; 
    console.log(`🔍 Testing detailed report query in ${schema}...`);
    
    try {
        await pool.query(`SET search_path TO ${schema}, public`);

        const sql = `SELECT 
            u.id, u.name, u.role, u.status,
            (SELECT COUNT(*) FROM orders o WHERE o.waiter_id = u.id AND o.status = 'completed') as served_as_waiter,
            (SELECT COUNT(*) FROM orders o WHERE o.cashier_id = u.id AND o.status = 'completed') as handled_as_cashier,
            (SELECT COUNT(*) FROM orders o WHERE o.picked_up_by = u.id AND o.status = 'completed') as picked_ups,
            (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE (o.waiter_id = u.id OR o.cashier_id = u.id) AND o.status = 'completed') as total_revenue_generated,
            (SELECT COALESCE(SUM(duration_mins), 0) FROM staff_shifts s WHERE s.user_id = u.id) as total_work_mins
         FROM users u
         WHERE u.status = 'active'
         ORDER BY u.role, u.name`;

        const { rows } = await pool.query(sql);
        console.log(`✅ Query successful! Rows: ${rows.length}`);
        console.log(JSON.stringify(rows.slice(0, 2), null, 2));

    } catch (err: any) {
        console.error('❌ Query error:', err.message);
    }
    
    await pool.end();
}

testQuery();
