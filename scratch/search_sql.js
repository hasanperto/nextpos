const fs = require('fs');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos.sql';
if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    console.log('Searching in nextpos.sql...');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('CREATE TABLE orders') || lines[i].includes('tip_') || lines[i].includes('tipOwner') || lines[i].includes('tip_owner')) {
            console.log(`Line ${i + 1}: ${lines[i].trim()}`);
        }
    }
} else {
    console.log('nextpos.sql not found!');
}
