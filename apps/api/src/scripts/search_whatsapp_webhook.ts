import fs from 'fs';
import path from 'path';

const file = path.resolve('src/controllers/integrations.controller.ts');
const text = fs.readFileSync(file, 'utf-8');

console.log('--- Printing index 25000 to 26500 ---');
console.log(text.slice(25000, 26500));

