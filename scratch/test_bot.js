const axios = require('axios');
const pg = require('pg');

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public',
});

const TENANT_ID = 'a1111111-1111-4111-8111-111111111111';
const customerPhone = '491620001122';
const waWebhookUrl = `http://127.0.0.1:3101/api/v1/integrations/whatsapp?tenant=${TENANT_ID}&key=DEMO`;

const waMessages = [
    'merhaba',                                          // 1. Start greeting (returns Home menu, step: HOME)
    '1',                                                // 2. Select: Sipariş Ver (returns Service Type, step: ORDER_SERVICE)
    '2',                                                // 3. Select: Paket / Delivery (returns Name registration, step: REGISTER_NAME)
    'Canan Demir',                                      // 4. Fill Name (returns Address registration, step: ADDRESS)
    'Halaskargazi Cd. No: 120, Şişli, Istanbul',        // 5. Fill Delivery Address (returns Order Entry menu, step: ORDER_ENTRY)
    '2',                                                // 6. Select: Menü (returns Categories, step: MENU_CATEGORIES)
    '1',                                                // 7. Select: Kategori 1 (returns Products, step: MENU_PRODUCTS)
    '1',                                                // 8. Select: Ürün 1 (adds to cart, step remains MENU_PRODUCTS)
    '8',                                                // 9. Select: 8) Sipariş Ekranı (returns to ORDER_ENTRY, step: ORDER_ENTRY)
    '8',                                                // 10. Select: 8) Onayla (returns confirm screen, step: CONFIRM)
    '1'                                                 // 11. Select: 1) Onayla (Finalizes order!)
];

async function main() {
    try {
        console.log('Clearing old chatbot sessions...');
        await pool.query('DELETE FROM "tenant_demo".whatsapp_sessions');

        for (let i = 0; i < waMessages.length; i++) {
            const text = waMessages[i];
            console.log(`\n--- STEP ${i + 1}: Sending "${text}" ---`);
            
            const res = await axios.post(waWebhookUrl, {
                from: customerPhone,
                text: text
            });
            console.log(`Response Status: ${res.status}`);

            // Query current session state from PostgreSQL
            const sessionRes = await pool.query('SELECT * FROM "tenant_demo".whatsapp_sessions WHERE phone = $1', [customerPhone]);
            if (sessionRes.rows[0]) {
                const s = sessionRes.rows[0].state;
                console.log(`Current DB Session: step=${s.step} customerName=${s.customerName} serviceType=${s.serviceType}`);
                console.log(`Cart: ${JSON.stringify(s.cart)}`);
            } else {
                console.log('No DB Session found!');
            }
        }
    } catch (e) {
        console.error('Error during test:', e.response?.data || e.message);
    } finally {
        await pool.end();
    }
}

main();
