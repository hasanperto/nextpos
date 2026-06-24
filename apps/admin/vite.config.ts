import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Yerel geliştirme: apps/admin/.env veya .env.local — bkz. .env.example */
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const port = Number(env.DEV_SERVER_PORT || env.VITE_DEV_SERVER_PORT || 5176);
    const host = env.DEV_SERVER_HOST || env.VITE_DEV_SERVER_HOST || undefined;
    /** apps/api varsayılanı NEXTPOS_API_PORT/PORT yoksa 3101 (3001 Docker ile çakışabiliyor) */
    const apiTarget = env.API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3101';

    const proxyOnError = (label: string) => (err: Error, req: { url?: string } | undefined) => {
        console.error(`[vite-proxy:${label}] ${err.message}`);
        console.error(`[vite-proxy:${label}] istek: ${req?.url ?? '—'} → hedef: ${apiTarget}`);
        console.error('[vite-proxy] API çalışmıyor olabilir. Kök: npm run check:api  veya  npm run dev:stack');
    };

    const strictPort = env.DEV_SERVER_STRICT_PORT === '1' || env.VITE_DEV_SERVER_STRICT_PORT === '1';

    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@pos': path.resolve(__dirname, '../pos/src'),
            },
        },
        server: {
            port,
            ...(host ? { host } : {}),
            strictPort,
            proxy: {
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                    configure(proxy) {
                        proxy.on('error', proxyOnError('api'));
                    },
                },
                '/socket.io': {
                    target: apiTarget,
                    ws: true,
                    configure(proxy) {
                        proxy.on('error', proxyOnError('socket.io'));
                        proxy.on('proxyReqWs', (proxyReq, req, socket) => {
                            socket.on('error', (err) => {
                                console.error(`[vite-proxy:socket.io] socket error: ${err.message}`);
                            });
                        });
                    },
                },
            },
        },
    };
});
