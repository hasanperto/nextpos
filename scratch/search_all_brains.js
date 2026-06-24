const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/Perto/.gemini/antigravity/brain';

function searchDir(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        searchDir(fullPath, depth + 1);
      } else if (stat.isFile() && file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('cashier_api_agent') || content.includes('Cashier API Agent')) {
            console.log(`Found match in: ${fullPath}`);
          }
        } catch (e) {}
      }
    }
  } catch (err) {}
}

searchDir(brainDir);
