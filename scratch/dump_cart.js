const fs = require('fs');
const content = fs.readFileSync('d:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src\\features\\terminal\\components\\CartPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('selectTable') || line.includes('empty') || line.includes('dine_in') || line.includes('takeaway')) {
        console.log(`${idx+1}: ${line.trim()}`);
    }
});
