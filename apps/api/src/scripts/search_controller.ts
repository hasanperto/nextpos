import fs from 'fs';
import path from 'path';

const file = path.resolve('src/controllers/qr.controller.ts');
const text = fs.readFileSync(file, 'utf-8');

const target = 'export const getExternalOrdersHandler';
const idx = text.indexOf(target);
if (idx === -1) {
  console.log('Not found');
} else {
  console.log(text.slice(idx, idx + 1500));
}
