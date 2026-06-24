import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const apiTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:3101';

    return {
        plugins: [react(), tailwindcss()],
        server: {
            port: 4003,
            host: '0.0.0.0',
            proxy: {
                '/api': { target: apiTarget, changeOrigin: true },
                '/socket.io': {
                    target: apiTarget,
                    ws: true,
                    configure(proxy) {
                        proxy.on('error', (err) => {
                            console.error(`[vite-proxy:socket.io] ${err.message}`);
                        });
                        proxy.on('proxyReqWs', (proxyReq, req, socket) => {
                            socket.on('error', (err) => {
                                console.error(`[vite-proxy:socket.io] socket error: ${err.message}`);
                            });
                        });
                    },
                },
            },
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
        },
    };
});
