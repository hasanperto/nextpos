const fs = require('fs');
const content = fs.readFileSync('apps/pos/src/pages/AdminMenu.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('<input')) {
        console.log(`\n--- Line ${idx + 1} ---`);
        for (let i = 0; i < 4; i++) {
            if (lines[idx + i]) {
                console.log(lines[idx + i].trim());
            }
        }
    }
});
