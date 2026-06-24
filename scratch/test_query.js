import { queryPublic } from '../apps/api/src/lib/db.js';

async function test() {
  try {
    const tenantId = 'a1111111-1111-4111-8111-111111111111';
    const amount = 500;
    const paymentMethod = 'credit_card';
    const description = 'Cüzdan Bakiye Yükleme';
    const username = 'system';

    console.log('Running query...');
    const [result] = await queryPublic(`
        INSERT INTO \`public\`.payment_history
        (tenant_id, amount, currency, payment_type, payment_method, description, status, created_by)
        VALUES (?, ?, 'EUR', 'wallet_deposit', ?, ?, 'pending', ?)
        RETURNING id
    `, [tenantId, amount, paymentMethod, description, username]);

    console.log('Success:', result);
  } catch (error) {
    console.error('Error executing query:', error);
  }
}

test().then(() => process.exit(0));
