/**
 * NextPOS — Abonelik fiyatlandırma, modül satırları, vade / askıya alma cron
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { queryPublic, invalidateTenantCache, getPublicDatabaseName, mysqlParamsToPg } from '../lib/db.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** PostgreSQL: "public"."tablo" */
function tbl(table: string): string {
    return `"public"."${table}"`;
}

/** PG DATE / JS Date → YYYY-MM-DD (`String(date)` yerel "Wed Aug 19" üretir — kullanma) */
export function formatPgDateOnly(value: unknown): string | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function computeDaysUntilDateOnly(dueYmd: string, now = new Date()): number {
    const due = new Date(`${dueYmd}T12:00:00`);
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

/** Vade aşımında tenant askıya alma: üretimde açık; geliştirmede kapalı. `BILLING_ENFORCE_SUSPEND=1` ile zorlanır. */
function billingShouldSuspendForOverdue(): boolean {
    const v = String(process.env.BILLING_ENFORCE_SUSPEND || '').toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    return process.env.NODE_ENV === 'production';
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

/** Bayi komisyonu: plan kurulum / modül kurulum / dönem (aylık veya yıllık ön ödeme) payları — kırılım raporu için */
export interface ResellerCommissionSplit {
    setupCorporate: number;
    addonModules: number;
    recurring: number;
    billingCycle: 'monthly' | 'yearly';
}

export function resellerCommissionSplitEuros(
    quote: QuoteBreakdown,
    billingCycle: 'monthly' | 'yearly',
    rates: { reseller_setup_rate?: number; reseller_monthly_rate?: number }
): ResellerCommissionSplit {
    const setupR = Number(rates.reseller_setup_rate ?? 75) / 100;
    const monthlyR = Number(rates.reseller_monthly_rate ?? 50) / 100;
    const setupCorporate = Math.round(quote.setupFee * setupR * 100) / 100;
    const addonModules = Math.round(quote.modulesSetup * setupR * 100) / 100;
    const recurringBase = billingCycle === 'yearly' ? quote.yearlyPrepayTotal : quote.monthlyRecurringTotal;
    const recurring = Math.round(recurringBase * monthlyR * 100) / 100;
    return { setupCorporate, addonModules, recurring, billingCycle };
}

/** payment_history.description — Finans «Komisyon kırılımı» SQL ILIKE yerine parse edilir */
export function formatResellerCommissionDescription(
    tenantName: string,
    split: ResellerCommissionSplit,
    extraSuffix?: string
): string {
    const suf = extraSuffix ? ` ${extraSuffix}` : '';
    return `Komisyon — kurulum (plan) ${split.setupCorporate.toFixed(2)} € · modül kurulum ${split.addonModules.toFixed(2)} € · dönem ${split.recurring.toFixed(2)} € (${split.billingCycle}) — ${String(tenantName).trim()}${suf}`;
}

const RESELLER_COMMISSION_SPLIT_DESC =
    /kurulum \(plan\) ([\d.]+) € · modül kurulum ([\d.]+) € · dönem ([\d.]+) € \((monthly|yearly)\)/i;

/** Ödenmiş reseller_income satırlarından kırılım toplamları (yeni açıklama + eski ILIKE yedek) */
export function aggregateResellerIncomeBreakdown(
    rows: { amount: number | string; description?: string | null }[]
): {
    monthlyBillingCycle: number;
    yearlyBillingCycle: number;
    salesWithAddonModules: number;
    setupAndCorporate: number;
} {
    let monthlyBillingCycle = 0;
    let yearlyBillingCycle = 0;
    let salesWithAddonModules = 0;
    let setupAndCorporate = 0;

    for (const r of rows) {
        const d = String(r.description ?? '');
        const splitM = d.match(RESELLER_COMMISSION_SPLIT_DESC);
        if (splitM) {
            setupAndCorporate += parseFloat(splitM[1]);
            salesWithAddonModules += parseFloat(splitM[2]);
            const rec = parseFloat(splitM[3]);
            if (String(splitM[4]).toLowerCase() === 'yearly') yearlyBillingCycle += rec;
            else monthlyBillingCycle += rec;
            continue;
        }

        const amt = Number(r.amount);
        if (!Number.isFinite(amt)) continue;

        if (/\(setup\)|kurulum|onboarding|kurumsal|\(license\)/i.test(d)) {
            setupAndCorporate += amt;
        } else if (/modül|modul|module/i.test(d)) {
            salesWithAddonModules += amt;
        } else if (/\(yearly\)/i.test(d)) {
            yearlyBillingCycle += amt;
        } else if (/\(monthly\)/i.test(d)) {
            monthlyBillingCycle += amt;
        } else {
            monthlyBillingCycle += amt;
        }
    }

    return {
        monthlyBillingCycle: Math.round(monthlyBillingCycle * 100) / 100,
        yearlyBillingCycle: Math.round(yearlyBillingCycle * 100) / 100,
        salesWithAddonModules: Math.round(salesWithAddonModules * 100) / 100,
        setupAndCorporate: Math.round(setupAndCorporate * 100) / 100,
    };
}

function resellerSplitTotalEuros(s: ResellerCommissionSplit): number {
    return Math.round((s.setupCorporate + s.addonModules + s.recurring) * 100) / 100;
}

/**
 * Ödenmiş reseller_income kırılımı — `tenant_id` ile eski tek satırlı kayıtları (ör. `Komisyon (monthly)` + tüm tutar)
 * güncel paket/modül fiyatına göre bölüştürür; tutar toplamı eşleşmezse eski anahtar kelime mantığına düşer.
 */
export async function aggregateResellerIncomeBreakdownAsync(
    rows: { amount: number | string; description?: string | null; tenant_id?: string | null }[]
): Promise<{
    monthlyBillingCycle: number;
    yearlyBillingCycle: number;
    salesWithAddonModules: number;
    setupAndCorporate: number;
}> {
    let monthlyBillingCycle = 0;
    let yearlyBillingCycle = 0;
    let salesWithAddonModules = 0;
    let setupAndCorporate = 0;

    const tenantSplitCache = new Map<string, ResellerCommissionSplit | null>();

    for (const r of rows) {
        const d = String(r.description ?? '');
        const splitM = d.match(RESELLER_COMMISSION_SPLIT_DESC);
        if (splitM) {
            setupAndCorporate += parseFloat(splitM[1]);
            salesWithAddonModules += parseFloat(splitM[2]);
            const rec = parseFloat(splitM[3]);
            if (String(splitM[4]).toLowerCase() === 'yearly') yearlyBillingCycle += rec;
            else monthlyBillingCycle += rec;
            continue;
        }

        const amt = Number(r.amount);
        if (!Number.isFinite(amt)) continue;

        const tidRaw = r.tenant_id != null ? String(r.tenant_id).trim() : '';
        /** Lisans havuzu komisyonu tenant teklifiyle aynı modelde değil; düzeltme satırı tutarı hedef toplamla eşleşiyorsa bölüştürülmeli */
        const skipReconcile = !tidRaw || /lisans\s*havuzu/i.test(d.toLowerCase());

        if (!skipReconcile) {
            if (!tenantSplitCache.has(tidRaw)) {
                tenantSplitCache.set(tidRaw, await getResellerCommissionSplitForTenant(tidRaw));
            }
            const sp = tenantSplitCache.get(tidRaw);
            if (sp) {
                const sumParts = resellerSplitTotalEuros(sp);
                const tol = Math.max(0.05, Math.round(amt * 0.005 * 100) / 100);
                if (Math.abs(amt - sumParts) <= tol) {
                    setupAndCorporate += sp.setupCorporate;
                    salesWithAddonModules += sp.addonModules;
                    if (sp.billingCycle === 'yearly') yearlyBillingCycle += sp.recurring;
                    else monthlyBillingCycle += sp.recurring;
                    continue;
                }
            }
        }

        if (/\(setup\)|kurulum|onboarding|kurumsal|\(license\)/i.test(d)) {
            setupAndCorporate += amt;
        } else if (/modül|modul|module/i.test(d)) {
            salesWithAddonModules += amt;
        } else if (/\(yearly\)/i.test(d)) {
            yearlyBillingCycle += amt;
        } else if (/\(monthly\)/i.test(d)) {
            monthlyBillingCycle += amt;
        } else {
            monthlyBillingCycle += amt;
        }
    }

    return {
        monthlyBillingCycle: Math.round(monthlyBillingCycle * 100) / 100,
        yearlyBillingCycle: Math.round(yearlyBillingCycle * 100) / 100,
        salesWithAddonModules: Math.round(salesWithAddonModules * 100) / 100,
        setupAndCorporate: Math.round(setupAndCorporate * 100) / 100,
    };
}

/** Havale onayı vb. için tenant anlık fiyatından komisyon kırılımı (settings’te yoksa) */
export async function getResellerCommissionSplitForTenant(tenantId: string): Promise<ResellerCommissionSplit | null> {
    const tid = String(tenantId).trim();
    const [st]: any = await queryPublic(
        `SELECT reseller_setup_rate, reseller_monthly_rate, annual_discount_rate FROM ${tbl('system_settings')} LIMIT 1`
    );
    const srow = st?.[0] || {};

    const [tbrows]: any = await queryPublic(
        `SELECT billing_cycle, plan_code FROM ${tbl('tenant_billing')} WHERE trim(tenant_id::text) = trim(?) LIMIT 1`,
        [tid]
    );
    const tb = tbrows?.[0];
    if (!tb) return null;

    const billingCycle = tb.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const planCode = String(tb.plan_code || 'basic').trim();

    const [mrows]: any = await queryPublic(
        `SELECT module_code, COALESCE(quantity, 1)::int as quantity FROM ${tbl('tenant_modules')} WHERE trim(tenant_id::text) = trim(?)`,
        [tid]
    );

    let extraDeviceQty: number | undefined;
    let extraPrinterQty: number | undefined;
    const moduleCodes: string[] = [];
    for (const m of mrows || []) {
        const code = String(m.module_code || '').trim();
        if (!code) continue;
        moduleCodes.push(code);
        if (code === 'extra_device') extraDeviceQty = Number(m.quantity || 1);
        if (code === 'extra_printer') extraPrinterQty = Number(m.quantity || 1);
    }

    try {
        const quote = await calculateQuote({
            planCode,
            moduleCodes,
            extraDeviceQty,
            extraPrinterQty,
            billingCycle,
            annualDiscountPercent: Number(srow.annual_discount_rate ?? 15),
        });
        return resellerCommissionSplitEuros(quote, billingCycle, srow);
    } catch {
        return null;
    }
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

async function ensureQueueDisplayModule(): Promise<void> {
    try {
        const [rows]: any = await queryPublic(
            `SELECT 1 FROM ${tbl('billing_modules')} WHERE code = 'queue_display' LIMIT 1`
        );
        if (rows?.length) return;
        await queryPublic(
            `INSERT INTO ${tbl('billing_modules')} (code, name, description, category, icon, setup_price, monthly_price, is_active, sort_order)
             VALUES ('queue_display', 'Bekleme Sırası Ekranı', 'Müşteri bekleme sırası ekranı modülü', 'feature', 'FiMonitor', 0, 5, true, 21)
             ON CONFLICT (code) DO NOTHING`
        );
        console.log('✅ queue_display billing modülü eklendi');
    } catch (e: any) {
        console.warn('ensureQueueDisplayModule:', e?.message || e);
    }
}

async function ensureCloudBackupModule(): Promise<void> {
    try {
        const [rows]: any = await queryPublic(
            `SELECT 1 FROM ${tbl('billing_modules')} WHERE code = 'cloud_backup' LIMIT 1`
        );
        if (rows?.length) return;
        await queryPublic(
            `INSERT INTO ${tbl('billing_modules')} (code, name, description, category, icon, setup_price, monthly_price, is_active, sort_order)
             VALUES ('cloud_backup', 'Bulut Yedekleme', 'Günlük, haftalık ve aylık bulut yedekleme hizmeti', 'service', 'FiCloud', 0, 9, true, 22)
             ON CONFLICT (code) DO NOTHING`
        );
        console.log('✅ cloud_backup billing modülü eklendi');
    } catch (e: any) {
        console.warn('ensureCloudBackupModule:', e?.message || e);
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
            ['basic', 'queue_display', 'addon'],
            ['basic', 'cloud_backup', 'addon'],

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
            ['pro', 'queue_display', 'included'],
            ['pro', 'cloud_backup', 'addon'],

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
            ['enterprise', 'queue_display', 'included'],
            ['enterprise', 'cloud_backup', 'included'],
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
        await ensureQueueDisplayModule();
        await ensureCloudBackupModule();
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
            await ensureQrWebMenuModule();
            await ensureExtraPrinterModule();
            await ensureQueueDisplayModule();
            await ensureCloudBackupModule();
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

/**
 * Yeni tenant sonrası faturalama özeti:
 * - `setup_fee_total`: plan kurulumu + ücretli modül kurulumları (tek sefer, ilk satışta tahsil edilir).
 * - `monthly_recurring_total`: plan aylığı + ücretli modül aylıkları (her dönem birlikte yenilenir).
 * - `next_payment_due`: ilk aylık/yıllık yenileme vadesi (oluşturulma + 1 ay/yıl).
 */
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

    // BUG-4 FIX: Modül ekleme audit log kaydı
    if (added.length > 0) {
        try {
            await queryPublic(
                `INSERT INTO \`public\`.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
                 VALUES (?, 'addon_modules_purchased', 'tenant', ?, ?, ?, 'system')`,
                [
                    adminUsername || 'saas_admin',
                    tenantId,
                    JSON.stringify({ skipped }),
                    JSON.stringify({ added, deltaSetup, deltaMonthly }),
                ]
            );
        } catch { /* audit log hataları sessizce yutulur */ }
    }

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
        nextPaymentDue: formatPgDateOnly(tr.next_payment_due),
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

            if (!billingShouldSuspendForOverdue()) {
                console.warn(`⚠️ [Billing] Askıya alma kapalı (geliştirme / BILLING_ENFORCE_SUSPEND=0): ${row.tenant_id}`);
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
                'Aylık yenileme: paket aboneliği + ücretli modül aylıkları (vade: ' || tb.next_payment_due::text || ')' as description,
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
            
            if (!billingShouldSuspendForOverdue()) {
                console.warn(`⚠️ [Accounting] Askıya alma kapalı: ${tenantId}`);
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

    // Yeni vade her zaman ödeme gününden başlar (erken ödemede +60 gün gösterme hatası olmasın)
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    let creationDay = base.getDate();

    if (rows?.[0]?.created_at) {
        creationDay = new Date(rows[0].created_at).getDate();
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

export async function getTenantBillingStatus(tenantId: string): Promise<{
    isSuspended: boolean;
    hasWarning: boolean;
    nextPaymentDue: string | null;
    pendingPaymentLine: PendingPaymentLine | null;
    daysRemaining: number | null;
    planCode: string | null;
    maxDevices: { base: number; extra: number; total: number } | null;
    entitlements: { code: string; enabled: boolean; mode: PlanModuleMode }[];
    walletBalance: number;
}> {
    const tid = String(tenantId).trim();
    try {
        await ensureTenantBillingIfMissing(tid);
    } catch {
        /* tenant yoksa veya seed başarısız — aşağıda boş döner */
    }

    const [tbRow]: any = await queryPublic(
        `SELECT tb.*, t.status, t.subscription_plan AS subscription_plan, t.wallet_balance AS wallet_balance,
                t.license_expires_at AS license_expires_at
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
            walletBalance: 0,
        };
    }

    const tb = tbRow[0] as Record<string, unknown>;
    const isSuspended = tb.status === 'suspended';
    const walletBalance = Number(tb.wallet_balance || 0);

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
    let daysRemaining: number | null = null;

    const nextDueYmd =
        formatPgDateOnly(tb.next_payment_due) ?? formatPgDateOnly(tb.license_expires_at);

    if (nextDueYmd) {
        daysRemaining = computeDaysUntilDateOnly(nextDueYmd);

        if (daysRemaining <= 7) {
            hasWarning = true;
        }
    }

    if (tb.subscription_plan) {
        planCode = String(tb.subscription_plan);
    }

    return {
        isSuspended,
        hasWarning: hasWarning || (walletBalance < 0),
        nextPaymentDue: nextDueYmd,
        pendingPaymentLine,
        daysRemaining,
        planCode,
        maxDevices,
        entitlements,
        walletBalance,
    };
}

/**
 * 💳 NextPOS B2B FinTech & Prepaid Tenant Wallet Core Logic
 */

export interface WalletTransactionResult {
    success: boolean;
    newBalance: number;
    transactionId?: number;
}

/**
 * Restoranın cüzdanına para yükler (Kredi Kartı, Havale / EFT) ve toptan yükleme bonuslarını hesaplar.
 */
export async function depositTenantWallet(
    tenantId: string,
    amount: number,
    paymentMethod: string,
    description: string,
    referenceId?: string,
    existingPaymentHistoryId?: number
): Promise<WalletTransactionResult> {
    const tid = String(tenantId).trim();
    const amt = Number(amount);
    if (amt <= 0) throw new Error('Bakiye yükleme tutarı 0 veya daha küçük olamaz.');

    const [tenantRows]: any = await queryPublic(`SELECT wallet_balance, name FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
    const tenant = tenantRows?.[0];
    if (!tenant) throw new Error('Restoran bulunamadı.');

    const currentBalance = Number(tenant.wallet_balance || 0);

    // Toptan ödeme bonusu hesaplama
    // Model C: 6 aylık peşin (Örn: >= 200 EUR) %10 bonus, 12 aylık peşin (Örn: >= 400 EUR) %20 bonus
    let bonusAmount = 0;
    let bonusReason = '';
    
    if (amt >= 400) {
        bonusAmount = Math.round(amt * 0.20 * 100) / 100;
        bonusReason = '12 Aylık Yıllık Toptan Yükleme %20 Bonusu';
    } else if (amt >= 200) {
        bonusAmount = Math.round(amt * 0.10 * 100) / 100;
        bonusReason = '6 Aylık Toptan Yükleme %10 Bonusu';
    }

    const totalDeposit = amt + bonusAmount;
    const newBalance = currentBalance + totalDeposit;

    // 1. Veritabanında wallet_balance güncelle
    await queryPublic(`UPDATE ${tbl('tenants')} SET wallet_balance = ? WHERE id::text = ?`, [newBalance, tid]);

    // 2. Ödeme geçmişi logu oluştur veya var olanı güncelle
    let payHistId = existingPaymentHistoryId || null;
    if (payHistId) {
        await queryPublic(`
            UPDATE ${tbl('payment_history')}
            SET status = 'paid', paid_at = NOW(), payment_method = ?
            WHERE id = ?
        `, [paymentMethod, payHistId]);
    } else {
        const [payHistResult]: any = await queryPublic(`
            INSERT INTO ${tbl('payment_history')}
            (tenant_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
            VALUES (?, ?, 'EUR', 'wallet_deposit', ?, ?, 'paid', NOW(), 'system')
            RETURNING id
        `, [tid, amt, paymentMethod, description]);
        payHistId = payHistResult?.[0]?.id || null;
    }

    // 3. Cüzdan hareket logu oluştur
    const [txResult]: any = await queryPublic(`
        INSERT INTO ${tbl('tenant_wallet_transactions')}
        (tenant_id, amount, balance_before, balance_after, type, description, reference_id)
        VALUES (?, ?, ?, ?, 'deposit', ?, ?)
        RETURNING id
    `, [tid, amt, currentBalance, currentBalance + amt, 'deposit', payHistId ? String(payHistId) : referenceId]);

    // 4. Bonus varsa bonus cüzdan hareketini ekle
    if (bonusAmount > 0) {
        await queryPublic(`
            INSERT INTO ${tbl('tenant_wallet_transactions')}
            (tenant_id, amount, balance_before, balance_after, type, description, reference_id)
            VALUES (?, ?, ?, ?, 'bonus', ?, ?)
        `, [tid, bonusAmount, currentBalance + amt, newBalance, 'bonus', bonusReason, payHistId ? String(payHistId) : referenceId]);

        // Ödeme geçmişine de bonus logu atalım
        await queryPublic(`
            INSERT INTO ${tbl('payment_history')}
            (tenant_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
            VALUES (?, ?, 'EUR', 'wallet_bonus', 'system', ?, 'paid', NOW(), 'system')
        `, [tid, bonusAmount, bonusReason]);
    }

    // 5. Restoranın fatura durumunu kontrol edip payment_current ve active durumlarını düzelt
    if (newBalance >= 0) {
        await queryPublic(`
            UPDATE ${tbl('tenant_billing')}
            SET payment_current = true, suspended_at = NULL, suspension_reason = NULL
            WHERE trim(tenant_id::text) = ?
        `, [tid]);
        await queryPublic(`UPDATE ${tbl('tenants')} SET status = 'active' WHERE id::text = ?`, [tid]);
        invalidateTenantCache(tid);
    }

    return { success: true, newBalance, transactionId: txResult?.[0]?.id };
}

/**
 * Restoranın cüzdanından tahsilat yapar (Plan, modül veya kurulum ücreti).
 * Eğer restoran bir bayiye bağlıysa, bayi cüzdanına komisyon payını split ederek anında yansıtır.
 */
export async function processTenantWalletCharge(
    tenantId: string,
    amount: number,
    chargeType: 'plan_charge' | 'module_charge' | 'setup_charge',
    description: string
): Promise<WalletTransactionResult> {
    const tid = String(tenantId).trim();
    const amt = Number(amount);
    if (amt <= 0) throw new Error('Harcama tutarı 0 veya daha küçük olamaz.');

    const [tenantRows]: any = await queryPublic(`SELECT wallet_balance, reseller_id, name FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
    const tenant = tenantRows?.[0];
    if (!tenant) throw new Error('Restoran bulunamadı.');

    const currentBalance = Number(tenant.wallet_balance || 0);
    const newBalance = currentBalance - amt;

    // 1. Restoran cüzdan bakiyesini güncelle
    await queryPublic(`UPDATE ${tbl('tenants')} SET wallet_balance = ? WHERE id::text = ?`, [newBalance, tid]);

    // 2. Fatura ve log oluştur
    const [payHistResult]: any = await queryPublic(`
        INSERT INTO ${tbl('payment_history')}
        (tenant_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
        VALUES (?, ?, 'EUR', ?, 'wallet', ?, 'paid', NOW(), 'system')
        RETURNING id
    `, [tid, amt, chargeType, description]);

    const payHistId = payHistResult?.[0]?.id || null;

    // 3. Cüzdan hareket logunu kaydet
    const [txResult]: any = await queryPublic(`
        INSERT INTO ${tbl('tenant_wallet_transactions')}
        (tenant_id, amount, balance_before, balance_after, type, description, reference_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id
    `, [tid, -amt, currentBalance, newBalance, chargeType.replace('_charge', ''), description, payHistId ? String(payHistId) : null]);

    // 4. Bayi (Reseller) komisyon split motorunu çalıştır
    // 4. Bayi (Reseller) veya SaaS Admin komisyon split motorunu çalıştır
    let targetAdminId: number | null = null;
    let targetAdminRole: 'reseller' | 'super_admin' = 'reseller';

    if (tenant.reseller_id) {
        targetAdminId = Number(tenant.reseller_id);
        targetAdminRole = 'reseller';
    } else {
        const [adminRows]: any = await queryPublic(`SELECT id FROM ${tbl('saas_admins')} WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1`);
        if (adminRows?.[0]) {
            targetAdminId = Number(adminRows[0].id);
        } else {
            targetAdminId = 1;
        }
        targetAdminRole = 'super_admin';
    }

    if (targetAdminId) {
        const [adminRows]: any = await queryPublic(`SELECT wallet_balance, full_name, username FROM ${tbl('saas_admins')} WHERE id = ?`, [targetAdminId]);
        const admin = adminRows?.[0];

        const [settingsRows]: any = await queryPublic(`SELECT reseller_setup_rate, reseller_monthly_rate FROM ${tbl('system_settings')} LIMIT 1`);
        const settings = settingsRows?.[0] || {};

        if (admin) {
            let commissionRate = 0.50; // varsayılan %50
            if (chargeType === 'setup_charge') {
                commissionRate = Number(settings.reseller_setup_rate ?? 75) / 100;
            } else {
                commissionRate = Number(settings.reseller_monthly_rate ?? 50) / 100;
            }

            const commissionAmount = Math.round(amt * commissionRate * 100) / 100;

            if (commissionAmount > 0) {
                const adminBalanceBefore = Number(admin.wallet_balance || 0);
                const adminBalanceAfter = adminBalanceBefore + commissionAmount;

                // Cüzdan bakiyesini artır
                await queryPublic(`UPDATE ${tbl('saas_admins')} SET wallet_balance = ? WHERE id = ?`, [adminBalanceAfter, targetAdminId]);

                // Ödeme geçmişi (Gelir logu) ekle
                const desc = targetAdminRole === 'reseller'
                    ? `${tenant.name} - ${description} işleminden %${commissionRate * 100} Bayi Komisyonu`
                    : `${tenant.name} - ${description} işleminden %${commissionRate * 100} SaaS Admin Komisyonu (Bayi Olmadığı İçin)`;

                await queryPublic(`
                    INSERT INTO ${tbl('payment_history')}
                    (saas_admin_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
                    VALUES (?, ?, 'EUR', 'reseller_income', 'split', ?, 'paid', NOW(), 'system')
                `, [
                    targetAdminId,
                    commissionAmount,
                    desc
                ]);
            }
        }
    }

    // 5. Cüzdan eksiye düşerse uyarı durumunu set et
    if (newBalance < 0) {
        await queryPublic(`
            UPDATE ${tbl('tenant_billing')}
            SET payment_current = false, suspended_at = NULL, suspension_reason = 'Cüzdan bakiyesi yetersiz'
            WHERE trim(tenant_id::text) = ?
        `, [tid]);
        invalidateTenantCache(tid);
    }

    return { success: true, newBalance, transactionId: txResult?.[0]?.id };
}

/**
 * Bayi cüzdanından restoran cüzdanına bakiye aktarımı yapar (Elden Nakit / Bayi Öder durumunda).
 */
export async function transferResellerWalletToTenant(
    resellerId: number,
    tenantId: string,
    amount: number,
    description: string
): Promise<{ success: boolean; resellerBalance: number; tenantBalance: number }> {
    const rid = Number(resellerId);
    const tid = String(tenantId).trim();
    const amt = Number(amount);
    if (amt <= 0) throw new Error('Transfer tutarı 0 veya daha küçük olamaz.');

    const [resellerRows]: any = await queryPublic(`SELECT wallet_balance, full_name FROM ${tbl('saas_admins')} WHERE id = ? AND role = 'reseller'`, [rid]);
    const reseller = resellerRows?.[0];
    if (!reseller) throw new Error('Bayi bulunamadı.');

    const resellerBalanceBefore = Number(reseller.wallet_balance || 0);
    if (resellerBalanceBefore < amt) {
        throw new Error(`Transfer için yetersiz bakiye. Mevcut bayi bakiyeniz: ${resellerBalanceBefore.toFixed(2)} EUR`);
    }

    const [tenantRows]: any = await queryPublic(`SELECT wallet_balance, name FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
    const tenant = tenantRows?.[0];
    if (!tenant) throw new Error('Restoran bulunamadı.');

    const tenantBalanceBefore = Number(tenant.wallet_balance || 0);

    // 1. Bayinin cüzdan bakiyesini düş
    const resellerBalanceAfter = resellerBalanceBefore - amt;
    await queryPublic(`UPDATE ${tbl('saas_admins')} SET wallet_balance = ? WHERE id = ?`, [resellerBalanceAfter, rid]);

    // 2. Restoranın cüzdan bakiyesini artır
    const tenantBalanceAfter = tenantBalanceBefore + amt;
    await queryPublic(`UPDATE ${tbl('tenants')} SET wallet_balance = ? WHERE id::text = ?`, [tenantBalanceAfter, tid]);

    // 3. Bayi için harcama/transfer logu oluştur
    await queryPublic(`
        INSERT INTO ${tbl('payment_history')}
        (saas_admin_id, amount, currency, payment_type, payment_method, description, status, paid_at, created_by)
        VALUES (?, ?, 'EUR', 'reseller_transfer', 'wallet', ?, 'paid', NOW(), 'system')
    `, [rid, amt, `${tenant.name} restoran cüzdanına transfer`]);

    // 4. Restoran için cüzdan logu oluştur
    const [txResult]: any = await queryPublic(`
        INSERT INTO ${tbl('tenant_wallet_transactions')}
        (tenant_id, amount, balance_before, balance_after, type, description, reference_id)
        VALUES (?, ?, ?, ?, 'deposit', ?, ?)
        RETURNING id
    `, [tid, amt, tenantBalanceBefore, tenantBalanceAfter, `Bayiden (${reseller.full_name}) transfer: ${description}`, String(rid)]);

    // 5. Restoran ödeme durumunu aktif et
    if (tenantBalanceAfter >= 0) {
        await queryPublic(`
            UPDATE ${tbl('tenant_billing')}
            SET payment_current = true, suspended_at = NULL, suspension_reason = NULL
            WHERE trim(tenant_id::text) = ?
        `, [tid]);
        await queryPublic(`UPDATE ${tbl('tenants')} SET status = 'active' WHERE id::text = ?`, [tid]);
        invalidateTenantCache(tid);
    }

    return {
        success: true,
        resellerBalance: resellerBalanceAfter,
        tenantBalance: tenantBalanceAfter
    };
}

/**
 * Restoranın cüzdan bakiyesini kullanarak toptan lisans paketi (Örn: 6 veya 12 aylık) satın almasını sağlar.
 * Fiyatı anında kilitler ve vade tarihini (nextPaymentDue) belirtilen ay kadar ileriye uzatır.
 */
export async function purchaseBulkPlanForTenant(
    tenantId: string,
    planCode: string,
    months: number
): Promise<{ success: boolean; newBalance: number; newDueDate: string }> {
    const tid = String(tenantId).trim();
    const mths = Number(months);
    if (mths !== 6 && mths !== 12) {
        throw new Error('Yalnızca 6 aylık veya 12 aylık (yıllık) toptan paket satın alınabilir.');
    }

    return await prisma.$transaction(async (tx) => {
        // 1. Restoran ve plan detaylarını çek
        const tenant = await tx.tenant.findUnique({ where: { id: tid } });
        if (!tenant) throw new Error('Restoran bulunamadı.');

        const plan = await tx.subscriptionPlan.findUnique({ where: { code: planCode } });
        if (!plan) throw new Error('Abonelik planı bulunamadı.');

        const systemSettings = await tx.systemSetting.findFirst() || {
            annualDiscountRate: 15,
            resellerMonthlyRate: 50
        };

        const monthlyFee = Number(plan.monthlyFee);
        let totalCost = monthlyFee * mths;

        // Yıllık indirim uygulama
        let discountPercent = 0;
        if (mths === 12) {
            discountPercent = Number(systemSettings.annualDiscountRate || 15);
            totalCost = Math.round(totalCost * (1 - discountPercent / 100) * 100) / 100;
        }

        const walletBalance = Number(tenant.walletBalance || 0);
        if (walletBalance < totalCost) {
            throw new Error(`Yetersiz bakiye. Bu paket için gerekli tutar: ${totalCost.toFixed(2)} EUR. Mevcut cüzdan bakiyeniz: ${walletBalance.toFixed(2)} EUR.`);
        }

        // 2. Cüzdan bakiyesini düş
        const newBalance = walletBalance - totalCost;
        await tx.tenant.update({
            where: { id: tid },
            data: { walletBalance: newBalance }
        });

        // 3. Fatura ve log oluştur
        const desc = `${mths} Aylık Toptan ${plan.name} Planı Satın Alımı (Fiyat Sabitleme Garantili %${discountPercent} İndirimli)`;
        const payHist = await tx.paymentHistory.create({
            data: {
                tenantId: tid,
                amount: totalCost,
                currency: 'EUR',
                paymentType: 'subscription_bulk',
                paymentMethod: 'wallet',
                description: desc,
                status: 'paid',
                paidAt: new Date(),
                createdBy: 'system'
            }
        });

        // 4. Cüzdan hareket logu ekle
        await tx.tenantWalletTransaction.create({
            data: {
                tenantId: tid,
                amount: -totalCost,
                balanceBefore: walletBalance,
                balanceAfter: newBalance,
                type: 'plan_charge',
                description: desc,
                referenceId: String(payHist.id)
            }
        });

        // 5. Lisans vade tarihlerini uzat (Stacking / Üst üste ekleme mantığı)
        const billing = await tx.tenantBilling.findUnique({ where: { tenantId: tid } });
        let baseDate = new Date();
        
        if (billing && billing.nextPaymentDue) {
            const currentDue = new Date(billing.nextPaymentDue);
            if (!isNaN(currentDue.getTime()) && currentDue > baseDate) {
                baseDate = currentDue;
            }
        }

        const newDue = new Date(baseDate);
        newDue.setMonth(newDue.getMonth() + mths);

        // Tarih sabitleme (Oluşturma gününe eşleme)
        let creationDay = tenant.createdAt ? new Date(tenant.createdAt).getDate() : new Date().getDate();
        const lastDayOfNewMonth = new Date(newDue.getFullYear(), newDue.getMonth() + 1, 0).getDate();
        newDue.setDate(Math.min(creationDay, lastDayOfNewMonth));

        const nextPaymentDueStr = newDue.toISOString().slice(0, 10);

        // tenant_billing ve tenant tablosunu güncelle
        await tx.tenantBilling.update({
            where: { tenantId: tid },
            data: {
                nextPaymentDue: newDue,
                paymentCurrent: true,
                suspendedAt: null,
                suspensionReason: null,
                lastPaymentAt: new Date(),
                planCode: planCode,
                billingCycle: mths === 12 ? 'yearly' : 'monthly'
            }
        });

        await tx.tenant.update({
            where: { id: tid },
            data: {
                status: 'active',
                subscriptionPlan: planCode,
                licenseExpiresAt: newDue
            }
        });

        // 6. Bayi (Reseller) veya SaaS Admin komisyon split motorunu çalıştır
        let targetAdminId: number | null = null;
        let targetAdminRole: 'reseller' | 'super_admin' = 'reseller';

        if (tenant.resellerId) {
            targetAdminId = Number(tenant.resellerId);
            targetAdminRole = 'reseller';
        } else {
            const admin = await tx.saasAdmin.findFirst({
                where: { role: 'super_admin' },
                orderBy: { id: 'asc' }
            });
            if (admin) {
                targetAdminId = admin.id;
                targetAdminRole = 'super_admin';
            } else {
                targetAdminId = 1;
                targetAdminRole = 'super_admin';
            }
        }

        if (targetAdminId) {
            const admin = await tx.saasAdmin.findUnique({ where: { id: targetAdminId } });
            if (admin) {
                const commissionRate = Number(systemSettings.resellerMonthlyRate || 50) / 100;
                const commissionAmount = Math.round(totalCost * commissionRate * 100) / 100;

                if (commissionAmount > 0) {
                    const adminBalanceBefore = Number(admin.walletBalance || 0);
                    const adminBalanceAfter = adminBalanceBefore + commissionAmount;

                    // Cüzdan bakiyesini artır
                    await tx.saasAdmin.update({
                        where: { id: targetAdminId },
                        data: { walletBalance: adminBalanceAfter }
                    });

                    const commissionDesc = targetAdminRole === 'reseller'
                        ? `${tenant.name} - ${desc} işleminden %${commissionRate * 100} Bayi Komisyonu`
                        : `${tenant.name} - ${desc} işleminden %${commissionRate * 100} SaaS Admin Komisyonu (Bayi Olmadığı İçin)`;

                    // Ödeme geçmişi (Gelir logu) ekle
                    await tx.paymentHistory.create({
                        data: {
                            saasAdminId: targetAdminId,
                            amount: commissionAmount,
                            currency: 'EUR',
                            paymentType: 'reseller_income',
                            paymentMethod: 'split',
                            description: commissionDesc,
                            status: 'paid',
                            paidAt: new Date(),
                            createdBy: 'system'
                        }
                    });
                }
            }
        }

        invalidateTenantCache(tid);

        return {
            success: true,
            newBalance,
            newDueDate: nextPaymentDueStr
        };
    });
}

const PAYABLE_INVOICE_TYPES = new Set([
    'subscription',
    'license',
    'setup',
    'addon',
    'reactivation',
    'plan_charge',
    'module_charge',
    'other',
]);

/** Bekleyen abonelik/fatura kaydını restoran cüzdan bakiyesi ile kapatır */
export async function payTenantInvoiceWithWallet(params: {
    tenantId: string;
    paymentHistoryId: number;
    createdBy?: string;
}): Promise<{ ok: true; newBalance: number; message: string }> {
    const tid = String(params.tenantId).trim();
    const paymentHistoryId = Number(params.paymentHistoryId);
    if (!tid || !Number.isFinite(paymentHistoryId)) {
        throw new Error('Geçersiz fatura veya tenant');
    }

    const [rows]: any = await queryPublic(`SELECT * FROM ${tbl('payment_history')} WHERE id = ?`, [paymentHistoryId]);
    const invoice = rows?.[0];
    if (!invoice) throw new Error('Fatura bulunamadı');

    const invTenantId = String(invoice.tenant_id ?? invoice.tenantId ?? '').trim();
    if (invTenantId !== tid) throw new Error('Bu faturayı ödeme yetkiniz yok');

    const status = String(invoice.status || '').toLowerCase();
    if (status === 'paid') throw new Error('Bu fatura zaten ödenmiş');

    const paymentType = String(invoice.payment_type || 'subscription').toLowerCase();
    if (paymentType === 'wallet_deposit' || paymentType === 'reseller_income' || paymentType === 'reseller_wallet_topup') {
        throw new Error('Bu fatura türü cüzdan bakiyesi ile ödenemez');
    }
    if (!PAYABLE_INVOICE_TYPES.has(paymentType)) {
        throw new Error(`Bu fatura türü (${paymentType}) cüzdan ile ödenemez`);
    }

    const cost = Number(invoice.amount);
    if (!Number.isFinite(cost) || cost <= 0) throw new Error('Geçersiz fatura tutarı');

    const [tenantRows]: any = await queryPublic(`SELECT wallet_balance, name FROM ${tbl('tenants')} WHERE id::text = ?`, [tid]);
    const tenant = tenantRows?.[0];
    if (!tenant) throw new Error('Restoran bulunamadı');

    const balanceBefore = Number(tenant.wallet_balance || 0);
    if (balanceBefore < cost) {
        throw new Error(`Cüzdan bakiyesi yetersiz (gerekli: ${cost.toFixed(2)} €, mevcut: ${balanceBefore.toFixed(2)} €)`);
    }

    const balanceAfter = Math.round((balanceBefore - cost) * 100) / 100;
    const createdBy = params.createdBy?.trim() || 'tenant';

    await queryPublic(`UPDATE ${tbl('tenants')} SET wallet_balance = ? WHERE id::text = ?`, [balanceAfter, tid]);

    await queryPublic(
        `
        INSERT INTO ${tbl('tenant_wallet_transactions')}
        (tenant_id, amount, balance_before, balance_after, type, description, reference_id)
        VALUES (?, ?, ?, ?, 'plan_charge', ?, ?)
    `,
        [
            tid,
            -cost,
            balanceBefore,
            balanceAfter,
            String(invoice.description || `Fatura #${paymentHistoryId}`),
            String(paymentHistoryId),
        ],
    );

    await queryPublic(
        `
        UPDATE ${tbl('payment_history')}
        SET status = 'paid', paid_at = NOW(), payment_method = 'wallet_balance', created_by = ?
        WHERE id = ?
    `,
        [createdBy, paymentHistoryId],
    );

    const [tb]: any = await queryPublic(
        `SELECT billing_cycle FROM ${tbl('tenant_billing')} WHERE trim(tenant_id::text) = ?`,
        [tid],
    );
    const cycle = (tb?.[0]?.billing_cycle === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly';

    if (paymentType === 'subscription' || paymentType === 'license' || paymentType === 'reactivation') {
        await advanceBillingAfterPayment(tid, cycle);
    }

    invalidateTenantCache(tid);

    return {
        ok: true,
        newBalance: balanceAfter,
        message: 'Ödeme cüzdan bakiyeniz ile başarıyla tamamlandı',
    };
}

