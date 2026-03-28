USE public;
DELETE FROM subscription_plans;
INSERT INTO subscription_plans (name, code, monthly_fee, setup_fee, max_users, max_branches, max_products, features, trial_days, sort_order, is_active) 
VALUES 
('Başlangıç', 'basic', 0.00, 0.00, 2, 1, 100, '["Temel Raporlama", "2 Kullanıcı", "Tek Şube"]', 14, 1, 1),
('Pro (Popüler)', 'pro', 49.99, 499.00, 10, 3, 1000, '["Gelişmiş Raporlama", "10 Kullanıcı", "Mutfak Ekranı", "QR Menü"]', 14, 2, 1),
('Kurumsal', 'enterprise', 99.99, 999.00, 50, 10, 9999, '["Sınırsız Özellikler", "50 Kullanıcı", "10 Şube", "API Erişimi"]', 14, 3, 1);
