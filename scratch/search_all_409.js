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
            if (content.includes('409') || content.includes('status(409)')) {
                console.log(`Found in: ${fullPath}`);
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.includes('409') || line.includes('Conflict')) {
                        console.log(`  ${index + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    });
}

searchInDir(path.join(__dirname, '..', 'apps', 'api', 'src'));
