import { test, expect } from '@playwright/test';

/**
 * API çalışırken: `npm run dev:api` veya `PORT=3001` ile `npm start` (apps/api).
 * Özel adres: `API_BASE_URL=http://localhost:3002 npm run test:e2e`
 */
test.describe('API duman (public uçlar)', () => {
    test('GET /api/v1/health', async ({ request }) => {
        const res = await request.get('/api/v1/health');
        expect(res.ok(), `status ${res.status()}`).toBeTruthy();
        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(body.name).toContain('NextPOS');
        expect(typeof body.instanceId).toBe('string');
        expect(body.instanceId.length).toBeGreaterThan(0);
        expect(typeof body.socket?.redisAdapterReady).toBe('boolean');
    });

    test('GET /api/v1/languages', async ({ request }) => {
        const res = await request.get('/api/v1/languages');
        expect(res.ok(), `status ${res.status()}`).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
        const h = res.headers();
        expect(h['x-ratelimit-limit'] || h['ratelimit-limit']).toBeTruthy();
    });

    test('POST /api/v1/integrations/caller-id zorunlu alan doğrulaması', async ({ request }) => {
        const res = await request.post('/api/v1/integrations/caller-id', {
            data: { number: '05320000000' },
        });
        expect(res.status()).toBe(400);
        const body = await res.json();
        expect(String(body.error || '')).toContain('Tenant ID');
    });
});
