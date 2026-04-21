import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM icin __dirname taklidi
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env dosyasini yukle
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function patch() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting ESM-Safe Universal Order Status Patch...');
    
    // 1. Mevcut tum semalari al
    const { rows: schemas } = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%'
    `);

    for (const { schema_name: schema } of schemas) {
      console.log(`🛠️ Processing: ${schema}`);
      
      try {
        // Kontrol et
        const { rows: exists } = await client.query(`
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON e.enumtypid = t.oid 
            JOIN pg_namespace n ON t.typnamespace = n.oid 
            WHERE t.typname = 'order_status' 
            AND n.nspname = $1
            AND e.enumlabel = 'shipped'
        `, [schema]);

        if (exists.length === 0) {
            console.log(`💉 Injecting 'shipped' into ${schema}.order_status...`);
            await client.query(`ALTER TYPE ${schema}.order_status ADD VALUE 'shipped'`);
            console.log(`✅ Success for ${schema}`);
        } else {
            console.log(`ℹ️ 'shipped' already exists in ${schema}, skipping.`);
        }
      } catch (err: any) {
        console.error(`❌ Error in ${schema}:`, err.message);
      }
    }

    console.log('✨ Universal patch completed.');
  } catch (err: any) {
    console.error('💥 Critical error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

patch();
