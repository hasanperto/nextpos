import { test, expect } from '@playwright/test';

test.describe('POS — giriş ekranı', () => {
    test('/login yüklenir ve form görünür', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /NextPOS/i })).toBeVisible();
        await expect(page.locator('#tenant-id-input')).toBeVisible();
        await expect(page.locator('#username-input')).toBeVisible();
        await expect(page.locator('#password-input')).toBeVisible();
    });

    test('ortam değişkenleriyle tam giriş (opsiyonel)', async ({ page }) => {
        const tid = process.env.E2E_TENANT_ID?.trim();
        const user = process.env.E2E_LOGIN_USER?.trim();
        const pass = process.env.E2E_LOGIN_PASSWORD ?? '';
        test.skip(!tid || !user || !pass, 'E2E_TENANT_ID, E2E_LOGIN_USER, E2E_LOGIN_PASSWORD tanımlı değil');

        await page.goto('/login');
        await page.locator('#tenant-id-input').fill(tid!);
        await page.locator('#username-input').fill(user!);
        await page.locator('#password-input').fill(pass);
        await page.locator('#login-button').click();

        await expect(page).toHaveURL(/\/(admin|cashier|waiter|kitchen|courier)/, { timeout: 20_000 });
    });
});
