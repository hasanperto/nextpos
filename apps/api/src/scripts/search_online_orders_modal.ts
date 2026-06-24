import fs from 'fs';
import path from 'path';

const file = path.resolve('../pos/src/features/terminal/components/OnlineOrdersModal.tsx');
const text = fs.readFileSync(file, 'utf-8');

const targets = ['useQuery', 'fetch', 'axios', 'const [orders', 'orders =', 'setOrders'];
targets.forEach((target) => {
  let pos = 0;
  while (true) {
    pos = text.indexOf(target, pos);
    if (pos === -1) break;
    console.log(`--- Match for "${target}" at pos ${pos} ---`);
    console.log(text.slice(pos - 100, pos + 500));
    pos += target.length;
  }
});
