const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    try {
        await page.goto('http://localhost:5173/login?device=pw-cashier');
        await page.locator('#tenant-id-input').fill('a1111111-1111-4111-8111-111111111111');
        await page.locator('#username-input').fill('cashier');
        await page.locator('#password-input').fill('kasa123');
        await page.locator('#login-button').click();
        await page.waitForTimeout(3000);

        await page.goto('http://localhost:5173/cashier');
        await page.waitForTimeout(3000);

        // Click MITNAHME
        const cartTakeawayBtn = page.locator('button:has-text("MITNAHME"), button:has-text("Mitnahme"), button:has-text("Takeaway")').first();
        if (await cartTakeawayBtn.isVisible()) {
            await cartTakeawayBtn.click();
            await page.waitForTimeout(1000);
        }

        // Add Pizza Margherita M variant
        const pizzaCard = page.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
        const pizzaMargheritaMVariant = pizzaCard.locator('button').nth(1);
        await pizzaMargheritaMVariant.click();
        await page.waitForTimeout(1000);

        // Click Card payment
        const cashierPayCardBtn = page.locator('button:has-text("KARTE"), button:has-text("Karte"), button:has-text("CARD"), button:has-text("Kart")').first();
        await cashierPayCardBtn.click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(3000);

        console.log('After Card checkout:');
        console.log('URL:', page.url());
        
        // Take a screenshot
        await page.screenshot({ path: 'scratch/takeaway_post_checkout_state.png' });
        console.log('Saved screenshot to scratch/takeaway_post_checkout_state.png');

        // Check if there is an active modal/overlay
        const modal = page.locator('.fixed.inset-0').first();
        console.log('Is modal/overlay visible?', await modal.isVisible());
        if (await modal.isVisible()) {
            console.log('Modal inner text:', await modal.innerText());
        }

    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
    }
})();
