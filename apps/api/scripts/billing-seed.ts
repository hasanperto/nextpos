/**
 * Faturalama tabloları + billing_modules / plan_module_rules seed (billing_schema.sql).
 * Çalıştır: npm run billing:seed  (apps/api içinden)
 */
import dotenv from 'dotenv';
dotenv.config();

import { testConnection, closePool } from '../src/lib/db.js';
import { migrateBillingTables } from '../src/services/billing.service.js';

async function main() {
    const ok = await testConnection();
    if (!ok) {
        console.error('❌ Veritabanı bağlantısı kurulamadı. DATABASE_URL (.env) kontrol edin.');
        process.exit(1);
    }
    await migrateBillingTables();
    console.log('✅ Billing şeması ve modül seed uygulandı (billing_schema.sql).');
    await closePool();
    process.exit(0);
}

main().catch(async (e) => {
    console.error(e);
    await closePool().catch(() => {});
    process.exit(1);
});
