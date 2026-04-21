
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        const { rows } = await pool.query("SELECT schema_name FROM public.tenants WHERE id = 'a1111111-1111-4111-8111-111111111111'");
        if (rows.length === 0) {
            console.error('Tenant not found');
            process.exit(1);
        }
        const schema = rows[0].schema_name;
        console.log(`Schema: ${schema}`);

        // Create staff_shifts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${schema}.staff_shifts (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
                branch_id INT REFERENCES ${schema}.branches(id),
                clock_in TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                clock_out TIMESTAMPTZ,
                duration_mins INT,
                total_sales DECIMAL(12, 2) DEFAULT 0,
                total_orders INT DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ staff_shifts table created');
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
