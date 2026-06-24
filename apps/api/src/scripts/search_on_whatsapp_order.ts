import fs from 'fs';
import path from 'path';

const file = path.resolve('../pos/src/hooks/useCashierRealtimeSync.tsx');
const text = fs.readFileSync(file, 'utf-8');

const target = 'const onWhatsAppOrder';
const idx = text.indexOf(target);
if (idx === -1) {
  console.log('Not found');
} else {
  console.log(text.slice(idx, idx + 2500));
}
