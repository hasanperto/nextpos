/**
 * NextPOS — Abonelik fiyatlandırma, modül satırları, vade / askıya alma cron
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { queryPublic, invalidateTenantCache, getPublicDatabaseName, mysqlParamsToPg } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** PostgreSQL: "public"."tablo" */
function tbl(table: string): string {
    return `"public"."${table}"`;
}

/** `split(';')` sonrası baştaki `--` satırlarını at; aksi halde CREATE/INSERT hiç çalışmıyordu */
function stripLeadingLineComments(sql: string): string {
    let s = sql.trim();
    while (s.startsWith('--')) {
        const nl = s.indexOf('\n');
        if (nl === -1) return '';
        s = s.slice(nl + 1).trim();
    }
    return s;
}

/** tsx: src/services → src/lib | node dist: dist/services → dist/lib veya kaynak src/lib */
function resolveBillingSchemaSqlPath(): string {
    const candidates = [
        path.join(__dirname, '../lib/billing_schema.sql'),
        path.join(__dirname, '../../src/lib/billing_schema.sql'),
        path.join(process.cwd(), 'src/lib/billing_schema.sql'),
        path.join(process.cwd(), 'apps/api/src/lib/billing_schema.sql'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(
        `billing_schema.sql bulunamadı. dist derlemesinde SQL kopyalanmamış olabilir. Denenen: ${candidates.join(' | ')}`
    );
}

export interface QuoteInput {
    planCode: string;
    moduleCodes: string[];
    /** Ek cihaz adedi (extra_device için quantity) */
    extraDeviceQty?: number;
    /** Ek yazıcı istasyonu adedi (extra_printer için quantity) */
    extraPrinterQty?: number;
    billingCycle: 'monthly' | 'yearly';
    annualDiscountPercent?: number;
}

export interface QuoteLine {
    code: string;
    name: string;
    setup: number;
    monthly: number;
    qty: number;
    /** Pakette ücretsiz dahil; fatura satırı 0 */
    includedInPlan?: boolean;
}

export interface QuoteBreakdown {
    planCode: string;
    planName: string;
    setupFee: number;
    monthlyService: number;
    modulesMonthly: number;
    modulesSetup: number;
    monthlyRecurringTotal: number;
    yearlyPrepayBeforeDiscount: number;
    annualDiscountPercent: number;
    yearlyPrepayTotal: number;
    firstInvoiceTotal: number;
    billingCycle: 'monthly' | 'yearly';
    lines: QuoteLine[];
}

export type PlanModuleMode = 'included' | 'addon' | 'locked';

export interface ModuleEntitlement {
    code: string;
    name: string;
    category: string;
    enabled: boolean;
    mode: PlanModuleMode;
    reason: 'included_in_plan' | 'purchased_addon' | 'not_purchased' | 'upgrade_required';
    /** billing_modules fiyatları (liste / ek modül sepeti) */
    setup_price: number;
    monthly_price: number;
    /** tenant_modules satırı (satın alınmış ek modül) */
    quantity?: number;
    monthlyLineTotal?: number;
}

export interface TenantModulesBillingSnapshot {
    planCode: string;
    billingCycle: 'monthly' | 'yearly';
    monthlyRecurringTotal: number;
    planBaseMonthly: number;
    monthlyFromAddons: number;
    nextPaymentDue: string | null;
}

/** payment_history tablosundan gelen bekleyen/vadesi geçmiş ödeme satırı */
export interface PendingPaymentLine {
    id: number;
    tenant_id: string;
    amount: number;
    currency: string;
    payment_type: 'subscription' | 'addon' | 'setup' | 'other';
    payment_method: string | null;
    description: string | null;
    status: 'pending' | 'overdue' | 'paid';
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
}

// 🛡️ Race condition koruması: birden fazla istek aynı anda migrateBillingTables çağırsa bile
// sadece ilki çalışsın, diğerleri ilkinin bitmesini beklesin.
let _tablesReady: Promise<void> | null = null;

/** queryPublic içindeki `public.` → `` `public`. `` dönüşümü bazı DDL/ifadeleri bozabildiği için ham SQL. */
function sqlCreatePlanModuleRulesTable(): string {
    const d = getPublicDatabaseName();
    return `CREATE TABLE IF NOT EXISTS \`${d}\`.\`plan_module_rules\` (
    \`plan_code\` VARCHAR(30) NOT NULL,
    \`module_code\` VARCHAR(50) NOT NULL,
    \`mode\` ENUM('included','addon','locked') NOT NULL DEFAULT 'addon',
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`plan_code\`, \`module_code\`),
    KEY \`idx_pmr_plan\` (\`plan_code\`),
    KEY \`idx_pmr_module\` (\`module_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
}

/**
 * Bağlantı varsayılan veritabanını seçmese bile `DATABASE_URL` içindeki şemada
 * faturalama tablolarını oluşturur. (Aksi halde CREATE TABLE billing_modules
 * yanlış DB'ye gider ve `public.billing_modules` bulunamaz.)
 */
export async function ensureBillingBaseTables(): Promise<void> {
    const d = getPublicDatabaseName();
    const Q = (name: string) => `\`${d}\`.\`${name}\``;

    const creates = [
        `CREATE TABLE IF NOT EXISTS ${Q('billing_modules')} (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`code\` VARCHAR(50) NOT NULL UNIQUE,
    \`name\` VARCHAR(120) NOT NULL,
    \`description\` VARCHAR(500) DEFAULT NULL,
    \`category\` ENUM('core','feature','channel','device','service','integration') NOT NULL DEFAULT 'feature',
    \`setup_price\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    \`monthly_price\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
    \`icon\` VARCHAR(50) DEFAULT NULL,
    \`sort_order\` INT NOT NULL DEFAULT 0,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS ${Q('tenant_modules')} (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`tenant_id\` CHAR(36) NOT NULL,
    \`module_code\` VARCHAR(50) NOT NULL,
    \`quantity\` INT NOT NULL DEFAULT 1,
    \`setup_line_total\` DECIMAL(10,2) NOT NULL DEFAULT 0,
    \`monthly_line_total\` DECIMAL(10,2) NOT NULL DEFAULT 0,
    \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY \`uq_tenant_module\` (\`tenant_id\`, \`module_code\`),
    KEY \`idx_tenant_modules_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS ${Q('tenant_billing')} (
    \`tenant_id\` CHAR(36) NOT NULL PRIMARY KEY,
    \`billing_cycle\` ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
    \`plan_code\` VARCHAR(30) NOT NULL DEFAULT 'starter',
    \`setup_fee_total\` DECIMAL(10,2) NOT NULL DEFAULT 0,
    \`monthly_recurring_total\` DECIMAL(10,2) NOT NULL DEFAULT 0,
    \`yearly_prepay_total\` DECIMAL(10,2) DEFAULT NULL,
    \`annual_discount_percent\` DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    \`reactivation_fee_percent\` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    \`next_payment_due\` DATE DEFAULT NULL,
    \`grace_days_after_due\` INT NOT NULL DEFAULT 1,
    \`last_payment_at\` DATETIME DEFAULT NULL,
    \`payment_current\` TINYINT(1) NOT NULL DEFAULT 1,
    \`suspended_at\` DATETIME DEFAULT NULL,
    \`suspension_reason\` VARCHAR(255) DEFAULT NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        `CREATE TABLE IF NOT EXISTS ${Q('billing_reminder_log')} (
    \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
    \`tenant_id\` CHAR(36) NOT NULL,
    \`kind\` VARCHAR(40) NOT NULL,
    \`message\` VARCHAR(500) DEFAULT NULL,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY \`idx_br_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        sqlCreatePlanModuleRulesTable(),
    ];

    for (const sql of creates) {
        try {
            await pool.query(sql + ';');
        } catch (e: any) {
            console.error('ensureBillingBaseTables:', e?.message || e);
        }
    }
}

/**
 * Eski kurulumlarda `billing_modules` tablosunda eksik kalan sütunları idempotent tamamlar.
 * `migrateBillingTables` sadece ilk seferde ALTER çalıştırdığı için (tablesReady) aksi halde
 * GET /modules/admin SELECT icon ile 500 veriyordu.
 */
export async function ensureBillingModuleColumns(): Promise<void> {
    const db = getPublicDatabaseName();
    const bm = `\`${db}\`.billing_modules`;

    try {
        await queryPublic(
            `ALTER TABLE ${bm} MODIFY COLUMN category ENUM('core','feature','channel','device','service','integration') NOT NULL DEFAULT 'feature'`
        );
    } catch {
        /* sütun yoksa veya zaten uyumlu */
    }
    const hasCol = async (name: string) => {
        const [chk]: any = await queryPublic(
            `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'billing_modules' AND COLUMN_NAME = ?`,
            [db, name]
        );
        return Number(chk?.[0]?.c || 0) > 0;
    };
    try {
        if (!(await hasCol('icon'))) {
            await queryPublic(`ALTER TABLE ${bm} ADD COLUMN icon VARCHAR(50) DEFAULT NULL AFTER is_active`);
        }
    } catch (e: any) {
        console.warn('ensureBillingModuleColumns icon:', e?.message || e);
    }
    try {
        if (!(await hasCol('created_at'))) {
            await queryPublic(`ALTER TABLE ${bm} ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`);
        }
    } catch (e: any) {
        console.warn('ensureBillingModuleColumns created_at:', e?.message || e);
    }
}

/** PostgreSQL: katalog boşsa dokümandaki temel modüller (SaaS plan matrisi için) */
async function seedBillingModulesIfEmpty(): Promise<void> {
    try {
        const [c]: any = await queryPublic(`SELECT COUNT(*)::int as c FROM ${tbl('billing_modules')}`);
        if (Number(c?.[0]?.c) > 0) return;
    } catch {
        return;
    }
    const rows: [string, string, string, string, string, number, number, number][] = [
        ['kitchen_display', 'Mutfak KDS Ekranı', 'Kanban mutfak sipariş ekranı', 'feature', 'FiMonitor', 0, 15, 1],
        ['waiter_tablet', 'Garson Tablet', 'Garson PWA — masa başı sipariş', 'feature', 'FiSmartphone', 29, 12, 2],
        ['qr_menu', 'Müşteri QR Menü', 'Masa QR sipariş', 'feature', 'FiCamera', 29, 9, 3],
        ['courier_module', 'Kurye & Teslimat', 'Kurye PWA, teslimat bölgeleri', 'feature', 'FiTruck', 49, 15, 4],
        ['customer_crm', 'Müşteri CRM & Sadakat', 'Puan sistemi', 'feature', 'FiUsers', 0, 12, 5],
        ['whatsapp_orders', 'WhatsApp Sipariş', 'WhatsApp canlı sipariş ekranı + otomasyon', 'feature', 'FiMessageCircle', 0, 15, 11],
        ['caller_id_android', 'Android Caller ID', 'Android gateway ile arayan numara entegrasyonu', 'feature', 'FiPhoneCall', 0, 12, 12],
        ['advanced_reports', 'Gelişmiş Raporlama', 'Saatlik raporlar', 'feature', 'FiBarChart2', 0, 15, 6],
        ['inventory', 'Stok & Envanter', 'Stok takibi', 'feature', 'FiPackage', 0, 10, 7],
        ['table_reservation', 'Masa Rezervasyonu', 'Takvim', 'feature', 'FiCalendar', 0, 8, 8],
        ['multi_language', 'Çoklu Dil Paketi', 'DE/TR/EN', 'feature', 'FiGlobe', 0, 5, 9],
        ['fiscal_tse', 'Fiskalizasyon / TSE', 'KassenSichV / TSE', 'feature', 'FiShield', 99, 19, 10],
        ['extra_device', 'Ek POS Cihazı', 'Ek terminal lisansı', 'device', 'FiTablet', 49, 9, 14],
        ['extra_printer', 'Ek Yazıcı İstasyonu', 'Mutfak/adisyon dışı ek yazıcı (bar, ikinci mutfak vb.)', 'device', 'FiPrinter', 29, 6, 15],
        ['api_access', 'API Erişimi', 'Webhook / entegrasyon', 'service', 'FiCode', 0, 25, 19],
        ['qr_web_menu', 'QR Web Menü', 'Domain tabanlı web QR menü (ör. qrpizza.webotonom.de)', 'channel', 'FiGlobe', 49, 19, 20],
    ];
    for (const r of rows) {
        await queryPublic(
            `INSERT INTO ${tbl('billing_modules')} (code, name, description, category, icon, setup_price, monthly_price, sort_order) VALUES (?,?,?,?,?,?,?,?)`,
            r
        );
    }
    console.log(`✅ Billing modül kataloğu ${rows.length} satır (ilk kurulum, PostgreSQL)`);
}

async function ensureQrWebMenuModule(): Promise<void> {
    try {
        const [rows]: any = await queryPublic(
            `SELECT 1 FROM ${tbl('billing_modules')} WHERE code = 'qr_web_menu' LIMIT 1`
        );
        if (rows?.length) return;
        await queryPublic(
            `INSERT INTO ${tbl('billing_modules')} (code, name, description, category, icon, setup_price, monthly_price, sort_order)
             VALUES ('qr_web_menu', 'QR Web Menü', 'Domain tabanlı web QR menü (ör. qrpizza.webotonom.de)', 'channel', 'FiGlobe', 49, 19, 20)`
        );
        console.log('✅ qr_web_menu billing modülü eklendi');
    } catch (e: any) {
        console.warn('ensureQrWebMenuModule:', e?.message || e);
    }
}

async function ensureExtraPrinterModule(): Promise<void> {
    try {
        const [rows]: any = await queryPublic(
            `SELECT 1 FROM ${tbl('billing_modules')} WHERE code = 'extra_printer' LIMIT 1`
        );
        if (rows?.length) return;
        await queryPublic(
            `INSERT INTO ${tbl('billing_modules')} (code, name, description, category, icon, setup_price, monthly_price, is_active, sort_order)
             VALUES ('extra_printer', 'Ek Yazıcı İstasyonu', 'Mutfak/adisyon dışı ek yazıcı (bar, ikinci mutfak vb.)', 'device', 'FiPrinter', 29, 6, true, 15)
             ON CONFLICT (code) DO NOTHING`
        );
        console.log('✅ extra_printer billing modülü eklendi');
    } catch (e: any) {
        console.warn('ensureExtraPrinterModule:', e?.message || e);
    }
}

/**
 * Her aktif plan × aktif modül için plan_module_rules satırı yoksa ekler (varsayılan: addon).
 * Mevcut kayıtları değiştirmez (INSERT IGNORE).
 */
export async function ensurePlanModuleRulesRows(): Promise<void> {
    try {
        if (!process.env.DATABASE_URL?.startsWith('postgresql')) {
            await pool.query(sqlCreatePlanModuleRulesTable() + ';');
            await queryPublic(
                `
                INSERT IGNORE INTO ${tbl('plan_module_rules')} (plan_code, module_code, mode)
                SELECT p.code, m.code, 'addon'
                FROM ${tbl('subscription_plans')} p
                CROSS JOIN ${tbl('billing_modules')} m
                WHERE p.is_active = true AND m.is_active = true
            `
            );
            return;
        }
        await queryPublic(
            `
            INSERT INTO ${tbl('plan_module_rules')} (plan_code, module_code, mode)
            SELECT p.code, m.code, 'addon'
            FROM ${tbl('subscription_plans')} p
            CROSS JOIN ${tbl('billing_modules')} m
            WHERE p.is_active = true AND m.is_active = true
            ON CONFLICT (plan_code, module_code) DO NOTHING
        `
        );
    } catch (e: any) {
        console.warn('ensurePlanModuleRulesRows:', e?.message || e);
    }
}

async function ensurePaymentHistoryExtraColumns(): Promise<void> {
    // PostgreSQL'de `due_date` / `invoice_number` kolonları bazı kurulumlarda eksik olabiliyor.
    // Finans UI'si ve "2 gün önce uyarı + vade geçince pasif" için bu alanlar şart.
    try {
        await queryPublic(`ALTER TABLE ${tbl('payment_history')} ADD COLUMN IF NOT EXISTS due_date DATE`);
    } catch {
        /* ignore */
    }
    try {
        await queryPublic(`ALTER TABLE ${tbl('payment_history')} ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)`);
    } catch {
        /* ignore */
    }
    try {
        await queryPublic(`ALTER TABLE ${tbl('payment_history')} ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ(6)`);
    } catch {
        /* ignore */
    }
    try {
        await queryPublic(`ALTER TABLE ${tbl('payment_history')} ADD COLUMN IF NOT EXISTS created_by VARCHAR(255)`);
    } catch {
        /* ignore */
    }
}

/**
 * Prisma migrate tam uygulanmamış PostgreSQL kurulumlarında muhasebe / yedek API'lerinin 500 vermesini önler:
 * tenant_billing, billing_reminder_log, system_backups.tenant_id|backup_type.
 */
/** Bayi kart ödemesi: tenant oluşturmadan önce form taslağı */
async function ensureTenantCreationDraftsTable(): Promise<void> {
    if (!process.env.DATABASE_URL?.startsWith('postgresql')) return;
    try {
        await pool.query(`
CREATE TABLE IF NOT EXISTS "public"."tenant_creation_drafts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "reseller_id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL
)`);
        await pool.query(
            `CREATE INDEX IF NOT EXISTS "tenant_creation_drafts_reseller_idx" ON "public"."tenant_creation_drafts" ("reseller_id")`
        );
    } catch (e: unknown) {
        console.warn('ensureTenantCreationDraftsTable:', (e as Error)?.message || e);
    }
}

/** Prisma migration çalışmamış PG kurulumlarında system_settings eksikliği (teklif / bayi komisyon) */
async function ensureSystemSettingsPostgreSQL(): Promise<void> {
    if (!process.env.DATABASE_URL?.startsWith('postgresql')) return;
    try {
        await pool.query(`
CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" SERIAL NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'EUR',
    "base_subscription_fee" DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    "monthly_license_fee" DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
)`);
        const alters = [
            `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "reseller_setup_rate" DECIMAL(5,2) NOT NULL DEFAULT 75`,
            `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "system_setup_rate" DECIMAL(5,2) NOT NULL DEFAULT 25`,
            `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "reseller_monthly_rate" DECIMAL(5,2) NOT NULL DEFAULT 50`,
            `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "system_monthly_rate" DECIMAL(5,2) NOT NULL DEFAULT 50`,
            `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "annual_discount_rate" DECIMAL(5,2) NOT NULL DEFAULT 15`,
        ];
        for (const sql of alters) {
            try {
                await pool.query(sql);
            } catch (e: unknown) {
                console.warn('ensureSystemSettingsPostgreSQL alter:', (e as Error)?.message || e);
            }
        }
        await pool.query(`
INSERT INTO "public"."system_settings" (
    "id", "currency", "base_subscription_fee", "monthly_license_fee", "trial_days",
    "reseller_setup_rate", "system_setup_rate", "reseller_monthly_rate", "system_monthly_rate", "annual_discount_rate"
) VALUES (
    1, 'EUR', 500.00, 50.00, 14,
    75, 25, 50, 50, 15
)
ON CONFLICT ("id") DO NOTHING
`);
    } catch (e: unknown) {
        console.warn('ensureSystemSettingsPostgreSQL:', (e as Error)?.message || e);
    }
}

/** Prisma migration uygulanmamış PG kurulumlarında calculateQuote / plan limitleri için */
async function ensureSubscriptionPlansPostgreSQL(): Promise<void> {
    if (!process.env.DATABASE_URL?.startsWith('postgresql')) return;
    try {
        await pool.query(`
CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "monthly_fee" DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    "setup_fee" DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    "features" JSONB,
    "max_users" INTEGER NOT NULL DEFAULT 10,
    "max_branches" INTEGER NOT NULL DEFAULT 1,
    "max_products" INTEGER NOT NULL DEFAULT 500,
    "max_devices" INTEGER NOT NULL DEFAULT 1,
    "support_hours" VARCHAR(30) DEFAULT '09:00-17:00',
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_plans_code_key" UNIQUE ("code")
)`);
        await pool.query(`
INSERT INTO "public"."subscription_plans" ("name", "code", "monthly_fee", "setup_fee", "max_users", "max_branches", "max_products", "max_devices", "support_hours", "features", "trial_days", "sort_order")
VALUES
('Başlangıç', 'basic', 39.00, 199.00, 5, 1, 400, 3, '09:00-18:00', '["POS & kasa","Menü","Çoklu dil","3 cihaz","E-posta destek"]'::jsonb, 14, 1),
('Profesyonel', 'pro', 79.00, 399.00, 12, 3, 1200, 6, '08:00-22:00', '["KDS mutfak","Garson tablet","QR menü","Gelişmiş rapor","6 cihaz","Geniş destek saati"]'::jsonb, 14, 2),
('Kurumsal', 'enterprise', 119.00, 699.00, 40, 10, 20000, 9, '07:00-23:00', '["API","Web QR menü dahil","Öncelikli destek seçeneği","9 cihaz"]'::jsonb, 14, 3)
ON CONFLICT ("code") DO NOTHING
`);
    } catch (err: unknown) {
        console.warn('ensureSubscriptionPlansPostgreSQL:', err instanceof Error ? err.message : String(err));
    }
}

/**
 * Abonelik + modül kataloğu + plan×modül matrisi (PostgreSQL).
 * Mevcut veritabanında plan fiyatlarını ve cihaz limitlerini günceller;
 * plan_module_rules için: sadece henüz hiç "addon dışı" kural yoksa varsayılan katmanı yazar.
 */
async function runBillingPolicySyncV2(): Promise<void> {
    if (!process.env.DATABASE_URL?.startsWith('postgresql')) return;
    try {
        await pool.query(`
ALTER TABLE "public"."subscription_plans" ADD COLUMN IF NOT EXISTS "max_printers" INTEGER NOT NULL DEFAULT 2;
`);
        await pool.query(`
UPDATE "public"."subscription_plans" SET
  name = 'Başlangıç',
  monthly_fee = 39.00,
  setup_fee = 199.00,
  max_users = 5,
  max_branches = 1,
  max_products = 400,
  max_devices = 3,
  max_printers = 2,
  support_hours = '09:00-18:00',
  features = '["POS & kasa","Menü","Çoklu dil","3 cihaz","E-posta destek"]'::jsonb
WHERE code = 'basic';

UPDATE "public"."subscription_plans" SET
  name = 'Profesyonel',
  monthly_fee = 79.00,
  setup_fee = 399.00,
  max_users = 12,
  max_branches = 3,
  max_products = 1200,
  max_devices = 6,
  max_printers = 4,
  support_hours = '08:00-22:00',
  features = '["KDS mutfak","Garson tablet","QR menü","Gelişmiş rapor","6 cihaz"]'::jsonb
WHERE code = 'pro';

UPDATE "public"."subscription_plans" SET
  name = 'Kurumsal',
  monthly_fee = 119.00,
  setup_fee = 699.00,
  max_users = 40,
  max_branches = 10,
  max_products = 20000,
  max_devices = 9,
  max_printers = 8,
  support_hours = '07:00-23:00',
  features = '["API","Web QR menü","Öncelikli destek seçeneği","9 cihaz"]'::jsonb
WHERE code = 'enterprise';
`);

        await queryPublic(`
            INSERT INTO ${tbl('billing_modules')} (code, name, description, category, icon, setup_price, monthly_price, sort_order, is_active)
            VALUES
            ('support_standard', 'Standart Destek', 'E-posta + panel (iş günü, SLA 48s)', 'service', 'FiMail', 0, 12, 22, true),
            ('support_priority', 'Öncelikli Destek', 'Öncelikli kuyruk + telefon (iş günü)', 'service', 'FiPhone', 19, 32, 23, true),
            ('whatsapp_orders', 'WhatsApp Sipariş', 'WhatsApp canlı sipariş ekranı + otomasyon', 'feature', 'FiMessageCircle', 0, 15, 11, true),
            ('caller_id_android', 'Android Caller ID', 'Android gateway ile arayan numara entegrasyonu', 'feature', 'FiPhoneCall', 0, 12, 12, true),
            ('extra_printer', 'Ek Yazıcı İstasyonu', 'Mutfak/adisyon dışı ek yazıcı (bar, ikinci mutfak vb.)', 'device', 'FiPrinter', 19, 6, 15, true)
            ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                monthly_price = EXCLUDED.monthly_price,
                setup_price = EXCLUDED.setup_price,
                is_active = true
        `);

        await queryPublic(
            `UPDATE ${tbl('billing_modules')} SET is_active = false WHERE code IN ('table_reservation', 'inventory')`
        );

        const pricePatches: [string, number, number][] = [
            ['multi_language', 0, 5],
            ['kitchen_display', 19, 9],
            ['waiter_tablet', 19, 10],
            ['qr_menu', 0, 7],
            ['qr_web_menu', 29, 14],
            ['courier_module', 29, 12],
            ['customer_crm', 19, 9],
            ['advanced_reports', 19, 11],
            ['fiscal_tse', 59, 15],
            ['api_access', 29, 14],
            ['extra_device', 19, 6],
            ['extra_printer', 19, 6],
        ];
        for (const [code, setup, monthly] of pricePatches) {
            await queryPublic(
                `UPDATE ${tbl('billing_modules')} SET setup_price = ?, monthly_price = ? WHERE code = ?`,
                [setup, monthly, code]
            );
        }

        await ensurePlanModuleRulesRows();
        await bootstrapPlanModuleRulesIfFresh();
        console.log('✅ Billing politikası v2 senkron (planlar, modül fiyatları, matris).');
    } catch (e: unknown) {
        console.warn('runBillingPolicySyncV2:', (e as Error)?.message || e);
    }
}

/** Plan×modül matrisi için güvenli bootstrap: sadece varsayılan "addon" satırlarını katmanlı kurallarla yamalar */
async function bootstrapPlanModuleRulesIfFresh(): Promise<void> {
    try {
        const rules: [string, string, PlanModuleMode][] = [
            ['basic', 'multi_language', 'included'],
            ['basic', 'qr_menu', 'included'],
            ['basic', 'kitchen_display', 'locked'],
            ['basic', 'waiter_tablet', 'locked'],
            ['basic', 'advanced_reports', 'locked'],
            ['basic', 'customer_crm', 'locked'],
            ['basic', 'whatsapp_orders', 'locked'],
            ['basic', 'caller_id_android', 'locked'],
            ['basic', 'courier_module', 'locked'],
            ['basic', 'qr_web_menu', 'locked'],
            ['basic', 'fiscal_tse', 'locked'],
            ['basic', 'api_access', 'locked'],
            ['basic', 'extra_device', 'addon'],
            ['basic', 'extra_printer', 'addon'],
            ['basic', 'support_standard', 'addon'],
            ['basic', 'support_priority', 'addon'],

            ['pro', 'multi_language', 'included'],
            ['pro', 'qr_menu', 'included'],
            ['pro', 'kitchen_display', 'included'],
            ['pro', 'waiter_tablet', 'included'],
            ['pro', 'advanced_reports', 'included'],
            ['pro', 'customer_crm', 'addon'],
            ['pro', 'whatsapp_orders', 'included'],
            ['pro', 'caller_id_android', 'addon'],
            ['pro', 'courier_module', 'included'],
            ['pro', 'qr_web_menu', 'addon'],
            ['pro', 'fiscal_tse', 'addon'],
            ['pro', 'api_access', 'locked'],
            ['pro', 'extra_device', 'addon'],
            ['pro', 'extra_printer', 'addon'],
            ['pro', 'support_standard', 'addon'],
            ['pro', 'support_priority', 'addon'],

            ['enterprise', 'multi_language', 'included'],
            ['enterprise', 'qr_menu', 'included'],
            ['enterprise', 'kitchen_display', 'included'],
            ['enterprise', 'waiter_tablet', 'included'],
            ['enterprise', 'advanced_reports', 'included'],
            ['enterprise', 'customer_crm', 'included'],
            ['enterprise', 'whatsapp_orders', 'included'],
            ['enterprise', 'caller_id_android', 'included'],
            ['enterprise', 'courier_module', 'included'],
            ['enterprise', 'qr_web_menu', 'included'],
            ['enterprise', 'api_access', 'included'],
            ['enterprise', 'fiscal_tse', 'addon'],
            ['enterprise', 'extra_device', 'addon'],
            ['enterprise', 'extra_printer', 'addon'],
            ['enterprise', 'support_standard', 'included'],
            ['enterprise', 'support_priority', 'addon'],
        ];

        for (const [plan, mod, mode] of rules) {
            await queryPublic(
                `INSERT INTO ${tbl('plan_module_rules')} (plan_code, module_code, mode) VALUES (?, ?, ?)
                 ON CONFLICT (plan_code, module_code) DO UPDATE
                 SET mode = CASE
                    WHEN ${tbl('plan_module_rules')}.mode = 'addon' THEN EXCLUDED.mode
                    ELSE ${tbl('plan_module_rules')}.mode
                 END,
                 updated_at = CURRENT_TIMESTAMP`,
                [plan, mod, mode]
            );
        }
    } catch (e: unknown) {
        console.warn('bootstrapPlanModuleRulesIfFresh:', (e as Error)?.message || e);
    }
}

async function ensurePostgreSQLFinanceSchema(): Promise<void> {
    if (!process.env.DATABASE_URL?.startsWith('postgresql')) return;
    const stmts = [
        `CREATE TABLE IF NOT EXISTS "public"."tenant_billing" (
    "tenant_id" CHAR(36) NOT NULL,
    "billing_cycle" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "plan_code" VARCHAR(30) NOT NULL DEFAULT 'starter',
    "setup_fee_total" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "monthly_recurring_total" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "yearly_prepay_total" DECIMAL(10, 2),
    "annual_discount_percent" DECIMAL(5, 2) NOT NULL DEFAULT 15,
    "reactivation_fee_percent" DECIMAL(5, 2) NOT NULL DEFAULT 10,
    "next_payment_due" DATE,
    "grace_days_after_due" INTEGER NOT NULL DEFAULT 1,
    "last_payment_at" TIMESTAMPTZ(6),
    "payment_current" BOOLEAN NOT NULL DEFAULT true,
    "suspended_at" TIMESTAMPTZ(6),
    "suspension_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_billing_pkey" PRIMARY KEY ("tenant_id")
)`,
        `CREATE TABLE IF NOT EXISTS "public"."billing_reminder_log" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_reminder_log_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "billing_reminder_log_tenant_id_idx" ON "public"."billing_reminder_log" ("tenant_id")`,
        `ALTER TABLE "public"."system_backups" ADD COLUMN IF NOT EXISTS "tenant_id" UUID REFERENCES "public"."tenants"("id") ON DELETE SET NULL`,
        `ALTER TABLE "public"."system_backups" ADD COLUMN IF NOT EXISTS "backup_type" VARCHAR(20) NOT NULL DEFAULT 'full'`,
        `CREATE INDEX IF NOT EXISTS "system_backups_tenant_id_idx" ON "public"."system_backups" ("tenant_id")`,

        // ── SUPPORT TICKETS ──
        `CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36),
    "subject" VARCHAR(200) NOT NULL,
    "message" TEXT,
    "status" VARCHAR(20) DEFAULT 'open',
    "priority" VARCHAR(20) DEFAULT 'medium',
    "category" VARCHAR(50) DEFAULT 'general',
    "assigned_to" VARCHAR(100),
    "sla_deadline" TIMESTAMPTZ(6),
    "first_response_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "support_tickets_tenant_id_idx" ON "public"."support_tickets" ("tenant_id")`,
        `CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "public"."support_tickets" ("status")`,
        `ALTER TABLE "public"."support_tickets" ADD COLUMN IF NOT EXISTS "created_by_reseller_id" INTEGER`,
        `CREATE INDEX IF NOT EXISTS "support_tickets_created_by_reseller_idx" ON "public"."support_tickets" ("created_by_reseller_id")`,
        // Prisma migration ile oluşan eski tabloda tenant_id NOT NULL + category yoktu; bayi genel talebi NULL tenant gerektirir.
        `ALTER TABLE "public"."support_tickets" ADD COLUMN IF NOT EXISTS "category" VARCHAR(50) DEFAULT 'general'`,
        `ALTER TABLE "public"."support_tickets" ALTER COLUMN "tenant_id" DROP NOT NULL`,
        `ALTER TABLE "public"."support_tickets" ADD COLUMN IF NOT EXISTS "first_response_at" TIMESTAMPTZ(6)`,
        `ALTER TABLE "public"."support_tickets" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ(6)`,
        `ALTER TABLE "public"."support_tickets" ADD COLUMN IF NOT EXISTS "assigned_to" VARCHAR(100)`,
        `ALTER TABLE "public"."support_tickets" ADD COLUMN IF NOT EXISTS "sla_deadline" TIMESTAMPTZ(6)`,

        `CREATE TABLE IF NOT EXISTS "public"."reseller_wallet_topup_requests" (
    "id" SERIAL NOT NULL,
    "reseller_id" INTEGER NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reseller_wallet_topup_requests_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "reseller_wallet_topup_requests_reseller_idx" ON "public"."reseller_wallet_topup_requests" ("reseller_id")`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(30) NOT NULL DEFAULT 'bank_transfer'`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "transfer_reference" VARCHAR(180)`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "transfer_date" DATE`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "transfer_time" VARCHAR(12)`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" VARCHAR(255)`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "return_success_url" TEXT`,
        `ALTER TABLE "public"."reseller_wallet_topup_requests" ADD COLUMN IF NOT EXISTS "return_cancel_url" TEXT`,

        `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "reseller_bank_accounts_json" TEXT`,
        `ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "virtual_pos_test_mode" SMALLINT NOT NULL DEFAULT 0`,

        // ── LOGIN ATTEMPTS ──
        `CREATE TABLE IF NOT EXISTS "public"."login_attempts" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "success" BOOLEAN DEFAULT false,
    "failure_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "login_attempts_username_idx" ON "public"."login_attempts" ("username")`,
        `CREATE INDEX IF NOT EXISTS "login_attempts_ip_idx" ON "public"."login_attempts" ("ip_address")`,
        `CREATE INDEX IF NOT EXISTS "login_attempts_created_idx" ON "public"."login_attempts" ("created_at")`,

        // ── AUDIT LOGS ──
        `CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(100),
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" VARCHAR(50),
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "public"."audit_logs" ("action")`,
        `CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "public"."audit_logs" ("entity_type", "entity_id")`,
        `CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "public"."audit_logs" ("created_at")`,

        // ── API KEYS ──
        `CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "key_value" VARCHAR(64) UNIQUE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "permissions" JSONB,
    "is_active" BOOLEAN DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "public"."api_keys" ("tenant_id")`,
        `CREATE INDEX IF NOT EXISTS "api_keys_key_idx" ON "public"."api_keys" ("key_value")`,

        // ── PROMO CODES ──
        `CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) UNIQUE NOT NULL,
    "discount_type" VARCHAR(20) NOT NULL,
    "discount_value" DECIMAL(10, 2) NOT NULL,
    "max_uses" INTEGER DEFAULT 100,
    "used_count" INTEGER DEFAULT 0,
    "valid_from" DATE,
    "valid_until" DATE,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
)`,

        // ── CUSTOMER NOTES ──
        `CREATE TABLE IF NOT EXISTS "public"."customer_notes" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "note_type" VARCHAR(20) DEFAULT 'internal',
    "subject" VARCHAR(200),
    "content" TEXT,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "customer_notes_tenant_idx" ON "public"."customer_notes" ("tenant_id")`,

        // ── CONTRACTS ──
        `CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "contract_number" VARCHAR(50) UNIQUE,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "monthly_amount" DECIMAL(10, 2),
    "status" VARCHAR(20) DEFAULT 'active',
    "document_url" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "contracts_tenant_idx" ON "public"."contracts" ("tenant_id")`,

        // ── SYSTEM METRICS ──
        `CREATE TABLE IF NOT EXISTS "public"."system_metrics" (
    "id" SERIAL NOT NULL,
    "metric_type" VARCHAR(50) NOT NULL,
    "metric_value" DECIMAL(10, 2) NOT NULL,
    "unit" VARCHAR(20),
    "metadata" JSONB,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "system_metrics_type_idx" ON "public"."system_metrics" ("metric_type")`,
        `CREATE INDEX IF NOT EXISTS "system_metrics_recorded_idx" ON "public"."system_metrics" ("recorded_at")`,

        // ── ALERT RULES ──
        `CREATE TABLE IF NOT EXISTS "public"."alert_rules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "metric_type" VARCHAR(50) NOT NULL,
    "threshold" DECIMAL(10, 2) NOT NULL,
    "operator" VARCHAR(10) DEFAULT 'gt',
    "severity" VARCHAR(20) DEFAULT 'warning',
    "is_active" BOOLEAN DEFAULT true,
    "last_triggered" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
)`,

        // ── TICKET MESSAGES ──
        `CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "sender_type" VARCHAR(20) DEFAULT 'admin',
    "sender_name" VARCHAR(100),
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
)`,
        `CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx" ON "public"."ticket_messages" ("ticket_id")`,

        // ── KNOWLEDGE BASE ──
        `CREATE TABLE IF NOT EXISTS "public"."knowledge_base" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "content" TEXT NOT NULL,
    "tags" VARCHAR(500),
    "view_count" INTEGER DEFAULT 0,
    "is_published" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
)`,
    ];
    for (const sql of stmts) {
        try {
            await pool.query(sql);
        } catch (e: unknown) {
            // Ignore duplicate key errors
            const msg = (e as Error)?.message || '';
            if (!msg.includes('duplicate key') && !msg.includes('already exists')) {
                console.warn('ensurePostgreSQLFinanceSchema:', msg);
            }
        }
    }

    // plan_module_rules tablosu (PostgreSQL)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${tbl('plan_module_rules')} (
                "plan_code" VARCHAR(30) NOT NULL,
                "module_code" VARCHAR(50) NOT NULL,
                "mode" VARCHAR(20) NOT NULL DEFAULT 'addon',
                "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("plan_code", "module_code")
            )
        `);
    } catch (e: unknown) {
        const msg = (e as Error)?.message || '';
        if (!msg.includes('duplicate key') && !msg.includes('already exists')) {
            console.warn('ensurePlanModuleRulesPostgreSQL:', msg);
        }
    }
}

/**
 * Billing migration — tek seferlik çalışır, race condition'dan korumalı.
 * Birden fazla istek aynı anda gelirse sadece ilki migration'ı çalıştırır,
 * diğerleri ilkinin bitmesini bekler.
 */
export async function migrateBillingTables(): Promise<void> {
    if (_tablesReady) return _tablesReady;

    _tablesReady = doMigrateBillingTables();
    return _tablesReady;
}

async function doMigrateBillingTables(): Promise<void> {
    if (process.env.DATABASE_URL?.startsWith('postgresql')) {
        console.log('✅ Billing: PostgreSQL — tablolar Prisma migration ile; modül kataloğu tohumu ve plan kuralları senkronize ediliyor.');
        await seedBillingModulesIfEmpty();
        await ensureQrWebMenuModule();
        await ensureExtraPrinterModule();
        await ensurePaymentHistoryExtraColumns();
        await ensurePostgreSQLFinanceSchema();
        await ensureSystemSettingsPostgreSQL();
        await ensureSubscriptionPlansPostgreSQL();
        await ensureTenantCreationDraftsTable();
        await runBillingPolicySyncV2();
        await bootstrapPlanModuleRulesIfFresh();
        return;
    }
    await ensureBillingBaseTables();
    try {
        const sqlPath = resolveBillingSchemaSqlPath();
        const raw = fs.readFileSync(sqlPath, 'utf8');
        const dbName = getPublicDatabaseName();
        const escDb = dbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const withoutUse = raw.replace(new RegExp(`USE\\s+\`?${escDb}\`?;`, 'gi'), '');
        const statements = withoutUse
            .split(';')
            .map((s) => s.trim())
            .map(stripLeadingLineComments)
            .filter((s) => s.length > 0);
        for (const st of statements) {
            try {
                await pool.query(st + ';');
            } catch (e: any) {
                if (e?.code === 'ER_TABLE_EXISTS_ERROR' || e?.errno === 1050) continue;
                if (e?.code === 'ER_DUP_ENTRY') continue;
                console.warn('migrateBillingTables:', e?.message || e);
            }
        }
        await ensureBillingModuleColumns();
        // MySQL: billing_modules katalog kontrolü
        try {
            await seedBillingModulesIfEmpty();
        } catch { /* ignore */ }
        try {
            await queryPublic(`ALTER TABLE ${tbl('tenant_modules')} ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER monthly_line_total;`);
        } catch {}
        try {
            await queryPublic(`ALTER TABLE ${tbl('subscription_plans')} ADD COLUMN IF NOT EXISTS max_devices INT DEFAULT 1 AFTER max_products;`);
            await queryPublic(`ALTER TABLE ${tbl('subscription_plans')} ADD COLUMN IF NOT EXISTS support_hours VARCHAR(30) DEFAULT '09:00-17:00' AFTER max_devices;`);
            await queryPublic(
                `ALTER TABLE ${tbl('subscription_plans')} ADD COLUMN IF NOT EXISTS max_printers INT NOT NULL DEFAULT 2 AFTER max_devices`
            );
        } catch {}
        await ensurePlanModuleRulesRows();
        console.log('✅ Billing tabloları hazır');
    } catch (e) {
        console.error('❌ Billing migration:', e);
    }
}

