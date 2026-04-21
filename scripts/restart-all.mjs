/**
 * Tüm NextPOS stack portlarını boşaltır, ardından full dev stack başlatır.
 * - API: 5000 (apps/api/.env.local -> PORT)
 * - POS: 5173
 * - Admin (SaaS): 5176
 * - Reseller: 4001
 *
 * Kullanım (repo kökü):
 *   node scripts/restart-all.mjs
 *   npm run restart:all
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const killPort = require('kill-port');

async function main() {
    for (const p of [5000, 5173, 5176, 5177, 4001]) {
        try {
            await killPort(p);
            console.log(`[restart-all] Port ${p} serbest bırakıldı.`);
        } catch {
        }
    }

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const run = spawnSync(
        npmCmd,
        [
            'run',
            'dev',
            '--',
            '--filter=@nextpos/api',
            '--filter=pos',
            '--filter=admin',
            '--filter=reseller',
        ],
        { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    process.exit(run.status ?? 1);
}

main();

