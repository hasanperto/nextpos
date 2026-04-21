-- ═══════════════════════════════════════════════════════════════════════════
-- NextPOS — Multi-Tenant SaaS POS System
-- Database Initialization & Tenant Schema Generator
-- Engine: PostgreSQL 15+
-- Architecture: Schema-per-Tenant
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 1. PUBLIC SCHEMA (Merkezi SaaS Verileri)
-- ═══════════════════════════════════════

-- uuid-ossp extension (UUID üretimi için)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (Kiracılar / Restoranlar)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    schema_name VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    license_expires_at TIMESTAMPTZ,
    max_users INT DEFAULT 10,
    max_branches INT DEFAULT 1,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(30),
    address TEXT,
    tax_office VARCHAR(100),
    tax_number VARCHAR(30),
    authorized_person VARCHAR(150),
    company_title VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_schema_name ON public.tenants (schema_name);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants (status);

-- SaaS Admins (Tüm sistemi yöneten super adminler)
CREATE TABLE IF NOT EXISTS public.saas_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) DEFAULT 'super_admin',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Languages (Merkezi dil tablosu)
CREATE TABLE IF NOT EXISTS public.languages (
    code VARCHAR(5) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    native_name VARCHAR(50) NOT NULL,
    flag_emoji VARCHAR(10),
    direction VARCHAR(3) DEFAULT 'ltr',
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0
);

-- UI Translations (Merkezi çeviri tablosu)
CREATE TABLE IF NOT EXISTS public.ui_translations (
    id SERIAL PRIMARY KEY,
    namespace VARCHAR(50) NOT NULL,
    key VARCHAR(200) NOT NULL,
    lang VARCHAR(5) NOT NULL REFERENCES public.languages(code),
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(namespace, key, lang)
);

CREATE INDEX IF NOT EXISTS idx_ui_translations_ns_lang ON public.ui_translations (namespace, lang);

