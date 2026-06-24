

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

async function run() {
    console.log('Logging in as cashier...');
    const loginRes = await fetch('http://127.0.0.1:3101/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'cashier',
            password: 'kasa123',
            tenantId: TENANT_ID,
            deviceId: 'pw-cashier'
        })
    });
    
    if (!loginRes.ok) {
        console.error('Login failed:', loginRes.status, await loginRes.text());
        return;
    }
    
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    console.log('Logged in successfully! Token:', token.slice(0, 15) + '...');
    
    console.log('Fetching couriers...');
    const couriersRes = await fetch('http://127.0.0.1:3101/api/v1/users/couriers', {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'x-device-id': 'pw-cashier'
        }
    });
    
    console.log('Couriers Response Status:', couriersRes.status);
    console.log('Couriers Response Body:', await couriersRes.text());

    console.log('Fetching waiters...');
    const waitersRes = await fetch('http://127.0.0.1:3101/api/v1/users/waiters', {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'x-device-id': 'pw-cashier'
        }
    });
    
    console.log('Waiters Response Status:', waitersRes.status);
    console.log('Waiters Response Body:', await waitersRes.text());
}

run().catch(console.error);
