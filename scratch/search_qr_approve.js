const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'api', 'src', 'controllers', 'orders.controller.ts');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('approve') && (line.includes('qr') || line.includes('QR') || line.includes('Qr'))) {
        for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 35); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
        console.log('\n---分割線---\n');
    }
});
