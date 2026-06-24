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

        // Check if cart sidebar is visible
        // Let's find any panel or div on the right that might be the cart
        const cartHeading = page.locator('h2:has-text("WARENKORB"), h2:has-text("CART"), h2:has-text("SEPET")').first();
        console.log('Is Cart Heading visible by default?', await cartHeading.isVisible());

        // Check if cashierPayCardBtn is visible by default
        const cashierPayCardBtn = page.locator('button:has-text("KARTE"), button:has-text("Karte"), button:has-text("CARD"), button:has-text("Kart")').first();
        console.log('Is Card Payment Button visible by default?', await cashierPayCardBtn.isVisible());

        // Find cart FAB button
        const cartFab = page.locator('button:has(svg.shrink-0)').first();
        console.log('Is Cart FAB visible?', await cartFab.isVisible());
        if (await cartFab.isVisible()) {
            const fabText = await cartFab.innerText();
            console.log('Cart FAB text / HTML:', await cartFab.evaluate(el => el.outerHTML));
        }

        // Click MITNAHME
        const cartTakeawayBtn = page.locator('button:has-text("MITNAHME"), button:has-text("Mitnahme"), button:has-text("Takeaway")').first();
        if (await cartTakeawayBtn.isVisible()) {
            await cartTakeawayBtn.click();
            await page.waitForTimeout(1000);
        }

        // Add product to cart
        const pizzaCard = page.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
        const pizzaMargheritaSVariant = pizzaCard.locator('button').first();
        await pizzaMargheritaSVariant.click();
        await page.waitForTimeout(1000);

        console.log('After adding product:');
        console.log('Is Cart Heading visible?', await cartHeading.isVisible());
        console.log('Is Card Payment Button visible?', await cashierPayCardBtn.isVisible());

        // If we click cartFab now, does it change?
        if (await cartFab.isVisible()) {
            console.log('Clicking cartFab...');
            await cartFab.click();
            await page.waitForTimeout(1000);
            console.log('After clicking cartFab:');
            console.log('Is Cart Heading visible?', await cartHeading.isVisible());
            console.log('Is Card Payment Button visible?', await cashierPayCardBtn.isVisible());
        }

    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
    }
})();
