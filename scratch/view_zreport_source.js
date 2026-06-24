const fs = require('fs');

const path = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\admin.reports.controller.ts';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

console.log('Total lines in admin.reports.controller.ts:', lines.length);

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('loadZReport') || lines[i].includes('getZReport') || lines[i].includes('ZReport')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    console.log(`Found Z-report logic starting at line ${startIndex + 1}:`);
    console.log(lines.slice(startIndex - 5, startIndex + 150).join('\n'));
} else {
    console.log('Z-report logic not found!');
}
