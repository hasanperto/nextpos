const fs = require('fs');
const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/pages/WaiterPanel.tsx', 'utf8');

const lines = content.split('\n');
console.log('--- Matches for product clicks/rendering in WaiterPanel.tsx ---');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('handleProductSelect') || line.includes('onProductTap') || line.includes('addProduct') || line.includes('ProductCard') || line.includes('addToCart')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
}
