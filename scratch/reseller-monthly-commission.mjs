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
  console.error('DATABASE_URL yok');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const q = (sql, p = []) => pool.query(sql, p).then((r) => r.rows);

try {
  const admins = await q(
    `SELECT id, username, full_name, company_name, email, wallet_balance
     FROM public.saas_admins
     WHERE LOWER(username) = LOWER($1)
        OR LOWER(COALESCE(email, '')) = LOWER($1)`,
    ['test@test.com']
  );
  console.log(JSON.stringify({ bayi: admins }, null, 2));
  if (!admins.length) {
    process.exit(0);
  }
  const rid = admins[0].id;

  const [rates] = await q(`SELECT reseller_setup_rate, reseller_monthly_rate, annual_discount_rate FROM public.system_settings LIMIT 1`);
  const annualDiscPct = Number(rates?.annual_discount_rate ?? 15);
  const mrate = Number(rates?.reseller_monthly_rate ?? 50) / 100;

  const tenants = await q(
    `SELECT t.id, t.name, t.status, tb.billing_cycle, tb.plan_code,
            tb.monthly_recurring_total, tb.yearly_prepay_total, tb.setup_fee_total
     FROM public.tenants t
     JOIN public.tenant_billing tb ON trim(tb.tenant_id::text) = trim(t.id::text)
     WHERE t.reseller_id = $1 AND t.status = 'active'`,
    [rid]
  );

  let subscriptionPart = 0;
  let addonPart = 0;
  const lines = [];

  for (const t of tenants) {
    const cycle = t.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const [planRow] = await q(
      `SELECT monthly_fee, setup_fee FROM public.subscription_plans WHERE LOWER(TRIM(code)) = LOWER(TRIM($1)) LIMIT 1`,
      [t.plan_code || 'basic']
    );
    const planMonthly = Number(planRow?.monthly_fee ?? 0);

    const modRows = await q(
      `SELECT module_code, COALESCE(monthly_line_total, 0) AS mm FROM public.tenant_modules WHERE trim(tenant_id::text) = trim($1::text)`,
      [t.id]
    );
    const addonMonthly = modRows.reduce((s, r) => s + Number(r.mm || 0), 0);

    let subComm = 0;
    let addComm = 0;
    if (cycle === 'yearly') {
      const yp = Number(t.yearly_prepay_total || 0);
      const planYear = planMonthly * 12 * (1 - annualDiscPct / 100);
      const addonYear = Math.max(0, yp - planYear);
      subComm = planYear * mrate;
      addComm = addonYear * mrate;
    } else {
      subComm = planMonthly * mrate;
      addComm = addonMonthly * mrate;
    }
    subscriptionPart += subComm;
    addonPart += addComm;
    lines.push({
      tenant: t.name,
      cycle,
      plan_code: t.plan_code,
      plan_monthly_eur: planMonthly,
      addon_monthly_eur: cycle === 'monthly' ? addonMonthly : null,
      yearly_prepay_eur: cycle === 'yearly' ? Number(t.yearly_prepay_total || 0) : null,
      komisyon_abonelik_eur: Math.round(subComm * 100) / 100,
      komisyon_ek_modul_eur: Math.round(addComm * 100) / 100,
    });
  }

  console.log(
    JSON.stringify(
      {
        oran_yuzde: Number(rates?.reseller_monthly_rate ?? 50),
        aktif_restoran: tenants.length,
        detay: lines,
        toplam_aylik_abonelik_komisyonu_eur: Math.round(subscriptionPart * 100) / 100,
        toplam_ek_modul_komisyonu_eur: Math.round(addonPart * 100) / 100,
        toplam_tekrarlayan_komisyon_eur: Math.round((subscriptionPart + addonPart) * 100) / 100,
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
