import { chromium } from 'playwright';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = 'C:/Users/Perto/.gemini/antigravity/brain/c528b612-c150-4e18-bfaf-7283c951d508';

async function run() {
  console.log('🚀 Starting Cashier & Courier E2E Integration Simulation...');

  const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
  const SCHEMA = 'tenant_demo';

  // 1. Seed Orders in DB
  try {
    await pool.query(`SET search_path TO "${SCHEMA}", public`);
    console.log('Clearing previous test orders...');
    await pool.query("UPDATE users SET device_id = NULL, preferred_language = 'tr' WHERE username = 'courier_can'");
    await pool.query("DELETE FROM deliveries WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'Mustafa Test%')");
    await pool.query("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'Mustafa Test%')");
    await pool.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name LIKE 'Mustafa Test%')");
    await pool.query("DELETE FROM orders WHERE customer_name LIKE 'Mustafa Test%'");

    const courierId = 6;
    const orders = [
      { name: 'Mustafa Test 1', amount: 35.40, subtotal: 30.00, tax: 5.40 },
      { name: 'Mustafa Test 2', amount: 17.70, subtotal: 15.00, tax: 2.70 },
      { name: 'Mustafa Test 3', amount: 59.00, subtotal: 50.00, tax: 9.00 },
    ];

    for (const o of orders) {
      const oRes = await pool.query(
        `INSERT INTO orders (
           customer_name, order_type, source, subtotal, tax_amount, total_amount, 
           notes, delivery_address, delivery_phone, 
           payment_status, status, branch_id, courier_id, created_at, updated_at
         ) VALUES ($1, 'delivery'::order_type, 'cashier'::order_source, $2, $3, $4, 
                  'Kurye Test Siparis', 'Test Cd. No:1, Istanbul', '5001234567', 
                  'unpaid'::payment_status, 'ready'::order_status, 1, $5, NOW(), NOW())
         RETURNING id`,
        [o.name, o.subtotal, o.tax, o.amount, courierId]
      );
      const orderId = oRes.rows[0].id;
      await pool.query(
        `INSERT INTO deliveries (order_id, status, created_at)
         VALUES ($1, 'pending'::delivery_status, NOW())`,
        [orderId]
      );
      console.log(`✅ Order ${orderId} (${o.name}) created.`);
    }
  } catch (err) {
    console.error('Error seeding DB:', err);
    await pool.end();
    process.exit(1);
  }

  // 2. Playwright E2E Actions
  const browser = await chromium.launch({
    headless: false,
    slowMo: 800,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`[DIALOG] Accept dialog: "${dialog.message()}"`);
    await dialog.accept();
  });

  try {
    console.log('🔗 Navigating to login page...');
    await page.goto('http://localhost:5173/login?tenant=a1111111-1111-4111-8111-111111111111');
    await page.waitForLoadState('networkidle');

    console.log('Switching language to Turkish to match Turkish selectors...');
    const trFlag = page.locator('button:has-text("🇹🇷")');
    if (await trFlag.isVisible()) {
      await trFlag.click();
      await page.waitForTimeout(500);
    }

    console.log('Logging in as courier_can...');
    await page.locator('#username-input').fill('courier_can');
    await page.locator('#password-input').fill('kurye123');
    await page.locator('#login-button').click();

    console.log('Waiting for courier dashboard redirect...');
    await page.waitForURL('**/courier**', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Save initial screenshot
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'courier-dashboard-active.png') });
    console.log('📸 Saved courier-dashboard-active.png');

    // 2.1 Accept Order 1
    console.log('Accepting Order 1 (Mustafa Test 1)...');
    await page.locator('h3:has-text("Mustafa Test 1")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("PAKETİ TESLİM AL")').first().click();
    await page.waitForTimeout(2500); // Tab switches to AKTİF YOLCULUK automatically

    // Switch back to HAZIR PAKETLER tab to accept Order 2
    console.log('Switching back to HAZIR PAKETLER tab...');
    await page.locator('button:has-text("Hazır Paketler")').first().click();
    await page.waitForTimeout(1500);

    // 2.2 Accept Order 2
    console.log('Accepting Order 2 (Mustafa Test 2)...');
    await page.locator('h3:has-text("Mustafa Test 2")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("PAKETİ TESLİM AL")').first().click();
    await page.waitForTimeout(2500); // Tab switches to AKTİF YOLCULUK automatically

    // Click tab "AKTİF YOLCULUK" (just to be safe, although it auto-switched)
    console.log('Ensuring we are on AKTİF YOLCULUK tab...');
    await page.locator('button:has-text("Aktif Yolculuk")').first().click();
    await page.waitForTimeout(1500);

    // Save transit screenshot
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'courier-transit.png') });
    console.log('📸 Saved courier-transit.png');

    // 2.3 Deliver Order 1
    console.log('Delivering Order 1...');
    await page.locator('h3:has-text("Mustafa Test 1")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("ÖDEME AL")').first().click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("ÖDEMEYİ ONAYLA & BİTİR")').first().click();
    await page.waitForTimeout(1500);

    // Handle Signature Modal if visible
    const signatureCanvas = page.locator('canvas');
    if (await signatureCanvas.isVisible()) {
      console.log('Signature modal visible. Simulating drawing on canvas...');
      const box = await signatureCanvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForTimeout(500);
      await page.locator('button:has-text("Onayla")').last().click();
      await page.waitForTimeout(2500);
    }
    console.log('Order 1 delivered successfully!');

    // 2.4 Cancel Order 2
    console.log('Cancelling Order 2...');
    await page.locator('h3:has-text("Mustafa Test 2")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("İPTAL")').first().click();
    await page.waitForTimeout(1000);

    // Select reason chip
    await page.locator('button:has-text("Müşteri vazgeçti / Siparişi istemiyor")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("İPTAL")').last().click();
    await page.waitForTimeout(1000);

    // Click PIN digits 8, 8, 8, 8, 8, 8 in HandoverPINModal
    console.log('Entering handover PIN 888888...');
    for (let i = 0; i < 6; i++) {
      await page.locator('button:has-text("8")').first().click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(3000);
    console.log('Order 2 cancelled successfully!');

    // Switch to history tab
    console.log('Navigating to GEÇMİŞ TESLİMAT...');
    await page.locator('button:has-text("GEÇMİŞ TESLİMAT")').click();
    await page.waitForTimeout(3000);

    // Save history screenshot
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'courier-history.png') });
    console.log('📸 Saved courier-history.png');

    // 2.5 Cashier verification
    console.log('Navigating to Cashier page to verify updates...');
    await page.goto('http://localhost:5173/cashier');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);

    // Save cashier screenshot
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'cashier-order-detail.png') });
    console.log('📸 Saved cashier-order-detail.png');

  } catch (error) {
    console.error('❌ Error during E2E workflow:', error);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'courier-error.png') });
  } finally {
    await browser.close();
  }

  // 3. Database verification
  try {
    console.log('Running backend database validation...');
    await pool.query(`SET search_path TO "${SCHEMA}", public`);
    const res = await pool.query(
      `SELECT customer_name, status, total_amount, payment_status 
       FROM orders 
       WHERE customer_name LIKE 'Mustafa Test%' 
       ORDER BY customer_name`
    );
    console.log('\n--- Final Database Status ---');
    console.table(res.rows);
  } catch (err) {
    console.error('Error verifying DB results:', err);
  } finally {
    await pool.end();
  }
}

run();
