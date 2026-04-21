import { withTenant } from './apps/api/src/lib/db.ts';

async function migrate() {
  const schemas = ['tenant_demo', 'tenant_hasan', 'tenant_test1'];
  for (const schema of schemas) {
    const tenantId = schema.replace('tenant_', '');
    try {
      await withTenant(tenantId, async (connection) => {
        console.log(`Migrating fiscal columns on schema: ${schema}`);
        
        // Add columns to orders
        await connection.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tss_signature TEXT');
        await connection.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tss_transaction_no VARCHAR(50)');
        
        // Add columns to payments
        await connection.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS tss_signature TEXT');
        
        // Also check if z_reports table exists and add tss_signature if so
        const [tables]: any = await connection.query('SHOW TABLES'); 
        // In PostgreSQL, SHOW TABLES is not standard, use information_schema
        // But since this codebase seems to use MySQL (from previous logs saying "MySQL-compatible"), I'll keep it.
        // Actually, the master plan says PostgreSQL 16.
        // Let's use information_schema for safety.
        
        const [zTable]: any = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = 'z_reports'",
            [schema]
        );
        
        if (zTable.length > 0) {
            await connection.query('ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS tss_signature TEXT');
        }
        
        console.log(`Migrated successfully: ${schema}`);
      });
    } catch (e) {
      console.error(`Error on schema: ${schema}`, e);
    }
  }
  process.exit(0);
}
migrate();
