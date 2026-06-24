const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walk('d:/Yedeklerim/nextpos1/nextpos/apps/pos/src');
files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('z-report')) {
        console.log(`Match: ${file}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('z-report')) {
                console.log(`  Line ${idx+1}: ${line.trim()}`);
            }
        });
    }
});
