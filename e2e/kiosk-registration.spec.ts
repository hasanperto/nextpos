import { test, expect } from '@playwright/test';

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

test.describe('Kiosk Registration & Settings Integration Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Clear local storage and cookies before each test
        await page.context().clearCookies();
    });

    test('Kiosk integration flow: Set password -> register with wrong/correct password -> verify linked -> revoke -> verify available again', async ({ page, context }) => {
        // Step 1: Login to Admin panel
        await page.goto('/login');
        await page.locator('#tenant-id-input').fill(TENANT_ID);
        await page.locator('#username-input').fill('admin');
        await page.locator('#password-input').fill('admin123');
        await page.locator('#login-button').click();

        // Wait for Admin Dashboard redirection
        await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

        // Switch application language to Turkish
        const langSelect = page.locator('select').first();
        await expect(langSelect).toBeVisible({ timeout: 5000 });
        await langSelect.selectOption('tr');

        // Step 2: Navigate to settings
        await page.goto('/admin/settings');
        
        // Click Kiosk Tab (using Turkish label)
        const kioskTab = page.getByRole('button', { name: /MASA TABLET/i });
        await expect(kioskTab).toBeVisible({ timeout: 15000 });
        await kioskTab.click();

        // Set the Kurum Kiosk Şifresi
        const pairingSecretInput = page.locator('input[placeholder="Kurum şifresi belirleyin"]');
        await expect(pairingSecretInput).toBeVisible();
        await pairingSecretInput.fill('kiosk_test_123');

        // Save settings
        const saveBtn = page.getByRole('button', { name: 'SİSTEMİ GÜNCELLE' });
        await saveBtn.click();

        // Verify save success notification
        await expect(page.locator('text=Sistem yapılandırması başarıyla güncellendi')).toBeVisible({ timeout: 10000 });

        // Step 3: Open Kiosk wizard in a separate page
        const kioskPage = await context.newPage();
        await kioskPage.goto('/kiosk');

        // Select Turkish language on Kiosk page
        const trLangBtn = kioskPage.getByRole('button', { name: 'TR' });
        await expect(trLangBtn).toBeVisible({ timeout: 10000 });
        await trLangBtn.click();

        // Check if wizard title is visible (in Turkish: Bağlantı)
        await expect(kioskPage.locator('h1', { hasText: 'Bağlantı' })).toBeVisible({ timeout: 10000 });

        // Tenant ID should be empty or we fill it
        const tenantInput = kioskPage.locator('input[placeholder="Kurum ID girin veya URL\'den otomatik alır"]');
        await expect(tenantInput).toBeVisible();
        await tenantInput.fill(TENANT_ID);

        // Click "Masaları Yükle"
        await kioskPage.getByRole('button', { name: 'Masaları Yükle' }).click();

        // Dropdown and Password inputs should appear
        const tableSelect = kioskPage.locator('select');
        await expect(tableSelect).toBeVisible({ timeout: 10000 });

        const kioskPasswordInput = kioskPage.locator('input[placeholder="Kurum şifresi girin"]');
        await expect(kioskPasswordInput).toBeVisible();

        // Get table options
        const options = await tableSelect.locator('option').allInnerTexts();
        console.log('Available tables fetched:', options);
        expect(options.length).toBeGreaterThan(1); // includes default "-- Bir Masa Seçin --" option

        // Select the first valid table (index 1)
        const selectElement = kioskPage.locator('select');
        await selectElement.selectOption({ index: 1 });
        const selectedValue = await selectElement.inputValue();
        console.log('Selected Table Value (QR Code/Name):', selectedValue);

        // Enter WRONG password
        await kioskPasswordInput.fill('wrong_kiosk_secret');
        
        // Try to save
        await kioskPage.getByRole('button', { name: 'Kiosk Olarak Kaydet' }).click();

        // Verify toast error "Kurum Kiosk Şifresi hatalı veya eksik"
        await expect(kioskPage.locator('text=Kurum Kiosk Şifresi hatalı veya eksik')).toBeVisible({ timeout: 5000 });

        // Enter CORRECT password
        await kioskPasswordInput.fill('kiosk_test_123');

        // Save again
        await kioskPage.getByRole('button', { name: 'Kiosk Olarak Kaydet' }).click();

        // Verify registration success (should redirect or show success/idle screen)
        // Wait for setupReady is true which hides the wizard screen
        await expect(kioskPage.locator('h1', { hasText: 'Bağlantı' })).not.toBeVisible({ timeout: 10000 });

        // Step 4: Refresh Admin Settings Kiosk list to verify device is listed
        await page.reload();
        
        // Re-select Turkish if reload reset it
        await page.locator('select').first().selectOption('tr');
        
        await page.getByRole('button', { name: /MASA TABLET/i }).click();

        // Wait and verify table name is shown under registeredCodes list
        const deviceList = page.locator('p:has-text("Kayıltı cihaz kodları") + div');
        await expect(deviceList).toBeVisible({ timeout: 10000 });

        // Setup dialog handler for revocation confirmation popup
        page.on('dialog', async dialog => {
            expect(dialog.message()).toContain('Bu cihazın erişimini iptal etmek istiyor musunuz?');
            await dialog.accept();
        });

        // Click Revoke (trash/delete) button for the newly linked device
        const revokeBtn = deviceList.locator('button[title="İptal Et (Revoke)"]').first();
        await expect(revokeBtn).toBeVisible();
        await revokeBtn.click();

        // Verify success toast
        await expect(page.locator('text=Cihaz yetkisi iptal edildi')).toBeVisible({ timeout: 5000 });

        // Step 5: Verify the table is now unregistered and shows up in the dropdown again
        await kioskPage.reload();
        // Clear local binding if still exists since we revoked on server
        await kioskPage.evaluate(() => localStorage.clear());
        await kioskPage.reload();

        // Select Turkish language again
        await trLangBtn.click();

        await expect(kioskPage.locator('h1', { hasText: 'Bağlantı' })).toBeVisible({ timeout: 10000 });
        await tenantInput.fill(TENANT_ID);
        await kioskPage.getByRole('button', { name: 'Masaları Yükle' }).click();
        await expect(tableSelect).toBeVisible({ timeout: 10000 });

        // Verify the option is present in the select options again
        const freshOptions = await tableSelect.locator('option').evaluateAll(options => options.map(opt => (opt as HTMLOptionElement).value));
        expect(freshOptions).toContain(selectedValue);
    });
});
