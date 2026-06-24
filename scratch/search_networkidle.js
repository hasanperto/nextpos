const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'e2e', 'comprehensive-simulation.spec.ts');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('networkidle')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
