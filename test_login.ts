import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { withTenant, closePool } from './apps/api/src/lib/db.js';

dotenv.config({ path: './apps/api/.env' });

async function checkPass() {
    try {
        const tenantId = 'a1111111-1111-4111-8111-111111111111';
        console.log('Testing Demo Tenant:', tenantId);
        await withTenant(tenantId, async (conn) => {
            const [rows]: any = await conn.query(`SELECT id, username, password_hash, pin_code, role FROM users WHERE username = 'admin'`);
            if (rows.length === 0) {
                console.log('User admin not found!');
                return;
            }
            const user = rows[0];
            console.log('Admin found:', user);
            const isValid = await bcrypt.compare('admin123', user.password_hash);
            console.log('Is admin123 valid?', isValid);
            if (!isValid) {
                const newHash = await bcrypt.hash('admin123', 10);
                await conn.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, user.id]);
                console.log('Force updated admin password to admin123!');
            }
        });
    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        await closePool();
    }
}
checkPass();
