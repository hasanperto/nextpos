import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type TenantConfig = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
    subscriptionPlan: string;
    contactEmail: string | null;
    contactPhone: string | null;
    address: string | null;
    settings: unknown;
    branchSettings?: unknown;
};

type AutomationLog = {
    ts: string;
    level: 'info' | 'warn' | 'error';
    step: string;
    domain: string;
    tenantId: string;
    message: string;
    meta?: Record<string, unknown>;
};

export type AaPanelProvisionResult = {
    ok: boolean;
    siteDir?: string;
    confPath?: string;
    certIssued?: boolean;
    skipped?: string;
    error?: string;
};

function envBool(name: string, defaultValue = false): boolean {
    const v = String(process.env[name] ?? '').trim().toLowerCase();
    if (!v) return defaultValue;
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function mustEnv(name: string): string {
    const value = String(process.env[name] ?? '').trim();
    if (!value) {
        throw new Error(`Missing required env: ${name}`);
    }
    return value;
}

function safeDomain(domain: string): string {
    const d = String(domain || '').trim().toLowerCase();
    if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) {
        throw new Error(`Invalid domain format: ${domain}`);
    }
    return d;
}

function confTextHttpOnly(domain: string, siteDir: string, apiOrigin: string, acmeRoot: string): string {
    return `
server {
    listen 80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        alias ${acmeRoot}/;
        default_type "text/plain";
    }

    root ${siteDir};
    index index.html;

    location /api/ {
        proxy_pass ${apiOrigin};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`.trim();
}

function confTextWithSsl(domain: string, siteDir: string, apiOrigin: string, acmeRoot: string, certDir: string): string {
    return `
server {
    listen 80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        alias ${acmeRoot}/;
        default_type "text/plain";
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate ${certDir}/fullchain.pem;
    ssl_certificate_key ${certDir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    root ${siteDir};
    index index.html;

    location /api/ {
        proxy_pass ${apiOrigin};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`.trim();
}

async function appendLog(entry: AutomationLog): Promise<void> {
    const fallback = path.resolve(process.cwd(), 'logs', 'qr-web-automation.log');
    const logFile = String(process.env.AAPANEL_QR_LOG_FILE || fallback);
    try {
        await fs.mkdir(path.dirname(logFile), { recursive: true });
        await fs.appendFile(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
        /* swallow file logging errors */
    }
    const line = `[qr-aaPanel][${entry.level}] ${entry.step} tenant=${entry.tenantId} domain=${entry.domain} ${entry.message}`;
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.log(line);
}

async function runCmd(step: string, tenantId: string, domain: string, bin: string, args: string[], timeoutMs = 90000) {
    await appendLog({ ts: new Date().toISOString(), level: 'info', step, tenantId, domain, message: `${bin} ${args.join(' ')}` });
    const out = await execFileAsync(bin, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 });
    const stdout = String(out.stdout || '').trim();
    const stderr = String(out.stderr || '').trim();
    if (stdout) {
        await appendLog({ ts: new Date().toISOString(), level: 'info', step, tenantId, domain, message: 'stdout', meta: { stdout: stdout.slice(0, 1500) } });
    }
    if (stderr) {
        await appendLog({ ts: new Date().toISOString(), level: 'warn', step, tenantId, domain, message: 'stderr', meta: { stderr: stderr.slice(0, 1500) } });
    }
}

