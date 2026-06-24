const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/store/usePosStore.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('loadOrderToCart')) {
        console.log(`${i+1}: ${line}`);
    }
});
