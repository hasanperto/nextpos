const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\features\\terminal\\components\\CartPanel.tsx';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Searching in CartPanel.tsx...');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('submit') || lines[i].includes('kitchen') || lines[i].includes('print')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
