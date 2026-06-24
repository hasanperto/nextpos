const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/CourierPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('selectedOrder') || line.includes('setSelectedOrder') || line.includes('OrderCard') || line.includes('orders.map') || line.includes('No:')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
