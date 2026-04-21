import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    const schema = 'tenant_test1'; 
    const tableName = process.argv[2] || 'daily_summaries';
    console.log(`🧐 Checking table structure of ${tableName} in ${schema}...`);
    
    try {
        const { rows: columns } = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
        `, [schema, tableName]);
        
        if (columns.length === 0) {
            console.log(`❌ Table ${tableName} does not exist!`);
        } else {
            console.log(JSON.stringify(columns, null, 2));
        }
    } catch (err: any) {
        console.error('❌ Error:', err.message);
    }
    
    await pool.end();
}

check();
