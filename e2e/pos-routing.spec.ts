import { test, expect } from '@playwright/test';

test.describe('POS — yönlendirme (oturumsuz)', () => {
    test('kök / oturumsuzken /login olur', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/login\/?$/);
    });

    test('/cashier oturumsuzken /login olur', async ({ page }) => {
        await page.goto('/cashier');
        await expect(page).toHaveURL(/\/login\/?$/);
    });

    test('/admin oturumsuzken /login olur', async ({ page }) => {
        await page.goto('/admin');
        await expect(page).toHaveURL(/\/login\/?$/);
    });

    test('tanımsız yol oturumsuzken /login olur', async ({ page }) => {
        await page.goto('/__e2e_bilinmeyen_rota__');
        await expect(page).toHaveURL(/\/login\/?$/);
    });
});
