import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../apps/api/.env');
const env = fs.readFileSync(envPath, 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const url = m ? m[1] : process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

async function run() {
  try {
    const res = await pool.query(
      `UPDATE public.saas_admins SET wallet_balance = 10000.00 WHERE email = 'test@test.com'`
    );
    console.log('Successfully updated wallet balance of test@test.com to 10000.00. Rows updated:', res.rowCount);
  } catch (err) {
    console.error('Error updating balance:', err);
  } finally {
    await pool.end();
  }
}

run();