async function fetchPlanModuleRules(planCode: string): Promise<Map<string, PlanModuleMode>> {
    try {
        const [rows]: any = await queryPublic(
            `SELECT module_code, mode FROM ${tbl('plan_module_rules')} WHERE plan_code = ?`,
            [planCode]
        );
        const map = new Map<string, PlanModuleMode>();
        for (const r of rows || []) {
            const mc = (r as any).module_code ?? (r as any).moduleCode;
            if (mc) map.set(String(mc), (r as any).mode as PlanModuleMode);
        }
        return map;
    } catch {
        return new Map();
    }
}

export async function calculateQuote(input: QuoteInput): Promise<QuoteBreakdown> {
    const annualDiscountPercent = input.annualDiscountPercent ?? 15;
    const codeNorm = String(input.planCode || '').trim();
    let [plans]: any = await queryPublic(
        `SELECT * FROM ${tbl('subscription_plans')} WHERE LOWER(TRIM(code)) = LOWER(TRIM(?)) LIMIT 1`,
        [codeNorm]
    );
    if (!plans?.length) {
        [plans] = await queryPublic(
            `SELECT * FROM ${tbl('subscription_plans')} WHERE code = ? LIMIT 1`,
            [codeNorm]
        );
    }
    if (!plans?.length) {
        throw new Error(`Plan bulunamadı: ${input.planCode}`);
    }
    const plan = plans[0];
    const setupFee = Number(plan.setup_fee);
    const monthlyService = Number(plan.monthly_fee);

    const rules = await fetchPlanModuleRules(plan.code);

    const lines: QuoteLine[] = [];
    let modulesSetup = 0;
    let modulesMonthly = 0;

    let modRows: any[] = [];
    if (input.moduleCodes?.length) {
        const [mods]: any = await queryPublic(
            `SELECT * FROM ${tbl('billing_modules')} WHERE is_active = true AND code IN (${input.moduleCodes.map(() => '?').join(',')})`,
            input.moduleCodes
        );
        modRows = mods || [];
        const found = new Set(modRows.map((m: any) => m.code));
        for (const c of input.moduleCodes) {
            if (!found.has(c)) {
                throw new Error(`Bilinmeyen veya pasif modül: ${c}`);
            }
        }
    }
    for (const m of modRows) {
        const mode = rules.get(m.code) ?? 'addon';
        if (mode === 'locked') {
            throw new Error(`Modül "${m.name}" (${m.code}) bu planda kapalı — paket yükseltmeniz gerekir.`);
        }

        let qty = 1;
        if (m.code === 'extra_device' && input.extraDeviceQty && input.extraDeviceQty > 0) {
            qty = input.extraDeviceQty;
        }
        if (m.code === 'extra_printer' && input.extraPrinterQty && input.extraPrinterQty > 0) {
            qty = input.extraPrinterQty;
        }

        if (mode === 'included') {
            lines.push({
                code: m.code,
                name: m.name,
                setup: 0,
                monthly: 0,
                qty,
                includedInPlan: true,
            });
            continue;
        }

        const s = Number(m.setup_price) * qty;
        const mo = Number(m.monthly_price) * qty;
        modulesSetup += s;
        modulesMonthly += mo;
        lines.push({ code: m.code, name: m.name, setup: s, monthly: mo, qty });
    }

    const monthlyRecurringTotal = monthlyService + modulesMonthly;
    const yearlyPrepayBeforeDiscount = monthlyRecurringTotal * 12;
    const yearlyPrepayTotal =
        yearlyPrepayBeforeDiscount * (1 - annualDiscountPercent / 100);

    const firstInvoiceTotal =
        input.billingCycle === 'yearly'
            ? setupFee + modulesSetup + yearlyPrepayTotal
            : setupFee + modulesSetup + monthlyRecurringTotal;

    return {
        planCode: plan.code,
        planName: plan.name,
        setupFee,
        monthlyService,
        modulesMonthly,
        modulesSetup,
        monthlyRecurringTotal,
        yearlyPrepayBeforeDiscount,
        annualDiscountPercent,
        yearlyPrepayTotal,
        firstInvoiceTotal,
        billingCycle: input.billingCycle,
        lines,
    };
}

