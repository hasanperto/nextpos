/**
 * PostgreSQL + Prisma seed (Faz 1).
 * Önkoşul: `npx prisma db push` veya migrate; DATABASE_URL postgresql://...
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import pool from '../src/lib/db.js';
import { prisma } from '../src/lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const DEMO_TENANT_ID = 'a1111111-1111-4111-8111-111111111111';
const SCHEMA = 'tenant_demo';

function loadCreateTenantSchemaFunctionSql(): string {
    const initPath = path.join(__dirname, '../src/lib/init.sql');
    const full = fs.readFileSync(initPath, 'utf-8');
    const start = full.indexOf('CREATE OR REPLACE FUNCTION public.create_new_tenant_schema');
    if (start === -1) throw new Error('init.sql içinde create_new_tenant_schema bulunamadı');
    const end = full.indexOf('$$ LANGUAGE plpgsql;', start);
    if (end === -1) throw new Error('init.sql içinde fonksiyon sonu bulunamadı');
    return full.slice(start, end + '$$ LANGUAGE plpgsql;'.length);
}

async function ensureUuidExtension() {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
}

async function ensureTenantSchemaFunction() {
    const sql = loadCreateTenantSchemaFunctionSql();
    await pool.query(sql);
}

async function seedDemoMenuData() {
    const adminHash = await bcrypt.hash('admin123', 10);
    const cashierHash = await bcrypt.hash('kasa123', 10);
    const waiterHash = await bcrypt.hash('garson123', 10);
    const kitchenHash = await bcrypt.hash('mutfak123', 10);

    await pool.query(`SET search_path TO "${SCHEMA.replace(/"/g, '""')}", public`);

    await pool.query(
        `INSERT INTO "${SCHEMA}".branches (id, name, address, phone) VALUES (1, 'Demo Store', 'Hauptstr. 1, Berlin', '+49 30 12345678')
         ON CONFLICT (id) DO NOTHING`
    );

    await pool.query(
        `INSERT INTO "${SCHEMA}".users (id, username, password_hash, name, role, pin_code, branch_id) VALUES
         (1, 'admin', $1, 'Demo Admin', 'admin'::"${SCHEMA}".user_role, '123456', 1),
         (2, 'cashier', $2, 'Kasiyer Ali', 'cashier'::"${SCHEMA}".user_role, '111111', 1),
         (3, 'waiter', $3, 'Garson Mehmet', 'waiter'::"${SCHEMA}".user_role, '222222', 1),
         (4, 'kitchen', $4, 'Şef Hasan', 'kitchen'::"${SCHEMA}".user_role, '333333', 1)
         ON CONFLICT (id) DO NOTHING`,
        [adminHash, cashierHash, waiterHash, kitchenHash]
    );

    await pool.query(`INSERT INTO "${SCHEMA}".categories (id, name, icon, sort_order) VALUES
        (1, 'Pizza', 'pizza-slice', 1), (2, 'Kebab', 'utensils', 2), (3, 'Döner', 'drumstick-bite', 3),
        (4, 'Beilagen', 'french-fries', 4), (5, 'Getränke', 'glass-water', 5), (6, 'Desserts', 'ice-cream', 6)
        ON CONFLICT (id) DO NOTHING`);

    await pool.query(`INSERT INTO "${SCHEMA}".products (id, category_id, name, base_price, prep_time_min, sort_order) VALUES
        (1, 1, 'Margherita', 8.50, 12, 1), (2, 1, 'Salami', 9.50, 12, 2), (3, 1, 'Quattro Formaggi', 10.50, 14, 3),
        (4, 1, 'Pizza Döner', 11.00, 15, 4), (5, 1, 'Calzone', 10.00, 15, 5), (6, 1, 'Hawaii', 10.00, 12, 6),
        (7, 1, 'Vegetariana', 10.50, 12, 7), (8, 1, 'Diavolo', 11.00, 13, 8),
        (9, 2, 'Adana Kebab', 12.50, 18, 1), (10, 2, 'İskender', 14.00, 20, 2), (11, 2, 'Lahmacun', 6.50, 10, 3),
        (12, 2, 'Pide Kaşarlı', 8.00, 13, 4), (13, 2, 'Beyti Sarma', 13.00, 18, 5), (14, 2, 'Karışık Izgara', 16.00, 22, 6),
        (15, 3, 'Döner Teller', 10.50, 8, 1), (16, 3, 'Döner Dürüm', 7.50, 5, 2), (17, 3, 'Döner Box', 8.00, 5, 3), (18, 3, 'Döner Yufka', 7.50, 5, 4),
        (19, 4, 'Pommes Frites', 3.50, 5, 1), (20, 4, 'Reis Pilav', 3.00, 3, 2), (21, 4, 'Bauernsalat', 5.00, 3, 3),
        (22, 4, 'Hummus', 4.50, 2, 4), (23, 5, 'Cola 0.33L', 2.50, 0, 1), (24, 5, 'Fanta 0.33L', 2.50, 0, 2),
        (25, 5, 'Ayran', 2.00, 0, 3), (26, 5, 'Wasser 0.5L', 1.50, 0, 4), (27, 5, 'Apfelschorle', 2.50, 0, 5), (28, 5, 'Türk. Tee', 2.00, 3, 6),
        (29, 6, 'Baklava (4 Stk)', 5.00, 2, 1), (30, 6, 'Künefe', 6.50, 8, 2), (31, 6, 'Tiramisu', 5.50, 0, 3)
        ON CONFLICT (id) DO NOTHING`);

    await pool.query(`INSERT INTO "${SCHEMA}".product_variants (id, product_id, name, price, is_default, sort_order) VALUES
        (1, 1, 'Klein (26cm)', 8.50, TRUE, 1), (2, 1, 'Groß (32cm)', 11.50, FALSE, 2), (3, 1, 'Familie (45cm)', 18.00, FALSE, 3),
        (4, 2, 'Klein (26cm)', 9.50, TRUE, 1), (5, 2, 'Groß (32cm)', 12.50, FALSE, 2), (6, 2, 'Familie (45cm)', 19.00, FALSE, 3),
        (7, 3, 'Klein (26cm)', 10.50, TRUE, 1), (8, 3, 'Groß (32cm)', 13.50, FALSE, 2),
        (9, 4, 'Klein (26cm)', 11.00, TRUE, 1), (10, 4, 'Groß (32cm)', 14.00, FALSE, 2),
        (11, 5, 'Normal', 10.00, TRUE, 1), (12, 5, 'Groß', 13.00, FALSE, 2),
        (13, 6, 'Klein (26cm)', 10.00, TRUE, 1), (14, 6, 'Groß (32cm)', 13.00, FALSE, 2),
        (15, 7, 'Klein (26cm)', 10.50, TRUE, 1), (16, 7, 'Groß (32cm)', 13.50, FALSE, 2),
        (17, 8, 'Klein (26cm)', 11.00, TRUE, 1), (18, 8, 'Groß (32cm)', 14.00, FALSE, 2)
        ON CONFLICT (id) DO NOTHING`);

    await pool.query(`INSERT INTO "${SCHEMA}".modifiers (id, name, price, category) VALUES
        (1, 'Extra Käse', 1.50, 'topping'), (2, 'Scharf', 0.00, 'spice'), (3, 'Ohne Zwiebeln', 0.00, 'removal'),
        (4, 'Extra Soße', 0.50, 'sauce'), (5, 'Knoblauchsoße', 0.50, 'sauce'), (6, 'Salat dazu', 2.00, 'side'),
        (7, 'Joghurtsoße', 0.50, 'sauce'), (8, 'Sucuk Extra', 2.00, 'topping')
        ON CONFLICT (id) DO NOTHING`);

    await pool.query(`INSERT INTO "${SCHEMA}".sections (id, name, floor, sort_order) VALUES
        (1, 'İç Mekan', 0, 1), (2, 'Teras', 0, 2), (3, 'VIP', 1, 3)
        ON CONFLICT (id) DO NOTHING`);

    await pool.query(`INSERT INTO "${SCHEMA}".tables (id, section_id, name, capacity, shape, status) VALUES
        (1, 1, 'Masa 1', 4, 'square', 'available'), (2, 1, 'Masa 2', 4, 'square', 'available'),
        (3, 1, 'Masa 3', 2, 'circle', 'available'), (4, 1, 'Masa 4', 6, 'rectangle', 'available'),
        (5, 1, 'Masa 5', 4, 'square', 'available'), (6, 1, 'Masa 6', 8, 'rectangle', 'available'),
        (7, 2, 'Teras 1', 4, 'circle', 'available'), (8, 2, 'Teras 2', 4, 'circle', 'available'),
        (9, 2, 'Teras 3', 6, 'rectangle', 'available'), (10, 3, 'VIP 1', 8, 'rectangle', 'available'),
        (11, 3, 'VIP 2', 6, 'rectangle', 'available')
        ON CONFLICT (id) DO NOTHING`);

    await pool.query('SET search_path TO public');
}

async function seed() {
    const url = process.env.DATABASE_URL || '';
    if (!url.startsWith('postgresql')) {
        console.error('❌ DATABASE_URL postgresql:// ile başlamalı (MySQL seed kaldırıldı).');
        process.exit(1);
    }

    try {
        console.log('🌱 PostgreSQL + Prisma seed başlıyor…\n');

        await ensureUuidExtension();
        await ensureTenantSchemaFunction();

        const superHash = await bcrypt.hash('superadmin123', 10);
        await prisma.saasAdmin.upsert({
            where: { username: 'superadmin' },
            create: {
                username: 'superadmin',
                passwordHash: superHash,
                fullName: 'System Architect',
                role: 'super_admin',
                isActive: true,
            },
            update: { passwordHash: superHash, role: 'super_admin', isActive: true },
        });
        console.log('✅ SaaS Admin: superadmin / superadmin123\n');

        const resellerPlanSeeds = [
            {
                name: 'Bayi Starter',
                code: 'res_starter',
                price: new Prisma.Decimal(99),
                licenseCount: 5,
                description: '5 restoran lisansı',
            },
            {
                name: 'Bayi Growth',
                code: 'res_growth',
                price: new Prisma.Decimal(299),
                licenseCount: 25,
                description: '25 restoran lisansı',
            },
            {
                name: 'Bayi Enterprise',
                code: 'res_enterprise',
                price: new Prisma.Decimal(799),
                licenseCount: 100,
                description: '100 restoran lisansı',
            },
        ];
        for (const p of resellerPlanSeeds) {
            await prisma.resellerPlan.upsert({
                where: { code: p.code },
                create: { ...p, isActive: true },
                update: {
                    name: p.name,
                    price: p.price,
                    licenseCount: p.licenseCount,
                    description: p.description,
                    isActive: true,
                },
            });
        }
        console.log('✅ Varsayılan bayi lisans paketleri (3 adet)\n');

        const resellerHash = await bcrypt.hash('reseller123', 10);
        const demoReseller = await prisma.saasAdmin.upsert({
            where: { username: 'demo_reseller' },
            create: {
                username: 'demo_reseller',
                passwordHash: resellerHash,
                fullName: 'Demo Bayi A.Ş.',
                email: 'bayi@demo.local',
                role: 'reseller',
                isActive: true,
                availableLicenses: 5,
                walletBalance: new Prisma.Decimal(1000),
            },
            update: {
                passwordHash: resellerHash,
                role: 'reseller',
                isActive: true,
            },
        });
        console.log('✅ Demo bayi: demo_reseller / reseller123\n');

        const licenseUntil = new Date();
        licenseUntil.setFullYear(licenseUntil.getFullYear() + 1);

        await prisma.tenant.upsert({
            where: { schemaName: SCHEMA },
            create: {
                id: DEMO_TENANT_ID,
                name: 'Demo Pizza & Kebab',
                schemaName: SCHEMA,
                contactEmail: 'demo@nextpos.de',
                subscriptionPlan: 'pro',
                licenseExpiresAt: licenseUntil,
                status: 'active',
                resellerId: demoReseller.id,
            },
            update: {
                name: 'Demo Pizza & Kebab',
                licenseExpiresAt: licenseUntil,
                status: 'active',
                resellerId: demoReseller.id,
            },
        });
        console.log(`✅ Demo tenant: ${DEMO_TENANT_ID} (${SCHEMA})\n`);

        await pool.query(`DROP SCHEMA IF EXISTS "${SCHEMA.replace(/"/g, '""')}" CASCADE`);
        await pool.query('SELECT public.create_new_tenant_schema($1::uuid)', [DEMO_TENANT_ID]);

        await seedDemoMenuData();

        await prisma.language.createMany({
            data: [
                { code: 'de', name: 'German', nativeName: 'Deutsch', flagEmoji: '🇩🇪', sortOrder: 1 },
                { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flagEmoji: '🇹🇷', sortOrder: 2 },
                { code: 'en', name: 'English', nativeName: 'English', flagEmoji: '🇬🇧', sortOrder: 3 },
                { code: 'ar', name: 'Arabic', nativeName: 'العربية', flagEmoji: '🇸🇦', sortOrder: 4 },
            ],
            skipDuplicates: true,
        });

        // Default System Settings & Gateway (Phase 13)
        await prisma.systemSetting.upsert({
            where: { id: 1 },
            create: {
                id: 1,
                currency: 'EUR',
                baseSubscriptionFee: new Prisma.Decimal(500),
                monthlyLicenseFee: new Prisma.Decimal(50),
                trialDays: 14,
                resellerSetupRate: new Prisma.Decimal(75),
                systemSetupRate: new Prisma.Decimal(25),
                resellerMonthlyRate: new Prisma.Decimal(50),
                systemMonthlyRate: new Prisma.Decimal(50),
                // active_gateway model'de yoksa Prisma Json settings içine veya controller/service içinde default verilmeli.
                // gateway.service: SELECT * FROM system_settings WHERE id = 1
                // Modelde active_gateway yok, ama raw SQL ile tabloya eklenmiş olabilir?
            },
            update: {}
        });
        
        // Postgresql raw execute for dynamic columns not in prisma (for Phase 13 compatibility)
        try {
            await pool.query(`
                ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS active_gateway VARCHAR(50) DEFAULT 'iyzico';
                UPDATE public.system_settings SET active_gateway = 'iyzico' WHERE id = 1 AND active_gateway IS NULL;
            `);
        } catch (err) {
            console.warn('⚠️ active_gateway column ensure failed (might already exist or schema mismatch):', err.message);
        }

        console.log('═══════════════════════════════════════');
        console.log('✅ SEED TAMAMLANDI');
        console.log('═══════════════════════════════════════');
        console.log(`   Tenant ID: ${DEMO_TENANT_ID}`);
        console.log('   SaaS Admin: superadmin / superadmin123');
        console.log('   POS Admin:  admin / admin123  (PIN: 123456)');
        console.log('   Kasiyer:    cashier / kasa123  (PIN: 111111)');
        console.log('   Garson:     waiter / garson123 (PIN: 222222)');
        console.log('   Mutfak:     kitchen / mutfak123 (PIN: 333333)');
        console.log('═══════════════════════════════════════');
    } catch (e) {
        console.error('❌ Seed hatası:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

seed();
