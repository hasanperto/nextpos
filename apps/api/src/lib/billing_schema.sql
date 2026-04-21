-- NextPOS — Abonelik, modül eklentileri ve ödeme/vade (MySQL public)
-- API açılışında billing.service migrateBillingTables() ile otomatik çalışır.

USE `public`;

-- ═══════════════════════════════════════════════════════════════
-- 1. MODÜL KATALOĞU — Proje dokümanındaki tüm özellikler
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `billing_modules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) DEFAULT NULL,
    `category` ENUM('core','feature','channel','device','service','integration') NOT NULL DEFAULT 'feature',
    `setup_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `monthly_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `icon` VARCHAR(50) DEFAULT NULL,
    `sort_order` INT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ═══════════════════════════════════════════════════════════════
-- 2. RESTORAN SATIN ALDIĞI MODÜLLER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `tenant_modules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` CHAR(36) NOT NULL,
    `module_code` VARCHAR(50) NOT NULL,
    `quantity` INT NOT NULL DEFAULT 1,
    `setup_line_total` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `monthly_line_total` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_tenant_module` (`tenant_id`, `module_code`),
    KEY `idx_tenant_modules_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ═══════════════════════════════════════════════════════════════
-- 3. ABONELİK / VADE / YENİDEN AKTİVASYON
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `tenant_billing` (
    `tenant_id` CHAR(36) NOT NULL PRIMARY KEY,
    `billing_cycle` ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
    `plan_code` VARCHAR(30) NOT NULL DEFAULT 'starter',
    `setup_fee_total` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `monthly_recurring_total` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `yearly_prepay_total` DECIMAL(10,2) DEFAULT NULL,
    `annual_discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    `reactivation_fee_percent` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    `next_payment_due` DATE DEFAULT NULL,
    `grace_days_after_due` INT NOT NULL DEFAULT 1,
    `last_payment_at` DATETIME DEFAULT NULL,
    `payment_current` TINYINT(1) NOT NULL DEFAULT 1,
    `suspended_at` DATETIME DEFAULT NULL,
    `suspension_reason` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ═══════════════════════════════════════════════════════════════
-- 4. HATIRLATMA LOGU
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `billing_reminder_log` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` CHAR(36) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `message` VARCHAR(500) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_br_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ═══════════════════════════════════════════════════════════════
-- 5. PLAN × MODÜL KURALLARI (included / addon / locked)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `plan_module_rules` (
    `plan_code` VARCHAR(30) NOT NULL,
    `module_code` VARCHAR(50) NOT NULL,
    `mode` ENUM('included','addon','locked') NOT NULL DEFAULT 'addon',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`plan_code`, `module_code`),
    KEY `idx_pmr_plan` (`plan_code`),
    KEY `idx_pmr_module` (`module_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ═══════════════════════════════════════════════════════════════
-- SEED: MODÜL KATALOĞU (Proje dokümanı §5 bazlı)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO `billing_modules` (`code`, `name`, `description`, `category`, `icon`, `setup_price`, `monthly_price`, `sort_order`) VALUES
-- ▸ ÖZELLİK MODÜLLERİ (feature)
('kitchen_display',    'Mutfak KDS Ekranı',       'Kanban mutfak sipariş ekranı, süre takibi, çoklu istasyon (§5.3)', 'feature', 'FiMonitor',      0.00,  15.00, 1),
('waiter_tablet',      'Garson Tablet',           'Garson PWA — masa başı sipariş, kat planı, bildirim (§5.2)',       'feature', 'FiSmartphone',   29.00, 12.00, 2),
('qr_menu',            'Müşteri QR Menü / Kiosk', 'Masa QR sipariş, alerjen filtre, kiosk modu (§5.6)',             'feature', 'FiCamera',       29.00,  9.00, 3),
('courier_module',     'Kurye & Teslimat',        'Kurye PWA, rota, konum paylaşımı, teslimat bölgeleri (§5.4)',     'feature', 'FiTruck',        49.00, 15.00, 4),
('customer_crm',       'Müşteri CRM & Sadakat',   'Puan sistemi, doğum günü kampanyası, GDPR, kara liste (§5.5)',   'feature', 'FiUsers',         0.00, 12.00, 5),
('advanced_reports',   'Gelişmiş Raporlama',      'Saatlik ısı haritası, personel perf., indirim raporu (§5.5)',     'feature', 'FiBarChart2',     0.00, 15.00, 6),
('inventory',          'Stok & Envanter',         'Envanter takibi, düşük stok uyarısı, reçete maliyeti (§4.1)',     'feature', 'FiPackage',       0.00, 10.00, 7),
('table_reservation',  'Masa Rezervasyonu',       'Online / telefonla rezervasyon, takvim, hatırlatma',              'feature', 'FiCalendar',      0.00,  8.00, 8),
('multi_language',     'Çoklu Dil Paketi',        'DE/TR/EN ürün çevirisi, adisyon dil şablonu, QR dil (§16)',      'feature', 'FiGlobe',         0.00,  5.00, 9),
('fiscal_tse',         'Almanya Fiskalizasyon',    'KassenSichV / TSE imza, DSFinV-K export (§1.12, §13.2)',         'feature', 'FiShield',       99.00, 19.00, 10),

