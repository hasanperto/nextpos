const fs = require('fs');

const path = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\orders.controller.ts';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('export const')) {
        console.log(`${i + 1}: ${line}`);
    }
}