/** Yeni tenant kaydı sonrası faturalama satırları */
export async function seedTenantBilling(
    tenantId: string,
    planCode: string,
    billingCycle: 'monthly' | 'yearly',
    moduleCodes: string[],
    extraDeviceQty?: number,
    extraPrinterQty?: number
): Promise<void> {
    const quote = await calculateQuote({
        planCode,
        moduleCodes,
        billingCycle,
        extraDeviceQty,
        extraPrinterQty,
    });

    const tid = String(tenantId).trim();
    const isPg = process.env.DATABASE_URL?.startsWith('postgresql');

    // Vadeler restoranın oluşturma tarihinden başlayacak
    const [tCreated]: any = await queryPublic(`SELECT created_at FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
    const startDate = tCreated?.[0]?.created_at ? new Date(tCreated[0].created_at) : new Date();
    
    // İlk vade: oluşturma tarihinden 1 ay sonra
    const nextDue = new Date(startDate);
    if (billingCycle === 'yearly') nextDue.setFullYear(nextDue.getFullYear() + 1);
    else nextDue.setMonth(nextDue.getMonth() + 1);

    const nextDueStr = nextDue.toISOString().slice(0, 10);

    if (isPg) {
        await queryPublic(
            `INSERT INTO ${tbl('tenant_billing')} (
                tenant_id, billing_cycle, plan_code, setup_fee_total, monthly_recurring_total,
                yearly_prepay_total, annual_discount_percent, reactivation_fee_percent,
                next_payment_due, grace_days_after_due, last_payment_at, payment_current
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), true)
            ON CONFLICT (tenant_id) DO UPDATE SET
                billing_cycle = EXCLUDED.billing_cycle,
                plan_code = EXCLUDED.plan_code,
                setup_fee_total = EXCLUDED.setup_fee_total,
                monthly_recurring_total = EXCLUDED.monthly_recurring_total,
                yearly_prepay_total = EXCLUDED.yearly_prepay_total,
                annual_discount_percent = EXCLUDED.annual_discount_percent,
                reactivation_fee_percent = EXCLUDED.reactivation_fee_percent,
                next_payment_due = EXCLUDED.next_payment_due,
                updated_at = CURRENT_TIMESTAMP
            RETURNING tenant_id`,
            [
                tid,
                billingCycle,
                planCode,
                quote.setupFee + quote.modulesSetup,
                quote.monthlyRecurringTotal,
                billingCycle === 'yearly' ? quote.yearlyPrepayTotal : null,
                quote.annualDiscountPercent,
                10,
                nextDueStr,
            ]
        );

        for (const line of quote.lines) {
            if (line.includedInPlan) continue;
            const qty = line.qty;
            await queryPublic(
                `INSERT INTO ${tbl('tenant_modules')} (tenant_id, module_code, quantity, setup_line_total, monthly_line_total)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (tenant_id, module_code) DO UPDATE SET
                    quantity = EXCLUDED.quantity,
                    setup_line_total = EXCLUDED.setup_line_total,
                    monthly_line_total = EXCLUDED.monthly_line_total
                 RETURNING id`,
                [tid, line.code, qty, line.setup, line.monthly]
            );
        }
    } else {
        await queryPublic(
            `INSERT INTO ${tbl('tenant_billing')} (
                tenant_id, billing_cycle, plan_code, setup_fee_total, monthly_recurring_total,
                yearly_prepay_total, annual_discount_percent, reactivation_fee_percent,
                next_payment_due, grace_days_after_due, last_payment_at, payment_current
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), 1)
            ON DUPLICATE KEY UPDATE
                billing_cycle = VALUES(billing_cycle),
                plan_code = VALUES(plan_code),
                setup_fee_total = VALUES(setup_fee_total),
                monthly_recurring_total = VALUES(monthly_recurring_total),
                yearly_prepay_total = VALUES(yearly_prepay_total),
                updated_at = CURRENT_TIMESTAMP`,
            [
                tid,
                billingCycle,
                planCode,
                quote.setupFee + quote.modulesSetup,
                quote.monthlyRecurringTotal,
                billingCycle === 'yearly' ? quote.yearlyPrepayTotal : null,
                quote.annualDiscountPercent,
                10,
                nextDue,
            ]
        );

        for (const line of quote.lines) {
            if (line.includedInPlan) continue;
            const qty = line.qty;
            await queryPublic(
                `INSERT INTO ${tbl('tenant_modules')} (tenant_id, module_code, quantity, setup_line_total, monthly_line_total)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), setup_line_total = VALUES(setup_line_total), monthly_line_total = VALUES(monthly_line_total)`,
                [tid, line.code, qty, line.setup, line.monthly]
            );
        }
    }
}

/**
 * Eski tenantlarda veya başarısız seed sonrası tenant_billing yoksa: tenants.subscription_plan ile satır oluşturur.
 */
export async function ensureTenantBillingIfMissing(tenantId: string): Promise<void> {
    const tid = String(tenantId).trim();
    const [trows]: any = await queryPublic(`SELECT subscription_plan FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
    if (!trows?.length) {
        throw new Error('Tenant bulunamadı');
    }
    const [existing]: any = await queryPublic(
        `SELECT 1 FROM ${tbl('tenant_billing')} WHERE trim(tenant_id::text) = ? LIMIT 1`,
        [tid]
    );
    if (existing?.length) return;

    const plan = String(trows[0].subscription_plan || 'basic').toLowerCase().trim();
    await seedTenantBilling(tid, plan, 'monthly', [], undefined, undefined);
}

