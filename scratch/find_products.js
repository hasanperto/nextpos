import { withTenant } from './apps/api/src/lib/db.js';
import { prisma } from './apps/api/src/lib/prisma.js';

async function check() {
    const tenantId = 'a1111111-1111-4111-8111-111111111111';
    try {
        await withTenant(tenantId, async (connection) => {
            const [rows] = await connection.query('SELECT id, name FROM products LIMIT 5');
            console.log('PRODUCTS:', JSON.stringify(rows));
        });
    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        process.exit(0);
    }
}

check();
