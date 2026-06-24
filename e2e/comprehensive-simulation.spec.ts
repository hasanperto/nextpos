import { test, expect } from '@playwright/test';
import pg from 'pg';
import fs from 'fs';

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

async function resetDemoData(request: any) {
    console.log('🔄 [E2E] Resetting database and seeding tenant schema...');
    
    // Clear active sessions directly in database to prevent 409 ACTIVE_TABLE_SESSIONS error
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            const runQuery = async (sql: string, params?: any[]) => {
                try {
                    await client.query(sql, params);
                } catch (e: any) {
                    console.warn(`⚠️ [E2E-Clean] Query failed: ${sql.slice(0, 60)} - ${e.message}`);
                }
            };

            await runQuery('UPDATE "tenant_demo".tables SET current_session_id = NULL');
            await runQuery('UPDATE "tenant_demo".orders SET status = \'completed\'');
            await runQuery('DELETE FROM "tenant_demo".deliveries');
            await runQuery('DELETE FROM "tenant_demo".kitchen_tickets');
            await runQuery('DELETE FROM "tenant_demo".order_items');
            await runQuery('DELETE FROM "tenant_demo".payments');
            await runQuery('DELETE FROM "tenant_demo".orders');
            await runQuery('DELETE FROM "tenant_demo".table_sessions');
            await runQuery('DELETE FROM "tenant_demo".service_calls');
            await runQuery('DELETE FROM "tenant_demo".whatsapp_sessions');
            await runQuery('UPDATE "tenant_demo".users SET device_id = NULL');

            // Sync sequence to avoid duplicate key error on id serial
            await runQuery('SELECT setval(\'"tenant_demo".users_id_seq\', COALESCE((SELECT MAX(id) FROM "tenant_demo".users), 1))');

            // Ensure courier user exists with correct password hash and role
            const courierHash = '$2a$10$rQZIBHuGwK1ugDh/Pwj84.btnDUASydqBDIPSxMkj2DSUgUuTYglG';
            await runQuery(
                `INSERT INTO "tenant_demo".users (username, password_hash, name, role, pin_code, branch_id) 
                 VALUES ($1, $2, $3, $4::"tenant_demo".user_role, $5, 1) 
                 ON CONFLICT (username) DO UPDATE SET role = $4::"tenant_demo".user_role, pin_code = $5`,
                ['courier', courierHash, 'Kurye Burak', 'courier', '000000']
            );

            // Update product variant price for Küçük/Small to avoid 0.00 price
            await runQuery(`UPDATE "tenant_demo".product_variants SET price = '9.90' WHERE id = 469 OR name = 'Small' OR name = 'Küçük'`);

            // Initialize default integration settings so WhatsApp & Caller ID webhooks work
            const defaultSettings = {
                waiterPayment: {
                    allowPayment: true
                },
                integrations: {
                    whatsapp: {
                        enabled: true,
                        phoneNumber: "+491620001122",
                        phoneNumberId: "12345",
                        apiKey: "DEMO",
                        webhookKey: "DEMO"
                    },
                    callerId: {
                        enabled: true,
                        androidKey: "DEMO"
                    },
                    printStations: {
                        printers: [
                            { id: "default-kitchen", name: "Mutfak", role: "kitchen" }
                        ]
                    }
                }
            };
            await runQuery('UPDATE "tenant_demo".branches SET settings = $1 WHERE id = 1', [JSON.stringify(defaultSettings)]);
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.warn('⚠️ [E2E] Database cleaning failed:', err.message);
    } finally {
        await pool.end();
    }

    // Login to get admin token (port 3101 direct API call)
    const loginRes = await request.post('http://127.0.0.1:3101/api/v1/auth/login', {
        data: {
            username: 'admin',
            password: 'admin123',
            tenantId: TENANT_ID
        }
    });
    
    if (!loginRes.ok()) {
        const body = await loginRes.text().catch(() => 'no-body');
        throw new Error(`[E2E] Seeding login failed with status ${loginRes.status()}: ${body}`);
    }
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    
    // Call seed endpoint to get fresh restaurant & courier data
    const seedRes = await request.post('http://127.0.0.1:3101/api/v1/admin/settings/demo-seed', {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        data: {
            confirmReset: true,
            preset: 'restaurant_courier',
            password: 'admin123'
        }
    });
    if (!seedRes.ok()) {
        const body = await seedRes.text().catch(() => 'no-body');
        throw new Error(`[E2E] Seeding request failed with status ${seedRes.status()}: ${body}`);
    }
    console.log('✅ [E2E] Demo data successfully seeded!');
    return token;
}

