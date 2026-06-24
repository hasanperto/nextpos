import fs from 'fs';

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\pages\\WaiterPanel.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- Search for isCartOpen or setIsCartOpen ---');
lines.forEach((line, idx) => {
  if (line.includes('isCartOpen') || line.includes('setIsCartOpen') || line.includes('showCart') || line.includes('setShowCart')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
