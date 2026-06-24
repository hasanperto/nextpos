const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === '.turbo' || file === '.verdent' || file === 'dist') {
      continue;
    }
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.md') || file.endsWith('.py'))) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('Mustafa Test')) {
          console.log(`Found in: ${fullPath}`);
        }
      } catch (e) {}
    }
  }
}

searchDir('d:\\Yedeklerim\\nextpos1\\nextpos');
