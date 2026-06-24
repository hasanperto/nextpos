const { Client } = require('pg');
const http = require('node:http');

const API_BASE = 'http://127.0.0.1:3101'; // Port is 3101 on active dev server
const DB_CONN = 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos';
const TENANT_ID = '16621bb2-10c5-499a-992f-aa0ab54dd6ba'; // Antigravity Cafe UUID

async function request(path, method, body, token, deviceId) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(deviceId ? { 'x-device-id': deviceId } : {}),
            'x-tenant-id': TENANT_ID
        };
        if (data) {
            headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = http.request(`${API_BASE}${path}`, {
            method,
            headers
        }, (res) => {
            let resBody = '';
            res.on('data', (chunk) => resBody += chunk);
            res.on('end', () => {
                let parsed = resBody;
                try { parsed = JSON.parse(resBody); } catch {}
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function run() {
    const client = new Client({ connectionString: DB_CONN });
    await client.connect();

    try {
        const schema = 'tenant_antigravity_cafe';
        console.log('=== Cleaning up device_id values ===');
        await client.query(`UPDATE "${schema}".users SET device_id = null`);
        console.log('Reset all user device_ids to null.');

        console.log('=== Temporarily setting max_devices to 3 for enterprise plan ===');
        await client.query(`UPDATE public.subscription_plans SET max_devices = 3 WHERE code = 'enterprise'`);
        await client.query(`UPDATE public.tenant_modules SET is_active = false WHERE tenant_id = $1::text AND module_code = 'extra_device'`, [TENANT_ID]);

        // Let's get the max limit
        console.log('\n=== Checking Effective Max Devices ===');
        // Let's run a query to find modules and plan for this tenant
        const tenantRes = await client.query(`SELECT subscription_plan FROM public.tenants WHERE id = $1::uuid`, [TENANT_ID]);
        const planCode = tenantRes.rows[0]?.subscription_plan;
        console.log('Tenant Subscription Plan:', planCode);

        const planLimitsRes = await client.query(`SELECT max_devices FROM public.subscription_plans WHERE code = $1`, [planCode]);
        const baseDevices = planLimitsRes.rows[0]?.max_devices || 3;
        console.log('Base plan max devices:', baseDevices);

        const extraRes = await client.query(
            `SELECT COALESCE(quantity, 0) as qty FROM public.tenant_modules WHERE tenant_id = $1::text AND module_code = 'extra_device' AND is_active = true`,
            [TENANT_ID]
        );
        const extraQty = extraRes.rows[0]?.qty || 0;
        console.log('Extra devices quantity purchased:', extraQty);

        const totalAllowed = baseDevices + extraQty;
        console.log('Total allowed devices:', totalAllowed);

        // Logins
        console.log('\n=== Logging in users ===');
        const users = ['cashier', 'waiter', 'kitchen'];
        const passwords = {
            cashier: 'kasa123',
            waiter: 'garson123',
            kitchen: 'mutfak123'
        };
        const loginDevices = {
            cashier: 'cashier-device-1',
            waiter: 'waiter-device-1',
            kitchen: 'kitchen-device-1'
        };
        const tokens = {};
        for (const u of users) {
            const loginRes = await request('/api/v1/auth/login', 'POST', {
                username: u,
                password: passwords[u],
                tenantId: TENANT_ID
            }, null, loginDevices[u]);
            if (loginRes.status !== 200) {
                console.error(`Login failed for ${u}:`, loginRes.body);
                process.exit(1);
            }
            tokens[u] = loginRes.body.accessToken;
            console.log(`User '${u}' logged in successfully.`);
        }

        // Test 1: Missing Device ID
        console.log('\n=== Test 1: Request with missing x-device-id header ===');
        const test1 = await request('/api/v1/tables', 'GET', null, tokens.cashier, null);
        console.log('Status (Expected 400):', test1.status);
        console.log('Body (Expected DEVICE_ID_REQUIRED error):', test1.body);

        // Test 2: Successful Bind of Cashier
        console.log('\n=== Test 2: Binding Cashier to cashier-device-1 ===');
        const test2 = await request('/api/v1/tables', 'GET', null, tokens.cashier, 'cashier-device-1');
        console.log('Status (Expected 200):', test2.status);

        // Verify bind in DB
        const cashierDb = await client.query(`SELECT device_id FROM "${schema}".users WHERE username = 'cashier'`);
        console.log('DB bound device_id for cashier:', cashierDb.rows[0].device_id);

        // Test 3: Device Mismatch (Cashier requesting with device-2)
        console.log('\n=== Test 3: Requesting with mismatched device ID for Cashier ===');
        const test3 = await request('/api/v1/tables', 'GET', null, tokens.cashier, 'cashier-device-2');
        console.log('Status (Expected 403):', test3.status);
        console.log('Body (Expected DEVICE_MISMATCH error):', test3.body);

        // Test 4: Binding Waiter to waiter-device-1
        console.log('\n=== Test 4: Binding Waiter to waiter-device-1 ===');
        const test4 = await request('/api/v1/tables', 'GET', null, tokens.waiter, 'waiter-device-1');
        console.log('Status (Expected 200):', test4.status);

        // Test 5: Binding Kitchen to kitchen-device-1
        console.log('\n=== Test 5: Binding Kitchen to kitchen-device-1 ===');
        const test5 = await request('/api/v1/tables', 'GET', null, tokens.kitchen, 'kitchen-device-1');
        console.log('Status (Expected 200):', test5.status);

        // Now, userDeviceCount distinctCount is 3.
        // Let's create a temporary user in the database to try to bind a 4th device, which should hit the limit.
        console.log('\n=== Test 6: Creating 4th operational user and testing quota exceed ===');
        // Let's insert a waiter2 user
        await client.query(`
            INSERT INTO "${schema}".users (username, password_hash, role, pin_code, status, name)
            VALUES ('waiter2', '$2a$10$xyz', 'waiter', '1234', 'active', 'Waiter Two')
            ON CONFLICT (username) DO NOTHING
        `);
        
        // Let's copy waiter's password_hash to waiter2
        const waiterHashRes = await client.query(`SELECT password_hash FROM "${schema}".users WHERE username = 'waiter'`);
        const pwh = waiterHashRes.rows[0].password_hash;
        await client.query(`UPDATE "${schema}".users SET password_hash = $1 WHERE username = 'waiter2'`, [pwh]);

        const loginRes3 = await request('/api/v1/auth/login', 'POST', {
            username: 'waiter2',
            password: 'garson123',
            tenantId: TENANT_ID
        }, null, 'waiter2-device-1');

        console.log('Login Status (Expected 403):', loginRes3.status);
        console.log('Login Body (Expected DEVICE_QUOTA):', loginRes3.body);

        if (loginRes3.status === 403 && loginRes3.body?.code === 'DEVICE_QUOTA') {
            console.log('✔ Test 6 passed: Quota successfully blocked login of 4th device!');
        } else {
            console.error('❌ Test 6 failed: Login did not block device quota correctly.');
        }

        // Let's clean up waiter2
        await client.query(`DELETE FROM "${schema}".users WHERE username = 'waiter2'`);
        console.log('\n=== Cleanup completed ===');

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        console.log('\n=== Restoring original plan limits ===');
        try {
            await client.query(`UPDATE public.subscription_plans SET max_devices = 9 WHERE code = 'enterprise'`);
            await client.query(`UPDATE public.tenant_modules SET is_active = true WHERE tenant_id = $1::text AND module_code = 'extra_device'`, [TENANT_ID]);
            console.log('Database limits restored successfully.');
        } catch (restoreErr) {
            console.error('Failed to restore database limits:', restoreErr);
        }
        await client.end();
    }
}

run().catch(console.error);
