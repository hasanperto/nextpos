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
    console.log('🚀 Migrating daily_summaries table...');
    
    const { rows: tenants } = await pool.query('SELECT schema_name FROM public.tenants');
    
    for (const tenant of tenants) {
        const schema = tenant.schema_name;
        console.log(`  - Migrating schema: ${schema}`);
        
        try {
            // Ensure table exists
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ${schema}.daily_summaries (
                    id SERIAL PRIMARY KEY,
                    branch_id INT NOT NULL,
                    report_date DATE NOT NULL,
                    total_orders INT DEFAULT 0,
                    total_revenue DECIMAL(12, 2) DEFAULT 0,
                    cash_total DECIMAL(12, 2) DEFAULT 0,
                    card_total DECIMAL(12, 2) DEFAULT 0,
                    avg_order_value DECIMAL(10, 2) DEFAULT 0,
                    cancelled_count INT DEFAULT 0,
                    discount_total DECIMAL(12, 2) DEFAULT 0,
                    tax_total DECIMAL(12, 2) DEFAULT 0,
                    top_products JSONB,
                    hourly_data JSONB,
                    cashier_id INT,
                    z_report_no VARCHAR(20),
                    opened_at TIMESTAMPTZ,
                    closed_at TIMESTAMPTZ,
                    opening_cash DECIMAL(10, 2),
                    closing_cash DECIMAL(10, 2),
                    UNIQUE(branch_id, report_date)
                )
            `);
            
            // Add subtotal if missing
            await pool.query(`
                ALTER TABLE ${schema}.daily_summaries 
                ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS tss_signature TEXT
            `);
            
            console.log(`    ✅ OK`);
        } catch (err: any) {
            console.error(`    ❌ Error in ${schema}:`, err.message);
        }
    }
    
    await pool.end();
    console.log('✅ Migration finished.');
}

migrate();
