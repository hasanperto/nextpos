import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Yerel geliştirme: apps/pos/.env veya .env.local — bkz. .env.example */
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const port = Number(env.DEV_SERVER_PORT || env.VITE_DEV_SERVER_PORT || 5173);
    const host = env.DEV_SERVER_HOST || env.VITE_DEV_SERVER_HOST || '0.0.0.0';
    const apiTarget = env.API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001';

    const strictPortRaw = env.DEV_SERVER_STRICT_PORT ?? env.VITE_DEV_SERVER_STRICT_PORT;
    const strictPort = strictPortRaw == null ? true : strictPortRaw === '1' || strictPortRaw === 'true';

    return {
        plugins: [
            react(),
            tailwindcss(),
            VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['favicon.svg', 'icons.svg'],
                manifest: {
                    id: '/',
                    name: 'NextPOS Restaurant OS',
                    short_name: 'NextPOS',
                    description:
                        'Kasiyer, garson, mutfak, kurye, teslim ve yönetim — tam ekran PWA; çevrimdışı kuyruk ve senkron.',
                    theme_color: '#e91e63',
                    background_color: '#020617',
                    display: 'standalone',
                    display_override: ['standalone', 'minimal-ui'],
                    scope: '/',
                    start_url: '/login?pwa=1',
                    lang: 'tr',
                    orientation: 'any',
                    icons: [
                        {
                            src: '/favicon.svg',
                            sizes: 'any',
                            type: 'image/svg+xml',
                            purpose: 'any',
                        },
                        {
                            src: '/favicon.svg',
                            sizes: 'any',
                            type: 'image/svg+xml',
                            purpose: 'maskable',
                        },
                    ],
                    shortcuts: [
                        {
                            name: 'Kasiyer (POS)',
                            short_name: 'Kasiyer',
                            description: 'Satış ve masa terminali',
                            url: '/cashier',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                        {
                            name: 'Garson',
                            short_name: 'Garson',
                            description: 'Masa ve sipariş',
                            url: '/waiter',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                        {
                            name: 'Mutfak',
                            short_name: 'Mutfak',
                            description: 'Üretim ekranı',
                            url: '/kitchen',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                        {
                            name: 'Kurye',
                            short_name: 'Kurye',
                            description: 'Teslimat paneli',
                            url: '/courier',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                        {
                            name: 'Yönetim',
                            short_name: 'Admin',
                            url: '/admin',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                        {
                            name: 'Teslim / HAZIR',
                            short_name: 'Teslim',
                            url: '/handover',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                        {
                            name: 'Sıra ekranı',
                            short_name: 'Sıra',
                            url: '/queue',
                            icons: [{ src: '/favicon.svg', sizes: 'any' }],
                        },
                    ],
                    launch_handler: {
                        client_mode: 'navigate-existing',
                    },
                },
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff}'],
                    navigateFallback: 'index.html',
                    navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io/],
                    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                    runtimeCaching: [
                        {
                            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'google-fonts',
                                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            },
                        },
                    ],
                },
                devOptions: {
                    enabled: false,
                },
            }),
        ],
        server: {
            port,
            host,
            strictPort,
            proxy: {
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                '/socket.io': {
                    target: apiTarget,
                    ws: true,
                },
                /** Yerel yazıcı köprüsü: npm run printer-agent (127.0.0.1:3910) */
                '/__printer_agent': {
                    target: 'http://127.0.0.1:3910',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/__printer_agent/, ''),
                },
            },
        },
    };
});
