const http = require('http');

// Step 1: Login
const loginData = JSON.stringify({
    username: 'admin',
    password: 'admin123',
    tenantId: '2ba40fe6-f2dd-42d2-8d65-55e80010374b'
});

const loginReq = http.request({
    hostname: 'localhost', port: 3001,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
}, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('LOGIN Status:', res.statusCode);
        const data = JSON.parse(body);
        if (data.accessToken) {
            console.log('✅ Login OK, user:', data.user.name);
            // Step 2: Fetch categories
            fetchMenu(data.accessToken);
        } else {
            console.log('❌ Login failed:', body);
        }
    });
});
loginReq.write(loginData);
loginReq.end();

function fetchMenu(token) {
    http.get({
        hostname: 'localhost', port: 3001,
        path: '/api/v1/menu/categories?lang=tr',
        headers: { 'Authorization': 'Bearer ' + token }
    }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log('\nCATEGORIES Status:', res.statusCode);
            const cats = JSON.parse(body);
            console.log('Categories count:', Array.isArray(cats) ? cats.length : 'NOT ARRAY');
            if (Array.isArray(cats)) cats.forEach(c => console.log(`  - ${c.displayName} (id:${c.id})`));

            // Step 3: Fetch products
            http.get({
                hostname: 'localhost', port: 3001,
                path: '/api/v1/menu/products?lang=tr',
                headers: { 'Authorization': 'Bearer ' + token }
            }, (res2) => {
                let body2 = '';
                res2.on('data', (chunk) => body2 += chunk);
                res2.on('end', () => {
                    console.log('\nPRODUCTS Status:', res2.statusCode);
                    try {
                        const prods = JSON.parse(body2);
                        console.log('Products count:', Array.isArray(prods) ? prods.length : 'NOT ARRAY');
                        if (Array.isArray(prods) && prods.length > 0) {
                            prods.slice(0, 5).forEach(p => console.log(`  - ${p.displayName} €${p.basePrice} (variants: ${p.variants?.length || 0})`));
                        }
                    } catch(e) {
                        console.log('Parse error, body:', body2.substring(0, 200));
                    }
                });
            });
        });
    });
}
