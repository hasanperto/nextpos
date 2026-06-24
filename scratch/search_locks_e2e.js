const fs = require('fs');
const path = require('path');

function searchInDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchInDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('lock') || content.includes('business_day') || content.includes('BUSINESS_DAY_LOCKED')) {
                console.log(`Found in: ${fullPath}`);
            }
        }
    });
}

searchInDir(path.join(__dirname, '..', 'e2e'));
