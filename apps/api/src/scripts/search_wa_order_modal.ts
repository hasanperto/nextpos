import fs from 'fs';
import path from 'path';

function walk(dir: string, callback: (file: string) => void) {
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, callback);
    } else {
      callback(filePath);
    }
  });
}

const posDir = path.resolve('../pos/src');
let foundPath = '';
walk(posDir, (file) => {
  if (path.basename(file) === 'WaOrderModal.tsx') {
    foundPath = file;
  }
});

if (!foundPath) {
  console.log('WaOrderModal.tsx not found');
} else {
  console.log('Found file at:', foundPath);
  const text = fs.readFileSync(foundPath, 'utf-8');
  let pos = 0;
  while (true) {
    pos = text.indexOf('button', pos);
    if (pos === -1) break;
    console.log(`--- Match at pos ${pos} ---`);
    console.log(text.slice(pos - 100, pos + 400));
    pos += 6;
  }
}
