const fs = require('fs');

const file = 'd:/Yedeklerim/nextpos1/nextpos/apps/pos/src/i18n/posMessages.ts';
try {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('courier.') || line.includes('courier:') || line.includes('Courier') || line.includes('kurye')) {
      console.log(`${idx+1}: ${line.trim()}`);
    }
  });
} catch (e) {
  console.error(e);
}
