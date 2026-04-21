-- ═══════════════════════════════════════════════════════════════════════════
-- NextPOS — Tenant Database Template (MySQL)
-- ═══════════════════════════════════════════════════════════════════════════

-- branches
CREATE TABLE IF NOT EXISTS `branches` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `address` TEXT,
    `phone` VARCHAR(20),
    `tax_number` VARCHAR(30),
    `license_key` VARCHAR(255) UNIQUE,
    `license_expiry` DATETIME,
    `is_online` BOOLEAN DEFAULT true,
    `last_sync` DATETIME,
    `default_language` VARCHAR(5) DEFAULT 'de',
    `supported_languages` VARCHAR(50) DEFAULT 'de,tr,en',
    `settings` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- users
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) UNIQUE NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `role` ENUM('admin', 'cashier', 'waiter', 'kitchen', 'courier') NOT NULL,
    `pin_code` VARCHAR(6),
    `avatar_url` VARCHAR(255),
    `preferred_language` VARCHAR(5) DEFAULT 'de',
    `status` VARCHAR(20) DEFAULT 'active',
    `last_login` DATETIME,
    `branch_id` INT,
    `waiter_all_sections` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=tüm salon, 0=tek bölge',
    `waiter_section_id` INT NULL,
    `kitchen_station` VARCHAR(20) DEFAULT 'all' COMMENT 'all, hot, cold, bar',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- categories
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `translations` JSON,
    `icon` VARCHAR(50) DEFAULT 'utensils',
    `image_url` VARCHAR(255),
    `sort_order` INT DEFAULT 0,
    `is_active` BOOLEAN DEFAULT true,
    `kitchen_station` VARCHAR(20) DEFAULT 'hot',
    `branch_id` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- products
CREATE TABLE IF NOT EXISTS `products` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `category_id` INT NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `translations` JSON,
    `description` TEXT,
    `base_price` DECIMAL(10, 2) NOT NULL,
    `price_takeaway` DECIMAL(10, 2) DEFAULT 0,
    `price_delivery` DECIMAL(10, 2) DEFAULT 0,
    `image_url` VARCHAR(255),
    `is_active` BOOLEAN DEFAULT true,
    `prep_time_min` INT DEFAULT 15,
    `allergens` TEXT,
    `nutritional` JSON,
    `sort_order` INT DEFAULT 0,
    `branch_id` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- product_variants
CREATE TABLE IF NOT EXISTS `product_variants` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `product_id` INT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `translations` JSON,
    `price` DECIMAL(10, 2) NOT NULL,
    `sort_order` INT DEFAULT 0,
    `is_default` BOOLEAN DEFAULT false
);

-- modifiers
CREATE TABLE IF NOT EXISTS `modifiers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `translations` JSON,
    `price` DECIMAL(10, 2) DEFAULT 0,
    `category` VARCHAR(50),
    `is_active` BOOLEAN DEFAULT true
);

-- product_modifiers
CREATE TABLE IF NOT EXISTS `product_modifiers` (
    `product_id` INT NOT NULL,
    `modifier_id` INT NOT NULL,
    PRIMARY KEY (`product_id`, `modifier_id`)
);

-- sections
CREATE TABLE IF NOT EXISTS `sections` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `floor` INT DEFAULT 0,
    `layout_data` JSON,
    `is_active` BOOLEAN DEFAULT true,
    `branch_id` INT,
    `sort_order` INT DEFAULT 0
);

-- tables
CREATE TABLE IF NOT EXISTS `tables` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `section_id` INT NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `capacity` INT DEFAULT 4,
    `shape` VARCHAR(20) DEFAULT 'square',
    `position_x` INT,
    `position_y` INT,
    `qr_code` VARCHAR(255),
    `status` ENUM('available', 'occupied', 'reserved', 'waiting_order', 'bill_requested', 'cleaning') DEFAULT 'available',
    `current_session_id` INT,
    `branch_id` INT
);

-- customers
CREATE TABLE IF NOT EXISTS `customers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `customer_code` VARCHAR(20) UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20),
    `email` VARCHAR(100),
    `personal_qr` VARCHAR(255) UNIQUE,
    `tier` ENUM('bronze', 'silver', 'gold', 'platinum') DEFAULT 'bronze',
    `points` INT DEFAULT 0,
    `total_visits` INT DEFAULT 0,
    `total_spent` DECIMAL(12, 2) DEFAULT 0,
    `last_visit` DATETIME,
    `favorite_products` TEXT,
    `allergies` TEXT,
    `notes` TEXT,
    `preferred_language` VARCHAR(5) DEFAULT 'de',
    `is_blacklisted` BOOLEAN DEFAULT false,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- customer_addresses
CREATE TABLE IF NOT EXISTS `customer_addresses` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `customer_id` INT NOT NULL,
    `label` VARCHAR(50),
    `address` TEXT NOT NULL,
    `district` VARCHAR(100),
    `city` VARCHAR(50),
    `lat` DECIMAL(10, 8),
    `lng` DECIMAL(11, 8),
    `is_default` BOOLEAN DEFAULT false,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- table_sessions
