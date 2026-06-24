const { getTenantBillingStatus } = require('../apps/api/dist/services/billing.service');

async function test() {
    try {
        console.log('Testing billing status for Demo Pizza & Kebab (a1111111-1111-4111-8111-111111111111)...');
        const status = await getTenantBillingStatus('a1111111-1111-4111-8111-111111111111');
        console.log('Status result:', JSON.stringify(status, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

test();
