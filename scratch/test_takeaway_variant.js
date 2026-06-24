const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Navigating to login...');
        await page.goto('http://localhost:5173/login?device=pw-cashier');
        
        console.log('Entering credentials...');
        await page.locator('#tenant-id-input').fill('a1111111-1111-4111-8111-111111111111');
        await page.locator('#username-input').fill('cashier');
        await page.locator('#password-input').fill('kasa123');
        await page.locator('#login-button').click();
        await page.waitForTimeout(3000);

        console.log('Navigating to cashier...');
        await page.goto('http://localhost:5173/cashier');
        await page.waitForTimeout(4000);

        await page.screenshot({ path: 'scratch/takeaway_1_loaded.png' });

        // Let's check the Caller ID simulator. Wait, in Scenario 2 of comprehensive-simulation.spec.ts:
        // We first trigger the Caller ID webhook to simulate a call from Selin Yilmaz.
        // Let's do that!
        console.log('Simulating Caller ID incoming call...');
        const response = await context.request.post('http://127.0.0.1:3101/api/v1/integrations/caller-id?tenant=a1111111-1111-4111-8111-111111111111&key=DEMO', {
            data: {
                number: '491629998877',
                name: 'Selin Yilmaz'
            }
        });
        console.log('Webhook response status:', response.status());
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'scratch/takeaway_2_caller_toast.png' });

        // Click the toast / open order button
        const viewCallBtn = page.locator('button:has-text("Görüntüle"), button:has-text("Cevapla"), button:has-text("View"), button:has-text("SİPARİŞ OLUŞTUR"), button:has-text("CREATE ORDER"), button:has-text("BESTELLUNG ERSTELLEN")').first();
        console.log('Is viewCallBtn visible?', await viewCallBtn.isVisible());
        if (await viewCallBtn.isVisible()) {
            await viewCallBtn.click();
            await page.waitForTimeout(2000);
        }

        const takeawayBtn = page.locator('button:has-text("Gel-Al"), button:has-text("Takeaway"), button:has-text("Abholung")').first();
        const startOrderBtn = page.locator('button:has-text("Siparişi Başlat"), button:has-text("Start Order"), button:has-text("Bestellung Starten")').first();
        const openOrderBtn = page.locator('button:has-text("PAKET AÇ"), button:has-text("OPEN ORDER"), button:has-text("LIEFERUNG ÖFFNEN")').first();

        if (await takeawayBtn.isVisible()) {
            console.log('Takeaway button visible. Clicking Takeaway and starting order...');
            await takeawayBtn.click();
            await page.waitForTimeout(1000);
            await startOrderBtn.click();
            await page.waitForTimeout(2000);
        } else {
            console.log('Takeaway button not visible. Checking openOrderBtn...');
            if (await openOrderBtn.isVisible()) {
                await openOrderBtn.click();
                await page.waitForTimeout(2000);
            }
        }

        await page.screenshot({ path: 'scratch/takeaway_3_session_started.png' });

        // Click MITNAHME button in cart if visible
        const cartTakeawayBtn = page.locator('button:has-text("MITNAHME"), button:has-text("Mitnahme"), button:has-text("Takeaway")').first();
        if (await cartTakeawayBtn.isVisible()) {
            console.log('Clicking MITNAHME in cart...');
            await cartTakeawayBtn.click();
            await page.waitForTimeout(1500);
        }

        await page.screenshot({ path: 'scratch/takeaway_4_mitnahme_clicked.png' });

        // Let's click the variant button
        console.log('Clicking Pizza Margherita variant button...');
        const pizzaCard = page.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
        const pizzaMargheritaSVariant = pizzaCard.locator('button').first();
        
        console.log('Is variant button visible?', await pizzaMargheritaSVariant.isVisible());
        console.log('Is variant button enabled?', await pizzaMargheritaSVariant.isEnabled());

        await pizzaMargheritaSVariant.click();
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'scratch/takeaway_5_variant_clicked.png' });

        // Open cart drawer if mobile / click cart fab
        const cartFab = page.locator('button:has(svg.shrink-0)').first();
        if (await cartFab.isVisible()) {
            console.log('Opening cart drawer...');
            await cartFab.click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: 'scratch/takeaway_6_cart_opened.png' });
        }

        // Print cart content / outer html of cart list
        const cartItems = page.locator('[class*="cart-item"], div.flex-1.overflow-y-auto');
        console.log('Cart text:', await cartItems.first().innerText());

    } catch (err) {
        console.error('Error during execution:', err);
    } finally {
        await browser.close();
    }
})();
