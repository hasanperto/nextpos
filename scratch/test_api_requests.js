// Node 18+ has native fetch, so no import needed

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

async function runTest() {
    try {
        console.log('Logging in to get cashier token...');
        const loginRes = await fetch('http://127.0.0.1:3101/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'cashier',
                password: 'kasa123',
                tenantId: TENANT_ID,
                deviceId: 'pw-cashier-e2e'
            })
        });

        if (!loginRes.ok) {
            console.error(`Login failed: ${loginRes.status} ${loginRes.statusText}`);
            console.error(await loginRes.text());
            return;
        }

        const loginData = await loginRes.json();
        const token = loginData.accessToken;
        console.log('✅ Logged in successfully. Token obtained.');

        // Test GET /api/v1/menu/categories
        console.log('\n--- GET /api/v1/menu/categories ---');
        const catRes = await fetch('http://127.0.0.1:3101/api/v1/menu/categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`Status: ${catRes.status} ${catRes.statusText}`);
        const catText = await catRes.text();
        console.log('Body:', catText);

        // Test GET /api/v1/menu/products
        console.log('\n--- GET /api/v1/menu/products ---');
        const prodRes = await fetch('http://127.0.0.1:3101/api/v1/menu/products', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`Status: ${prodRes.status} ${prodRes.statusText}`);
        const prodText = await prodRes.text();
        console.log('Body:', prodText);

    } catch (error) {
        console.error('Error during test:', error);
    }
}

runTest();
