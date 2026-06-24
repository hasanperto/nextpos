const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/LoginPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('localStorage') || line.includes('role') || line.includes('pin') || line.includes('submit') || line.includes('submitLogin')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
