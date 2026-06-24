import { test, expect } from '@playwright/test';

test.describe('QR — garson onay smoke', () => {
    test('QR menü sayfası yüklenir', async ({ page }) => {
        await page.goto('http://localhost:4003/');
        await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    });

    test('garson paneli login sayfası yüklenir', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('#username-input')).toBeVisible();
    });
});
