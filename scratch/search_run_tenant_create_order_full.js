const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'api', 'src', 'controllers', 'orders.controller.ts');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

let startIndex = -1;
lines.forEach((line, index) => {
    if (line.includes('runTenantCreateOrder') && (line.includes('export') || line.includes('function') || line.includes('const'))) {
        startIndex = index;
    }
});

if (startIndex !== -1) {
    for (let i = startIndex; i < startIndex + 150; i++) {
        if (lines[i] !== undefined) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
} else {
    console.log('Not found');
}