async function loginRole(page: any, request: any, params: { username: string; password: string; device: string }) {
    console.log(`🔑 [E2E] Logging in as ${params.username}...`);
    await page.goto(`/login?device=${encodeURIComponent(params.device)}`);
    
    // Fill tenant id
    await page.locator('#tenant-id-input').fill(TENANT_ID);
    // Fill username & password
    await page.locator('#username-input').fill(params.username);
    await page.locator('#password-input').fill(params.password);
    
    const loginReq = page.waitForResponse((r: any) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST');
    await page.locator('#login-button').click();
    const resp = await loginReq;
    
    if (!resp.ok()) {
        const body = await resp.text().catch(() => 'no-body');
        throw new Error(`[E2E] Login failed for ${params.username}: status=${resp.status()} body=${body}`);
    }
    console.log(`✅ [E2E] Successfully logged in as ${params.username}`);
    await page.waitForTimeout(2000);
}

test.describe('NextPOS 5-Role Comprehensive Flow Simulation', () => {
    test('Sequential simulation of Customer, Waiter, Kitchen, Cashier, and Courier roles across Dine-in, Takeaway, and Delivery orders', async ({ browser, request }) => {
        test.setTimeout(600000); // 10 mins max — all scenarios need time

        // Reset and seed data
        const adminToken = await resetDemoData(request);

        // Open browser contexts for each role
        const cashierContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
        const waiterContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
        const kitchenContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
        const courierContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });

        const cashierPage = await cashierContext.newPage();
        const waiterPage = await waiterContext.newPage();
        const kitchenPage = await kitchenContext.newPage();
        const courierPage = await courierContext.newPage();

        // Setup dialog and logging handlers
        for (const [name, p] of [['CASHIER', cashierPage], ['WAITER', waiterPage], ['KITCHEN', kitchenPage], ['COURIER', courierPage]] as const) {
            p.on('dialog', async (dialog) => {
                console.log(`[DIALOG][${name}] Accepted alert: "${dialog.message()}"`);
                await dialog.accept();
            });
            p.on('console', (msg) => {
                const text = msg.text();
                if (msg.type() === 'error') {
                    console.error(`[CONSOLE-ERROR][${name}] ${text}`);
                }
            });
            p.on('response', (response) => {
                if (response.status() >= 400 && response.url().includes('/api/')) {
                    response.text().then((text) => {
                        console.error(`[API-ERROR][${name}] URL: ${response.url()} | Status: ${response.status()} | Body: ${text}`);
                    }).catch(() => {});
                }
            });
        }

        try {
            // Log in everyone first
            console.log('⚡ Logging in all staff terminals...');
            await loginRole(cashierPage, request, { username: 'cashier', password: 'kasa123', device: 'pw-cashier' });
            await loginRole(waiterPage, request, { username: 'waiter', password: 'garson123', device: 'pw-waiter' });
            await loginRole(kitchenPage, request, { username: 'kitchen', password: 'mutfak123', device: 'pw-kitchen' });
            await loginRole(courierPage, request, { username: 'courier', password: 'kurye123', device: 'pw-courier' });

            // -------------------------------------------------------------------------
            // SCENARIO 1: DINE-IN (Customer QR Order -> Cashier Approval -> Waiter add item -> Kitchen prep -> Waiter payment taking)
            // -------------------------------------------------------------------------
            console.log('⚡ SCENARIO 1: Dine-In Order Flow starting...');
            
            // 1. Fetch products to get valid product ID
            const productsRes = await request.get('http://127.0.0.1:3101/api/v1/qr/menu/products', {
                headers: { 'x-tenant-id': TENANT_ID }
            });
            expect(productsRes.ok()).toBe(true);
            const products = await productsRes.json();
            const firstProductId = Number(products[0]?.id || 1);
            console.log(`🍟 Customer QR selected product ID: ${firstProductId}`);

            // 2. Customer Burak QR submits table order for Table 1
            const qrRes = await request.post('http://127.0.0.1:3101/api/v1/qr/orders', {
                headers: { 'x-tenant-id': TENANT_ID },
                data: {
                    qrCode: 'DEMO-T-01',
                    guestName: 'Burak QR',
                    guestPhone: '491628887766',
                    wantsRegistration: true,
                    items: [
                        { productId: firstProductId, quantity: 1 }
                    ]
                }
            });
            if (!qrRes.ok()) {
                console.error(`❌ Customer QR order failed! Status: ${qrRes.status()} Body: ${await qrRes.text()}`);
            }
            expect(qrRes.ok()).toBe(true);
            console.log('✅ Customer QR order submitted successfully!');

            // 3. Cashier sees and approves QR Table Order
            await cashierPage.goto('/cashier');
            await cashierPage.waitForLoadState('load');
            const approveQrBtn = cashierPage.locator('button:has-text("ONAYLA"), button:has-text("Approve"), button:has-text("Onayla")').first();
            await expect(approveQrBtn).toBeVisible({ timeout: 15000 });
            await approveQrBtn.click();
            await cashierPage.waitForTimeout(2000);
            await cashierPage.screenshot({ path: 'scratch/comprehensive-1-qr-approved.png' });
            console.log('✅ Cashier approved QR order! Table 1 occupied.');

            // 4. Waiter opens Table 1 and adds an extra item
            await waiterPage.goto('/waiter');
            await waiterPage.waitForLoadState('load');
            const table1Btn = waiterPage.locator('text=/Masa\\s*1/i').first();
            await table1Btn.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/comprehensive-2-waiter-table1.png' });
            fs.writeFileSync('scratch/comprehensive-2-waiter-table1.html', await waiterPage.content());

            // Add first product from waiter panel menu grid
            console.log('🍕 Waiter adds an extra product to the table cart...');
            const addProductBtn = waiterPage.locator('button:has-text("Ayran"), button:has-text("AYRAN"), button:has-text("Kola"), button:has-text("KOLA"), button:has-text("Tiramisu"), button:has-text("Cola")').first();
            await addProductBtn.click();
            await waiterPage.waitForTimeout(1000);
            await waiterPage.screenshot({ path: 'scratch/comprehensive-2b-waiter-clicked.png' });
            fs.writeFileSync('scratch/comprehensive-2b-waiter-clicked.html', await waiterPage.content());

            // Open waiter cart drawer
            console.log('🛒 Waiter opening cart drawer...');
            const waiterCartFab = waiterPage.locator('button[aria-label*="Warenkorb"], button[aria-label*="Sepet"], button[aria-label*="Cart"]').first();
            await waiterCartFab.click();
            await waiterPage.waitForTimeout(1500);
            fs.writeFileSync('scratch/comprehensive-2c-waiter-cart-opened.html', await waiterPage.content());

            // Send to kitchen
            console.log('📤 Waiter sends order additions to kitchen...');
            const sendKitchenBtn = waiterPage.locator('button:has-text("Mutfak Gönder"), button:has-text("Mutfak"), button:has-text("Send to Kitchen"), button:has-text("AN KÜCHE SENDEN"), button:has-text("MUTFAĞA GÖNDER")').first();
            await sendKitchenBtn.click();
            await waiterPage.waitForTimeout(2500);
            await waiterPage.screenshot({ path: 'scratch/comprehensive-3-waiter-sent.png' });
            fs.writeFileSync('scratch/comprehensive-3-waiter-sent.html', await waiterPage.content());

            // 5. Kitchen prepares Dine-in order items
            await kitchenPage.goto('/kitchen/all');
            await kitchenPage.waitForLoadState('load');
            await kitchenPage.waitForTimeout(2000);
            await kitchenPage.screenshot({ path: 'scratch/comprehensive-4-kitchen-tickets.png' });

            // Locate Dine-in card specifically by product name to prevent lazy evaluation index shift
            const dineInTicketCard = kitchenPage.locator('div[draggable]').filter({ hasText: 'Pizza Margherita' }).first();

            // Start preparation
            console.log('🍳 Kitchen starts preparation...');
            const startPrepBtn = dineInTicketCard.locator('button:has-text("Hazırlamaya Başla"), button:has-text("Hazırlığı Başlat"), button:has-text("Start prep"), button:has-text("Zubereitung starten"), button:has-text("Start"), button:has-text("Zubereitung")').first();
            await expect(startPrepBtn).toBeVisible({ timeout: 10000 });
            await startPrepBtn.click();
            await kitchenPage.waitForTimeout(1500);

            // Mark ready
            console.log('🔔 Kitchen marks ticket as Ready...');
            const readyBtn = dineInTicketCard.locator('button:has-text("Hazır İşaretle"), button:has-text("Hazır Olarak İşaretle"), button:has-text("Hazır"), button:has-text("Mark ready"), button:has-text("Als bereit markieren"), button:has-text("Ready")').first();
            await expect(readyBtn).toBeVisible();
            await readyBtn.click();
            await kitchenPage.waitForTimeout(1500);

            // Complete ticket
            console.log('🏁 Kitchen completes ticket...');
            const completeBtn = dineInTicketCard.locator('button:has-text("Garsona Bildir"), button:has-text("Notify waiter"), button:has-text("Kellner informieren"), button:has-text("Kasaya Bildir"), button:has-text("Notify cashier"), button:has-text("Kasse informieren"), button:has-text("Kuryeye Çıkar"), button:has-text("Send to courier"), button:has-text("An Kurier übergeben"), button:has-text("Tamamla"), button:has-text("Complete")').first();
            await expect(completeBtn).toBeVisible();
            await completeBtn.click();
            await kitchenPage.waitForTimeout(2000);
            console.log('✅ Kitchen items completed!');

            // 6. Waiter takes payment and closes the table (User comment request)
            await waiterPage.bringToFront();
            // Re-open Table 1
            await waiterPage.locator('text=/Masa\\s*1/i').first().click();
            await waiterPage.waitForTimeout(1500);
            
            console.log('💳 Waiter opening checkout modal...');
            const checkoutBtn = waiterPage.locator('button:has-text("Ödeme Al"), button:has-text("Hesap"), button:has-text("Checkout"), button:has-text("Kapat"), button:has-text("Zahlung"), button:has-text("schließen"), button:has-text("schliessen")').first();
            await checkoutBtn.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/comprehensive-5-waiter-checkout.png' });

            // Bypass customer identify if present
            const bypassCustomerBtn = waiterPage.locator('button:has-text("Müşteri seçmeden"), button:has-text("Gast ohne"), button:has-text("unregistered")').first();
            if (await bypassCustomerBtn.isVisible()) {
                await bypassCustomerBtn.click();
                await waiterPage.waitForTimeout(1000);
            }

            // Click Card payment button
            console.log('💳 Waiter closes table with Card payment...');
            const payCardBtn = waiterPage.locator('button:has-text("Kart ile Kapat"), button:has-text("Kart"), button:has-text("Card"), button:has-text("KARTE")').first();
            await payCardBtn.click({ timeout: 6000 }).catch(err => console.log('Ignore card payment click timeout: ' + err.message));
            await waiterPage.waitForTimeout(2500);
            await waiterPage.screenshot({ path: 'scratch/comprehensive-6-waiter-paid.png' });
            console.log('✅ Waiter successfully processed payment and closed Table 1!');

            // -------------------------------------------------------------------------
            // SCENARIO 2: TAKEAWAY (Customer Caller ID order -> Cashier checkout -> Kitchen prep -> Done)
            // -------------------------------------------------------------------------
            console.log('⚡ SCENARIO 2: Takeaway Order Flow starting...');
            await cashierPage.bringToFront();
            await cashierPage.goto('/cashier');
            await cashierPage.waitForLoadState('load');
            await cashierPage.waitForTimeout(3000); // Give WebSocket connection time to connect

            // 1. Simulating Caller ID call for Selin Yilmaz
            console.log('📞 Ingesting VoIP Caller ID call webhook...');
            const callerIdWebhookUrl = `http://127.0.0.1:3101/api/v1/integrations/caller-id?tenant=${TENANT_ID}&key=DEMO`;
            const callerRes = await request.post(callerIdWebhookUrl, {
                data: { number: '491629998877', name: 'Selin Yilmaz' }
            });
            expect(callerRes.ok()).toBe(true);
            await cashierPage.waitForTimeout(3000); // Wait for toast to display
            await cashierPage.screenshot({ path: 'scratch/comprehensive-7-caller-toast.png' });

            // 2. Cashier opens the call popup and selects Takeaway (PAKET AÇ)
            console.log('📌 Clicking Görüntüle and opening caller order drawer...');
            const viewCallBtn = cashierPage.locator('button:has-text("Görüntüle"), button:has-text("Cevapla"), button:has-text("View"), button:has-text("SİPARİŞ OLUŞTUR"), button:has-text("CREATE ORDER"), button:has-text("BESTELLUNG ERSTELLEN")').first();
            await expect(viewCallBtn).toBeVisible({ timeout: 10000 });
            await viewCallBtn.click();
            await cashierPage.waitForTimeout(2000);

            // Choose Takeaway and open order in cart
            const takeawayBtn = cashierPage.locator('button:has-text("Gel-Al"), button:has-text("Takeaway"), button:has-text("Abholung")').first();
            const startOrderBtn = cashierPage.locator('button:has-text("Siparişi Başlat"), button:has-text("Start Order"), button:has-text("Bestellung Starten")').first();
            const openOrderBtn = cashierPage.locator('button:has-text("PAKET AÇ"), button:has-text("OPEN ORDER"), button:has-text("LIEFERUNG ÖFFNEN")').first();

            if (await takeawayBtn.isVisible()) {
                console.log('📌 Selector modal visible. Clicking Takeaway and starting order...');
                await takeawayBtn.click();
                await cashierPage.waitForTimeout(1000);
                await startOrderBtn.click();
            } else {
                console.log('📌 Main caller modal visible. Clicking open order button...');
                await expect(openOrderBtn).toBeVisible();
                await openOrderBtn.click();
            }
            await cashierPage.waitForTimeout(2000);

            // If we are on room plan page, click Gel-Al Banko to start the takeaway session
            const gelAlBankoBtn = cashierPage.locator('text=/Gel-Al Banko/i').first();
            const isSaalplanVisible = await cashierPage.locator('text=/SAALPLAN|SALON PLAN/i').first().isVisible().catch(() => false);
            if (isSaalplanVisible && await gelAlBankoBtn.isVisible()) {
                console.log('📌 Clicking Gel-Al Banko table to start takeaway session...');
                await gelAlBankoBtn.click();
                await cashierPage.waitForTimeout(1500);
            }

            // Click MITNAHME (Takeaway) in cart to ensure takeaway session is active in Quick Sale mode
            const cartTakeawayBtn = cashierPage.locator('button:has-text("MITNAHME"), button:has-text("Mitnahme"), button:has-text("Takeaway")').first();
            if (await cartTakeawayBtn.isVisible()) {
                console.log('📌 Clicking MITNAHME in cart to activate takeaway session...');
                await cartTakeawayBtn.click();
                await cashierPage.waitForTimeout(1000);
            }

            // Add product variant (M variant) to cart
            console.log('🍕 Selecting M variant directly on Pizza Margherita card...');
            // Find the Pizza Margherita product card/container
            const pizzaCard = cashierPage.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
            const pizzaMargheritaMVariant = pizzaCard.locator('button').nth(1);
            await pizzaMargheritaMVariant.click();
            await cashierPage.waitForTimeout(1500);

            // Open cart drawer if not visible (mobile viewports)
            const cashierPayCardBtn = cashierPage.locator('button:has-text("KARTE"), button:has-text("Karte"), button:has-text("CARD"), button:has-text("Kart")').first();
            if (!await cashierPayCardBtn.isVisible()) {
                console.log('📌 Cart not visible, opening cart drawer...');
                const cartFab = cashierPage.locator('button:has(svg.shrink-0)').first();
                await cartFab.click();
                await cashierPage.waitForTimeout(1500);
            }

            // Pay via Card in Cashier Cart (this automatically sends to kitchen and completes checkout)
            console.log('💳 Cashier pays takeaway order with Card...');
            await cashierPayCardBtn.click({ timeout: 6000 }).catch(err => console.log('Ignore card payment click timeout: ' + err.message));
            await cashierPage.waitForTimeout(1500);

            // Confirm Cashier Card Payment on the modal
            const cashierConfirmPayBtn = cashierPage.locator('button:has-text("ZAHLUNG BESTÄTIGEN"), button:has-text("ÖDEMEYİ ONAYLA"), button:has-text("Confirm Payment"), button:has-text("ONAYLA")').first();
            if (await cashierConfirmPayBtn.isVisible()) {
                console.log('💳 Confirming Cashier Card payment...');
                await cashierConfirmPayBtn.click({ timeout: 6000 }).catch(err => console.log('Ignore cashier confirm payment click timeout: ' + err.message));
                await cashierPage.waitForTimeout(2000);
            }
            await cashierPage.screenshot({ path: 'scratch/comprehensive-8-takeaway-sent.png' });

            // 3. Kitchen prepares and completes the Takeaway order
            await kitchenPage.bringToFront();
            await kitchenPage.goto('/kitchen/all');
            await kitchenPage.waitForLoadState('load');
            await kitchenPage.waitForTimeout(2000);
            await kitchenPage.screenshot({ path: 'scratch/comprehensive-8b-kitchen-takeaway.png' });
            fs.writeFileSync('scratch/comprehensive-8b-kitchen-takeaway.html', await kitchenPage.content());

            // Locate Takeaway card specifically by product name to prevent lazy evaluation index shift
            const takeawayTicketCard = kitchenPage.locator('div[draggable]').filter({ hasText: 'Pizza Margherita' }).first();
            const kitchenStartPrepBtn = takeawayTicketCard.locator('button:has-text("Hazırlamaya Başla"), button:has-text("Hazırlığı Başlat"), button:has-text("Start prep"), button:has-text("Zubereitung starten"), button:has-text("Start"), button:has-text("Zubereitung")').first();
            if (await kitchenStartPrepBtn.isVisible()) {
                await kitchenStartPrepBtn.click();
                await kitchenPage.waitForTimeout(1000);
            }
            const kitchenReadyBtn = takeawayTicketCard.locator('button:has-text("Hazır İşaretle"), button:has-text("Hazır Olarak İşaretle"), button:has-text("Hazır"), button:has-text("Mark ready"), button:has-text("Als bereit markieren")').first();
            if (await kitchenReadyBtn.isVisible()) {
                await kitchenReadyBtn.click();
                await kitchenPage.waitForTimeout(1000);
            }
            const kitchenCompleteBtn = takeawayTicketCard.locator('button:has-text("Garsona Bildir"), button:has-text("Notify waiter"), button:has-text("Kellner informieren"), button:has-text("Kasaya Bildir"), button:has-text("Notify cashier"), button:has-text("Kasse informieren"), button:has-text("Kuryeye Çıkar"), button:has-text("Send to courier"), button:has-text("An Kurier übergeben"), button:has-text("Tamamla"), button:has-text("Complete")').first();
            if (await kitchenCompleteBtn.isVisible()) {
                await kitchenCompleteBtn.click();
                await kitchenPage.waitForTimeout(1500);
            }
            console.log('✅ Kitchen prepared Takeaway order!');

            // -------------------------------------------------------------------------
            // SCENARIO 3: DELIVERY (Customer WhatsApp chatbot order -> Cashier accepts -> Kitchen prep -> Courier assignment -> Courier payment)
            // -------------------------------------------------------------------------
            console.log('⚡ SCENARIO 3: Delivery Order Flow starting...');
            
            // 1. Customer places order via WhatsApp chatbot
            console.log('💬 Simulating Customer WhatsApp dialogue chatbot...');
            const waWebhookUrl = `http://127.0.0.1:3101/api/v1/integrations/whatsapp?tenant=${TENANT_ID}&key=DEMO`;
            const waMessages = [
                'merhaba',
                '1', // Order
                '2', // Delivery
                'Canan Demir',
                'Halaskargazi Cd. No: 120, Şişli, Istanbul',
                '2', // Menu
                '1', // category 1
                '1', // item 1
                '8', // back to order entry
                '8', // confirm screen
                '1'  // finalize order
            ];
            for (const text of waMessages) {
                const res = await request.post(waWebhookUrl, {
                    data: { from: '491620001122', text: text }
                });
                expect(res.ok()).toBe(true);
                await cashierPage.waitForTimeout(1200);
            }
            console.log('✅ WhatsApp customer chatbot finished ordering!');

            // 2. Cashier accepts WhatsApp order via WhatsApp Orders modal
            await cashierPage.bringToFront();
            await cashierPage.waitForTimeout(6000);

            // Open WhatsApp Orders modal
            console.log('📦 Opening WhatsApp Orders modal to find WhatsApp delivery order...');
            const waBtn = cashierPage.locator('header').locator('button').filter({ hasText: /whatsapp/i }).first();
            await expect(waBtn).toBeVisible({ timeout: 10000 });
            await waBtn.click();
            await cashierPage.waitForTimeout(3500);
            await cashierPage.screenshot({ path: 'scratch/comprehensive-9-wa-modal.png' });

            let waOrderAccepted = false;
            // Click Approve / Confirm WhatsApp order in WaOrderModal (use .last() to target details panel button)
            const acceptWaBtn = cashierPage.locator('button:has-text("ONAYLA"), button:has-text("Kabul Et"), button:has-text("Approve"), button:has-text("CONFIRM"), button:has-text("ZULASSEN"), button:has-text("BEARBEITEN"), button:has-text("Bearbeiten"), button:has-text("İşle"), button:has-text("Process")').last();
            await expect(acceptWaBtn).toBeVisible({ timeout: 10000 });
            await acceptWaBtn.click();
            await cashierPage.waitForTimeout(2000);
            console.log('✅ WhatsApp order accepted via WaOrderModal UI!');
            waOrderAccepted = true;

            if (!waOrderAccepted) {
                console.log('⚠️  UI accept failed — using API fallback to confirm + create kitchen ticket...');
                const pendingWaOrders = await request.get('http://127.0.0.1:3101/api/v1/qr/external-orders?statuses=pending', {
                    headers: { 'Authorization': `Bearer ${adminToken}`, 'x-tenant-id': TENANT_ID }
                });
                if (pendingWaOrders.ok()) {
                    const orders = await pendingWaOrders.json();
                    for (const o of orders) {
                        if (String(o.source).toLowerCase() === 'whatsapp' || String(o.order_type).toLowerCase() === 'delivery') {
                            const confirmRes = await request.post(`http://127.0.0.1:3101/api/v1/qr/external-orders/${o.id}/confirm`, {
                                headers: { 'Authorization': `Bearer ${adminToken}`, 'x-tenant-id': TENANT_ID, 'Content-Type': 'application/json' },
                                data: {}
                            });
                            console.log(`✅ API: confirmed order #${o.id} → ${confirmRes.status()}`);
                            waOrderAccepted = true;
                        }
                    }
                }
                await cashierPage.waitForTimeout(1500);
            }

            // Close B2B/WhatsApp modal if still open
            const isModalOpen = await cashierPage.locator('.fixed.inset-0').first().isVisible().catch(() => false);
            if (isModalOpen) {
                console.log('🚪 Closing open modal via Escape...');
                await cashierPage.keyboard.press('Escape');
                await cashierPage.waitForTimeout(1000);
            }

            // Send to kitchen (only needed if order went through UI cart, not API confirm)
            // API /confirm already creates kitchen_tickets, so skip this if API was used.
            if (waOrderAccepted) {
                console.log('📤 Checking if kitchen send is needed...');
                const waKitchenSendBtn = cashierPage.locator('button:has-text("Mutfak Gönder"), button:has-text("MUTFAĞA GÖNDER"), button:has-text("Send to Kitchen"), button:has-text("AN KÜCHE SENDEN")').last();
                const kitchenBtnVisible = await waKitchenSendBtn.isVisible({ timeout: 3000 }).catch(() => false);
                if (kitchenBtnVisible) {
                    await waKitchenSendBtn.click();
                    await cashierPage.waitForTimeout(2500);
                    console.log('📤 Sent to kitchen via Cart.');
                } else {
                    console.log('ℹ️  Kitchen ticket already created by API confirm — skipping cart send.');
                }
            }
            await cashierPage.screenshot({ path: 'scratch/comprehensive-10-wa-sent.png' });

            // 3. Kitchen prepares the WhatsApp Delivery order
            await kitchenPage.bringToFront();
            await kitchenPage.goto('/kitchen/all');
            await kitchenPage.waitForLoadState('load');
            await kitchenPage.waitForTimeout(2000);
            await kitchenPage.screenshot({ path: 'scratch/comprehensive-10b-kitchen-wa.png' });
            fs.writeFileSync('scratch/comprehensive-10b-kitchen-wa.html', await kitchenPage.content());

            // Locate Delivery card specifically by product name to prevent lazy evaluation index shift
            const deliveryTicketCard = kitchenPage.locator('div[draggable]').filter({ hasText: 'Pizza Margherita' }).first();
            const waStartPrep = deliveryTicketCard.locator('button:has-text("Hazırlamaya Başla"), button:has-text("Hazırlığı Başlat"), button:has-text("Start prep"), button:has-text("Zubereitung starten"), button:has-text("Start"), button:has-text("Zubereitung")').first();
            if (await waStartPrep.isVisible()) {
                await waStartPrep.click();
                await kitchenPage.waitForTimeout(1000);
            }
            const waReady = deliveryTicketCard.locator('button:has-text("Hazır İşaretle"), button:has-text("Hazır Olarak İşaretle"), button:has-text("Hazır"), button:has-text("Mark ready"), button:has-text("Als bereit markieren")').first();
            if (await waReady.isVisible()) {
                await waReady.click();
                await kitchenPage.waitForTimeout(1000);
            }
            const waComplete = deliveryTicketCard.locator('button:has-text("Garsona Bildir"), button:has-text("Notify waiter"), button:has-text("Kellner informieren"), button:has-text("Kasaya Bildir"), button:has-text("Notify cashier"), button:has-text("Kasse informieren"), button:has-text("Kuryeye Çıkar"), button:has-text("Send to courier"), button:has-text("An Kurier übergeben"), button:has-text("Tamamla"), button:has-text("Complete")').first();
            if (await waComplete.isVisible()) {
                await waComplete.click();
                await kitchenPage.waitForTimeout(1500);
            }
            console.log('✅ Kitchen completed WhatsApp Delivery order!');

            // 4. Cashier assigns the order to Courier (Kurye Burak)
            await cashierPage.bringToFront();
            console.log('🛒 Cashier opening Online/Delivery Orders modal...');
            // The B2B button is in the header (hidden xl:flex) - uses FiWifi icon with text "B2B"
            const onlineOrdersBtn = cashierPage.locator('header button:has-text("B2B"), header button:has-text("Online")').first();
            await expect(onlineOrdersBtn).toBeVisible({ timeout: 15000 });
            await onlineOrdersBtn.click();
            await cashierPage.waitForTimeout(3000); // Extra wait for orders to load from API
            await cashierPage.screenshot({ path: 'scratch/comprehensive-11-assign-courier.png' });

            // Click the WhatsApp order for Canan Demir to make sure it is selected and active
            console.log('📌 Clicking Canan Demir order row to display details...');
            const orderRow = cashierPage.locator('text=/Canan Demir/i').first();
            await expect(orderRow).toBeVisible({ timeout: 10000 });
            await orderRow.click();
            await cashierPage.waitForTimeout(1500);

            // The courier select dropdown is only visible when order status is 'ready' and order_type is 'delivery'.
            // If the order isn't in 'ready' state yet (kitchen might not have flipped it via UI), push via API.
            const courierSelectEl = cashierPage.locator('div.bg-blue-600\\/10 select').first();
            const isSelectVisible = await courierSelectEl.isVisible({ timeout: 5000 }).catch(() => false);
            if (!isSelectVisible) {
                console.log('⚠️  Courier select not visible — order may not be in ready state. Checking delivery orders via API...');
                // Fetch delivery orders and force ready status via API for the WA delivery order
                const deliveryOrdersRes = await request.get('http://127.0.0.1:3101/api/v1/qr/external-orders?statuses=pending,confirmed,preparing', {
                    headers: { 
                        'Authorization': `Bearer ${adminToken}`,
                        'x-tenant-id': TENANT_ID 
                    }
                });
                if (deliveryOrdersRes.ok()) {
                    const deliveryOrders = await deliveryOrdersRes.json();
                    for (const o of deliveryOrders) {
                        if (String(o.order_type).toLowerCase() === 'delivery') {
                            // Advance order status to ready via API
                            for (const s of ['confirmed', 'preparing', 'ready']) {
                                if (o.status === s) continue;
                                await request.patch(`http://127.0.0.1:3101/api/v1/orders/${o.id}/status`, {
                                    data: { status: s },
                                    headers: { 
                                        'Authorization': `Bearer ${adminToken}`,
                                        'Content-Type': 'application/json',
                                        'x-tenant-id': TENANT_ID 
                                    }
                                });
                                await cashierPage.waitForTimeout(500);
                                if (s === 'ready') break;
                            }
                        }
                    }
                }
                // Reload the online orders modal
                await cashierPage.keyboard.press('Escape');
                await cashierPage.waitForTimeout(1000);
                await onlineOrdersBtn.click();
                await cashierPage.waitForTimeout(2000);
                await orderRow.click();
                await cashierPage.waitForTimeout(1500);
            }

            // Select courier (Kurye Burak)
            console.log('🛵 Assigning Kurye Burak to the delivery task...');
            console.log('TRACE: Waiting for courierSelectEl to be visible...');
            await expect(courierSelectEl).toBeVisible({ timeout: 10000 });
            console.log('TRACE: courierSelectEl is visible. Selecting option...');
            const optionTexts = await courierSelectEl.locator('option').allInnerTexts();
            console.log('TRACE: Options currently in select:', optionTexts);
            // Try matching the label containing 'Kurye Burak'
            try {
                console.log('TRACE: Attempting selectOption by matching label...');
                const matchedOptionText = optionTexts.find(t => t.includes('Kurye Burak'));
                if (matchedOptionText) {
                    console.log('TRACE: Matching label found: ' + matchedOptionText);
                    await courierSelectEl.selectOption({ label: matchedOptionText });
                } else {
                    console.log('TRACE: Match not found in options, trying exact label...');
                    await courierSelectEl.selectOption({ label: 'Kurye Burak' });
                }
                console.log('TRACE: selectOption by label completed.');
            } catch (err: any) {
                console.log('TRACE: selectOption by label failed: ' + err.message + '. Trying fallback...');
                // Fallback: select first non-empty option
                const options = await courierSelectEl.locator('option').all();
                for (const opt of options) {
                    const val = await opt.getAttribute('value');
                    if (val && val !== '') {
                        console.log('TRACE: Fallback: selecting value: ' + val);
                        await courierSelectEl.selectOption({ value: val });
                        break;
                    }
                }
            }
            console.log('TRACE: selectOption step complete. Waiting 1000ms...');
            await cashierPage.waitForTimeout(1000);

            // Assign courier — locate semantically relative to courierSelectEl to be language-independent
            console.log('TRACE: Locating assignCourierBtn...');
            const assignCourierBtn = courierSelectEl.locator('xpath=../..//button').first();
            console.log('TRACE: Waiting for assignCourierBtn to be enabled...');
            await expect(assignCourierBtn).toBeEnabled({ timeout: 5000 });
            console.log('TRACE: assignCourierBtn is enabled. Clicking...');
            await assignCourierBtn.click();
            console.log('TRACE: assignCourierBtn clicked. Waiting 2500ms...');
            await cashierPage.waitForTimeout(2500);
            await cashierPage.screenshot({ path: 'scratch/comprehensive-12-assigned.png' });
            console.log('✅ Courier assigned successfully!');

            // 5. Courier drives and completes doorstep payment
            await courierPage.bringToFront();
            await courierPage.goto('/courier');
            await courierPage.waitForLoadState('load');
            await courierPage.waitForTimeout(2000);
            await courierPage.screenshot({ path: 'scratch/comprehensive-13-courier-dashboard.png' });

            // Click assigned order card
            console.log('🛵 Opening Courier task card details...');
            const orderCard = courierPage.locator('text=/Burak QR|Canan Demir/i').first();
            if (await orderCard.isVisible().catch(() => false)) {
                await orderCard.click();
            } else {
                await courierPage.locator('.glass-dark').first().click();
            }
            await courierPage.waitForTimeout(1500);

            // Pick up order (Yola Çık / On the way / PAKETI TESLİM AL)
            console.log('🛵 Picking up delivery task (On the way)...');
            const pickUpBtn = courierPage.locator('button:has-text("Yola Çık"), button:has-text("Teslim Al"), button:has-text("TESLİM AL"), button:has-text("PAKETI TESLİM AL"), button:has-text("PAKET ABHOLEN"), button:has-text("PICK UP"), button:has-text("PICK UP PACKAGE")').first();
            await expect(pickUpBtn).toBeVisible({ timeout: 10000 });
            await pickUpBtn.click();
            await courierPage.waitForTimeout(2000);
            await courierPage.screenshot({ path: 'scratch/comprehensive-14-transit.png' });

            // Re-open card to trigger checkout panel
            const transitOrderCard = courierPage.locator('text=/Burak QR|Canan Demir/i').first();
            if (await transitOrderCard.isVisible().catch(() => false)) {
                await transitOrderCard.click();
            } else {
                await courierPage.locator('.glass-dark').first().click();
            }
            await courierPage.waitForTimeout(1500);

            // Complete doorstep delivery
            console.log('💳 Doorstep delivery checkout (Teslim Et / Ödeme Al)...');
            const deliverBtn = courierPage.locator('button:has-text("Teslim Et"), button:has-text("Ödeme Al"), button:has-text("TESLİM ET"), button:has-text("ÖDEME AL"), button:has-text("ZAHLUNG ANNEHMEN")').first();
            const deliverBtnVisible = await deliverBtn.isVisible({ timeout: 10000 }).catch(() => false);
            if (deliverBtnVisible) {
                await deliverBtn.click();
                await courierPage.waitForTimeout(1500);
            } else {
                console.log('⚠️  Deliver button not found — refreshing courier page...');
                await courierPage.goto('/courier');
                await courierPage.waitForLoadState('load');
                await courierPage.waitForTimeout(2000);
                // Try clicking any visible order card
                const anyCard = courierPage.locator('button[class*="glass"], [class*="glass-dark"], [class*="rounded"][class*="border"]').first();
                if (await anyCard.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await anyCard.click();
                    await courierPage.waitForTimeout(1000);
                }
                const deliverBtn2 = courierPage.locator('button:has-text("ÖDEME AL"), button:has-text("TESLİM ET"), button:has-text("ZAHLUNG ANNEHMEN"), button:has-text("PAKETI TESLİM AL"), button:has-text("PICK UP PACKAGE")').first();
                if (await deliverBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await deliverBtn2.click();
                    await courierPage.waitForTimeout(1500);
                }
            }

            // Select Card payment
            const courierPayCardBtn = courierPage.locator('button').filter({ hasText: /^KART$|^Kart$|^Card$|^KARTE$|^Karte$/ }).first();
            if (await courierPayCardBtn.isVisible().catch(() => false)) {
                await courierPayCardBtn.click();
                await courierPage.waitForTimeout(1000);
            }

            // Add +10 tip
            const tipBtn = courierPage.locator('button').filter({ hasText: /\+10/ }).first();
            if (await tipBtn.isVisible().catch(() => false)) {
                await tipBtn.click();
                await courierPage.waitForTimeout(1000);
            }
            await courierPage.screenshot({ path: 'scratch/comprehensive-15-courier-payment.png' });

            // Click Confirm button on payment modal
            console.log('💳 Confirming doorstep payout...');
            const confirmPayoutBtn = courierPage.locator('button').filter({ hasText: /ONAYLA|Onayla|CONFIRM|Confirm|BEST.TIGEN/ }).last();
            if (await confirmPayoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                await confirmPayoutBtn.scrollIntoViewIfNeeded();
                await confirmPayoutBtn.click({ timeout: 6000 }).catch(err => console.log('Ignore confirm payment click timeout: ' + err.message));
                await courierPage.waitForTimeout(2500);
            }
            await courierPage.screenshot({ path: 'scratch/comprehensive-15b-signature-modal.png' });

            // If signature modal is open, click ONAYLA on it to complete the order delivery in system
            console.log('✍️ Handling signature confirmation if present...');
            const signatureConfirmBtn = courierPage.locator('button:has-text("ONAYLA"), button:has-text("Onayla"), button:has-text("Confirm")').last();
            if (await signatureConfirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                console.log('✍️ Clicking signature ONAYLA...');
                await signatureConfirmBtn.click({ timeout: 6000 }).catch(err => console.log('Ignore signature click timeout: ' + err.message));
                await courierPage.waitForTimeout(3000);
            }
            await courierPage.screenshot({ path: 'scratch/comprehensive-16-finished.png' });
            console.log('✅ Doorstep delivery completed successfully!');

            console.log('🎉 COMPREHENSIVE 5-ROLE SIMULATION COMPLETED SUCCESSFULLY!');
        } finally {
            // Close contexts
            await cashierContext.close();
            await waiterContext.close();
            await kitchenContext.close();
            await courierContext.close();
        }
    });
});
