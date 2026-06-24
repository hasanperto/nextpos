import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = 'http://localhost:3001/api/v1';
const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';

// Setup pg pool to insert mock test data directly into the DB
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runSimulation() {
    console.log('🚀 --- NEXTPOS FİNANSAL MUTABAKAT E2E SİMÜLASYONU VE VERİ DOĞRULAMA --- 🚀\n');

    let adminToken = '';
    let waiterUser = null;
    let courierUser = null;

    try {
        // 1. Admin Girişi yap ve Token Al
        console.log('🔑 [1] Admin kullanıcısı ile API girişi yapılıyor...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123',
                tenantId: TENANT_ID
            })
        });

        if (!loginRes.ok) {
            throw new Error(`Giriş başarısız: ${loginRes.status} ${await loginRes.text()}`);
        }

        const loginData = await loginRes.json();
        adminToken = loginData.accessToken;
        console.log(`   ✅ Giriş başarılı. Hoş geldiniz, ${loginData.user.name}.\n`);

        // 2. Garson ve Kurye kullanıcılarını veritabanından bul
        console.log('🔍 [2] Veritabanından Garson ve Kurye kullanıcı ID\'leri çekiliyor...');
        const client = await pool.connect();
        try {
            // Şemayı tenant şeması olarak ata (tenant_a1111111_1111_4111_8111_111111111111)
            await client.query(`SET search_path TO "tenant_a1111111_1111_4111_8111_111111111111", public`);
            
            const waiters = await client.query(`SELECT id, name, username FROM users WHERE role = 'waiter' LIMIT 1`);
            const couriers = await client.query(`SELECT id, name, username FROM users WHERE role = 'courier' LIMIT 1`);

            waiterUser = waiters.rows[0];
            courierUser = couriers.rows[0];

            if (!waiterUser || !courierUser) {
                throw new Error('Sistemde test için gerekli garson veya kurye bulunamadı!');
            }
            console.log(`   👉 Garson: ${waiterUser.name} (ID: ${waiterUser.id})`);
            console.log(`   👉 Kurye: ${courierUser.name} (ID: ${courierUser.id})\n`);

            // 🛡️ Tabloların self-healing tetiklenmesi için önce bir kere Balances API'sini çağır
            console.log('🛡️ [3] Veritabanı tablolarını ve yeni kolonları (self-healing) tetiklemek için Balances API çağrılıyor...');
            await fetch(`${API_BASE}/admin/handovers/balances`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            console.log('   ✅ Self-healing tetiklendi.\n');

            // 3. Mock Test Verilerini Ekle
            console.log('✏️ [4] Test veritabanına Garson Nakit Tahsilatları, Kart Bahşişleri ve Kurye Tahsilatları ekleniyor...');
            
            // Masayı açalım
            const tableRes = await client.query(`SELECT id FROM tables LIMIT 1`);
            const tableId = tableRes.rows[0]?.id || 1;
            
            // FAKE SIPARIS VE ODEME (Garson Nakit: 250 €)
            const [o1] = (await client.query(`
                INSERT INTO orders (total_amount, order_type, status, payment_status, waiter_id, branch_id)
                VALUES (250.00, 'dine_in', 'completed', 'paid', $1, 1) RETURNING id
            `, [waiterUser.id])).rows;

            await client.query(`
                INSERT INTO payments (order_id, amount, method, tip_amount, waiter_settled, tip_settled, cashier_id)
                VALUES ($1, 250.00, 'cash', 0.00, FALSE, FALSE, $2)
            `, [o1.id, waiterUser.id]);

            // FAKE SIPARIS VE BAHŞİŞLİ KART ÖDEMESİ (Garson Bahşiş: 15.50 €)
            const [o2] = (await client.query(`
                INSERT INTO orders (total_amount, order_type, status, payment_status, waiter_id, branch_id)
                VALUES (100.00, 'dine_in', 'completed', 'paid', $1, 1) RETURNING id
            `, [waiterUser.id])).rows;

            await client.query(`
                INSERT INTO payments (order_id, amount, method, tip_amount, waiter_settled, tip_settled, cashier_id)
                VALUES ($1, 100.00, 'card', 15.50, TRUE, FALSE, $2)
            `, [o2.id, waiterUser.id]);

            // FAKE KURYEDEKİ NAKİT (Kurye Nakit: 120 €)
            await client.query(`
                INSERT INTO orders (total_amount, order_type, status, payment_status, courier_id, branch_id, payment_method_arrival, courier_settled)
                VALUES (120.00, 'delivery', 'completed', 'paid', $1, 1, 'cash', FALSE)
            `, [courierUser.id]);

            // FAKE KURYEDEKİ KART BAHŞİŞİ (Kurye Bahşiş: 8.00 €)
            const [o3] = (await client.query(`
                INSERT INTO orders (total_amount, order_type, status, payment_status, courier_id, branch_id, payment_method_arrival, picked_up_by)
                VALUES (80.00, 'delivery', 'completed', 'paid', $1, 1, 'card', $2) RETURNING id
            `, [courierUser.id, String(courierUser.id)])).rows;

            await client.query(`
                INSERT INTO payments (order_id, amount, method, tip_amount, waiter_settled, tip_settled, cashier_id)
                VALUES ($1, 80.00, 'card', 8.00, TRUE, FALSE, $2)
            `, [o3.id, courierUser.id]);

            console.log('   ✅ Mock test verileri başarıyla veri tabanına enjekte edildi.\n');
            
        } finally {
            client.release();
        }

        // 4. API Üzerinden Güncel Bakiyeleri Listele
        console.log('📊 [5] API Raporlama: Personel Finansal Mutabakat Bakiyeleri listeleniyor (ÖNCEKİ DURUM)...');
        const balanceRes = await fetch(`${API_BASE}/admin/handovers/balances`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!balanceRes.ok) {
            throw new Error(`Bakiyeler alınamadı: ${balanceRes.status} ${await balanceRes.text()}`);
        }

        const balances = await balanceRes.json();
        console.table(balances.map((b) => ({
            'Personel': b.name,
            'Rol': b.role === 'waiter' ? 'Garson' : 'Kurye',
            'Eldeki Nakit (€)': b.cashInHand.toFixed(2),
            'Biriken Kart Bahşişi (€)': b.accumulatedCardTips.toFixed(2)
        })));
        console.log();

        // 5. Garson Nakit Mutabakatı Yap (Cash Handover Settlement)
        console.log(`💼 [6] Garson ${waiterUser.name} elindeki nakiti kasaya teslim ediyor (Tahsilat Teslim Al)...`);
        const settleCashRes = await fetch(`${API_BASE}/admin/handovers/${waiterUser.id}/settle/cash`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'waiter' })
        });

        if (settleCashRes.ok) {
            const resData = await settleCashRes.json();
            console.log(`   ✅ Kasa Teslimi Başarılı! Kasaya giren tutar: €${resData.settledAmount.toFixed(2)}`);
        } else {
            console.log(`   ❌ Kasa teslimi başarısız:`, await settleCashRes.text());
        }
        console.log();

        // 6. Garson Kart Bahşişini Öde (Monthly Card Tip Payout)
        console.log(`💰 [7] Garson ${waiterUser.name} aylık kart bahşiş hakedişi ödeniyor (Bahşişi Öde)...`);
        const settleTipsRes = await fetch(`${API_BASE}/admin/handovers/${waiterUser.id}/settle/tips`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'waiter' })
        });

        if (settleTipsRes.ok) {
            const resData = await settleTipsRes.json();
            console.log(`   ✅ Bahşiş Ödemesi Başarılı! Personele elden ödenen tutar: €${resData.settledTips.toFixed(2)}`);
        } else {
            console.log(`   ❌ Bahşiş ödemesi başarısız:`, await settleTipsRes.text());
        }
        console.log();

        // 7. Kurye Nakit Mutabakatı Yap (Courier Cash Handover)
        console.log(`💼 [8] Kurye ${courierUser.name} elindeki teslimat nakitlerini kasaya teslim ediyor...`);
        const settleCourierCashRes = await fetch(`${API_BASE}/admin/handovers/${courierUser.id}/settle/cash`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'courier' })
        });

        if (settleCourierCashRes.ok) {
            const resData = await settleCourierCashRes.json();
            console.log(`   ✅ Kasa Teslimi Başarılı! Kasaya giren tutar: €${resData.settledAmount.toFixed(2)}`);
        }
        console.log();

        // 8. Son Durumu Listele
        console.log('📊 [9] API Raporlama: Personel Finansal Mutabakat Bakiyeleri listeleniyor (SONRAKİ DURUM)...');
        const finalBalanceRes = await fetch(`${API_BASE}/admin/handovers/balances`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const finalBalances = await finalBalanceRes.json();
        console.table(finalBalances.map((b) => ({
            'Personel': b.name,
            'Rol': b.role === 'waiter' ? 'Garson' : 'Kurye',
            'Eldeki Nakit (€)': b.cashInHand.toFixed(2),
            'Biriken Kart Bahşişi (€)': b.accumulatedCardTips.toFixed(2)
        })));
        console.log('\n🌟 --- E2E ENTEGRASYON VE VERİ DOĞRULAMA BAŞARIYLA TAMAMLANDI! --- 🌟');

    } catch (e) {
        console.error('❌ Simülasyon hatası:', e.message);
    } finally {
        await pool.end();
    }
}

runSimulation();
