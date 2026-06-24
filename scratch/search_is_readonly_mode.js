const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'pos', 'src', 'pages', 'WaiterPanel.tsx');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('isReadOnlyMode')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
