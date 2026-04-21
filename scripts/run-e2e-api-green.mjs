import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos',
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    PORT: process.env.PORT || '3001',
    API_BASE_URL: process.env.API_BASE_URL || 'http://127.0.0.1:3001',
    PLAYWRIGHT_NO_WEBSERVER: '1',
};

function run(command, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const cp = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            env,
            ...opts,
        });
        cp.on('error', reject);
        cp.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
        });
    });
}

async function waitForHealth(url, timeoutMs = 120000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const r = await fetch(url);
            if (r.ok) return;
        } catch {
            // ignore and retry
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`API health timeout: ${url}`);
}

async function killProcess(cp) {
    if (!cp?.pid) return;
    if (isWin) {
        await run('taskkill', ['/pid', String(cp.pid), '/T', '/F']).catch(() => {});
    } else {
        cp.kill('SIGTERM');
    }
}

let apiProc;
try {
    console.log('▶ Docker compose: postgres + redis');
    try {
        await run('docker', ['compose', 'up', '-d', 'postgres', 'redis']);
    } catch (e) {
        console.warn('⚠ Docker compose başlatılamadı. Docker kapalıysa servisleri manuel açın.');
        console.warn(`⚠ Detay: ${String(e?.message || e)}`);
    }

    console.log('▶ Prisma db push');
    try {
        await run(npmCmd, ['run', 'db:push', '-w', '@nextpos/api']);
    } catch (e) {
        throw new Error(
            `db:push başarısız. PostgreSQL ayakta mı? DATABASE_URL=${env.DATABASE_URL}\n${String(e?.message || e)}`
        );
    }

    console.log('▶ Seed/setup');
    await run(npmCmd, ['run', 'db:setup']);

    console.log('▶ Start API');
    apiProc = spawn(npmCmd, ['run', 'dev:api'], { stdio: 'inherit', shell: true, env });

    console.log('▶ Wait health');
    await waitForHealth(`${env.API_BASE_URL}/api/v1/health`);

    console.log('▶ Run API smoke');
    await run(npmCmd, ['run', 'test:e2e:api']);

    console.log('✓ E2E API green run tamam');
} finally {
    await killProcess(apiProc);
}
