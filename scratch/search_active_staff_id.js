const fs = require('fs');
const path = require('path');

function searchInDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchInDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.prisma')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('active_staff_id')) {
                console.log(`Found in: ${fullPath}`);
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.includes('active_staff_id')) {
                        console.log(`  ${index + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    });
}

const apiDir = path.join(__dirname, '..', 'apps', 'api', 'src');
searchInDir(apiDir);
