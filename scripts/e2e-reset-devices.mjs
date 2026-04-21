const TENANT_ID = process.env.E2E_TENANT_ID || 'a1111111-1111-4111-8111-111111111111';
const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:5000';

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth() {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${API_BASE}/api/v1/health`);
            if (res.ok) return;
        } catch {
        }
        await sleep(1000);
    }
    throw new Error('API health check timeout');
}

async function main() {
    await waitForHealth();
    const res = await fetch(`${API_BASE}/api/v1/dev/reset-devices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: TENANT_ID }),
    });
    const txt = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`reset-devices failed: status=${res.status} body=${txt}`);
    process.stdout.write(`[e2e-reset-devices] ${txt}\n`);
}

main().catch((e) => {
    console.error('[e2e-reset-devices] failed:', e);
    process.exit(1);
});
