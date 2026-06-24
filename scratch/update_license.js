const { Pool } = require('pg');

async function main() {
    const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
    try {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        console.log('Target date (tomorrow):', tomorrow);
        
        await pool.query('UPDATE public.tenant_billing SET next_payment_due = $1', [tomorrow]);
        await pool.query('UPDATE public.tenants SET license_expires_at = $1', [tomorrow]);
        
        console.log('Update completed successfully!');
    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await pool.end();
    }
}

main();
