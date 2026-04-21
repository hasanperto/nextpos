-- public.saas_admins: Bayi / SaaS admin profil alanları (seed + panel uyumu)
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "admin_notes" TEXT;
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "billing_address" TEXT;
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "city" VARCHAR(100);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "contact_person" VARCHAR(150);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "country" VARCHAR(60) DEFAULT 'Türkiye';
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "district" VARCHAR(100);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "mobile_phone" VARCHAR(30);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(30);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "postal_code" VARCHAR(10);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "tax_number" VARCHAR(30);
ALTER TABLE "public"."saas_admins" ADD COLUMN IF NOT EXISTS "tax_office" VARCHAR(100);

