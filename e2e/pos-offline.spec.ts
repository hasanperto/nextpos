import { test, expect } from '@playwright/test';

test.describe('POS — offline banner smoke', () => {
    test('çevrimdışı modda banner görünür', async ({ page, context }) => {
        await page.goto('/login');
        await expect(page.locator('#username-input')).toBeVisible({ timeout: 15_000 });
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));
        await expect(
            page.getByText(/OFFLINE|Çevrimdışı|offline/i).first(),
        ).toBeVisible({ timeout: 15_000 });
        await context.setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
    });
});
