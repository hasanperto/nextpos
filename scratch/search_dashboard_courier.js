import fs from 'fs';

const content = fs.readFileSync('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src/pages/AdminDashboard.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.toLowerCase().includes('kurye') || line.toLowerCase().includes('courier')) {
        console.log(`L${index + 1}: ${line}`);
    }
});
