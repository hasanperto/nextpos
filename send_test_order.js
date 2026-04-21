
const https = require('http');

const data = JSON.stringify({
    customerName: 'Ahmet Yilmaz (FINAL-TEST)',
    customerPhone: '5551234567',
    orderType: 'delivery',
    address: 'Kadikoy, Istanbul',
    paymentMethod: 'cash',
    notes: 'Test Siparis - Zod Fix Sonrasi',
    items: [
        { productId: 1, quantity: 2 } // variantId ve modifierIds opsiyonel
    ]
});

const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/v1/qr/external-order',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-tenant-id': 'a1111111-1111-4111-8111-111111111111'
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('BODY:', body);
    });
});

req.on('error', (error) => {
    console.error('ERROR:', error);
});

req.write(data);
req.end();