/** Satış sayfası / SaaS paneli: planda hangi modül dahil, ek, kapalı */
export async function getPlanModuleMatrix(planCode: string): Promise<
    {
        code: string;
        name: string;
        description: string | null;
        category: string;
        setup_price: number;
        monthly_price: number;
        mode: PlanModuleMode;
    }[]
> {
    const [mods]: any = await queryPublic(
        `SELECT code, name, description, category, setup_price, monthly_price, sort_order FROM ${tbl('billing_modules')} WHERE is_active = true ORDER BY sort_order`
    );
    const rules = await fetchPlanModuleRules(planCode);
    return (mods || []).map((m: any) => ({
        code: m.code,
        name: m.name,
        description: m.description,
        category: m.category,
        setup_price: Number(m.setup_price),
        monthly_price: Number(m.monthly_price),
        mode: rules.get(m.code) ?? 'addon',
    }));
}

/** POS / portal: restoranın hangi modülleri açabileceği */
export async function upsertPlanModuleRule(
    planCode: string,
    moduleCode: string,
    mode: PlanModuleMode
): Promise<void> {
    if (process.env.DATABASE_URL?.startsWith('postgresql')) {
        await queryPublic(
            `INSERT INTO ${tbl('plan_module_rules')} (plan_code, module_code, mode) VALUES (?, ?, ?)
             ON CONFLICT (plan_code, module_code) DO UPDATE SET mode = EXCLUDED.mode`,
            [planCode, moduleCode, mode]
        );
        return;
    }
    await queryPublic(
        `INSERT INTO ${tbl('plan_module_rules')} (plan_code, module_code, mode) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE mode = VALUES(mode)`,
        [planCode, moduleCode, mode]
    );
}

