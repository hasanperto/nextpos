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
    console.log('📊 Fetching recent SaaS payment histories from public.payment_history...');
    const hist = await pool.query(
      `SELECT id, tenant_id, saas_admin_id, amount, currency, payment_type, payment_method, status, description, invoice_number, paid_at 
       FROM public.payment_history 
       ORDER BY id DESC LIMIT 5`
    );
    console.table(hist.rows);

    console.log('\n💼 Fetching reseller wallet balance...');
    const res = await pool.query(
      `SELECT id, username, email, role, wallet_balance, available_licenses FROM public.saas_admins WHERE role = 'reseller'`
    );
    console.table(res.rows);

  } catch (err) {
    console.error('Error during query:', err);
  } finally {
    await pool.end();
  }
}

run();
