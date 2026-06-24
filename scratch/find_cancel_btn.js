const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/i18n/posMessages.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('cancel_btn_modal')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
