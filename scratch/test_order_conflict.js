// Using native fetch in Node 22

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';
const DEVICE_ID = 'pw-waiter';

async function run() {
    // 1. Log in as waiter
    const loginRes = await fetch('http://127.0.0.1:3101/api/v1/auth/login', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-device-id': DEVICE_ID
        },
        body: JSON.stringify({
            username: 'waiter',
            password: 'garson123',
            tenantId: TENANT_ID,
            deviceId: DEVICE_ID
        })
    });
    if (!loginRes.ok) {
        console.error('Login failed:', await loginRes.text());
        return;
    }
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    console.log('Logged in as waiter, token acquired.');

    // 1b. Fetch tables
    const tablesRes = await fetch('http://127.0.0.1:3101/api/v1/tables', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'x-device-id': DEVICE_ID
        }
    });
    const tables = await tablesRes.json();
    console.log('--- TABLES FROM API ---');
    console.log(tables.map(t => ({ id: t.id, name: t.name, active_session_id: t.active_session_id })));

    // 2. Fetch products to find Ayran or Kola product ID
    const productsRes = await fetch('http://127.0.0.1:3101/api/v1/menu/products?lang=de', {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'x-device-id': DEVICE_ID
        }
    });
    const products = await productsRes.json();
    const ayranProduct = products.find(p => p.name.toLowerCase().includes('ayran') || p.name.toLowerCase().includes('kola') || p.name.toLowerCase().includes('tiramisu'));
    if (!ayranProduct) {
        console.error('Ayran product not found');
        return;
    }
    console.log(`Found product: ${ayranProduct.name} (ID: ${ayranProduct.id})`);

    const table1 = tables.find(t => t.name.includes('Masa 1'));
    if (!table1) {
        console.error('Masa 1 not found in API tables');
        return;
    }
    console.log('Using Table 1 details:', table1);

    // 3. Make POST /api/v1/orders call
    const orderPayload = {
        orderType: 'dine_in',
        source: 'waiter',
        isUrgent: false,
        items: [
            {
                productId: ayranProduct.id,
                quantity: 1,
                unitPrice: Number(ayranProduct.basePrice),
                modifiers: []
            }
        ],
        tableId: table1.id,
        sessionId: table1.active_session_id
    };

    console.log('Sending order payload:', orderPayload);
    const orderRes = await fetch('http://127.0.0.1:3101/api/v1/orders', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-device-id': DEVICE_ID
        },
        body: JSON.stringify(orderPayload)
    });

    console.log('Response Status:', orderRes.status);
    console.log('Response Body:', await orderRes.text());
}

run();
