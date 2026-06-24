const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/pages/WaiterPanel.tsx', 'utf8');

const lines = content.split('\n');
console.log('--- Matches for customer selection / guest bypass in WaiterPanel.tsx ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Müşteri seçmeden') || line.includes('kayıtsız') || line.includes('unregistered') || line.includes('Gast ohne Registrierung')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
