const fs = require('fs');
const content = fs.readFileSync('apps/api/src/controllers/qr.controller.ts', 'utf8');

const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('external-orders') || line.includes('externalOrders')) {
        console.log(`${i+1}: ${line}`);
    }
});
