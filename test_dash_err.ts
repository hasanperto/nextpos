import dotenv from 'dotenv';
import { prisma } from './apps/api/src/lib/prisma.js';
import { withTenant, closePool } from './apps/api/src/lib/db.js';
import { getDashboardHandler } from './apps/api/src/controllers/admin.dashboard.controller.js';

dotenv.config({ path: './apps/api/.env' });

async function testAllTenants() {
    try {
        const tenants = await prisma.tenant.findMany();
        for (const t of tenants) {
            console.log(`\nTesting tenant: ${t.name} (Schema: ${t.schemaName}, Status: ${t.status})`);
            try {
                await withTenant(t.id, async (conn) => {
                    console.log('  1. Hourly...');
                    await conn.query(`SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS order_count FROM orders WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP) GROUP BY EXTRACT(HOUR FROM created_at)`);
                    
                    console.log('  2. Pending...');
                    await conn.query(`SELECT COUNT(*)::int AS cnt FROM orders WHERE payment_status = 'unpaid'`);
                    
                    console.log('  3. Kitchen...');
                    await conn.query(`SELECT status, COUNT(*)::int AS cnt FROM kitchen_tickets GROUP BY status`);
                    
                    console.log('  4. Deliveries...');
                    await conn.query(`SELECT status, COUNT(*)::int AS cnt FROM deliveries GROUP BY status`);
                    
                    console.log('  5. Couriers...');
                    await conn.query(`SELECT COUNT(*)::int AS cnt FROM couriers WHERE is_active = true`);
                    
                    console.log('  6. Top Products...');
                    await conn.query(`SELECT p.id, p.name FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id LIMIT 1`);
                    
                    console.log('  7. Branches...');
                    await conn.query(`SELECT id, name, is_online, last_sync FROM branches ORDER BY id ASC`);
                    
                    console.log('  8. Tables...');
                    await conn.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE current_session_id IS NOT NULL)::int AS occupied FROM tables`);
                });
                console.log(`  ✅ All queries passed for ${t.name}`);
            } catch (e: any) {
                console.error(`  ❌ QUERY FAILED for ${t.name}:`, e.message);
            }
        }
    } catch (e: any) {
        console.error('Core error:', e.message);
    } finally {
        await closePool();
        await prisma.$disconnect();
    }
}
testAllTenants();