-- ▸ KANAL MODÜLLERİ (channel)
('whatsapp_orders',    'WhatsApp Sipariş',        'WhatsApp üzerinden sipariş kanalı entegrasyonu',                  'channel', 'FiMessageSquare', 99.00, 19.00, 11),
('restaurant_website', 'Restoran Web Sitesi',     'Marka vitrin sayfası, menü, iletişim, SEO',                       'channel', 'FiGlobe',       149.00, 19.00, 12),
('online_ordering',    'Online Sipariş Sistemi',  'Web/mobil sipariş, Stripe ödeme, teslimat takibi',                'channel', 'FiShoppingCart',  79.00, 19.00, 13),

-- ▸ CİHAZ / DONANIM (device)
('extra_device',       'Ek POS Cihazı',           'Ek terminal / tablet lisansı (adet başına)',                      'device',  'FiTablet',       49.00,  9.00, 14),
('customer_display',   'Müşteri Pole Display',    'Kasa önü müşteri ekranı (§15.3)',                                 'device',  'FiMonitor',      39.00,  5.00, 15),
('extra_printer',      'Ek Yazıcı Lisansı',       'Ek mutfak / bar yazıcısı (ESC/POS, §15.1)',                      'device',  'FiPrinter',      19.00,  3.00, 16),

-- ▸ HİZMET (service)
('priority_support',   'Öncelikli Destek (7/24)',  'Telefon + canlı chat — 7/24 öncelikli teknik destek',           'service', 'FiHeadphones',    0.00, 29.00, 17),
('training_session',   'Eğitim Paketi',           'Uzaktan kurulum + personel eğitimi (2 saat)',                     'service', 'FiBookOpen',     99.00,  0.00, 18),
('api_access',         'API Erişimi',             '3. parti entegrasyon, webhook, Lieferando vb. (§5.5)',            'service', 'FiCode',          0.00, 25.00, 19),

-- ▸ ÖRNEK / EK MODÜLLER (demo katalog — §5 ile uyumlu senaryolar)
('self_service_kiosk', 'Self Servis Kiosk',     'Ödeme noktalı kiosk, hızlı sipariş akışı, çoklu dil',              'feature', 'FiCpu',          39.00, 12.00, 20),
('cloud_backup',       'Bulut Yedekleme',       'Veritabanı ve ayarların şifreli bulut yedeği (günlük)',            'service', 'FiWifi',          0.00,  9.00, 21),
('gift_cards',         'Hediye Kartı & Bakiye', 'Ön ödemeli kart, bakiye yükleme, kampanya kodu',                  'feature', 'FiCreditCard',   29.00,  7.00, 22),
('staff_shift',        'Personel Vardiya',      'Puantaj, vardiya planı, izin talepleri',                           'feature', 'FiClock',         0.00, 10.00, 23),
('kitchen_routing',    'Mutfak Yazıcı Yolu',    'Ürün bazlı mutfak/bar/yazıcı yönlendirme kuralları',               'integration', 'FiNavigation', 19.00,  5.00, 24)

ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `category` = VALUES(`category`),
    `icon` = VALUES(`icon`),
    `setup_price` = VALUES(`setup_price`),
    `monthly_price` = VALUES(`monthly_price`),
    `sort_order` = VALUES(`sort_order`);

