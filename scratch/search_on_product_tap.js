const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'pos', 'src', 'pages', 'WaiterPanel.tsx');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('const onProductTap') || line.includes('onProductTap =')) {
        // print 30 lines
        for (let i = index; i < index + 40; i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
});
