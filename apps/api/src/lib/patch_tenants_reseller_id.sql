-- tenants tablosunda reseller_id yoksa bayi başına restoran sayısı 0 görünür.
-- Bir kez çalıştırın; kolon zaten varsa bu satırı atlayın.
USE `public`;

ALTER TABLE `tenants` ADD COLUMN `reseller_id` INT NULL DEFAULT NULL;
