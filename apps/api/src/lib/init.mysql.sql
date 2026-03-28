-- ═══════════════════════════════════════════════════════════════════════════
-- NextPOS — Multi-Tenant SaaS POS (MySQL Version)
-- Database Initialization & Tenant DB Generator
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create PUBLIC Database
CREATE DATABASE IF NOT EXISTS `public` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `public`;

-- Tenants Table
CREATE TABLE IF NOT EXISTS `tenants` (
    `id` CHAR(36) PRIMARY KEY, -- UUID
    `name` VARCHAR(255) NOT NULL,
    `schema_name` VARCHAR(255) UNIQUE NOT NULL,
    `status` VARCHAR(50) DEFAULT 'active',
    `subscription_plan` VARCHAR(50) DEFAULT 'basic',
    `license_expires_at` DATETIME,
    `max_users` INT DEFAULT 10,
    `max_branches` INT DEFAULT 1,
    `contact_email` VARCHAR(255),
    `contact_phone` VARCHAR(30),
    `address` TEXT,
    `settings` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SaaS Admins
CREATE TABLE IF NOT EXISTS `saas_admins` (
    `id` CHAR(36) PRIMARY KEY,
    `username` VARCHAR(100) UNIQUE NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) UNIQUE,
    `role` VARCHAR(50) DEFAULT 'super_admin',
    `last_login` DATETIME,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Languages
CREATE TABLE IF NOT EXISTS `languages` (
    `code` VARCHAR(5) PRIMARY KEY,
    `name` VARCHAR(50) NOT NULL,
    `native_name` VARCHAR(50) NOT NULL,
    `flag_emoji` VARCHAR(10),
    `direction` VARCHAR(3) DEFAULT 'ltr',
    `is_active` BOOLEAN DEFAULT true,
    `sort_order` INT DEFAULT 0
);

-- 2. PROCEDURE for Tenant Database Initialization
-- MySQL doesn't support easy dynamic CREATE TABLE in triggers, so we use procedures


CREATE PROCEDURE IF NOT EXISTS create_new_tenant_db(IN tenant_id CHAR(36))
BEGIN
    DECLARE s_name VARCHAR(255);
    SELECT schema_name INTO s_name FROM `public`.tenants WHERE id = tenant_id;
    
    -- Create Database
    SET @sql = CONCAT('CREATE DATABASE IF NOT EXISTS `', s_name, '`');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    -- Note: Executing complex multiple table creations in MySQL procedure requires careful statement handling
    -- For simplicity in MySQL, we will use a separate script or handle it in Node.js
END;


