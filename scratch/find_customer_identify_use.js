import fs from 'fs';

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\pages\\WaiterPanel.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- Search for CustomerIdentify in WaiterPanel ---');
let startLine = -1;
lines.forEach((line, idx) => {
  if (line.includes('CustomerIdentify')) {
    console.log(`${idx + 1}: ${line.trim()}`);
    if (startLine === -1 && idx > 2000) startLine = idx;
  }
});

if (startLine !== -1) {
  console.log('\n--- Printing surrounding lines of CustomerIdentify instantiation ---');
  for (let i = startLine - 10; i < startLine + 30; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
