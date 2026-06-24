const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'pos', 'src', 'pages', 'WaiterPanel.tsx');
const content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('FiPlus') || line.includes('plus') || line.includes('product-grid') || line.includes('p-4 rounded-3xl')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
