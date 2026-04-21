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

async function migrate() {
    console.log('🚀 Starting system-wide migration (Shifts, Reports, Orders)...');
    
    const { rows: tenants } = await pool.query('SELECT schema_name FROM public.tenants');
    
    for (const tenant of tenants) {
        const s = tenant.schema_name;
        console.log(`  - Migrating schema: ${s}`);
        
        try {
            // 1. Create staff_shifts Table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ${s}.staff_shifts (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES ${s}.users(id) ON DELETE CASCADE,
                    branch_id INT REFERENCES ${s}.branches(id),
                    clock_in TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    clock_out TIMESTAMPTZ,
                    duration_mins INT,
                    total_sales DECIMAL(12, 2) DEFAULT 0,
                    total_orders INT DEFAULT 0,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 2. Add picked_up_by and picked_up_at to orders
            await pool.query(`
                ALTER TABLE ${s}.orders 
                ADD COLUMN IF NOT EXISTS picked_up_by INT REFERENCES ${s}.users(id),
                ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ
            `);

            // 3. Ensure subtotal and tss_signature in daily_summaries
            await pool.query(`
                ALTER TABLE ${s}.daily_summaries 
                ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS tss_signature TEXT
            `);
            
            console.log(`    ✅ OK`);
        } catch (err: any) {
            console.error(`    ❌ Error in ${s}:`, err.message);
        }
    }
    
    await pool.end();
    console.log('✅ All migrations finished.');
}

migrate();
