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

async function seed() {
    const schema = 'tenant_test1'; 
    console.log(`🌱 Seeding dummy performance data in ${schema}...`);
    
    try {
        await pool.query(`SET search_path TO ${schema}, public`);

        // 1. Get some users
        const { rows: users } = await pool.query(`SELECT id FROM users LIMIT 5`);
        if (users.length === 0) {
            console.log('❌ No users found to seed data for.');
            return;
        }

        for (const user of users) {
            const userId = user.id;
            console.log(`  - Seeding for User ID: ${userId}`);

            // 2. Insert dummy shifts
            await pool.query(`
                INSERT INTO staff_shifts (user_id, branch_id, clock_in, clock_out, duration_mins, total_sales, total_orders)
                VALUES 
                ($1, 1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '8 hours', 480, 500.00, 10),
                ($1, 1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '6 hours', 360, 350.50, 7)
            `, [userId]);

            // 3. Update some orders to be 'completed' and linked to this user
            await pool.query(`
                INSERT INTO orders (branch_id, waiter_id, cashier_id, status, total_amount, created_at, picked_up_by, picked_up_at)
                VALUES 
                (1, $1, $1, 'completed', 120.00, NOW() - INTERVAL '1 day', $1, NOW() - INTERVAL '1 day' + INTERVAL '5 minutes'),
                (1, $1, $1, 'completed', 45.50, NOW() - INTERVAL '1 day', $1, NOW() - INTERVAL '1 day' + INTERVAL '10 minutes')
            `, [userId]);
        }

        console.log('✅ Seeding finished successfully.');
    } catch (err: any) {
        console.error('❌ Seeding error:', err.message);
    }
    
    await pool.end();
}

seed();
