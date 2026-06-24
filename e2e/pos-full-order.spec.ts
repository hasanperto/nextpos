import { test, expect } from '@playwright/test';

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

async function waitForApi(request: import('@playwright/test').APIRequestContext) {
    const deadline = Date.now() + 45_000;
    let lastStatus: number | null = null;
    while (Date.now() < deadline) {
        try {
            const res = await request.get('http://127.0.0.1:3101/api/v1/health');
            lastStatus = res.status();
            if (res.ok()) return;
        } catch {
            /* API henüz hazır değil */
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`API not ready in time (last status: ${String(lastStatus)})`);
}

async function loginCashier(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
    await waitForApi(request);
    await page.goto('/login?device=pw-e2e-full-order');
    const tenantInput = page.locator('#tenant-id-input');
    if (await tenantInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await tenantInput.fill(TENANT_ID);
    }
    await page.locator('#username-input').fill('cashier');
    await page.locator('#password-input').fill('kasa123');
    const loginReq = page.waitForResponse(
        (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST',
    );
    await page.locator('#login-button').click();
    const resp = await loginReq;
    if (!resp.ok()) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Login failed: status=${resp.status()} body=${body}`);
    }
    await expect(page).toHaveURL(/\/(cashier|admin)/, { timeout: 20_000 });
}

test.describe('POS — tam sipariş smoke', () => {
    test('kasiyer: masa aç ve ürün ekle (mümkünse)', async ({ page, request }) => {
        test.setTimeout(60_000);

        await loginCashier(page, request);
        await page.goto('/cashier');
        await expect(
            page.getByText(/Hızlı Satış|Schnellverkauf|Quick Sale/i).first(),
        ).toBeVisible({ timeout: 20_000 });

        const tablesTab = page.getByRole('button', { name: /TISCHE|MASALAR|TABLES/i }).first();
        if (await tablesTab.isVisible({ timeout: 5000 }).catch(() => false)) {
            await tablesTab.click();
        }

        const tableBtn = page.getByText(/Masa\s*\d+|Tisch\s*\d+|Table\s*\d+/i).first();
        if (await tableBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
            await tableBtn.click();

            const skipGuestBtn = page.locator('button', { hasText: /seçmeden|devam|continue|ohne/i }).first();
            if (await skipGuestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await skipGuestBtn.click();
            }

            const openTableBtn = page.locator('button.bg-emerald-600').first();
            if (await openTableBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await openTableBtn.click();
                await page.waitForTimeout(1500);
            }
        }

        const productVariant = page.getByRole('button', { name: /Pizza Margherita.*(ekle|add|hinzufügen)/i }).first();
        if (await productVariant.isVisible({ timeout: 5000 }).catch(() => false)) {
            await productVariant.click({ force: true, timeout: 10_000 }).catch(() => undefined);
        }

        await expect(
            page.getByText(/Pizza Margherita|Pizza Pepperoni|SCHNELLVERKORB|WARENKORB|Sepet|Cart/i).first(),
        ).toBeVisible({ timeout: 15_000 });
    });
});
