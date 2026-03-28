-- ═══════════════════════════════════════════════════════════════════════════
-- NextPOS — SaaS Admin Advanced Tables (public database)
-- Finans, Güvenlik, Raporlama, CRM, Monitoring, Destek
-- ═══════════════════════════════════════════════════════════════════════════

USE `public`;

-- ─────────────────────────────────────
-- 1. FİNANS: Ödeme Geçmişi
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `payment_history` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(5) DEFAULT 'EUR',
    `payment_type` ENUM('subscription', 'license', 'setup', 'addon', 'refund') NOT NULL,
    `payment_method` ENUM('bank_transfer', 'credit_card', 'cash', 'paypal', 'other') DEFAULT 'bank_transfer',
    `invoice_number` VARCHAR(50),
    `description` TEXT,
    `status` ENUM('paid', 'pending', 'overdue', 'cancelled', 'refunded') DEFAULT 'pending',
    `due_date` DATE,
    `paid_at` DATETIME,
    `created_by` VARCHAR(100) DEFAULT 'system',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`),
    INDEX `idx_status` (`status`),
    INDEX `idx_due_date` (`due_date`)
);

-- ─────────────────────────────────────
-- 2. FİNANS: Faturalar
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `invoices` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `invoice_number` VARCHAR(50) UNIQUE NOT NULL,
    `items` JSON,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) DEFAULT 19.00,
    `tax_amount` DECIMAL(10, 2) DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(5) DEFAULT 'EUR',
    `status` ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
    `due_date` DATE,
    `paid_at` DATETIME,
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`),
    INDEX `idx_status` (`status`)
);

-- ─────────────────────────────────────
-- 3. GÜVENLİK: Audit Log
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` VARCHAR(100),
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50),
    `entity_id` VARCHAR(50),
    `old_value` JSON,
    `new_value` JSON,
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_action` (`action`),
    INDEX `idx_entity` (`entity_type`, `entity_id`),
    INDEX `idx_created_at` (`created_at`)
);

-- ─────────────────────────────────────
-- 4. GÜVENLİK: Giriş Denemeleri
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `login_attempts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(100),
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `success` BOOLEAN DEFAULT false,
    `failure_reason` VARCHAR(100),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_username` (`username`),
    INDEX `idx_ip` (`ip_address`),
    INDEX `idx_created_at` (`created_at`)
);

-- ─────────────────────────────────────
-- 5. GÜVENLİK: API Anahtarları
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `api_keys` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `key_value` VARCHAR(64) UNIQUE NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `permissions` JSON,
    `is_active` BOOLEAN DEFAULT true,
    `last_used_at` DATETIME,
    `expires_at` DATETIME,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`),
    INDEX `idx_key` (`key_value`)
);

-- ─────────────────────────────────────
-- 6. ABONELİK: Plan Tanımları
-- ─────────────────────────────────────
DROP TABLE IF EXISTS `subscription_plans`;
CREATE TABLE `subscription_plans` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(30) UNIQUE NOT NULL,
    `monthly_fee` DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    `setup_fee` DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    `features` JSON,
    `max_users` INT DEFAULT 10,
    `max_branches` INT DEFAULT 1,
    `max_products` INT DEFAULT 500,
    `trial_days` INT DEFAULT 14,
    `is_active` BOOLEAN DEFAULT true,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Varsayılan planları ekle
INSERT IGNORE INTO `subscription_plans` (`name`, `code`, `monthly_fee`, `setup_fee`, `max_users`, `max_branches`, `max_products`, `features`, `sort_order`) VALUES
('Basic', 'basic', 29.00, 299.00, 3, 1, 100, '{"pos": true, "kitchen_display": true, "reports": false, "delivery": false, "crm": false}', 1),
('Pro', 'pro', 59.00, 499.00, 10, 3, 500, '{"pos": true, "kitchen_display": true, "reports": true, "delivery": true, "crm": false}', 2),
('Enterprise', 'enterprise', 99.00, 799.00, 50, 10, 9999, '{"pos": true, "kitchen_display": true, "reports": true, "delivery": true, "crm": true}', 3);

-- ─────────────────────────────────────
-- 7. ABONELİK: Plan Değişiklik Geçmişi
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `plan_changes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `from_plan` VARCHAR(30),
    `to_plan` VARCHAR(30) NOT NULL,
    `changed_by` VARCHAR(100),
    `reason` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`)
);

-- ─────────────────────────────────────
-- 8. ABONELİK: Promosyon Kodları
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `promo_codes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(30) UNIQUE NOT NULL,
    `discount_type` ENUM('percent', 'fixed') NOT NULL,
    `discount_value` DECIMAL(10, 2) NOT NULL,
    `max_uses` INT DEFAULT 100,
    `used_count` INT DEFAULT 0,
    `valid_from` DATE,
    `valid_until` DATE,
    `is_active` BOOLEAN DEFAULT true,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────