export async function putPlanModuleRulesBulk(planCode: string, rules: Record<string, PlanModuleMode>): Promise<void> {
    for (const [moduleCode, mode] of Object.entries(rules)) {
        await upsertPlanModuleRule(planCode, moduleCode, mode);
    }
}

/** SaaS panel ödeme seçimi → payment_history ENUM */
function mapSaaSPaymentMethod(m?: string): 'bank_transfer' | 'credit_card' | 'cash' | 'paypal' | 'other' {
    switch (m) {
        case 'bank_transfer':
            return 'bank_transfer';
        case 'admin_card':
            return 'credit_card';
        case 'cash':
            return 'cash';
        case 'wallet_balance':
        default:
            return 'other';
    }
}

/** Pakette ücretsiz yazıcı istasyonu sayısı (mutfak + adisyon); fazlası için `extra_printer` modülü */
export const BASE_INCLUDED_PRINTER_STATIONS = 2;

/** Mevcut restorana ek modül satışı (addon); dahil modüller atlanır */
export async function purchaseAddonModulesForTenant(
    tenantId: string,
    moduleCodes: string[],
    extraDeviceQty?: number,
    paymentMethod?: string,
    adminUsername?: string,
    extraPrinterQty?: number
): Promise<{ added: string[]; skipped: string[]; totals?: { setup: number; monthly: number } }> {
    await ensureTenantBillingIfMissing(tenantId);

    const [tbJoin]: any = await queryPublic(
        `SELECT t.subscription_plan AS subscription_plan, tb.plan_code AS tb_plan_code
         FROM ${tbl('tenant_billing')} tb
         INNER JOIN ${tbl('tenants')} t ON trim(tb.tenant_id::text) = t.id::text
         WHERE trim(tb.tenant_id::text) = ?`,
        [tenantId]
    );
    if (!tbJoin?.length) {
        throw new Error('Bu tenant için faturalama kaydı oluşturulamadı (tenant_billing).');
    }
    const planCode = String(tbJoin[0].subscription_plan || tbJoin[0].tb_plan_code || 'basic')
        .toLowerCase()
        .trim();
    let rules = await fetchPlanModuleRules(planCode);
    const hasNonAddon = Array.from(rules.values()).some((v) => v && v !== 'addon');
    if (rules.size === 0 || !hasNonAddon) {
        await bootstrapPlanModuleRulesIfFresh();
        rules = await fetchPlanModuleRules(planCode);
    }

    const added: string[] = [];
    const skipped: string[] = [];
    let deltaMonthly = 0;
    let deltaSetup = 0;
    const tid = String(tenantId).trim();

    const client = await pool.connect();
    const q = async (sql: string, params: any[]) => {
        const { text, values } = mysqlParamsToPg(sql, params);
        return client.query(text, values);
    };

    try {
        await client.query('BEGIN');

        for (const code of moduleCodes) {
            const mode = rules.get(code) ?? 'addon';
            if (mode === 'locked') {
                throw new Error(`Modül bu planda kapalı: ${code}`);
            }
            if (mode === 'included') {
                skipped.push(code);
                continue;
            }

            const modsRes = await q(`SELECT * FROM ${tbl('billing_modules')} WHERE code = ? AND is_active = true`, [code]);
            const m = modsRes.rows?.[0];
            if (!m) {
                throw new Error(`Bilinmeyen modül: ${code}`);
            }

            const unitSetup = Number(m.setup_price) || 0;
            const unitMonthly = Number(m.monthly_price) || 0;

            let qty = 1;
            if (code === 'extra_device' && extraDeviceQty && extraDeviceQty > 0) {
                qty = extraDeviceQty;
            } else if (code === 'extra_printer' && extraPrinterQty && extraPrinterQty > 0) {
                qty = extraPrinterQty;
            }

            const ex = await q(
                `SELECT id, quantity, monthly_line_total, setup_line_total FROM ${tbl('tenant_modules')} WHERE trim(tenant_id::text) = ? AND module_code = ?`,
                [tid, code]
            );

            if (ex.rows?.length) {
                if (code === 'extra_device' || code === 'extra_printer') {
                    const oldRow = ex.rows[0] as { quantity?: number; monthly_line_total?: number };
                    const oldQty = Math.max(0, Number(oldRow.quantity) || 0);
                    const newQty = oldQty + qty;
                    const oldMonthly = Number(oldRow.monthly_line_total) || 0;
                    const newMonthlyTotal = unitMonthly * newQty;
                    const deltaM = newMonthlyTotal - oldMonthly;
                    const deltaS = unitSetup * qty;
                    await q(
                        `UPDATE ${tbl('tenant_modules')} SET quantity = ?, monthly_line_total = ?, setup_line_total = ?
                         WHERE trim(tenant_id::text) = ? AND module_code = ?`,
                        [newQty, newMonthlyTotal, unitSetup * newQty, tid, code]
                    );
                    deltaMonthly += deltaM;
                    deltaSetup += deltaS;
                    added.push(`${code} (+${qty})`);
                } else {
                    skipped.push(`${code} (zaten kayıtlı)`);
                }
                continue;
            }

            const setup = unitSetup * qty;
            const monthly = unitMonthly * qty;

            await q(
                `INSERT INTO ${tbl('tenant_modules')} (tenant_id, module_code, quantity, setup_line_total, monthly_line_total)
                 VALUES (?, ?, ?, ?, ?)`,
                [tid, code, qty, setup, monthly]
            );
            deltaMonthly += monthly;
            deltaSetup += setup;
            added.push(code);
        }

        if (deltaMonthly > 0 || deltaSetup > 0) {
            const up = await q(
                `UPDATE ${tbl('tenant_billing')} SET
                    monthly_recurring_total = monthly_recurring_total + ?::numeric,
                    setup_fee_total = setup_fee_total + ?::numeric,
                    last_payment_at = NOW(),
                    payment_current = true,
                    next_payment_due = COALESCE(
                        next_payment_due,
                        (CURRENT_DATE + INTERVAL '1 month')::date
                    ),
                    updated_at = NOW()
                 WHERE trim(tenant_id::text) = ?`,
                [deltaMonthly, deltaSetup, tid]
            );
            if ((up.rowCount ?? 0) === 0) {
                throw new Error(
                    'Faturalama satırı güncellenemedi (tenant_billing.tenant_id eşleşmedi). Aylık tutar hesaba işlenmedi.'
                );
            }

            if (paymentMethod) {
                const pm = mapSaaSPaymentMethod(paymentMethod);
                const payHint = `${paymentMethod}${paymentMethod === 'wallet_balance' ? ' (bakiye)' : ''}`;
                const modsList = added.join(', ');
                /** Kurulum: tek seferlik tahsilat (hesap: setup). Aylık: yinelenen servis ücreti kümülatifi (hesap: addon). */
                if (deltaSetup > 0) {
                    await q(
                        `INSERT INTO ${tbl('payment_history')} (tenant_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
                         VALUES (?::uuid, ?, 'EUR', 'setup', ?, ?, 'paid', NOW(), ?)`,
                        [
                            tid,
                            Number(deltaSetup.toFixed(2)),
                            pm,
                            `Ek modül kurulum (tek sefer): ${modsList} · ${deltaSetup.toFixed(2)} € · Ödeme: ${payHint}`,
                            adminUsername || 'saas_admin',
                        ]
                    );
                }
                if (deltaMonthly > 0) {
                    await q(
                        `INSERT INTO ${tbl('payment_history')} (tenant_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
                         VALUES (?::uuid, ?, 'EUR', 'addon', ?, ?, 'paid', NOW(), ?)`,
                        [
                            tid,
                            Number(deltaMonthly.toFixed(2)),
                            pm,
                            `Ek modül aylık satır (servis ücretine eklendi, her dönem yenilenir): ${modsList} · ${deltaMonthly.toFixed(2)} €/ay · Ödeme: ${payHint}`,
                            adminUsername || 'saas_admin',
                        ]
                    );
                }
            }
        }

        await client.query('COMMIT');
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw e;
    } finally {
        client.release();
    }

    invalidateTenantCache(tenantId);

    if (added.includes('qr_web_menu')) {
        try {
            const { provisionQrWebSubdomain } = await import('./qrWebProvisioning.service.js');
            const prov = await provisionQrWebSubdomain(tenantId);
            if (prov.created && prov.domain) {
                console.log(`[billing] QR Web alt domain: ${prov.domain} (tenant ${tenantId})`);
            }
        } catch (e: any) {
            console.error('[billing] qr_web_menu provizyon hatası:', e?.message || e);
        }
    }

    const totals = { setup: deltaSetup, monthly: deltaMonthly };
    return { added, skipped, totals };
}

