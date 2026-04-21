-- ═══════════════════════════════════════════════════════════════════════════
-- Bayi (reseller) profil alanları — `public`.saas_admins
-- Bir kez çalıştırın. Kolon zaten varsa ilgili satırı atlayın veya hata verir.
-- ═══════════════════════════════════════════════════════════════════════════
USE `public`;

ALTER TABLE `saas_admins` ADD COLUMN `tax_number` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Vergi numarası';
ALTER TABLE `saas_admins` ADD COLUMN `tax_office` VARCHAR(120) NULL DEFAULT NULL COMMENT 'Vergi dairesi';
ALTER TABLE `saas_admins` ADD COLUMN `billing_address` TEXT NULL COMMENT 'Fatura / yasal adres';
ALTER TABLE `saas_admins` ADD COLUMN `city` VARCHAR(100) NULL DEFAULT NULL;
ALTER TABLE `saas_admins` ADD COLUMN `district` VARCHAR(100) NULL DEFAULT NULL;
ALTER TABLE `saas_admins` ADD COLUMN `postal_code` VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE `saas_admins` ADD COLUMN `country` VARCHAR(80) NULL DEFAULT 'Türkiye';
ALTER TABLE `saas_admins` ADD COLUMN `phone` VARCHAR(40) NULL DEFAULT NULL COMMENT 'Sabit hat';
ALTER TABLE `saas_admins` ADD COLUMN `mobile_phone` VARCHAR(40) NULL DEFAULT NULL;
ALTER TABLE `saas_admins` ADD COLUMN `contact_person` VARCHAR(255) NULL DEFAULT NULL COMMENT 'Yetkili adı soyadı';
ALTER TABLE `saas_admins` ADD COLUMN `admin_notes` TEXT NULL COMMENT 'Sadece süper admin notu';
