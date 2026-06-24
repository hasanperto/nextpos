const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\customers.controller.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('createCustomerHandler = async (')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    console.log(`Found createCustomer at line ${startIndex + 1}:`);
    console.log(lines.slice(startIndex, startIndex + 50).join('\n'));
} else {
    console.log('createCustomer not found!');
}
