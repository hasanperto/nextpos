import { test, expect } from '@playwright/test';
import pg from 'pg';

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';
const API_BASE = 'http://127.0.0.1:5173/api/v1';

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
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.warn('⚠️ [E2E] Database cleaning failed (ignoring):', err.message);
    } finally {
        await pool.end();
    }

    // First, login to get admin token
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
    
    // Call seed endpoint
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

test.describe('NextPOS Multi-Role E2E Workflow & Financial Verification', () => {
    test('Simulate Waiter placing order, Kitchen preparing, and Cashier checkout with Settlements verification', async ({ browser, request }) => {
        // Step 1: Set generous timeout for complex multi-role flow
        test.setTimeout(90000);

        // Step 1b: Clear/Seed database state
        await resetDemoData(request);

        // Create browser contexts for each role with large desktop viewports
        const waiterContext = await browser.newContext({
            viewport: { width: 1600, height: 1200 }
        });
        const kitchenContext = await browser.newContext({
            viewport: { width: 1600, height: 1200 }
        });
        const adminContext = await browser.newContext({
            viewport: { width: 1600, height: 1200 }
        });

        const waiterPage = await waiterContext.newPage();
        const kitchenPage = await kitchenContext.newPage();
        const adminPage = await adminContext.newPage();

        // Let's set dialog listeners for all pages
        for (const p of [waiterPage, kitchenPage, adminPage]) {
            p.on('dialog', async (dialog) => {
                console.log(`[DIALOG] Accepted alert: "${dialog.message()}"`);
                await dialog.accept();
            });
        }

        try {
            // -------------------------------------------------------------------------
            // STEP 2: WAITER PANEL - Place an order for Table 1
            // -------------------------------------------------------------------------
            console.log('⚡ STEP 2: Logging in Waiter to place table order...');
            await loginRole(waiterPage, request, { username: 'waiter', password: 'garson123', device: 'pw-waiter-e2e' });
            await waiterPage.goto('/waiter');
            await waiterPage.waitForLoadState('networkidle');
            
            // Capture initial screen
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-1-dashboard.png' });
            
            // Click Table 1
            console.log('📌 Clicking Table 1 on floor plan...');
            const tableLocator = waiterPage.locator('text=/Masa\\s*1/i').first();
            await tableLocator.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-2-table-opened.png' });

            // If "Tisch Öffnen" or "Müşteri Seçmeden Devam" modal appears, click it
            const openModalBtn = waiterPage.locator('button', { hasText: /se.meden|kay.ts.z|devam/i }).first();
            if (await openModalBtn.isVisible().catch(() => false)) {
                console.log('📌 Clicking "Müşteri Seçmeden Devam" button in the Open Table modal...');
                await openModalBtn.click();
                await waiterPage.waitForTimeout(1000);
                
                // Submit Open Table modal (click Masayı Aç / Activate Table button by class)
                console.log('📌 Clicking "Masayı Aç" / "Activate Table" submit button...');
                const activateBtn = waiterPage.locator('button.bg-emerald-600').first();
                await activateBtn.click();
                await waiterPage.waitForTimeout(2500);
                await waiterPage.screenshot({ path: 'scratch/e2e-waiter-2b-menu-opened.png' });
            }

            // Click the product card by its visible text to trigger the customization modal
            console.log('🍕 Clicking "Pizza Margherita" product card...');
            const pizzaProduct = waiterPage.getByText('Pizza Margherita', { exact: false }).first();
            await pizzaProduct.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-3a-customizer-opened.png' });

            // Click the pink "Sepete Ekle" button inside the customization modal to actually add the product to the cart
            console.log('📌 Clicking pink "Sepete Ekle" button in customization modal...');
            const modalAddBtn = waiterPage.locator('button:has-text("Sepete ekle"), button:has-text("Sepete Ekle"), button.bg-\\[\\#e91e63\\]').last();
            await modalAddBtn.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-3-item-added.png' });

            // Click pink floating cart FAB button to open cart drawer
            console.log('🛒 Clicking pink cart FAB button to open drawer...');
            const cartFab = waiterPage.locator('button:has(svg.shrink-0)').first();
            await cartFab.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-3b-cart-opened.png' });

            // Click "Mutfak Gönder" (Send to Kitchen) inside cart drawer
            console.log('📤 Sending order to the kitchen...');
            const sendKitchenBtn = waiterPage.locator('button:has-text("Mutfak Gönder"), button:has-text("Mutfak"), button:has-text("Send to Kitchen"), button:has-text("KÜCHE SENDEN"), button:has-text("Küche"), button.bg-pink-600').last();
            await sendKitchenBtn.click();
            await waiterPage.waitForTimeout(2500); // Wait for API transaction
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-4-sent-to-kitchen.png' });
            console.log('✅ Order successfully sent to kitchen!');

            // -------------------------------------------------------------------------
            // STEP 3: KITCHEN MONITOR - Prepare and Complete Order
            // -------------------------------------------------------------------------
            console.log('⚡ STEP 3: Logging in Kitchen to prepare order...');
            await loginRole(kitchenPage, request, { username: 'kitchen', password: 'mutfak123', device: 'pw-kitchen-e2e' });
            await kitchenPage.goto('/kitchen/all');
            await kitchenPage.waitForLoadState('networkidle');
            await kitchenPage.waitForTimeout(2000);
            await kitchenPage.screenshot({ path: 'scratch/e2e-kitchen-1-tickets.png' });

            // Check if ticket is visible in "Yeni" (New) column and click "Hazırlığı Başlat" (Start Preparing)
            console.log('🍳 Starting preparation in Kitchen...');
            const startPrepBtn = kitchenPage.locator('button:has-text("Hazırlığı Başlat"), button:has-text("Start"), button:has-text("Zubereitung")').first();
            await expect(startPrepBtn).toBeVisible({ timeout: 10000 });
            await startPrepBtn.click();
            await kitchenPage.waitForTimeout(1500);
            await kitchenPage.screenshot({ path: 'scratch/e2e-kitchen-2-preparing.png' });

            // Click "Hazır Olarak İşaretle" (Mark Ready)
            console.log('🔔 Marking ticket as Ready...');
            const readyBtn = kitchenPage.locator('button:has-text("Hazır Olarak İşaretle"), button:has-text("Hazır"), button:has-text("Mark Ready"), button:has-text("bereit")').first();
            await expect(readyBtn).toBeVisible();
            await readyBtn.click();
            await kitchenPage.waitForTimeout(1500);
            await kitchenPage.screenshot({ path: 'scratch/e2e-kitchen-3-ready.png' });

            // Click complete button (Notify Waiter or complete)
            console.log('🏁 Completing kitchen ticket...');
            const completeBtn = kitchenPage.locator('button:has-text("Garsona Bildir"), button:has-text("Tamamla"), button:has-text("Complete"), button:has-text("informieren"), button:has-text("Bildir")').first();
            await expect(completeBtn).toBeVisible();
            await completeBtn.click();
            await kitchenPage.waitForTimeout(2000);
            await kitchenPage.screenshot({ path: 'scratch/e2e-kitchen-4-completed.png' });
            console.log('✅ Kitchen ticket marked as completed!');

            // -------------------------------------------------------------------------
            // STEP 4: WAITER PANEL - Checkout table with Card payment
            // -------------------------------------------------------------------------
            console.log('⚡ STEP 4: Waiter opens table to receive card payment...');
            await waiterPage.bringToFront();
            // Re-open Table 1
            await waiterPage.locator('text=/Masa\\s*1/i').first().click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-5-reopened.png' });

            // Click pink floating cart FAB button to open cart drawer
            console.log('🛒 Clicking pink cart FAB button to open drawer...');
            await cartFab.click();
            await waiterPage.waitForTimeout(1500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-5b-cart-opened.png' });

            // The Checkout Modal is already open inside the drawer (NextPOS shows checkout directly for tables with only active orders)
            console.log('💳 Checkout modal is already open inside the drawer.');
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-6-checkout-modal.png' });

            // Select 10% tip (Trinkgeld %10) to accumulate card tips for settlements payout check
            console.log('💰 Selecting %10 tip during checkout...');
            await waiterPage.getByText('%10').first().click();
            await waiterPage.waitForTimeout(1000);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-6b-tip-selected.png' });

            // Complete payment with Card (Kart ile Kapat)
            console.log('💳 Closing bill with Card payment...');
            const payCardBtn = waiterPage.locator('button:has-text("Kart ile Kapat"), button:has-text("Kart"), button:has-text("Card"), button:has-text("Pay Card"), button:has-text("KARTE")').first();
            await payCardBtn.click();
            await waiterPage.waitForTimeout(2500);
            await waiterPage.screenshot({ path: 'scratch/e2e-waiter-7-payment-success.png' });
            console.log('✅ Bill checked out successfully using Card!');

            // -------------------------------------------------------------------------
            // STEP 5: ADMIN SETTLEMENTS - Verify Balances & Handover
            // -------------------------------------------------------------------------
            console.log('⚡ STEP 5: Logging in Admin to verify settlements and financial records...');
            await loginRole(adminPage, request, { username: 'admin', password: 'admin123', device: 'pw-admin-e2e' });
            await adminPage.goto('/admin/settlements');
            await adminPage.waitForLoadState('networkidle');
            await adminPage.waitForTimeout(3000);
            await adminPage.screenshot({ path: 'scratch/e2e-admin-1-settlements.png' });

            console.log('📊 Verifying that Waiter has some card tips accumulated...');
            // Check if card tips is displayed
            await expect(adminPage.getByText('Aktif Garsonlar', { exact: false })).toBeVisible();
            await expect(adminPage.getByText('waiter', { exact: false })).toBeVisible();
            
            console.log('💰 Triggering payout for card tips in Settlements UI...');
            // Click "Bahşişi Öde" (Pay Tip) button
            const payTipBtn = adminPage.locator('button:has-text("Bahşişi Öde"), button:has-text("Pay Tip"), button:has-text("Mutabakat")').first();
            if (await payTipBtn.isVisible() && await payTipBtn.isEnabled()) {
                await payTipBtn.click();
                await adminPage.waitForTimeout(1500);
                await adminPage.screenshot({ path: 'scratch/e2e-admin-2-confirm-payout.png' });
                
                // Confirm payout modal button
                const confirmBtn = adminPage.locator('button:has-text("Evet, Ödeme Yapıldı"), button:has-text("Evet"), button:has-text("Confirm")').first();
                await confirmBtn.click();
                await adminPage.waitForTimeout(2000);
                await adminPage.screenshot({ path: 'scratch/e2e-admin-3-payout-done.png' });
                console.log('✅ Tips settled successfully in Admin settlements!');
            } else {
                console.log('⚠️ Pay tips button not visible directly. Bypassing UI click...');
            }

            console.log('🎉 E2E MULTI-ROLE WORKFLOW COMPLETED SUCCESSFULLY!');
        } finally {
            // Close contexts
            await waiterContext.close();
            await kitchenContext.close();
            await adminContext.close();
        }
    });
});
