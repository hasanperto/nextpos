const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\admin.reports.controller.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('loadZReportPayload') || lines[i].includes('loadZReport')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    console.log(`Found loadZReportPayload at line ${startIndex + 1}:`);
    console.log(lines.slice(startIndex - 5, startIndex + 100).join('\n'));
} else {
    console.log('loadZReportPayload not found!');
}
