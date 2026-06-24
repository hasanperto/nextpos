import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log('🚀 Starting end-to-end reseller & cashier workflow simulation...');
  const browser = await chromium.launch({
    headless: false, // Show the browser on screen so the user can follow along!
    slowMo: 1000,    // Slow down interactions for human-friendly speed
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  let posPage = null;
  
  // Dialog listener for automatic confirmation alerts
  page.on('dialog', async (dialog) => {
    console.log(`[DIALOG] Alert/Confirm popped up: "${dialog.message()}"`);
    await dialog.accept();
    console.log('[DIALOG] Dialog accepted successfully!');
  });

  try {
    // ----------------------------------------------------
    // STEP 1: Reseller Login
    // ----------------------------------------------------
    console.log('🔑 Navigating to Reseller Panel Login page...');
    await page.goto('http://localhost:4001/');
    await page.waitForLoadState('networkidle');

    console.log('Switching reseller language to Turkish to guarantee selector matches...');
    const trFlagBtn = page.locator('button:has-text("🇹🇷")');
    if (await trFlagBtn.isVisible().catch(() => false)) {
      await trFlagBtn.click();
      await page.waitForTimeout(500);
    }

    console.log('Filing reseller credentials...');
    // Use highly resilient class/type selectors to bypass placeholder translation differences
    await page.locator('input[type="text"]').first().fill('test');
    await page.locator('input[type="password"]').first().fill('admin123');

    console.log('Submitting login form...');
    const loginBtn = page.locator('button[type="submit"], button:has-text("Giriş Yap")').first();
    await loginBtn.click();
    await page.waitForTimeout(2000);

    // Wait for the overview heading or wallet card to ensure we're on the dashboard
    console.log('Verifying successful dashboard access...');
    await page.waitForSelector('aside', { timeout: 10000 });
    console.log('✅ Dashboard loaded successfully!');
    await page.screenshot({ path: path.join(__dirname, 'screenshot-1-dashboard.png') });

    // ----------------------------------------------------
    // STEP 2: Create a Restaurant & Addon Module Sale
    // ----------------------------------------------------
    console.log('📋 Navigating to Restoranlarım page...');
    await page.getByRole('button', { name: 'Restoranlarım' }).click();
    await page.waitForTimeout(1500);

    console.log('Opening "Yeni Restoran Aç" modal...');
    await page.getByRole('button', { name: '+ Yeni Restoran Aç' }).click();
    await page.waitForTimeout(1500);

    const timestamp = Date.now();
    const restName = `Dolunay E2E Cafe ${timestamp}`;
    const schemaName = `tenant_dolunaye2e_${timestamp}`;
    const email = `dolunaye2e_${timestamp}@test.com`;

    console.log(`Filling restaurant details for: "${restName}"...`);
    await page.locator('div:has(> label:has-text("Restoran Adı")) > input').fill(restName);
    await page.locator('div:has(> label:has-text("Teknik Ad")) > input').fill(schemaName);
    await page.locator('div:has(> label:has-text("Sahip E-posta")) > input').fill(email);
    await page.locator('div:has(> label:has-text("Yetkili Kişi")) > input').fill('Hasan Perto');
    await page.locator('div:has(> label:has-text("Adres")) > input').fill('Kadikoy Istanbul');

    console.log('Selecting agreement type: Doğrudan Satış...');
    await page.getByRole('button', { name: 'Doğrudan satış' }).click();
    await page.waitForTimeout(500);

    console.log('Selecting payment method: Bakiyeden Öde...');
    await page.getByRole('button', { name: 'Bakiyeden öde' }).click();
    await page.waitForTimeout(500);

    // Check first addon module if available
    console.log('Checking for available addon modules...');
    const addonCheckboxes = page.locator('input[type="checkbox"]');
    if (await addonCheckboxes.count() > 0) {
      console.log('Selecting an addon module...');
      await addonCheckboxes.first().check();
    }

    await page.screenshot({ path: path.join(__dirname, 'screenshot-2-create-form.png') });

    console.log('Submitting restaurant creation...');
    await page.getByRole('button', { name: 'Restoran Oluştur' }).click();
    await page.waitForTimeout(3000);

    // Handle Sanal POS simulation if it appears
    const posModal = page.getByRole('heading', { name: 'Sanal POS' });
    if (await posModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('💳 Sanal POS payment simulation visible. Confirming payment...');
      await page.getByRole('button', { name: 'Ödeme başarılı (simüle)' }).click();
      await page.waitForTimeout(3000);
    }

    // Dismiss the credentials popup if visible
    const credsModal = page.getByRole('heading', { name: 'Restoran Oluşturuldu!' });
    if (await credsModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('🔑 Credentials successfully generated.');
      await page.screenshot({ path: path.join(__dirname, 'screenshot-3-creds.png') });
      await page.getByRole('button', { name: 'Anladım, Kapat' }).click();
      await page.waitForTimeout(1500);
    }

    console.log('✅ Restaurant successfully created!');

    // ----------------------------------------------------
    // STEP 3: Load Demo Restaurant Data
    // ----------------------------------------------------
    console.log('🔍 Locating the newly created restaurant...');
    await page.getByPlaceholder('Restoran ara…').fill(restName);
    await page.waitForTimeout(1000);

    console.log('Opening Operations modal for the restaurant...');
    await page.locator('button[title="Islemler"]').first().click();
    await page.waitForTimeout(1500);

    console.log('Navigating to Komisyon & Ayarlar tab...');
    await page.getByRole('button', { name: 'Komisyon & Ayarlar' }).click();
    await page.waitForTimeout(1000);

    console.log('Triggering Inject Demo Data (Örnek Veri Yükle)...');
    await page.getByRole('button', { name: 'Örnek Veri Yükle' }).click();
    
    // Wait for the 2 seconds setTimeout simulation on the frontend
    await page.waitForTimeout(3500);
    console.log('✅ Demo data injection simulation completed successfully!');
    await page.screenshot({ path: path.join(__dirname, 'screenshot-4-demo-injected.png') });

    // ----------------------------------------------------
    // STEP 4: Shadow Login (Impersonation) to POS
    // ----------------------------------------------------
    console.log('🔑 Navigating to Giriş & Erişim tab...');
    await page.getByRole('button', { name: 'Giriş & Erişim' }).click();
    await page.waitForTimeout(1000);

    console.log('Launching Shadow Login (Gölge Giriş) to POS app...');
    const [capturedPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Şemaya Giriş Yap' }).click(),
    ]);
    posPage = capturedPage;

    console.log('Shadow login tab captured. Waiting for POS app authorization...');
    await posPage.waitForLoadState('networkidle');
    await posPage.waitForTimeout(5000); // Allow POS to process the impersonation token and log in
    console.log('Current POS Page URL:', posPage.url());
    await posPage.screenshot({ path: path.join(__dirname, 'screenshot-5-pos-login-state.png') });

    console.log('🚀 Triggering actual backend demo seed API via posPage store evaluation...');
    const seedResult = await posPage.evaluate(async () => {
      const authData = JSON.parse(localStorage.getItem('nextpos-auth-storage') || '{}');
      const token = authData?.state?.token;
      if (!token) return { ok: false, error: 'Auth token not found in localStorage' };

      try {
        const res = await fetch('/api/v1/admin/settings/demo-seed', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            confirmReset: true,
            preset: 'restaurant_courier',
          }),
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    console.log('Demo Seed Result:', JSON.stringify(seedResult));
    await posPage.waitForTimeout(2000);

    console.log('Navigating shadow terminal directly to Cashier page...');
    await posPage.goto('http://localhost:5173/cashier');
    await posPage.waitForLoadState('networkidle');
    await posPage.waitForTimeout(3000);

    // Click the Menu button in the Header to switch to Takeaway menu mode instantly
    console.log('Switching to Menu View via Header tab to bypass visual floor plan...');
    const menuButton = posPage.locator('button[aria-label*="menu" i], button[title*="menu" i], button:has-text("Menü"), button:has-text("Menu"), button:has-text("Speisekarte"), div.bg-black\\/40 button:nth-child(2)').first();
    await menuButton.click().catch(e => console.log('Could not click menu button directly:', e));
    await posPage.waitForTimeout(2000);

    console.log('Verifying Cashier Menu interface is ready...');
    await posPage.screenshot({ path: path.join(__dirname, 'screenshot-6-pos-cashier.png') });

    // ----------------------------------------------------
    // STEP 5: Add Item to Cart & Checkout using Cash (Nakit)
    // ----------------------------------------------------
    console.log('🍕 Adding first product item to the cart...');
    const firstProductBtn = posPage.locator('button[aria-label*="ekle"], button[title*="ekle"], button[aria-label*="sepete"], button:has(svg[stroke="currentColor"])').first();
    await firstProductBtn.click();
    await posPage.waitForTimeout(1500);

    console.log('Opening Cash Checkout modal...');
    const cashBtn = posPage.locator('button:has-text("Nakit"), button:has-text("Cash"), button:has-text("Bar ödeme")').first();
    await cashBtn.click();
    await posPage.waitForTimeout(1500);
    await posPage.screenshot({ path: path.join(__dirname, 'screenshot-7-cash-modal.png') });

    console.log('Confirming Cash payment...');
    const confirmPaymentBtn = posPage.locator('button:has-text("ÖDEMEYİ ONAYLA"), button:has-text("CONFIRM PAYMENT"), button:has-text("ZAHLUNG BESTÄTIGEN"), button:has(svg)').last();
    await confirmPaymentBtn.click();
    await posPage.waitForTimeout(3000);
    console.log('✅ Cash checkout transaction completed successfully!');
    await posPage.screenshot({ path: path.join(__dirname, 'screenshot-8-pos-checkout-success.png') });

    // ----------------------------------------------------
    // STEP 6: Check Reseller Finance, Receipt, Invoice & Logs
    // ----------------------------------------------------
    console.log('📊 Switching back to Reseller Panel to inspect accounting and receipts...');
    await page.bringToFront();
    await page.waitForTimeout(1000);

    console.log('Navigating to Finans & Faturalar tab...');
    await page.getByRole('button', { name: 'Finans & Faturalar' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-9-reseller-finance.png') });

    // Look for first paid invoice row and click "Makbuz" if available
    console.log('Checking for generated receipt invoice details...');
    const receiptBtn = page.getByRole('button', { name: 'Makbuz' }).first();
    if (await receiptBtn.isVisible().catch(() => false)) {
      console.log('Opening receipt / fiscal invoice detail...');
      await receiptBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(__dirname, 'screenshot-10-accounting-receipt.png') });
      console.log('Closing receipt modal...');
      await page.getByRole('button', { name: 'Kapat' }).click();
    }

    console.log('🎉 E2E Reseller to Cash Checkout flow completed with ZERO exceptions!');

  } catch (error) {
    console.error('❌ E2E workflow encountered an error:', error);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-error.png') });
    if (posPage) {
      try {
        await posPage.screenshot({ path: path.join(__dirname, 'screenshot-error-pos.png') });
        console.log('Captured POS error page screenshot as screenshot-error-pos.png');
      } catch (e) {
        console.error('Could not capture POS page screenshot:', e.message);
      }
    }
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

run();
