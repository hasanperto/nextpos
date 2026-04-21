-- Bayi onboarding: seçilen paket satış ödeme şekli (hesap / payment_history ile eşleşir)
ALTER TABLE "saas_admins" ADD COLUMN IF NOT EXISTS "purchase_payment_method" VARCHAR(40);
