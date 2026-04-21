-- public.system_settings: oranlar ve gateway alanları (seed + SaaS ayarlar uyumu)
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "reseller_setup_rate" DECIMAL(5, 2) NOT NULL DEFAULT 75;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "system_setup_rate" DECIMAL(5, 2) NOT NULL DEFAULT 25;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "reseller_monthly_rate" DECIMAL(5, 2) NOT NULL DEFAULT 50;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "system_monthly_rate" DECIMAL(5, 2) NOT NULL DEFAULT 50;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "annual_discount_rate" DECIMAL(5, 2) NOT NULL DEFAULT 15;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "active_gateway" VARCHAR(50) DEFAULT 'iyzico';