export async function provisionQrWebInAaPanel(input: {
    domain: string;
    tenant: TenantConfig;
}): Promise<AaPanelProvisionResult> {
    const enabled = envBool('AAPANEL_QR_AUTOMATION_ENABLED', true);
    const domain = safeDomain(input.domain);
    const tenant = input.tenant;

    if (!enabled) {
        await appendLog({
            ts: new Date().toISOString(),
            level: 'info',
            step: 'skip',
            tenantId: tenant.id,
            domain,
            message: 'AAPANEL_QR_AUTOMATION_ENABLED=false',
        });
        return { ok: true, skipped: 'automation_disabled' };
    }

    const rootDir = mustEnv('AAPANEL_QR_WEB_ROOT');
    const templateDir = mustEnv('AAPANEL_QR_TEMPLATE_DIR');
    const nginxConfDir = mustEnv('AAPANEL_NGINX_CONF_DIR');
    const acmeRoot = mustEnv('AAPANEL_ACME_WEBROOT');
    const apiOrigin = mustEnv('AAPANEL_QR_API_ORIGIN').replace(/\/+$/, '');
    const certbotEmail = mustEnv('AAPANEL_CERTBOT_EMAIL');
    const certbotBin = String(process.env.AAPANEL_CERTBOT_BIN || 'certbot');
    const nginxBin = String(process.env.AAPANEL_NGINX_BIN || 'nginx');
    const certBaseDir = String(process.env.AAPANEL_CERT_PATH_BASE || '/etc/letsencrypt/live');

    const siteDir = path.join(rootDir, domain);
    const confPath = path.join(nginxConfDir, `${domain}.conf`);
    const certDir = path.join(certBaseDir, domain);

    const rollbackActions: Array<() => Promise<void>> = [];
    let certIssued = false;

    try {
        await appendLog({
            ts: new Date().toISOString(),
            level: 'info',
            step: 'start',
            tenantId: tenant.id,
            domain,
            message: `Provision start for ${tenant.name}`,
        });

        // Uniqueness / collision checks (DB unique check is done before this layer)
        for (const p of [siteDir, confPath, certDir]) {
            try {
                await fs.access(p);
                throw new Error(`Resource already exists: ${p}`);
            } catch (e: any) {
                if (e?.code !== 'ENOENT') throw e;
            }
        }

        await fs.mkdir(path.dirname(confPath), { recursive: true });
        await fs.mkdir(acmeRoot, { recursive: true });

        await appendLog({
            ts: new Date().toISOString(),
            level: 'info',
            step: 'copy_template',
            tenantId: tenant.id,
            domain,
            message: `Copy ${templateDir} -> ${siteDir}`,
        });
        await fs.cp(templateDir, siteDir, { recursive: true, errorOnExist: true, force: false });
        rollbackActions.push(async () => {
            await fs.rm(siteDir, { recursive: true, force: true });
        });

        const runtimeConfigPath = path.join(siteDir, 'tenant-config.json');
        await fs.writeFile(
            runtimeConfigPath,
            JSON.stringify(
                {
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    schemaName: tenant.schemaName,
                    status: tenant.status,
                    subscriptionPlan: tenant.subscriptionPlan,
                    contactEmail: tenant.contactEmail,
                    contactPhone: tenant.contactPhone,
                    address: tenant.address,
                    settings: tenant.settings || {},
                    branchSettings: tenant.branchSettings || {},
                    domain,
                    apiOrigin,
                    generatedAt: new Date().toISOString(),
                },
                null,
                2
            ),
            'utf8'
        );

        await fs.writeFile(confPath, confTextHttpOnly(domain, siteDir, apiOrigin, acmeRoot), 'utf8');
        rollbackActions.push(async () => {
            await fs.rm(confPath, { force: true });
            try {
                await runCmd('rollback_nginx_test', tenant.id, domain, nginxBin, ['-t']);
                await runCmd('rollback_nginx_reload', tenant.id, domain, nginxBin, ['-s', 'reload']);
            } catch {
                /* noop */
            }
        });

        await runCmd('nginx_test_http', tenant.id, domain, nginxBin, ['-t']);
        await runCmd('nginx_reload_http', tenant.id, domain, nginxBin, ['-s', 'reload']);

        await runCmd(
            'ssl_issue',
            tenant.id,
            domain,
            certbotBin,
            [
                'certonly',
                '--webroot',
                '-w',
                acmeRoot,
                '-d',
                domain,
                '--non-interactive',
                '--agree-tos',
                '-m',
                certbotEmail,
                '--keep-until-expiring',
                '--rsa-key-size',
                '4096',
            ],
            180000
        );
        certIssued = true;
        rollbackActions.push(async () => {
            try {
                await runCmd('rollback_cert_delete', tenant.id, domain, certbotBin, ['delete', '--cert-name', domain, '--non-interactive']);
            } catch {
                /* noop */
            }
        });

        await fs.writeFile(confPath, confTextWithSsl(domain, siteDir, apiOrigin, acmeRoot, certDir), 'utf8');
        await runCmd('nginx_test_ssl', tenant.id, domain, nginxBin, ['-t']);
        await runCmd('nginx_reload_ssl', tenant.id, domain, nginxBin, ['-s', 'reload']);

        await appendLog({
            ts: new Date().toISOString(),
            level: 'info',
            step: 'done',
            tenantId: tenant.id,
            domain,
            message: 'Provision completed successfully',
        });
        return { ok: true, siteDir, confPath, certIssued: true };
    } catch (error: any) {
        await appendLog({
            ts: new Date().toISOString(),
            level: 'error',
            step: 'failed',
            tenantId: tenant.id,
            domain,
            message: String(error?.message || error),
        });

        for (const undo of rollbackActions.reverse()) {
            try {
                await undo();
            } catch (rollbackErr: any) {
                await appendLog({
                    ts: new Date().toISOString(),
                    level: 'warn',
                    step: 'rollback_warn',
                    tenantId: tenant.id,
                    domain,
                    message: String(rollbackErr?.message || rollbackErr),
                });
            }
        }
        return {
            ok: false,
            siteDir,
            confPath,
            certIssued,
            error: String(error?.message || error),
        };
    }
}

