const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'e2e', 'comprehensive-simulation.spec.ts');
if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
}

let content = fs.readFileSync(file, 'utf8');
const count = (content.match(/waitForLoadState\(['"]networkidle['"]\)/g) || []).length;
console.log(`Found ${count} occurrences of networkidle.`);

content = content.replace(/waitForLoadState\(['"]networkidle['"]\)/g, "waitForLoadState('load')");

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced successfully!');
