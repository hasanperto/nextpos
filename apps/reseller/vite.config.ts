import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const port = Number(env.DEV_SERVER_PORT || env.VITE_DEV_SERVER_PORT || 4001);
    const host = env.DEV_SERVER_HOST || env.VITE_DEV_SERVER_HOST || '127.0.0.1';
    const apiTarget = env.API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000';
    const strictPort = env.DEV_SERVER_STRICT_PORT === '1' || env.VITE_DEV_SERVER_STRICT_PORT === '1';

    return {
        plugins: [react(), tailwindcss()],
        server: {
            port,
            host,
            strictPort,
            proxy: {
                '/api': { target: apiTarget, changeOrigin: true },
                '/socket.io': { target: apiTarget, ws: true },
            },
        },
    };
});