-- ═══════════════════════════════════════════════════════════════
-- SEED: PLAN × MODÜL MATRİSİ
-- ═══════════════════════════════════════════════════════════════
-- basic  : 1 şube, 3 cihaz, temel POS — çoğu ek satış veya kilitli
-- pro    : 3 şube, 10 cihaz — mutfak/garson/QR dahil
-- enterprise: 10 şube, sınırsız — neredeyse hepsi dahil

INSERT INTO `plan_module_rules` (`plan_code`, `module_code`, `mode`) VALUES
-- ─── BASIC ───
('basic', 'kitchen_display',    'addon'),
('basic', 'waiter_tablet',      'addon'),
('basic', 'qr_menu',            'addon'),
('basic', 'courier_module',     'locked'),
('basic', 'customer_crm',       'addon'),
('basic', 'advanced_reports',   'locked'),
('basic', 'inventory',          'addon'),
('basic', 'table_reservation',  'addon'),
('basic', 'multi_language',     'addon'),
('basic', 'fiscal_tse',         'addon'),
('basic', 'whatsapp_orders',    'locked'),
('basic', 'restaurant_website', 'locked'),
('basic', 'online_ordering',    'locked'),
('basic', 'extra_device',       'addon'),
('basic', 'customer_display',   'addon'),
('basic', 'extra_printer',      'addon'),
('basic', 'priority_support',   'addon'),
('basic', 'training_session',   'addon'),
('basic', 'api_access',         'locked'),
('basic', 'self_service_kiosk', 'locked'),
('basic', 'cloud_backup',       'addon'),
('basic', 'gift_cards',         'addon'),
('basic', 'staff_shift',        'locked'),
('basic', 'kitchen_routing',    'addon'),

-- ─── PRO ───
('pro', 'kitchen_display',    'included'),
('pro', 'waiter_tablet',      'included'),
('pro', 'qr_menu',            'included'),
('pro', 'courier_module',     'addon'),
('pro', 'customer_crm',       'included'),
('pro', 'advanced_reports',   'addon'),
('pro', 'inventory',          'included'),
('pro', 'table_reservation',  'included'),
('pro', 'multi_language',     'included'),
('pro', 'fiscal_tse',         'addon'),
('pro', 'whatsapp_orders',    'addon'),
('pro', 'restaurant_website', 'addon'),
('pro', 'online_ordering',    'addon'),
('pro', 'extra_device',       'addon'),
('pro', 'customer_display',   'addon'),
('pro', 'extra_printer',      'addon'),
('pro', 'priority_support',   'addon'),
('pro', 'training_session',   'addon'),
('pro', 'api_access',         'addon'),
('pro', 'self_service_kiosk', 'addon'),
('pro', 'cloud_backup',       'addon'),
('pro', 'gift_cards',         'included'),
('pro', 'staff_shift',        'addon'),
('pro', 'kitchen_routing',    'included'),

-- ─── ENTERPRISE ───
('enterprise', 'kitchen_display',    'included'),
('enterprise', 'waiter_tablet',      'included'),
('enterprise', 'qr_menu',            'included'),
('enterprise', 'courier_module',     'included'),
('enterprise', 'customer_crm',       'included'),
('enterprise', 'advanced_reports',   'included'),
('enterprise', 'inventory',          'included'),
('enterprise', 'table_reservation',  'included'),
('enterprise', 'multi_language',     'included'),
('enterprise', 'fiscal_tse',         'included'),
('enterprise', 'whatsapp_orders',    'included'),
('enterprise', 'restaurant_website', 'included'),
('enterprise', 'online_ordering',    'included'),
('enterprise', 'extra_device',       'addon'),
('enterprise', 'customer_display',   'included'),
('enterprise', 'extra_printer',      'addon'),
('enterprise', 'priority_support',   'included'),
('enterprise', 'training_session',   'included'),
('enterprise', 'api_access',         'included'),
('enterprise', 'self_service_kiosk', 'included'),
('enterprise', 'cloud_backup',       'included'),
('enterprise', 'gift_cards',         'included'),
('enterprise', 'staff_shift',        'included'),
('enterprise', 'kitchen_routing',    'included')

ON DUPLICATE KEY UPDATE `mode` = VALUES(`mode`);
