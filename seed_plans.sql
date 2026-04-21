-- PostgreSQL public şeması — psql veya pgAdmin ile çalıştırın.
-- FK ile bağlı kayıtlar varsa önce tenant aboneliklerini temizleyin veya plan silmeyin.

SET search_path TO public;

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS support_hours VARCHAR(30) DEFAULT '09:00-17:00';

DELETE FROM subscription_plans;
INSERT INTO subscription_plans
  (name, code, monthly_fee, setup_fee, max_users, max_branches, max_products, max_devices, support_hours, features, trial_days, sort_order, is_active)
VALUES
  ('Başlangıç', 'basic', 29.00, 299.00, 3, 1, 200, 1, '08:00-17:00',
   '["POS Terminal","Temel Raporlama","Menü Yönetimi","1 Şube","1 Cihaz","08-17 Destek"]'::jsonb,
   14, 1, true),
  ('Pro (Popüler)', 'pro', 59.00, 499.00, 10, 3, 1000, 3, '08:00-22:00',
   '["Mutfak KDS","Garson Tablet","QR Menü","CRM & Sadakat","Stok Yönetimi","Rezervasyon","Çoklu Dil","3 Şube","3 Cihaz","08-22 Destek"]'::jsonb,
   14, 2, true),
  ('Kurumsal', 'enterprise', 99.00, 999.00, 50, 10, 9999, 10, '7/24',
   '["Tüm Pro Özellikler","Kurye & Teslimat","WhatsApp Sipariş","Online Sipariş","Web Sitesi","Gelişmiş Rapor","TSE/Fiskalizasyon","API Erişimi","7/24 Öncelikli Destek","10 Şube","10 Cihaz"]'::jsonb,
   14, 3, true);
