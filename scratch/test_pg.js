const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos"
});

async function main() {
  try {
    const res = await pool.query(`
        INSERT INTO "public".payment_history
        (tenant_id, amount, currency, payment_type, payment_method, description, status, created_by)
        VALUES ('a1111111-1111-4111-8111-111111111111', 500, 'EUR', 'wallet_deposit', 'credit_card', 'Cüzdan Bakiye Yükleme', 'pending', 'system')
        RETURNING id
    `);
    console.log("Success:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}
main();
