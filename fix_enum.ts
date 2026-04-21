
import pg from 'pg';
const { Client } = pg;

async function fixEnum() {
    // DATABASE_URL is postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos
    const client = new Client({ 
        connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' 
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL (Fixer).');
        
        const tenantSchema = 'tenant_a1111111_1111_4111_8111_111111111111';

        // Add qr_portal
        try {
            await client.query(`ALTER TYPE "${tenantSchema}".order_source ADD VALUE 'qr_portal'`);
            console.log('Added qr_portal to enum.');
        } catch (e: any) {
            console.log('qr_portal exists? ', e.message);
        }

        // Add whatsapp
        try {
            await client.query(`ALTER TYPE "${tenantSchema}".order_source ADD VALUE 'whatsapp'`);
            console.log('Added whatsapp to enum.');
        } catch (e: any) {
            console.log('whatsapp exists? ', e.message);
        }

        console.log('Enum fix completed.');
    } catch (err: any) {
        console.error('CRITICAL ERROR:', err.message);
    } finally {
        await client.end();
    }
}

fixEnum();
