/**
 * Yerel NextPOS API'nin ayakta olup olmadığını kontrol eder.
 * Kullanım (repo kökü): npm run check:api
 * Port: NEXTPOS_API_PORT veya PORT (varsayılan 3101)
 */
import http from 'node:http';

const port = Number(process.env.NEXTPOS_API_PORT || process.env.PORT || 3101);
const path = '/api/v1/health';

const req = http.get(
    { hostname: '127.0.0.1', port, path, timeout: 4000 },
    (res) => {
        let body = '';
        res.on('data', (c) => {
            body += c;
        });
        res.on('end', () => {
            if (res.statusCode === 200) {
                try {
                    const j = JSON.parse(body);
                    if (j && j.name === 'NextPOS API') {
                        console.log(`[check:api] OK — NextPOS API 127.0.0.1:${port}`);
                        process.exit(0);
                    }
                } catch {
                    /* metin yanıt */
                }
                console.log(`[check:api] OK — 127.0.0.1:${port}${path} (HTTP 200)`);
                process.exit(0);
            }
            console.error(`[check:api] HTTP ${res.statusCode}: ${body.slice(0, 400)}`);
            console.error(
                `[check:api] Bu portta NextPOS API olmayabilir (başka uygulama veya yanlış sürüm). Port ${port} kullanan süreci kontrol edin.`,
            );
            process.exit(1);
        });
    },
);

req.on('error', (e) => {
    console.error(`[check:api] Bağlantı yok — 127.0.0.1:${port} (${e.message})`);
    console.error('[check:api] Çözüm: npm run dev:api  veya  npm run dev:stack  (PostgreSQL + .env)');
    console.error('[check:api] POS proxy farklı porta gidiyorsa apps/pos/.env.local → API_PROXY_TARGET=http://127.0.0.1:<port>');
    process.exit(1);
});

req.on('timeout', () => {
    req.destroy();
    console.error(`[check:api] Zaman aşımı — 127.0.0.1:${port}`);
    process.exit(1);
});
