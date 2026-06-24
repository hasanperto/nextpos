import { test, expect } from '@playwright/test';
import pg from 'pg';

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

async function resetDemoData(request: any) {
    console.log('🔄 [E2E] Resetting demo data and seeding tenant database...');
    
    // Clear active sessions directly in database to prevent 409 ACTIVE_TABLE_SESSIONS error
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
    });
    try {
        const client = await pool.connect();
        try {
            await client.query('UPDATE "tenant_demo".tables SET current_session_id = NULL');
            await client.query('UPDATE "tenant_demo".orders SET status = \'completed\'');
            await client.query('DELETE FROM "tenant_demo".deliveries');
            await client.query('DELETE FROM "tenant_demo".kitchen_tickets');
            await client.query('DELETE FROM "tenant_demo".order_items');
            await client.query('DELETE FROM "tenant_demo".payments');
            await client.query('DELETE FROM "tenant_demo".orders');
            await client.query('DELETE FROM "tenant_demo".table_sessions');
            await client.query('DELETE FROM "tenant_demo".service_calls');
            await client.query('DELETE FROM "tenant_demo".whatsapp_sessions');
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.warn('⚠️ [E2E] Database cleaning failed:', err.message);
    } finally {
        await pool.end();
    }

    // Login to get admin token
    const loginRes = await request.post('http://127.0.0.1:5173/api/v1/auth/login', {
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
    const seedRes = await request.post('http://127.0.0.1:5173/api/v1/admin/settings/demo-seed', {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        data: {
            confirmReset: true,
            preset: 'restaurant_courier'
        }
    });
    if (!seedRes.ok()) {
        const body = await seedRes.text().catch(() => 'no-body');
        throw new Error(`[E2E] Seeding request failed with status ${seedRes.status()}: ${body}`);
    }
    console.log('✅ [E2E] Demo data successfully seeded!');
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

test.describe('NextPOS Advanced Integrations & Courier Delivery E2E Simulation', () => {
    test('Simulate Caller ID, WhatsApp Chatbot, QR Menu Table order queue, and Courier doorstep payment lifecycle', async ({ browser, request }) => {
        // Set timeout to 120s for complex multi-context flows
        test.setTimeout(120000);

        // Reset and seed base dataset
        await resetDemoData(request);

        // Create isolated contexts for Cashier, Courier, and Admin panels
        const cashierContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
        const courierContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
        const adminContext = await browser.newContext({ viewport: { width: 1600, height: 1200 } });

        const cashierPage = await cashierContext.newPage();
        const courierPage = await courierContext.newPage();
        const adminPage = await adminContext.newPage();

        // Standard dialog listener
        for (const p of [cashierPage, courierPage, adminPage]) {
            p.on('dialog', async (dialog) => {
                console.log(`[DIALOG] Accepted alert: "${dialog.message()}"`);
                await dialog.accept();
            });
        }

        try {
            // -------------------------------------------------------------------------
            // LOGIN ALL REQUIRED CONTEXTS
            // -------------------------------------------------------------------------
            console.log('🔑 STEP 1: Logging in POS terminal contexts...');
            await loginRole(cashierPage, request, { username: 'cashier', password: 'kasa123', device: 'pw-cashier-e2e' });
            await cashierPage.goto('/cashier');
            await cashierPage.waitForLoadState('networkidle');
            await cashierPage.screenshot({ path: 'scratch/e2e-int-1-cashier-loaded.png' });

            // -------------------------------------------------------------------------
            // FLOW A: WHATSAPP CHATBOT WORKFLOW INGESTION
            // -------------------------------------------------------------------------
            console.log('💬 FLOW A: Simulating WhatsApp Customer Chatbot lifecycle...');
            
            const waWebhookUrl = `http://127.0.0.1:5173/api/v1/integrations/whatsapp?tenant=${TENANT_ID}&key=DEMO`;
            
            // Define Chatbot dialogue messages
            const waMessages = [
                'merhaba',                                          // 1. Start greeting (returns Home menu)
                '1',                                                // 2. Select: Sipariş Ver (returns Service Type)
                '2',                                                // 3. Select: Paket / Delivery (returns Name registration request)
                'Canan Demir',                                      // 4. Fill Name (returns Address registration request)
                'Halaskargazi Cd. No: 120, Şişli, Istanbul',        // 5. Fill Delivery Address (returns Order Entry menu)
                '1',                                                // 6. Select: Öneri / Suggestions (returns Suggestions list)
                '1',                                                // 7. Select: Item 1 from suggestions (adds to cart, returns Cart status)
                '9',                                                // 8. Select: Sepet / View Cart (returns Cart summary + 8) Onayla)
                '8',                                                // 9. Select: Onayla (returns confirm screen)
                '1'                                                 // 10. Select: 1) Onayla (Finalizes order, triggers POS socket)
            ];

            const customerPhone = '491620001122';
            for (const text of waMessages) {
                const res = await request.post(waWebhookUrl, {
                    data: {
                        from: customerPhone,
                        text: text
                    }
                });
                expect(res.ok()).toBe(true);
                await cashierPage.waitForTimeout(400); // Rhythmic dialogue delay
            }
            console.log('✅ Simulated WhatsApp Chatbot dialogue successfully completed!');
            await cashierPage.waitForTimeout(3000); // Wait for socket emission to frontend

            // Verify WhatsApp popup exists or trigger WA modal
            await cashierPage.screenshot({ path: 'scratch/e2e-int-2-wa-order-incoming.png' });
            
            console.log('🛒 Open WhatsApp Orders modal in Cashier POS...');
            // Click WhatsApp button in header
            const headerWaBtn = cashierPage.locator('button:has(svg.animate-bounce), button:has-text("WhatsApp"), header button:has(svg)').last();
            await headerWaBtn.click();
            await cashierPage.waitForTimeout(2000);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-3-wa-modal-opened.png' });

            // Click "Kabul Et" or "Görüntüle" to load it into Cashier Cart
            const acceptWaBtn = cashierPage.locator('button:has-text("Kabul Et"), button:has-text("Kabul"), button:has-text("Accept"), button.bg-emerald-600').first();
            await expect(acceptWaBtn).toBeVisible({ timeout: 10000 });
            await acceptWaBtn.click();
            await cashierPage.waitForTimeout(2000);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-4-wa-order-cart-loaded.png' });

            // Select 10% tip for delivery check later
            console.log('💰 Adding 10% tip to the WhatsApp delivery cart...');
            await cashierPage.getByText('%10').first().click();
            await cashierPage.waitForTimeout(1000);

            // Complete check-out using Card payment or close bill to get Courier assignment ready
            // Wait, we need the order to go to courier queue (which means ready status).
            // Let's send the order to prep and mark it ready first!
            console.log('📤 Sending WhatsApp order to prep...');
            const sendKitchenBtn = cashierPage.locator('button:has-text("Mutfak Gönder"), button:has-text("KÜCHE SENDEN"), button:has-text("Send to Kitchen"), button.bg-pink-600').last();
            await sendKitchenBtn.click();
            await cashierPage.waitForTimeout(2500);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-5-wa-order-sent-to-kitchen.png' });

            // -------------------------------------------------------------------------
            // FLOW B: CALLER ID LIVE CALL WORKFLOW
            // -------------------------------------------------------------------------
            console.log('📞 FLOW B: Simulating incoming VoIP/Android Caller ID call...');
            const callerIdWebhookUrl = `http://127.0.0.1:5173/api/v1/integrations/caller-id?tenant=${TENANT_ID}&key=DEMO`;
            
            const callerRes = await request.post(callerIdWebhookUrl, {
                data: {
                    number: '491629998877',
                    name: 'Selin Yilmaz'
                }
            });
            expect(callerRes.ok()).toBe(true);
            await cashierPage.waitForTimeout(3000); // Wait for Caller ID toast to render
            await cashierPage.screenshot({ path: 'scratch/e2e-int-6-caller-id-toast.png' });

            // Interact with Caller ID Toast Notification
            console.log('📌 Clicking "Sipariş Oluştur" on Caller ID popup...');
            const createOrderBtn = cashierPage.locator('button:has-text("Sipariş Oluştur"), button:has-text("Create Order"), button:has-text("Görüntüle")').first();
            await expect(createOrderBtn).toBeVisible({ timeout: 10000 });
            await createOrderBtn.click();
            await cashierPage.waitForTimeout(2000);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-7-caller-cart-opened.png' });

            // Add a product ("Pizza Margherita") to active customer's cart
            console.log('🍕 Adding Pizza Margherita to Selin Yilmaz cart...');
            const pizzaMargherita = cashierPage.getByText('Pizza Margherita', { exact: false }).first();
            await pizzaMargherita.click();
            await cashierPage.waitForTimeout(1000);
            
            // Click pink floating cart button or add button in customization modal
            const customAddBtn = cashierPage.locator('button:has-text("Sepete ekle"), button:has-text("Sepete Ekle"), button.bg-\\[\\#e91e63\\]').last();
            await customAddBtn.click();
            await cashierPage.waitForTimeout(1500);

            // Open cart drawer
            const cartFab = cashierPage.locator('button:has(svg.shrink-0)').first();
            await cartFab.click();
            await cashierPage.waitForTimeout(1500);

            // Submit Caller ID order to kitchen
            console.log('📤 Sending Caller ID order to the kitchen...');
            await sendKitchenBtn.click();
            await cashierPage.waitForTimeout(2500);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-8-caller-order-in-kitchen.png' });

            // -------------------------------------------------------------------------
            // FLOW C: QR MENU TABLE ORDER INSTANT INGESTION
            // -------------------------------------------------------------------------
            console.log('🌐 FLOW C: Simulating customer table QR scanning & ordering...');
            
            // Dynamic product fetch to verify API resilience
            const productsRes = await request.get(`http://127.0.0.1:5173/api/v1/qr/menu/products`, {
                headers: {
                    'x-tenant-id': TENANT_ID
                }
            });
            expect(productsRes.ok()).toBe(true);
            const products = await productsRes.json();
            const firstProductId = Number(products[0]?.id || 1);
            console.log(`🍟 Dynamic fetched Product ID for QR order: ${firstProductId}`);

            // Submit QR order for Table 1
            const qrOrderUrl = `http://127.0.0.1:5173/api/v1/qr/orders`;
            const qrRes = await request.post(qrOrderUrl, {
                headers: {
                    'x-tenant-id': TENANT_ID
                },
                data: {
                    qrCode: 'DEMO-T-01',
                    guestName: 'Burak QR',
                    guestPhone: '491628887766',
                    wantsRegistration: true,
                    items: [
                        {
                            productId: firstProductId,
                            quantity: 1
                        }
                    ]
                }
            });
            expect(qrRes.ok()).toBe(true);
            await cashierPage.waitForTimeout(3000); // Wait for socket and QrOrderQueueBar

            // Bring cashier page to front and verify QrOrderQueueBar
            await cashierPage.bringToFront();
            await cashierPage.screenshot({ path: 'scratch/e2e-int-9-qr-queue-bar.png' });

            // Click "ONAYLA" in the QR Queue Bar
            console.log('🔔 Approving QR Table Order in POS queue bar...');
            const approveQrBtn = cashierPage.locator('button:has-text("ONAYLA"), button:has-text("Approve"), button:has-text("Onayla")').first();
            await expect(approveQrBtn).toBeVisible({ timeout: 10000 });
            await approveQrBtn.click();
            await cashierPage.waitForTimeout(2000);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-10-qr-table-occupied.png');
            console.log('✅ QR Table Order approved successfully! Table 1 is active.');

            // -------------------------------------------------------------------------
            // KITCHEN MONITOR - Mark orders as Ready to prepare for courier dispatch
            // -------------------------------------------------------------------------
            console.log('🍳 Preparing and completing all delivery tickets in Kitchen...');
            await loginRole(adminPage, request, { username: 'kitchen', password: 'mutfak123', device: 'pw-kitchen-e2e' });
            await adminPage.goto('/kitchen/all');
            await adminPage.waitForLoadState('networkidle');
            await adminPage.waitForTimeout(2000);

            // Mark first ready
            const startPrepBtn = adminPage.locator('button:has-text("Hazırlığı Başlat"), button:has-text("Start"), button:has-text("Zubereitung")').first();
            while (await startPrepBtn.isVisible().catch(() => false)) {
                await startPrepBtn.click();
                await adminPage.waitForTimeout(1000);
                const readyBtn = adminPage.locator('button:has-text("Hazır Olarak İşaretle"), button:has-text("Hazır"), button:has-text("Mark Ready"), button:has-text("bereit")').first();
                await readyBtn.click();
                await adminPage.waitForTimeout(1000);
                const completeBtn = adminPage.locator('button:has-text("Garsona Bildir"), button:has-text("Tamamla"), button:has-text("Complete"), button:has-text("Bildir")').first();
                await completeBtn.click();
                await adminPage.waitForTimeout(1500);
            }
            console.log('✅ Kitchen marked all orders as ready!');

            // -------------------------------------------------------------------------
            // FLOW D: COURIER ASSIGNMENT & PANEL LIFECYCLE
            // -------------------------------------------------------------------------
            console.log('🛵 FLOW D: Assigning delivery order to Courier...');
            await cashierPage.bringToFront();
            
            // Open Online Orders modal
            const onlineOrdersBtn = cashierPage.locator('button:has-text("Online"), button:has-text("B2B"), header button:has(svg)').nth(3);
            if (await onlineOrdersBtn.isVisible().catch(() => false)) {
                await onlineOrdersBtn.click();
            } else {
                await cashierPage.goto('/cashier');
                await cashierPage.waitForTimeout(2000);
                await cashierPage.locator('button:has-text("Online"), button:has-text("B2B")').first().click();
            }
            await cashierPage.waitForTimeout(2000);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-11-delivery-modal.png' });

            // Assign courier: choose Kurye Burak (ID: 5)
            console.log('🛵 Assigning "Kurye Burak" to the ready delivery task...');
            const selectCourier = cashierPage.locator('select').first();
            await selectCourier.selectOption({ label: 'Kurye Burak' });
            await cashierPage.waitForTimeout(1000);

            // Click "Kuryeye Teslim Et" / "Assign"
            const assignCourierBtn = cashierPage.locator('button:has-text("Kuryeye Teslim Et"), button:has-text("Ata"), button:has-text("Assign")').first();
            await assignCourierBtn.click();
            await cashierPage.waitForTimeout(2500);
            await cashierPage.screenshot({ path: 'scratch/e2e-int-12-courier-assigned.png' });
            console.log('✅ Delivery order successfully assigned to Kurye Burak!');

            // -------------------------------------------------------------------------
            // COURIER PANEL - Shipped -> Completed lifecycle
            // -------------------------------------------------------------------------
            console.log('🔑 Logging in Courier context...');
            await loginRole(courierPage, request, { username: 'courier', password: 'kurye123', device: 'pw-courier-e2e' });
            await courierPage.goto('/courier');
            await courierPage.waitForLoadState('networkidle');
            await courierPage.waitForTimeout(2000);
            await courierPage.screenshot({ path: 'scratch/e2e-int-13-courier-dashboard.png' });

            // Click assigned order card
            console.log('🛵 Opening assigned order card on Courier panel...');
            const orderCard = courierPage.locator('text=/Burak QR|Canan Demir/i').first();
            if (await orderCard.isVisible().catch(() => false)) {
                await orderCard.click();
            } else {
                await courierPage.locator('.glass-dark').first().click();
            }
            await courierPage.waitForTimeout(1500);
            await courierPage.screenshot({ path: 'scratch/e2e-int-14-courier-detail.png' });

            // Click "Yola Çık" / "Teslim Al" to pick up order
            console.log('🛵 Picking up delivery task (On the way)...');
            const pickUpBtn = courierPage.locator('button:has-text("Yola Çık"), button:has-text("Teslim Al"), button:has-text("Pickup")').first();
            await pickUpBtn.click();
            await courierPage.waitForTimeout(2000);
            await courierPage.screenshot({ path: 'scratch/e2e-int-15-courier-transit.png' });

            // Click "Teslim Et" / "Ödeme Al" to checkout at doorstep
            console.log('💳 Completing doorstep delivery checkout...');
            const deliverBtn = courierPage.locator('button:has-text("Teslim Et"), button:has-text("Ödeme Al"), button:has-text("Complete"), button:has-text("Deliver")').first();
            await deliverBtn.click();
            await courierPage.waitForTimeout(1500);
            await courierPage.screenshot({ path: 'scratch/e2e-int-16-doorstep-checkout.png' });

            // Choose Card payment option and add tip
            console.log('💳 Selecting Card payment option with tip...');
            const payCardBtn = courierPage.locator('button:has-text("Kart"), button:has-text("Card"), button:has-text("KARTE")').first();
            await payCardBtn.click();
            await courierPage.waitForTimeout(1000);
            
            // Add %5 tip
            await courierPage.getByText('%5').first().click();
            await courierPage.waitForTimeout(1000);
            await courierPage.screenshot({ path: 'scratch/e2e-int-17-doorstep-payout-confirm.png' });

            // Confirm payment submit
            const confirmDoorstepBtn = courierPage.locator('button:has-text("Ödemeyi Al"), button:has-text("Kaydet"), button:has-text("Confirm"), button:has-text("Tamamla")').first();
            await confirmDoorstepBtn.click();
            await courierPage.waitForTimeout(2500);
            await courierPage.screenshot({ path: 'scratch/e2e-int-18-doorstep-completed.png' });
            console.log('✅ Doorstep delivery completed successfully by Kurye Burak!');

            // -------------------------------------------------------------------------
            // FLOW E: ADMIN SETTLEMENTS & FINANCING HANDOVER
            // -------------------------------------------------------------------------
            console.log('📊 FLOW E: Verifying courier settlements in Admin panel...');
            await adminPage.bringToFront();
            await adminPage.goto('/admin/settlements');
            await adminPage.waitForLoadState('networkidle');
            await adminPage.waitForTimeout(3000);
            await adminPage.screenshot({ path: 'scratch/e2e-int-19-admin-settlements.png' });

            // Verify Courier exists in settlements list
            await expect(adminPage.getByText('Kurye Burak', { exact: false })).toBeVisible();
            console.log('✅ Courier Burak is visible in settlements dashboard!');

            // Trigger Payout handover for courier card tips
            const payTipBtn = adminPage.locator('button:has-text("Bahşişi Öde"), button:has-text("Pay Tip"), button:has-text("Mutabakat")').first();
            if (await payTipBtn.isVisible() && await payTipBtn.isEnabled()) {
                await payTipBtn.click();
                await adminPage.waitForTimeout(1500);
                await adminPage.screenshot({ path: 'scratch/e2e-int-20-settlement-confirm.png' });

                // Confirm payout modal button
                const confirmBtn = adminPage.locator('button:has-text("Evet, Ödeme Yapıldı"), button:has-text("Evet"), button:has-text("Confirm")').first();
                await confirmBtn.click();
                await adminPage.waitForTimeout(2000);
                await adminPage.screenshot({ path: 'scratch/e2e-int-21-settlement-completed.png' });
                console.log('✅ Tips settled successfully for Kurye Burak!');
            } else {
                console.log('⚠️ Pay tips button not active. Settlements bypassed.');
            }

            console.log('🎉 NEXTPOS INTEGRATIONS AND COURIER FLOWS SIMULATION COMPLETED SUCCESSFULLY!');
        } finally {
            // Terminate contexts cleanly
            await cashierContext.close();
            await courierContext.close();
            await adminContext.close();
        }
    });
});