-- 9. CRM: Müşteri Notları
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `customer_notes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `note_type` ENUM('call', 'email', 'meeting', 'internal', 'complaint', 'feedback') DEFAULT 'internal',
    `subject` VARCHAR(200),
    `content` TEXT,
    `created_by` VARCHAR(100),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`)
);

-- ─────────────────────────────────────
-- 10. CRM: Sözleşmeler
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `contracts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36) NOT NULL,
    `contract_number` VARCHAR(50) UNIQUE,
    `start_date` DATE NOT NULL,
    `end_date` DATE,
    `monthly_amount` DECIMAL(10, 2),
    `status` ENUM('active', 'expired', 'terminated', 'pending') DEFAULT 'active',
    `document_url` VARCHAR(500),
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`)
);

-- ─────────────────────────────────────
-- 11. MONİTÖRİNG: Sistem Metrikleri
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `system_metrics` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `metric_type` VARCHAR(50) NOT NULL,
    `metric_value` DECIMAL(10, 2) NOT NULL,
    `unit` VARCHAR(20),
    `metadata` JSON,
    `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_type` (`metric_type`),
    INDEX `idx_recorded` (`recorded_at`)
);

-- ─────────────────────────────────────
-- 12. MONİTÖRİNG: Alert Kuralları
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `alert_rules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `metric_type` VARCHAR(50) NOT NULL,
    `threshold` DECIMAL(10, 2) NOT NULL,
    `operator` ENUM('gt', 'lt', 'eq', 'gte', 'lte') DEFAULT 'gt',
    `severity` ENUM('info', 'warning', 'critical') DEFAULT 'warning',
    `is_active` BOOLEAN DEFAULT true,
    `last_triggered` DATETIME,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────
-- 13. DESTEK: Ticket Mesajları
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ticket_messages` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_id` INT NOT NULL,
    `sender_type` ENUM('admin', 'tenant') DEFAULT 'admin',
    `sender_name` VARCHAR(100),
    `message` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_ticket_id` (`ticket_id`)
);

-- ─────────────────────────────────────
-- 14. DESTEK: Bilgi Bankası
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `knowledge_base` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100),
    `content` TEXT NOT NULL,
    `tags` VARCHAR(500),
    `view_count` INT DEFAULT 0,
    `is_published` BOOLEAN DEFAULT true,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────
-- 15. system_settings tablosu yoksa oluştur
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `system_settings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `currency` VARCHAR(5) DEFAULT 'EUR',
    `base_subscription_fee` DECIMAL(10, 2) DEFAULT 500.00,
    `monthly_license_fee` DECIMAL(10, 2) DEFAULT 50.00,
    `trial_days` INT DEFAULT 14,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO `system_settings` (`id`, `currency`, `base_subscription_fee`, `monthly_license_fee`, `trial_days`)
VALUES (1, 'EUR', 500.00, 50.00, 14);

-- ─────────────────────────────────────
-- system_backups yoksa oluştur
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `system_backups` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `filename` VARCHAR(255) NOT NULL,
    `size` BIGINT DEFAULT 0,
    `status` VARCHAR(30) DEFAULT 'completed',
    `backup_type` ENUM('full', 'tenant', 'incremental') DEFAULT 'full',
    `tenant_id` VARCHAR(36),
    `created_by` VARCHAR(100) DEFAULT 'system',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────
-- support_tickets yoksa oluştur
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `support_tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` VARCHAR(36),
    `subject` VARCHAR(200) NOT NULL,
    `message` TEXT,
    `category` VARCHAR(50) DEFAULT 'general',
    `status` ENUM('open', 'in_progress', 'waiting', 'closed') DEFAULT 'open',
    `priority` ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    `assigned_to` VARCHAR(100),
    `sla_deadline` DATETIME,
    `first_response_at` DATETIME,
    `resolved_at` DATETIME,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_tenant_id` (`tenant_id`),
    INDEX `idx_status` (`status`)
);
