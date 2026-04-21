import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import pool from '../src/lib/db.js';

const prisma = new PrismaClient();

async function resetTenantAdmin() {
    const tId = 'b4e9e22d-2f8c-4aa0-8e13-8af8edda85a0';
    const tenant = await prisma.tenant.findUnique({
        where: { id: tId }
    });

    if (!tenant) {
        console.log('Bu ID ile bir restoran (tenant) bulunamadı!');
        return;
    }

    console.log('Bulunan Restoran:', tenant.name, ' (Şema:', tenant.schemaName, ')');
    
    const schema = `"${tenant.schemaName.replace(/"/g, '""')}"`;
    const newPassword = 'admin123';
    const newPin = '123456';
    const hash = await bcrypt.hash(newPassword, 10);

    try {
        await pool.query(`SET search_path TO ${schema}, public`);
        
        // Önce admin var mı diye kontrol edelim
        const { rows } = await pool.query(`SELECT id, username FROM users WHERE username = 'admin'`);
        
        if (rows.length === 0) {
            console.log('Admin kullanıcısı bulunamadı, yeniden oluşturuluyor...');
            await pool.query(`
                INSERT INTO users (username, password_hash, name, role, pin_code, status) 
                VALUES ('admin', $1, 'System Admin', 'admin', $2, 'active')
            `, [hash, newPin]);
            console.log('Admin kullanıcısı oluşturuldu.');
        } else {
            console.log('Admin kullanıcısı bulundu, şifre ve PIN güncelleniyor...');
            await pool.query(`
                UPDATE users 
                SET password_hash = $1, pin_code = $2 
                WHERE username = 'admin'
            `, [hash, newPin]);
            console.log('Admin şifresi ve PIN güncellendi.');
        }
        
        console.log('----------------------------------------------------');
        console.log('✅ İşlem Başarılı!');
        console.log(`🔑 Restoran Kodu: ${tId}`);
        console.log(`👤 Kullanıcı Adı: admin`);
        console.log(`🔒 Şifre: ${newPassword}`);
        console.log(`🔢 PIN: ${newPin}`);
        console.log('----------------------------------------------------');

    } catch (e: any) {
        console.error('Veritabanı işlemi sırasında hata oluştu:', e.message);
    } finally {
        await pool.end();
    }
}

resetTenantAdmin().finally(() => prisma.$disconnect());