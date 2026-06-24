import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

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
const q = (sql, p = []) => pool.query(sql, p).then((r) => r.rows);

async function run() {
  try {
    const cols = await q(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'saas_admins' AND table_schema = 'public'`
    );
    console.log('Columns in saas_admins:', cols.map(c => c.column_name));

    const email = 'test@test.com';
    const admins = await q(
      `SELECT id, username, password_hash, role FROM public.saas_admins WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    console.log('Current Resellers with this email:', admins);

    if (admins.length === 0) {
      console.log('Reseller test@test.com not found, creating one...');
      const passHash = await bcrypt.hash('admin123', 10);
      await q(
        `INSERT INTO public.saas_admins (username, email, password_hash, full_name, company_name, role, wallet_balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['test', email, passHash, 'Test Reseller', 'Test Reseller Company', 'reseller', 1000.00]
      );
      console.log('Reseller test@test.com successfully created with password "admin123"!');
    } else {
      const reseller = admins[0];
      const passHash = await bcrypt.hash('admin123', 10);
      await q(
        `UPDATE public.saas_admins SET password_hash = $1, role = 'reseller' WHERE id = $2`,
        [passHash, reseller.id]
      );
      console.log('Reseller test@test.com exists. Updated password to "admin123" and role to "reseller".');
    }
  } catch (err) {
    console.error('Error during reseller check/update:', err);
  } finally {
    await pool.end();
  }
}

run();
