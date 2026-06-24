const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/CourierPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('handleAction') || line.includes('action') || line.includes('TESLİM AL') || line.includes('YOLDA')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
