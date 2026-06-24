const { chromium } = require('playwright');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos" });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function triggerWebhook(phone, name) {
  try {
    const res = await fetch('http://localhost:5173/api/v1/integrations/caller-id?tenant=a1111111-1111-4111-8111-111111111111&key=DEMO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, name })
    });
    const data = await res.json();
    console.log(`📡 Triggered Caller ID for ${name}:`, data);
  } catch (err) {
    console.error(`❌ Webhook error:`, err.message);
  }
}

async function run() {
  console.log('🚀 Launching Chromium...');
  const browser = await chromium.launch({
    headless: true, // Run headless since we're taking a screenshot
    slowMo: 500
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  try {
    // 1. Navigate directly to login with tenant UUID and user prepopulated
    console.log('🔑 Navigating to login...');
    await page.goto('http://localhost:5173/cashier?tenant=a1111111-1111-4111-8111-111111111111&user=admin');
    await page.waitForLoadState('networkidle');

    // 2. Fill password and log in
    console.log('✏️ Filling credentials...');
    const tenantInput = page.locator('#tenant-id-input');
    if (await tenantInput.isVisible()) {
      await tenantInput.fill('a1111111-1111-4111-8111-111111111111');
    }
    const usernameInput = page.locator('#username-input');
    if (await usernameInput.isVisible()) {
      await usernameInput.fill('admin');
    }
    await page.locator('#password-input').fill('admin123');
    await page.locator('#login-button').click();

    // 3. Wait for redirect/load to admin screen, then go to cashier
    console.log('⏳ Waiting for Admin redirect...');
    await page.waitForURL('**/admin');
    await page.waitForLoadState('networkidle');
    console.log('🔗 Navigating to Cashier page...');
    await page.goto('http://localhost:5173/cashier');
    await page.waitForLoadState('networkidle');
    await sleep(3000); // let UI load and sync socket

    // 4. Update order timestamps to match "now" so they fall within the time window
    console.log('🗄️ Aligning order timestamps in DB...');
    const client = await pool.connect();
    try {
      await client.query("SET search_path TO tenant_demo, public");
      await client.query("UPDATE orders SET created_at = NOW() WHERE delivery_phone IN ('05559998811', '05559998822', '05559998833')");
    } finally {
      client.release();
    }

    // 5. Trigger call webhooks
    console.log('📞 Simulating incoming calls...');
    await triggerWebhook('05559998811', 'İptal Müşterisi'); // Cancelled
    await sleep(1000);
    await triggerWebhook('05559998822', 'Teslim Edilen Müşteri'); // Delivered
    await sleep(1000);
    await triggerWebhook('05559998833', 'Bekleyen Müşteri'); // Preparing
    await sleep(2000); // Wait for socket messages to arrive and UI store to refresh

    // 6. Open Caller ID Modal via the header button
    console.log('📱 Opening Caller ID Modal...');
    // Locate the header button by finding the button with the class 'bg-emerald-500/5' or 'text-emerald-500'
    const callerIdBtn = page.locator('header button.text-emerald-500, header button:has(svg.FiPhoneCall)').first();
    await callerIdBtn.click();
    await sleep(2000); // Wait for modal animation to complete

    // 7. Check if modal is visible and take screenshots of all 3 calls
    console.log('📸 Capture verification screenshot for Preparing Order...');
    const screenshotPath = path.join(__dirname, 'caller-id-verify-preparing.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`✅ Preparing screenshot captured at: ${screenshotPath}`);

    // Click on Completed Order Call (Teslim Edilen Müşteri)
    console.log('👆 Clicking Completed Order Call...');
    await page.locator('button:has-text("05559998822")').first().click();
    await sleep(1500);
    const completedPath = path.join(__dirname, 'caller-id-verify-completed.png');
    await page.screenshot({ path: completedPath });
    console.log(`✅ Completed screenshot captured at: ${completedPath}`);

    // Click on Cancelled Order Call (İptal Müşterisi)
    console.log('👆 Clicking Cancelled Order Call...');
    await page.locator('button:has-text("05559998811")').first().click();
    await sleep(1500);
    const cancelledPath = path.join(__dirname, 'caller-id-verify-cancelled.png');
    await page.screenshot({ path: cancelledPath });
    console.log(`✅ Cancelled screenshot captured at: ${cancelledPath}`);

  } catch (err) {
    console.error('❌ Verification failed:', err);
    try {
      console.log('Current URL on error:', page.url());
      const failPath = path.join(__dirname, 'caller-id-verify-fail.png');
      await page.screenshot({ path: failPath });
      console.log(`📸 Failure screenshot captured at: ${failPath}`);
    } catch (scre) {
      console.error('Could not capture screenshot of failure:', scre.message);
    }
  } finally {
    await browser.close();
    await pool.end();
  }
}

run();