-- Sync Queue (Offline senkronizasyon kuyruğu; tenant_id+entity_id benzersiz)
CREATE TABLE IF NOT EXISTS public.sync_queue (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_tenant_id_entity_id_key ON public.sync_queue (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON public.sync_queue (status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_tenant ON public.sync_queue (tenant_id);

-- Varsayılan diller
INSERT INTO public.languages (code, name, native_name, flag_emoji, direction, sort_order)
VALUES
    ('de', 'German', 'Deutsch', '🇩🇪', 'ltr', 1),
    ('tr', 'Turkish', 'Türkçe', '🇹🇷', 'ltr', 2),
    ('en', 'English', 'English', '🇬🇧', 'ltr', 3),
    ('ar', 'Arabic', 'العربية', '🇸🇦', 'rtl', 4)
ON CONFLICT (code) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TENANT SCHEMA OLUŞTURMA FONKSİYONU
-- Her yeni restoran kaydedildiğinde bu fonksiyon çağrılarak
-- o restorana özgü tam izole bir veritabanı şeması oluşturulur.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_new_tenant_schema(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    s VARCHAR(255); -- schema name
BEGIN
    -- 1. Tenant'ın schema adını bul
    SELECT schema_name INTO s FROM public.tenants WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant % tablosunda bulunamadı (public.tenants)', p_tenant_id;
    END IF;

    -- 2. Schema oluştur
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', s);

    -- ─────────────────────────────────────
    -- ENUM'lar
    -- ─────────────────────────────────────

    -- user_role
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''user_role'' AND n.nspname = %L) THEN
                CREATE TYPE %I.user_role AS ENUM (''admin'', ''cashier'', ''waiter'', ''kitchen'', ''courier'');
            END IF;
        END $do$;
    ', s, s);

    -- table_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''table_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.table_status AS ENUM (''available'', ''occupied'', ''reserved'', ''waiting_order'', ''bill_requested'', ''cleaning'');
            END IF;
        END $do$;
    ', s, s);

    -- customer_tier
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''customer_tier'' AND n.nspname = %L) THEN
                CREATE TYPE %I.customer_tier AS ENUM (''bronze'', ''silver'', ''gold'', ''platinum'');
            END IF;
        END $do$;
    ', s, s);

    -- order_type
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''order_type'' AND n.nspname = %L) THEN
                CREATE TYPE %I.order_type AS ENUM (''dine_in'', ''takeaway'', ''delivery'', ''web'', ''phone'', ''qr_menu'');
            END IF;
        END $do$;
    ', s, s);

    -- order_source
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''order_source'' AND n.nspname = %L) THEN
                CREATE TYPE %I.order_source AS ENUM (''cashier'', ''waiter'', ''customer_qr'', ''web'', ''phone'', ''qr_portal'', ''whatsapp'');
            END IF;
        END $do$;
    ', s, s);

    -- order_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''order_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.order_status AS ENUM (''pending'', ''confirmed'', ''preparing'', ''ready'', ''served'', ''shipped'', ''completed'', ''cancelled'');
            END IF;
        END $do$;
    ', s, s);

    -- payment_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''payment_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.payment_status AS ENUM (''unpaid'', ''partial'', ''paid'', ''refunded'');
            END IF;
        END $do$;
    ', s, s);

    -- order_item_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''order_item_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.order_item_status AS ENUM (''pending'', ''sent_to_kitchen'', ''preparing'', ''ready'', ''served'', ''cancelled'');
            END IF;
        END $do$;
    ', s, s);

    -- kitchen_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''kitchen_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.kitchen_status AS ENUM (''waiting'', ''preparing'', ''ready'', ''completed'', ''cancelled'');
            END IF;
        END $do$;
    ', s, s);

    -- payment_method
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''payment_method'' AND n.nspname = %L) THEN
                CREATE TYPE %I.payment_method AS ENUM (''cash'', ''card'', ''online'', ''voucher'', ''split'');
            END IF;
        END $do$;
    ', s, s);

    -- session_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''session_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.session_status AS ENUM (''active'', ''bill_requested'', ''paid'', ''cancelled'');
            END IF;
        END $do$;
    ', s, s);

    -- delivery_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''delivery_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.delivery_status AS ENUM (''pending'', ''assigned'', ''picked_up'', ''on_the_way'', ''delivered'', ''returned'', ''cancelled'');
            END IF;
        END $do$;
    ', s, s);

    -- service_call_type
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''service_call_type'' AND n.nspname = %L) THEN
                CREATE TYPE %I.service_call_type AS ENUM (''call_waiter'', ''clear_table'', ''request_bill'', ''request_bill_cash'', ''request_bill_card'', ''water'', ''custom'');
            END IF;
        END $do$;
    ', s, s);

    -- service_call_status
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''service_call_status'' AND n.nspname = %L) THEN
                CREATE TYPE %I.service_call_status AS ENUM (''pending'', ''seen'', ''in_progress'', ''completed'');
            END IF;
        END $do$;
    ', s, s);

    -- point_type
    EXECUTE format('
        DO $do$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = ''point_type'' AND n.nspname = %L) THEN
                CREATE TYPE %I.point_type AS ENUM (''earn'', ''redeem'', ''expire'', ''adjust'');
            END IF;
        END $do$;
    ', s, s);


    -- ─────────────────────────────────────
    -- TABLOLAR
    -- ─────────────────────────────────────

    -- branches (Şubeler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.branches (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            address TEXT,
            phone VARCHAR(20),
            tax_number VARCHAR(30),
            license_key VARCHAR(255) UNIQUE,
            license_expiry TIMESTAMPTZ,
            is_online BOOLEAN DEFAULT true,
            last_sync TIMESTAMPTZ,
            default_language VARCHAR(5) DEFAULT ''de'',
            supported_languages VARCHAR(50) DEFAULT ''de,tr,en'',
            settings JSONB DEFAULT ''{}'',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s);

    -- users (Kullanıcılar)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            role %I.user_role NOT NULL,
            pin_code VARCHAR(6),
            avatar_url VARCHAR(255),
            preferred_language VARCHAR(5) DEFAULT ''de'',
            status VARCHAR(20) DEFAULT ''active'',
            last_login TIMESTAMPTZ,
            branch_id INT REFERENCES %I.branches(id),
            waiter_all_sections BOOLEAN DEFAULT true,
            waiter_section_id INT,
            kitchen_station VARCHAR(20) DEFAULT ''all'',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s, s);

    -- categories (Kategoriler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            translations JSONB DEFAULT ''{}'',
            icon VARCHAR(50) DEFAULT ''utensils'',
            image_url VARCHAR(255),
            sort_order INT DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            kitchen_station VARCHAR(20) DEFAULT ''hot'',
            branch_id INT REFERENCES %I.branches(id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s);

    -- products (Ürünler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.products (
            id SERIAL PRIMARY KEY,
            category_id INT NOT NULL REFERENCES %I.categories(id),
            name VARCHAR(150) NOT NULL,
            translations JSONB DEFAULT ''{}'',
            description TEXT,
            base_price DECIMAL(10, 2) NOT NULL,
            price_takeaway DECIMAL(10, 2) NOT NULL DEFAULT 0,
            price_delivery DECIMAL(10, 2) NOT NULL DEFAULT 0,
            image_url VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            prep_time_min INT DEFAULT 15,
            allergens TEXT,
            nutritional JSONB DEFAULT ''{}'',
            sort_order INT DEFAULT 0,
            branch_id INT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s);

    -- product_variants
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.product_variants (
            id SERIAL PRIMARY KEY,
            product_id INT NOT NULL REFERENCES %I.products(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            translations JSONB DEFAULT ''{}'',
            price DECIMAL(10, 2) NOT NULL,
            sort_order INT DEFAULT 0,
            is_default BOOLEAN DEFAULT false
        )
    ', s, s);

    -- modifiers
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.modifiers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            translations JSONB DEFAULT ''{}'',
            price DECIMAL(10, 2) DEFAULT 0,
            category VARCHAR(50),
            is_active BOOLEAN DEFAULT true
        )
    ', s);

    -- product_modifiers (many-to-many)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.product_modifiers (
            product_id INT NOT NULL REFERENCES %I.products(id) ON DELETE CASCADE,
            modifier_id INT NOT NULL REFERENCES %I.modifiers(id) ON DELETE CASCADE,
            PRIMARY KEY (product_id, modifier_id)
        )
    ', s, s, s);

    -- sections (Bölgeler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.sections (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            floor INT DEFAULT 0,
            layout_data JSONB,
            is_active BOOLEAN DEFAULT true,
            branch_id INT REFERENCES %I.branches(id),
            sort_order INT DEFAULT 0
        )
    ', s, s);

    -- tables (Masalar)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.tables (
            id SERIAL PRIMARY KEY,
            section_id INT NOT NULL REFERENCES %I.sections(id),
            name VARCHAR(50) NOT NULL,
            translations JSONB DEFAULT ''{}'',
            capacity INT DEFAULT 4,
            shape VARCHAR(20) DEFAULT ''square'',
            position_x INT,
            position_y INT,
            qr_code VARCHAR(255),
            status %I.table_status DEFAULT ''available'',
            current_session_id INT,
            branch_id INT REFERENCES %I.branches(id)
        )
    ', s, s, s, s);

    -- customers (Müşteriler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.customers (
            id SERIAL PRIMARY KEY,
            customer_code VARCHAR(20) UNIQUE,
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            email VARCHAR(100),
            personal_qr VARCHAR(255) UNIQUE,
            tier %I.customer_tier DEFAULT ''bronze'',
            points INT DEFAULT 0,
            total_visits INT DEFAULT 0,
            total_spent DECIMAL(12, 2) DEFAULT 0,
            last_visit TIMESTAMPTZ,
            favorite_products TEXT,
            allergies TEXT,
            notes TEXT,
            preferred_language VARCHAR(5) DEFAULT ''de'',
            is_blacklisted BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s);

    -- customer_addresses
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.customer_addresses (
            id SERIAL PRIMARY KEY,
            customer_id INT NOT NULL REFERENCES %I.customers(id) ON DELETE CASCADE,
            label VARCHAR(50),
            address TEXT NOT NULL,
            district VARCHAR(100),
            city VARCHAR(50),
            lat DECIMAL(10, 8),
            lng DECIMAL(11, 8),
            is_default BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s);

    -- table_sessions
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.table_sessions (
            id SERIAL PRIMARY KEY,
            table_id INT NOT NULL REFERENCES %I.tables(id),
            customer_id INT REFERENCES %I.customers(id),
            client_session_id VARCHAR(100),
            guest_name VARCHAR(100),
            guest_count INT DEFAULT 1,
            waiter_id INT REFERENCES %I.users(id),
            status %I.session_status DEFAULT ''active'',
            opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMPTZ,
            notes TEXT
        )
    ', s, s, s, s, s);

    -- orders (Siparişler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.orders (
            id SERIAL PRIMARY KEY,
            session_id INT REFERENCES %I.table_sessions(id),
            table_id INT REFERENCES %I.tables(id),
            customer_id INT REFERENCES %I.customers(id),
            customer_name VARCHAR(100),
            waiter_id INT REFERENCES %I.users(id),
            cashier_id INT REFERENCES %I.users(id),
            order_type %I.order_type DEFAULT ''dine_in'',
            source %I.order_source DEFAULT ''cashier'',
            status %I.order_status DEFAULT ''pending'',
            payment_status %I.payment_status DEFAULT ''unpaid'',
            subtotal DECIMAL(10, 2) DEFAULT 0,
            discount_amount DECIMAL(10, 2) DEFAULT 0,
            discount_type VARCHAR(20),
            discount_reason TEXT,
            tax_amount DECIMAL(10, 2) DEFAULT 0,
            total_amount DECIMAL(10, 2) DEFAULT 0,
            is_urgent BOOLEAN DEFAULT false,
            is_split_bill BOOLEAN DEFAULT false,
            notes TEXT,
            delivery_address TEXT,
            delivery_phone VARCHAR(20),
            courier_id INT REFERENCES %I.users(id),
            estimated_ready TIMESTAMPTZ,
            offline_id VARCHAR(50),
            synced BOOLEAN DEFAULT true,
            branch_id INT REFERENCES %I.branches(id),
            deleted_at TIMESTAMPTZ,
            deleted_by INT REFERENCES %I.users(id),
            delete_reason TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s, s, s, s, s, s, s, s, s, s, s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_orders_status ON %I.orders (status)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_orders_created ON %I.orders (created_at)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_orders_table ON %I.orders (table_id)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_orders_branch ON %I.orders (branch_id)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON %I.orders (deleted_at)', s);

    -- order_items (Sipariş Kalemleri)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.order_items (
            id SERIAL PRIMARY KEY,
            order_id INT NOT NULL REFERENCES %I.orders(id) ON DELETE CASCADE,
            product_id INT NOT NULL REFERENCES %I.products(id),
            variant_id INT REFERENCES %I.product_variants(id),
            quantity INT DEFAULT 1,
            unit_price DECIMAL(10, 2) NOT NULL,
            total_price DECIMAL(10, 2) NOT NULL,
            modifiers JSONB DEFAULT ''[]'',
            notes TEXT,
            status %I.order_item_status DEFAULT ''pending'',
            kitchen_printed BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s, s, s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_order_items_order ON %I.order_items (order_id)', s);

    -- kitchen_tickets (Mutfak Fişleri)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.kitchen_tickets (
            id SERIAL PRIMARY KEY,
            order_id INT NOT NULL REFERENCES %I.orders(id),
            table_name VARCHAR(50),
            waiter_name VARCHAR(100),
            station VARCHAR(20) NOT NULL DEFAULT ''hot'',
            status %I.kitchen_status DEFAULT ''waiting'',
            is_urgent BOOLEAN DEFAULT false,
            ticket_number INT,
            items JSONB NOT NULL,
            started_at TIMESTAMPTZ,
            ready_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            prep_duration INT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s);

    -- Eski şemalarda station yoksa indeks öncesi ekle
    EXECUTE format('ALTER TABLE %I.kitchen_tickets ADD COLUMN IF NOT EXISTS station VARCHAR(20) NOT NULL DEFAULT ''hot''', s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_status ON %I.kitchen_tickets (status)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_station_status ON %I.kitchen_tickets (station, status)', s);

    -- payments (Ödemeler)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.payments (
            id SERIAL PRIMARY KEY,
            order_id INT NOT NULL REFERENCES %I.orders(id),
            session_id INT REFERENCES %I.table_sessions(id),
            amount DECIMAL(10, 2) NOT NULL,
            method %I.payment_method NOT NULL,
            status VARCHAR(20) DEFAULT ''completed'',
            tip_amount DECIMAL(10, 2) DEFAULT 0,
            change_amount DECIMAL(10, 2) DEFAULT 0,
            received_amount DECIMAL(10, 2),
            reference VARCHAR(100),
            cashier_id INT REFERENCES %I.users(id),
            notes TEXT,
            offline_id VARCHAR(50),
            synced BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s, s, s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_payments_order ON %I.payments (order_id)', s);

    -- couriers (Kurye detayları)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.couriers (
            id SERIAL PRIMARY KEY,
            user_id INT UNIQUE NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
            vehicle_type VARCHAR(50), -- bike, moto, car
            plate_number VARCHAR(20),
            is_active BOOLEAN DEFAULT true,
            status %I.delivery_status DEFAULT ''pending'',
            current_lat DECIMAL(10, 8),
            current_lng DECIMAL(11, 8),
            tracking_token UUID DEFAULT uuid_generate_v4(),
            last_location_update TIMESTAMPTZ,
            branch_id INT REFERENCES %I.branches(id)
        )
    ', s, s, s, s);

    -- delivery_zones
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.delivery_zones (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            min_order DECIMAL(10, 2) DEFAULT 0,
            delivery_fee DECIMAL(10, 2) DEFAULT 0,
            est_minutes INT DEFAULT 30,
            polygon JSONB,
            is_active BOOLEAN DEFAULT true,
            branch_id INT REFERENCES %I.branches(id)
        )
    ', s, s);

    -- deliveries
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.deliveries (
            id SERIAL PRIMARY KEY,
            order_id INT UNIQUE NOT NULL REFERENCES %I.orders(id),
            courier_id INT REFERENCES %I.users(id),
            status %I.delivery_status DEFAULT ''pending'',
            address TEXT,
            phone VARCHAR(20),
            customer_name VARCHAR(100),
            lat DECIMAL(10, 8),
            lng DECIMAL(11, 8),
            estimated_time INT,
            actual_time INT,
            delivery_notes TEXT,
            payment_collected VARCHAR(20),
            assigned_at TIMESTAMPTZ,
            picked_at TIMESTAMPTZ,
            delivered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s, s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_deliveries_status ON %I.deliveries (status)', s);

    -- service_calls
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.service_calls (
            id SERIAL PRIMARY KEY,
            table_id INT NOT NULL REFERENCES %I.tables(id),
            session_id INT REFERENCES %I.table_sessions(id),
            call_type %I.service_call_type NOT NULL,
            message TEXT,
            status %I.service_call_status DEFAULT ''pending'',
            responded_by INT REFERENCES %I.users(id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMPTZ
        )
    ', s, s, s, s, s, s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_service_calls_status ON %I.service_calls (status)', s);

    -- daily_summaries (Z Raporları)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.daily_summaries (
            id SERIAL PRIMARY KEY,
            branch_id INT NOT NULL REFERENCES %I.branches(id),
            report_date DATE NOT NULL,
            total_orders INT DEFAULT 0,
            total_revenue DECIMAL(12, 2) DEFAULT 0,
            cash_total DECIMAL(12, 2) DEFAULT 0,
            card_total DECIMAL(12, 2) DEFAULT 0,
            avg_order_value DECIMAL(10, 2) DEFAULT 0,
            cancelled_count INT DEFAULT 0,
            discount_total DECIMAL(12, 2) DEFAULT 0,
            subtotal DECIMAL(12, 2) DEFAULT 0,
            tax_total DECIMAL(12, 2) DEFAULT 0,
            top_products JSONB,
            hourly_data JSONB,
            cashier_id INT,
            z_report_no VARCHAR(20),
            tss_signature TEXT,
            opened_at TIMESTAMPTZ,
            closed_at TIMESTAMPTZ,
            opening_cash DECIMAL(10, 2),
            closing_cash DECIMAL(10, 2),
            UNIQUE(branch_id, report_date)
        )
    ', s, s);

    -- point_history (Puan Geçmişi)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.point_history (
            id SERIAL PRIMARY KEY,
            customer_id INT NOT NULL REFERENCES %I.customers(id),
            points INT NOT NULL,
            type %I.point_type NOT NULL,
            reference_id INT,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s);

    -- staff_shifts (Personel Çalışma Saatleri & Performans)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.staff_shifts (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
            branch_id INT REFERENCES %I.branches(id),
            clock_in TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            clock_out TIMESTAMPTZ,
            duration_mins INT,
            total_sales DECIMAL(12, 2) DEFAULT 0,
            total_orders INT DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    ', s, s, s);

    -- receipt_templates (Fiş Şablonları)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.receipt_templates (
            id SERIAL PRIMARY KEY,
            branch_id INT NOT NULL REFERENCES %I.branches(id),
            lang VARCHAR(5) NOT NULL,
            header_text TEXT,
            footer_text TEXT,
            tax_label VARCHAR(50),
            subtotal_label VARCHAR(50),
            total_label VARCHAR(50),
            payment_labels JSONB,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(branch_id, lang)
        )
    ', s, s);

    RAISE NOTICE 'Tenant schema "%" başarıyla oluşturuldu!', s;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ÖRNEK KULLANIM
-- ═══════════════════════════════════════════════════════════════════════════
/*
-- Yeni bir restoran oluşturmak için:

INSERT INTO public.tenants (name, schema_name, contact_email, license_expires_at)
VALUES ('Best Pizza & Kebab', 'tenant_1', 'info@bestpk.de', NOW() + INTERVAL '1 year');

-- Sonra schema'yı oluştur:
SELECT public.create_new_tenant_schema(
    (SELECT id FROM public.tenants WHERE schema_name = 'tenant_1')
);

-- Artık tenant_1.orders, tenant_1.users vs. tabloları kullanılabilir!
*/
