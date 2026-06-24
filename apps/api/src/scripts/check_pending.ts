import axios from 'axios';

async function run() {
  try {
    const loginRes = await axios.post('http://127.0.0.1:3101/api/v1/auth/login', {
      username: 'admin',
      password: 'admin123',
      tenantId: 'a1111111-1111-4111-8111-111111111111'
    });
    const token = loginRes.data.accessToken;
    console.log('Login successful, token acquired.');

    const ordersRes = await axios.get('http://127.0.0.1:3101/api/v1/qr/external-orders?statuses=pending', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': 'a1111111-1111-4111-8111-111111111111'
      }
    });
    console.log('Pending external orders:', JSON.stringify(ordersRes.data, null, 2));
  } catch (err: any) {
    console.log('ERROR:', err.response?.data || err.message);
  }
}

run();
