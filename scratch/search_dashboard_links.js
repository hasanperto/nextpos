const fs = require('fs');

const path = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\pages\\AdminDashboard.tsx';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('4003') || line.includes('kiosk') || line.includes('qr') || line.includes('5173') || line.includes('window.open')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
}
