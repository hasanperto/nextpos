-- SaaS Admin / platform tabloları — PostgreSQL (MySQL DDL yerine)
-- Ham sorgular `queryPublic` + Prisma public şeması ile uyumlu.

-- system_backups: tenant ve tip (otomatik yedek / SaaS istatistik)
ALTER TABLE "system_backups" ADD COLUMN IF NOT EXISTS "tenant_id" UUID REFERENCES "tenants"("id") ON DELETE SET NULL;
ALTER TABLE "system_backups" ADD COLUMN IF NOT EXISTS "backup_type" VARCHAR(20) NOT NULL DEFAULT 'full';

CREATE INDEX IF NOT EXISTS "system_backups_tenant_id_idx" ON "system_backups" ("tenant_id");

-- Audit & güvenlik
CREATE TABLE IF NOT EXISTS "audit_logs" (
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
);
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");

CREATE TABLE IF NOT EXISTS "login_attempts" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" SERIAL NOT NULL,
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "key_value" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "permissions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_keys_key_value_key" UNIQUE ("key_value")
);
CREATE INDEX IF NOT EXISTS "api_keys_tenant_id_idx" ON "api_keys" ("tenant_id");

-- Abonelik planları (SaaS UI — subscription_plans)
CREATE TABLE IF NOT EXISTS "subscription_plans" (
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
);

INSERT INTO "subscription_plans" ("name", "code", "monthly_fee", "setup_fee", "max_users", "max_branches", "max_products", "max_devices", "support_hours", "features", "trial_days", "sort_order")
VALUES
('Başlangıç', 'basic', 29.00, 299.00, 3, 1, 200, 1, '08:00-17:00', '["POS Terminal","Temel Raporlama","Menü Yönetimi"]'::jsonb, 14, 1),
('Pro', 'pro', 59.00, 499.00, 10, 3, 1000, 3, '08:00-22:00', '["Mutfak KDS","QR Menü","CRM"]'::jsonb, 14, 2),
('Kurumsal', 'enterprise', 99.00, 999.00, 50, 10, 9999, 10, '7/24', '["Tüm Pro Özellikler","API","TSE"]'::jsonb, 14, 3)
ON CONFLICT ("code") DO NOTHING;

-- Promosyon
CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "discount_type" VARCHAR(20) NOT NULL,
    "discount_value" DECIMAL(10, 2) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 100,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" DATE,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promo_codes_code_key" UNIQUE ("code")
);

-- CRM
CREATE TABLE IF NOT EXISTS "customer_notes" (
    "id" SERIAL NOT NULL,
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "note_type" VARCHAR(30) NOT NULL DEFAULT 'internal',
    "subject" VARCHAR(200),
    "content" TEXT,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "customer_notes_tenant_id_idx" ON "customer_notes" ("tenant_id");

CREATE TABLE IF NOT EXISTS "contracts" (
    "id" SERIAL NOT NULL,
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "contract_number" VARCHAR(50),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "monthly_amount" DECIMAL(10, 2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "document_url" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_contract_number_key" ON "contracts" ("contract_number") WHERE "contract_number" IS NOT NULL;

-- Monitoring
CREATE TABLE IF NOT EXISTS "system_metrics" (
    "id" SERIAL NOT NULL,
    "metric_type" VARCHAR(50) NOT NULL,
    "metric_value" DECIMAL(10, 2) NOT NULL,
    "unit" VARCHAR(20),
    "metadata" JSONB,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "system_metrics_recorded_at_idx" ON "system_metrics" ("recorded_at");

CREATE TABLE IF NOT EXISTS "alert_rules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "metric_type" VARCHAR(50) NOT NULL,
    "threshold" DECIMAL(10, 2) NOT NULL,
    "operator" VARCHAR(10) NOT NULL DEFAULT 'gt',
    "severity" VARCHAR(20) NOT NULL DEFAULT 'warning',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- Destek mesajları
CREATE TABLE IF NOT EXISTS "ticket_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
    "sender_type" VARCHAR(20) NOT NULL DEFAULT 'admin',
    "sender_name" VARCHAR(100),
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_id_idx" ON "ticket_messages" ("ticket_id");

CREATE TABLE IF NOT EXISTS "knowledge_base" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "content" TEXT NOT NULL,
    "tags" VARCHAR(500),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "system_settings" (
    "id" SERIAL NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'EUR',
    "base_subscription_fee" DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    "monthly_license_fee" DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_settings" ("id", "currency", "base_subscription_fee", "monthly_license_fee", "trial_days")
VALUES (1, 'EUR', 500.00, 50.00, 14)
ON CONFLICT ("id") DO NOTHING;

-- Faturalama modülleri (SaaS plan × modül matrisi)
CREATE TABLE IF NOT EXISTS "billing_modules" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "category" VARCHAR(50) NOT NULL DEFAULT 'feature',
    "setup_price" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "monthly_price" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "icon" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_modules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_modules_code_key" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "tenant_modules" (
    "id" SERIAL NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "module_code" VARCHAR(50) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "setup_line_total" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "monthly_line_total" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_modules_tenant_id_module_code_key" UNIQUE ("tenant_id", "module_code")
);
CREATE INDEX IF NOT EXISTS "tenant_modules_tenant_id_idx" ON "tenant_modules" ("tenant_id");

CREATE TABLE IF NOT EXISTS "tenant_billing" (
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
);

CREATE TABLE IF NOT EXISTS "plan_module_rules" (
    "plan_code" VARCHAR(30) NOT NULL,
    "module_code" VARCHAR(50) NOT NULL,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'addon',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plan_module_rules_pkey" PRIMARY KEY ("plan_code", "module_code")
);

CREATE TABLE IF NOT EXISTS "billing_reminder_log" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" CHAR(36) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_reminder_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "billing_reminder_log_tenant_id_idx" ON "billing_reminder_log" ("tenant_id");
