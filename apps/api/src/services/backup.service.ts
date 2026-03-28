import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { queryPublic } from '../lib/db.js';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Yedeklerin kaydedileceği klasör
const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const initAutomatedBackups = () => {
    console.log('🛡️ Auto-Backup Service başlatıldı (Retention: Max 2 Yedek)');

    // Her gece saat 03:00'te çalışacak Cron Job
    cron.schedule('0 3 * * *', async () => {
        console.log('⏳ Otomatik yedekleme ve temizlik işlemi başlatılıyor...');
        await runAutomatedBackups();
    });

    // TEST İÇİN: Programı başlatırken hemen bir kez kontrol etsin
    // TODO: Canlıya alırken aşağıdaki satırı silebilirsiniz.
    setTimeout(runAutomatedBackups, 10000); 
};

export const runAutomatedBackups = async () => {
    try {
        // Tüm aktif restoranları getir
        const [tenants]: any = await queryPublic(`SELECT id, name, schema_name, subscription_plan FROM tenants WHERE status = 'active'`);

        for (const tenant of tenants) {
            const plan = tenant.subscription_plan; // 'enterprise', 'pro', 'basic'
            
            // Eğer Basic paketse oto-yedek yapma (veya kurallarınıza göre ayarlayabilirsiniz)
            if (plan !== 'enterprise' && plan !== 'pro') continue;

            // En son ne zaman yedek alınmış bulalım
            const [lastBackup]: any = await queryPublic(`
                SELECT created_at FROM system_backups 
                WHERE tenant_id = ? AND backup_type = 'tenant' 
                ORDER BY created_at DESC LIMIT 1
            `, [tenant.id]);

            let needsBackup = false;
            const now = new Date();

            if (lastBackup.length === 0) {
                // Hiç yedek alınmamışsa hemen al
                needsBackup = true;
            } else {
                const lastBackupDate = new Date(lastBackup[0].created_at);
                const hoursSinceLastBackup = (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60);

                if (plan === 'enterprise' && hoursSinceLastBackup >= 24) {
                    needsBackup = true; // Her gün
                } else if (plan === 'pro' && hoursSinceLastBackup >= (7 * 24)) {
                    needsBackup = true; // Haftada 1
                }
            }

            if (needsBackup) {
                await createAndSaveBackup(tenant);
                await enforceRetentionPolicy(tenant.id); // Sadece 2 yedek tutma kuralını uygula
            }
        }
    } catch (error) {
        console.error('❌ Otomatik yedekleme sırasında hata:', error);
    }
};

const createAndSaveBackup = async (tenant: any) => {
    console.log(`📦 [${tenant.name}] için otomatik yedek alınıyor... Paket: ${tenant.subscription_plan.toUpperCase()}`);
    
    const timestamp = Date.now();
    const filename = `${tenant.schema_name}_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    try {
        // Gerçek MySQL dump komutu (XAMPP için)
        // Eğer mysqldump PATH'de ekli değilse tam yolunu yazmanız gerekebilir, örn: d:\\xampp\\mysql\\bin\\mysqldump
        const dumpCommand = `d:\\xampp\\mysql\\bin\\mysqldump -u root ${tenant.schema_name} > "${filepath}"`;
        await execAsync(dumpCommand);

        // Dosya boyutunu al
        const stats = fs.statSync(filepath);

        // Veritabanına kaydet
        await queryPublic(`
            INSERT INTO system_backups (filename, size, status, backup_type, tenant_id, created_by)
            VALUES (?, ?, 'completed', 'tenant', ?, 'auto_system')
        `, [filename, stats.size, tenant.id]);

        console.log(`✅ [${tenant.name}] Yedekleme başarılı: ${filename}`);
    } catch (error) {
        console.error(`❌ [${tenant.name}] Yedekleme başarısız!`, error);
    }
};

const enforceRetentionPolicy = async (tenantId: string) => {
    try {
        // Bu tenant'a ait tüm yedekleri tarihe göre yeniden eskiye doğru sırala
        const [backups]: any = await queryPublic(`
            SELECT id, filename FROM system_backups 
            WHERE tenant_id = ? AND backup_type = 'tenant'
            ORDER BY created_at DESC
        `, [tenantId]);

        const MAX_BACKUPS = 2; // EN FAZLA TUTULACAK YEDEK SAYISI

        if (backups.length > MAX_BACKUPS) {
            // İlk 2 yedeği atla (kes), geri kalanları silinmek üzere al
            const backupsToDelete = backups.slice(MAX_BACKUPS);

            for (const backup of backupsToDelete) {
                const filepath = path.join(BACKUP_DIR, backup.filename);

                // 1. Dosyayı diskten sil (Eski yedekler yer kaplamasın)
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }

                // 2. Veritabanından sil
                await queryPublic(`DELETE FROM system_backups WHERE id = ?`, [backup.id]);

                console.log(`🗑️ Eski yedek silindi (Retention): ${backup.filename}`);
            }
        }
    } catch (error) {
        console.error('❌ Retention Policy uygulanırken hata oluştu:', error);
    }
};
