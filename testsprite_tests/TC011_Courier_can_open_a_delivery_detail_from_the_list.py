import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to http://127.0.0.1:5173/login?device=testsprite-device
        await page.goto("http://127.0.0.1:5173/login?device=testsprite-device")
        
        # -> Reload the login page (force a full reload) and wait up to 5 seconds for the SPA to render so interactive elements appear.
        await page.goto("http://127.0.0.1:5173/login?device=testsprite-device")
        
        # -> Fill the tenant ID field with the provided tenant UUID, then enter username and password and submit the form to log in.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div[1]/div[3]/div[2]/div[1]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('a1111111-1111-4111-8111-111111111111')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div[1]/div[3]/div[2]/form/div[1]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div[1]/div[3]/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin123')
        
        # -> Fill the tenant UUID, then enter username and password, and submit the login form to sign in.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('a1111111-1111-4111-8111-111111111111')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        # -> Fill the tenant, username and password fields (clear then enter values) and submit the login form (send Enter) to sign in as admin.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('a1111111-1111-4111-8111-111111111111')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin123')
        
        # -> Fill tenant (index 570), username (index 572), password (index 573) and submit the login form (press Enter).
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('a1111111-1111-4111-8111-111111111111')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin123')
        
        # -> Fill tenant (index 770), username (index 784), password (index 792) and submit the login form (press Enter).
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('a1111111-1111-4111-8111-111111111111')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin123')
        
        # -> Fill tenant, username and password fields and submit the login form (send Enter). After submission, wait for the SPA to render and verify navigation to the courier/admin panel.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('a1111111-1111-4111-8111-111111111111')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div/div[3]/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin123')
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Delivery details')]").nth(0).is_visible(), "The delivery details view should be visible with delivery actions after selecting a delivery."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    