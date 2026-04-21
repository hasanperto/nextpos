-- Tüm aktif kiracı şemalarında products tablosuna çoklu fiyat kolonları (Admin menü uyumu)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schema_name FROM public.tenants WHERE status IN ('active', 'suspended')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS price_takeaway DECIMAL(10,2) NOT NULL DEFAULT 0',
      r.schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS price_delivery DECIMAL(10,2) NOT NULL DEFAULT 0',
      r.schema_name
    );
  END LOOP;
END $$;
