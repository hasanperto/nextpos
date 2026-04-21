import pool from '../src/lib/db.js';

async function fix() {
    try {
        console.log('--- Ensuring system_settings and active_gateway (Verion 2: ALTER TABLE) ---');
        
        // 1. Create table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.system_settings (
                id SERIAL PRIMARY KEY,
                currency VARCHAR(10) DEFAULT 'EUR',
                base_subscription_fee DECIMAL(12,2) DEFAULT 500,
                monthly_license_fee DECIMAL(12,2) DEFAULT 50
            );
        `);

        // 2. Add active_gateway column if it doesn't exist
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='system_settings' AND column_name='active_gateway') THEN
                    ALTER TABLE public.system_settings ADD COLUMN active_gateway VARCHAR(50) DEFAULT 'iyzico';
                END IF;
            END $$;
        `);
        
        // 3. Upsert row 1
        await pool.query(`
            INSERT INTO public.system_settings (id, currency, active_gateway) 
            VALUES (1, 'EUR', 'iyzico')
            ON CONFLICT (id) DO UPDATE SET active_gateway = 'iyzico';
        `);
        
        console.log('✅ System settings updated properly.');
        process.exit(0);
    } catch (err: any) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

fix();
