const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/hooks/useCashierRealtimeSync.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('addWhatsappOrder')) {
        console.log(`${i+1}: ${line}`);
    }
});
