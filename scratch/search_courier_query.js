const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/CourierPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('/orders') || line.includes('/deliveries') || line.includes('status') && line.includes('filter')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
