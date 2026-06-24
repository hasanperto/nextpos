const fs = require('fs');
const glob = require('glob');

const files = glob.sync('apps/api/src/**/*.ts');
for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('/public/') || content.includes('/qr/')) {
        if (content.includes('tables') || content.includes('table')) {
            console.log(`Found public/qr table references in: ${file}`);
        }
    }
}
