const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/i18n/posMessages.ts', 'utf8');

const lines = content.split('\n');
console.log('--- Matches for notify keys ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('notify_cashier') || line.includes('notify_courier')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