export async function getTenantEntitlements(tenantId: string): Promise<{
    entitlements: ModuleEntitlement[];
    billingSnapshot: TenantModulesBillingSnapshot | null;
}> {
    /** PG: tenants.id = UUID, tenant_billing.tenant_id = CHAR(36) — doğrudan = operatörü 500 verir */
    const [tenantRow]: any = await queryPublic(
        `SELECT t.subscription_plan AS subscription_plan,
                tb.plan_code AS tb_plan_code,
                tb.billing_cycle AS billing_cycle,
                tb.monthly_recurring_total AS monthly_recurring_total,
                tb.next_payment_due AS next_payment_due
         FROM ${tbl('tenants')} t
         LEFT JOIN ${tbl('tenant_billing')} tb ON trim(tb.tenant_id::text) = t.id::text
         WHERE t.id::text = ?`,
        [tenantId]
    );
    const tr = tenantRow?.[0];
    if (!tr) {
        return { entitlements: [], billingSnapshot: null };
    }

    await ensureTenantBillingIfMissing(tenantId);

    /** Kaynak: tenants.subscription_plan (güncel paket). tb.plan_code eski kalabiliyor → önce abonelik alanı. */
    const planCode = String(tr.subscription_plan || tr.tb_plan_code || 'basic')
        .toLowerCase()
        .trim();

    const [mods]: any = await queryPublic(
        `SELECT code, name, category, setup_price, monthly_price FROM ${tbl('billing_modules')} WHERE is_active = true ORDER BY sort_order`
    );
    let rules = await fetchPlanModuleRules(planCode);
    /** plan_module_rules boşsa Pro/Enterprise kuralları DB'ye bootstrap et — yoksa tüm modüller addon görünür */
    const hasNonAddon = Array.from(rules.values()).some((v) => v && v !== 'addon');
    if (rules.size === 0 || !hasNonAddon) {
        await bootstrapPlanModuleRulesIfFresh();
        rules = await fetchPlanModuleRules(planCode);
    }

    const [purchased]: any = await queryPublic(
        `SELECT module_code, quantity, monthly_line_total, setup_line_total, is_active
         FROM ${tbl('tenant_modules')}
         WHERE trim(tenant_id::text) = ? AND is_active = true`,
        [tenantId]
    );
    const tmByCode = new Map<
        string,
        { quantity: number; monthly_line_total: number; setup_line_total: number }
    >();
    for (const p of purchased || []) {
        const mc = (p as any).module_code ?? (p as any).moduleCode;
        if (!mc) continue;
        tmByCode.set(String(mc), {
            quantity: Number((p as any).quantity) || 1,
            monthly_line_total: Number((p as any).monthly_line_total ?? (p as any).monthlyLineTotal) || 0,
            setup_line_total: Number((p as any).setup_line_total ?? (p as any).setupLineTotal) || 0,
        });
    }
    const bought = new Set(tmByCode.keys());

    const [pf]: any = await queryPublic(
        `SELECT monthly_fee FROM ${tbl('subscription_plans')} WHERE code = ? AND is_active = true LIMIT 1`,
        [planCode]
    );
    const planBaseMonthly = Number(pf?.[0]?.monthly_fee ?? pf?.[0]?.monthlyFee ?? 0);
    let monthlyFromAddons = 0;
    for (const [, v] of tmByCode) {
        monthlyFromAddons += v.monthly_line_total;
    }
    const mrtFromDb = tr.monthly_recurring_total != null ? Number(tr.monthly_recurring_total) : null;
    const billingSnapshot: TenantModulesBillingSnapshot = {
        planCode,
        billingCycle: (String(tr.billing_cycle || 'monthly') === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly',
        monthlyRecurringTotal: mrtFromDb != null && !Number.isNaN(mrtFromDb) ? mrtFromDb : planBaseMonthly + monthlyFromAddons,
        planBaseMonthly,
        monthlyFromAddons,
        nextPaymentDue: tr.next_payment_due ? String(tr.next_payment_due).slice(0, 10) : null,
    };

    const out: ModuleEntitlement[] = [];
    for (const m of mods || []) {
        const mode = rules.get(m.code) ?? 'addon';
        const sp = Number(m.setup_price) || 0;
        const mp = Number(m.monthly_price) || 0;
        const tm = tmByCode.get(m.code);
        if (mode === 'locked') {
            out.push({
                code: m.code,
                name: m.name,
                category: m.category,
                enabled: false,
                mode,
                reason: 'upgrade_required',
                setup_price: sp,
                monthly_price: mp,
            });
        } else if (mode === 'included') {
            out.push({
                code: m.code,
                name: m.name,
                category: m.category,
                enabled: true,
                mode,
                reason: 'included_in_plan',
                setup_price: sp,
                monthly_price: mp,
            });
        } else {
            const has = bought.has(m.code);
            out.push({
                code: m.code,
                name: m.name,
                category: m.category,
                enabled: has,
                mode,
                reason: has ? 'purchased_addon' : 'not_purchased',
                setup_price: sp,
                monthly_price: mp,
                ...(has && tm
                    ? { quantity: tm.quantity, monthlyLineTotal: tm.monthly_line_total }
                    : {}),
            });
        }
    }
    return { entitlements: out, billingSnapshot };
}

/** Domain tabanlı `/api/v1/qr-web/*` için: `qr_web_menu` modülü açık mı (plan dahil veya satın alınmış)? */
export async function isTenantQrWebMenuEnabled(tenantId: string): Promise<boolean> {
    const { entitlements } = await getTenantEntitlements(tenantId);
    const row = entitlements.find((e) => e.code === 'qr_web_menu');
    return Boolean(row?.enabled);
}

/** Genel modül kontrolü (POS / API middleware) */
export async function isTenantModuleEnabled(tenantId: string, moduleCode: string): Promise<boolean> {
    const { entitlements } = await getTenantEntitlements(tenantId);
    const row = entitlements.find((e) => e.code === moduleCode);
    return Boolean(row?.enabled);
}

/** Paket kotası + `extra_device` satırları */
export async function getEffectiveMaxDevices(tenantId: string): Promise<{ base: number; extra: number; total: number }> {
    const tid = String(tenantId).trim();
    const [trows]: any = await queryPublic(
        `SELECT t.subscription_plan AS sp, sp.max_devices AS md
         FROM ${tbl('tenants')} t
         LEFT JOIN ${tbl('subscription_plans')} sp ON LOWER(TRIM(sp.code)) = LOWER(TRIM(t.subscription_plan))
         WHERE t.id::text = ?`,
        [tid]
    );
    const base = Math.max(1, Number(trows?.[0]?.md ?? 3));
    const [ex]: any = await queryPublic(
        `SELECT COALESCE(SUM(quantity), 0)::int AS q
         FROM ${tbl('tenant_modules')}
         WHERE trim(tenant_id::text) = ? AND module_code = 'extra_device' AND is_active = true`,
        [tid]
    );
    const extra = Math.max(0, Number(ex?.[0]?.q ?? 0));
    return { base, extra, total: base + extra };
}

/** Plan kotası (`max_printers`) + `extra_printer` modül adetleri */
export async function getEffectiveMaxPrinters(tenantId: string): Promise<{ base: number; extra: number; total: number }> {
    const tid = String(tenantId).trim();
    const [trows]: any = await queryPublic(
        `SELECT sp.max_printers AS mp
         FROM ${tbl('tenants')} t
         LEFT JOIN ${tbl('subscription_plans')} sp ON LOWER(TRIM(sp.code)) = LOWER(TRIM(t.subscription_plan))
         WHERE t.id::text = ?`,
        [tid]
    );
    const base = Math.max(1, Number(trows?.[0]?.mp ?? BASE_INCLUDED_PRINTER_STATIONS));
    const [ex]: any = await queryPublic(
        `SELECT COALESCE(SUM(quantity), 0)::int AS q
         FROM ${tbl('tenant_modules')}
         WHERE trim(tenant_id::text) = ? AND module_code = 'extra_printer' AND is_active = true`,
        [tid]
    );
    const extra = Math.max(0, Number(ex?.[0]?.q ?? 0));
    return { base, extra, total: base + extra };
}

function dateAddMonths(m: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
}
function dateAddYears(y: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + y);
    return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
    return Math.floor((b.getTime() - a.getTime()) / (86400 * 1000));
}

