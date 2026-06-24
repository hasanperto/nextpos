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
            if (content.includes('createOrderCore') && !fullPath.includes('search_create_order_core_definition')) {
                console.log(`Found in: ${fullPath}`);
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.includes('createOrderCore') && (line.includes('export') || line.includes('function') || line.includes('const'))) {
                        console.log(`  ${index + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    });
}

searchInDir(path.join(__dirname, '..', 'apps', 'api', 'src'));
