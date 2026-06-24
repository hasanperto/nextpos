const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\customers.controller.ts';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log(lines.slice(120, 200).join('\n'));
