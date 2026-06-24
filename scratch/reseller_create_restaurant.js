const http = require('node:http');
const https = require('node:https');
const { Client } = require('pg');

const API_BASE = 'http://127.0.0.1:3101';
const DB_CONN = 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos';

async function request(url, method, body, token, tenantId) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const data = body ? JSON.stringify(body) : '';
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(tenantId ? { 'x-tenant-id': tenantId } : {})
        };
        if (data) {
            headers['Content-Length'] = Buffer.byteLength(data);
        }

        const requester = u.protocol === 'https:' ? https : http;
        const req = requester.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
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
    console.log('=== Step 1: Reseller Login ===');
    const loginRes = await request(`${API_BASE}/api/v1/auth/login/saas`, 'POST', {
        username: 'demo_reseller',
        password: 'reseller123'
    });

    if (loginRes.status !== 200) {
        console.error('Failed to log in as reseller:', loginRes.body);
        process.exit(1);
    }
    
    const resellerToken = loginRes.body.accessToken;
    console.log('Reseller Logged In. Wallet Balance:', loginRes.body.user.wallet_balance);

    console.log('\n=== Step 2: Create Restaurant (Enterprise, All Modules, Direct Sale) ===');
    const tenantPayload = {
        name: 'Antigravity Cafe',
        schema_name: 'tenant_antigravity_cafe',
        contact_email: 'cafe@antigravity.io',
        contact_phone: '+905553332211',
        authorized_person: 'Antigravity Owner',
        tax_office: 'Cologne',
        tax_number: '9876543210',
        address: 'Neumarkt 15, Köln',
        subscription_plan: 'enterprise',
        license_usage_type: 'direct_sale',
        payment_interval: 'monthly',
        payment_method: 'wallet_balance',
        admin_username: 'admin',
        master_password: 'admin123',
        module_codes: [
            "multi_language",
            "kitchen_display",
            "queue_display",
            "cloud_backup",
            "waiter_tablet",
            "qr_menu",
            "qr_web_menu",
            "courier_module",
            "customer_crm",
            "advanced_reports",
            "fiscal_tse",
            "api_access",
            "extra_device",
            "extra_printer",
            "support_standard",
            "support_priority",
            "whatsapp_orders",
            "caller_id_android"
        ],
        extra_device_qty: 1,
        extra_printer_qty: 1
    };

    const createRes = await request(`${API_BASE}/api/v1/tenants`, 'POST', tenantPayload, resellerToken);
    console.log('Tenant Creation API Audit Status:', createRes.status);
    console.log('Tenant Creation API Audit Response:', JSON.stringify(createRes.body, null, 2));

    if (createRes.status !== 201) {
        console.error('Failed to create tenant!');
        process.exit(1);
    }

    const tenantId = createRes.body.tenant.id;
    console.log('Created Tenant ID:', tenantId);

    console.log('\n=== Step 3: Tenant Admin Login ===');
    const adminLoginRes = await request(`${API_BASE}/api/v1/auth/login`, 'POST', {
        username: 'admin',
        password: 'admin123',
        tenantId: tenantId
    });

    if (adminLoginRes.status !== 200) {
        console.error('Failed to log in as tenant admin:', adminLoginRes.body);
        process.exit(1);
    }

    const adminToken = adminLoginRes.body.accessToken;
    console.log('Tenant Admin Logged In.');

    console.log('\n=== Step 4: Seed Demo Data ===');
    const seedRes = await request(`${API_BASE}/api/v1/admin/settings/demo-seed`, 'POST', {
        confirmReset: true,
        preset: 'restaurant_courier'
    }, adminToken, tenantId);

    console.log('Seed Demo Data Response Status:', seedRes.status);
    console.log('Seed Demo Data Response Body:', seedRes.body);

    if (seedRes.status !== 200) {
        console.error('Failed to seed demo data!');
        process.exit(1);
    }

    console.log('\n=== Step 5: Database Verification ===');
    const client = new Client({ connectionString: DB_CONN });
    await client.connect();
    try {
        const schema = 'tenant_antigravity_cafe';
        console.log(`Checking DB tables in schema: ${schema}...`);

        // Check products
        const productsCount = await client.query(`SELECT COUNT(*)::int as count FROM "${schema}".products`);
        console.log('Products Count:', productsCount.rows[0].count);

        // Check categories
        const categoriesCount = await client.query(`SELECT COUNT(*)::int as count FROM "${schema}".categories`);
        console.log('Categories Count:', categoriesCount.rows[0].count);

        // Check tables
        const tablesCount = await client.query(`SELECT COUNT(*)::int as count FROM "${schema}".tables`);
        console.log('Tables Count:', tablesCount.rows[0].count);

        // Check tenant entitlements in public
        const entitlements = await client.query(
            `SELECT module_code, is_active FROM public.tenant_modules WHERE tenant_id = $1::uuid`,
            [tenantId]
        );
        console.log('\nTenant Entitlements count in public schema:', entitlements.rows.length);
        console.log(entitlements.rows);

        // Check wallet balance
        const balance = await client.query(
            `SELECT wallet_balance FROM public.saas_admins WHERE username = 'demo_reseller'`
        );
        console.log('\nReseller wallet balance after transaction:', balance.rows[0].wallet_balance);
        
        // Check billing record in public.tenant_billing
        const billing = await client.query(
            `SELECT plan_code, billing_cycle, monthly_recurring_total FROM public.tenant_billing WHERE tenant_id = $1::uuid`,
            [tenantId]
        );
        console.log('\nTenant billing details:', billing.rows[0]);

        console.log('\nAll steps completed successfully!');
    } catch (dbErr) {
        console.error('DB Error:', dbErr);
    } finally {
        await client.end();
    }
}

run().catch(console.error);
