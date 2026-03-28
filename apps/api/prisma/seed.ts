import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL?.replace('/public', '/'),
    multipleStatements: true
});

async function seed() {
    try {
        console.log('🌱 MySQL Seed işlemi başlıyor...\n');

        console.log('📦 init.mysql.sql çalıştırılıyor...');
        const initSql = fs.readFileSync(
            path.join(__dirname, '../src/lib/init.mysql.sql'),
            'utf-8'
        );
        const connection = await pool.getConnection();
        await connection.query(initSql);
        console.log('✅ Public database ve tablolar oluşturuldu\n');

        // 1.2. saas_tables.sql (Finans, Planlar, vs.)
        console.log('📦 saas_tables.sql çalıştırılıyor...');
        const saasSql = fs.readFileSync(
            path.join(__dirname, '../src/lib/saas_tables.sql'),
            'utf-8'
        );
        try {
            await connection.query(saasSql);
            console.log('✅ Gelişmiş SaaS tabloları ve planlar oluşturuldu\n');
        } catch (sqlError: any) {
            console.error('❌ saas_tables.sql HATASI:', sqlError.message);
            console.error('Hata Detayı:', sqlError.sqlMessage);
            throw sqlError;
        }

        // 1.5. Super Admin
        console.log('👑 Super Admin oluşturuluyor...');
        const superAdminHash = await bcrypt.hash('superadmin123', 10);
        const saId = uuidv4();
        await connection.query(`
            INSERT IGNORE INTO \`public\`.saas_admins (id, username, password_hash, full_name, email)
            VALUES (?, 'superadmin', ?, 'System Architect', 'admin@nextpos.io')
        `, [saId, superAdminHash]);
        console.log('✅ Super Admin: superadmin / superadmin123\n');

        // 2. Demo Tenant
        console.log('🏢 Demo tenant oluşturuluyor...');
        const tenantId = uuidv4();
        await connection.query(`
            INSERT IGNORE INTO \`public\`.tenants (id, name, schema_name, contact_email, subscription_plan, license_expires_at)
            VALUES (?, 'Demo Pizza & Kebab', 'tenant_demo', 'demo@nextpos.de', 'pro', DATE_ADD(NOW(), INTERVAL 1 YEAR))
        `, [tenantId]);
        console.log(`✅ Tenant Created: ID ${tenantId}`);

        // DB Oluştur
        await connection.query('CREATE DATABASE IF NOT EXISTS `tenant_demo`');
        await connection.query('USE `tenant_demo`');

        // Bu noktada şemayı manuel kurmak yerine, Postgres'teki mantığı MySQL'e taşıyacak bir SQL dosyası gerekecek.
        // Şimdilik sadece public kısmını çalıştırıp devam edelim.

        // 3. Demo Verileri (Kategoriler, Ürünler vb.)
        console.log('📦 Tenant tabloları oluşturuluyor...');
        const tenantTemplateSql = fs.readFileSync(
            path.join(__dirname, '../src/lib/tenant_template.sql'),
            'utf-8'
        );
        await connection.query(tenantTemplateSql);
        console.log('✅ Demo tenant tabloları hazır\n');

        // Örnek Şube & Admin
        console.log('👤 Demo admin ve şube ekleniyor...');
        const adminHash = await bcrypt.hash('admin123', 10);
        await connection.query("INSERT IGNORE INTO branches (name, address, phone) VALUES ('Demo Store', 'Hauptstr. 1, Berlin', '+49 30 12345678')");
        await connection.query("INSERT IGNORE INTO users (username, password_hash, name, role, pin_code, branch_id) VALUES ('admin', ?, 'Demo Admin', 'admin', '123456', 1)", [adminHash]);

        const cashierHash = await bcrypt.hash('kasa123', 10);
        await connection.query("INSERT IGNORE INTO users (username, password_hash, name, role, pin_code, branch_id) VALUES ('cashier', ?, 'Kasiyer Ali', 'cashier', '111111', 1)", [cashierHash]);

        const waiterHash = await bcrypt.hash('garson123', 10);
        await connection.query("INSERT IGNORE INTO users (username, password_hash, name, role, pin_code, branch_id) VALUES ('waiter', ?, 'Garson Mehmet', 'waiter', '222222', 1)", [waiterHash]);

        const kitchenHash = await bcrypt.hash('mutfak123', 10);
        await connection.query("INSERT IGNORE INTO users (username, password_hash, name, role, pin_code, branch_id) VALUES ('kitchen', ?, 'Şef Hasan', 'kitchen', '333333', 1)", [kitchenHash]);
        console.log('✅ Kullanıcılar hazır\n');

        // 4. Kategoriler
        console.log('🍕 Demo menü oluşturuluyor...');
        await connection.query(`INSERT IGNORE INTO categories (id, name, icon, sort_order) VALUES
            (1, 'Pizza', 'pizza-slice', 1),
            (2, 'Kebab', 'utensils', 2),
            (3, 'Döner', 'drumstick-bite', 3),
            (4, 'Beilagen', 'french-fries', 4),
            (5, 'Getränke', 'glass-water', 5),
            (6, 'Desserts', 'ice-cream', 6)
        `);

        // 5. Ürünler
        await connection.query(`INSERT IGNORE INTO products (id, category_id, name, base_price, prep_time_min, sort_order) VALUES
            (1, 1, 'Margherita', 8.50, 12, 1),
            (2, 1, 'Salami', 9.50, 12, 2),
            (3, 1, 'Quattro Formaggi', 10.50, 14, 3),
            (4, 1, 'Pizza Döner', 11.00, 15, 4),
            (5, 1, 'Calzone', 10.00, 15, 5),
            (6, 1, 'Hawaii', 10.00, 12, 6),
            (7, 1, 'Vegetariana', 10.50, 12, 7),
            (8, 1, 'Diavolo', 11.00, 13, 8),
            (9, 2, 'Adana Kebab', 12.50, 18, 1),
            (10, 2, 'İskender', 14.00, 20, 2),
            (11, 2, 'Lahmacun', 6.50, 10, 3),
            (12, 2, 'Pide Kaşarlı', 8.00, 13, 4),
            (13, 2, 'Beyti Sarma', 13.00, 18, 5),
            (14, 2, 'Karışık Izgara', 16.00, 22, 6),
            (15, 3, 'Döner Teller', 10.50, 8, 1),
            (16, 3, 'Döner Dürüm', 7.50, 5, 2),
            (17, 3, 'Döner Box', 8.00, 5, 3),
            (18, 3, 'Döner Yufka', 7.50, 5, 4),
            (19, 4, 'Pommes Frites', 3.50, 5, 1),
            (20, 4, 'Reis Pilav', 3.00, 3, 2),
            (21, 4, 'Bauernsalat', 5.00, 3, 3),
            (22, 4, 'Hummus', 4.50, 2, 4),
            (23, 5, 'Cola 0.33L', 2.50, 0, 1),
            (24, 5, 'Fanta 0.33L', 2.50, 0, 2),
            (25, 5, 'Ayran', 2.00, 0, 3),
            (26, 5, 'Wasser 0.5L', 1.50, 0, 4),
            (27, 5, 'Apfelschorle', 2.50, 0, 5),
            (28, 5, 'Türk. Tee', 2.00, 3, 6),
            (29, 6, 'Baklava (4 Stk)', 5.00, 2, 1),
            (30, 6, 'Künefe', 6.50, 8, 2),
            (31, 6, 'Tiramisu', 5.50, 0, 3)
        `);

        // 6. Varyantlar (Pizza boyutları)
        await connection.query(`INSERT IGNORE INTO product_variants (id, product_id, name, price, is_default, sort_order) VALUES
            (1, 1, 'Klein (26cm)', 8.50, 1, 1),
            (2, 1, 'Groß (32cm)', 11.50, 0, 2),
            (3, 1, 'Familie (45cm)', 18.00, 0, 3),
            (4, 2, 'Klein (26cm)', 9.50, 1, 1),
            (5, 2, 'Groß (32cm)', 12.50, 0, 2),
            (6, 2, 'Familie (45cm)', 19.00, 0, 3),
            (7, 3, 'Klein (26cm)', 10.50, 1, 1),
            (8, 3, 'Groß (32cm)', 13.50, 0, 2),
            (9, 4, 'Klein (26cm)', 11.00, 1, 1),
            (10, 4, 'Groß (32cm)', 14.00, 0, 2),
            (11, 5, 'Normal', 10.00, 1, 1),
            (12, 5, 'Groß', 13.00, 0, 2),
            (13, 6, 'Klein (26cm)', 10.00, 1, 1),
            (14, 6, 'Groß (32cm)', 13.00, 0, 2),
            (15, 7, 'Klein (26cm)', 10.50, 1, 1),
            (16, 7, 'Groß (32cm)', 13.50, 0, 2),
            (17, 8, 'Klein (26cm)', 11.00, 1, 1),
            (18, 8, 'Groß (32cm)', 14.00, 0, 2)
        `);

        // 7. Modifikatörler (Ek malzemeler)
        await connection.query(`INSERT IGNORE INTO modifiers (id, name, price, category) VALUES
            (1, 'Extra Käse', 1.50, 'topping'),
            (2, 'Scharf', 0.00, 'spice'),
            (3, 'Ohne Zwiebeln', 0.00, 'removal'),
            (4, 'Extra Soße', 0.50, 'sauce'),
            (5, 'Knoblauchsoße', 0.50, 'sauce'),
            (6, 'Salat dazu', 2.00, 'side'),
            (7, 'Joghurtsoße', 0.50, 'sauce'),
            (8, 'Sucuk Extra', 2.00, 'topping')
        `);

        // 8. Bölümler & Masalar
        await connection.query(`INSERT IGNORE INTO sections (id, name, floor, sort_order) VALUES
            (1, 'İç Mekan', 0, 1),
            (2, 'Teras', 0, 2),
            (3, 'VIP', 1, 3)
        `);

        await connection.query(`INSERT IGNORE INTO tables (id, section_id, name, capacity, shape, status) VALUES
            (1, 1, 'Masa 1', 4, 'square', 'available'),
            (2, 1, 'Masa 2', 4, 'square', 'available'),
            (3, 1, 'Masa 3', 2, 'circle', 'available'),
            (4, 1, 'Masa 4', 6, 'rectangle', 'available'),
            (5, 1, 'Masa 5', 4, 'square', 'available'),
            (6, 1, 'Masa 6', 8, 'rectangle', 'available'),
            (7, 2, 'Teras 1', 4, 'circle', 'available'),
            (8, 2, 'Teras 2', 4, 'circle', 'available'),
            (9, 2, 'Teras 3', 6, 'rectangle', 'available'),
            (10, 3, 'VIP 1', 8, 'rectangle', 'available'),
            (11, 3, 'VIP 2', 6, 'rectangle', 'available')
        `);

        console.log('✅ Demo menü, masalar ve kullanıcılar hazır\n');

        console.log('═══════════════════════════════════════');
        console.log('✅ SEED İŞLEMİ TAMAMLANDI');
        console.log('═══════════════════════════════════════');
        console.log(`   Tenant ID: ${tenantId}`);
        console.log(`   SaaS Admin: superadmin / superadmin123`);
        console.log(`   POS Admin:  admin / admin123  (PIN: 123456)`);
        console.log(`   Kasiyer:    cashier / kasa123  (PIN: 111111)`);
        console.log(`   Garson:     waiter / garson123 (PIN: 222222)`);
        console.log(`   Mutfak:     kitchen / mutfak123 (PIN: 333333)`);
        console.log('═══════════════════════════════════════');

        connection.release();
        await pool.end();

    } catch (error) {
        console.error('❌ Seed hatası:', error);
        process.exit(1);
    }
}

seed();
