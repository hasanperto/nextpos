const { chromium } = require('playwright');

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
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
        await page.waitForTimeout(3000);

        console.log('Simulating Caller ID webhook...');
        const response = await context.request.post('http://127.0.0.1:3101/api/v1/integrations/caller-id?tenant=a1111111-1111-4111-8111-111111111111&key=DEMO', {
            data: {
                number: '491629998877',
                name: 'Selin Yilmaz'
            }
        });
        console.log('Webhook response status:', response.status());
        await page.waitForTimeout(2000);

        const viewCallBtn = page.locator('button:has-text("Görüntüle"), button:has-text("Cevapla"), button:has-text("View"), button:has-text("SİPARİŞ OLUŞTUR"), button:has-text("CREATE ORDER"), button:has-text("BESTELLUNG ERSTELLEN")').first();
        console.log('Is viewCallBtn visible?', await viewCallBtn.isVisible());
        if (await viewCallBtn.isVisible()) {
            await viewCallBtn.click();
            await page.waitForTimeout(2000);
        }

        const takeawayBtn = page.locator('button:has-text("Gel-Al"), button:has-text("Takeaway"), button:has-text("Abholung")').first();
        const startOrderBtn = page.locator('button:has-text("Siparişi Başlat"), button:has-text("Start Order"), button:has-text("Bestellung Starten")').first();

        if (await takeawayBtn.isVisible()) {
            console.log('Clicking Takeaway and starting order...');
            await takeawayBtn.click();
            await page.waitForTimeout(1000);
            await startOrderBtn.click();
            await page.waitForTimeout(2000);
        }

        const cartTakeawayBtn = page.locator('button:has-text("MITNAHME"), button:has-text("Mitnahme"), button:has-text("Takeaway")').first();
        if (await cartTakeawayBtn.isVisible()) {
            console.log('Clicking MITNAHME in cart...');
            await cartTakeawayBtn.click();
            await page.waitForTimeout(1500);
        }

        console.log('Clicking Pizza Margherita M variant...');
        const pizzaCard = page.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
        const pizzaMargheritaMVariant = pizzaCard.locator('button').nth(1);
        await pizzaMargheritaMVariant.click();
        await page.waitForTimeout(2000);

        console.log('Clicking Card payment button in Cashier Cart...');
        const cashierPayCardBtn = page.locator('button:has-text("KARTE"), button:has-text("Karte"), button:has-text("CARD"), button:has-text("Kart")').first();
        console.log('Is cashierPayCardBtn visible?', await cashierPayCardBtn.isVisible());
        if (await cashierPayCardBtn.isVisible()) {
            await cashierPayCardBtn.click({ timeout: 6000 }).catch(err => console.log('Click failed/timed out: ' + err.message));
            console.log('Completed cashierPayCardBtn click attempt.');
            await page.waitForTimeout(3000);
        }

        await page.screenshot({ path: 'scratch/takeaway_checkout_result.png' });
        console.log('Saved result screenshot to scratch/takeaway_checkout_result.png');

    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
    }
})();
