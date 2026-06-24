import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: "postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos"
  });

  try {
    await client.connect();
    
    console.log("--- Products in tenant_demo ---");
    const prodRes = await client.query(`
      SELECT id, name, is_active, category_id, base_price 
      FROM "tenant_demo".products
    `);
    console.table(prodRes.rows);
    
  } catch (err) {
    console.error("DB connection error:", err);
  } finally {
    await client.end();
  }
}

main();
