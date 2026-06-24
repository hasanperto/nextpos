const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/pages/WaiterPanel.tsx', 'utf8');

const lines = content.split('\n');
console.log('--- Matches for kitchen send / checkout in WaiterPanel.tsx ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Mutfak') || line.includes('MUTFAK') || line.includes('Küche') || line.includes('KÜCHE') || line.includes('Send to Kitchen')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
