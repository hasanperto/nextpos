/**
 * API (3001) ve POS Vite (5173) portlarını boşaltır, ardından dev:stack çalıştırır.
 * Kullanım (repo kökü): node scripts/restart-dev.mjs  veya  npm run restart:dev
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const killPort = require('kill-port');

async function main() {
    for (const p of [3001, 5173]) {
        try {
            await killPort(p);
            console.log(`[restart-dev] Port ${p} serbest bırakıldı.`);
        } catch {
            /* port boş veya izin yok */
        }
    }
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const run = spawnSync(npmCmd, ['run', 'dev:stack'], {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    process.exit(run.status ?? 1);
}

main();
