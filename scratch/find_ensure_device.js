import fs from 'fs';

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src\\controllers\\auth.controller.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- Search for ensureUsersDeviceIdColumn ---');
let startLine = -1;
lines.forEach((line, idx) => {
  if (line.includes('ensureUsersDeviceIdColumn')) {
    console.log(`${idx + 1}: ${line.trim()}`);
    if (startLine === -1 && line.includes('function') || line.includes('const')) startLine = idx;
  }
});

if (startLine !== -1) {
  console.log('\n--- Printing surrounding lines of first match ---');
  for (let i = startLine - 2; i < startLine + 25; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
