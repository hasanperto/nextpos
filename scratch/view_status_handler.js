const fs = require('fs');

const path = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\orders.controller.ts';
const content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

console.log(lines.slice(1204, 1400).join('\n'));
