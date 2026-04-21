-- Tenant şemaları: orders için soft-delete kolonları (muhasebe satış silme)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schema_name FROM public.tenants WHERE status IN ('active', 'suspended')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6)',
      r.schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.orders ADD COLUMN IF NOT EXISTS deleted_by INTEGER',
      r.schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.orders ADD COLUMN IF NOT EXISTS delete_reason TEXT',
      r.schema_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON %I.orders (deleted_at)',
      r.schema_name
    );
  END LOOP;
END $$;