/**
 * Günlük: vade + grace geçmiş ve ödeme güncel değilse tenant'ı askıya al
 */
export async function runBillingCron(): Promise<void> {
    try {
        const [rows]: any = await queryPublic(`
            SELECT tb.tenant_id, tb.next_payment_due, tb.grace_days_after_due, tb.last_payment_at, tb.payment_current
            FROM ${tbl('tenant_billing')} tb
            INNER JOIN ${tbl('tenants')} t ON trim(tb.tenant_id::text) = t.id::text
            WHERE t.status = 'active'
              AND tb.next_payment_due IS NOT NULL
        `);

        const now = new Date();
        for (const row of rows || []) {
            const dueDate = new Date(row.next_payment_due + 'T00:00:00');
            const graceEnd = new Date(dueDate);
            graceEnd.setDate(graceEnd.getDate() + (row.grace_days_after_due || 1));

            if (now <= graceEnd) continue;

            // GELİŞTİRME MODUNDA KORUMA: Development'ta hesapları askıya alma
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`⚠️ [Billing] Geliştirme modunda olduğunuz için askıya alma atlandı: ${row.tenant_id} (Vade dolmuş)`);
                continue;
            }

            await queryPublic(
                `UPDATE ${tbl('tenants')} SET status = 'suspended' WHERE id = ?`,
                [row.tenant_id]
            );
            await queryPublic(
                `UPDATE ${tbl('tenant_billing')} SET suspended_at = NOW(), suspension_reason = ?, payment_current = 0 WHERE tenant_id = ?`,
                ['Ödeme vadesi aşıldı (otomatik)', row.tenant_id]
            );
            invalidateTenantCache(row.tenant_id);
            console.log(`⏸️ Tenant askıya alındı (ödeme): ${row.tenant_id}`);
        }

        // Basit hatırlatma logu: vadeye 7 gün kala
        const [rem]: any = await queryPublic(`
            SELECT tb.tenant_id, tb.next_payment_due, t.name
            FROM ${tbl('tenant_billing')} tb
            INNER JOIN ${tbl('tenants')} t ON trim(tb.tenant_id::text) = t.id::text
            WHERE t.status = 'active' AND tb.next_payment_due IS NOT NULL
        `);
        for (const r of rem || []) {
            const due = new Date(r.next_payment_due + 'T12:00:00');
            const d = daysBetween(now, due);
            if (d >= 0 && d <= 7) {
                const [already]: any = await queryPublic(
                    `SELECT COUNT(*) as c FROM ${tbl('billing_reminder_log')} WHERE tenant_id = ? AND kind = 'before_due' AND DATE(created_at) = CURRENT_DATE`,
                    [r.tenant_id]
                );
                if (already?.[0]?.c > 0) continue;
                await queryPublic(
                    `INSERT INTO ${tbl('billing_reminder_log')} (tenant_id, kind, message) VALUES (?, 'before_due', ?)`,
                    [
                        r.tenant_id,
                        `Vade: ${r.next_payment_due} — ${d} gün içinde ödeme bekleniyor (${r.name})`,
                    ]
                );
            }
        }
    } catch (e) {
        console.error('runBillingCron:', e);
    }
}

/**
 * Muhasebe cron'u:
 * 1) `tenant_billing.next_payment_due` için ayrıca dashboard'da görünsün diye `payment_history` pending subscription üretir.
 * 2) `payment_history` pending kayıtlarında `due_date` bazlı 2 gün önce uyarı + vade geçince pasif etme.
 */
export async function runAccountingCron(): Promise<void> {
    const WARN_DAYS = 7;
    try {
        // 1) Her next_payment_due için tek seferlik "pending subscription" faturası oluştur.
        // (Dashboard: FinanceTab -> pendingPayments listesi bu kayıtları gösterir.)
        await queryPublic(`
            INSERT INTO ${tbl('payment_history')}
                (tenant_id, amount, currency, payment_type, payment_method, description, status, due_date, paid_at, created_by)
            SELECT
                tb.tenant_id::text::uuid as tenant_id,
                CASE
                    WHEN tb.billing_cycle = 'yearly' THEN COALESCE(tb.yearly_prepay_total, tb.monthly_recurring_total * 12)
                    ELSE tb.monthly_recurring_total
                END as amount,
                'EUR' as currency,
                'subscription' as payment_type,
                'bank_transfer' as payment_method,
                'Abonelik yenileme (vade: ' || tb.next_payment_due::text || ')' as description,
                'pending' as status,
                tb.next_payment_due as due_date,
                NULL as paid_at,
                'system' as created_by
            FROM ${tbl('tenant_billing')} tb
            INNER JOIN ${tbl('tenants')} t ON trim(tb.tenant_id::text) = t.id::text
            WHERE t.status = 'active'
              AND tb.next_payment_due IS NOT NULL
              AND tb.payment_current = true
              AND tb.next_payment_due <= (CURRENT_DATE + INTERVAL '7 days')
              AND NOT EXISTS (
                    SELECT 1
                    FROM ${tbl('payment_history')} ph
                    WHERE ph.tenant_id::text = trim(tb.tenant_id::text)
                      AND ph.payment_type = 'subscription'
                      AND (ph.status = 'pending' OR ph.status = 'paid' OR ph.status = 'overdue')
                      AND ph.due_date = tb.next_payment_due
              )
        `);

        // 2) 2 gün önce uyarı
        const [warnRows]: any = await queryPublic(`
            SELECT ph.tenant_id, ph.due_date, t.name
            FROM ${tbl('payment_history')} ph
            INNER JOIN ${tbl('tenants')} t ON ph.tenant_id::text = t.id::text
            WHERE ph.status = 'pending'
              AND ph.due_date IS NOT NULL
              AND ph.due_date = (CURRENT_DATE + ${WARN_DAYS})
        `);

        for (const r of warnRows || []) {
            const tenantId = String(r.tenant_id);
            const due = r.due_date ? String(r.due_date) : '';
            const [already]: any = await queryPublic(
                `SELECT COUNT(*) as c FROM ${tbl('billing_reminder_log')} WHERE tenant_id = ? AND kind = 'before_due' AND DATE(created_at) = CURRENT_DATE`,
                [tenantId]
            );
            if (already?.[0]?.c > 0) continue;
            await queryPublic(
                `INSERT INTO ${tbl('billing_reminder_log')} (tenant_id, kind, message) VALUES (?, 'before_due', ?)`,
                [tenantId, `Vade: ${due} — ${WARN_DAYS} gün kaldı (${r.name})`]
            );
        }

        // 3) Vade geçtiyse: overdue + tenant pasif (suspended)
        await queryPublic(`
            UPDATE ${tbl('payment_history')} ph
            SET status = 'overdue'
            WHERE ph.status = 'pending'
              AND ph.due_date IS NOT NULL
              AND ph.due_date < CURRENT_DATE
        `);

        // SADECE vadesi + ek süresi (grace_days) dolmuş olanları suspend et
        const [overdueTenants]: any = await queryPublic(`
            SELECT DISTINCT ph.tenant_id, tb.grace_days_after_due
            FROM ${tbl('payment_history')} ph
            JOIN ${tbl('tenant_billing')} tb ON trim(ph.tenant_id::text) = trim(tb.tenant_id::text)
            WHERE ph.status = 'overdue'
              AND ph.due_date IS NOT NULL
              AND (ph.due_date + (tb.grace_days_after_due || ' days')::interval) < CURRENT_DATE
        `);

        for (const r of overdueTenants || []) {
            const tenantId = String(r.tenant_id);
            
            // GELİŞTİRME MODUNDA KORUMA: Development'ta hesapları askıya alma
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`⚠️ [Accounting] Geliştirme modunda olduğunuz için askıya alma atlandı: ${tenantId} (Vade dolmuş)`);
                continue;
            }

            await queryPublic(`UPDATE ${tbl('tenants')} SET status = 'suspended' WHERE id = ?`, [tenantId]);
            await queryPublic(
                `UPDATE ${tbl('tenant_billing')}
                 SET suspended_at = NOW(), suspension_reason = ?, payment_current = false
                 WHERE trim(tenant_id::text) = ?`,
                ['Vade ve ek süre aşıldı (bekleyen ödeme)', tenantId]
            );
            invalidateTenantCache(tenantId);
        }
    } catch (e) {
        console.error('runAccountingCron:', e);
    }
}

