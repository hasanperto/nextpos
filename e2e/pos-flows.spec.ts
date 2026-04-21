import { test, expect } from '@playwright/test';

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

async function waitForApi(request: any) {
    const deadline = Date.now() + 45_000;
    let lastStatus: number | null = null;
    while (Date.now() < deadline) {
        try {
            const res = await request.get('http://127.0.0.1:5000/api/v1/health');
            lastStatus = res.status();
            if (res.ok()) return;
        } catch {
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`API not ready in time (last status: ${String(lastStatus)})`);
}

async function loginWithPassword(page: any, request: any, params: { username: string; password: string; device: string }) {
    await waitForApi(request);
    await page.goto(`/login?device=${encodeURIComponent(params.device)}`);
    await page.waitForFunction(
        (expected: string) => {
            try {
                return window.localStorage.getItem('nextpos_device_id_v1') === expected;
            } catch {
                return false;
            }
        },
        params.device,
        { timeout: 10_000 },
    );
    await page.locator('#tenant-id-input').fill(TENANT_ID);
    await page.locator('#username-input').fill(params.username);
    await page.locator('#password-input').fill(params.password);
    const loginReq = page.waitForResponse((r: any) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST');
    await page.locator('#login-button').click();
    const resp = await loginReq;
    if (!resp.ok()) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Login failed: status=${resp.status()} body=${body}`);
    }
    await expect(page).toHaveURL(/\/(cashier|admin|waiter|kitchen|courier)/, { timeout: 20_000 });
}

test.describe('POS — kritik akışlar (smoke)', () => {
    test('Kasiyer: /cashier açılır', async ({ page, request }) => {
        await loginWithPassword(page, request, { username: 'cashier', password: 'kasa123', device: 'pw-e2e-cashier' });
        await page.goto('/cashier');
        await expect(page.getByText('Hızlı Satış', { exact: false })).toBeVisible({ timeout: 20_000 });
    });

    test('Garson: /waiter açılır', async ({ page, request }) => {
        await loginWithPassword(page, request, { username: 'waiter', password: 'garson123', device: 'pw-e2e-waiter' });
        await page.goto('/waiter');
        await expect(page.getByText(/GARSON|WAITER|KELLNER/)).toBeVisible({ timeout: 20_000 });
    });

    test('Mutfak: /kitchen/all açılır', async ({ page, request }) => {
        await loginWithPassword(page, request, { username: 'kitchen', password: 'mutfak123', device: 'pw-e2e-kitchen' });
        await page.goto('/kitchen/all');
        await expect(page.getByText(/Mutfak Ekranı|Kitchen Display|Küchenmonitor/)).toBeVisible({ timeout: 20_000 });
    });

    test('Kurye: /courier açılır (admin ile)', async ({ page, request }) => {
        await loginWithPassword(page, request, { username: 'admin', password: 'admin123', device: 'pw-e2e-admin' });
        await page.goto('/courier');
        await expect(page.getByText(/GÖREVLER|TASKS|AUFGABEN/)).toBeVisible({ timeout: 20_000 });
    });

    test('Teslim: /handover açılır (admin ile)', async ({ page, request }) => {
        await loginWithPassword(page, request, { username: 'admin', password: 'admin123', device: 'pw-e2e-admin' });
        await page.goto('/handover');
        await expect(page.getByText('Teslim Merkezi', { exact: false })).toBeVisible({ timeout: 20_000 });
    });

    test('Masa QR: /qr/1 açılır', async ({ page }) => {
        await page.goto('/qr/1');
        await expect(page.getByText(/Hoş Geldiniz|Herzlich Willkommen|Welcome/)).toBeVisible({ timeout: 20_000 });
    });

    test('Admin Settings: Şubeler sekmesi görünür', async ({ page, request }) => {
        await loginWithPassword(page, request, { username: 'admin', password: 'admin123', device: 'pw-e2e-admin' });
        await page.goto('/admin/settings');
        await expect(page.getByText('ŞUBELER', { exact: false })).toBeVisible({ timeout: 20_000 });
        await page.getByText('ŞUBELER', { exact: false }).click();
        await expect(page.getByText('Kota:', { exact: false })).toBeVisible();
    });
});
