import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import { queryPublic } from '../lib/db.js';

const execFileAsync = util.promisify(execFile);

const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/** DATABASE_URL → pg_dump ortamı (PostgreSQL) */
function pgConnectionEnv(): { host: string; port: string; user: string; password: string; database: string } | null {
    const raw = process.env.DATABASE_URL;
    if (!raw?.startsWith('postgresql')) return null;
    try {
        const u = new URL(raw);
        const database = u.pathname.replace(/^\//, '').split('?')[0];
        return {
            host: u.hostname,
            port: u.port || '5432',
            user: decodeURIComponent(u.username || 'postgres'),
            password: decodeURIComponent(u.password || ''),
            database,
        };
    } catch {
        return null;
    }
}

export const initAutomatedBackups = () => {
    console.log('🛡️ Auto-Backup Service başlatıldı (Retention: Max 2 Yedek, PostgreSQL pg_dump)');

    cron.schedule('0 3 * * *', async () => {
        console.log('⏳ Otomatik yedekleme ve temizlik işlemi başlatılıyor...');
        await runAutomatedBackups();
    });

    setTimeout(runAutomatedBackups, 10000);
};

export const runAutomatedBackups = async () => {
    try {
        const [tenants]: any = await queryPublic(
            `SELECT id, name, schema_name, subscription_plan FROM \`public\`.tenants WHERE status = 'active'`,
        );

        if (!Array.isArray(tenants)) return;

        for (const tenant of tenants) {
            const plan = tenant.subscription_plan;
            if (plan !== 'enterprise' && plan !== 'pro') continue;

            const [lastBackup]: any = await queryPublic(
                `
                SELECT created_at FROM \`public\`.system_backups
                WHERE tenant_id = ?::uuid AND backup_type = 'tenant'
                ORDER BY created_at DESC LIMIT 1
            `,
                [tenant.id],
            );

            let needsBackup = false;
            const now = new Date();

            if (!lastBackup?.length) {
                needsBackup = true;
            } else {
                const lastBackupDate = new Date(lastBackup[0].created_at);
                const hoursSinceLastBackup = (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60);

                if (plan === 'enterprise' && hoursSinceLastBackup >= 24) {
                    needsBackup = true;
                } else if (plan === 'pro' && hoursSinceLastBackup >= 7 * 24) {
                    needsBackup = true;
                }
            }

            if (needsBackup) {
                await createAndSaveBackup(tenant);
                await enforceRetentionPolicy(tenant.id);
            }
        }
    } catch (error) {
        console.error('❌ Otomatik yedekleme sırasında hata:', error);
    }
};

const createAndSaveBackup = async (tenant: { id: string; name: string; schema_name: string; subscription_plan: string }) => {
    console.log(`📦 [${tenant.name}] için otomatik yedek alınıyor... Paket: ${tenant.subscription_plan.toUpperCase()}`);
    const timestamp = Date.now();
    const filename = `${tenant.schema_name}_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    const pg = pgConnectionEnv();
    if (!pg) {
        console.warn('⚠️ DATABASE_URL PostgreSQL değil — otomatik pg_dump atlanıyor.');
        return;
    }

    try {
        const schema = tenant.schema_name;
        const env = { ...process.env, PGPASSWORD: pg.password };
        await execFileAsync('pg_dump', ['-h', pg.host, '-p', pg.port, '-U', pg.user, '-d', pg.database, '-n', schema, '-f', filepath], {
            env,
            maxBuffer: 50 * 1024 * 1024,
        });
        const stats = fs.statSync(filepath);
        await queryPublic(
            `
            INSERT INTO \`public\`.system_backups (filename, size, status, created_by, tenant_id, backup_type)
            VALUES (?, ?, 'completed', 'auto_system', ?::uuid, 'tenant')
        `,
            [filename, stats.size, tenant.id],
        );
        console.log(`✅ [${tenant.name}] Yedekleme başarılı: ${filename}`);
    } catch (error) {
        console.error(
            `❌ [${tenant.name}] Yedekleme başarısız (pg_dump PATH'te olmalı: https://www.postgresql.org/download/).`,
            error,
        );
    }
};

const enforceRetentionPolicy = async (tenantId: string) => {
    try {
        const [backups]: any = await queryPublic(
            `
            SELECT id, filename FROM \`public\`.system_backups
            WHERE tenant_id = ?::uuid AND backup_type = 'tenant'
            ORDER BY created_at DESC
        `,
            [tenantId],
        );

        const MAX_BACKUPS = 2;
        if (!Array.isArray(backups) || backups.length <= MAX_BACKUPS) return;

        const backupsToDelete = backups.slice(MAX_BACKUPS);
        for (const backup of backupsToDelete) {
            const fp = path.join(BACKUP_DIR, backup.filename);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
            await queryPublic(`DELETE FROM \`public\`.system_backups WHERE id = ?`, [backup.id]);
            console.log(`🗑️ Eski yedek silindi (Retention): ${backup.filename}`);
        }
    } catch (error) {
        console.error('❌ Retention Policy uygulanırken hata oluştu:', error);
    }
};
