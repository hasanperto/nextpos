const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos?schema=public' });
pool.query(`SELECT id, customer_name, order_type, source, status, delivery_address FROM "tenant_demo".orders WHERE source = 'whatsapp' OR order_type = 'delivery' ORDER BY id DESC LIMIT 5`)
  .then(r => { 
    console.log('--- WhatsApp / Delivery Orders ---');
    console.log(JSON.stringify(r.rows, null, 2)); 
    pool.end(); 
  })
  .catch(e => { console.error(e.message); pool.end(); });
