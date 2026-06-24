const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'api', 'src', 'controllers', 'orders.controller.ts');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('runTenantCreateOrder') || line.includes('function runTenantCreateOrder') || line.includes('const runTenantCreateOrder')) {
        for (let i = index - 5; i < index + 100; i++) {
            if (lines[i] !== undefined) {
                console.log(`${i + 1}: ${lines[i]}`);
            }
        }
    }
});
