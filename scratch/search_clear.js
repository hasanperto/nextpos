const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\features\\terminal\\components\\WaOrderModal.tsx';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('SYSTEM') || lines[i].includes('REGISTRIEREN') || lines[i].includes('Confirm') || lines[i].includes('confirm')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
