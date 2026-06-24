import fs from 'fs';
import path from 'path';

const searchDir = 'd:/Yedeklerim/nextpos1/nextpos/apps/api/src';

function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath, callback);
        } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
            callback(fullPath);
        }
    }
}

walkDir(searchDir, (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('support_tickets') || line.includes('ticket_messages')) {
            console.log(`${path.relative(searchDir, filePath)}:L${index + 1}: ${line.trim()}`);
        }
    });
});
