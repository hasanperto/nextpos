const fs = require('fs');
const path = require('path');

const filePath = 'd:\\Yedeklerim\\nextpos1\\nextpos\\apps\\api\\prisma\\schema.prisma';
if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    console.log('Searching in schema.prisma...');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('tip_') || lines[i].includes('tip') || lines[i].includes('owner_type')) {
            console.log(`Line ${i + 1}: ${lines[i].trim()}`);
        }
    }
} else {
    console.log('schema.prisma not found!');
}
