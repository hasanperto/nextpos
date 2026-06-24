const { chromium } = require('playwright');

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

        // Print page titles / headings to confirm we are there
        console.log('Page Title:', await page.title());

        console.log('Looking for Pizza Margherita card...');
        const pizzaCard = page.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
        if (await pizzaCard.isVisible()) {
            console.log('Pizza card is visible!');
            const buttons = await pizzaCard.locator('button').all();
            console.log('Number of buttons inside Pizza card:', buttons.length);
            for (let i = 0; i < buttons.length; i++) {
                const text = await buttons[i].innerText();
                const html = await buttons[i].evaluate(el => el.outerHTML);
                console.log(`Button ${i}: Text="${text.trim().replace(/\n/g, ' ')}" HTML=${html.slice(0, 150)}`);
            }
        } else {
            console.log('Pizza card NOT visible.');
            // Take a screenshot to debug
            await page.screenshot({ path: 'scratch/pizza_card_debug.png' });
            console.log('Saved debug screenshot to scratch/pizza_card_debug.png');
        }
    } catch (err) {
        console.error('Error during execution:', err);
    } finally {
        await browser.close();
    }
})();
