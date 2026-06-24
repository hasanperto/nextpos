const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\features\\terminal\\components\\CartPanel.tsx';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log(lines.slice(760, 800).join('\n'));
