const fs = require('fs');
const glob = require('glob');

const files = glob.sync('apps/pos/src/**/*.ts*');
for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('/api/v1/tables') || content.includes('fetch(\'/api/v1/') && content.includes('tables')) {
        console.log(`Found table fetch in: ${file}`);
    }
}
