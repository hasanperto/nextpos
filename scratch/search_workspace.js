const fs = require('fs');
const path = require('path');

const rootDir = 'd:/Yedeklerim/nextpos1/nextpos';
const ignoreDirs = new Set(['.git', 'node_modules', '.turbo', '.verdent', '.github', 'dist', 'build', 'tmp', 'backups', 'backups_manual']);

function search(dir) {
  try {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      const full = path.join(dir, item);
      let stat;
      try { stat = fs.statSync(full); } catch (e) { continue; }
      if (stat.isDirectory()) {
        if (!ignoreDirs.has(item)) {
          search(full);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html'].includes(ext)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            if (content.includes('HAZIR PAKETLER') || content.includes('AKTİF YOLCULUK') || content.includes('GEÇMİŞ TESLİMAT') || content.includes('HAZIR_PAKETLER')) {
              console.log(`Match: ${full}`);
              const lines = content.split('\n');
              lines.forEach((line, idx) => {
                if (line.includes('HAZIR') || line.includes('YOLCULUK') || line.includes('GEÇMİŞ')) {
                  console.log(`  Line ${idx+1}: ${line.trim()}`);
                }
              });
            }
          } catch(e) {}
        }
      }
    }
  } catch(e) {}
}

search(rootDir);
