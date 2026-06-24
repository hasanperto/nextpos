import fs from 'fs';
import path from 'path';

const file = path.resolve('../pos/src/features/terminal/components/OnlineOrdersModal.tsx');
const text = fs.readFileSync(file, 'utf-8');

const target = 'setOrders(combined)';
const idx = text.indexOf(target);
if (idx === -1) {
  console.log('Not found');
} else {
  console.log(text.slice(idx - 1000, idx + 200));
}
