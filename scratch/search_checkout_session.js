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
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walk('d:/Yedeklerim/nextpos1/nextpos/apps/api/src');
console.log(`Searching in ${files.length} files...`);

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('checkout-session') || content.includes('checkoutSession')) {
        console.log(`MATCH in ${file}:`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('checkout-session') || line.includes('checkoutSession') || line.includes('role') || line.includes('Role')) {
                console.log(`  Line ${idx+1}: ${line.trim()}`);
            }
        });
    }
});
