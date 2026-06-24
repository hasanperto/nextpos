const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos.sql';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log(lines.slice(324, 380).join('\n'));
