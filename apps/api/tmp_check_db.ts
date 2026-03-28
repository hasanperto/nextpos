import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
    const [rows]: any = await pool.query("SHOW COLUMNS FROM `public`.subscription_plans");
    console.log(JSON.stringify(rows, null, 2));
    await pool.end();
}
check();
