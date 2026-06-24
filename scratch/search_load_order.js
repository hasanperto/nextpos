const fs = require('fs');
const path = require('path');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\store\\usePosStore.ts';
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('loadOrderToCart: async (')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    console.log(`Found loadOrderToCart starting at line ${startIndex + 1}:`);
    const slice = lines.slice(startIndex, startIndex + 150);
    console.log(slice.join('\n'));
} else {
    console.log('loadOrderToCart not found!');
}
