-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "schema_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "subscription_plan" VARCHAR(50) NOT NULL DEFAULT 'basic',
    "license_expires_at" TIMESTAMPTZ(6),
    "max_users" INTEGER NOT NULL DEFAULT 10,
    "max_branches" INTEGER NOT NULL DEFAULT 1,
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(30),
    "authorized_person" VARCHAR(100),
    "tax_office" VARCHAR(100),
    "tax_number" VARCHAR(50),
    "special_license_key" VARCHAR(100),
    "address" TEXT,
    "settings" JSONB DEFAULT '{}',
    "reseller_id" INTEGER,
    "master_password" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_admins" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'super_admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email" VARCHAR(255),
    "company_name" VARCHAR(255),
    "commission_rate" DECIMAL(5,2),
    "available_licenses" INTEGER NOT NULL DEFAULT 0,
    "wallet_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "last_login" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "code" VARCHAR(5) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "native_name" VARCHAR(50) NOT NULL,
    "flag_emoji" VARCHAR(10),
    "direction" VARCHAR(3) NOT NULL DEFAULT 'ltr',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ui_translations" (
    "id" SERIAL NOT NULL,
    "namespace" VARCHAR(50) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "lang" VARCHAR(5) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ui_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" SERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(50),
    "action" VARCHAR(20) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_backups" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "size" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "tenants"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_special_license_key_key" ON "tenants"("special_license_key");

-- CreateIndex
CREATE UNIQUE INDEX "saas_admins_username_key" ON "saas_admins"("username");

-- CreateIndex
CREATE INDEX "ui_translations_namespace_lang_idx" ON "ui_translations"("namespace", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "ui_translations_namespace_key_lang_key" ON "ui_translations"("namespace", "key", "lang");

-- CreateIndex
CREATE INDEX "sync_queue_status_idx" ON "sync_queue"("status");

-- CreateIndex
CREATE INDEX "sync_queue_tenant_id_idx" ON "sync_queue"("tenant_id");

-- AddForeignKey
ALTER TABLE "ui_translations" ADD CONSTRAINT "ui_translations_lang_fkey" FOREIGN KEY ("lang") REFERENCES "languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
