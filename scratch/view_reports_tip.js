const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\admin.reports.controller.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('tip_owner_type')) {
        console.log(`Line ${i + 1}:`);
        console.log(lines.slice(i - 5, i + 10).join('\n'));
        console.log('-----------------------------------');
    }
}
