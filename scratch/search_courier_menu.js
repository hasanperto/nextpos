const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/CourierPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('menu_history') || line.includes('menu_active') || line.includes('activeTab') || line.includes('setActiveTab')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