/** Ödeme kaydedildiğinde bir sonraki vade tarihini ilerlet (ödeme anından itibaren bir dönem) */
export async function advanceBillingAfterPayment(
    tenantId: string,
    billingCycle: 'monthly' | 'yearly'
): Promise<void> {
    const tid = String(tenantId).trim();
    const [rows]: any = await queryPublic(
        `SELECT tb.next_payment_due, t.created_at 
         FROM ${tbl('tenant_billing')} tb
         JOIN ${tbl('tenants')} t ON trim(tb.tenant_id::text) = t.id::text
         WHERE trim(tb.tenant_id::text) = ?`,
        [tid]
    );

    // Vade tarihi stacking (üst üste ekleme) mantığı:
    let base = new Date();
    let creationDay = base.getDate();

    if (rows?.[0]) {
        const row = rows[0];
        if (row.created_at) creationDay = new Date(row.created_at).getDate();

        const currentDueStr = row.next_payment_due || row.nextPaymentDue;
        if (currentDueStr) {
            const currentDue = new Date(currentDueStr);
            if (!isNaN(currentDue.getTime()) && currentDue > base) {
                base = currentDue;
            }
        }
    }

    const next = new Date(base);
    if (billingCycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
    else next.setMonth(next.getMonth() + 1);

    // Gün bazlı sabitleme (Vade sistemi oluşturma tarihinden başlar kuralı)
    const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(creationDay, lastDayOfMonth));

    await queryPublic(
        `UPDATE ${tbl('tenant_billing')} SET last_payment_at = NOW(), next_payment_due = ?, payment_current = true, suspended_at = NULL, suspension_reason = NULL WHERE trim(tenant_id::text) = ?`,
        [next.toISOString().slice(0, 10), tid]
    );
    await queryPublic(`UPDATE ${tbl('tenants')} SET status = 'active' WHERE id::text = ?`, [tid]);
    invalidateTenantCache(tenantId);
}

export type ReactivationQuoteResult =
    | { ok: true; fee: number; percent: number; baseAmount: number }
    | { ok: false; error: string };

/** Yeniden aktivasyon: dönem tutarının %10’u (tenant_billing.reactivation_fee_percent) */
export async function getReactivationQuote(tenantId: string): Promise<ReactivationQuoteResult> {
    const [tb]: any = await queryPublic(
        `SELECT monthly_recurring_total, reactivation_fee_percent, yearly_prepay_total, billing_cycle FROM ${tbl('tenant_billing')} WHERE tenant_id = ?`,
        [tenantId]
    );
    const row = tb?.[0];
    if (!row) {
        return { ok: false, error: 'Faturalama kaydı yok' };
    }
    const base =
        row.billing_cycle === 'yearly'
            ? Number(row.yearly_prepay_total || 0)
            : Number(row.monthly_recurring_total || 0);
    const pct = Number(row.reactivation_fee_percent || 10);
    const fee = Math.max(0, base * (pct / 100));
    return { ok: true, fee, percent: pct, baseAmount: base };
}

/** SaaS süper admin: tüm faturalama modülleri (pasif dahil) */
export async function getBillingModulesAdminRows(): Promise<
    {
        id: number;
        code: string;
        name: string;
        description: string | null;
        category: string;
        setup_price: number;
        monthly_price: number;
        icon: string | null;
        sort_order: number;
        is_active: number;
        created_at: Date | string;
    }[]
> {
    const [rows]: any = await queryPublic(
        `SELECT id, code, name, description, category, setup_price, monthly_price, icon, sort_order, is_active, created_at
         FROM ${tbl('billing_modules')} ORDER BY sort_order ASC, id ASC`
    );
    return rows || [];
}

export interface BillingModuleUpsertInput {
    code: string;
    name: string;
    description?: string | null;
    category: string;
    setup_price: number;
    monthly_price: number;
    icon?: string | null;
    sort_order?: number;
}

export async function insertBillingModuleRow(input: BillingModuleUpsertInput): Promise<void> {
    await queryPublic(
        `INSERT INTO ${tbl('billing_modules')} (code, name, description, category, setup_price, monthly_price, icon, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)`,
        [
            input.code,
            input.name,
            input.description ?? null,
            input.category,
            input.setup_price,
            input.monthly_price,
            input.icon ?? null,
            input.sort_order ?? 100,
        ]
    );
    await ensurePlanModuleRulesRows();
}

export async function updateBillingModuleRow(
    code: string,
    patch: Partial<{
        name: string;
        description: string | null;
        category: string;
        setup_price: number;
        monthly_price: number;
        icon: string | null;
        sort_order: number;
        is_active: boolean;
    }>
): Promise<void> {
    const fields: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: unknown) => {
        fields.push(`${col} = ?`);
        vals.push(v);
    };
    if (patch.name !== undefined) set('name', patch.name);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.category !== undefined) set('category', patch.category);
    if (patch.setup_price !== undefined) set('setup_price', patch.setup_price);
    if (patch.monthly_price !== undefined) set('monthly_price', patch.monthly_price);
    if (patch.icon !== undefined) set('icon', patch.icon);
    if (patch.sort_order !== undefined) set('sort_order', patch.sort_order);
    if (patch.is_active !== undefined) set('is_active', patch.is_active);
    if (!fields.length) return;
    vals.push(code);
    await queryPublic(`UPDATE ${tbl('billing_modules')} SET ${fields.join(', ')} WHERE code = ?`, vals);
}

/** hard: plan_module_rules + tenant_modules silinir; soft: sadece is_active=0 */
export async function removeBillingModuleRow(code: string, hard: boolean): Promise<void> {
    if (hard) {
        await queryPublic(`DELETE FROM ${tbl('plan_module_rules')} WHERE module_code = ?`, [code]);
        await queryPublic(`DELETE FROM ${tbl('tenant_modules')} WHERE module_code = ?`, [code]);
        await queryPublic(`DELETE FROM ${tbl('billing_modules')} WHERE code = ?`, [code]);
    } else {
        await queryPublic(`UPDATE ${tbl('billing_modules')} SET is_active = false WHERE code = ?`, [code]);
    }
}

/** 
 * Kasiyer ve Admin panelleri için ödeme uyarısı / durum kontrolü + modül/cihaz özeti (POS kapıları)
 */
export async function getTenantBillingStatus(tenantId: string): Promise<{
    isSuspended: boolean;
    hasWarning: boolean;
    nextPaymentDue: string | null;
    pendingPaymentLine: PendingPaymentLine | null;
    daysRemaining: number | null;
    planCode: string | null;
    maxDevices: { base: number; extra: number; total: number } | null;
    entitlements: { code: string; enabled: boolean; mode: PlanModuleMode }[];
}> {
    const tid = String(tenantId).trim();
    const [tbRow]: any = await queryPublic(
        `SELECT tb.*, t.status, t.subscription_plan AS subscription_plan
         FROM ${tbl('tenant_billing')} tb
         JOIN ${tbl('tenants')} t ON trim(tb.tenant_id::text) = t.id::text
         WHERE trim(tb.tenant_id::text) = ?`,
        [tid]
    );

    let entitlements: { code: string; enabled: boolean; mode: PlanModuleMode }[] = [];
    let maxDevices: { base: number; extra: number; total: number } | null = null;
    let planCode: string | null = null;

    try {
        const { entitlements: ent } = await getTenantEntitlements(tid);
        entitlements = ent.map((e) => ({ code: e.code, enabled: e.enabled, mode: e.mode }));
        maxDevices = await getEffectiveMaxDevices(tid);
        const [pc]: any = await queryPublic(`SELECT subscription_plan FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
        planCode = pc?.[0]?.subscription_plan ? String(pc[0].subscription_plan) : null;
    } catch {
        /* ignore */
    }

    if (!tbRow?.length) {
        return {
            isSuspended: false,
            hasWarning: false,
            nextPaymentDue: null,
            pendingPaymentLine: null,
            daysRemaining: null,
            planCode,
            maxDevices,
            entitlements,
        };
    }

    const tb = tbRow[0] as Record<string, unknown>;
    const isSuspended = tb.status === 'suspended';

    // Bekleyen veya vadesi geçmiş ödeme var mı?
    const [pendingRowsRaw] = await queryPublic(
        `SELECT id, tenant_id, amount, currency, payment_type, payment_method, description, status, due_date, paid_at, created_at
         FROM ${tbl('payment_history')}
         WHERE trim(tenant_id::text) = ? AND (status = 'pending' OR status = 'overdue')
         ORDER BY due_date ASC LIMIT 1`,
        [tid]
    );
    const pendingRows = (Array.isArray(pendingRowsRaw) ? pendingRowsRaw : []) as PendingPaymentLine[];
    const pendingPaymentLine = pendingRows[0] ?? null;
    let hasWarning = false;
    let daysRemaining = null;

    if (tb.next_payment_due) {
        const due = new Date(String(tb.next_payment_due));
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        daysRemaining = Math.ceil((due.getTime() - now.getTime()) / (86400 * 1000));

        if (daysRemaining <= 7) {
            hasWarning = true;
        }
    }

    if (tb.subscription_plan) {
        planCode = String(tb.subscription_plan);
    }

    return {
        isSuspended,
        hasWarning,
        nextPaymentDue: tb.next_payment_due ? String(tb.next_payment_due).slice(0, 10) : null,
        pendingPaymentLine,
        daysRemaining,
        planCode,
        maxDevices,
        entitlements,
    };
}
