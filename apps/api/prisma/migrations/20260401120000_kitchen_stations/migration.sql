-- Kiracı şemaları: kategori istasyonu + mutfak fişi istasyonu (hot / bar / cold)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schema_name FROM public.tenants WHERE status IN ('active', 'suspended')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.categories ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(20) NOT NULL DEFAULT ''hot''',
      r.schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.kitchen_tickets ADD COLUMN IF NOT EXISTS station VARCHAR(20) NOT NULL DEFAULT ''hot''',
      r.schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(20) NOT NULL DEFAULT ''all''',
      r.schema_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_station_status ON %I.kitchen_tickets (station, status)',
      r.schema_name
    );
  END LOOP;
END $$;
