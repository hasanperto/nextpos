const fs = require('fs');
const path = require('path');

const srcDir = 'd:/Yedeklerim/nextpos1/nextpos/apps/pos/src';

function searchDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else if (stat.isFile() && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('HAZIR PAKETLER') || content.includes('Hazır Paketler') || content.includes('activeTab') || content.includes('courier')) {
          if (content.includes('HAZIR PAKETLER') || content.includes('AKTİF YOLCULUK')) {
            console.log(`Found keywords in file: ${fullPath}`);
            // Print lines containing these keywords
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (line.includes('HAZIR PAKETLER') || line.includes('AKTİF YOLCULUK') || line.includes('activeTab')) {
                console.log(`  Line ${idx+1}: ${line.trim()}`);
              }
            });
          }
        }
      }
    }
  } catch (e) {}
}

searchDir(srcDir);
