const { test, expect } = require('@playwright/test');

test('Inspect Pizza Card', async ({ page }) => {
    await page.goto('http://localhost:5173/login?device=pw-cashier');
    // Login admin or cashier
    await page.locator('#tenant-id-input').fill('a1111111-1111-4111-8111-111111111111');
    await page.locator('#username-input').fill('cashier');
    await page.locator('#password-input').fill('kasa123');
    await page.locator('#login-button').click();
    await page.waitForTimeout(3000);

    await page.goto('http://localhost:5173/cashier');
    await page.waitForTimeout(3000);

    // Open cart / menu if needed
    // Click MITNAHME
    const cartTakeawayBtn = page.locator('button:has-text("MITNAHME"), button:has-text("Mitnahme"), button:has-text("Takeaway")').first();
    if (await cartTakeawayBtn.isVisible()) {
        await cartTakeawayBtn.click();
        await page.waitForTimeout(1000);
    }

    const pizzaCard = page.locator('[class*="product-card"], div.rounded-xl, div.border').filter({ hasText: 'Pizza Margherita' }).first();
    const buttons = await pizzaCard.locator('button').all();
    console.log('Number of buttons inside Pizza card:', buttons.length);
    for (let i = 0; i < buttons.length; i++) {
        const text = await buttons[i].innerText();
        const html = await buttons[i].evaluate(el => el.outerHTML);
        console.log(`Button ${i}: Text="${text}" HTML=${html.slice(0, 150)}`);
    }
});
