const fs = require('fs');
const glob = require('glob');
glob.sync('d:\\Yedeklerim\\nextpos1\\nextpos\\apps\\pos\\src/**/*.tsx').forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('selectTable') || content.includes('Masa seçin')) {
        console.log(`FOUND in file: ${file}`);
    }
});
