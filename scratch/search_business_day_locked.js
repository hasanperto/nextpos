const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'api', 'src', 'controllers', 'orders.controller.ts');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('BUSINESS_DAY_LOCKED')) {
        for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 25); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
        console.log('\n---分割線---\n');
    }
});
