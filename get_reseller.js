const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://nextpos:nextpos@127.0.0.1:5433/nextpos' });
c.connect()
  .then(() => c.query("UPDATE saas_admins SET password_hash='$2a$10$IsA6ngn5BLQz8fpkTkdR0uC9p347FvAEIUO7/q9LVV8eNUzPh9cX2' WHERE username='demo_reseller'"))
  .then(() => c.end())
  .catch(console.error);
