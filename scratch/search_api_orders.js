const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'api', 'src', 'controllers', 'orders.controller.ts');
if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
}

const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('table_sessions') || line.includes('insertIntoTableSession') || line.includes('createTableSession') || line.includes('table_session')) {
        for (let i = Math.max(0, index - 10); i < Math.min(lines.length, index + 30); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
        console.log('\n---分割線---\n');
    }
});
