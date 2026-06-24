const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\integrations.controller.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('whatsapp') && lines[i].includes('Handler')) {
        startIndex = i;
        break;
    }
}

if (startIndex === -1) {
    // try searching for integrations
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('to(') || lines[i].includes('emit(') || lines[i].includes('ORDER') || lines[i].includes('whatsapp_order')) {
            console.log(`Line ${i + 1}: ${lines[i].trim()}`);
        }
    }
}

if (startIndex !== -1) {
    console.log(`Found WhatsApp handler at line ${startIndex + 1}:`);
    console.log(lines.slice(startIndex, startIndex + 150).join('\n'));
} else {
    console.log('Not found!');
}
