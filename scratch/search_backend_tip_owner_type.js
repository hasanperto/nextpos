const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                searchDir(fullPath, query);
            }
        } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.sql'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes(query)) {
                console.log(`Found "${query}" in: ${fullPath}`);
            }
        }
    }
}

searchDir('d:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src', 'tip_owner_type');
searchDir('d:\\Yedeklerim\\nextpos1\\nextpos', 'tip_owner_type');
