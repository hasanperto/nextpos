const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/CourierPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('signature') || line.includes('Signature') || line.includes('Kaydet') || line.includes('Canvas')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
