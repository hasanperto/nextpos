const fs = require('fs');
const glob = require('glob');
glob.sync('d:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src/**/*.tsx').forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('py-20') && content.includes('opacity-40')) {
        console.log(`FOUND matches in file: ${file}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('py-20') && line.includes('opacity-40')) {
                console.log(`${idx+1}: ${line.trim()}`);
            }
        });
    }
});
