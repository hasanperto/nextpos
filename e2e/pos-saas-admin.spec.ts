import { test, expect } from '@playwright/test';

test.describe('SaaS Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    // SaaS Admin login sayfasını aç
    await page.goto('/saas-admin');
    
    // Eğer zaten logged in isek (Dashboard başlığını görüyorsak) girişi atla
    const overviewHeading = page.getByRole('heading', { name: /Genel Bakış|Overview/i });
    if (await overviewHeading.isVisible({ timeout: 3000 })) {
      return;
    }
    
    // Login formunu doldur (varsayılan süper admin)
    await page.getByPlaceholder('e.g. admin').fill('superadmin');
    await page.getByPlaceholder('••••••••').fill('superadmin123');
    await page.click('button:has-text("GÜVENLİ GİRİŞ YAP"), button:has-text("SIGN IN SECURELY")');
    
    // Login başarısını kontrol et (Dashboard başlığını bekle)
    await expect(overviewHeading).toBeVisible({ timeout: 15000 });
  });

  test('dashboard görünür (smoke)', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Genel Bakış|Overview/i })).toBeVisible({ timeout: 15000 });
  });
});
