import { defineConfig, devices } from '@playwright/test';

const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:5000';
const posBase = process.env.POS_BASE_URL || 'http://127.0.0.1:5173';

/** API-only koşularında Vite başlatılmaz: `npm run test:e2e:api` (cross-env ile PLAYWRIGHT_NO_WEBSERVER=1). */
const skipPosWebServer = process.env.PLAYWRIGHT_NO_WEBSERVER === '1';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? ['github', 'list'] : [['list']],
    ...(skipPosWebServer
        ? {}
        : {
              webServer: {
                  /** Kökten `npm -w pos` bazen yavaş/takılır; doğrudan pos paketinde Vite */
                  command: 'npm run dev',
                  cwd: './apps/pos',
                  url: posBase.endsWith('/') ? posBase : `${posBase}/`,
                  reuseExistingServer: !process.env.CI,
                  timeout: 120_000,
              },
          }),
    projects: [
        {
            name: 'api',
            testMatch: /api-smoke\.spec\.ts/,
            use: {
                baseURL: apiBase,
                extraHTTPHeaders: { Accept: 'application/json' },
            },
        },
        {
            name: 'pos-ui',
            testMatch: /pos-(login|routing|flows)\.spec\.ts/,
            use: {
                ...devices['Desktop Chrome'],
                baseURL: posBase,
            },
        },
    ],
});
