-- Bayi lisans paketleri, ödeme geçmişi, saas_admins.reseller_plan_id

CREATE TABLE "reseller_plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "license_count" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reseller_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reseller_plans_code_key" ON "reseller_plans"("code");

CREATE TABLE "payment_history" (
    "id" SERIAL NOT NULL,
    "tenant_id" UUID,
    "saas_admin_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'EUR',
    "payment_type" VARCHAR(50) NOT NULL,
    "payment_method" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_history_tenant_id_idx" ON "payment_history"("tenant_id");
CREATE INDEX "payment_history_saas_admin_id_idx" ON "payment_history"("saas_admin_id");

ALTER TABLE "saas_admins" ADD COLUMN "reseller_plan_id" INTEGER;

ALTER TABLE "saas_admins" ADD CONSTRAINT "saas_admins_reseller_plan_id_fkey" FOREIGN KEY ("reseller_plan_id") REFERENCES "reseller_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
