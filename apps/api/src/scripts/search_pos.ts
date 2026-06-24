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
walk(posDir, (file) => {
  if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
    const text = fs.readFileSync(file, 'utf-8');
    if (text.includes('whatsapp_order') || text.includes('whatsapp')) {
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('whatsapp_order') || line.includes('whatsapp')) {
          console.log(`${path.basename(file)}:${idx + 1} - ${line.trim()}`);
        }
      });
    }
  }
});
