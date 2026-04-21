import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src/lib/billing_schema.sql');
const destDir = path.join(root, 'dist/lib');
const dest = path.join(destDir, 'billing_schema.sql');

if (!fs.existsSync(src)) {
    console.warn('copy-billing-sql: kaynak yok', src);
    process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('copy-billing-sql:', dest);
