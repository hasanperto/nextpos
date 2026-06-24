const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/CourierPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('status') && (line.includes('ready') || line.includes('shipped') || line.includes('delivering') || line.includes('completed') || line.includes('cancelled'))) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