CREATE TABLE IF NOT EXISTS `table_sessions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `table_id` INT NOT NULL,
    `customer_id` INT,
    `guest_name` VARCHAR(100),
    `guest_count` INT DEFAULT 1,
    `waiter_id` INT,
    `status` ENUM('active', 'bill_requested', 'paid', 'cancelled') DEFAULT 'active',
    `opened_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `closed_at` DATETIME,
    `notes` TEXT
);

-- orders
CREATE TABLE IF NOT EXISTS `orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT,
    `table_id` INT,
    `customer_id` INT,
    `waiter_id` INT,
    `cashier_id` INT,
    `order_type` ENUM('dine_in', 'takeaway', 'delivery', 'web', 'phone', 'qr_menu') DEFAULT 'dine_in',
    `source` ENUM('cashier', 'waiter', 'customer_qr', 'web', 'phone') DEFAULT 'cashier',
    `status` ENUM('pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled') DEFAULT 'pending',
    `payment_status` ENUM('unpaid', 'partial', 'paid', 'refunded') DEFAULT 'unpaid',
    `subtotal` DECIMAL(10, 2) DEFAULT 0,
    `discount_amount` DECIMAL(10, 2) DEFAULT 0,
    `discount_type` VARCHAR(20),
    `discount_reason` TEXT,
    `tax_amount` DECIMAL(10, 2) DEFAULT 0,
    `total_amount` DECIMAL(10, 2) DEFAULT 0,
    `is_urgent` BOOLEAN DEFAULT false,
    `is_split_bill` BOOLEAN DEFAULT false,
    `notes` TEXT,
    `delivery_address` TEXT,
    `delivery_phone` VARCHAR(20),
    `courier_id` INT,
    `estimated_ready` DATETIME,
    `offline_id` VARCHAR(50),
    `synced` BOOLEAN DEFAULT true,
    `branch_id` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- order_items
CREATE TABLE IF NOT EXISTS `order_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `order_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `variant_id` INT,
    `quantity` INT DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `total_price` DECIMAL(10, 2) NOT NULL,
    `modifiers` JSON,
    `notes` TEXT,
    `status` ENUM('pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'cancelled') DEFAULT 'pending',
    `kitchen_printed` BOOLEAN DEFAULT false,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- kitchen_tickets
CREATE TABLE IF NOT EXISTS `kitchen_tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `order_id` INT NOT NULL,
    `table_name` VARCHAR(50),
    `waiter_name` VARCHAR(100),
    `station` VARCHAR(20) NOT NULL DEFAULT 'hot',
    `status` ENUM('waiting', 'preparing', 'ready', 'completed', 'cancelled') DEFAULT 'waiting',
    `is_urgent` BOOLEAN DEFAULT false,
    `ticket_number` INT,
    `items` JSON NOT NULL,
    `started_at` DATETIME,
    `ready_at` DATETIME,
    `completed_at` DATETIME,
    `prep_duration` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- payments
CREATE TABLE IF NOT EXISTS `payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `order_id` INT NOT NULL,
    `session_id` INT,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('cash', 'card', 'online', 'voucher', 'split') NOT NULL,
    `status` VARCHAR(20) DEFAULT 'completed',
    `tip_amount` DECIMAL(10, 2) DEFAULT 0,
    `change_amount` DECIMAL(10, 2) DEFAULT 0,
    `received_amount` DECIMAL(10, 2),
    `reference` VARCHAR(100),
    `cashier_id` INT,
    `notes` TEXT,
    `offline_id` VARCHAR(50),
    `synced` BOOLEAN DEFAULT true,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- couriers
CREATE TABLE IF NOT EXISTS `couriers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNIQUE NOT NULL,
    `vehicle_type` VARCHAR(50),
    `plate_number` VARCHAR(20),
    `is_active` BOOLEAN DEFAULT true,
    `status` VARCHAR(50) DEFAULT 'idle',
    `current_lat` DECIMAL(10, 8),
    `current_lng` DECIMAL(11, 8),
    `tracking_token` VARCHAR(36),
    `last_location_update` DATETIME,
    `branch_id` INT
);

-- deliveries
CREATE TABLE IF NOT EXISTS `deliveries` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `order_id` INT UNIQUE NOT NULL,
    `courier_id` INT,
    `status` ENUM('pending', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'returned', 'cancelled') DEFAULT 'pending',
    `address` TEXT,
    `phone` VARCHAR(20),
    `customer_name` VARCHAR(100),
    `lat` DECIMAL(10, 8),
    `lng` DECIMAL(11, 8),
    `estimated_time` INT,
    `actual_time` INT,
    `delivery_notes` TEXT,
    `payment_collected` VARCHAR(20),
    `assigned_at` DATETIME,
    `picked_at` DATETIME,
    `delivered_at` DATETIME,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
