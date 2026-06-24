const fs = require('fs');
const path = require('path');

function listRecursive(dir) {
  try {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        listRecursive(full);
      } else {
        console.log(full);
      }
    }
  } catch(e) {}
}

listRecursive('C:/Users/Perto/.gemini/antigravity/brain/c528b612-c150-4e18-bfaf-7283c951d508/.agents');
