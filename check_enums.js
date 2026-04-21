const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });

async function checkEnums() {
  try {
    const res = await pool.query("SELECT typname, enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname IN ('order_status', 'delivery_status', 'user_role')");
    const enums = {};
    res.rows.forEach(row => {
      if (!enums[row.typname]) enums[row.typname] = [];
      enums[row.typname].push(row.enumlabel);
    });
    console.log(JSON.stringify(enums, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkEnums();
