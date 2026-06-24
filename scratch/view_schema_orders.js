const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\prisma\\schema.prisma';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('model ') && (lines[i].includes('Order') || lines[i].includes('Payment'))) {
        console.log(`Line ${i + 1}: ${lines[i]}`);
    }
}
