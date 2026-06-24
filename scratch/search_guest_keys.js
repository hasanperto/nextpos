const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/i18n/posMessages.ts', 'utf8');

const lines = content.split('\n');
console.log('--- Matches for guest bypass keys in posMessages.ts ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Müşteri seçmeden') || line.includes('Gast ohne')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
