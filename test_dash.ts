import dotenv from 'dotenv';
import { withTenant, closePool } from './apps/api/src/lib/db.js';

dotenv.config({ path: './apps/api/.env' });

async function test() {
    const tenantId = 'a1111111-1111-4111-8111-111111111111';
    console.log('Testing tenant:', tenantId);
    try {
        await withTenant(tenantId, async (conn) => {
            console.log('1. Hourly...');
            await conn.query(`SELECT EXTRACT(HOUR FROM created_at)::int AS hour FROM orders LIMIT 1`);
            console.log('2. Pending...');
            await conn.query(`SELECT COUNT(*)::int AS cnt FROM orders WHERE payment_status = 'unpaid'`);
            console.log('3. Kitchen...');
            await conn.query(`SELECT status, COUNT(*)::int AS cnt FROM kitchen_tickets GROUP BY status`);
            console.log('4. Deliveries...');
            await conn.query(`SELECT status, COUNT(*)::int AS cnt FROM deliveries GROUP BY status`);
            console.log('5. Couriers...');
            await conn.query(`SELECT COUNT(*)::int AS cnt FROM couriers WHERE is_active = true`);
            console.log('6. Top Products...');
            await conn.query(`SELECT p.id, p.name FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id LIMIT 1`);
            console.log('7. Branches...');
            await conn.query(`SELECT id, name, is_online, last_sync FROM branches ORDER BY id ASC`);
            console.log('8. Tables...');
            await conn.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE current_session_id IS NOT NULL)::int AS occupied FROM tables`);
        });
        console.log('All queries passed.');
    } catch (e: any) {
        console.error('QUERY FAILED:', e.message);
    } finally {
        await closePool();
    }
}
test();
