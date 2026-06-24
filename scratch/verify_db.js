const { Client } = require('pg');
const DB_CONN = 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos';

async function verify() {
    const client = new Client({ connectionString: DB_CONN });
    await client.connect();
    try {
        const tenantId = '16621bb2-10c5-499a-992f-aa0ab54dd6ba';
        const schema = 'tenant_antigravity_cafe';

        console.log('=== Seeding and Schema Verification ===');
        const products = await client.query(`SELECT COUNT(*)::int as count FROM "${schema}".products`);
        const categories = await client.query(`SELECT COUNT(*)::int as count FROM "${schema}".categories`);
        const tables = await client.query(`SELECT COUNT(*)::int as count FROM "${schema}".tables`);
        
        console.log('Products Count:', products.rows[0].count);
        console.log('Categories Count:', categories.rows[0].count);
        console.log('Tables Count:', tables.rows[0].count);

        console.log('\n=== Entitlements (tenant_modules) ===');
        const entitlements = await client.query(
            `SELECT module_code, is_active FROM public.tenant_modules WHERE tenant_id::text = $1`,
            [tenantId]
        );
        console.log('Total modules:', entitlements.rows.length);
        console.log(entitlements.rows.map(r => r.module_code).join(', '));

        console.log('\n=== Reseller Wallet ===');
        const reseller = await client.query(
            `SELECT wallet_balance FROM public.saas_admins WHERE username = 'demo_reseller'`
        );
        console.log('Wallet Balance:', reseller.rows[0].wallet_balance);

        console.log('\n=== Tenant Billing ===');
        const billing = await client.query(
            `SELECT plan_code, billing_cycle, monthly_recurring_total FROM public.tenant_billing WHERE tenant_id::text = $1`,
            [tenantId]
        );
        console.log(billing.rows[0]);

        console.log('\n=== Payment History ===');
        const payments = await client.query(
            `SELECT payment_type, payment_method, amount, status, description FROM public.payment_history WHERE tenant_id::text = $1`,
            [tenantId]
        );
        console.log(payments.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
verify();
