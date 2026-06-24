const fs = require('fs');
const glob = require('glob');

// Use glob to find all typescript files in apps/api/src
const files = glob.sync('apps/api/src/**/*.ts');

for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('kiosk/bootstrap') || content.includes('bootstrap') && content.includes('kiosk')) {
        console.log(`Found in file: ${file}`);
    }
}
