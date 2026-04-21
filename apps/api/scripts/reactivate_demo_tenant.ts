
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

async function reactivate() {
    const tenantId = 'a1111111-1111-4111-8111-111111111111';
    console.log(`🚀 Reactivating tenant: ${tenantId}`);

    try {
        // 1. Tenants tablosunu güncelle
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        
        await pool.query(
            'UPDATE public.tenants SET status = $1, license_expires_at = $2 WHERE id = $3',
            ['active', nextYear, tenantId]
        );
        console.log('✅ Updated public.tenants status to active');

        // 2. tenant_billing tablosunu güncelle (vadeyi ileri al)
        await pool.query(
            'UPDATE public.tenant_billing SET payment_current = true, next_payment_due = $1, suspended_at = NULL, suspension_reason = NULL WHERE tenant_id = $2',
            [nextYear.toISOString().slice(0, 10), tenantId]
        );
        console.log('✅ Updated public.tenant_billing: payment_current = true, next_payment_due = +1yr');

        // 3. payment_history'deki bekleyen/gecikmiş ödemeleri temizle (cron'un tekrar tetiklememesi için)
        await pool.query(
            "DELETE FROM public.payment_history WHERE tenant_id::text = $1 AND (status = 'pending' OR status = 'overdue')",
            [tenantId]
        );
        console.log('✅ Cleaned up pending/overdue payments in public.payment_history');

        console.log('🎉 Demo tenant reactivated successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error reactivating tenant:', err);
        process.exit(1);
    }
}

reactivate();
