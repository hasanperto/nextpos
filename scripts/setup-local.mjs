/**
 * İlk kurulum: Docker (Postgres+Redis), .env, prisma, isteğe bağlı seed.
 * Kullanım (repo kökü): node scripts/setup-local.mjs
 *
 * Ortam değişkenleri:
 *   SKIP_NPM_INSTALL=1     — npm install atlanır (EBUSY / turbo kilitliyse önce bunu kullanın)
 *   SETUP_SKIP_SEED=1        — db:setup (seed) atlanır
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');
const apiEnv = path.join(apiDir, '.env');
const apiEnvExample = path.join(apiDir, '.env.example');

function run(cmd, opts = {}) {
    console.log(`\n▶ ${cmd}\n`);
    execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, ...opts });
}

function isFileBusyError(err) {
    const s = String(err?.message || err || '');
    const code = err?.code;
    const errno = err?.errno;
    return (
        code === 'EBUSY' ||
        errno === -4082 ||
        /EBUSY|4082|resource busy|locked|copyfile/i.test(s)
    );
}

function ensureApiEnv() {
    if (fs.existsSync(apiEnv)) {
        console.log('✓ apps/api/.env zaten var, üzerine yazılmadı.');
        return;
    }
    if (!fs.existsSync(apiEnvExample)) {
        throw new Error('apps/api/.env.example bulunamadı');
    }
    let text = fs.readFileSync(apiEnvExample, 'utf8');
    const j1 = randomBytes(32).toString('hex');
    const j2 = randomBytes(32).toString('hex');
    if (/^JWT_SECRET=/m.test(text)) {
        text = text.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${j1}`);
    } else {
        text += `\nJWT_SECRET=${j1}\n`;
    }
    if (/^JWT_REFRESH_SECRET=/m.test(text)) {
        text = text.replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${j2}`);
    } else {
        text += `JWT_REFRESH_SECRET=${j2}\n`;
    }
    fs.writeFileSync(apiEnv, text, 'utf8');
    console.log('✓ apps/api/.env oluşturuldu (.env.example’dan, JWT dolduruldu).');
}

function dockerUp() {
    try {
        run('docker compose up -d', { cwd: root });
    } catch {
        console.warn('⚠ Docker başlatılamadı. PostgreSQL’i kendiniz çalıştırın; DATABASE_URL’i apps/api/.env içinde ayarlayın.');
    }
}

async function npmInstall() {
    if (process.env.SKIP_NPM_INSTALL === '1') {
        console.log('\n⏭ SKIP_NPM_INSTALL=1 — npm install atlandı.\n');
        return;
    }

    const win = process.platform === 'win32';
    /** Win: ilk 3 denemede kilidi errno bildirmese de yakala; sonra yalnızca EBUSY ile devam */
    const attempts = 5;
    const waitMs = 4000;

    for (let i = 0; i < attempts; i++) {
        try {
            execSync('npm install', { cwd: root, stdio: 'inherit', shell: true });
            return;
        } catch (e) {
            const busy = isFileBusyError(e);
            const last = i === attempts - 1;
            const retry =
                !last && (busy || (win && i < 3));
            if (retry) {
                console.warn(
                    `\n⚠ npm install başarısız (deneme ${i + 1}/${attempts})${busy ? ' [EBUSY/kilit]' : ''}.`
                );
                console.warn(
                    '   → Tüm "npm run dev" / turbo pencerelerinde Ctrl+C; gerekirse Cursor’u yeniden başlatın.\n'
                );
                console.warn(`   ${waitMs / 1000}s sonra yeniden deneniyor…\n`);
                await delay(waitMs);
                continue;
            }
            console.error(
                '\n❌ npm install başarısız.\n\n' +
                    'Windows’ta sık neden: başka terminalde POS/API (turbo) hâlâ çalışıyor → önce Ctrl+C ile durdurun.\n' +
                    'Paketler zaten kuruluysa atlayıp devam etmek için:\n' +
                    '   PowerShell:  $env:SKIP_NPM_INSTALL=\"1\"; npm run setup:local\n' +
                    '   CMD:         set SKIP_NPM_INSTALL=1&& npm run setup:local\n\n'
            );
            process.exit(1);
        }
    }
}

function prisma() {
    run('npx prisma generate', { cwd: apiDir });
    try {
        run('npx prisma db push', { cwd: apiDir });
    } catch {
        console.warn('⚠ prisma db push başarısız — veritabanı hazır olunca tekrar deneyin.');
    }
}

function maybeSeed() {
    if (process.env.SETUP_SKIP_SEED === '1') {
        console.log('SETUP_SKIP_SEED=1 — seed atlandı.');
        return;
    }
    try {
        run('npm run db:setup -w @nextpos/api', { cwd: root });
    } catch {
        console.warn('⚠ db:setup atlandı veya hata (isteğe bağlı).');
    }
}

async function main() {
    console.log('══ NextPOS — yerel kurulum ══\n');
    dockerUp();
    ensureApiEnv();
    await npmInstall();
    prisma();
    maybeSeed();
    console.log('\n✅ Kurulum adımları tamam. Başlatmak için: npm run dev:stack veya npm run restart:dev\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
