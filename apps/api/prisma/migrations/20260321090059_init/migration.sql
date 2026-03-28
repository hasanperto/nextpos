-- CreateTable
CREATE TABLE `branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(20) NULL,
    `tax_number` VARCHAR(30) NULL,
    `license_key` VARCHAR(255) NULL,
    `license_expiry` DATETIME(3) NULL,
    `is_online` BOOLEAN NOT NULL DEFAULT true,
    `last_sync` DATETIME(3) NULL,
    `default_language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `supported_languages` VARCHAR(50) NOT NULL DEFAULT 'de,tr,en',
    `settings` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `branches_license_key_key`(`license_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `role` ENUM('admin', 'cashier', 'waiter', 'kitchen', 'courier') NOT NULL,
    `pin_code` VARCHAR(6) NULL,
    `avatar_url` VARCHAR(255) NULL,
    `preferred_language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `last_login` DATETIME(3) NULL,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `translations` JSON NOT NULL,
    `icon` VARCHAR(50) NOT NULL DEFAULT 'utensils',
    `image_url` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `translations` JSON NOT NULL,
    `description` TEXT NULL,
    `base_price` DECIMAL(10, 2) NOT NULL,
    `image_url` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `prep_time_min` INTEGER NOT NULL DEFAULT 15,
    `allergens` TEXT NULL,
    `nutritional` JSON NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `translations` JSON NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_default` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `modifiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `translations` JSON NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `category` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_modifiers` (
    `product_id` INTEGER NOT NULL,
    `modifier_id` INTEGER NOT NULL,

    PRIMARY KEY (`product_id`, `modifier_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `floor` INTEGER NOT NULL DEFAULT 0,
    `layout_data` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `branch_id` INTEGER NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tables` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `section_id` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 4,
    `shape` VARCHAR(20) NOT NULL DEFAULT 'square',
    `position_x` INTEGER NULL,
    `position_y` INTEGER NULL,
    `qr_code` VARCHAR(255) NULL,
    `status` ENUM('available', 'occupied', 'reserved', 'waiting_order', 'bill_requested', 'cleaning') NOT NULL DEFAULT 'available',
    `current_session_id` INTEGER NULL,
    `branch_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_code` VARCHAR(20) NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(100) NULL,
    `personal_qr` VARCHAR(255) NULL,
    `tier` ENUM('bronze', 'silver', 'gold', 'platinum') NOT NULL DEFAULT 'bronze',
    `points` INTEGER NOT NULL DEFAULT 0,
    `total_visits` INTEGER NOT NULL DEFAULT 0,
    `total_spent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `last_visit` DATETIME(3) NULL,
    `favorite_products` TEXT NULL,
    `allergies` TEXT NULL,
    `notes` TEXT NULL,
    `preferred_language` VARCHAR(5) NOT NULL DEFAULT 'de',
    `is_blacklisted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_customer_code_key`(`customer_code`),
    UNIQUE INDEX `customers_personal_qr_key`(`personal_qr`),
    INDEX `customers_phone_idx`(`phone`),
    INDEX `customers_personal_qr_idx`(`personal_qr`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `label` VARCHAR(50) NULL,
    `address` TEXT NOT NULL,
    `district` VARCHAR(100) NULL,
    `city` VARCHAR(50) NULL,
    `lat` DECIMAL(10, 8) NULL,
    `lng` DECIMAL(11, 8) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `table_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `table_id` INTEGER NOT NULL,
    `customer_id` INTEGER NULL,
    `guest_name` VARCHAR(100) NULL,
    `guest_count` INTEGER NOT NULL DEFAULT 1,
    `waiter_id` INTEGER NULL,
    `status` ENUM('active', 'bill_requested', 'paid', 'cancelled') NOT NULL DEFAULT 'active',
    `opened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closed_at` DATETIME(3) NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NULL,
    `table_id` INTEGER NULL,
    `customer_id` INTEGER NULL,
    `waiter_id` INTEGER NULL,
    `cashier_id` INTEGER NULL,
    `order_type` ENUM('dine_in', 'takeaway', 'delivery', 'web', 'phone', 'qr_menu') NOT NULL DEFAULT 'dine_in',
    `source` ENUM('cashier', 'waiter', 'customer_qr', 'web', 'phone') NOT NULL DEFAULT 'cashier',
    `status` ENUM('pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `payment_status` ENUM('unpaid', 'partial', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid',
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discount_type` VARCHAR(20) NULL,
    `discount_reason` TEXT NULL,
    `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `is_urgent` BOOLEAN NOT NULL DEFAULT false,
    `is_split_bill` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `delivery_address` TEXT NULL,
    `delivery_phone` VARCHAR(20) NULL,
    `courier_id` INTEGER NULL,
    `estimated_ready` DATETIME(3) NULL,
    `offline_id` VARCHAR(50) NULL,
    `synced` BOOLEAN NOT NULL DEFAULT true,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `orders_status_idx`(`status`),
    INDEX `orders_created_at_idx`(`created_at`),
    INDEX `orders_table_id_idx`(`table_id`),
    INDEX `orders_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `variant_id` INTEGER NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `total_price` DECIMAL(10, 2) NOT NULL,
    `modifiers` JSON NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('pending', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'cancelled') NOT NULL DEFAULT 'pending',
    `kitchen_printed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_items_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kitchen_tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `table_name` VARCHAR(50) NULL,
    `waiter_name` VARCHAR(100) NULL,
    `status` ENUM('waiting', 'preparing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'waiting',
    `is_urgent` BOOLEAN NOT NULL DEFAULT false,
    `ticket_number` INTEGER NULL,
    `items` JSON NOT NULL,
    `started_at` DATETIME(3) NULL,
    `ready_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `prep_duration` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `kitchen_tickets_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `session_id` INTEGER NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('cash', 'card', 'online', 'voucher', 'split') NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'completed',
    `tip_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `change_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `received_amount` DECIMAL(10, 2) NULL,
    `reference` VARCHAR(100) NULL,
    `cashier_id` INTEGER NULL,
    `notes` TEXT NULL,
    `offline_id` VARCHAR(50) NULL,
    `synced` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payments_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_zones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `min_order` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `est_minutes` INTEGER NOT NULL DEFAULT 30,
    `polygon` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `branch_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `courier_id` INTEGER NULL,
    `status` ENUM('pending', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'returned', 'cancelled') NOT NULL DEFAULT 'pending',
    `address` TEXT NULL,
    `phone` VARCHAR(20) NULL,
    `customer_name` VARCHAR(100) NULL,
    `lat` DECIMAL(10, 8) NULL,
    `lng` DECIMAL(11, 8) NULL,
    `estimated_time` INTEGER NULL,
    `actual_time` INTEGER NULL,
    `delivery_notes` TEXT NULL,
    `payment_collected` VARCHAR(20) NULL,
    `assigned_at` DATETIME(3) NULL,
    `picked_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `deliveries_order_id_key`(`order_id`),
    INDEX `deliveries_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_calls` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `table_id` INTEGER NOT NULL,
    `session_id` INTEGER NULL,
    `call_type` ENUM('call_waiter', 'clear_table', 'request_bill', 'request_bill_cash', 'request_bill_card', 'water', 'custom') NOT NULL,
    `message` TEXT NULL,
    `status` ENUM('pending', 'seen', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
    `responded_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `responded_at` DATETIME(3) NULL,

    INDEX `service_calls_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_summaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `report_date` DATE NOT NULL,
    `total_orders` INTEGER NOT NULL DEFAULT 0,
    `total_revenue` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cash_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `card_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `avg_order_value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `cancelled_count` INTEGER NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `tax_total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `top_products` JSON NULL,
    `hourly_data` JSON NULL,
    `cashier_id` INTEGER NULL,
    `z_report_no` VARCHAR(20) NULL,
    `opened_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `opening_cash` DECIMAL(10, 2) NULL,
    `closing_cash` DECIMAL(10, 2) NULL,

    UNIQUE INDEX `daily_summaries_branch_id_report_date_key`(`branch_id`, `report_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `point_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `points` INTEGER NOT NULL,
    `type` ENUM('earn', 'redeem', 'expire', 'adjust') NOT NULL,
    `reference_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `languages` (
    `code` VARCHAR(5) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `native_name` VARCHAR(50) NOT NULL,
    `flag_emoji` VARCHAR(10) NULL,
    `direction` VARCHAR(3) NOT NULL DEFAULT 'ltr',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_translations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `namespace` VARCHAR(50) NOT NULL,
    `key` VARCHAR(200) NOT NULL,
    `lang` VARCHAR(5) NOT NULL,
    `value` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ui_translations_namespace_lang_idx`(`namespace`, `lang`),
    UNIQUE INDEX `ui_translations_namespace_key_lang_key`(`namespace`, `key`, `lang`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipt_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `lang` VARCHAR(5) NOT NULL,
    `header_text` TEXT NULL,
    `footer_text` TEXT NULL,
    `tax_label` VARCHAR(50) NULL,
    `subtotal_label` VARCHAR(50) NULL,
    `total_label` VARCHAR(50) NULL,
    `payment_labels` JSON NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `receipt_templates_branch_id_lang_key`(`branch_id`, `lang`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_queue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` VARCHAR(50) NULL,
    `action` VARCHAR(20) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `synced_at` DATETIME(3) NULL,

    INDEX `sync_queue_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_modifiers` ADD CONSTRAINT `product_modifiers_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_modifiers` ADD CONSTRAINT `product_modifiers_modifier_id_fkey` FOREIGN KEY (`modifier_id`) REFERENCES `modifiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sections` ADD CONSTRAINT `sections_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tables` ADD CONSTRAINT `tables_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tables` ADD CONSTRAINT `tables_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_waiter_id_fkey` FOREIGN KEY (`waiter_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_waiter_id_fkey` FOREIGN KEY (`waiter_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_cashier_id_fkey` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_courier_id_fkey` FOREIGN KEY (`courier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kitchen_tickets` ADD CONSTRAINT `kitchen_tickets_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_cashier_id_fkey` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_zones` ADD CONSTRAINT `delivery_zones_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_courier_id_fkey` FOREIGN KEY (`courier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_calls` ADD CONSTRAINT `service_calls_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_calls` ADD CONSTRAINT `service_calls_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_calls` ADD CONSTRAINT `service_calls_responded_by_fkey` FOREIGN KEY (`responded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_summaries` ADD CONSTRAINT `daily_summaries_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `point_history` ADD CONSTRAINT `point_history_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_translations` ADD CONSTRAINT `ui_translations_lang_fkey` FOREIGN KEY (`lang`) REFERENCES `languages`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipt_templates` ADD CONSTRAINT `receipt_templates_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipt_templates` ADD CONSTRAINT `receipt_templates_lang_fkey` FOREIGN KEY (`lang`) REFERENCES `languages`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;
