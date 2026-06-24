const fs = require('fs');

const path = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\pages\\KioskCustomerMenu.tsx';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('wizTable') || line.includes('wizLicense') || line.includes('wizPairing') || line.includes('Setup') || line.includes('Wired') || line.includes('Wiz')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
}
