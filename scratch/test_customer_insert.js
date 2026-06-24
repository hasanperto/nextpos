const pg = require('pg');
const { Client } = pg;

async function testInsert() {
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        
        await client.query('SET search_path TO tenant_demo, public');
        
        console.log('--- Attempting INSERT into customers ---');
        const query = `
            INSERT INTO customers (name, phone, email, allergies, notes, preferred_language, reward_points, loyalty_tier, status, whatsapp_subscription, email_subscription)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const params = [
            'Test Canan', 
            '+491620001122', 
            'canan@test.com', 
            null, 
            null, 
            'de',
            0,
            'bronze',
            'active',
            true,
            true
        ];
        
        await client.query(query, params);
        console.log('Insert succeeded!');

    } catch (err) {
        console.error('❌ INSERT Failed:', err.message);
        console.error(err.stack);
    } finally {
        await client.end();
    }
}

testInsert();
