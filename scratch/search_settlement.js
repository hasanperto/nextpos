const fs = require('fs');
const path = require('path');

function searchFiles(dir, keyword) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('.next')) {
                searchFiles(fullPath, keyword);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.toLowerCase().includes(keyword.toLowerCase())) {
                console.log(`Found in: ${fullPath}`);
            }
        }
    }
}

console.log('Searching in api/src...');
searchFiles('d:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\src', 'settle');
searchFiles('d:\\Yedeklerim\nextpos1\\nextpos\\apps\\api\\src', 'courier');
