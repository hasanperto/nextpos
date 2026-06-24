import fs from 'fs';

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\auth.controller.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- Printing auth.controller.ts lines 320 to 380 ---');
for (let i = 320; i < 380; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
