const fs = require('fs');
const path = require('path');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\integrations.controller.ts';
if (!fs.existsSync(filePath)) {
    console.log('File does not exist!');
    process.exit(1);
}
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
console.log('Searching in integrations.controller.ts...');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('whatsapp') && (lines[i].includes('items') || lines[i].includes('cart') || lines[i].includes('session'))) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
